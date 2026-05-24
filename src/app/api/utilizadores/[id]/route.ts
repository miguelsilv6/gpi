import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { getRequestInfo } from '@/lib/request-info'
import { Prisma as PrismaLib } from '@/generated/prisma/client'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  nome: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO']).optional(),
  brigadaId: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
  lt: z.number().int().positive('LT deve ser um número positivo').max(2_147_483_647).optional().nullable(),
  telemovel: z.string().trim().max(40).optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'utilizador:manage')) return apiError('Sem permissão', 403)

    const { id } = await params
    const utilizador = await prisma.utilizador.findUnique({
      where: { id },
      select: {
        id: true, nome: true, email: true, role: true, ativo: true,
        brigadaId: true, brigada: { select: { id: true, nome: true } },
        chefeSupremo: true, lastLoginAt: true, lastLoginIp: true,
        createdAt: true,
        lt: true, telemovel: true,
      },
    })
    if (!utilizador) return apiError('Utilizador não encontrado', 404)
    return Response.json(utilizador)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'utilizador:manage')) return apiError('Sem permissão', 403)

    const { id } = await params
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const utilizador = await prisma.utilizador.findUnique({ where: { id } })
    if (!utilizador) return apiError('Utilizador não encontrado', 404)

    const isSelf = id === session.user.id

    // chefe supremo cannot be modified through this endpoint
    if (utilizador.chefeSupremo) {
      const touchesPrivileged =
        parsed.data.role !== undefined ||
        parsed.data.ativo !== undefined ||
        parsed.data.password !== undefined
      if (touchesPrivileged) {
        return apiError('A conta de chefe supremo não pode ser modificada por esta via', 403)
      }
    }

    // Self cannot change own role or own active state (no self-promotion / self-lockout)
    if (isSelf && (parsed.data.role !== undefined || parsed.data.ativo !== undefined)) {
      return apiError('Não pode alterar o seu próprio papel ou estado', 403)
    }

    // Protect last active ADMINISTRACAO: cannot demote or deactivate
    if (utilizador.role === 'ADMINISTRACAO') {
      const demoting = parsed.data.role !== undefined && parsed.data.role !== 'ADMINISTRACAO'
      const deactivating = parsed.data.ativo === false
      if (demoting || deactivating) {
        const otherActiveAdmins = await prisma.utilizador.count({
          where: {
            role: 'ADMINISTRACAO',
            ativo: true,
            NOT: { id: utilizador.id },
          },
        })
        if (otherActiveAdmins === 0) {
          return apiError('Não é possível remover o último administrador activo', 409)
        }
      }
    }

    // Normalize email
    const normalizedEmail = parsed.data.email?.toLowerCase().trim()

    if (normalizedEmail && normalizedEmail !== utilizador.email) {
      const exists = await prisma.utilizador.findUnique({ where: { email: normalizedEmail } })
      if (exists) return apiError('Já existe um utilizador com este email', 409)
    }

    // LT uniqueness check — only when the caller is actually changing it.
    if (
      parsed.data.lt !== undefined &&
      parsed.data.lt !== null &&
      parsed.data.lt !== utilizador.lt
    ) {
      const ltExists = await prisma.utilizador.findUnique({ where: { lt: parsed.data.lt } })
      if (ltExists && ltExists.id !== utilizador.id) {
        return apiError(`Já existe um utilizador com o LT ${parsed.data.lt}`, 409)
      }
    }

    if (parsed.data.brigadaId) {
      const brigada = await prisma.brigada.findUnique({ where: { id: parsed.data.brigadaId } })
      if (!brigada) return apiError('Brigada não encontrada', 404)
    }

    const { password, email: _email, telemovel, ...rest } = parsed.data
    const data: Record<string, unknown> = { ...rest }
    if (normalizedEmail) data.email = normalizedEmail
    if (telemovel !== undefined) {
      data.telemovel = telemovel?.trim() || null
    }
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 12)
    }
    // Invalidate active sessions on password / role / deactivation changes
    const sensitiveChange =
      password !== undefined ||
      parsed.data.role !== undefined ||
      parsed.data.ativo !== undefined
    if (sensitiveChange) {
      data.tokenVersion = { increment: 1 }
    }

    const updated = await prisma.utilizador.update({
      where: { id },
      data,
      select: {
        id: true, nome: true, email: true, role: true, ativo: true, brigadaId: true,
        lt: true, telemovel: true,
      },
    })

    if (sensitiveChange) {
      const { ip, userAgent } = getRequestInfo(req)
      await prisma.auditLog.create({
        data: {
          acao: 'UPDATE_UTILIZADOR',
          entidade: 'Utilizador',
          entidadeId: id,
          utilizadorId: session.user.id,
          ip,
          userAgent,
          detalhes: {
            ...(parsed.data.role !== undefined && { roleAnterior: utilizador.role, roleNovo: parsed.data.role }),
            ...(parsed.data.ativo !== undefined && { ativoAnterior: utilizador.ativo, ativoNovo: parsed.data.ativo }),
            ...(password !== undefined && { passwordChanged: true }),
          },
        },
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'utilizador:manage')) return apiError('Sem permissão', 403)

    const { id } = await params

    if (id === session.user.id) {
      return apiError('Não pode desativar a sua própria conta', 400)
    }

    const utilizador = await prisma.utilizador.findUnique({ where: { id } })
    if (!utilizador) return apiError('Utilizador não encontrado', 404)

    if (utilizador.chefeSupremo) {
      return apiError('A conta de chefe supremo não pode ser desativada', 403)
    }

    if (utilizador.role === 'ADMINISTRACAO' && utilizador.ativo) {
      const otherActiveAdmins = await prisma.utilizador.count({
        where: {
          role: 'ADMINISTRACAO',
          ativo: true,
          NOT: { id: utilizador.id },
        },
      })
      if (otherActiveAdmins === 0) {
        return apiError('Não é possível desativar o último administrador activo', 409)
      }
    }

    const { ip, userAgent } = getRequestInfo(req)

    // Decide entre eliminação real e desativação (soft delete).
    //
    // Um utilizador SÓ pode ser eliminado por completo se não tiver
    // histórico operacional associado: atividades registadas, inquéritos
    // atribuídos, ou atualizações de sistema iniciadas. Estas relações são
    // FK Restrict/SetNull e representam dados que devem ser preservados (ou
    // cuja perda silenciosa seria perigosa). Caso contrário, desativamos —
    // a conta deixa de poder entrar mas o histórico fica intacto para fins
    // legais. Os audit logs guardam o utilizadorId como snapshot (sem FK),
    // por isso não impedem a eliminação.
    //
    // Caso típico do utilizador de testes nunca usado: zero referências →
    // eliminação real, desaparece da lista.
    const [atividadesCount, inqueritosCount, updatesCount] = await Promise.all([
      prisma.atividade.count({ where: { utilizadorId: id } }),
      prisma.inquerito.count({ where: { inspetorId: id } }),
      prisma.atualizacaoSistema.count({ where: { iniciadoPorId: id } }),
    ])
    const hasHistory = atividadesCount > 0 || inqueritosCount > 0 || updatesCount > 0

    if (!hasHistory) {
      // Hard delete. Cascades tratam de notificações/sessões/tokens.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.auditLog.create({
            data: {
              acao: 'DELETE_UTILIZADOR',
              entidade: 'Utilizador',
              entidadeId: id,
              utilizadorId: session.user.id,
              ip,
              userAgent,
              detalhes: { nome: utilizador.nome, email: utilizador.email, hard: true },
            },
          })
          await tx.utilizador.delete({ where: { id } })
        })
        return Response.json({ deleted: true, deactivated: false })
      } catch (err) {
        // Backstop: se uma FK Restrict que não previmos disparar (P2003),
        // caímos para soft delete em vez de devolver 500.
        const isFk =
          err instanceof PrismaLib.PrismaClientKnownRequestError && err.code === 'P2003'
        if (!isFk) throw err
      }
    }

    // Soft delete + invalidate sessions
    await prisma.utilizador.update({
      where: { id },
      data: { ativo: false, tokenVersion: { increment: 1 } },
    })

    await prisma.auditLog.create({
      data: {
        acao: 'DEACTIVATE_UTILIZADOR',
        entidade: 'Utilizador',
        entidadeId: id,
        utilizadorId: session.user.id,
        ip,
        userAgent,
        detalhes: { nome: utilizador.nome, email: utilizador.email },
      },
    })

    return Response.json({ deleted: false, deactivated: true })
  } catch (error) {
    return handleApiError(error)
  }
}
