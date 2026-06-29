import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador, makeBrigada, makeEstado, makeInquerito } from '../helpers/fixtures'
import { runPrazoLegalDigest } from '@/lib/cron'
import { invalidatePolicyCache } from '@/lib/notifications'
import { TipoNotificacao } from '@/generated/prisma/enums'
import { addMonths, addDays } from 'date-fns'

/**
 * Digest semanal de prazos legais: seleciona, por inspetor titular, os
 * inquéritos ativos com prazo legal a vencer (≤ limiar) ou ultrapassado, e
 * cria uma notificação agrupada. As prorrogações estendem o limite.
 */

process.env.DISABLE_EMAIL = 'true'
const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
  // applyPolicy é fail-closed: sem policy não há notificação.
  for (const tipo of Object.values(TipoNotificacao)) {
    await prisma.notificationPolicy.create({
      data: { tipo, inAppEnabled: true, emailEnabled: false, ccRoles: [] },
    })
  }
  invalidatePolicyCache()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('runPrazoLegalDigest', () => {
  test('agrupa por titular os prazos a vencer/ultrapassados; prorrogação estende', async () => {
    await prisma.configuracaoSistema.create({
      data: { id: 'singleton', prazoLegalMeses: 8, prazoLegalAlertaDias: 30 },
    })
    const brigada = await makeBrigada(prisma)
    const estado = await makeEstado(prisma, { codigo: 'ABERTO', terminal: false })
    const inspetor = await makeUtilizador(prisma, { brigadaId: brigada.id })
    const outro = await makeUtilizador(prisma, { brigadaId: brigada.id })

    const now = new Date()
    // Base = 8 meses → limite ≈ now + offsetDays.
    const abertura = (offsetDays: number) => addDays(addMonths(now, -8), offsetDays)

    // inspetor: vencido (~60d), a_vencer (~15d) e ok (~120d)
    await makeInquerito(prisma, { estadoId: estado.id, brigadaId: brigada.id, inspetorId: inspetor.id, nuipc: 'V/26', dataAbertura: abertura(-60) })
    await makeInquerito(prisma, { estadoId: estado.id, brigadaId: brigada.id, inspetorId: inspetor.id, nuipc: 'AV/26', dataAbertura: abertura(15) })
    await makeInquerito(prisma, { estadoId: estado.id, brigadaId: brigada.id, inspetorId: inspetor.id, nuipc: 'OK/26', dataAbertura: abertura(120) })

    // outro: seria vencido na base, mas prorrogado +12 meses → ok
    const prorrogado = await makeInquerito(prisma, { estadoId: estado.id, brigadaId: brigada.id, inspetorId: outro.id, nuipc: 'PR/26', dataAbertura: abertura(-60) })
    await prisma.prorrogacaoInquerito.create({ data: { inqueritoId: prorrogado.id, meses: 12, criadoPorId: inspetor.id } })

    const r = await runPrazoLegalDigest()
    expect(r.inspetores).toBe(1)
    expect(r.inqueritos).toBe(2)

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: inspetor.id, tipo: 'PRAZO_APROXIMANDO' },
    })
    expect(notifs).toHaveLength(1)
    expect(notifs[0].mensagem).toContain('V/26')
    expect(notifs[0].mensagem).toContain('AV/26')
    expect(notifs[0].mensagem).not.toContain('OK/26')

    // O titular do inquérito prorrogado (→ ok) não é notificado.
    const outroNotifs = await prisma.notificacao.findMany({ where: { utilizadorId: outro.id } })
    expect(outroNotifs).toHaveLength(0)
  })
})
