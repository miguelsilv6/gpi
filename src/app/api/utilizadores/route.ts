import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { getRequestInfo } from '@/lib/request-info'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Password mínimo 8 caracteres'),
  role: z.enum(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO']),
  brigadaId: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'utilizador:manage')) return apiError('Sem permissão', 403)

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') ?? undefined
    const roleFilter = searchParams.get('role') ?? undefined
    const ativo = searchParams.get('ativo')

    const utilizadores = await prisma.utilizador.findMany({
      where: {
        ...(search && {
          OR: [
            { nome: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(roleFilter && { role: roleFilter as Role }),
        ...(ativo !== null && ativo !== undefined && { ativo: ativo === 'true' }),
      },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        brigadaId: true,
        brigada: { select: { id: true, nome: true } },
        chefeSupremo: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    return Response.json(utilizadores)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'utilizador:manage')) return apiError('Sem permissão para criar utilizadores', 403)

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { nome, password, role: newRole, brigadaId } = parsed.data
    const email = parsed.data.email.toLowerCase().trim()

    const exists = await prisma.utilizador.findUnique({ where: { email } })
    if (exists) return apiError('Já existe um utilizador com este email', 409)

    if (brigadaId) {
      const brigada = await prisma.brigada.findUnique({ where: { id: brigadaId } })
      if (!brigada) return apiError('Brigada não encontrada', 404)
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const utilizador = await prisma.utilizador.create({
      data: { nome, email, passwordHash, role: newRole, brigadaId: brigadaId ?? null },
      select: {
        id: true, nome: true, email: true, role: true, ativo: true, brigadaId: true,
      },
    })

    const { ip, userAgent } = getRequestInfo(req)
    await prisma.auditLog.create({
      data: {
        acao: 'CREATE_UTILIZADOR',
        entidade: 'Utilizador',
        entidadeId: utilizador.id,
        utilizadorId: session.user.id,
        ip,
        userAgent,
        detalhes: { nome, email, role: newRole, brigadaId: brigadaId ?? null },
      },
    })

    return Response.json(utilizador, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
