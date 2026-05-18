import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import {
  buildEstatisticaMensal,
  formatEstatisticaMensalCSV,
  formatEstatisticaMensalMarkdown,
  getMesLabel,
} from '@/lib/estatistica-mensal'
import type { Role } from '@/generated/prisma/enums'

const querySchema = z.object({
  ano: z.coerce.number().int().min(1900).max(3000),
  mes: z.coerce.number().int().min(1).max(12),
  format: z.enum(['csv', 'md']),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'estatistica:read')) {
      return apiError('Sem permissão para exportar estatísticas', 403)
    }

    const { searchParams } = new URL(req.url)
    const now = new Date()
    const parsed = querySchema.safeParse({
      ano: searchParams.get('ano') ?? now.getFullYear(),
      mes: searchParams.get('mes') ?? now.getMonth() + 1,
      format: searchParams.get('format') ?? 'csv',
    })
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { ano, mes, format } = parsed.data

    const data = await buildEstatisticaMensal({
      ano,
      mes,
      role,
      sessionBrigadaId: session.user.brigadaId,
    })
    if (!data) return apiError('Sessão sem brigada associada — refresh ou re-login', 403)

    await writeAudit({
      req,
      acao: 'EXPORT_ESTATISTICA_MENSAL',
      entidade: 'EstatisticaMensal',
      entidadeId: `${ano}-${String(mes).padStart(2, '0')}`,
      utilizadorId: session.user.id,
      detalhes: {
        ano,
        mes,
        format,
        brigadas: data.brigadas.length,
        atividadesPadrao: data.atividadesPadrao.length,
        totalGeral: data.totalGeral,
      },
    })

    const mesLabel = getMesLabel(mes).toLowerCase()
    const filenameBase = `estatistica-mensal-${ano}-${String(mes).padStart(2, '0')}-${mesLabel}`

    if (format === 'csv') {
      // BOM for Excel to detect UTF-8 properly
      const body = '﻿' + formatEstatisticaMensalCSV(data)
      return new Response(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
        },
      })
    }

    const body = formatEstatisticaMensalMarkdown(data)
    return new Response(body, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.md"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
