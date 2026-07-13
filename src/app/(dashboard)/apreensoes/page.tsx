import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isModuloApreensoesAtivo } from '@/lib/apreensoes-module'
import { getApreensoesGlobal, apreensaoTipoLabel, type ApreensaoEstadoFiltro } from '@/lib/apreensoes'
import { ESTADO_APREENSAO_LABEL, ESTADO_APREENSAO_TERMINAL } from '@/lib/validations/apreensao'
import { AccessDenied } from '@/components/access-denied'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { formatDate, nuipcToSlug, cn } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

const FILTROS: { key: ApreensaoEstadoFiltro; label: string }[] = [
  { key: 'em-custodia', label: 'Em custódia' },
  { key: 'concluidas', label: 'Concluídas' },
  { key: 'todas', label: 'Todas' },
]

const EMPTY_TEXT: Record<ApreensaoEstadoFiltro, string> = {
  'em-custodia': 'Sem objetos em custódia.',
  concluidas: 'Sem apreensões concluídas.',
  todas: 'Sem apreensões registadas.',
}

function estadoBadgeClass(estado: string): string {
  if (estado === 'EM_CUSTODIA')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800'
  if (estado === 'A_AGUARDAR_EXAME')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'
}

export default async function ApreensoesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; page?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role as Role

  // O gate da página é o próprio módulo (as roles do módulo definem o acesso);
  // o scope dos dados segue o buildInqueritoWhere dentro de getApreensoesGlobal.
  if (!(await isModuloApreensoesAtivo(role))) {
    return (
      <AccessDenied
        title="Módulo desativado"
        message="O módulo Apreensões está desativado ou o teu perfil não tem acesso."
        backHref="/dashboard"
        backLabel="Voltar ao dashboard"
      />
    )
  }

  const sp = await searchParams
  const estado: ApreensaoEstadoFiltro =
    sp.estado === 'concluidas' || sp.estado === 'todas' ? sp.estado : 'em-custodia'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const { items, total, totalPages } = await getApreensoesGlobal({
    role,
    userId: session.user.id,
    brigadaId: session.user.brigadaId ?? null,
    estado,
    page,
  })

  function buildUrl(f: ApreensaoEstadoFiltro, p?: number): string {
    const params = new URLSearchParams()
    if (f !== 'em-custodia') params.set('estado', f)
    if (p && p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/apreensoes?${qs}` : '/apreensoes'
  }

  // Agrupa por inquérito, preservando a ordem (data de apreensão desc).
  type Item = (typeof items)[number]
  const grupos: Array<{ nuipc: string; slug: string; itens: Item[] }> = []
  const idx = new Map<string, number>()
  for (const a of items) {
    const nuipc = a.inquerito.nuipc
    let gi = idx.get(nuipc)
    if (gi === undefined) {
      gi = grupos.length
      idx.set(nuipc, gi)
      grupos.push({ nuipc, slug: nuipcToSlug(nuipc), itens: [] })
    }
    grupos[gi].itens.push(a)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Apreensões</h1>
          <p className="text-muted-foreground text-sm">
            {total} objeto{total !== 1 ? 's' : ''} — registo e custódia de bens apreendidos
          </p>
        </div>
        <HelpButton title="Ajuda — Apreensões" className="shrink-0">
          <HelpSection title="O que é esta página">
            <p>
              Vista global dos objetos apreendidos nos inquéritos a que tens acesso. O registo e
              a gestão de cada apreensão fazem-se dentro do inquérito — clica no NUIPC.
            </p>
          </HelpSection>
          <HelpSection title="Filtros">
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li><strong>Em custódia</strong> — objetos ainda por devolver ou dar destino (inclui os que aguardam exame).</li>
              <li><strong>Concluídas</strong> — objetos devolvidos, perdidos a favor do Estado ou destruídos.</li>
              <li><strong>Todas</strong> — todas as apreensões registadas.</li>
            </ul>
          </HelpSection>
          <HelpSection title="Alertas">
            <p>
              Objetos que fiquem demasiado tempo em custódia geram um lembrete ao inspetor
              titular para lhes dar destino (prazo configurável nas Configurações).
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
                  {g.itens.length} objeto{g.itens.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="px-4 py-2 font-medium">Objeto</th>
                      <th className="px-4 py-2 font-medium">Tipo</th>
                      <th className="px-4 py-2 font-medium">Data</th>
                      <th className="px-4 py-2 font-medium">Custódia</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {g.itens.map((a) => {
                      const terminal = ESTADO_APREENSAO_TERMINAL.has(a.estado)
                      return (
                        <tr key={a.id} className={cn(terminal && 'opacity-60')}>
                          <td className="px-4 py-2">
                            <div className="font-medium">{a.descricao}</div>
                            {a.quantidade && (
                              <div className="text-xs text-muted-foreground">Qtd.: {a.quantidade}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {apreensaoTipoLabel(a.tipo, a.tipoOutro)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">{formatDate(a.dataApreensao)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{a.localCustodia ?? '—'}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border',
                                estadoBadgeClass(a.estado),
                              )}
                            >
                              {ESTADO_APREENSAO_LABEL[a.estado as keyof typeof ESTADO_APREENSAO_LABEL] ??
                                a.estado}
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
