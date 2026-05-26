import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { getRelatorio } from '@/lib/relatorios'
import { prisma } from '@/lib/prisma'
import { RelatorioView } from '@/components/relatorios/relatorio-view'
import { AccessDenied } from '@/components/access-denied'
import type { Role } from '@/generated/prisma/enums'

export default async function RelatorioDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'relatorio:read')) {
    return <AccessDenied message="Não dispões de privilégios para ver relatórios." />
  }

  const { id } = await params
  const relatorio = getRelatorio(id)
  if (!relatorio) notFound()

  // Pré-carregar dados de catálogo para os filtros (brigadas / crimes / estados /
  // inspetores). Como o relatório vive numa página única e os filtros mudam
  // poucos itens, é mais simples e mais barato carregar de uma vez.
  const lockedBrigadaId = role === 'INSPETOR_CHEFE' ? (session.user.brigadaId ?? null) : null

  const [brigadas, crimes, estados, inspetores] = await Promise.all([
    prisma.brigada.findMany({
      where: { ativa: true, ...(lockedBrigadaId && { id: lockedBrigadaId }) },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.crime.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    }),
    prisma.estadoInquerito.findMany({
      where: { ativo: true },
      orderBy: { ordem: 'asc' },
      select: { codigo: true, nome: true },
    }),
    prisma.utilizador.findMany({
      where: {
        ativo: true,
        role: 'INSPETOR',
        ...(lockedBrigadaId && { brigadaId: lockedBrigadaId }),
      },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, brigada: { select: { nome: true } } },
    }),
  ])

  return (
    <RelatorioView
      id={relatorio.id}
      titulo={relatorio.titulo}
      descricao={relatorio.descricao}
      lockedBrigadaId={lockedBrigadaId}
      catalogo={{ brigadas, crimes, estados, inspetores }}
    />
  )
}
