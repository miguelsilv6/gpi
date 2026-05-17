import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { z } from 'zod'
import { hash, compare } from 'bcryptjs'

const updateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100).optional(),
  email: z.string().email('Email inválido').optional(),
})

const passwordSchema = z.object({
  passwordAtual: z.string().min(1, 'Password atual obrigatória'),
  passwordNova: z.string().min(8, 'Mínimo 8 caracteres'),
})

export async function GET() {
  try {
    const session = await getSession()
    const user = await prisma.utilizador.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        brigada: { select: { id: true, nome: true } },
        lastLoginAt: true,
      },
    })
    if (!user) return apiError('Utilizador não encontrado', 404)
    return Response.json(user)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const existing = await prisma.utilizador.findUnique({
      where: { id: session.user.id },
      select: { nome: true, email: true },
    })
    if (!existing) return apiError('Utilizador não encontrado', 404)

    // Normalize email
    const normalizedEmail = parsed.data.email?.toLowerCase().trim()

    if (normalizedEmail && normalizedEmail !== existing.email) {
      const exists = await prisma.utilizador.findFirst({
        where: { email: normalizedEmail, id: { not: session.user.id } },
      })
      if (exists) return apiError('Email já em uso', 409)
    }

    const updated = await prisma.utilizador.update({
      where: { id: session.user.id },
      data: {
        ...(parsed.data.nome !== undefined && { nome: parsed.data.nome }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
      },
      select: { id: true, nome: true, email: true, role: true },
    })

    const changes = diff(existing, updated, ['nome', 'email'])
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_PERFIL',
        entidade: 'Utilizador',
        entidadeId: session.user.id,
        utilizadorId: session.user.id,
        detalhes: changes as never,
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json()
    const parsed = passwordSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const user = await prisma.utilizador.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    })
    if (!user) return apiError('Utilizador não encontrado', 404)

    const valid = await compare(parsed.data.passwordAtual, user.passwordHash)
    if (!valid) return apiError('Password atual incorreta', 400)

    const newHash = await hash(parsed.data.passwordNova, 12)
    // Bump tokenVersion so other open sessions get invalidated on next request.
    await prisma.utilizador.update({
      where: { id: session.user.id },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    })

    await writeAudit({
      req,
      acao: 'CHANGE_PASSWORD',
      entidade: 'Utilizador',
      entidadeId: session.user.id,
      utilizadorId: session.user.id,
      detalhes: { selfService: true },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
