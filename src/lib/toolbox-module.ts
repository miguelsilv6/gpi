import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode usar a Toolbox (ferramentas de investigação:
 * IP lookup, análise de cabeçalhos de email, DNS, etc.). ADMINISTRACAO tem
 * sempre acesso; para os restantes, o módulo tem de estar ativo e o role tem
 * de constar em `moduloToolboxRoles`.
 */
export async function isModuloToolboxAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloToolboxAtivo: true, moduloToolboxRoles: true },
  })
  if (!(config?.moduloToolboxAtivo ?? true)) return false
  const allowed = (config?.moduloToolboxRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
