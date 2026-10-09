import { isModuloAtivo } from '@/lib/modulos'
import type { Role } from '@/generated/prisma/enums'

export function isModuloApreensoesAtivo(role: Role): Promise<boolean> {
  return isModuloAtivo('Apreensoes', role)
}
