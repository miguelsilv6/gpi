import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isModuloBugReportsAtivo } from '@/lib/bugreports-module'
import { writeAudit } from '@/lib/audit'
import { notifyBugReportCriado } from '@/lib/notifications'
import { SEVERIDADE_LABELS, SEVERIDADE_VALUES, ESTADO_VALUES } from '@/lib/bugreport-labels'
import { z } from 'zod'
import type { Role, EstadoBug } from '@/generated/prisma/enums'

const PAGE_SIZE = 30

const createSchema = z.object({
  titulo: z.string().min(3, 'Título demasiado curto').max(150),
  descricao: z.string().min(10, 'Descreva o problema com mais detalhe').max(5000),
  severidade: z.enum(SEVERIDADE_VALUES as [string, ...string[]]).optional(),
  pagina: z.string().max(300).optional().nullable(),
})

/**
 * GET — listagem de bug reports.
 *   - Admin (bugreport:manage), sem `?mine=1`: TODOS os reports, com filtro
 *     opcional por estado e paginação por cursor.
 *   - Qualquer outro caso: apenas os reports do próprio utilizador.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { searchParams } = new URL(req.url)
    const mine = searchParams.get('mine') === '1'
    const isManager = hasPermission(role, 'bugreport:manage')

    if (isManager && !mine) {
      const cursor = searchParams.get('cursor') ?? undefined
      const estadoParam = searchParams.get('estado') ?? undefined
      const estado =
        estadoParam && ESTADO_VALUES.includes(estadoParam as EstadoBug)
          ? (estadoParam as EstadoBug)
          : undefined

      const rows = await prisma.bugReport.findMany({
        where: { ...(estado && { estado }) },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        include: { criadoPor: { select: { id: true, nome: true, email: true } } },
      })

      const hasMore = rows.length > PAGE_SIZE
      const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
      const nextCursor = hasMore ? items[items.length - 1].id : null

      return Response.json({ items, nextCursor })
    }

    // Reports do próprio utilizador (mais recentes primeiro).
    const items = await prisma.bugReport.findMany({
      where: { criadoPorId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return Response.json({ items, nextCursor: null })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST — submeter um novo bug report. Requer `bugreport:create` E o módulo
 * ativo para o role do utilizador (ADMINISTRACAO passa sempre).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'bugreport:create')) {
      return apiError('Sem permissão para reportar bugs', 403)
    }
    if (!(await isModuloBugReportsAtivo(role))) {
      return apiError('O módulo de reporte de bugs está desativado', 503)
    }

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { titulo, descricao, severidade, pagina } = parsed.data

    const report = await prisma.bugReport.create({
      data: {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        severidade: (severidade as never) ?? 'MEDIA',
        pagina: pagina?.trim() || null,
        criadoPorId: session.user.id,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_BUG_REPORT',
      entidade: 'BugReport',
      entidadeId: report.id,
      utilizadorId: session.user.id,
      detalhes: { titulo: report.titulo, severidade: report.severidade },
    })

    // Notifica a administração (não bloqueia a resposta em caso de falha).
    try {
      await notifyBugReportCriado({
        titulo: report.titulo,
        autorNome: session.user.nome,
        severidadeLabel: SEVERIDADE_LABELS[report.severidade],
      })
    } catch {
      // Notificação é best-effort; o report já está persistido.
    }

    return Response.json(report, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
