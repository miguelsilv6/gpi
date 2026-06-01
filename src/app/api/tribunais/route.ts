import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const createSchema = z.object({
  nome: z.string().min(1).max(200),
  comarcaId: z.string().optional().nullable(),
  morada: z.string().max(500).optional().nullable(),
  telefone: z.string().max(50).optional().nullable(),
  email: z.string().email('Email inválido').max(200).optional().nullable().or(z.literal('')),
  descricao: z.string().max(500).optional().nullable(),
  ordem: z.number().int().min(0).max(9999).default(0),
  ativo: z.boolean().default(true),
})

export async function GET() {
  try {
    await getSession()
    const tribunais = await prisma.tribunal.findMany({
      orderBy: [{ comarca: { nome: 'asc' } }, { nome: 'asc' }],
      include: { comarca: { select: { id: true, nome: true } } },
    })
    return Response.json(tribunais)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'tribunal:manage')) {
      return apiError('Sem permissão para gerir tribunais', 403)
    }

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data
    const nome = data.nome.trim()

    const existing = await prisma.tribunal.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' } },
    })
    if (existing) return apiError('Já existe um tribunal com este nome', 409)

    if (data.comarcaId) {
      const comarca = await prisma.comarca.findUnique({ where: { id: data.comarcaId } })
      if (!comarca) return apiError('Comarca não encontrada', 400)
    }

    const created = await prisma.tribunal.create({
      data: {
        nome,
        comarcaId: data.comarcaId || null,
        morada: data.morada?.trim() || null,
        telefone: data.telefone?.trim() || null,
        email: data.email?.trim() || null,
        descricao: data.descricao?.trim() || null,
        ordem: data.ordem,
        ativo: data.ativo,
      },
      include: { comarca: { select: { id: true, nome: true } } },
    })

    await writeAudit({
      req,
      acao: 'CREATE_TRIBUNAL',
      entidade: 'Tribunal',
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
