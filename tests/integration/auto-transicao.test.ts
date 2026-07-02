import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeBrigada, makeEstado, makeUtilizador, makeInquerito } from '../helpers/fixtures'
import { runAutoTransicoes } from '@/lib/auto-transicao'

/**
 * Transições automáticas por inatividade (runAutoTransicoes). Garante:
 *  - transita quem está no estado de origem há > N meses sem atividade;
 *  - NÃO transita quem entrou no estado recentemente nem quem teve atividade
 *    recente;
 *  - fallback: sem audit, usa o createdAt do inquérito;
 *  - aplica dataConclusao ao ir para estado terminal, audita e notifica.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

function monthsAgo(n: number, now = new Date()): Date {
  const d = new Date(now)
  d.setMonth(d.getMonth() - n)
  return d
}

/** Insere um AuditLog de mudança de estado (BULK_CHANGESTATE) num dado momento. */
async function auditEstadoChange(inqId: string, at: Date) {
  await prisma.auditLog.create({
    data: {
      acao: 'BULK_CHANGESTATE',
      entidade: 'Inquerito',
      entidadeId: inqId,
      utilizadorId: '__test__',
      detalhes: { after: { estadoCodigo: 'ENVIADO' } } as never,
      createdAt: at,
    },
  })
}

async function setupCenario() {
  const brigada = await makeBrigada(prisma, { nome: 'Brigada X' })
  const origem = await makeEstado(prisma, { codigo: 'ENVIADO', nome: 'Enviado', terminal: false })
  const destino = await makeEstado(prisma, { codigo: 'ARQUIVADO', nome: 'Arquivado', terminal: true })
  const inspetor = await makeUtilizador(prisma, {
    nome: 'Insp',
    email: 'insp@test.local',
    role: 'INSPETOR',
    brigadaId: brigada.id,
  })
  await prisma.regraTransicaoAutomatica.create({
    data: { origemId: origem.id, destinoId: destino.id, meses: 12, ativa: true },
  })
  // Policy para a notificação (o reset trunca tudo).
  await prisma.notificationPolicy.create({
    data: { tipo: 'TRANSICAO_AUTOMATICA', inAppEnabled: true, emailEnabled: false, ccRoles: [] },
  })
  return { brigada, origem, destino, inspetor }
}

