import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'

/**
 * POST /api/inqueritos/[nuipc]/documentos — upload de anexos: scope e gate
 * operacional, validação de extensão/MIME, gravação em disco com SHA-256
 * (cadeia de custódia) e auditoria.
 */

const { authMock, dir } = await vi.hoisted(async () => {
  // DOCUMENTOS_DIR é lido no carregamento do módulo — definir antes do import.
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const d = mkdtempSync(join(tmpdir(), 'gpi-docs-'))
  process.env.DOCUMENTOS_DIR = d
  return { authMock: vi.fn(), dir: d }
})
vi.mock('@/auth', () => ({ auth: authMock }))

import { POST } from '@/app/api/inqueritos/[nuipc]/documentos/route'
import { _resetAllForTests } from '@/lib/rate-limit'
import { nuipcToSlug } from '@/lib/utils'

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
  authMock.mockReset()
  _resetAllForTests()
})

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true })
  await disconnectTestPrisma()
})

function asUser(u: { id: string; role: string; brigadaId: string | null }) {
  authMock.mockResolvedValue({
    user: { id: u.id, role: u.role, brigadaId: u.brigadaId, email: 'x@test.local', nome: 'X' },
  })
}

function upload(nuipc: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return POST(new NextRequest('http://localhost/api', { method: 'POST', body: form }), {
    params: Promise.resolve({ nuipc: nuipcToSlug(nuipc) }),
  })
}

describe('POST /api/inqueritos/[nuipc]/documentos', () => {
  test('o titular anexa: ficheiro em disco, SHA-256 registado e auditoria', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser({ id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id })
    const conteudo = 'relatório de vigilância'

    const res = await upload(s.inqA[0].nuipc, new File([conteudo], 'relatorio.txt', { type: 'text/plain' }))
    expect(res.status).toBe(201)
    const doc = await res.json()

    const esperado = createHash('sha256').update(Buffer.from(conteudo)).digest('hex')
    expect(doc.sha256).toBe(esperado)
    const row = await prisma.documento.findUniqueOrThrow({ where: { id: doc.id } })
    const emDisco = await fs.readFile(path.join(dir, row.storedName))
    expect(emDisco.toString()).toBe(conteudo)

    const audit = await prisma.auditLog.findFirst({ where: { acao: 'UPLOAD_DOCUMENTO', entidadeId: doc.id } })
    expect(audit?.utilizadorId).toBe(s.inspetorA.id)
  })

  test('fora do scope → 404 e nada é gravado', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser({ id: s.inspetorB.id, role: 'INSPETOR', brigadaId: s.brigadaB.id })
    const res = await upload(s.inqA[0].nuipc, new File(['x'], 'a.txt', { type: 'text/plain' }))
    expect(res.status).toBe(404)
    expect(await prisma.documento.count()).toBe(0)
  })

  test('rejeita extensão/MIME não permitidos e ficheiro vazio', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser({ id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id })
    const nuipc = s.inqA[0].nuipc

    expect((await upload(nuipc, new File(['x'], 'script.sh', { type: 'text/plain' }))).status).toBe(415)
    expect((await upload(nuipc, new File(['x'], 'a.txt', { type: 'application/x-msdownload' }))).status).toBe(415)
    expect((await upload(nuipc, new File([], 'vazio.txt', { type: 'text/plain' }))).status).toBe(400)
    expect(await prisma.documento.count()).toBe(0)
  })
})
