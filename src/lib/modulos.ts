import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

/**
 * Configuração dos módulos opcionais (ativo + roles com acesso), lida uma vez
 * por request: uma página que verifica vários módulos (ex.: detalhe do
 * inquérito) faz uma só consulta em vez de uma por módulo. Fora de um render
 * de servidor o `cache()` não memoriza — cada chamada lê a BD, como antes.
 */
const getModulosConfig = cache(() =>
  prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: {
      moduloAgendaAtivo: true,
      moduloAgendaRoles: true,
      moduloAjudasAtivo: true,
      moduloAjudasRoles: true,
      moduloAnexosAtivo: true,
      moduloAnexosRoles: true,
      moduloApreensoesAtivo: true,
      moduloApreensoesRoles: true,
      moduloBugReportsAtivo: true,
      moduloBugReportsRoles: true,
      moduloFeriasAtivo: true,
      moduloFeriasRoles: true,
      moduloIntercecoesAtivo: true,
      moduloIntercecoesRoles: true,
      moduloPericiasAtivo: true,
      moduloPericiasRoles: true,
      moduloToolboxAtivo: true,
      moduloToolboxRoles: true,
    },
  }),
)

export type Modulo =
  | 'Agenda'
  | 'Ajudas'
  | 'Anexos'
  | 'Apreensoes'
  | 'BugReports'
  | 'Ferias'
  | 'Intercecoes'
  | 'Pericias'
  | 'Toolbox'

const ROLES_POR_OMISSAO = 'INSPETOR,INSPETOR_CHEFE,COORDENADOR'

/**
 * ADMINISTRACAO tem sempre acesso; para os restantes, o módulo tem de estar
 * ativo e o role tem de constar na lista de roles do módulo.
 */
export async function isModuloAtivo(modulo: Modulo, role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await getModulosConfig()
  if (!(config?.[`modulo${modulo}Ativo`] ?? true)) return false
  const allowed = (config?.[`modulo${modulo}Roles`] ?? ROLES_POR_OMISSAO).split(',').filter(Boolean)
  return allowed.includes(role)
}
