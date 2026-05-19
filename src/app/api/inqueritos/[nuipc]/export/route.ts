import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSession,
  buildInqueritoWhere,
  handleApiError,
  apiError,
} from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function fmtDate(d: Date | null | string): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('pt-PT')
}

function fmtDateTime(d: Date | null | string): string {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-PT')
}

/**
 * Exports a single inquérito (including its atividades) as CSV.
 * Excludes the audit log — that's available separately for users with the
 * inquerito:audit:read permission.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:export')) {
      return apiError('Sem permissão para exportar inquéritos', 403)
    }

    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)
    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

    const inquerito = await prisma.inquerito.findFirst({
      where: { nuipc, deletedAt: null, ...roleWhere },
      include: {
        estado: { select: { codigo: true, nome: true, terminal: true } },
        crime: { select: { nome: true } },
        brigada: { select: { nome: true } },
        inspetor: { select: { nome: true, email: true } },
        atividades: {
          orderBy: { dataRealizacao: 'desc' },
          include: { realizadaPor: { select: { nome: true } } },
        },
      },
    })
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    await writeAudit({
      req,
      acao: 'EXPORT_INQUERITO_DETAIL',
      entidade: 'Inquerito',
      entidadeId: inquerito.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: inquerito.nuipc, atividades: inquerito.atividades.length },
    })

    // Header block — inquérito metadata as key/value pairs. We use a
    // two-column CSV ("Campo,Valor") for readability when opened in Excel.
    const lines: string[] = []
    lines.push(['Campo', 'Valor'].map(escapeCSV).join(','))
    const meta: Array<[string, unknown]> = [
      ['NUIPC', inquerito.nuipc],
      ['NAI', inquerito.nai],
      ['Crime', inquerito.crime?.nome ?? inquerito.natureza],
      ['Estado', inquerito.estado.nome],
      ['Data Abertura', fmtDate(inquerito.dataAbertura)],
      ['Prazo', fmtDate(inquerito.dataPrazo)],
      ['Data Conclusão', fmtDate(inquerito.dataConclusao)],
      ['Brigada', inquerito.brigada?.nome ?? ''],
      ['Inspetor', inquerito.inspetor?.nome ?? ''],
      ['Inspetor (email)', inquerito.inspetor?.email ?? ''],
      ['Tribunal / M.P.', inquerito.tribunal],
      ['Procurador/a', inquerito.procurador],
      ['Oficial de Justiça', inquerito.oficialJustica],
      ['VoIP / Contacto', inquerito.voip],
      ['Notas (tribunal)', inquerito.notasTribunal],
      ['Notas', inquerito.notas],
      ['Criado em', fmtDateTime(inquerito.createdAt)],
      ['Última atualização', fmtDateTime(inquerito.updatedAt)],
    ]
    for (const [campo, valor] of meta) {
      lines.push([campo, valor ?? ''].map(escapeCSV).join(','))
    }

    // Spacer + atividades section
    lines.push('')
    lines.push(`Atividades (${inquerito.atividades.length})`)
    const atvHeaders = [
      'Data Realização',
      'Atividade',
      'Quantidade',
      'Data Prazo',
      'Realizada por',
      'Observações',
    ]
    lines.push(atvHeaders.map(escapeCSV).join(','))
    for (const a of inquerito.atividades) {
      lines.push(
        [
          fmtDate(a.dataRealizacao),
          a.descricao,
          a.quantidade ?? '',
          fmtDate(a.dataPrazo),
          a.realizadaPor.nome,
          a.observacoes ?? '',
        ]
          .map(escapeCSV)
          .join(','),
      )
    }

    // UTF-8 BOM so Excel detects the encoding correctly
    const csv = '﻿' + lines.join('\n')

    const safeNuipc = inquerito.nuipc.replace(/[^A-Za-z0-9._-]+/g, '_')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inquerito-${safeNuipc}.csv"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
