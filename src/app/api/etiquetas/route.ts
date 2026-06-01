import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const createSchema = z.object({
  nome: z.string().min(1).max(120),
})

/**
 * Lista etiquetas. Com ?all=1 e permissão etiqueta:manage, devolve todas as
 * etiquetas do sistema com criador e contagem de uso (para a tab de admin).
 * Sem o parâmetro, devolve apenas as do utilizador autenticado (typeahead).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const all = req.nextUrl.searchParams.get('all') === '1'

    if (all) {
      const role = session.user.role as Role
      if (!hasPermission(role, 'etiqueta:manage')) return apiError('Sem permissão', 403)
      const etiquetas = await prisma.etiqueta.findMany({
        orderBy: [{ criadoPor: { nome: 'asc' } }, { nome: 'asc' }],
        select: {
          id: true,
          nome: true,
          createdAt: true,
          criadoPor: { select: { id: true, nome: true } },
          _count: { select: { inqueritos: true } },
        },
      })
      return Response.json(etiquetas)
    }

    const etiquetas = await prisma.etiqueta.findMany({
      where: { criadoPorId: session.user.id },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    })
    return Response.json(etiquetas)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * Cria uma etiqueta pessoal. Unificação: se o utilizador já tiver uma etiqueta
 * com o mesmo nome (case-insensitive), devolve a existente em vez de duplicar.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const nome = parsed.data.nome.trim()
    if (!nome) return apiError('Nome é obrigatório', 400)

    // Unificação dentro do perfil do utilizador (case-insensitive).
    const existing = await prisma.etiqueta.findFirst({
      where: {
        criadoPorId: session.user.id,
        nome: { equals: nome, mode: 'insensitive' },
      },
      select: { id: true, nome: true },
    })
    if (existing) return Response.json(existing, { status: 200 })

    const created = await prisma.etiqueta.create({
      data: { nome, criadoPorId: session.user.id },
      select: { id: true, nome: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_ETIQUETA',
      entidade: 'Etiqueta',
      entidadeId: created.id,
      utilizadorId: session.user.id,
      detalhes: { nome: created.nome },
    })

    revalidatePath('/inqueritos')

    return Response.json(created, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
