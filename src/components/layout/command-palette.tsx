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
import { Search, FolderOpen, Loader2 } from 'lucide-react'

interface InqueritoHit {
  id: string
  nuipc: string
  slug: string
  crimeNome: string
  estadoNome: string
  inspetorNome: string | null
}

interface CommandPaletteProps {
  role: Role
  modules?: NavModuleFlags
}

export function CommandPalette({ role, modules }: CommandPaletteProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [inqueritos, setInqueritos] = useState<InqueritoHit[]>([])
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

  // Pesquisa de inquéritos no servidor (debounce 250ms). Atalhos de navegação
  // são resolvidos no cliente e não dependem deste efeito.
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (term.length < 2) {
      setInqueritos([])
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
        setInqueritos(Array.isArray(data.inqueritos) ? data.inqueritos : [])
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
      setInqueritos([])
      router.push(href)
    },
    [router],
  )

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery('')
      setInqueritos([])
      setLoading(false)
    }
  }

  const kbd = isMac ? '⌘K' : 'Ctrl K'

  return (
    <>
      {/* Trigger: campo de pesquisa em ecrãs largos, ícone em mobile. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
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
        title="Pesquisa global"
        description="Pesquisar inquéritos e navegar entre páginas"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Pesquisar inquéritos (NUIPC, denunciante, etiqueta) ou páginas…"
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? 'A pesquisar…'
                : term.length < 2
                  ? 'Escreva pelo menos 2 caracteres para pesquisar inquéritos.'
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
