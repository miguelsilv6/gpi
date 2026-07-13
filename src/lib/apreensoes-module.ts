import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

export async function isModuloApreensoesAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloApreensoesAtivo: true, moduloApreensoesRoles: true },
  })
  if (!(config?.moduloApreensoesAtivo ?? true)) return false
  const allowed = (config?.moduloApreensoesRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
