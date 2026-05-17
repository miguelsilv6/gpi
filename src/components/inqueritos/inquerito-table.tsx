'use client'

import { memo, useCallback, useState } from 'react'
import { EstadoBadge } from './estado-badge'
import { FaseBadge } from './fase-badge'
import { BulkActionBar } from './bulk-action-bar'
import { InqueritoCard } from './inquerito-card'
import { formatDate, isOverdue, cn, nuipcToSlug } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'

interface EstadoLike {
  id: string
  codigo: string
  nome: string
  cor: string | null
  terminal: boolean
  ativo: boolean
}

interface Inquerito {
  id: string
  nuipc: string
  nai: string | null
  natureza: string
  estado: EstadoLike
  faseProcessual: string
  dataPrazo: Date | null
  inspetor: { id: string; nome: string } | null
  brigada: { id: string; nome: string }
  _count: { atividades: number }
}

interface Inspetor { id: string; nome: string; brigadaId: string | null }
interface Brigada { id: string; nome: string }

interface Props {
  inqueritos: Inquerito[]
  canBulk: boolean
  canTransfer: boolean
  inspetores: Inspetor[]
  brigadas: Brigada[]
  estados: EstadoLike[]
}

interface RowProps {
  inq: Inquerito
  canBulk: boolean
  isSelected: boolean
  onToggle: (id: string) => void
}

const Row = memo(function Row({ inq, canBulk, isSelected, onToggle }: RowProps) {
  const overdue = isOverdue(inq.dataPrazo) && !inq.estado.terminal
  return (
    <tr
      className={cn(
        'hover:bg-accent/30 transition-colors',
        isSelected && 'bg-blue-50/50 dark:bg-blue-950/10',
      )}
    >
      {canBulk && (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(inq.id)}
            className="h-4 w-4 rounded border"
          />
        </td>
      )}
      <td className="px-4 py-3">
        <Link
          href={`/inqueritos/${nuipcToSlug(inq.nuipc)}`}
          className="font-mono font-medium hover:text-blue-600 hover:underline flex items-center gap-1.5"
        >
          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
          {inq.nuipc}
        </Link>
        {inq.nai && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            NAI: {inq.nai}
          </p>
        )}
      </td>
      <td className="px-4 py-3 max-w-[200px] truncate">{inq.natureza}</td>
      <td className="px-4 py-3">
        <EstadoBadge estado={inq.estado} />
      </td>
      <td className="px-4 py-3">
        <FaseBadge fase={inq.faseProcessual as never} />
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {inq.inspetor?.nome ?? <span className="text-muted-foreground/50 italic">Não atribuído</span>}
      </td>
      <td className={cn('px-4 py-3', overdue && 'text-red-600 font-medium')}>
        {formatDate(inq.dataPrazo)}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-center">
        {inq._count.atividades}
      </td>
    </tr>
  )
})

export function InqueritoTable({ inqueritos, canBulk, canTransfer, inspetores, brigadas, estados }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allIds = inqueritos.map((i) => i.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (allIds.length > 0 && allIds.every((id) => prev.has(id))) return new Set()
      return new Set(allIds)
    })
  }, [allIds])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelected = useCallback(() => setSelected(new Set()), [])

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {canBulk && (
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">NUIPC</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Natureza</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fase</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Inspetor</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Prazo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ativ.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {inqueritos.length === 0 ? (
              <tr>
                <td colSpan={canBulk ? 8 : 7} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhum inquérito encontrado.
                </td>
              </tr>
            ) : (
              inqueritos.map((inq) => (
                <Row
                  key={inq.id}
                  inq={inq}
                  canBulk={canBulk}
                  isSelected={selected.has(inq.id)}
                  onToggle={toggle}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {inqueritos.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhum inquérito encontrado.</p>
        ) : (
          inqueritos.map((inq) => (
            <InqueritoCard
              key={inq.id}
              nuipc={inq.nuipc}
              nai={inq.nai}
              natureza={inq.natureza}
              estado={inq.estado}
              faseProcessual={inq.faseProcessual as never}
              dataPrazo={inq.dataPrazo}
              inspetorNome={inq.inspetor?.nome}
              brigadaNome={inq.brigada.nome}
              atividadesCount={inq._count.atividades}
            />
          ))
        )}
      </div>

      {/* Bulk action bar */}
      {canBulk && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          selectedNuipcs={inqueritos
            .filter((i) => selected.has(i.id))
            .map((i) => i.nuipc)}
          onClear={clearSelected}
          canTransfer={canTransfer}
          inspetores={inspetores}
          brigadas={brigadas}
          estados={estados}
        />
      )}
    </>
  )
}
