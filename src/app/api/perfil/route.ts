import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { isModuloAjudasAtivo } from '@/lib/ajudas-module'
import { z } from 'zod'
import { isInqueritoPageSize } from '@/lib/pagination'
import { hash, compare } from 'bcryptjs'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100).optional(),
  email: z.string().email('Email inválido').optional(),
  ajudasVencimentoBase: z.number().positive().nullable().optional(),
  ajudasTaxaIRS: z.number().min(0).max(1).nullable().optional(),
  inqueritoFiltroEstadosDefault: z.array(z.string()).max(50).optional(),
  inqueritoPageSizeDefault: z
    .number()
    .int()
    .refine(isInqueritoPageSize, 'Tamanho de página inválido')
    .nullable()
    .optional(),
})

const passwordSchema = z.object({
  passwordAtual: z.string().min(1, 'Password atual obrigatória'),
  passwordNova: z.string().min(8, 'Mínimo 8 caracteres'),
})

export async function GET() {
  try {
    const session = await getSession()
    const [user, estadosDisponiveis] = await Promise.all([
      prisma.utilizador.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          ativo: true,
          brigada: { select: { id: true, nome: true } },
          lastLoginAt: true,
          ajudasVencimentoBase: true,
          ajudasTaxaIRS: true,
          inqueritoFiltroEstadosDefault: true,
          inqueritoPageSizeDefault: true,
        },
      }),
      prisma.estadoInquerito.findMany({
        where: { ativo: true },
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
        select: { codigo: true, nome: true, cor: true },
      }),
    ])
    if (!user) return apiError('Utilizador não encontrado', 404)
    const moduloAjudasAtivo = await isModuloAjudasAtivo(user.role as Role)
    return Response.json({ ...user, moduloAjudasAtivo, estadosDisponiveis })
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
      select: { nome: true, email: true, ajudasVencimentoBase: true, ajudasTaxaIRS: true, inqueritoFiltroEstadosDefault: true, inqueritoPageSizeDefault: true },
    })
    if (!existing) return apiError('Utilizador não encontrado', 404)

    // Normalize email
    const normalizedEmail = parsed.data.email?.toLowerCase().trim()

    if (
      normalizedEmail !== undefined &&
      normalizedEmail !== existing.email &&
      (session.user.role as Role) !== 'ADMINISTRACAO'
    ) {
      return apiError('Apenas o administrador pode alterar o email', 403)
    }

    if (
      ('ajudasVencimentoBase' in parsed.data || 'ajudasTaxaIRS' in parsed.data) &&
      !(await isModuloAjudasAtivo(session.user.role as Role))
    ) {
      return apiError('Módulo Ajudas Mensais está desativado', 503)
    }

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
        ...('ajudasVencimentoBase' in parsed.data && { ajudasVencimentoBase: parsed.data.ajudasVencimentoBase }),
        ...('ajudasTaxaIRS' in parsed.data && { ajudasTaxaIRS: parsed.data.ajudasTaxaIRS }),
        ...(parsed.data.inqueritoFiltroEstadosDefault !== undefined && {
          inqueritoFiltroEstadosDefault: parsed.data.inqueritoFiltroEstadosDefault,
        }),
        ...('inqueritoPageSizeDefault' in parsed.data && {
          inqueritoPageSizeDefault: parsed.data.inqueritoPageSizeDefault,
        }),
      },
      select: { id: true, nome: true, email: true, role: true, ajudasVencimentoBase: true, ajudasTaxaIRS: true, inqueritoFiltroEstadosDefault: true, inqueritoPageSizeDefault: true },
    })

    const scalarKeys = ['nome', 'email', 'ajudasVencimentoBase', 'ajudasTaxaIRS', 'inqueritoPageSizeDefault'] as const
    const changes = diff(
      { nome: existing.nome, email: existing.email, ajudasVencimentoBase: existing.ajudasVencimentoBase, ajudasTaxaIRS: existing.ajudasTaxaIRS, inqueritoPageSizeDefault: existing.inqueritoPageSizeDefault },
      { nome: updated.nome, email: updated.email, ajudasVencimentoBase: updated.ajudasVencimentoBase, ajudasTaxaIRS: updated.ajudasTaxaIRS, inqueritoPageSizeDefault: updated.inqueritoPageSizeDefault },
      scalarKeys,
    )

    // Array fields não cabem no helper `diff` (só primitivos) — detetamos a
    // alteração comparando o conteúdo ordenado.
    const beforeFiltros = [...existing.inqueritoFiltroEstadosDefault].sort()
    const afterFiltros = [...updated.inqueritoFiltroEstadosDefault].sort()
    const filtrosChanged = JSON.stringify(beforeFiltros) !== JSON.stringify(afterFiltros)

    if (changes || filtrosChanged) {
      const detalhes = {
        changed: [
          ...(changes?.changed ?? []),
          ...(filtrosChanged ? ['inqueritoFiltroEstadosDefault'] : []),
        ],
        before: {
          ...(changes?.before ?? {}),
          ...(filtrosChanged && { inqueritoFiltroEstadosDefault: existing.inqueritoFiltroEstadosDefault }),
        },
        after: {
          ...(changes?.after ?? {}),
          ...(filtrosChanged && { inqueritoFiltroEstadosDefault: updated.inqueritoFiltroEstadosDefault }),
        },
      }
      await writeAudit({
        req,
        acao: 'UPDATE_PERFIL',
        entidade: 'Utilizador',
        entidadeId: session.user.id,
        utilizadorId: session.user.id,
        detalhes: detalhes as never,
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
