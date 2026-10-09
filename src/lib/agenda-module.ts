import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode ver/usar a Agenda (vista de calendário com
 * prazos, atividades, controlos e diligências). ADMINISTRACAO tem sempre
 * acesso; para os restantes, o módulo tem de estar ativo e o role tem de
 * constar em `moduloAgendaRoles`.
 */
export function isModuloAgendaAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Agenda', role)
}
