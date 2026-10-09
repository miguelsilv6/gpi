/**
 * Filtros de texto/intervalo de datas das listagens globais (Apreensões,
 * Perícias) — partilhados pela página e pela rota de exportação, para o CSV
 * corresponder exatamente ao que a lista mostra.
 */
export interface FiltrosLista {
  q: string
  de: Date | null
  ate: Date | null
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/

function dia(s: string | null | undefined, fimDoDia: boolean): Date | null {
  if (!s || !ISO_DIA.test(s)) return null
  const d = new Date(`${s}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseFiltrosLista(get: (k: string) => string | null | undefined): FiltrosLista {
  return {
    q: (get('q') ?? '').trim().slice(0, 100),
    de: dia(get('de'), false),
    ate: dia(get('ate'), true),
  }
}

/** Parâmetros de URL (só os preenchidos) — para links de paginação/exportação. */
export function filtrosParams(sp: { q?: string; de?: string; ate?: string }): URLSearchParams {
  const p = new URLSearchParams()
  if (sp.q?.trim()) p.set('q', sp.q.trim())
  if (sp.de && ISO_DIA.test(sp.de)) p.set('de', sp.de)
  if (sp.ate && ISO_DIA.test(sp.ate)) p.set('ate', sp.ate)
  return p
}
