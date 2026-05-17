import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { ESTADO_COR_OPTIONS } from '@/lib/constants'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const CODIGO_REGEX = /^[A-Z][A-Z0-9_]*$/

const createSchema = z.object({
  codigo: z
    .string()
    .min(2)
    .max(40)
    .regex(CODIGO_REGEX, 'Código deve ser MAIÚSCULAS, números e _ (sem espaços)'),
  nome: z.string().min(1).max(60),
  descricao: z.string().max(300).optional().nullable(),
  ordem: z.number().int().min(0).max(999).default(0),
  terminal: z.boolean().default(false),
  cor: z.enum(ESTADO_COR_OPTIONS as [string, ...string[]]).optional().nullable(),
  ativo: z.boolean().default(true),
})

export async function GET() {
  try {
    await getSession()
    const estados = await prisma.estadoInquerito.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    return Response.json(estados)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:estados:manage')) {
      return apiError('Sem permissão para gerir estados', 403)
    }

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data

    const exists = await prisma.estadoInquerito.findUnique({ where: { codigo: data.codigo } })
    if (exists) return apiError('Já existe um estado com este código', 409)

    const created = await prisma.estadoInquerito.create({
      data: {
        codigo: data.codigo,
        nome: data.nome,
        descricao: data.descricao ?? null,
        ordem: data.ordem,
        terminal: data.terminal,
        cor: data.cor ?? null,
        ativo: data.ativo,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_ESTADO_INQUERITO',
      entidade: 'EstadoInquerito',
      entidadeId: created.id,
      utilizadorId: session.user.id,
      detalhes: data as never,
    })

    revalidatePath('/inqueritos')
    revalidatePath('/configuracoes')

    return Response.json(created, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
