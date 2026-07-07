import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { buildInqueritoWhere } from '@/lib/role-scope'
import {
  isColaboradorAtivo,
  canWorkOnInquerito,
  canManageColaboradores,
} from '@/lib/colaboradores'

/**
 * Colaboração autorizada: scope de leitura (buildInqueritoWhere passa a incluir
 * as colaborações ativas do INSPETOR), autorização de escrita operacional
 * (canWorkOnInquerito) e as regras de quem pode gerir (canManageColaboradores).
 * Cobre também a expiração das autorizações e a segurança (não-titular sem
 * autorização não vê nem escreve).
 */

const prisma = getTestPrisma()

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

async function findInqueritosVisiveis(userId: string, brigadaId: string | null) {
  const rows = await prisma.inquerito.findMany({
    where: { AND: [{ deletedAt: null }, buildInqueritoWhere('INSPETOR', userId, brigadaId)] },
    select: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('scope de leitura — colaborador ativo', () => {
  test('INSPETOR vê os seus + aqueles onde é colaborador ativo; não vê os alheios', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inqB = s.inqB[0] // titular: inspetorB (brigada B)

    // Sem colaboração: inspetorA (brigada A) não vê inqB.
    const antes = await findInqueritosVisiveis(s.inspetorA.id, s.brigadaA.id)
    expect(antes.has(inqB.id)).toBe(false)
    expect(antes.has(s.inqA[0].id)).toBe(true)

    // Autoriza inspetorA como colaborador de inqB (sem prazo).
    await prisma.inqueritoColaborador.create({
      data: { inqueritoid: inqB.id, colaboradorId: s.inspetorA.id, concedidoPorId: s.inspetorB.id },
    })

    const depois = await findInqueritosVisiveis(s.inspetorA.id, s.brigadaA.id)
    expect(depois.has(inqB.id)).toBe(true) // passa a ver o partilhado
    expect(depois.has(s.inqA[0].id)).toBe(true) // continua a ver os seus
  })

  test('colaboração expirada não concede acesso', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inqB = s.inqB[0]
    await prisma.inqueritoColaborador.create({
      data: {
        inqueritoid: inqB.id,
        colaboradorId: s.inspetorA.id,
        concedidoPorId: s.inspetorB.id,
        expiraEm: daysFromNow(-1), // já expirou
      },
    })
    const visiveis = await findInqueritosVisiveis(s.inspetorA.id, s.brigadaA.id)
    expect(visiveis.has(inqB.id)).toBe(false)
  })

  test('compõe com um filtro de pesquisa (OR) sem colisão nem fuga de scope', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inqB = s.inqB[0]
    await prisma.inqueritoColaborador.create({
      data: { inqueritoid: inqB.id, colaboradorId: s.inspetorA.id, concedidoPorId: s.inspetorB.id },
    })

    // Query no estilo da página de listagem: AND [ {OR: pesquisa}, scope ].
    const scope = buildInqueritoWhere('INSPETOR', s.inspetorA.id, s.brigadaA.id)
    const comPesquisa = await prisma.inquerito.findMany({
      where: {
        AND: [
          { deletedAt: null },
          { OR: [{ nuipc: { contains: inqB.nuipc, mode: 'insensitive' } }] },
          scope,
        ],
      },
      select: { id: true },
    })
    // A pesquisa pelo NUIPC do inquérito partilhado devolve-o (scope preservado).
    expect(comPesquisa.map((r) => r.id)).toContain(inqB.id)

    // A mesma pesquisa por um NUIPC alheio que NÃO é colaboração não devolve nada.
    const alheio = s.inqB[1]
    const semAcesso = await prisma.inquerito.findMany({
      where: {
        AND: [
          { deletedAt: null },
          { OR: [{ nuipc: { contains: alheio.nuipc, mode: 'insensitive' } }] },
          scope,
        ],
      },
      select: { id: true },
    })
    expect(semAcesso).toHaveLength(0)
  })
})

