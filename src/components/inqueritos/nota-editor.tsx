'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Link2,
  Eye,
  Pencil,
  type LucideIcon,
} from 'lucide-react'

/** Bloco do menu "/" (estilo Notion). */
interface SlashBlock {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  /** Prefixo aplicado no início da linha. */
  prefix: string
}

const SLASH_BLOCKS: SlashBlock[] = [
  { id: 'h1', label: 'Título', hint: 'Cabeçalho grande', icon: Heading1, prefix: '# ' },
  { id: 'h2', label: 'Subtítulo', hint: 'Cabeçalho médio', icon: Heading2, prefix: '## ' },
  { id: 'ul', label: 'Lista', hint: 'Marcadores', icon: List, prefix: '- ' },
  { id: 'ol', label: 'Lista numerada', hint: '1. 2. 3.', icon: ListOrdered, prefix: '1. ' },
  { id: 'todo', label: 'Tarefas', hint: 'Caixas de verificação', icon: CheckSquare, prefix: '- [ ] ' },
  { id: 'quote', label: 'Citação', hint: 'Texto destacado', icon: Quote, prefix: '> ' },
  { id: 'code', label: 'Código', hint: 'Bloco monoespaçado', icon: Code, prefix: '```\n' },
]

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  placeholder?: string
  autoFocus?: boolean
  minRows?: number
}

export function NotaEditor({
  value,
  onChange,
  onSubmit,
  placeholder = 'Escreva uma nota… use a barra de formatação ou "/" para inserir blocos.',
  autoFocus,
  minRows = 5,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [slash, setSlash] = useState<{ query: string; from: number } | null>(null)
  const [slashIdx, setSlashIdx] = useState(0)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const filteredBlocks = slash
    ? SLASH_BLOCKS.filter(
        (b) =>
          b.label.toLowerCase().includes(slash.query.toLowerCase()) ||
          b.hint.toLowerCase().includes(slash.query.toLowerCase()),
      )
    : []

  /** Envolve a seleção atual com `prefix`/`suffix` (ex.: **negrito**). */
  function wrap(prefix: string, suffix = prefix, placeholderText = 'texto') {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || placeholderText
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    })
  }

  /** Insere `prefix` no início da linha onde está o cursor. */
  function prefixLine(prefix: string) {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + prefix.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function insertLink() {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || 'texto'
    const snippet = `[${selected}](https://)`
    const next = value.slice(0, start) + snippet + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      // Coloca o cursor dentro de (https://) para o utilizador escrever o URL.
      const urlPos = start + selected.length + 3
      ta.setSelectionRange(urlPos + 8, urlPos + 8)
    })
  }

  /** Deteta um gatilho "/" no início de uma linha para abrir o menu de blocos. */
  function detectSlash(ta: HTMLTextAreaElement) {
    const caret = ta.selectionStart
    const before = value.slice(0, caret)
    const m = /(?:^|\n)\/(\w*)$/.exec(before)
    if (m) {
      setSlash({ query: m[1], from: caret - m[1].length - 1 })
      setSlashIdx(0)
    } else {
      setSlash(null)
    }
  }

  function applySlashBlock(block: SlashBlock) {
    const ta = ref.current
    if (!ta || !slash) return
    const caret = ta.selectionStart
    // Remove o "/query" e aplica o prefixo do bloco no seu lugar.
    const next = value.slice(0, slash.from) + block.prefix + value.slice(caret)
    onChange(next)
    setSlash(null)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = slash.from + block.prefix.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Navegação no menu "/"
    if (slash && filteredBlocks.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIdx((p) => (p + 1) % filteredBlocks.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIdx((p) => (p - 1 + filteredBlocks.length) % filteredBlocks.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applySlashBlock(filteredBlocks[slashIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlash(null)
        return
      }
    }

    // Atalhos de formatação
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault()
        wrap('**')
        return
      }
      if (e.key === 'i') {
        e.preventDefault()
        wrap('*')
        return
      }
      if (e.key === 'Enter' && onSubmit) {
        e.preventDefault()
        onSubmit()
        return
      }
    }
  }

  const toolbar: { icon: LucideIcon; title: string; action: () => void }[] = [
    { icon: Bold, title: 'Negrito (Ctrl+B)', action: () => wrap('**') },
    { icon: Italic, title: 'Itálico (Ctrl+I)', action: () => wrap('*') },
    { icon: Strikethrough, title: 'Rasurado', action: () => wrap('~~') },
    { icon: Code, title: 'Código inline', action: () => wrap('`', '`', 'código') },
    { icon: Heading1, title: 'Título', action: () => prefixLine('# ') },
    { icon: Heading2, title: 'Subtítulo', action: () => prefixLine('## ') },
    { icon: List, title: 'Lista', action: () => prefixLine('- ') },
    { icon: ListOrdered, title: 'Lista numerada', action: () => prefixLine('1. ') },
    { icon: CheckSquare, title: 'Tarefas', action: () => prefixLine('- [ ] ') },
    { icon: Quote, title: 'Citação', action: () => prefixLine('> ') },
    { icon: Link2, title: 'Link', action: insertLink },
  ]

  return (
    <div className="rounded-md border bg-background">
      {/* Barra de ferramentas */}
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1 flex-wrap">
        {toolbar.map((t, idx) => (
          <button
            key={idx}
            type="button"
            title={t.title}
            aria-label={t.title}
            disabled={tab === 'preview'}
            onClick={t.action}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <t.icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={tab === 'write' ? 'secondary' : 'ghost'}
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setTab('write')}
          >
            <Pencil className="h-3 w-3" /> Escrever
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === 'preview' ? 'secondary' : 'ghost'}
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setTab('preview')}
          >
            <Eye className="h-3 w-3" /> Pré-visualizar
          </Button>
        </div>
      </div>

      {tab === 'write' ? (
        <div className="relative">
          <textarea
            ref={ref}
            value={value}
            rows={minRows}
            placeholder={placeholder}
            onChange={(e) => {
              onChange(e.target.value)
              detectSlash(e.target)
            }}
            onKeyUp={(e) => detectSlash(e.currentTarget)}
            onClick={(e) => detectSlash(e.currentTarget)}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setSlash(null), 150)}
            className="w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />

          {/* Menu "/" */}
          {slash && filteredBlocks.length > 0 && (
            <div className="absolute left-3 top-2 z-20 w-60 overflow-hidden rounded-md border bg-popover shadow-md">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Inserir bloco
              </p>
              {filteredBlocks.map((b, idx) => (
                <button
                  key={b.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applySlashBlock(b)
                  }}
                  onMouseEnter={() => setSlashIdx(idx)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                    idx === slashIdx ? 'bg-accent text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <b.icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium text-foreground">{b.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{b.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-[120px] px-3 py-2.5">
          {value.trim() ? (
            <Markdown content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nada para pré-visualizar.</p>
          )}
        </div>
      )}
    </div>
  )
}
