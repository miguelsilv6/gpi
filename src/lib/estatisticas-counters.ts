/**
 * Contadores-resumo de inquéritos partilhados pela página de Estatísticas e
 * pelo Dashboard (chefe e superiores). Fonte única de verdade para que os dois
 * mostrem exatamente os mesmos 8 valores.
 *
 * - `where`: filtro completo (deve incluir `deletedAt: null`, o âmbito por role
 *   e, opcionalmente, brigada/inspetor/datas). Aplica-se aos contadores por
 *   estado/flag (total, cartaPrecatoria, ativos, semInspetor, distribuído,
 *   arquivados).
 * - `currentScopeWhere`: âmbito SEM filtro de datas (deletedAt + brigada/
 *   inspetor). Os contadores "Aguarda Exames"/"Enviados" são estados ATUAIS, não
 *   de um período, por isso ignoram as datas — só lhes acrescentamos
 *   `estado.terminal = false` e a atividade da categoria por concluir.
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface InqueritoCounters {
  total: number
  cartaPrecatoria: number
  ativos: number
  semInspetor: number
  distribuido: number
  aguardaExames: number
  enviados: number
  arquivados: number
}

export async function getInqueritoCounters(
  where: Prisma.InqueritoWhereInput,
  currentScopeWhere: Prisma.InqueritoWhereInput,
): Promise<InqueritoCounters> {
  // Nomes das atividades-padrão marcadas com categoria de dashboard — usados
  // pelos contadores Aguarda Exames / Enviados.
  const padroesCategoria = await prisma.atividadePadrao.findMany({
    where: { ativa: true, categoriaDashboard: { not: null } },
    select: { nome: true, categoriaDashboard: true },
  })
  const nomesAguardaExames = padroesCategoria
    .filter((p) => p.categoriaDashboard === 'AGUARDA_EXAMES')
    .map((p) => p.nome)
  const nomesEnviados = padroesCategoria
    .filter((p) => p.categoriaDashboard === 'ENVIADO')
    .map((p) => p.nome)

  const [
    total,
    cartaPrecatoria,
    ativos,
    semInspetor,
    distribuido,
    arquivados,
    aguardaExames,
    enviados,
  ] = await Promise.all([
    prisma.inquerito.count({ where }),
    prisma.inquerito.count({ where: { ...where, cartaPrecatoria: true } }),
    prisma.inquerito.count({ where: { ...where, estado: { terminal: false } } }),
    prisma.inquerito.count({
      where: { ...where, inspetorId: null, estado: { terminal: false } },
    }),
    prisma.inquerito.count({ where: { ...where, estado: { codigo: 'DISTRIBUIDO' } } }),
    prisma.inquerito.count({ where: { ...where, estado: { codigo: 'ARQUIVADO' } } }),
    nomesAguardaExames.length === 0
      ? Promise.resolve(0)
      : prisma.inquerito.count({
          where: {
            ...currentScopeWhere,
            estado: { terminal: false },
            atividades: {
              some: { descricao: { in: nomesAguardaExames }, concluidaEm: null },
            },
          },
        }),
    nomesEnviados.length === 0
      ? Promise.resolve(0)
      : prisma.inquerito.count({
          where: {
            ...currentScopeWhere,
            estado: { terminal: false },
            atividades: {
              some: { descricao: { in: nomesEnviados }, concluidaEm: null },
            },
          },
        }),
  ])

  return { total, cartaPrecatoria, ativos, semInspetor, distribuido, aguardaExames, enviados, arquivados }
}