describe('isColaboradorAtivo', () => {
  test('ativo (sem prazo / prazo futuro) vs expirado vs inexistente', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inqB = s.inqB[0]

    expect(await isColaboradorAtivo(inqB.id, s.inspetorA.id)).toBe(false) // inexistente

    const c = await prisma.inqueritoColaborador.create({
      data: { inqueritoid: inqB.id, colaboradorId: s.inspetorA.id, concedidoPorId: s.inspetorB.id },
    })
    expect(await isColaboradorAtivo(inqB.id, s.inspetorA.id)).toBe(true) // sem prazo

    await prisma.inqueritoColaborador.update({ where: { id: c.id }, data: { expiraEm: daysFromNow(5) } })
    expect(await isColaboradorAtivo(inqB.id, s.inspetorA.id)).toBe(true) // prazo futuro

    await prisma.inqueritoColaborador.update({ where: { id: c.id }, data: { expiraEm: daysFromNow(-5) } })
    expect(await isColaboradorAtivo(inqB.id, s.inspetorA.id)).toBe(false) // expirado
  })
})

describe('canWorkOnInquerito — escrita operacional', () => {
  test('titular sim; colaborador ativo sim; expirado não; alheio não; ESTATISTICA nunca', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inqB = { id: s.inqB[0].id, inspetorId: s.inspetorB.id, brigadaId: s.brigadaB.id }

    // Titular (inspetorB) pode.
    expect(await canWorkOnInquerito('INSPETOR', s.inspetorB.id, s.brigadaB.id, inqB)).toBe(true)
    // Inspetor alheio sem colaboração: não.
    expect(await canWorkOnInquerito('INSPETOR', s.inspetorA.id, s.brigadaA.id, inqB)).toBe(false)

    // Com colaboração ativa: passa.
    const c = await prisma.inqueritoColaborador.create({
      data: { inqueritoid: inqB.id, colaboradorId: s.inspetorA.id, concedidoPorId: s.inspetorB.id },
    })
    expect(await canWorkOnInquerito('INSPETOR', s.inspetorA.id, s.brigadaA.id, inqB)).toBe(true)

    // Expirada: volta a negar.
    await prisma.inqueritoColaborador.update({ where: { id: c.id }, data: { expiraEm: daysFromNow(-1) } })
    expect(await canWorkOnInquerito('INSPETOR', s.inspetorA.id, s.brigadaA.id, inqB)).toBe(false)

    // ESTATISTICA nunca, mesmo com colaboração.
    await prisma.inqueritoColaborador.update({ where: { id: c.id }, data: { expiraEm: null } })
    expect(await canWorkOnInquerito('ESTATISTICA', s.inspetorA.id, s.brigadaA.id, inqB)).toBe(false)
  })

  test('CHEFE da brigada trabalha sem colaboração; COORDENADOR em qualquer', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inqB = { id: s.inqB[0].id, inspetorId: s.inspetorB.id, brigadaId: s.brigadaB.id }
    expect(await canWorkOnInquerito('INSPETOR_CHEFE', s.chefeB.id, s.brigadaB.id, inqB)).toBe(true)
    expect(await canWorkOnInquerito('INSPETOR_CHEFE', s.chefeA.id, s.brigadaA.id, inqB)).toBe(false)
    expect(await canWorkOnInquerito('COORDENADOR', s.chefeA.id, s.brigadaA.id, inqB)).toBe(true)
  })
})

describe('canManageColaboradores — quem concede/revoga', () => {
  test('titular e hierarquia sim; colaborador/alheio não (sem re-delegação)', () => {
    // inq fictício: titular = "titularId", brigada = "brigX".
    const inq = { inspetorId: 'titularId', brigadaId: 'brigX' }

    // Titular gere (mesmo sendo INSPETOR).
    expect(canManageColaboradores('INSPETOR', 'titularId', 'brigX', inq)).toBe(true)
    // Outro inspetor (ex.: um colaborador) NÃO gere — não pode re-delegar.
    expect(canManageColaboradores('INSPETOR', 'outroId', 'brigY', inq)).toBe(false)
    // Chefe da mesma brigada gere.
    expect(canManageColaboradores('INSPETOR_CHEFE', 'chefeId', 'brigX', inq)).toBe(true)
    // Chefe de outra brigada não.
    expect(canManageColaboradores('INSPETOR_CHEFE', 'chefeId', 'brigY', inq)).toBe(false)
    // Coordenador gere qualquer.
    expect(canManageColaboradores('COORDENADOR', 'coordId', null, inq)).toBe(true)
  })
})
