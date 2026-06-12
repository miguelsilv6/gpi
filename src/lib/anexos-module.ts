import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode ver/gerir anexos (documentos anexados a
 * inquéritos). ADMINISTRACAO tem sempre acesso; para os restantes, o módulo
 * tem de estar ativo e o role tem de constar em `moduloAnexosRoles`.
 */
export async function isModuloAnexosAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloAnexosAtivo: true, moduloAnexosRoles: true },
  })
  if (!(config?.moduloAnexosAtivo ?? true)) return false
  const allowed = (config?.moduloAnexosRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
