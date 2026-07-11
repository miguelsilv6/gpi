'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { filterNavItems, type NavModuleFlags } from './nav-items'
import type { Role } from '@/generated/prisma/enums'
import { Search, FolderOpen, NotebookPen, Activity, Paperclip, Loader2 } from 'lucide-react'

interface InqueritoHit {
  id: string
  nuipc: string
  slug: string
  crimeNome: string
  estadoNome: string
  inspetorNome: string | null
}
interface NotaHit {
  id: string
  nuipc: string
  slug: string
  titulo: string | null
  snippet: string
}
interface AtividadeHit {
  id: string
  nuipc: string
  slug: string
  descricao: string
  snippet: string
}
interface DocumentoHit {
  id: string
  nuipc: string
  slug: string
  filename: string
}

interface SearchState {
  inqueritos: InqueritoHit[]
  notas: NotaHit[]
  atividades: AtividadeHit[]
  documentos: DocumentoHit[]
}

const EMPTY: SearchState = { inqueritos: [], notas: [], atividades: [], documentos: [] }

interface CommandPaletteProps {
  role: Role
  modules?: NavModuleFlags
}

export function CommandPalette({ role, modules }: CommandPaletteProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchState>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const navItems = filterNavItems(role, modules)
  const term = query.trim()
  const navMatches = term
    ? navItems.filter((i) => i.label.toLowerCase().includes(term.toLowerCase()))
    : navItems

  // ⌘K / Ctrl+K abre e fecha a paleta de qualquer página.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent))
  }, [])

  // Pesquisa no servidor (debounce 250ms). Os atalhos de navegação são
  // resolvidos no cliente e não dependem deste efeito.
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (term.length < 2) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('search failed')
        const data = await res.json()
        setResults({
          inqueritos: Array.isArray(data.inqueritos) ? data.inqueritos : [],
          notas: Array.isArray(data.notas) ? data.notas : [],
          atividades: Array.isArray(data.atividades) ? data.atividades : [],
          documentos: Array.isArray(data.documentos) ? data.documentos : [],
        })
      } catch {
        // Abort ou erro de rede — mantém a lista atual em silêncio.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => {
      controller.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [term, open])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery('')
      setResults(EMPTY)
      router.push(href)
    },
    [router],
  )

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery('')
      setResults(EMPTY)
      setLoading(false)
    }
  }

  const kbd = isMac ? '⌘K' : 'Ctrl K'
  const { inqueritos, notas, atividades, documentos } = results

  return (
    <>
      {/* Trigger: campo de pesquisa em ecrãs largos, ícone em mobile. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="global-search"
        className="hidden md:flex items-center gap-2 h-9 w-56 lg:w-72 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Pesquisar…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          {kbd}
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center size-8 rounded-lg hover:bg-muted transition-colors"
      >
        <Search className="h-5 w-5" />
        <span className="sr-only">Pesquisar</span>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        className="sm:max-w-3xl"
        title="Pesquisa global"
        description="Pesquisar inquéritos, notas, atividades e documentos, ou navegar entre páginas"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Pesquisar inquéritos, notas, atividades, documentos ou páginas…"
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? 'A pesquisar…'
                : term.length < 2
                  ? 'Escreva pelo menos 2 caracteres para pesquisar.'
                  : 'Nada encontrado.'}
            </CommandEmpty>

            {navMatches.length > 0 && (
              <CommandGroup heading="Navegação">
                {navMatches.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`nav:${item.href}`}
                    onSelect={() => go(item.href)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {inqueritos.length > 0 && (
              <CommandGroup heading="Inquéritos">
                {inqueritos.map((inq) => (
                  <CommandItem
                    key={inq.id}
                    value={`inq:${inq.id}`}
                    onSelect={() => go(`/inqueritos/${inq.slug}`)}
                  >
                    <FolderOpen className="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm truncate">{inq.nuipc}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {inq.crimeNome}
                        {inq.inspetorNome ? ` · ${inq.inspetorNome}` : ''}
                      </p>
                    </div>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {inq.estadoNome}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {notas.length > 0 && (
              <CommandGroup heading="Notas">
                {notas.map((nota) => (
                  <CommandItem
                    key={nota.id}
                    value={`nota:${nota.id}`}
                    onSelect={() => go(`/inqueritos/${nota.slug}`)}
                  >
                    <NotebookPen className="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{nota.titulo || nota.snippet || 'Nota'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="font-mono">{nota.nuipc}</span>
                        {nota.titulo && nota.snippet ? ` · ${nota.snippet}` : ''}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {atividades.length > 0 && (
              <CommandGroup heading="Atividades">
                {atividades.map((at) => (
                  <CommandItem
                    key={at.id}
                    value={`atividade:${at.id}`}
                    onSelect={() => go(`/inqueritos/${at.slug}`)}
                  >
                    <Activity className="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{at.descricao}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="font-mono">{at.nuipc}</span>
                        {at.snippet ? ` · ${at.snippet}` : ''}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {documentos.length > 0 && (
              <CommandGroup heading="Documentos">
                {documentos.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    value={`documento:${doc.id}`}
                    onSelect={() => go(`/inqueritos/${doc.slug}`)}
                  >
                    <Paperclip className="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground truncate font-mono">{doc.nuipc}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                A pesquisar…
              </div>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
