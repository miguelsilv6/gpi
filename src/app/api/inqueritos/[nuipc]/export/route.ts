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
import { TIPO_DILIGENCIA_LABEL } from '@/lib/validations/diligencia'
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
        tribunal: { select: { nome: true } },
        seccao: { select: { nome: true } },
        atividades: {
          // Sorted by createdAt to match the on-screen detail / print views.
          orderBy: { createdAt: 'desc' },
          include: { realizadaPor: { select: { nome: true } } },
        },
        controlos: {
          orderBy: { dataInicio: 'desc' },
          include: {
            criador: { select: { nome: true } },
            realizacoes: { orderBy: { numero: 'asc' } },
          },
        },
        diligencias: {
          orderBy: { dataInicio: 'desc' },
          include: { criadoPor: { select: { nome: true } } },
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
      detalhes: {
        nuipc: inquerito.nuipc,
        atividades: inquerito.atividades.length,
        controlos: inquerito.controlos.length,
        diligencias: inquerito.diligencias.length,
      },
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
      ['Tribunal / M.P.', inquerito.tribunal?.nome ?? ''],
      ['Secção', inquerito.seccao?.nome ?? ''],
      ['Procurador/a', inquerito.procurador],
      ['Oficial de Justiça', inquerito.oficialJustica],
      ['VoIP / Contacto', inquerito.voip],
      ['Notas (tribunal)', inquerito.notasTribunal],
      ['Denunciante (nome/designação)', inquerito.denuncianteNome],
      ['Denunciante (tipo)',
        inquerito.denuncianteTipo === 'SINGULAR'
          ? 'Pessoa singular'
          : inquerito.denuncianteTipo === 'COLETIVA'
            ? 'Pessoa coletiva'
            : inquerito.denuncianteTipo === 'ENTIDADE_PUBLICA'
              ? 'Entidade pública'
              : inquerito.denuncianteTipo === 'OUTROS'
                ? 'Outros'
                : ''],
      ['Denunciante (NIF/NIPC)', inquerito.denuncianteNif],
      ['Denunciante (morada)', inquerito.denuncianteMorada],
      ['Denunciante (código postal)', inquerito.denuncianteCodPostal],
      ['Denunciante (localidade)', inquerito.denuncianteLocalidade],
      ['Denunciante (contacto)', inquerito.denuncianteContacto],
      ['Denunciante (email)', inquerito.denuncianteEmail],
      ['Denunciante (responsável)', inquerito.denuncianteResponsavel],
      ['Denunciante (notas)', inquerito.denuncianteNotas],
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
      'Data Inserção',
      'Data Realização',
      'Atividade',
      'Quantidade',
      'Data Prazo',
      'Concluída em',
      'Realizada por',
      'Observações',
    ]
    lines.push(atvHeaders.map(escapeCSV).join(','))
    for (const a of inquerito.atividades) {
      lines.push(
        [
          fmtDateTime(a.createdAt),
          fmtDate(a.dataRealizacao),
          a.descricao,
          a.quantidade ?? '',
          fmtDate(a.dataPrazo),
          fmtDate(a.concluidaEm),
          a.realizadaPor.nome,
          a.observacoes ?? '',
        ]
          .map(escapeCSV)
          .join(','),
      )
    }

    // Spacer + controlos section
    lines.push('')
    lines.push(`Controlos (${inquerito.controlos.length})`)
    const ctrlHeaders = [
      'Descrição',
      'Início',
      'Periodicidade (dias)',
      'Concluído em',
      'Realizações (feitas/total)',
      'Próxima esperada',
      'Criado por',
      'Observações',
    ]
    lines.push(ctrlHeaders.map(escapeCSV).join(','))
    for (const c of inquerito.controlos) {
      const total = c.realizacoes.length
      const feitas = c.realizacoes.filter((r) => r.dataRealizacao).length
      const proxima = c.realizacoes
        .filter((r) => !r.dataRealizacao)
        .sort((a, b) => a.dataEsperada.getTime() - b.dataEsperada.getTime())[0]
      lines.push(
        [
          c.descricao,
          fmtDate(c.dataInicio),
          c.periodoDias ?? '',
          fmtDate(c.concluidoEm),
          `${feitas}/${total}`,
          proxima ? fmtDate(proxima.dataEsperada) : '',
          c.criador.nome,
          c.observacoes ?? '',
        ]
          .map(escapeCSV)
          .join(','),
      )
    }

    // Spacer + diligências section
    lines.push('')
    lines.push(`Diligências (${inquerito.diligencias.length})`)
    const dilHeaders = [
      'Tipo',
      'Título',
      'Início',
      'Fim',
      'Local',
      'Concluída',
      'Criado por',
      'Observações',
    ]
    lines.push(dilHeaders.map(escapeCSV).join(','))
    for (const d of inquerito.diligencias) {
      lines.push(
        [
          TIPO_DILIGENCIA_LABEL[d.tipo] ?? d.tipo,
          d.titulo,
          fmtDateTime(d.dataInicio),
          d.dataFim ? fmtDateTime(d.dataFim) : '',
          d.local ?? '',
          d.concluida ? 'Sim' : 'Não',
          d.criadoPor.nome,
          d.observacoes ?? '',
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
