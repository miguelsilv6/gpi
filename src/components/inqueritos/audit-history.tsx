'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, ChevronDown, ChevronUp, Loader2, ArrowRight } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'

interface AuditEntry {
  id: string
  acao: string
  utilizadorId: string
  utilizadorNome: string | null
  detalhes: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

const ACAO_LABELS: Record<string, string> = {
  CREATE_INQUERITO: 'Inquérito criado',
  UPDATE_INQUERITO: 'Inquérito alterado',
  TRANSFER_INQUERITO: 'Transferido entre brigadas',
  REOPEN_INQUERITO: 'Inquérito reaberto',
  DELETE_INQUERITO: 'Inquérito apagado',
  CREATE_ATIVIDADE: 'Atividade adicionada',
  UPDATE_ATIVIDADE: 'Atividade alterada',
  DELETE_ATIVIDADE: 'Atividade eliminada',
  EXPORT_INQUERITO_DETAIL: 'Exportado em CSV',
  EXPORT_INQUERITO_PRINT: 'Exportado em PDF / impressão',
  AUTO_TRANSITION_INQUERITO: 'Transição automática de estado',
  BULK_ASSIGN: 'Atribuição em massa',
  BULK_CHANGESTATE: 'Alteração de estado em massa',
  BULK_TRANSFER: 'Transferência em massa',
  CREATE_BACKUP: 'Backup criado',
  BACKUP_FAILED: 'Falha de backup',
  DOWNLOAD_BACKUP: 'Backup descarregado',
  UPLOAD_BACKUP: 'Backup carregado (upload)',
  RESTORE_BACKUP: 'Backup restaurado',
  RESTORE_FAILED: 'Falha de restauro',
  DELETE_BACKUP: 'Backup eliminado',
  EXPORT_RELATORIO: 'Relatório exportado',
  PASSWORD_RESET_REQUESTED: 'Reset de password pedido',
  PASSWORD_RESET_COMPLETED: 'Password redefinida via reset',
}

// Friendly labels for known fields. Falls back to the raw key when unknown.
const FIELD_LABELS: Record<string, string> = {
  nuipc: 'NUIPC',
  nai: 'NAI',
  natureza: 'Natureza',
  crimeId: 'Crime',
  crimeNome: 'Crime',
  estadoCodigo: 'Estado',
  estadoId: 'Estado',
  faseProcessual: 'Fase processual',
  dataAbertura: 'Data de abertura',
  dataPrazo: 'Prazo',
  dataConclusao: 'Data de conclusão',
  dataRealizacao: 'Data de realização',
  inspetorId: 'Inspetor',
  brigadaId: 'Brigada',
  tribunal: 'Tribunal / M.P.',
  procurador: 'Procurador/a',
  oficialJustica: 'Oficial de Justiça',
  voip: 'VoIP / Contacto',
  notasTribunal: 'Notas (tribunal)',
  notas: 'Notas',
  quantidade: 'Quantidade',
  observacoes: 'Observações',
  alertaDias1: '1.º aviso (dias)',
  alertaDias2: '2.º aviso (dias)',
  concluidaEm: 'Concluída em',
  descricao: 'Atividade',
  atividadeId: 'Atividade id',
  source: 'Origem',
  // Denunciante
  denuncianteNome: 'Denunciante (nome)',
  denuncianteTipo: 'Denunciante (tipo)',
  denuncianteNif: 'Denunciante (NIF/NIPC)',
  denuncianteMorada: 'Denunciante (morada)',
  denuncianteCodPostal: 'Denunciante (cód. postal)',
  denuncianteLocalidade: 'Denunciante (localidade)',
  denuncianteContacto: 'Denunciante (contacto)',
  denuncianteEmail: 'Denunciante (email)',
  denuncianteResponsavel: 'Denunciante (responsável)',
  denuncianteNotas: 'Denunciante (notas)',
}

const DATE_FIELDS = new Set([
  'dataAbertura',
  'dataPrazo',
  'dataConclusao',
  'dataRealizacao',
])
const DATETIME_FIELDS = new Set(['concluidaEm', 'createdAt'])

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field
}

