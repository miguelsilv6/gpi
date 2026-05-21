import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador, makeBrigada, makeEstado, makeInquerito } from '../helpers/fixtures'
import {
  applyPolicy,
  invalidatePolicyCache,
  notifyBackupFailed,
  notifyAtividadeAdicionada,
} from '@/lib/notifications'
import { TipoNotificacao } from '@/generated/prisma/enums'

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
  // Cada teste começa com as 7 policies em estado default (in-app on, email
  // on, ccRoles vazio — excepto BACKUP_FALHOU = ['ADMINISTRACAO']).
  for (const tipo of Object.values(TipoNotificacao)) {
    await prisma.notificationPolicy.create({
      data: {
        tipo,
        inAppEnabled: true,
        emailEnabled: true,
        ccRoles: tipo === 'BACKUP_FALHOU' ? ['ADMINISTRACAO'] : [],
      },
    })
  }
  invalidatePolicyCache()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('applyPolicy', () => {
  test('cria notificação para destinatário natural quando in-app está on', async () => {
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR' })

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inspetor.id,
    })

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: inspetor.id },
    })
    expect(notifs).toHaveLength(1)
    expect(notifs[0].tipo).toBe('INQUERITO_ATRIBUIDO')
  })

  test('com ccRoles, notifica natural + roles em CC, deduplicado', async () => {
    const brigada = await makeBrigada(prisma)
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR', brigadaId: brigada.id })
    const chefe = await makeUtilizador(prisma, { role: 'INSPETOR_CHEFE', brigadaId: brigada.id })

    // Configurar INQUERITO_ATRIBUIDO com ccRoles=['INSPETOR_CHEFE']
    await prisma.notificationPolicy.update({
      where: { tipo: 'INQUERITO_ATRIBUIDO' },
      data: { ccRoles: ['INSPETOR_CHEFE'] },
    })
    invalidatePolicyCache()

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inspetor.id,
    })

    const allNotifs = await prisma.notificacao.findMany({ orderBy: { createdAt: 'asc' } })
    expect(allNotifs).toHaveLength(2) // inspetor + chefe
    const userIds = new Set(allNotifs.map((n) => n.utilizadorId))
    expect(userIds).toEqual(new Set([inspetor.id, chefe.id]))
  })

  test('dedup quando natural está nos ccRoles (não duplica)', async () => {
    const admin = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })

    // BACKUP_FALHOU já tem ccRoles=['ADMINISTRACAO']. Se passarmos o admin
    // como natural também, só deve receber 1 notificação.
    await applyPolicy({
      tipo: 'BACKUP_FALHOU',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: admin.id,
    })

    const notifs = await prisma.notificacao.findMany({ where: { utilizadorId: admin.id } })
    expect(notifs).toHaveLength(1)
  })

  test('inAppEnabled=false não cria linha em Notificacao', async () => {
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR' })
    await prisma.notificationPolicy.update({
      where: { tipo: 'INQUERITO_ATRIBUIDO' },
      data: { inAppEnabled: false, emailEnabled: false },
    })
    invalidatePolicyCache()

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inspetor.id,
    })

    const notifs = await prisma.notificacao.count()
    expect(notifs).toBe(0)
  })

  test('utilizador inactivo NÃO recebe (mesmo como natural)', async () => {
    const inactive = await makeUtilizador(prisma, { role: 'INSPETOR', ativo: false })

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inactive.id,
    })

    const notifs = await prisma.notificacao.count()
    expect(notifs).toBe(0)
  })

  test('utilizador inactivo NÃO recebe (mesmo via ccRoles)', async () => {
    await makeUtilizador(prisma, { role: 'ADMINISTRACAO', ativo: false })
    await makeUtilizador(prisma, { role: 'ADMINISTRACAO', ativo: true })

    await notifyBackupFailed({ contexto: 'backup_agendado', error: 'teste' })

    const allNotifs = await prisma.notificacao.findMany({
      include: { utilizador: { select: { ativo: true } } },
    })
    // Apenas o admin activo recebe.
    expect(allNotifs).toHaveLength(1)
    expect(allNotifs[0].utilizador.ativo).toBe(true)
  })

  test('policy ausente para o tipo (fail-closed) não dispara nada', async () => {
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR' })
    // Apagar a policy para simular tipo recém-adicionado ao enum sem seed.
    await prisma.notificationPolicy.delete({ where: { tipo: 'INQUERITO_ATRIBUIDO' } })
    invalidatePolicyCache()

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inspetor.id,
    })

    expect(await prisma.notificacao.count()).toBe(0)
  })
})

