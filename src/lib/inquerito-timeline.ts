/**
 * Cronologia unificada de um inquérito — intercala, numa única linha temporal,
 * as fontes que a página de detalhe já mostra em secções separadas:
 *
 *   abertura · mudanças de estado · atividades · notas · documentos ·
 *   tarefas (pessoais) · diligências
 *
 * Função PURA: recebe dados já carregados (e já scoped pela página — as
 * tarefas são só do próprio, as notas/documentos exatamente os que a página
 * apresenta) e devolve eventos ordenados do mais recente para o mais antigo.
 * Sem imports de Prisma/NextAuth para ser testável em isolamento.
 */

export type TimelineEventTipo =
  | 'abertura'
  | 'estado'
  | 'atividade'
  | 'nota'
  | 'documento'
  | 'tarefa'
  | 'diligencia'

export interface TimelineEvent {
  /** Chave estável para render (tipo + id de origem). */
  key: string
  tipo: TimelineEventTipo
  /** ISO datetime do evento. */
  at: string
  /** True quando a origem só tem dia (sem hora com significado). */
  dateOnly: boolean
  titulo: string
  detalhe?: string
  autorNome?: string | null
}

export interface TimelineSources {
  abertura: { dataAbertura: string; crimeNome: string | null } | null
  estados: { at: string; estadoNome: string; porNome: string | null; motivo?: string }[]
  atividades: {
    id: string
    descricao: string
    dataRealizacao: string
    quantidade: number | null
    autorNome: string | null
  }[]
  notas: { id: string; titulo: string | null; conteudo: string; createdAt: string; autorNome: string }[]
  documentos: { id: string; filename: string; createdAt: string; autorNome: string | null }[]
  tarefas: { id: string; titulo: string; createdAt: string; concluida: boolean }[]
  diligencias: {
    id: string
    titulo: string
    dataInicio: string
    local: string | null
    autorNome: string | null
  }[]
}

const EXCERPT_MAX = 140

/**
 * Excerto de uma nota para a linha secundária: remove a sintaxe Markdown mais
 * ruidosa e colapsa linhas — o conteúdo completo continua na secção de Notas.
 */
export function excerpt(text: string, max = EXCERPT_MAX): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_~`]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1).trimEnd()}…`
}

export function mergeTimelineEvents(src: TimelineSources): TimelineEvent[] {
  const events: TimelineEvent[] = []

  if (src.abertura) {
    events.push({
      key: 'abertura',
      tipo: 'abertura',
      at: src.abertura.dataAbertura,
      dateOnly: true,
      titulo: 'Inquérito aberto',
      ...(src.abertura.crimeNome ? { detalhe: src.abertura.crimeNome } : {}),
    })
  }

  src.estados.forEach((e, i) => {
    events.push({
      key: `estado:${i}:${e.at}`,
      tipo: 'estado',
      at: e.at,
      dateOnly: false,
      titulo: `Estado: ${e.estadoNome}`,
      ...(e.motivo ? { detalhe: e.motivo } : {}),
      autorNome: e.porNome,
    })
  })

  for (const a of src.atividades) {
    const qtd = a.quantidade != null && a.quantidade > 1 ? ` ×${a.quantidade}` : ''
    events.push({
      key: `atividade:${a.id}`,
      tipo: 'atividade',
      at: a.dataRealizacao,
      dateOnly: true,
      titulo: `${a.descricao}${qtd}`,
      autorNome: a.autorNome,
    })
  }

  for (const n of src.notas) {
    events.push({
      key: `nota:${n.id}`,
      tipo: 'nota',
      at: n.createdAt,
      dateOnly: false,
      titulo: n.titulo?.trim() ? n.titulo : 'Nota de investigação',
      detalhe: excerpt(n.conteudo),
      autorNome: n.autorNome,
    })
  }

  for (const d of src.documentos) {
    events.push({
      key: `documento:${d.id}`,
      tipo: 'documento',
      at: d.createdAt,
      dateOnly: false,
      titulo: d.filename,
      detalhe: 'Documento anexado',
      autorNome: d.autorNome,
    })
  }

  for (const t of src.tarefas) {
    events.push({
      key: `tarefa:${t.id}`,
      tipo: 'tarefa',
      at: t.createdAt,
      dateOnly: false,
      titulo: t.titulo,
      detalhe: t.concluida ? 'Tarefa pessoal — concluída' : 'Tarefa pessoal',
    })
  }

  for (const d of src.diligencias) {
    events.push({
      key: `diligencia:${d.id}`,
      tipo: 'diligencia',
      at: d.dataInicio,
      dateOnly: false,
      titulo: d.titulo,
      ...(d.local ? { detalhe: d.local } : {}),
      autorNome: d.autorNome,
    })
  }

  // Mais recente primeiro; empates resolvidos pela chave para ordem estável.
  events.sort((a, b) => (a.at === b.at ? a.key.localeCompare(b.key) : b.at.localeCompare(a.at)))
  return events
}

/**
 * Agrupa eventos (já ordenados desc) por dia de calendário local — a UI
 * renderiza um cabeçalho por dia. A chave é YYYY-MM-DD local.
 */
export function groupEventsByDay(events: TimelineEvent[]): { day: string; events: TimelineEvent[] }[] {
  const groups: { day: string; events: TimelineEvent[] }[] = []
  for (const ev of events) {
    const d = new Date(ev.at)
    const pad = (n: number) => String(n).padStart(2, '0')
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.events.push(ev)
    else groups.push({ day, events: [ev] })
  }
  return groups
}
