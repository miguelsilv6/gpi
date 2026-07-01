import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { resolveAuditDetalhesNames } from '@/lib/audit-resolve'
import type { Role } from '@/generated/prisma/enums'

const PAGE_SIZE = 30

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get('cursor') ?? undefined
    const entidade = searchParams.get('entidade') ?? undefined
    const utilizadorId = searchParams.get('utilizadorId') ?? undefined

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(entidade && { entidade }),
        ...(utilizadorId && { utilizadorId }),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })

    const hasMore = logs.length > PAGE_SIZE
    const items = hasMore ? logs.slice(0, PAGE_SIZE) : logs
    const nextCursor = hasMore ? items[items.length - 1].id : null

    // Enrich with user names
    const utilizadorIds = [...new Set(items.map((l) => l.utilizadorId))]
    const utilizadores = await prisma.utilizador.findMany({
      where: { id: { in: utilizadorIds } },
      select: { id: true, nome: true },
    })
    const userMap = Object.fromEntries(utilizadores.map((u) => [u.id, u.nome]))

    // Enrich Inquerito rows with NUIPC + Utilizador rows with email — permite
    // ao dialog construir links directos para a entidade. Bulk markers
    // (entidadeId começa por "__") são saltados.
    const inqueritoIds = items
      .filter((l) => l.entidade === 'Inquerito' && !l.entidadeId.startsWith('__'))
      .map((l) => l.entidadeId)
    const utilizadorEntityIds = items
      .filter((l) => l.entidade === 'Utilizador' && !l.entidadeId.startsWith('__'))
      .map((l) => l.entidadeId)

    const [inqueritos, utilizadoresEntity] = await Promise.all([
      inqueritoIds.length > 0
        ? prisma.inquerito.findMany({
            where: { id: { in: inqueritoIds } },
            select: { id: true, nuipc: true },
          })
        : Promise.resolve([] as { id: string; nuipc: string }[]),
      utilizadorEntityIds.length > 0
        ? prisma.utilizador.findMany({
            where: { id: { in: utilizadorEntityIds } },
            select: { id: true, email: true },
          })
        : Promise.resolve([] as { id: string; email: string }[]),
    ])
    const nuipcMap = Object.fromEntries(inqueritos.map((i) => [i.id, i.nuipc]))
    const emailMap = Object.fromEntries(utilizadoresEntity.map((u) => [u.id, u.email]))

    // Resolve FKs (crimeId, tribunalId, seccaoId, inspetorId, ...) guardados em
    // `detalhes` para o nome da entidade — inclui entradas antigas gravadas
    // antes deste resolver existir.
    await resolveAuditDetalhesNames(items)

    const enriched = items.map((l) => ({
      ...l,
      utilizadorNome: userMap[l.utilizadorId] ?? l.utilizadorId,
      entidadeNuipc: l.entidade === 'Inquerito' ? (nuipcMap[l.entidadeId] ?? null) : null,
      entidadeEmail: l.entidade === 'Utilizador' ? (emailMap[l.entidadeId] ?? null) : null,
    }))

    return Response.json({ items: enriched, nextCursor })
  } catch (error) {
    return handleApiError(error)
  }
}
