import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { nuipcToSlug } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

// Pesquisa global (paleta de comandos / Cmd+K). Mantida deliberadamente leve:
// poucos resultados por grupo, ordenados por relevância de recência. O scope
// por role é aplicado por buildInqueritoWhere e ANDado em último lugar para que
// nunca possa ser contornado pelo termo de pesquisa.
const MAX_INQUERITOS = 8

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    // Qualquer perfil que possa ler inquéritos (próprios, da brigada ou todos)
    // pode usar a pesquisa global; o âmbito é restringido por buildInqueritoWhere.
    if (
      !hasPermission(role, 'inquerito:read:own') &&
      !hasPermission(role, 'inquerito:read:all')
    ) {
      return apiError('Sem permissão', 403)
    }

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
    // Abaixo de 2 caracteres não vale a pena ir à BD — a paleta mostra apenas
    // atalhos de navegação (resolvidos no cliente).
    if (q.length < 2) return Response.json({ inqueritos: [] })

    const scopeWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null)

    const inqueritos = await prisma.inquerito.findMany({
      where: {
        AND: [
          { deletedAt: null },
          {
            OR: [
              { nuipc: { contains: q, mode: 'insensitive' } },
              { nai: { contains: q, mode: 'insensitive' } },
              { denuncianteNome: { contains: q, mode: 'insensitive' } },
              { denuncianteNif: { contains: q, mode: 'insensitive' } },
              { etiquetas: { some: { nome: { contains: q, mode: 'insensitive' } } } },
            ],
          },
          scopeWhere,
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_INQUERITOS,
      select: {
        id: true,
        nuipc: true,
        natureza: true,
        crime: { select: { nome: true } },
        estado: { select: { nome: true } },
        inspetor: { select: { nome: true } },
      },
    })

    return Response.json({
      inqueritos: inqueritos.map((i) => ({
        id: i.id,
        nuipc: i.nuipc,
        slug: nuipcToSlug(i.nuipc),
        crimeNome: i.crime?.nome ?? i.natureza,
        estadoNome: i.estado.nome,
        inspetorNome: i.inspetor?.nome ?? null,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
