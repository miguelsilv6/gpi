'use client'

import { ArrowRight } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import { labelFor, DATE_FIELDS, DATETIME_FIELDS } from './audit-labels'

/**
 * Renderiza `detalhes` JSON de uma entry do audit log. Adapta-se ao
 * shape:
 *
 *  - `{changed, before, after}` (diff helper de `src/lib/audit.ts`)
 *    → lista campo-a-campo com antes/depois marcados a vermelho/verde.
 *
 *  - `{changes: {tipo: {before, after}}}` (UPDATE_NOTIFICATION_POLICIES)
 *    → grupo por tipo com diff aninhado.
 *
 *  - Outro objecto plano `{key: value}` (CREATE_*, DELETE_*, EXPORT_*,
 *    BULK_*, BACKUP_*) → lista key→value formatada.
 *
 *  - `null`/vazio → placeholder informativo.
 *
 * Reusado por:
 *   - `audit-history.tsx` (histórico do inquérito; expand inline)
 *   - `audit-detail-dialog.tsx` (página global /auditlog; modal)
 */

export function DiffRenderer({ detalhes }: { detalhes: unknown }) {
  if (!detalhes || typeof detalhes !== 'object') {
    return <p className="text-xs text-muted-foreground italic">Sem detalhes registados.</p>
  }
  const d = detalhes as Record<string, unknown>

  // Case 1: diff-shaped {changed, before, after}
  if (isDiffShape(d)) {
    if (d.changed.length === 0) {
      return <p className="text-xs text-muted-foreground italic">Sem alterações registadas.</p>
    }
    return <DiffList changed={d.changed} before={d.before} after={d.after} />
  }

  // Case 2: notification-policies shape {changes: {tipo: {before, after}}}
  if (isPolicyChangesShape(d)) {
    return <PolicyChangesRenderer changes={d.changes} />
  }

  // Case 3: flat key→value
  const entries = Object.entries(d).filter(
    ([k, v]) =>
      k !== 'changed' &&
      k !== 'before' &&
      k !== 'after' &&
      v !== null &&
      v !== undefined &&
      v !== '',
  )
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sem detalhes registados.</p>
  }
  return <KeyValueList entries={entries} />
}

// ─── Sub-renderers ───────────────────────────────────────────────────────────

function DiffList({
  changed,
  before,
  after,
}: {
  changed: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
}) {
  return (
    <ul className="space-y-1.5 text-xs">
      {changed.map((field) => (
        <li key={field} className="flex items-start gap-2 flex-wrap">
          <span className="font-medium text-muted-foreground min-w-[120px]">
            {labelFor(field)}
          </span>
          <span className="font-mono bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200 px-1.5 rounded">
            {formatValue(field, before[field])}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground self-center" />
          <span className="font-mono bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200 px-1.5 rounded">
            {formatValue(field, after[field])}
          </span>
        </li>
      ))}
    </ul>
  )
}

function PolicyChangesRenderer({
  changes,
}: {
  changes: Record<string, { before: Record<string, unknown> | null; after: Record<string, unknown> }>
}) {
  const entries = Object.entries(changes)
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sem alterações de policy.</p>
  }
  return (
    <ul className="space-y-3 text-xs">
      {entries.map(([tipo, change]) => {
        const before = change.before ?? {}
        const after = change.after ?? {}
        const keys = new Set([...Object.keys(before), ...Object.keys(after)])
        const changedKeys = [...keys].filter(
          (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
        )
        return (
          <li key={tipo} className="space-y-1">
            <div className="font-medium text-foreground">{tipo}</div>
            <ul className="ml-3 space-y-1">
              {changedKeys.map((k) => (
                <li key={k} className="flex items-start gap-2 flex-wrap">
                  <span className="font-medium text-muted-foreground min-w-[80px]">
                    {labelFor(k)}
                  </span>
                  <span className="font-mono bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200 px-1.5 rounded">
                    {formatValue(k, before[k])}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground self-center" />
                  <span className="font-mono bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200 px-1.5 rounded">
                    {formatValue(k, after[k])}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

function KeyValueList({ entries }: { entries: [string, unknown][] }) {
  return (
    <ul className="space-y-1 text-xs">
      {entries.map(([k, v]) => (
        <li key={k} className="flex items-start gap-2 flex-wrap">
          <span className="font-medium text-muted-foreground min-w-[120px]">
            {labelFor(k)}
          </span>
          <span className={isLongString(v) ? 'font-mono whitespace-pre-wrap break-all' : 'font-mono'}>
            {formatValue(k, v)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDiffShape(d: Record<string, unknown>): d is {
  changed: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
} {
  return (
    Array.isArray(d.changed) &&
    typeof d.before === 'object' &&
    d.before !== null &&
    typeof d.after === 'object' &&
    d.after !== null
  )
}

function isPolicyChangesShape(d: Record<string, unknown>): d is {
  changes: Record<string, { before: Record<string, unknown> | null; after: Record<string, unknown> }>
} {
  return (
    typeof d.changes === 'object' &&
    d.changes !== null &&
    !Array.isArray(d.changes) &&
    Object.keys(d).length === 1 // só `changes`, sem outros campos
  )
}

function isLongString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 80
}

/** Pretty-print de um valor único. */
export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) {
    if (value.length === 0) return '(vazio)'
    return value.join(', ')
  }
  if (DATETIME_FIELDS.has(field) && typeof value === 'string') {
    return formatDateTime(value)
  }
  if (DATE_FIELDS.has(field) && (typeof value === 'string' || value instanceof Date)) {
    return formatDate(value as string | Date)
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return '[objecto]'
    }
  }
  return String(value)
}
