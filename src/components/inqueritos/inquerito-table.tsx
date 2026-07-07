'use client'

import { memo, useCallback, useState } from 'react'
import { EstadoBadge } from './estado-badge'
import { BulkActionBar } from './bulk-action-bar'
import { InqueritoCard } from './inquerito-card'
import { Button } from '@/components/ui/button'
import { EtiquetaList } from './etiqueta-badge'
import { formatDate, isOverdue, cn, nuipcToSlug } from '@/lib/utils'
import { AlertTriangle, CheckSquare, X, Mail, RadioTower } from 'lucide-react'
import Link from 'next/link'

interface EstadoLike {
  id: string
  codigo: string
  nome: string
  cor: string | null
  terminal: boolean
  ativo: boolean
}

interface EtiquetaLike { id: string; nome: string }

interface Inquerito {
  id: string
  nuipc: string
  nai: string | null
  natureza: string
  denuncianteNome: string | null
  cartaPrecatoria: boolean
  crime: { id: string; nome: string } | null
  estado: EstadoLike
  etiquetas?: EtiquetaLike[]
  dataPrazo: Date | null
  inspetor: { id: string; nome: string } | null
  brigada: { id: string; nome: string } | null
  _count: { atividades: number; intercecaoAlvos: number }
}

interface Inspetor { id: string; nome: string; brigadaId: string | null }
interface Brigada { id: string; nome: string }

/** Combina Inspetor e/ou Denunciante numa única etiqueta para o card mobile,
 *  que só tem um slot de "pessoa" — mantém o comportamento exato de cada
 *  perfil sem precisar de duas linhas/ícones extra. */
