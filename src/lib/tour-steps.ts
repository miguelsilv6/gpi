import type { DriveStep } from 'driver.js'
import type { Role } from '@/generated/prisma/enums'
import { filterNavItems, type NavModuleFlags } from '@/components/layout/nav-items'

/** Evento global para (re)arrancar a tour a partir de qualquer sítio (ex.: Perfil). */
export const START_TOUR_EVENT = 'gpi:start-tour'

/**
 * Descrições (PT-PT) por item de navegação. A tour só inclui os passos cujo
 * item o utilizador realmente vê (depende do role e dos módulos ativos), pelo
 * que nunca aponta para algo que não está no ecrã.
 */
const NAV_TOUR: { href: string; title: string; description: string }[] = [
  { href: '/dashboard', title: 'Dashboard', description: 'O teu ponto de partida: o resumo do dia, prazos a chegar e atalhos rápidos.' },
  { href: '/inqueritos', title: 'Inquéritos', description: 'Pesquisar, filtrar e abrir os processos. É aqui que passas a maior parte do tempo — cada inquérito reúne atividades, documentos, notas, intervenientes e muito mais.' },
  { href: '/documentacao-pendente', title: 'Documentação pendente', description: 'Inquéritos já enviados mas à espera de documentação por juntar. A lista é privada — só vês as marcas que fizeste.' },
  { href: '/notas', title: 'Notas', description: 'As tuas notas de inquérito reunidas num só sítio, com pesquisa.' },
  { href: '/tarefas', title: 'Tarefas', description: 'A tua lista de tarefas pendentes, ordenada por prioridade.' },
  { href: '/prazos', title: 'Prazos e controlos', description: 'O que está a chegar a prazo e os controlos periódicos que defines por inquérito.' },
  { href: '/agenda', title: 'Agenda', description: 'Diligências e eventos marcados, numa vista de calendário.' },
  { href: '/intercecoes', title: 'Interceções', description: 'Controlo de escutas: alvos, linhas e produtos de interceção, com alertas de fim de prazo.' },
  { href: '/estatisticas', title: 'Estatísticas', description: 'Indicadores e repartições — por estado, brigada, crime, comarca e mais.' },
  { href: '/minha-estatistica', title: 'A tua estatística', description: 'Os teus números pessoais de atividade e produção.' },
  { href: '/estatistica-mensal', title: 'Estatística mensal', description: 'Mapa mensal de produção da unidade.' },
  { href: '/relatorios', title: 'Relatórios', description: 'Exportações e mapas prontos para impressão ou análise.' },
  { href: '/ajudas-mensais', title: 'Ajudas mensais', description: 'Cálculo das ajudas de custo mensais.' },
  { href: '/ausencias', title: 'Ausências', description: 'Marcação de férias, folgas e outras ausências.' },
  { href: '/brigadas', title: 'Brigadas', description: 'Gestão das brigadas e das respetivas equipas.' },
  { href: '/utilizadores', title: 'Utilizadores', description: 'Gestão de contas e perfis de acesso.' },
  { href: '/configuracoes', title: 'Configurações', description: 'Módulos opcionais, notificações e definições do sistema.' },
]

/**
 * Constrói a sequência de passos da visita guiada, adaptada ao perfil: começa
 * com uma boas-vindas, passa pela pesquisa rápida, pelos itens de menu visíveis
 * e termina nas notificações e no perfil. Função pura (testável).
 */
export function buildTourSteps(role: Role, modules: NavModuleFlags = {}): DriveStep[] {
  const visiveis = new Set(filterNavItems(role, modules).map((i) => i.href))
  const steps: DriveStep[] = []

  steps.push({
    popover: {
      title: 'Bem-vindo ao GPI 👋',
      description:
        'Esta visita guiada rápida mostra as principais funcionalidades da aplicação. Podes saltá-la a qualquer momento — e voltar a vê-la mais tarde no teu Perfil.',
    },
  })

  steps.push({
    element: '[data-tour="global-search"]',
    popover: {
      title: 'Pesquisa rápida',
      description: 'Carrega Ctrl/⌘ + K (ou clica aqui) para saltar rapidamente para qualquer inquérito ou página.',
      side: 'bottom',
      align: 'start',
    },
  })

  for (const item of NAV_TOUR) {
    if (!visiveis.has(item.href)) continue
    steps.push({
      element: `[data-tour="nav:${item.href}"]`,
      popover: { title: item.title, description: item.description, side: 'right', align: 'start' },
    })
  }

  steps.push({
    element: '[data-tour="notifications"]',
    popover: {
      title: 'Notificações',
      description: 'Alertas de prazos a terminar, autorizações e avisos do sistema aparecem aqui.',
      side: 'bottom',
      align: 'end',
    },
  })

  steps.push({
    element: '[data-tour="user-menu"]',
    popover: {
      title: 'O teu perfil',
      description:
        'Aqui geres a tua conta e terminas sessão. Podes voltar a ver esta visita guiada em qualquer altura, a partir do Perfil.',
      side: 'bottom',
      align: 'end',
    },
  })

  return steps
}