describe('notifyBackupFailed (sem destinatário natural)', () => {
  test('notifica todos os admins activos com ccRoles=[ADMINISTRACAO]', async () => {
    const admin1 = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    const admin2 = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    await makeUtilizador(prisma, { role: 'COORDENADOR' }) // não devia receber

    await notifyBackupFailed({ contexto: 'backup_agendado', error: 'simulado' })

    const notifs = await prisma.notificacao.findMany()
    expect(notifs).toHaveLength(2)
    const userIds = new Set(notifs.map((n) => n.utilizadorId))
    expect(userIds).toEqual(new Set([admin1.id, admin2.id]))
  })

  test('se admin remover ADMINISTRACAO dos ccRoles, BACKUP_FALHOU não envia a ninguém', async () => {
    await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    await prisma.notificationPolicy.update({
      where: { tipo: 'BACKUP_FALHOU' },
      data: { ccRoles: [] },
    })
    invalidatePolicyCache()

    await notifyBackupFailed({ contexto: 'backup_agendado', error: 'simulado' })

    expect(await prisma.notificacao.count()).toBe(0)
  })
})

describe('notifyAtividadeAdicionada (skip self-notification)', () => {
  test('não notifica o próprio user quando ele é o inspetor', async () => {
    const brigada = await makeBrigada(prisma)
    const estado = await makeEstado(prisma)
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR', brigadaId: brigada.id })
    const inq = await makeInquerito(prisma, {
      brigadaId: brigada.id,
      estadoId: estado.id,
      inspetorId: inspetor.id,
    })

    await notifyAtividadeAdicionada({
      inqueritoid: inq.id,
      nuipc: inq.nuipc,
      inspetorId: inspetor.id,
      addedByUserId: inspetor.id, // mesma pessoa
    })

    expect(await prisma.notificacao.count()).toBe(0)
  })

  test('notifica o inspetor quando outra pessoa adiciona a atividade', async () => {
    const brigada = await makeBrigada(prisma)
    const estado = await makeEstado(prisma)
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR', brigadaId: brigada.id })
    const outro = await makeUtilizador(prisma, { role: 'INSPETOR', brigadaId: brigada.id })
    const inq = await makeInquerito(prisma, {
      brigadaId: brigada.id,
      estadoId: estado.id,
      inspetorId: inspetor.id,
    })

    await notifyAtividadeAdicionada({
      inqueritoid: inq.id,
      nuipc: inq.nuipc,
      inspetorId: inspetor.id,
      addedByUserId: outro.id,
    })

    const notifs = await prisma.notificacao.findMany({ where: { utilizadorId: inspetor.id } })
    expect(notifs).toHaveLength(1)
  })
})

describe('Cache invalidation', () => {
  test('após PUT (invalidate), próximo applyPolicy lê novos valores', async () => {
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR' })

    // Warm cache (policy default: in-app on)
    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'antes',
      mensagem: 'antes',
      naturalUserId: inspetor.id,
    })
    expect(await prisma.notificacao.count()).toBe(1)

    // Mudar policy + invalidar
    await prisma.notificationPolicy.update({
      where: { tipo: 'INQUERITO_ATRIBUIDO' },
      data: { inAppEnabled: false, emailEnabled: false },
    })
    invalidatePolicyCache()

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'depois',
      mensagem: 'depois',
      naturalUserId: inspetor.id,
    })

    // Continua a haver só a notificação do primeiro envio.
    expect(await prisma.notificacao.count()).toBe(1)
  })
})
