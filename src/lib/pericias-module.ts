import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

export function isModuloPericiasAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Pericias', role)
}
