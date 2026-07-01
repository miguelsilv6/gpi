import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { findConexoes, getConexoesForInquerito } from '@/lib/conexoes'

/**
 * Conexões pelo denunciante (fase 1). Garante:
 *  - matching tolerante a formatação (NIF com espaços, contacto com +351);
 *  - âmbito por role (inspetor nunca vê fora do seu âmbito; coordenador vê);
 *  - o próprio inquérito e os soft-deleted nunca aparecem;
 *  - já-relacionados são omitidos na vista de detalhe.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

async function setDenunciante(
  id: string,
  den: { nif?: string; contacto?: string; email?: string },
) {
  await prisma.inquerito.update({
    where: { id },
    data: {
      denuncianteNif: den.nif ?? null,
      denuncianteContacto: den.contacto ?? null,
      denuncianteEmail: den.email ?? null,
    },
  })
}

describe('findConexoes', () => {
  test('NIF com formatação diferente liga na mesma; devolve o campo que coincidiu', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await setDenunciante(s.inqA[0].id, { nif: '123 456 789' })
    await setDenunciante(s.inqA[1].id, { nif: '123456789', email: 'x@y.pt' })

    const hits = await findConexoes(
      { nif: '123.456.789' },
      s.inqA[0].id,
      'INSPETOR',
      s.inspetorA.id,
      s.brigadaA.id,
    )
    expect(hits.map((h) => h.nuipc)).toEqual(['A-002/22'])
    expect(hits[0].matches).toEqual(['nif'])
  })

  test('contacto com indicativo +351 coincide com o número nacional', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await setDenunciante(s.inqA[1].id, { contacto: '+351 912 345 678' })

    const hits = await findConexoes(
      { contacto: '912345678' },
      null,
      'INSPETOR',
      s.inspetorA.id,
      s.brigadaA.id,
    )
    expect(hits.map((h) => h.nuipc)).toEqual(['A-002/22'])
    expect(hits[0].matches).toEqual(['contacto'])
  })

  test('âmbito: inspetor de A não vê match na brigada B; coordenador vê', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await setDenunciante(s.inqB[0].id, { email: 'Suspeito@Mail.PT' })

    const doInspetorA = await findConexoes(
      { email: 'suspeito@mail.pt' },
      null,
      'INSPETOR',
      s.inspetorA.id,
      s.brigadaA.id,
    )
    expect(doInspetorA).toHaveLength(0)

    const doCoordenador = await findConexoes(
      { email: 'suspeito@mail.pt' },
      null,
      'COORDENADOR',
      s.chefeA.id,
      null,
    )
    expect(doCoordenador.map((h) => h.nuipc)).toEqual(['B-001/22'])
    expect(doCoordenador[0].matches).toEqual(['email'])
  })

  test('soft-deleted e critérios curtos/vazios nunca devolvem nada', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await setDenunciante(s.inqA[1].id, { nif: '123456789' })
    await prisma.inquerito.update({ where: { id: s.inqA[1].id }, data: { deletedAt: new Date() } })

    expect(
      await findConexoes({ nif: '123456789' }, null, 'INSPETOR', s.inspetorA.id, s.brigadaA.id),
    ).toHaveLength(0)
    expect(
      await findConexoes({ nif: '12345' }, null, 'INSPETOR', s.inspetorA.id, s.brigadaA.id),
    ).toHaveLength(0)
    expect(
      await findConexoes({}, null, 'INSPETOR', s.inspetorA.id, s.brigadaA.id),
    ).toHaveLength(0)
  })
})

describe('getConexoesForInquerito', () => {
  test('usa o denunciante do inquérito, exclui o próprio e os já relacionados', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await setDenunciante(s.inqA[0].id, { nif: '999888777' })
    await setDenunciante(s.inqA[1].id, { nif: '999 888 777' })
    await setDenunciante(s.inqB[0].id, { nif: '999888777' })

    // Sem relações: o inspetor A vê a conexão A-002 (B-001 fora do âmbito).
    let hits = await getConexoesForInquerito(s.inqA[0].id, 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(hits.map((h) => h.nuipc)).toEqual(['A-002/22'])

    // Depois de formalizar a relação, deixa de aparecer como "possível".
    await prisma.inqueritoRelacao.create({
      data: { origemId: s.inqA[0].id, destinoId: s.inqA[1].id, criadoPorId: s.inspetorA.id, tipo: 'CONEXO' },
    })
    hits = await getConexoesForInquerito(s.inqA[0].id, 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(hits).toHaveLength(0)

    // O coordenador continua a ver a de B (não relacionada).
    const doCoord = await getConexoesForInquerito(s.inqA[0].id, 'COORDENADOR', s.chefeA.id, null)
    expect(doCoord.map((h) => h.nuipc)).toEqual(['B-001/22'])
  })

  test('inquérito sem dados de denunciante devolve lista vazia', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const hits = await getConexoesForInquerito(s.inqA[0].id, 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(hits).toEqual([])
  })
})
