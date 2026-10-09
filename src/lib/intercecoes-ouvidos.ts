/**
 * "Marcar como ouvidos": ao definir até onde o inspetor acompanhou um alvo
 * (`IntercecaoAlvo.acompanhadoAte`), os produtos desse alvo cujo momento
 * (data + hora de início) é igual ou anterior passam a "ouvidos".
 */
import { prisma } from '@/lib/prisma'
import { momentoProduto } from '@/lib/datetime-pt'

/** Ids dos produtos do alvo, ainda não ouvidos, com momento ≤ `ate`. */
export async function produtosPorMarcar(alvoId: string, ate: Date): Promise<string[]> {
  // Pré-filtro por dia na BD; o corte exato (hora) faz-se em memória.
  const fimDoDia = new Date(
    Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate(), 23, 59, 59, 999),
  )
  const candidatos = await prisma.intercecaoProduto.findMany({
    where: { alvoId, ouvido: false, data: { lte: fimDoDia } },
    select: { id: true, data: true, horaInicio: true },
  })
  return candidatos
    .filter((p) => momentoProduto(p.data, p.horaInicio).getTime() <= ate.getTime())
    .map((p) => p.id)
}

/** Marca como ouvidos os produtos do alvo até `ate`; devolve quantos. */
export async function marcarProdutosOuvidos(alvoId: string, ate: Date, now: Date = new Date()): Promise<number> {
  const ids = await produtosPorMarcar(alvoId, ate)
  if (ids.length === 0) return 0
  const r = await prisma.intercecaoProduto.updateMany({
    where: { id: { in: ids }, alvoId, ouvido: false },
    data: { ouvido: true, ouvidoEm: now },
  })
  return r.count
}
