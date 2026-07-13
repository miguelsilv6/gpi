import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

export async function isModuloPericiasAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloPericiasAtivo: true, moduloPericiasRoles: true },
  })
  if (!(config?.moduloPericiasAtivo ?? true)) return false
  const allowed = (config?.moduloPericiasRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
