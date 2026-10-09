import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

export function isModuloIntercecoesAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Intercecoes', role)
}
