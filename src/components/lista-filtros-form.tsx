import Link from 'next/link'
import { Download, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  /** Página da lista (ex.: `/apreensoes`). */
  action: string
  /** Parâmetros a preservar (ex.: `estado`), enviados como campos ocultos. */
  manter?: Record<string, string | undefined>
  q?: string
  de?: string
  ate?: string
  /** Rótulo do intervalo de datas (ex.: "Data de apreensão"). */
  rotuloData: string
  placeholder: string
  /** URL da exportação CSV com os filtros atuais (omitir para esconder o botão). */
  exportHref?: string
}

/**
 * Barra de filtros das listagens globais: texto livre + intervalo de datas
 * (GET, sem JS) e botão de exportação CSV com os mesmos filtros.
 */
export function ListaFiltrosForm({ action, manter, q, de, ate, rotuloData, placeholder, exportHref }: Props) {
  const temFiltros = !!(q || de || ate)
  const limparParams = new URLSearchParams(
    Object.entries(manter ?? {}).filter((e): e is [string, string] => !!e[1]),
  ).toString()
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      {Object.entries(manter ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="relative min-w-[14rem] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-8" maxLength={100} />
      </div>
      <fieldset className="flex items-end gap-2">
        <legend className="sr-only">{rotuloData}</legend>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{rotuloData} — de</span>
          <Input type="date" name="de" defaultValue={de} className="w-[9.5rem]" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">até</span>
          <Input type="date" name="ate" defaultValue={ate} className="w-[9.5rem]" />
        </label>
      </fieldset>
      <Button type="submit" size="sm" variant="outline" className="h-9">
        Filtrar
      </Button>
      {temFiltros && (
        <Link
          href={limparParams ? `${action}?${limparParams}` : action}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> Limpar
        </Link>
      )}
      {exportHref && (
        <a
          href={exportHref}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </a>
      )}
    </form>
  )
}
