import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode ver/gerir anexos (documentos anexados a
 * inquéritos). ADMINISTRACAO tem sempre acesso; para os restantes, o módulo
 * tem de estar ativo e o role tem de constar em `moduloAnexosRoles`.
 */
export function isModuloAnexosAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Anexos', role)
}
