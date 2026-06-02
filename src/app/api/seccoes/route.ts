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
  descricao: z.string().max(500).optional().nullable(),
  ordem: z.number().int().min(0).max(9999).default(0),
  ativo: z.boolean().default(true),
  tribunalId: z.string().optional().nullable(),
})

export async function GET() {
  try {
    await getSession()
    const seccoes = await prisma.seccao.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    return Response.json(seccoes)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'seccao:manage')) {
      return apiError('Sem permissão para gerir secções', 403)
    }

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data
    const nome = data.nome.trim()

    const existing = await prisma.seccao.findFirst({
      where: {
        nome: { equals: nome, mode: 'insensitive' },
        tribunalId: data.tribunalId ?? null,
      },
    })
    if (existing) return apiError('Já existe uma secção com este nome neste tribunal', 409)

    const created = await prisma.seccao.create({
      data: {
        nome,
        descricao: data.descricao?.trim() || null,
        ordem: data.ordem,
        ativo: data.ativo,
        tribunalId: data.tribunalId ?? null,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_SECCAO',
      entidade: 'Seccao',
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
