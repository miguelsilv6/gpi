'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/ui/markdown'
import { Search, StickyNote, FolderOpen, ArrowUpRight } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export interface NotaBrowserItem {
  id: string
  titulo: string | null
  conteudo: string
  createdAt: string
  updatedAt: string
  autorNome: string
  editadoPorNome: string | null
  inquerito: { nuipc: string; slug: string; natureza: string | null }
}

interface Props {
  notas: NotaBrowserItem[]
  total: number
  truncated: boolean
}

export function NotasBrowser({ notas, total, truncated }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notas
    return notas.filter(
      (n) =>
        n.conteudo.toLowerCase().includes(q) ||
        (n.titulo?.toLowerCase().includes(q) ?? false) ||
        n.inquerito.nuipc.toLowerCase().includes(q) ||
        n.autorNome.toLowerCase().includes(q),
    )
  }, [notas, query])

  // Agrupa por inquérito, preservando a ordem (mais recente primeiro).
  const groups = useMemo(() => {
    const map = new Map<string, { nuipc: string; slug: string; natureza: string | null; notas: NotaBrowserItem[] }>()
    for (const n of filtered) {
      const key = n.inquerito.nuipc
      if (!map.has(key)) {
        map.set(key, {
          nuipc: n.inquerito.nuipc,
          slug: n.inquerito.slug,
          natureza: n.inquerito.natureza,
          notas: [],
        })
      }
      map.get(key)!.notas.push(n)
    }
    return Array.from(map.values())
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar por conteúdo, título, NUIPC ou autor…"
          className="pl-9"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'nota' : 'notas'}
        {query ? ` de ${total}` : ''} · {groups.length} {groups.length === 1 ? 'inquérito' : 'inquéritos'}
        {truncated && !query && ' · a mostrar as mais recentes'}
      </p>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <StickyNote className="mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm">
            {query ? 'Nenhuma nota corresponde à pesquisa.' : 'Ainda não existem notas registadas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.nuipc}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{g.nuipc}</span>
                    {g.natureza && (
                      <span className="truncate text-xs font-normal text-muted-foreground">· {g.natureza}</span>
                    )}
                  </span>
                  <Link
                    href={`/inqueritos/${g.slug}`}
                    className="flex shrink-0 items-center gap-1 text-xs font-normal text-primary hover:underline"
                  >
                    Abrir <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {g.notas.map((n) => {
                  const wasEdited = n.updatedAt !== n.createdAt
                  return (
                    <div key={n.id} className="rounded-lg border bg-muted/20 px-3 py-2.5">
                      {n.titulo && <p className="text-sm font-semibold break-words mb-1">{n.titulo}</p>}
                      <Markdown content={n.conteudo} />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {n.autorNome} · {formatDateTime(n.createdAt)}
                        {wasEdited && (
                          <span className="italic">
                            {' · editado'}
                            {n.editadoPorNome && n.editadoPorNome !== n.autorNome
                              ? ` por ${n.editadoPorNome}`
                              : ''}{' '}
                            {formatDateTime(n.updatedAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
