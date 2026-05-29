import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { ESTADO_COR_OPTIONS } from '@/lib/constants'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const createSchema = z.object({
  nome: z.string().min(1).max(120),
  descricao: z.string().max(500).optional().nullable(),
  cor: z.enum(ESTADO_COR_OPTIONS as [string, ...string[]]).optional().nullable(),
  ordem: z.number().int().min(0).max(9999).default(0),
  ativo: z.boolean().default(true),
})

export async function GET() {
  try {
    await getSession()
    const etiquetas = await prisma.etiqueta.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    return Response.json(etiquetas)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'etiqueta:manage')) {
      return apiError('Sem permissão para gerir etiquetas', 403)
    }

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data
    const nome = data.nome.trim()
    if (!nome) return apiError('Nome é obrigatório', 400)

    const existing = await prisma.etiqueta.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' } },
    })
    if (existing) return apiError('Já existe uma etiqueta com este nome', 409)

    const created = await prisma.etiqueta.create({
      data: {
        nome,
        descricao: data.descricao?.trim() || null,
        cor: data.cor ?? null,
        ordem: data.ordem,
        ativo: data.ativo,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_ETIQUETA',
      entidade: 'Etiqueta',
      entidadeId: created.id,
      utilizadorId: session.user.id,
      detalhes: { nome: created.nome },
    })

    revalidatePath('/configuracoes')
    revalidatePath('/inqueritos')

    return Response.json(created, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
