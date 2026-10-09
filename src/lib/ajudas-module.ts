import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

export function isModuloAjudasAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Ajudas', role)
}
