import { prisma } from '@/lib/prisma'

export async function isModuloAjudasAtivo(): Promise<boolean> {
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { moduloAjudasAtivo: true },
  })
  return config?.moduloAjudasAtivo ?? true
}
