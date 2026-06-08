import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode SUBMETER bug reports. ADMINISTRACAO tem sempre
 * acesso (também é quem gere os reports); para os restantes, o módulo tem de
 * estar ativo e o role tem de constar em `moduloBugReportsRoles`.
 *
 * Nota: isto controla apenas a submissão (/reportar-bug + POST). A página de
 * gestão (/bugs) é protegida por `bugreport:manage` e não depende deste toggle.
 */
export async function isModuloBugReportsAtivo(role: Role): Promise<boolean> {
  if (role === 'ADMINISTRACAO') return true
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloBugReportsAtivo: true, moduloBugReportsRoles: true },
  })
  if (!(config?.moduloBugReportsAtivo ?? true)) return false
  const allowed = (config?.moduloBugReportsRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR')
    .split(',')
    .filter(Boolean)
  return allowed.includes(role)
}
