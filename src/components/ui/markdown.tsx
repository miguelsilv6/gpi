import type { ReactNode } from 'react'

/**
 * Renderizador de Markdown leve e SEM dependências externas.
 *
 * Converte um subconjunto de Markdown (estilo Notion) em elementos React,
 * construídos a partir de tokens — nunca via `dangerouslySetInnerHTML` — pelo
 * que é seguro contra XSS mesmo com conteúdo introduzido pelo utilizador.
 *
 * Suporta: títulos (#/##/###), negrito, itálico, rasurado, código inline e em
 * bloco, links http(s), citações, listas com marcadores/numeradas, caixas de
 * verificação (- [ ] / - [x]) e linhas horizontais.
 */

// ---- Inline ----------------------------------------------------------------

interface InlineRule {
  re: RegExp
  render: (m: RegExpExecArray, key: string) => ReactNode
}

const INLINE_RULES: InlineRule[] = [
  // Código inline — primeiro, para não interpretar formatação no interior.
  {
    re: /`([^`]+)`/,
    render: (m, key) => (
      <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {m[1]}
      </code>
    ),
  },
  // Link [texto](http...)
  {
    re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/,
    render: (m, key) => (
      <a
        key={key}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 break-words"
      >
        {parseInline(m[1])}
      </a>
    ),
  },
  // Negrito **x** ou __x__
  {
    re: /\*\*([^*]+?)\*\*|__([^_]+?)__/,
    render: (m, key) => <strong key={key}>{parseInline(m[1] ?? m[2])}</strong>,
  },
  // Rasurado ~~x~~
  {
    re: /~~([^~]+?)~~/,
    render: (m, key) => <del key={key}>{parseInline(m[1])}</del>,
  },
  // Itálico *x* ou _x_
  {
    re: /\*([^*]+?)\*|_([^_]+?)_/,
    render: (m, key) => <em key={key}>{parseInline(m[1] ?? m[2])}</em>,
  },
]

function parseInline(text: string, keyPrefix = 'i'): ReactNode[] {
  if (!text) return []

  // Encontra a regra cuja ocorrência aparece mais cedo no texto.
  let best: { rule: InlineRule; match: RegExpExecArray } | null = null
  for (const rule of INLINE_RULES) {
    const re = new RegExp(rule.re.source, 'g')
    const match = re.exec(text)
    if (match && (!best || match.index < best.match.index)) {
      best = { rule, match }
    }
  }

  if (!best) return [text]

  const { rule, match } = best
  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  const nodes: ReactNode[] = []
  if (before) nodes.push(before)
  nodes.push(rule.render(match, `${keyPrefix}-${match.index}`))
  nodes.push(...parseInline(after, `${keyPrefix}-a${match.index}`))
  return nodes
}

// ---- Block -----------------------------------------------------------------

const HEADING_RE = /^(#{1,3})\s+(.*)$/
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE_RE = /^>\s?(.*)$/
const UL_RE = /^[-*]\s+(.*)$/
const CHECK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/
const OL_RE = /^(\d+)\.\s+(.*)$/

type ListItem = { content: string; checked?: boolean }

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Linha em branco → ignora (espaçamento gerido por classes).
    if (line.trim() === '') {
      i++
      continue
    }

    // Bloco de código ``` ... ```
    if (line.trimStart().startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        code.push(lines[i])
        i++
      }
      i++ // consome a fence de fecho
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono leading-relaxed"
        >
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Linha horizontal
    if (HR_RE.test(line)) {
      blocks.push(<hr key={key++} className="my-3 border-border" />)
      i++
      continue
    }

    // Título
    const heading = HEADING_RE.exec(line)
    if (heading) {
      const level = heading[1].length
      const text = heading[2]
      const cls =
        level === 1
          ? 'text-lg font-bold mt-2'
          : level === 2
            ? 'text-base font-semibold mt-2'
            : 'text-sm font-semibold mt-1'
      if (level === 1) blocks.push(<h3 key={key++} className={cls}>{parseInline(text)}</h3>)
      else if (level === 2) blocks.push(<h4 key={key++} className={cls}>{parseInline(text)}</h4>)
      else blocks.push(<h5 key={key++} className={cls}>{parseInline(text)}</h5>)
      i++
      continue
    }

    // Citação (linhas consecutivas com >)
    if (QUOTE_RE.test(line)) {
      const quote: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(QUOTE_RE.exec(lines[i])![1])
        i++
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-border pl-3 italic text-muted-foreground"
        >
          {parseInline(quote.join(' '))}
        </blockquote>,
      )
      continue
    }

    // Lista de verificação (checkboxes)
    if (CHECK_RE.test(line)) {
      const items: ListItem[] = []
      while (i < lines.length && CHECK_RE.test(lines[i])) {
        const m = CHECK_RE.exec(lines[i])!
        items.push({ content: m[2], checked: m[1].toLowerCase() === 'x' })
        i++
      }
      blocks.push(
        <ul key={key++} className="space-y-0.5">
          {items.map((it, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={!!it.checked}
                readOnly
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-primary"
              />
              <span className={it.checked ? 'line-through text-muted-foreground' : ''}>
                {parseInline(it.content)}
              </span>
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Lista com marcadores
    if (UL_RE.test(line)) {
      const items: string[] = []
      while (i < lines.length && UL_RE.test(lines[i]) && !CHECK_RE.test(lines[i])) {
        items.push(UL_RE.exec(lines[i])![1])
        i++
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-0.5">
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Lista numerada
    if (OL_RE.test(line)) {
      const items: string[] = []
      let start = parseInt(OL_RE.exec(line)![1], 10)
      if (!Number.isFinite(start) || start < 1) start = 1
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(OL_RE.exec(lines[i])![2])
        i++
      }
      blocks.push(
        <ol key={key++} start={start} className="list-decimal pl-5 space-y-0.5">
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // Parágrafo (linhas consecutivas até linha em branco ou outro bloco).
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !HR_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key++} className="leading-relaxed whitespace-pre-wrap break-words">
        {parseInline(para.join('\n'))}
      </p>,
    )
  }

  return <div className={`space-y-2 text-sm ${className ?? ''}`}>{blocks}</div>
}
