import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

export async function isModuloIntercecoesAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloIntercecoesAtivo: true, moduloIntercecoesRoles: true },
  })
  if (!(config?.moduloIntercecoesAtivo ?? true)) return false
  const allowed = (config?.moduloIntercecoesRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
