import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode usar a Toolbox (ferramentas de investigação:
 * IP lookup, análise de cabeçalhos de email, DNS, etc.). ADMINISTRACAO tem
 * sempre acesso; para os restantes, o módulo tem de estar ativo e o role tem
 * de constar em `moduloToolboxRoles`.
 */
export function isModuloToolboxAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Toolbox', role)
}
