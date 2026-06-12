import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { isModuloAnexosAtivo } from '@/lib/anexos-module'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { slugToNuipc } from '@/lib/utils'
import {
  DOCUMENTOS_DIR,
  DOCUMENTO_MAX_BYTES,
  DOCUMENTO_MIME_ALLOWLIST,
  sanitizeFilename,
} from '@/lib/documentos'
import type { Role } from '@/generated/prisma/enums'

const DOCUMENTO_SELECT = {
  id: true,
  filename: true,
  mimeType: true,
  tamanho: true,
  createdAt: true,
  uploadedBy: { select: { id: true, nome: true } },
} as const

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
  '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.7z', '.eml', '.msg',
])

/** Carrega o inquérito se o utilizador tiver acesso de leitura (scope RBAC). */
async function findInqueritoWithAccess(nuipc: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.inquerito.findFirst({
    where: {
      AND: [
        { nuipc },
        { deletedAt: null },
        buildInqueritoWhere(role, userId, brigadaId),
      ],
    },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloAnexosAtivo(role))) return apiError('Módulo de anexos desativado', 503)
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, session.user.brigadaId ?? null)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    const documentos = await prisma.documento.findMany({
      where: { inqueritoid: inquerito.id },
      orderBy: { createdAt: 'desc' },
      select: DOCUMENTO_SELECT,
    })
    return Response.json({ items: documentos })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloAnexosAtivo(role))) return apiError('Módulo de anexos desativado', 503)
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, session.user.brigadaId ?? null)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    // Upload segue a mesma regra de "quem pode adicionar atividades":
    // ESTATISTICA nunca; INSPETOR só nos seus; CHEFE só na sua brigada.
    const canUpload =
      role === 'ESTATISTICA' ? false :
      role === 'INSPETOR' ? inquerito.inspetorId === session.user.id :
      role === 'INSPETOR_CHEFE' ? inquerito.brigadaId === session.user.brigadaId :
      true
    if (!canUpload) return apiError('Sem permissão para anexar documentos neste inquérito', 403)

    const limited = enforceRateLimit({
      key: `documento:upload:${clientFingerprint(req)}:${session.user.id}`,
      max: 20,
      windowMs: 5 * 60_000,
    })
    if (limited) return limited

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return apiError('Ficheiro em falta', 400)
    if (file.size === 0) return apiError('Ficheiro vazio', 400)
    if (file.size > DOCUMENTO_MAX_BYTES) {
      return apiError(`Ficheiro demasiado grande (limite ${Math.floor(DOCUMENTO_MAX_BYTES / (1024 * 1024))} MB)`, 413)
    }
    if (!DOCUMENTO_MIME_ALLOWLIST.has(file.type)) {
      return apiError('Tipo de ficheiro não permitido', 415)
    }

    const filename = sanitizeFilename(file.name)
    const ext = path.extname(filename).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return apiError('Extensão de ficheiro não permitida', 415)
    }
    const storedName = `${randomUUID()}${ext.slice(0, 12)}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.mkdir(DOCUMENTOS_DIR, { recursive: true })
    await fs.writeFile(path.join(DOCUMENTOS_DIR, storedName), buffer, { mode: 0o644 })

    // Separar o rollback de disco do audit: se o DB falhar → apagar o ficheiro;
    // se o audit falhar → o upload já está persistido, não desfazer.
    const documento = await (async () => {
      try {
        return await prisma.documento.create({
          data: {
            filename,
            storedName,
            mimeType: file.type,
            tamanho: buffer.length,
            inqueritoid: inquerito.id,
            uploadedById: session.user.id,
          },
          select: DOCUMENTO_SELECT,
        })
      } catch (error) {
        await fs.unlink(path.join(DOCUMENTOS_DIR, storedName)).catch(() => {})
        throw error
      }
    })()

    await writeAudit({
      req,
      acao: 'UPLOAD_DOCUMENTO',
      entidade: 'Documento',
      entidadeId: documento.id,
      utilizadorId: session.user.id,
      detalhes: { filename, tamanho: buffer.length, nuipc: inquerito.nuipc },
    }).catch(() => {})

    return Response.json(documento, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
