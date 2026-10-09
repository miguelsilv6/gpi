import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

/**
 * Indica se o utilizador pode SUBMETER bug reports. ADMINISTRACAO tem sempre
 * acesso (também é quem gere os reports); para os restantes, o módulo tem de
 * estar ativo e o role tem de constar em `moduloBugReportsRoles`.
 *
 * Nota: isto controla apenas a submissão (/reportar-bug + POST). A página de
 * gestão (/bugs) é protegida por `bugreport:manage` e não depende deste toggle.
 */
export function isModuloBugReportsAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('BugReports', role)
}
