/**
 * Opções de tamanho de página para a listagem de inquéritos. Partilhado entre a
 * página (server), o seletor (client), a API de perfil (validação) e a UI do
 * perfil, para que todos concordem no conjunto de valores permitidos.
 */
export const INQUERITO_PAGE_SIZES = [20, 50, 100, 250] as const

export type InqueritoPageSize = (typeof INQUERITO_PAGE_SIZES)[number]

/** Default do sistema quando o utilizador não tem preferência definida. */
export const DEFAULT_INQUERITO_PAGE_SIZE: InqueritoPageSize = 20

/** True se o valor for um dos tamanhos de página permitidos. */
export function isInqueritoPageSize(value: unknown): value is InqueritoPageSize {
  return (
    typeof value === 'number' &&
    (INQUERITO_PAGE_SIZES as readonly number[]).includes(value)
  )
}

/**
 * Normaliza um valor (string do URL, número da BD, etc.) para um tamanho de
 * página válido; se não for um dos permitidos, devolve `fallback`.
 */
export function normalizeInqueritoPageSize(
  value: unknown,
  fallback: number = DEFAULT_INQUERITO_PAGE_SIZE,
): number {
  const n =
    typeof value === 'string'
      ? parseInt(value, 10)
      : typeof value === 'number'
        ? value
        : NaN
  return isInqueritoPageSize(n) ? n : fallback
}
