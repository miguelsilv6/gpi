import type { Role } from '@/generated/prisma/enums'
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Shield,
  BarChart3,
  CalendarRange,
  CalendarDays,
  Bell,
  Settings,
  ClipboardList,
  CalendarClock,
  FileBarChart,
  BarChart2,
  Banknote,
  Bug,
  Wrench,
  NotebookPen,
  ListTodo,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: Role[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
  {
    label: 'Inquéritos',
    href: '/inqueritos',
    icon: FolderOpen,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
  {
    label: 'Notas',
    href: '/notas',
    icon: NotebookPen,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Tarefas',
    href: '/tarefas',
    icon: ListTodo,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Prazos e Controlos',
    href: '/prazos',
    icon: CalendarClock,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Brigadas',
    href: '/brigadas',
    icon: Shield,
    roles: ['COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Estatísticas',
    href: '/estatisticas',
    icon: BarChart3,
    roles: ['INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
  {
    label: 'Estatística',
    href: '/minha-estatistica',
    icon: BarChart2,
    roles: ['INSPETOR'],
  },
  {
    label: 'Estatística Mensal',
    href: '/estatistica-mensal',
    icon: CalendarRange,
    roles: ['INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
  {
    label: 'Relatórios',
    href: '/relatorios',
    icon: FileBarChart,
    roles: ['INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
  {
    label: 'Ajudas Mensais',
    href: '/ajudas-mensais',
    icon: Banknote,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Ausências',
    href: '/ausencias',
    icon: CalendarDays,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Toolbox',
    href: '/toolbox',
    icon: Wrench,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Notificações',
    href: '/notificacoes',
    icon: Bell,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ADMINISTRACAO'],
  },
  {
    label: 'Reportar Bug',
    href: '/reportar-bug',
    icon: Bug,
    roles: ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
  {
    label: 'Utilizadores',
    href: '/utilizadores',
    icon: Users,
    roles: ['ADMINISTRACAO'],
  },
  {
    label: 'Gestão de Bugs',
    href: '/bugs',
    icon: Bug,
    roles: ['ADMINISTRACAO'],
  },
  {
    label: 'Audit Log',
    href: '/auditlog',
    icon: ClipboardList,
    roles: ['ADMINISTRACAO'],
  },
  {
    label: 'Configurações',
    href: '/configuracoes',
    icon: Settings,
    roles: ['ADMINISTRACAO'],
  },
]

export interface NavModuleFlags {
  moduloAjudasAtivo?: boolean
  moduloFeriasAtivo?: boolean
  moduloBugReportsAtivo?: boolean
  moduloToolboxAtivo?: boolean
}

/**
 * Single source of truth para a visibilidade dos itens de navegação: filtra
 * por role e respeita os módulos opcionais (Ajudas, Férias, Bug Reports,
 * Toolbox). ADMINISTRACAO vê sempre todos os itens, mesmo com módulos
 * desligados. Reutilizado pelo sidebar, bottom-nav e command palette para que
 * a navegação se mantenha coerente em todo o lado.
 */
export function filterNavItems(role: Role, modules: NavModuleFlags = {}): NavItem[] {
  const {
    moduloAjudasAtivo = true,
    moduloFeriasAtivo = true,
    moduloBugReportsAtivo = true,
    moduloToolboxAtivo = true,
  } = modules
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false
    if (item.href === '/ajudas-mensais' && !moduloAjudasAtivo && role !== 'ADMINISTRACAO') return false
    if (item.href === '/ausencias' && !moduloFeriasAtivo && role !== 'ADMINISTRACAO') return false
    if (item.href === '/reportar-bug' && !moduloBugReportsAtivo && role !== 'ADMINISTRACAO') return false
    if (item.href === '/toolbox' && !moduloToolboxAtivo && role !== 'ADMINISTRACAO') return false
    return true
  })
}
