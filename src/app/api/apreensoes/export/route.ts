import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { isModuloApreensoesAtivo } from '@/lib/apreensoes-module'
import { getApreensoesExport, apreensaoTipoLabel, type ApreensaoEstadoFiltro } from '@/lib/apreensoes'
import { ESTADO_APREENSAO_LABEL } from '@/lib/validations/apreensao'
import { parseFiltrosLista } from '@/lib/lista-filtros'
import { buildCsv, csvResponse, CSV_EXPORT_LIMIT } from '@/lib/csv'
import type { Role } from '@/generated/prisma/enums'

// Exportação CSV da lista global de Apreensões, com os mesmos filtros e o
// mesmo scope da página (/apreensoes). Fica registada na auditoria.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:export')) {
      return apiError('Sem permissão para exportar', 403)
    }
    if (!(await isModuloApreensoesAtivo(role))) {
      return apiError('Módulo Apreensões desativado', 403)
    }

    const sp = req.nextUrl.searchParams
    const e = sp.get('estado')
    const estado: ApreensaoEstadoFiltro = e === 'concluidas' || e === 'todas' ? e : 'em-custodia'
    const filtros = parseFiltrosLista((k) => sp.get(k))

    const rows = await getApreensoesExport(
      { role, userId: session.user.id, brigadaId: session.user.brigadaId ?? null, estado, ...filtros },
      CSV_EXPORT_LIMIT + 1,
    )
    if (rows.length > CSV_EXPORT_LIMIT) {
      return apiError(`Limite de ${CSV_EXPORT_LIMIT} registos por exportação. Refine os filtros.`, 413)
    }

    await writeAudit({
      req,
      acao: 'EXPORT_APREENSOES',
      entidade: 'Apreensao',
      entidadeId: '__bulk_export__',
      utilizadorId: session.user.id,
      detalhes: { filtros: { estado, ...filtros }, quantidade: rows.length },
    })

    const csv = buildCsv(
      ['NUIPC', 'Objeto', 'Tipo', 'Quantidade', 'N.º auto', 'Data apreensão', 'Local', 'Apreendido a', 'Local de custódia', 'Estado', 'Data destino', 'Observações'],
      rows.map((a) => [
        a.inquerito.nuipc,
        a.descricao,
        apreensaoTipoLabel(a.tipo, a.tipoOutro),
        a.quantidade,
        a.numeroAuto,
        a.dataApreensao,
        a.local,
        a.apreendidoA,
        a.localCustodia,
        ESTADO_APREENSAO_LABEL[a.estado as keyof typeof ESTADO_APREENSAO_LABEL] ?? a.estado,
        a.dataDestino,
        a.observacoes,
      ]),
    )
    return csvResponse('apreensoes', csv)
  } catch (error) {
    return handleApiError(error)
  }
}
