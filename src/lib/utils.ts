import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UUID v4 para uso no cliente, seguro em qualquer contexto.
 *
 * `crypto.randomUUID()` só está disponível em secure contexts (HTTPS ou
 * localhost). Em deploys self-hosted acedidos por HTTP numa LAN
 * (ex: http://192.168.x.x:3000) o método é `undefined` e lança erro —
 * o que silenciava o botão "Atualizar agora". Fallback via Math.random
 * (não-criptográfico, mas suficiente para um Idempotency-Key).
 */
export function clientRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
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
