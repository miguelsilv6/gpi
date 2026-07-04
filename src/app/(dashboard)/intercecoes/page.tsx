import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { getLinhasGlobal, A_EXPIRAR_DIAS, type EstadoFiltro } from '@/lib/intercecoes'
import { TIPO_LINHA_LABEL, INTERCECAO_ALERTA1_DEFAULT, estadoLinha } from '@/lib/validations/intercecao'
import { AccessDenied } from '@/components/access-denied'
import { PrazoUrgencyBadge } from '@/components/prazos/prazo-urgency-badge'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { formatDate, nuipcToSlug, cn } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

const FILTROS: { key: EstadoFiltro; label: string }[] = [
  { key: 'ativas', label: 'Ativas' },
  { key: 'a-expirar', label: `A expirar (${A_EXPIRAR_DIAS} dias)` },
  { key: 'todas', label: 'Todas' },
]

const EMPTY_TEXT: Record<EstadoFiltro, string> = {
  ativas: 'Sem linhas de interceção ativas.',
  'a-expirar': `Sem linhas a expirar nos próximos ${A_EXPIRAR_DIAS} dias.`,
  todas: 'Sem linhas de interceção registadas.',
}

export default async function IntercecoesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; page?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role as Role

  // O gate da página é o próprio módulo (as roles do módulo definem o acesso);
  // o scope dos dados segue o buildInqueritoWhere dentro de getLinhasGlobal.
  if (!(await isModuloIntercecoesAtivo(role))) {
    return (
      <AccessDenied
        title="Módulo desativado"
        message="O módulo Interceções está desativado ou o teu perfil não tem acesso."
        backHref="/dashboard"
        backLabel="Voltar ao dashboard"
      />
    )
  }

  const sp = await searchParams
  const estado: EstadoFiltro = sp.estado === 'a-expirar' || sp.estado === 'todas' ? sp.estado : 'ativas'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const { items, total, totalPages } = await getLinhasGlobal({
    role,
    userId: session.user.id,
    brigadaId: session.user.brigadaId ?? null,
    estado,
    page,
  })

  function buildUrl(f: EstadoFiltro, p?: number): string {
    const params = new URLSearchParams()
    if (f !== 'ativas') params.set('estado', f)
    if (p && p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/intercecoes?${qs}` : '/intercecoes'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Interceções</h1>
          <p className="text-muted-foreground text-sm">
            {total} linha{total !== 1 ? 's' : ''} — controlo de interceções de comunicações
          </p>
        </div>
        <HelpButton title="Ajuda — Interceções" className="shrink-0">
          <HelpSection title="O que é esta página">
            <p>
              Vista global de todas as linhas intercetadas (SIM/IMEI) dos inquéritos a que
              tens acesso, com as datas de fim e a urgência à vista. A gestão (alvos,
              linhas e produtos) faz-se dentro de cada inquérito — clica no NUIPC.
            </p>
          </HelpSection>
          <HelpSection title="Filtros">
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li><strong>Ativas</strong> — linhas cuja data de fim ainda não passou.</li>
              <li><strong>A expirar</strong> — linhas que terminam nos próximos {A_EXPIRAR_DIAS} dias (janela fixa; os alertas reais usam os dias configurados em cada linha).</li>
              <li><strong>Todas</strong> — inclui linhas já terminadas.</li>
            </ul>
          </HelpSection>
          <HelpSection title="Alertas">
            <p>
              Cada linha tem até 2 avisos antes do fim (por defeito {INTERCECAO_ALERTA1_DEFAULT} e 3 dias),
              notificando o inspetor do inquérito. Configuram-se ao criar/editar a linha.
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
        <div className="rounded-xl border bg-background overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Suspeito</th>
                <th className="px-4 py-2.5 font-medium">Inquérito</th>
                <th className="px-4 py-2.5 font-medium">Linha</th>
                <th className="px-4 py-2.5 font-medium">Rede</th>
                <th className="px-4 py-2.5 font-medium">Início</th>
                <th className="px-4 py-2.5 font-medium">Fim</th>
                <th className="px-4 py-2.5 font-medium">Prazo</th>
                <th className="px-4 py-2.5 font-medium">Inspetor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((l) => {
                const terminada = estadoLinha(l.dataFim) === 'terminada'
                const slug = nuipcToSlug(l.alvo.inquerito.nuipc)
                return (
                  <tr key={l.id} className={cn(terminada && 'opacity-60')}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium">{l.alvo.nome}</span>{' '}
                      <span className="text-[11px] font-mono text-muted-foreground">({l.alvo.codigo})</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link
                        href={`/inqueritos/${slug}/intercecoes`}
                        className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {l.alvo.inquerito.nuipc}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {TIPO_LINHA_LABEL[l.tipo]}{' '}
                      <span className="font-mono">{l.identificador}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{l.rede ?? '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(l.dataInicio)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(l.dataFim)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {terminada ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                          Terminada
                        </span>
                      ) : (
                        <PrazoUrgencyBadge
                          dataPrazo={l.dataFim}
                          alertaDias={l.alertaDias1 ?? INTERCECAO_ALERTA1_DEFAULT}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {l.alvo.inquerito.inspetor?.nome ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
