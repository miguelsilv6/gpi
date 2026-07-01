import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeBrigada, makeCrime, makeUtilizador } from '../helpers/fixtures'
import { resolveAuditDetalhesNames } from '@/lib/audit-resolve'

/**
 * Histórico de alterações: campos de FK (crimeId, tribunalId, seccaoId,
 * inspetorId, brigadaId, comarcaId) guardados em `AuditLog.detalhes` devem
 * ser mostrados pelo nome da entidade, não o id em bruto — em qualquer dos
 * shapes usados pelas rotas que escrevem auditoria (diff antes/depois,
 * key-value plano, before/after aninhado sem `changed`).
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

// Tribunal/Seccao/Comarca não são truncadas por resetDatabase (não fazem
// parte da lista de tabelas limpas entre testes), e `nome` é @unique em
// Tribunal/Comarca — sufixo único para não colidir com execuções anteriores
// na mesma BD de teste.
let counter = 0
const uniq = () => `${Date.now()}-${++counter}`

async function makeTribunal(nome: string) {
  return prisma.tribunal.create({ data: { nome: `${nome} ${uniq()}` } })
}
async function makeSeccao(nome: string) {
  return prisma.seccao.create({ data: { nome: `${nome} ${uniq()}` } })
}
async function makeComarca(nome: string) {
  return prisma.comarca.create({ data: { nome: `${nome} ${uniq()}` } })
}

describe('resolveAuditDetalhesNames', () => {
  test('shape de diff (UPDATE_INQUERITO): resolve crimeId/tribunalId/seccaoId/inspetorId em before e after', async () => {
    const [crimeA, crimeB] = await Promise.all([makeCrime(prisma), makeCrime(prisma)])
    const [tribA, tribB] = await Promise.all([makeTribunal('Tribunal A'), makeTribunal('Tribunal B')])
    const [seccA, seccB] = await Promise.all([makeSeccao('Secção A'), makeSeccao('Secção B')])
    const [userA, userB] = await Promise.all([makeUtilizador(prisma), makeUtilizador(prisma)])

    const logs = [
      {
        detalhes: {
          changed: ['crimeId', 'tribunalId', 'seccaoId', 'inspetorId'],
          before: { crimeId: crimeA.id, tribunalId: tribA.id, seccaoId: seccA.id, inspetorId: userA.id },
          after: { crimeId: crimeB.id, tribunalId: tribB.id, seccaoId: seccB.id, inspetorId: userB.id },
        },
      },
    ]

    await resolveAuditDetalhesNames(logs)

    const d = logs[0]!.detalhes as {
      before: Record<string, string>
      after: Record<string, string>
    }
    expect(d.before.crimeId).toBe(crimeA.nome)
    expect(d.before.tribunalId).toBe(tribA.nome)
    expect(d.before.seccaoId).toBe(seccA.nome)
    expect(d.before.inspetorId).toBe(userA.nome)
    expect(d.after.crimeId).toBe(crimeB.nome)
    expect(d.after.tribunalId).toBe(tribB.nome)
    expect(d.after.seccaoId).toBe(seccB.nome)
    expect(d.after.inspetorId).toBe(userB.nome)
  })

  test('shape plano (CREATE_INQUERITO): resolve brigadaId/inspetorId e não mexe em campos já legíveis', async () => {
    const brigada = await makeBrigada(prisma)
    const inspetor = await makeUtilizador(prisma, { brigadaId: brigada.id })

    const logs = [
      {
        detalhes: {
          nuipc: '123/25.0GAABC',
          crimeNome: 'Furto',
          estadoCodigo: 'ABERTO',
          brigadaId: brigada.id,
          inspetorId: inspetor.id,
        },
      },
    ]

    await resolveAuditDetalhesNames(logs)

    const d = logs[0]!.detalhes as Record<string, string>
    expect(d.brigadaId).toBe(brigada.nome)
    expect(d.inspetorId).toBe(inspetor.nome)
    // Campos que já eram nomes/códigos human-readable ficam inalterados.
    expect(d.nuipc).toBe('123/25.0GAABC')
    expect(d.crimeNome).toBe('Furto')
    expect(d.estadoCodigo).toBe('ABERTO')
  })

  test('before/after aninhado sem "changed" (BULK_*): resolve brigadaId em ambos os lados', async () => {
    const [brigadaA, brigadaB] = await Promise.all([makeBrigada(prisma), makeBrigada(prisma)])

    const logs = [
      {
        detalhes: {
          nuipc: '456/25.0GAABC',
          before: { estadoCodigo: 'ABERTO', brigadaId: brigadaA.id, inspetorId: null },
          after: { brigadaId: brigadaB.id, inspetorId: null },
        },
      },
    ]

    await resolveAuditDetalhesNames(logs)

    const d = logs[0]!.detalhes as {
      before: Record<string, unknown>
      after: Record<string, unknown>
    }
    expect(d.before.brigadaId).toBe(brigadaA.nome)
    expect(d.after.brigadaId).toBe(brigadaB.nome)
    // null preservado, sem rebentar.
    expect(d.before.inspetorId).toBeNull()
    expect(d.after.inspetorId).toBeNull()
  })

  test('id que já não existe (registo apagado) fica como estava — não desaparece', async () => {
    const logs = [{ detalhes: { crimeId: 'id-que-nao-existe-123' } }]

    await resolveAuditDetalhesNames(logs)

    expect((logs[0]!.detalhes as Record<string, string>).crimeId).toBe('id-que-nao-existe-123')
  })

  test('detalhes nulo ou não-objeto não rebenta', async () => {
    const logs: { detalhes: unknown }[] = [{ detalhes: null }, { detalhes: 'string qualquer' }, { detalhes: {} }]

    await expect(resolveAuditDetalhesNames(logs)).resolves.not.toThrow()
    expect(logs[0]!.detalhes).toBeNull()
    expect(logs[1]!.detalhes).toBe('string qualquer')
  })

  test('inspetorRemovido (TRANSFER_INQUERITO) resolvido ao nível de topo', async () => {
    const inspetor = await makeUtilizador(prisma)
    const logs = [{ detalhes: { inspetorRemovido: inspetor.id, estadoNovo: 'DISTRIBUIDO' } }]

    await resolveAuditDetalhesNames(logs)

    const d = logs[0]!.detalhes as Record<string, string>
    expect(d.inspetorRemovido).toBe(inspetor.nome)
    expect(d.estadoNovo).toBe('DISTRIBUIDO')
  })

  test('comarcaId (diff de Tribunal/Secção) resolvido em before/after', async () => {
    const [comarcaA, comarcaB] = await Promise.all([makeComarca('Comarca A'), makeComarca('Comarca B')])
    const logs = [
      {
        detalhes: {
          changed: ['comarcaId'],
          before: { comarcaId: comarcaA.id },
          after: { comarcaId: comarcaB.id },
        },
      },
    ]

    await resolveAuditDetalhesNames(logs)

    const d = logs[0]!.detalhes as { before: Record<string, string>; after: Record<string, string> }
    expect(d.before.comarcaId).toBe(comarcaA.nome)
    expect(d.after.comarcaId).toBe(comarcaB.nome)
  })
})
