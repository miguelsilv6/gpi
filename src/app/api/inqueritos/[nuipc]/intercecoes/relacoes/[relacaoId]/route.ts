import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { documentoPath } from '@/lib/documentos'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import { RELACAO_SELECT } from '@/lib/intercecoes-relacoes'
import {
  intercecaoRelacaoUpdateSchema,
  normalizarContacto,
} from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function loadRelacao(relacaoId: string, inqueritoId: string) {
  const relacao = await prisma.intercecaoRelacao.findUnique({ where: { id: relacaoId } })
  if (!relacao || relacao.inqueritoid !== inqueritoId) return null
  return relacao
}

/** PUT — atualizar a ficha de um contacto. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; relacaoId: string }> },
) {
  try {
    const { nuipc: slug, relacaoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const relacao = await loadRelacao(relacaoId, ctx.inquerito.id)
    if (!relacao) return apiError('Relação não encontrada', 404)

    const body = await req.json().catch(() => null)
    const parsed = intercecaoRelacaoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    let contacto: string | undefined
    if (d.contacto !== undefined) {
      contacto = normalizarContacto(d.contacto)
      if (contacto === '' || contacto === '+') {
        return apiError('O contacto tem de conter pelo menos um dígito', 400)
      }
      if (contacto !== relacao.contacto) {
        const duplicado = await prisma.intercecaoRelacao.findFirst({
          where: { inqueritoid: ctx.inquerito.id, contacto, id: { not: relacao.id } },
          select: { id: true },
        })
        if (duplicado) return apiError('Este contacto já está fichado neste inquérito', 409)
      }
    }

    // '' limpa a data de nascimento; omitida mantém-na.
    let dataNascimento: Date | null | undefined
    if (d.dataNascimento !== undefined) {
      if (d.dataNascimento.trim() === '') {
        dataNascimento = null
      } else {
        const v = parseData(d.dataNascimento)
        if (!v) return apiError('Data de nascimento inválida', 400)
        dataNascimento = v
      }
    }

    const updated = await prisma.intercecaoRelacao.update({
      where: { id: relacao.id },
      data: {
        ...(contacto !== undefined && { contacto }),
        ...(d.nome !== undefined && { nome: d.nome.trim() || null }),
        ...(d.morada !== undefined && { morada: d.morada.trim() || null }),
        ...(d.documento !== undefined && { documento: d.documento.trim() || null }),
        ...(dataNascimento !== undefined && { dataNascimento }),
        ...(d.fichaSpo !== undefined && { fichaSpo: d.fichaSpo.trim() || null }),
        ...(d.notas !== undefined && { notas: d.notas.trim() || null }),
      },
      select: RELACAO_SELECT,
    })

    const keys = ['contacto', 'nome', 'morada', 'documento', 'dataNascimento', 'fichaSpo', 'notas'] as const
    const changes = diff(
      Object.fromEntries(keys.map((k) => [k, relacao[k]])) as Record<string, string | Date | null>,
      Object.fromEntries(keys.map((k) => [k, updated[k]])) as Record<string, string | Date | null>,
      keys,
    )
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_INTERCECAO_RELACAO',
        entidade: 'IntercecaoRelacao',
        entidadeId: relacao.id,
        utilizadorId: ctx.userId,
        detalhes: { nuipc: ctx.inquerito.nuipc, ...changes },
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

/** DELETE — apagar a ficha (e a foto em disco, se houver). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; relacaoId: string }> },
) {
  try {
    const { nuipc: slug, relacaoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const relacao = await loadRelacao(relacaoId, ctx.inquerito.id)
    if (!relacao) return apiError('Relação não encontrada', 404)

    await prisma.intercecaoRelacao.delete({ where: { id: relacao.id } })
    // A imagem só existe por causa da ficha: apagada a ficha, não deixar lixo.
    // Uma falha aqui não desfaz o apagamento (o registo é a fonte de verdade).
    if (relacao.fotoStoredName) {
      await fs.unlink(documentoPath(relacao.fotoStoredName)).catch(() => {})
    }

    await writeAudit({
      req,
      acao: 'DELETE_INTERCECAO_RELACAO',
      entidade: 'IntercecaoRelacao',
      entidadeId: relacao.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        contacto: relacao.contacto,
        nome: relacao.nome,
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
