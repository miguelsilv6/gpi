import type { Role } from '@/generated/prisma/enums'

export type Permission =
  | 'inquerito:read:own'
  | 'inquerito:read:brigade'
  | 'inquerito:read:all'
  | 'inquerito:create'
  | 'inquerito:edit:own'
  | 'inquerito:edit:brigade'
  | 'inquerito:edit:all'
  | 'inquerito:assign'
  | 'inquerito:transfer'
  | 'inquerito:bulk:brigade'
  | 'inquerito:bulk:all'
  | 'inquerito:reopen'
  | 'inquerito:delete'
  | 'inquerito:export'
  | 'inquerito:audit:read'
  | 'inquerito:estados:manage'
  | 'crime:manage'
  | 'etiqueta:manage'
  | 'ajudas:own'
  | 'ajudas:read:brigade'
  | 'ajudas:read:all'
  | 'ajudas:config'
  | 'ausencias:own'
  | 'ausencias:read:brigade'
  | 'ausencias:read:all'
  | 'ausencias:config'
  | 'bugreport:create'
  | 'bugreport:manage'
  | 'comarca:manage'
  | 'tribunal:manage'
  | 'seccao:manage'
  | 'atividade:create:own'
  | 'atividade:create:brigade'
  | 'prazo:read:own'
  | 'prazo:read:brigade'
  | 'prazo:read:all'
  | 'controlo:create'
  | 'controlo:read:own'
  | 'controlo:read:brigade'
  | 'controlo:read:all'
  | 'estatistica:read'
  | 'estatistica:own'
  | 'brigada:read'
  | 'brigada:manage'
  | 'utilizador:manage'
  | 'sistema:config'
  | 'relatorio:read'

const PERMISSIONS: Record<Role, Permission[]> = {
  INSPETOR: [
    'inquerito:read:own',
    'inquerito:create',
    'inquerito:edit:own',
    'inquerito:reopen',
    'inquerito:export',
    'inquerito:audit:read',
    'atividade:create:own',
    'prazo:read:own',
    'controlo:create',
    'controlo:read:own',
    'estatistica:own',
    'ajudas:own',
    'ausencias:own',
    'bugreport:create',
  ],
  INSPETOR_CHEFE: [
    'inquerito:read:own',
    'inquerito:read:brigade',
    'inquerito:create',
    'inquerito:edit:own',
    'inquerito:edit:brigade',
    'inquerito:assign',
    'inquerito:bulk:brigade',
    'inquerito:export',
    'inquerito:audit:read',
    'atividade:create:own',
    'atividade:create:brigade',
    'prazo:read:own',
    'prazo:read:brigade',
    'controlo:create',
    'controlo:read:own',
    'controlo:read:brigade',
    'estatistica:read',
    'brigada:read',
    'relatorio:read',
    'ajudas:own',
    'ajudas:read:brigade',
    'ausencias:own',
    'ausencias:read:brigade',
    'bugreport:create',
  ],
  COORDENADOR: [
    'inquerito:read:own',
    'inquerito:read:brigade',
    'inquerito:read:all',
    'inquerito:create',
    'inquerito:edit:own',
    'inquerito:edit:brigade',
    'inquerito:edit:all',
    'inquerito:assign',
    'inquerito:transfer',
    'inquerito:bulk:brigade',
    'inquerito:bulk:all',
    'inquerito:reopen',
    'inquerito:export',
    'inquerito:audit:read',
    'atividade:create:own',
    'atividade:create:brigade',
    'prazo:read:own',
    'prazo:read:brigade',
    'prazo:read:all',
    'controlo:create',
    'controlo:read:own',
    'controlo:read:brigade',
    'controlo:read:all',
    'estatistica:read',
    'brigada:read',
    'brigada:manage',
    'relatorio:read',
    'ajudas:own',
    'ajudas:read:all',
    'ausencias:own',
    'ausencias:read:all',
    'bugreport:create',
  ],
  ESTATISTICA: [
    'inquerito:read:all',
    'inquerito:export',
    'estatistica:read',
    'brigada:read',
    'relatorio:read',
    'bugreport:create',
  ],
  ADMINISTRACAO: [
    'inquerito:read:own',
    'inquerito:read:brigade',
    'inquerito:read:all',
    'inquerito:create',
    'inquerito:edit:own',
    'inquerito:edit:brigade',
    'inquerito:edit:all',
    'inquerito:assign',
    'inquerito:transfer',
    'inquerito:bulk:brigade',
    'inquerito:bulk:all',
    'inquerito:reopen',
    'inquerito:delete',
    'inquerito:export',
    'inquerito:audit:read',
    'inquerito:estados:manage',
    'crime:manage',
    'etiqueta:manage',
    'comarca:manage',
    'tribunal:manage',
    'seccao:manage',
    'atividade:create:own',
    'atividade:create:brigade',
    'prazo:read:own',
    'prazo:read:brigade',
    'prazo:read:all',
    'controlo:create',
    'controlo:read:own',
    'controlo:read:brigade',
    'controlo:read:all',
    'estatistica:read',
    'brigada:read',
    'brigada:manage',
    'utilizador:manage',
    'sistema:config',
    'relatorio:read',
    'ajudas:own',
    'ajudas:read:brigade',
    'ajudas:read:all',
    'ajudas:config',
    'ausencias:own',
    'ausencias:read:brigade',
    'ausencias:read:all',
    'ausencias:config',
    'bugreport:create',
    'bugreport:manage',
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false
}

export function requiresPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Sem permissão: ${permission}`)
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  INSPETOR: 'Inspetor',
  INSPETOR_CHEFE: 'Inspetor-Chefe',
  COORDENADOR: 'Coordenador',
  ESTATISTICA: 'Estatística',
  ADMINISTRACAO: 'Administração',
}

export const ROLE_COLORS: Record<Role, string> = {
  INSPETOR: 'bg-blue-100 text-blue-800',
  INSPETOR_CHEFE: 'bg-purple-100 text-purple-800',
  COORDENADOR: 'bg-green-100 text-green-800',
  ESTATISTICA: 'bg-orange-100 text-orange-800',
  ADMINISTRACAO: 'bg-red-100 text-red-800',
}
