import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { getChecklistItens } from '@/lib/checklist'
import type { Role } from '@/generated/prisma/enums'

const putSchema = z.object({
  /** Conjunto completo (substitui o existente); a ordem do array é a ordem da checklist. */
  atividadePadraoIds: z.array(z.string().min(1)).max(100),
})

/** GET /api/crimes/[id]/checklist — itens configurados (qualquer sessão). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getSession()
    const { id } = await params
    const crime = await prisma.crime.findUnique({ where: { id }, select: { id: true } })
    if (!crime) return apiError('Crime não encontrado', 404)
    const items = await getChecklistItens(id)
    return Response.json({ items })
  } catch (error) {
    return handleApiError(error)
  }
}

/** PUT — substitui a checklist do crime (só quem gere crimes). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'crime:manage')) return apiError('Sem permissão', 403)

    const { id } = await params
    const crime = await prisma.crime.findUnique({ where: { id }, select: { id: true, nome: true } })
    if (!crime) return apiError('Crime não encontrado', 404)

    const body = await req.json().catch(() => null)
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const ids = [...new Set(parsed.data.atividadePadraoIds)]
    if (ids.length > 0) {
      const found = await prisma.atividadePadrao.count({ where: { id: { in: ids } } })
      if (found !== ids.length) return apiError('Uma ou mais atividades-padrão são inválidas', 400)
    }

    const before = await getChecklistItens(id)

    await prisma.$transaction([
      prisma.crimeChecklistItem.deleteMany({ where: { crimeId: id } }),
      ...(ids.length > 0
        ? [
            prisma.crimeChecklistItem.createMany({
              data: ids.map((atividadePadraoId, ordem) => ({ crimeId: id, atividadePadraoId, ordem })),
            }),
          ]
        : []),
    ])

    const after = await getChecklistItens(id)

    await writeAudit({
      req,
      acao: 'UPDATE_CRIME_CHECKLIST',
      entidade: 'Crime',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: {
        crimeNome: crime.nome,
        before: before.map((i) => i.nome),
        after: after.map((i) => i.nome),
      } as never,
    })

    return Response.json({ items: after })
  } catch (error) {
    return handleApiError(error)
  }
}
