import { prisma } from '@/lib/prisma'

export async function isModuloFeriasAtivo(): Promise<boolean> {
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloFeriasAtivo: true },
  })
  return config?.moduloFeriasAtivo ?? true
}
