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
  | 'atividade:create:own'
  | 'atividade:create:brigade'
  | 'estatistica:read'
  | 'brigada:read'
  | 'brigada:manage'
  | 'utilizador:manage'
  | 'sistema:config'

const PERMISSIONS: Record<Role, Permission[]> = {
  INSPETOR: [
    'inquerito:read:own',
    'inquerito:edit:own',
    'atividade:create:own',
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
    'brigada:read',
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
    'estatistica:read',
    'brigada:read',
    'brigada:manage',
  ],
  ESTATISTICA: [
    'inquerito:read:all',
    'inquerito:export',
    'estatistica:read',
    'brigada:read',
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
    'atividade:create:own',
    'atividade:create:brigade',
    'estatistica:read',
    'brigada:read',
    'brigada:manage',
    'utilizador:manage',
    'sistema:config',
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