function inspetorNomeLabel(inq: Inquerito, showInspetor: boolean, showDenunciante: boolean): string | null {
  const parts: string[] = []
  if (showInspetor) parts.push(inq.inspetor?.nome ?? 'Não atribuído')
  if (showDenunciante && inq.denuncianteNome) parts.push(`Denunciante: ${inq.denuncianteNome}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

interface Props {
  inqueritos: Inquerito[]
  canBulk: boolean
  canTransfer: boolean
  /** Show the "Brigada" column. Coord/admin only — the others have a
   *  brigade-scoped view so the column would be either constant or empty. */
  showBrigada: boolean
  /** Show the "Inspetor" column. Off for INSPETOR (redundant — always themselves). */
  showInspetor: boolean
  /** Show the "Denunciante" column. On for INSPETOR (replacing Inspetor) and
   *  INSPETOR_CHEFE (alongside Inspetor). */
  showDenunciante: boolean
  /** Show the "Prazo" column. Off for INSPETOR_CHEFE. */
  showPrazo: boolean
  /** Quando true, mostra o ícone de interceções junto ao NUIPC nos inquéritos
   *  que têm alvos. Desligado quando o módulo está inativo para o perfil. */
  moduloIntercecoesAtivo: boolean
  inspetores: Inspetor[]
  brigadas: Brigada[]
  estados: EstadoLike[]
}

interface RowProps {
  inq: Inquerito
  canBulk: boolean
  showBrigada: boolean
  showInspetor: boolean
  showDenunciante: boolean
  showPrazo: boolean
  moduloIntercecoesAtivo: boolean
  isSelected: boolean
  onToggle: (id: string) => void
}

const Row = memo(function Row({ inq, canBulk, showBrigada, showInspetor, showDenunciante, showPrazo, moduloIntercecoesAtivo, isSelected, onToggle }: RowProps) {
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
          {inq.cartaPrecatoria && (
            <Mail className="h-3.5 w-3.5 text-orange-500 shrink-0" aria-label="Carta Precatória" />
          )}
          {moduloIntercecoesAtivo && inq._count.intercecaoAlvos > 0 && (
            <RadioTower className="h-3.5 w-3.5 text-indigo-500 shrink-0" aria-label="Com interceções" />
          )}
        </Link>
        {inq.nai && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            NAI: {inq.nai}
          </p>
        )}
        {inq.etiquetas && inq.etiquetas.length > 0 && (
          <EtiquetaList etiquetas={inq.etiquetas} max={3} className="mt-1" />
        )}
      </td>
      <td className="px-4 py-3 max-w-[220px] truncate">
        {inq.crime?.nome ?? inq.natureza}
      </td>
      <td className="px-4 py-3">
        <EstadoBadge estado={inq.estado} />
      </td>
      {showBrigada && (
        <td className="px-4 py-3 text-muted-foreground">
          {inq.brigada?.nome ?? '—'}
        </td>
      )}
      {showInspetor && (
        <td className="px-4 py-3 text-muted-foreground">
          {inq.inspetor?.nome ?? <span className="text-muted-foreground/50 italic">Não atribuído</span>}
        </td>
      )}
      {showDenunciante && (
        <td className="px-4 py-3 text-muted-foreground">
          {inq.denuncianteNome ?? <span className="text-muted-foreground/50 italic">—</span>}
        </td>
      )}
      {showPrazo && (
        <td className={cn('px-4 py-3', overdue && 'text-red-600 font-medium')}>
          {formatDate(inq.dataPrazo)}
        </td>
      )}
      <td className="px-4 py-3 text-muted-foreground text-center">
        {inq._count.atividades}
      </td>
    </tr>
  )
})

export function InqueritoTable({ inqueritos, canBulk, canTransfer, showBrigada, showInspetor, showDenunciante, showPrazo, moduloIntercecoesAtivo, inspetores, brigadas, estados }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Mobile-only: indica se os cards estão em modo seleção. Activado por
  // long-press num card ou pelo botão explícito "Selecionar". Em desktop
  // os checkboxes da tabela são sempre visíveis, este estado é ignorado.
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false)

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

  // Sai do modo selecção mobile e limpa selecções de uma só vez —
  // chamado pelo botão X da BulkActionBar e pelo botão "Cancelar selecção".
  const clearSelected = useCallback(() => {
    setSelected(new Set())
    setMobileSelectionMode(false)
  }, [])

  // Long-press num card: entra em modo seleção e marca esse card.
  const handleLongPress = useCallback((id: string) => {
    setMobileSelectionMode(true)
    setSelected((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Crime</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              {showBrigada && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brigada</th>
              )}
              {showInspetor && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Inspetor</th>
              )}
              {showDenunciante && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Denunciante</th>
              )}
              {showPrazo && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Prazo</th>
              )}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ativ.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {inqueritos.length === 0 ? (
              <tr>
                <td
                  colSpan={(canBulk ? 5 : 4) + [showBrigada, showInspetor, showDenunciante, showPrazo].filter(Boolean).length}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Nenhum inquérito encontrado.
                </td>
              </tr>
            ) : (
              inqueritos.map((inq) => (
                <Row
                  key={inq.id}
                  inq={inq}
                  canBulk={canBulk}
                  showBrigada={showBrigada}
                  showInspetor={showInspetor}
                  showDenunciante={showDenunciante}
                  showPrazo={showPrazo}
                  moduloIntercecoesAtivo={moduloIntercecoesAtivo}
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
        {/* Toggle de modo selecção — alternativa acessível ao long-press.
            Só mostra se há permissões de bulk e existem inquéritos para
            seleccionar. */}
        {canBulk && inqueritos.length > 0 && (
          <div className="flex justify-end">
            {mobileSelectionMode ? (
              <Button
                size="sm"
                variant="outline"
                onClick={clearSelected}
                aria-pressed="true"
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar selecção
                {selected.size > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({selected.size})
                  </span>
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMobileSelectionMode(true)}
                aria-pressed="false"
                className="gap-1.5"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Selecionar
              </Button>
            )}
          </div>
        )}

        {inqueritos.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhum inquérito encontrado.</p>
        ) : (
          inqueritos.map((inq) => (
            <InqueritoCard
              key={inq.id}
              nuipc={inq.nuipc}
              nai={inq.nai}
              cartaPrecatoria={inq.cartaPrecatoria}
              temIntercecoes={moduloIntercecoesAtivo && inq._count.intercecaoAlvos > 0}
              natureza={inq.crime?.nome ?? inq.natureza}
              estado={inq.estado}
              etiquetas={inq.etiquetas}
              dataPrazo={inq.dataPrazo}
              showPrazo={showPrazo}
              inspetorNome={inspetorNomeLabel(inq, showInspetor, showDenunciante)}
              atividadesCount={inq._count.atividades}
              selectionMode={canBulk && mobileSelectionMode}
              isSelected={selected.has(inq.id)}
              onToggle={canBulk ? () => toggle(inq.id) : undefined}
              onLongPress={canBulk ? () => handleLongPress(inq.id) : undefined}
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
