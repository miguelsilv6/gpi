import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Classes base para botões-ícone em tabelas / linhas (edit, delete, etc).
 * MOBILE-A11Y: garante tap area 44×44 em touch devices (pointer:coarse)
 * mantendo o visual compacto 28×28 em desktop com rato. Substitui o
 * anti-pattern `p-1.5 rounded hover:bg-...` que dava ~20px.
 *
 * Uso: `<button className={cn(iconButtonClasses, 'text-red-500 hover:text-red-700')}>`
 */
export const iconButtonClasses =
  'h-7 w-7 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 ' +
  'inline-flex items-center justify-center rounded hover:bg-muted transition-colors'

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

/** Like formatDateTime, but includes seconds. Used for the atividade
 *  "data de inserção" so the operator can distinguish entries created
 *  within the same minute. */
export function formatDateTimeWithSeconds(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export function isOverdue(dataPrazo: Date | string | null | undefined): boolean {
  if (!dataPrazo) return false
  return new Date(dataPrazo) < new Date()
}

export function nuipcToSlug(nuipc: string): string {
  return nuipc.replace(/\//g, '~')
}

export function slugToNuipc(slug: string): string {
  return slug.replace(/~/g, '/')
}
