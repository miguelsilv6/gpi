'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Componentes de filtro específicos por relatório. Todos partilham a mesma
 * convenção:
 *   - props: `filters` (Record<string,string>) + `setFilter(key, value)`
 *   - cada controlo persiste o filtro como string (ou '' para "sem filtro")
 *   - o pai (`RelatorioView`) é quem propaga ao backend via querystring
 */

export interface Catalogo {
  brigadas: { id: string; nome: string }[]
  crimes: { id: string; nome: string }[]
  estados: { codigo: string; nome: string }[]
  inspetores: { id: string; nome: string; brigada: { nome: string } | null }[]
}

export interface FiltersProps {
  filters: Record<string, string>
  setFilter: (key: string, value: string) => void
  catalogo: Catalogo
  lockedBrigadaId: string | null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/** Select nativo — mais leve que o Select complexo do shadcn para listas simples. */
function NativeSelect({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-8 rounded-lg border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
    >
      {children}
    </select>
  )
}

export function InqueritosFilters({ filters, setFilter, catalogo, lockedBrigadaId }: FiltersProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Field label="Data Abertura — de">
        <Input
          type="date"
          value={filters.dataAberturaFrom ?? ''}
          onChange={(e) => setFilter('dataAberturaFrom', e.target.value)}
        />
      </Field>
      <Field label="Data Abertura — até">
        <Input
          type="date"
          value={filters.dataAberturaTo ?? ''}
          onChange={(e) => setFilter('dataAberturaTo', e.target.value)}
        />
      </Field>
      <Field label="Estado">
        <NativeSelect
          value={filters.estado ?? ''}
          onChange={(v) => setFilter('estado', v)}
        >
          <option value="">Todos</option>
          {catalogo.estados.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.nome}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Brigada">
        <NativeSelect
          value={filters.brigadaId ?? lockedBrigadaId ?? ''}
          onChange={(v) => setFilter('brigadaId', v)}
          disabled={!!lockedBrigadaId}
        >
          <option value="">Todas</option>
          {catalogo.brigadas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nome}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Crime">
        <NativeSelect
          value={filters.crimeId ?? ''}
          onChange={(v) => setFilter('crimeId', v)}
        >
          <option value="">Todos</option>
          {catalogo.crimes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Inspetor">
        <NativeSelect
          value={filters.inspetorId ?? ''}
          onChange={(v) => setFilter('inspetorId', v)}
        >
          <option value="">Todos</option>
          {catalogo.inspetores.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
              {u.brigada ? ` · ${u.brigada.nome}` : ''}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  )
}

export function BrigadasFilters({ filters, setFilter, catalogo, lockedBrigadaId }: FiltersProps) {
  // Para o relatório por brigada permitimos múltipla selecção via CSV em filters.brigadaIds.
  const selectedIds = (filters.brigadaIds ?? '').split(',').filter(Boolean)
  const toggleBrigada = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setFilter('brigadaIds', next.join(','))
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Data Abertura — de">
          <Input
            type="date"
            value={filters.dataAberturaFrom ?? ''}
            onChange={(e) => setFilter('dataAberturaFrom', e.target.value)}
          />
        </Field>
        <Field label="Data Abertura — até">
          <Input
            type="date"
            value={filters.dataAberturaTo ?? ''}
            onChange={(e) => setFilter('dataAberturaTo', e.target.value)}
          />
        </Field>
      </div>
      {lockedBrigadaId ? (
        <p className="text-xs text-muted-foreground">
          Filtro de brigada limitado à sua brigada (Inspetor-Chefe).
        </p>
      ) : (
        <div>
          <Label className="text-xs font-medium text-muted-foreground">
            Brigadas (vazio = todas)
          </Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {catalogo.brigadas.map((b) => {
              const checked = selectedIds.includes(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBrigada(b.id)}
                  className={
                    'rounded-full border px-3 py-1 text-xs transition-colors ' +
                    (checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-muted')
                  }
                >
                  {b.nome}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function InspetoresFilters({ filters, setFilter, catalogo, lockedBrigadaId }: FiltersProps) {
  const inspetoresList = catalogo.inspetores.filter((u) => {
    if (lockedBrigadaId) return true // já filtrados no server
    const bId = filters.brigadaId ?? ''
    if (!bId) return true
    return catalogo.brigadas.find((b) => b.id === bId)?.nome === u.brigada?.nome
  })
  const selectedIds = (filters.inspetorIds ?? '').split(',').filter(Boolean)
  const toggleInspetor = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setFilter('inspetorIds', next.join(','))
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Data Abertura — de">
          <Input
            type="date"
            value={filters.dataAberturaFrom ?? ''}
            onChange={(e) => setFilter('dataAberturaFrom', e.target.value)}
          />
        </Field>
        <Field label="Data Abertura — até">
          <Input
            type="date"
            value={filters.dataAberturaTo ?? ''}
            onChange={(e) => setFilter('dataAberturaTo', e.target.value)}
          />
        </Field>
        <Field label="Brigada">
          <NativeSelect
            value={filters.brigadaId ?? lockedBrigadaId ?? ''}
            onChange={(v) => {
              setFilter('brigadaId', v)
              setFilter('inspetorIds', '')
            }}
            disabled={!!lockedBrigadaId}
          >
            <option value="">Todas</option>
            {catalogo.brigadas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground">
          Inspetores (vazio = todos do scope acima)
        </Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {inspetoresList.map((u) => {
            const checked = selectedIds.includes(u.id)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleInspetor(u.id)}
                className={
                  'rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (checked
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-muted')
                }
              >
                {u.nome}
              </button>
            )
          })}
          {inspetoresList.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Sem inspetores no scope filtrado.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function InatividadeFilters({ filters, setFilter, catalogo, lockedBrigadaId }: FiltersProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Field label="Dias sem atividade">
        <Input
          type="number"
          min={1}
          max={365}
          value={filters.dias ?? '30'}
          onChange={(e) => setFilter('dias', e.target.value)}
        />
      </Field>
      <Field label="Brigada">
        <NativeSelect
          value={filters.brigadaId ?? lockedBrigadaId ?? ''}
          onChange={(v) => setFilter('brigadaId', v)}
          disabled={!!lockedBrigadaId}
        >
          <option value="">Todas</option>
          {catalogo.brigadas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nome}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  )
}
