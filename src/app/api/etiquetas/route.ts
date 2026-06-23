import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import { Prisma as PrismaLib } from '@/generated/prisma/client'
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
    const nomeNormalizado = nome.toLowerCase()

    // Unificação dentro do perfil do utilizador (case-insensitive via
    // nomeNormalizado): se já existe, devolve a existente em vez de duplicar.
    const existing = await prisma.etiqueta.findUnique({
      where: { criadoPorId_nomeNormalizado: { criadoPorId: session.user.id, nomeNormalizado } },
      select: { id: true, nome: true },
    })
    if (existing) return Response.json(existing, { status: 200 })

    let created: { id: string; nome: string }
    try {
      created = await prisma.etiqueta.create({
        data: { nome, nomeNormalizado, criadoPorId: session.user.id },
        select: { id: true, nome: true },
      })
    } catch (e) {
      // Corrida: outra criação concorrente ganhou entre o findUnique e o
      // create. O índice único impede o duplicado — devolvemos a existente.
      if (e instanceof PrismaLib.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await prisma.etiqueta.findUnique({
          where: { criadoPorId_nomeNormalizado: { criadoPorId: session.user.id, nomeNormalizado } },
          select: { id: true, nome: true },
        })
        if (raced) return Response.json(raced, { status: 200 })
      }
      throw e
    }

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
