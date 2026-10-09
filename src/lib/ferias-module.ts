import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

export function isModuloAusenciasAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Ferias', role)
}
