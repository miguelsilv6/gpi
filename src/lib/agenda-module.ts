import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode ver/usar a Agenda (vista de calendário com
 * prazos, atividades, controlos e diligências). ADMINISTRACAO tem sempre
 * acesso; para os restantes, o módulo tem de estar ativo e o role tem de
 * constar em `moduloAgendaRoles`.
 */
export async function isModuloAgendaAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloAgendaAtivo: true, moduloAgendaRoles: true },
  })
  if (!(config?.moduloAgendaAtivo ?? true)) return false
  const allowed = (config?.moduloAgendaRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
