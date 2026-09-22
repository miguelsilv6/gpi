/**
 * Relações de um inquérito — os contactos que aparecem nas escutas com a
 * identificação já apurada (folha "Relações" do controlo em papel).
 *
 * São do INQUÉRITO e não do alvo: o mesmo número fala com vários alvos e só
 * vale a pena identificá-lo uma vez. Os produtos guardam os números em `de`/
 * `para` e a identificação é RESOLVIDA na leitura — assim corrigir o nome de
 * um contacto corrige de imediato todos os produtos onde ele aparece, coisa
 * que o ficheiro em papel obrigava a fazer à mão, linha a linha.
 *
 * Os campos `identificacaoDe`/`identificacaoPara` do produto são o recurso
 * para quando o número não tem Relação (ex.: "Namorada/o (Luz ?)"); a Relação
 * tem sempre precedência.
 */
import { prisma } from '@/lib/prisma'
import { normalizarContacto } from '@/lib/validations/intercecao'

// Os helpers puros vivem em `validations/intercecao` — os componentes cliente
// também precisam deles e este módulo importa o Prisma.
export { indexarRelacoes, identificacaoDe } from '@/lib/validations/intercecao'

export const RELACAO_SELECT = {
  id: true,
  contacto: true,
  nome: true,
  morada: true,
  documento: true,
  dataNascimento: true,
  fichaSpo: true,
  notas: true,
  fotoStoredName: true,
  fotoFilename: true,
  fotoMimeType: true,
  createdAt: true,
  criadoPor: { select: { id: true, nome: true } },
} as const

export async function getRelacoes(inqueritoId: string) {
  return prisma.intercecaoRelacao.findMany({
    where: { inqueritoid: inqueritoId },
    orderBy: [{ nome: 'asc' }, { contacto: 'asc' }],
    select: RELACAO_SELECT,
  })
}

export type RelacaoItem = Awaited<ReturnType<typeof getRelacoes>>[number]

/**
 * Números que aparecem nos produtos de um inquérito e ainda não têm Relação —
 * a lista de "por identificar" que o inspetor tem de fechar. Conta as
 * ocorrências para pôr os mais falados à cabeça.
 */
export async function getContactosPorIdentificar(
  inqueritoId: string,
  limite = 50,
): Promise<Array<{ contacto: string; ocorrencias: number }>> {
  const [produtos, relacoes] = await Promise.all([
    prisma.intercecaoProduto.findMany({
      where: { alvo: { inqueritoid: inqueritoId } },
      select: { de: true, para: true },
    }),
    prisma.intercecaoRelacao.findMany({
      where: { inqueritoid: inqueritoId },
      select: { contacto: true },
    }),
  ])

  const conhecidos = new Set(relacoes.map((r) => normalizarContacto(r.contacto)))
  const contagem = new Map<string, number>()
  for (const p of produtos) {
    for (const numero of [p.de, p.para]) {
      if (!numero) continue
      const norm = normalizarContacto(numero)
      if (norm === '' || conhecidos.has(norm)) continue
      contagem.set(norm, (contagem.get(norm) ?? 0) + 1)
    }
  }

  return [...contagem.entries()]
    .map(([contacto, ocorrencias]) => ({ contacto, ocorrencias }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias || a.contacto.localeCompare(b.contacto))
    .slice(0, limite)
}
