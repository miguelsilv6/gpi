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
})

export async function GET() {
  try {
    await getSession()
    const locais = await prisma.localTratamento.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    return Response.json(locais)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'local-tratamento:manage')) {
      return apiError('Sem permissão para gerir locais de tratamento', 403)
    }

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data
    const nome = data.nome.trim()

    const existing = await prisma.localTratamento.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' } },
    })
    if (existing) return apiError('Já existe um local de tratamento com este nome', 409)

    const created = await prisma.localTratamento.create({
      data: {
        nome,
        descricao: data.descricao?.trim() || null,
        ordem: data.ordem,
        ativo: data.ativo,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_LOCAL_TRATAMENTO',
      entidade: 'LocalTratamento',
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
