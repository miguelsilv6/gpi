import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { isModuloPericiasAtivo } from '@/lib/pericias-module'
import { getPericiasExport, periciaTipoLabel, type PericiaEstadoFiltro } from '@/lib/pericias'
import { ESTADO_PERICIA_LABEL } from '@/lib/validations/pericia'
import { parseFiltrosLista } from '@/lib/lista-filtros'
import { buildCsv, csvResponse, CSV_EXPORT_LIMIT } from '@/lib/csv'
import type { Role } from '@/generated/prisma/enums'

// Exportação CSV da lista global de Exames/Perícias, com os mesmos filtros e o
// mesmo scope da página (/pericias). Fica registada na auditoria.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:export')) {
      return apiError('Sem permissão para exportar', 403)
    }
    if (!(await isModuloPericiasAtivo(role))) {
      return apiError('Módulo Perícias desativado', 403)
    }

    const sp = req.nextUrl.searchParams
    const e = sp.get('estado')
    const estado: PericiaEstadoFiltro = e === 'concluidas' || e === 'todas' ? e : 'pendentes'
    const filtros = parseFiltrosLista((k) => sp.get(k))

    const rows = await getPericiasExport(
      { role, userId: session.user.id, brigadaId: session.user.brigadaId ?? null, estado, ...filtros },
      CSV_EXPORT_LIMIT + 1,
    )
    if (rows.length > CSV_EXPORT_LIMIT) {
      return apiError(`Limite de ${CSV_EXPORT_LIMIT} registos por exportação. Refine os filtros.`, 413)
    }

    await writeAudit({
      req,
      acao: 'EXPORT_PERICIAS',
      entidade: 'Pericia',
      entidadeId: '__bulk_export__',
      utilizadorId: session.user.id,
      detalhes: { filtros: { estado, ...filtros }, quantidade: rows.length },
    })

    const csv = buildCsv(
      ['NUIPC', 'Tipo', 'Descrição', 'Entidade', 'Referência', 'Data pedido', 'Data prevista', 'Estado', 'Data conclusão', 'Apreensão', 'Resultado', 'Observações'],
      rows.map((p) => [
        p.inquerito.nuipc,
        periciaTipoLabel(p.tipo, p.tipoOutro),
        p.descricao,
        p.entidade,
        p.numeroReferencia,
        p.dataPedido,
        p.dataPrevista,
        ESTADO_PERICIA_LABEL[p.estado as keyof typeof ESTADO_PERICIA_LABEL] ?? p.estado,
        p.dataConclusao,
        p.apreensao?.descricao,
        p.resultado,
        p.observacoes,
      ]),
    )
    return csvResponse('pericias', csv)
  } catch (error) {
    return handleApiError(error)
  }
}