/** Pretty-print a single value for the audit display. */
function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (DATETIME_FIELDS.has(field) && typeof value === 'string') {
    return formatDateTime(value)
  }
  if (DATE_FIELDS.has(field) && (typeof value === 'string' || value instanceof Date)) {
    // ISO strings from Prisma; format-only-date even if a time was attached.
    return formatDate(value as string | Date)
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/** Type guard: detalhes follows the `diff()` shape. */
function isDiffShape(d: Record<string, unknown>): d is {
  changed: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
} {
  return (
    Array.isArray((d as Record<string, unknown>).changed) &&
    typeof (d as Record<string, unknown>).before === 'object' &&
    typeof (d as Record<string, unknown>).after === 'object'
  )
}

function DiffRenderer({ detalhes }: { detalhes: Record<string, unknown> }) {
  // Case 1: diff-shaped — render changed[]
  if (isDiffShape(detalhes)) {
    if (detalhes.changed.length === 0) {
      return <p className="text-xs text-muted-foreground italic">Sem alterações registadas.</p>
    }
    return (
      <ul className="space-y-1.5 text-xs">
        {detalhes.changed.map((field) => (
          <li key={field} className="flex items-start gap-2 flex-wrap">
            <span className="font-medium text-muted-foreground min-w-[120px]">
              {labelFor(field)}
            </span>
            <span className="font-mono bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200 px-1.5 rounded">
              {formatValue(field, detalhes.before[field])}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground self-center" />
            <span className="font-mono bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200 px-1.5 rounded">
              {formatValue(field, detalhes.after[field])}
            </span>
          </li>
        ))}
      </ul>
    )
  }
  // Case 2: flat key→value (CREATE_*, DELETE_*, EXPORT_*, BULK_*)
  const entries = Object.entries(detalhes).filter(
    ([k, v]) => k !== 'changed' && k !== 'before' && k !== 'after' && v !== null && v !== undefined && v !== '',
  )
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sem detalhes registados.</p>
  }
  return (
    <ul className="space-y-1 text-xs">
      {entries.map(([k, v]) => (
        <li key={k} className="flex items-start gap-2 flex-wrap">
          <span className="font-medium text-muted-foreground min-w-[120px]">
            {labelFor(k)}
          </span>
          <span className="font-mono">{formatValue(k, v)}</span>
        </li>
      ))}
    </ul>
  )
}

export function AuditHistory({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || loaded) return
    setLoading(true)
    fetch(`/api/inqueritos/${slug}/audit?limit=50`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.error ?? 'Erro a carregar histórico')
        }
        return r.json()
      })
      .then((d) => setEntries(d.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [open, loaded, slug])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Histórico de alterações
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              Sem entradas de auditoria.
            </p>
          ) : (
            <ol className="space-y-3">
              {entries.map((e) => {
                const isExpanded = expanded.has(e.id)
                const hasDetails = e.detalhes && Object.keys(e.detalhes).length > 0
                return (
                  <li
                    key={e.id}
                    className="border-l-2 border-muted pl-3 text-sm"
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="font-medium">
                        {ACAO_LABELS[e.acao] ?? e.acao}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(new Date(e.createdAt))}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      por{' '}
                      <span className="font-medium text-foreground">
                        {e.utilizadorNome ?? '—'}
                      </span>
                      {e.ip && (
                        <span className="ml-2 font-mono">({e.ip})</span>
                      )}
                    </div>
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(e.id)}
                        className="text-xs text-muted-foreground hover:text-foreground mt-1 underline underline-offset-2"
                      >
                        {isExpanded ? 'Esconder detalhes' : 'Ver detalhes'}
                      </button>
                    )}
                    {isExpanded && hasDetails && (
                      <div className="mt-2 rounded-md bg-muted/40 p-2.5">
                        <DiffRenderer detalhes={e.detalhes!} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          {loaded && !loading && entries.length === 50 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              A mostrar últimas 50 entradas.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
