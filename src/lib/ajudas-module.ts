import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

export async function isModuloAjudasAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloAjudasAtivo: true, moduloAjudasRoles: true },
  })
  if (!(config?.moduloAjudasAtivo ?? true)) return false
  const allowed = (config?.moduloAjudasRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
