import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

export async function isModuloAusenciasAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloFeriasAtivo: true, moduloFeriasRoles: true },
  })
  if (!(config?.moduloFeriasAtivo ?? true)) return false
  const allowed = (config?.moduloFeriasRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