describe('runAutoTransicoes', () => {
  test('transita inquéritos parados no estado há mais de N meses e ignora os recentes', async () => {
    const { brigada, origem, destino, inspetor } = await setupCenario()

    // A) Parado há 13 meses, sem atividade → transita.
    const parado = await makeInquerito(prisma, { estadoId: origem.id, brigadaId: brigada.id, inspetorId: inspetor.id, nuipc: 'A/PARADO' })
    await auditEstadoChange(parado.id, monthsAgo(13))

    // B) Entrou no estado há 13 meses MAS teve atividade há 2 meses → fica.
    const comAtividade = await makeInquerito(prisma, { estadoId: origem.id, brigadaId: brigada.id, inspetorId: inspetor.id, nuipc: 'B/ATIVO' })
    await auditEstadoChange(comAtividade.id, monthsAgo(13))
    await prisma.atividade.create({
      data: { descricao: 'Diligência', dataRealizacao: monthsAgo(2), inqueritoid: comAtividade.id, utilizadorId: inspetor.id },
    })

    // C) Entrou no estado há apenas 2 meses, sem atividade → fica.
    const recente = await makeInquerito(prisma, { estadoId: origem.id, brigadaId: brigada.id, inspetorId: inspetor.id, nuipc: 'C/RECENTE' })
    await auditEstadoChange(recente.id, monthsAgo(2))

    const result = await runAutoTransicoes()

    expect(result.transitados).toBe(1)
    const paradoAfter = await prisma.inquerito.findUnique({ where: { id: parado.id }, select: { estadoId: true, dataConclusao: true } })
    expect(paradoAfter!.estadoId).toBe(destino.id)
    expect(paradoAfter!.dataConclusao).not.toBeNull() // destino terminal
    expect((await prisma.inquerito.findUnique({ where: { id: comAtividade.id } }))!.estadoId).toBe(origem.id)
    expect((await prisma.inquerito.findUnique({ where: { id: recente.id } }))!.estadoId).toBe(origem.id)

    // Audit da transição automática por regra.
    const audit = await prisma.auditLog.findFirst({
      where: { entidadeId: parado.id, acao: 'AUTO_TRANSITION_INQUERITO' },
    })
    expect(audit).not.toBeNull()
    expect((audit!.detalhes as { origem?: string }).origem).toBe('regra_inatividade')

    // Notificação ao inspetor.
    const notif = await prisma.notificacao.findFirst({
      where: { utilizadorId: inspetor.id, tipo: 'TRANSICAO_AUTOMATICA' },
    })
    expect(notif).not.toBeNull()
    expect(notif!.inqueritoid).toBe(parado.id)
  })

  test('deteta mudança manual de estado via UPDATE_INQUERITO (changed é array) e não arquiva prematuramente', async () => {
    const { brigada, origem, destino } = await setupCenario()

    // Inquérito criado há muito, mas com uma alteração MANUAL de estado
    // recente (UPDATE_INQUERITO). O `detalhes.changed` é um ARRAY de nomes de
    // campos (formato do helper diff()) — o predicado @> tem de o apanhar,
    // senão arquivaria prematuramente.
    const inq = await prisma.inquerito.create({
      data: { nuipc: 'G/MANUAL', natureza: 'x', dataAbertura: monthsAgo(20), createdAt: monthsAgo(20), estadoId: origem.id, brigadaId: brigada.id },
    })
    await prisma.auditLog.create({
      data: {
        acao: 'UPDATE_INQUERITO',
        entidade: 'Inquerito',
        entidadeId: inq.id,
        utilizadorId: '__test__',
        detalhes: {
          changed: ['estadoCodigo', 'nome'],
          before: { estadoCodigo: 'EM_INVESTIGACAO' },
          after: { estadoCodigo: 'SUSPENSO' },
        } as never,
        createdAt: monthsAgo(2), // entrou no estado há só 2 meses (manualmente)
      },
    })

    const result = await runAutoTransicoes()
    expect(result.transitados).toBe(0)
    expect((await prisma.inquerito.findUnique({ where: { id: inq.id } }))!.estadoId).toBe(origem.id)

    // Contraprova: um UPDATE que NÃO mexeu no estado não conta como entrada —
    // se for a única referência, o fallback (createdAt, há 20 meses) arquiva.
    const inq2 = await prisma.inquerito.create({
      data: { nuipc: 'H/SEM_ESTADO', natureza: 'x', dataAbertura: monthsAgo(20), createdAt: monthsAgo(20), estadoId: origem.id, brigadaId: brigada.id },
    })
    await prisma.auditLog.create({
      data: {
        acao: 'UPDATE_INQUERITO',
        entidade: 'Inquerito',
        entidadeId: inq2.id,
        utilizadorId: '__test__',
        detalhes: { changed: ['nome'], before: { nome: 'a' }, after: { nome: 'b' } } as never,
        createdAt: monthsAgo(1),
      },
    })
    const result2 = await runAutoTransicoes()
    expect(result2.transitados).toBe(1)
    expect((await prisma.inquerito.findUnique({ where: { id: inq2.id } }))!.estadoId).toBe(destino.id)
  })

  test('fallback sem audit: usa o createdAt do inquérito', async () => {
    const { brigada, origem, destino } = await setupCenario()

    // Sem AuditLog de mudança de estado; createdAt há 14 meses → transita.
    const antigo = await prisma.inquerito.create({
      data: {
        nuipc: 'D/ANTIGO',
        natureza: 'x',
        dataAbertura: monthsAgo(14),
        createdAt: monthsAgo(14),
        estadoId: origem.id,
        brigadaId: brigada.id,
      },
    })

    const result = await runAutoTransicoes()
    expect(result.transitados).toBe(1)
    expect((await prisma.inquerito.findUnique({ where: { id: antigo.id } }))!.estadoId).toBe(destino.id)
  })

  test('regra inativa não transita nada', async () => {
    const { brigada, origem } = await setupCenario()
    await prisma.regraTransicaoAutomatica.updateMany({ data: { ativa: false } })
    const parado = await makeInquerito(prisma, { estadoId: origem.id, brigadaId: brigada.id, nuipc: 'E/PARADO' })
    await auditEstadoChange(parado.id, monthsAgo(24))

    const result = await runAutoTransicoes()
    expect(result.transitados).toBe(0)
    expect((await prisma.inquerito.findUnique({ where: { id: parado.id } }))!.estadoId).toBe(origem.id)
  })

  test('inquéritos soft-deleted são ignorados', async () => {
    const { brigada, origem } = await setupCenario()
    const apagado = await makeInquerito(prisma, { estadoId: origem.id, brigadaId: brigada.id, nuipc: 'F/APAGADO' })
    await auditEstadoChange(apagado.id, monthsAgo(24))
    await prisma.inquerito.update({ where: { id: apagado.id }, data: { deletedAt: new Date() } })

    const result = await runAutoTransicoes()
    expect(result.transitados).toBe(0)
  })
})
