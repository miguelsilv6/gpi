/**
 * Data/hora no formato `dd-mm-aaaa hh:mm:ss` usado no "acompanhado até" das
 * interceções.
 *
 * O valor é uma hora "de parede" (sem fuso): guarda-se num `DateTime` cujos
 * campos UTC são exatamente o que o utilizador escreveu — o mesmo critério de
 * `IntercecaoProduto.data` (+ `horaInicio`), para que se comparem sem
 * conversões de fuso horário. Por isso aqui usa-se sempre `getUTC*`/`Date.UTC`.
 */

const RE = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/

const pad = (n: number) => String(n).padStart(2, '0')

/** `dd-mm-aaaa hh:mm:ss` → Date (campos UTC = hora de parede); null se inválido. */
export function parseDataHoraPt(raw: string): Date | null {
  const m = RE.exec(raw.trim())
  if (!m) return null
  const [dd, mm, yyyy, hh, mi, ss] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number)
  if (mm < 1 || mm > 12 || dd < 1 || hh > 23 || mi > 59 || ss > 59) return null
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, ss))
  // Rejeita datas inexistentes (ex.: 31-02-2026 transbordaria para março).
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null
  return d
}

/** Date (hora de parede em UTC) → `dd-mm-aaaa hh:mm:ss`. */
export function formatDataHoraPt(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return (
    `${pad(x.getUTCDate())}-${pad(x.getUTCMonth() + 1)}-${x.getUTCFullYear()} ` +
    `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`
  )
}

/** "Agora" como hora de parede local (para preencher o campo). */
export function agoraDataHoraPt(now: Date = new Date()): string {
  return (
    `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  )
}

/**
 * Momento de um produto na mesma base (hora de parede): `data` (dia, meia-noite
 * UTC) + `horaInicio` ("HH:mm" ou "HH:mm:ss"); sem hora conta como início do dia.
 */
export function momentoProduto(data: Date, horaInicio: string | null | undefined): Date {
  const base = Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
  const m = horaInicio ? /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(horaInicio.trim()) : null
  if (!m) return new Date(base)
  return new Date(base + (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)) * 1000)
}
