import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isModuloPericiasAtivo } from '@/lib/pericias-module'
import { getPericiasGlobal, periciaTipoLabel, type PericiaEstadoFiltro } from '@/lib/pericias'
import { ESTADO_PERICIA_LABEL, ESTADO_PERICIA_TERMINAL } from '@/lib/validations/pericia'
import { AccessDenied } from '@/components/access-denied'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { formatDate, nuipcToSlug, cn } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

const FILTROS: { key: PericiaEstadoFiltro; label: string }[] = [
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'concluidas', label: 'Concluídas' },
  { key: 'todas', label: 'Todas' },
]

const EMPTY_TEXT: Record<PericiaEstadoFiltro, string> = {
  pendentes: 'Sem perícias pendentes.',
  concluidas: 'Sem perícias concluídas.',
  todas: 'Sem perícias registadas.',
}

function estadoBadgeClass(estado: string): string {
  if (estado === 'EM_CURSO')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800'
  if (estado === 'SOLICITADA')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'
}

export default async function PericiasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; page?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role as Role

  if (!(await isModuloPericiasAtivo(role))) {
    return (
      <AccessDenied
        title="Módulo desativado"
        message="O módulo Perícias está desativado ou o teu perfil não tem acesso."
        backHref="/dashboard"
        backLabel="Voltar ao dashboard"
      />
    )
  }

  const sp = await searchParams
  const estado: PericiaEstadoFiltro =
    sp.estado === 'concluidas' || sp.estado === 'todas' ? sp.estado : 'pendentes'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const { items, total, totalPages } = await getPericiasGlobal({
    role,
    userId: session.user.id,
    brigadaId: session.user.brigadaId ?? null,
    estado,
    page,
  })

  const now = new Date()

  function buildUrl(f: PericiaEstadoFiltro, p?: number): string {
    const params = new URLSearchParams()
    if (f !== 'pendentes') params.set('estado', f)
    if (p && p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/pericias?${qs}` : '/pericias'
  }

  type Item = (typeof items)[number]
  const grupos: Array<{ nuipc: string; slug: string; itens: Item[] }> = []
  const idx = new Map<string, number>()
  for (const p of items) {
    const nuipc = p.inquerito.nuipc
    let gi = idx.get(nuipc)
    if (gi === undefined) {
      gi = grupos.length
      idx.set(nuipc, gi)
      grupos.push({ nuipc, slug: nuipcToSlug(nuipc), itens: [] })
    }
    grupos[gi].itens.push(p)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Perícias</h1>
          <p className="text-muted-foreground text-sm">
            {total} perícia{total !== 1 ? 's' : ''} — exames técnicos e científicos
          </p>
        </div>
        <HelpButton title="Ajuda — Perícias" className="shrink-0">
          <HelpSection title="O que é esta página">
            <p>
              Vista global das perícias pedidas nos inquéritos a que tens acesso. O registo e a
              gestão fazem-se dentro de cada inquérito — clica no NUIPC.
            </p>
          </HelpSection>
          <HelpSection title="Filtros">
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li><strong>Pendentes</strong> — perícias solicitadas ou em curso (por concluir).</li>
              <li><strong>Concluídas</strong> — perícias concluídas ou canceladas.</li>
              <li><strong>Todas</strong> — todas as perícias registadas.</li>
            </ul>
          </HelpSection>
          <HelpSection title="Atrasos">
            <p>
              Uma data prevista a <strong>vermelho</strong> já passou sem conclusão — o inspetor do
              inquérito recebe um lembrete automático.
            </p>
          </HelpSection>
        </HelpButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.key}
            href={buildUrl(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-full border text-sm transition-colors',
              estado === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-accent',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border bg-background py-12 text-center text-sm text-muted-foreground">
          {EMPTY_TEXT[estado]}
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.nuipc} className="rounded-xl border bg-background overflow-hidden">
              <div className="flex items-center justify-between gap-3 flex-wrap border-b bg-muted/50 px-4 py-2.5">
                <Link
                  href={`/inqueritos/${g.slug}`}
                  className="font-mono text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {g.nuipc}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {g.itens.length} perícia{g.itens.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="px-4 py-2 font-medium">Perícia</th>
                      <th className="px-4 py-2 font-medium">Tipo</th>
                      <th className="px-4 py-2 font-medium">Entidade</th>
                      <th className="px-4 py-2 font-medium">Pedida</th>
                      <th className="px-4 py-2 font-medium">Prevista</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {g.itens.map((p) => {
                      const terminal = ESTADO_PERICIA_TERMINAL.has(p.estado)
                      const atrasada = !terminal && !!p.dataPrevista && p.dataPrevista < now
                      return (
                        <tr key={p.id} className={cn(terminal && 'opacity-60')}>
                          <td className="px-4 py-2">
                            <div className="font-medium">{p.descricao}</div>
                            {p.numeroReferencia && (
                              <div className="text-xs text-muted-foreground">Ref. {p.numeroReferencia}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {periciaTipoLabel(p.tipo, p.tipoOutro)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">{p.entidade ?? '—'}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{formatDate(p.dataPedido)}</td>
                          <td
                            className={cn(
                              'px-4 py-2 whitespace-nowrap',
                              atrasada && 'text-red-600 dark:text-red-400 font-medium',
                            )}
                          >
                            {p.dataPrevista ? formatDate(p.dataPrevista) : '—'}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border',
                                estadoBadgeClass(p.estado),
                              )}
                            >
                              {ESTADO_PERICIA_LABEL[p.estado as keyof typeof ESTADO_PERICIA_LABEL] ??
                                p.estado}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl(estado, page - 1)}
                className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl(estado, page + 1)}
                className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
              >
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
