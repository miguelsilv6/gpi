import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import { getRelacoes, getContactosPorIdentificar, RELACAO_SELECT } from '@/lib/intercecoes-relacoes'
import {
  intercecaoRelacaoCreateSchema,
  normalizarContacto,
} from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — relações (contactos identificados) do inquérito. Com `?pendentes=1`
 * devolve também os números que aparecem nos produtos e ainda não têm ficha,
 * que é a lista de trabalho por fechar.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const items = await getRelacoes(ctx.inquerito.id)
    const pendentes =
      req.nextUrl.searchParams.get('pendentes') === '1'
        ? await getContactosPorIdentificar(ctx.inquerito.id)
        : undefined

    return Response.json({ items, ...(pendentes !== undefined && { pendentes }) })
  } catch (error) {
    return handleApiError(error)
  }
}

/** POST — fichar um contacto. O número é guardado em forma canónica. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const body = await req.json().catch(() => null)
    const parsed = intercecaoRelacaoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    const contacto = normalizarContacto(d.contacto)
    if (contacto === '' || contacto === '+') {
      return apiError('O contacto tem de conter pelo menos um dígito', 400)
    }

    let dataNascimento: Date | null = null
    if (d.dataNascimento !== undefined) {
      const v = parseData(d.dataNascimento)
      if (!v) return apiError('Data de nascimento inválida', 400)
      dataNascimento = v
    }

    // Pré-verificação para mensagem PT amigável; o @@unique é o backstop.
    const duplicado = await prisma.intercecaoRelacao.findFirst({
      where: { inqueritoid: ctx.inquerito.id, contacto },
      select: { id: true },
    })
    if (duplicado) return apiError('Este contacto já está fichado neste inquérito', 409)

    const relacao = await prisma.intercecaoRelacao.create({
      data: {
        inqueritoid: ctx.inquerito.id,
        criadoPorId: ctx.userId,
        contacto,
        nome: d.nome ?? null,
        morada: d.morada ?? null,
        documento: d.documento ?? null,
        dataNascimento,
        fichaSpo: d.fichaSpo ?? null,
        notas: d.notas ?? null,
      },
      select: RELACAO_SELECT,
    })

    await writeAudit({
      req,
      acao: 'CREATE_INTERCECAO_RELACAO',
      entidade: 'IntercecaoRelacao',
      entidadeId: relacao.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, contacto, nome: relacao.nome },
    })

    return Response.json(relacao, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
