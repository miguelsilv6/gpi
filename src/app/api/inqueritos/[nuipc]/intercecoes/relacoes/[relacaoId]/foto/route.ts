import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { DOCUMENTOS_DIR, documentoPath, sanitizeFilename } from '@/lib/documentos'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A foto de um contacto é uma ajuda de identificação, não uma peça processual:
// vive no mesmo disco dos anexos mas fora da lista de documentos do inquérito,
// e só aceita imagens.
const FOTO_MAX_BYTES = 5 * 1024 * 1024
const FOTO_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])
const FOTO_EXTENSOES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic'])

async function loadRelacao(relacaoId: string, inqueritoId: string) {
  const relacao = await prisma.intercecaoRelacao.findUnique({ where: { id: relacaoId } })
  if (!relacao || relacao.inqueritoid !== inqueritoId) return null
  return relacao
}

/** GET — servir a foto da ficha (inline, sem cache partilhada). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; relacaoId: string }> },
) {
  try {
    const { nuipc: slug, relacaoId } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const relacao = await loadRelacao(relacaoId, ctx.inquerito.id)
    if (!relacao) return apiError('Relação não encontrada', 404)
    if (!relacao.fotoStoredName) return apiError('Esta relação não tem foto', 404)

    const buffer = await fs.readFile(documentoPath(relacao.fotoStoredName))
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': relacao.fotoMimeType ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${relacao.fotoFilename ?? 'foto'}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/** POST — carregar (ou substituir) a foto da ficha. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; relacaoId: string }> },
) {
  try {
    const { nuipc: slug, relacaoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const relacao = await loadRelacao(relacaoId, ctx.inquerito.id)
    if (!relacao) return apiError('Relação não encontrada', 404)

    const limited = enforceRateLimit({
      key: `intercecao:foto:${clientFingerprint(req)}:${ctx.userId}`,
      max: 20,
      windowMs: 5 * 60_000,
    })
    if (limited) return limited

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return apiError('Ficheiro em falta', 400)
    if (file.size === 0) return apiError('Ficheiro vazio', 400)
    if (file.size > FOTO_MAX_BYTES) {
      return apiError(`Imagem demasiado grande (limite ${FOTO_MAX_BYTES / (1024 * 1024)} MB)`, 413)
    }
    if (!FOTO_MIME_ALLOWLIST.has(file.type)) {
      return apiError('Só são aceites imagens (JPG, PNG, WebP ou HEIC)', 415)
    }

    const filename = sanitizeFilename(file.name)
    const ext = path.extname(filename).toLowerCase()
    if (!FOTO_EXTENSOES.has(ext)) return apiError('Extensão de imagem não permitida', 415)

    const storedName = `${randomUUID()}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.mkdir(DOCUMENTOS_DIR, { recursive: true })
    await fs.writeFile(path.join(DOCUMENTOS_DIR, storedName), buffer, { mode: 0o644 })

    const anterior = relacao.fotoStoredName
    try {
      await prisma.intercecaoRelacao.update({
        where: { id: relacao.id },
        data: { fotoStoredName: storedName, fotoFilename: filename, fotoMimeType: file.type },
      })
    } catch (error) {
      // Se a BD falhar, o ficheiro novo não serve para nada — remover.
      await fs.unlink(path.join(DOCUMENTOS_DIR, storedName)).catch(() => {})
      throw error
    }
    // Substituição: a imagem antiga deixa de ser referenciada.
    if (anterior) await fs.unlink(documentoPath(anterior)).catch(() => {})

    await writeAudit({
      req,
      acao: 'UPLOAD_INTERCECAO_RELACAO_FOTO',
      entidade: 'IntercecaoRelacao',
      entidadeId: relacao.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        contacto: relacao.contacto,
        filename,
        tamanho: buffer.length,
        substituiu: anterior !== null,
      },
    }).catch(() => {})

    return Response.json({ ok: true }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

/** DELETE — remover a foto, mantendo a ficha. */
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
    if (!relacao.fotoStoredName) return apiError('Esta relação não tem foto', 404)

    await prisma.intercecaoRelacao.update({
      where: { id: relacao.id },
      data: { fotoStoredName: null, fotoFilename: null, fotoMimeType: null },
    })
    await fs.unlink(documentoPath(relacao.fotoStoredName)).catch(() => {})

    await writeAudit({
      req,
      acao: 'DELETE_INTERCECAO_RELACAO_FOTO',
      entidade: 'IntercecaoRelacao',
      entidadeId: relacao.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, contacto: relacao.contacto },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
