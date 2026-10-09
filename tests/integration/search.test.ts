import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import {
  searchInqueritos,
  searchNotas,
  searchAtividades,
  searchDocumentos,
  searchOutros,
} from '@/lib/search'

/**
 * Testes da pesquisa global (paleta de comandos). Cobrem dois ângulos:
 *
 *  1. Full-text (Português) em notas e atividades — incluindo stemming.
 *  2. Scope-locking por role: o termo de pesquisa nunca pode alargar o âmbito.
 *     Em particular, as notas seguem a regra do separador /notas
 *     (não-INSPETOR só vê as suas).
 *
 * Nota: o test DB é provisionado por `db push`, que não cria os índices GIN de
 * expressão (são funcionais, ignorados pelo Prisma). A pesquisa continua
 * correta via sequential scan, pelo que estes testes validam o comportamento
 * independentemente do índice.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('searchInqueritos — scope por role', () => {
  test('INSPETOR_CHEFE só encontra inquéritos da sua brigada', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    const a = await searchInqueritos('22', 'INSPETOR_CHEFE', s.chefeA.id, s.brigadaA.id)
    const nuipcs = a.map((i) => i.nuipc).sort()
    expect(nuipcs).toEqual(['A-001/22', 'A-002/22'])
  })

  test('INSPETOR só encontra os seus próprios inquéritos', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    const a = await searchInqueritos('22', 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(a.map((i) => i.nuipc).sort()).toEqual(['A-001/22', 'A-002/22'])

    // Procurar pelo NUIPC de B explicitamente não fura o scope.
    const cross = await searchInqueritos('B-001', 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(cross).toHaveLength(0)
  })

  test('COORDENADOR encontra inquéritos de qualquer brigada', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const all = await searchInqueritos('22', 'COORDENADOR', s.chefeA.id, null)
    expect(all.length).toBe(5)
  })
})

describe('searchNotas — full-text + scope + restrição de autor', () => {
  test('encontra por full-text com stemming português e respeita o scope', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.notaInquerito.create({
      data: {
        titulo: 'Vigilância',
        conteudo: 'Operação especial de vigilância no bairro.',
        inqueritoId: s.inqA[0].id,
        autorId: s.inspetorA.id,
      },
    })
    await prisma.notaInquerito.create({
      data: {
        conteudo: 'Operação distinta na brigada Bravo.',
        inqueritoId: s.inqB[0].id,
        autorId: s.inspetorB.id,
      },
    })

    // "operações" (plural) encontra "operação" (singular) — stemming.
    const aResults = await searchNotas('operações', 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(aResults.map((n) => n.nuipc)).toEqual(['A-001/22'])

    // Inspetor de B não vê a nota de A, mesmo procurando o mesmo termo.
    const bResults = await searchNotas('operação', 'INSPETOR', s.inspetorB.id, s.brigadaB.id)
    expect(bResults.map((n) => n.nuipc)).toEqual(['B-001/22'])
  })

  test('não-INSPETOR só vê as notas que escreveu (regra do separador /notas)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // Nota escrita pelo INSPETOR de A, num inquérito da brigada do chefe A.
    await prisma.notaInquerito.create({
      data: {
        conteudo: 'Apreensão de telemóvel relevante.',
        inqueritoId: s.inqA[0].id,
        autorId: s.inspetorA.id,
      },
    })

    // O chefe A NÃO a vê (não é o autor), apesar de ser da sua brigada.
    const chefe = await searchNotas('apreensão', 'INSPETOR_CHEFE', s.chefeA.id, s.brigadaA.id)
    expect(chefe).toHaveLength(0)

    // O inspetor A (autor) vê-a.
    const insp = await searchNotas('apreensão', 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(insp).toHaveLength(1)
  })

  test('snippet remove marcas de Markdown', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.notaInquerito.create({
      data: {
        conteudo: '## Título\n**Diligência** importante registada.',
        inqueritoId: s.inqA[0].id,
        autorId: s.inspetorA.id,
      },
    })
    const r = await searchNotas('diligência', 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(r).toHaveLength(1)
    expect(r[0].snippet).not.toContain('#')
    expect(r[0].snippet).not.toContain('*')
    expect(r[0].snippet).toContain('Diligência importante')
  })
})

describe('searchAtividades — full-text + scope', () => {
  test('encontra por descrição/observações e respeita o scope', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.atividade.create({
      data: {
        descricao: 'Pedido de exame pericial',
        observacoes: 'Análise forense ao telemóvel apreendido.',
        inqueritoid: s.inqA[0].id,
        utilizadorId: s.inspetorA.id,
      },
    })

    const found = await searchAtividades('forense', 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(found.map((a) => a.nuipc)).toEqual(['A-001/22'])

    // Inspetor de B não vê a atividade de A.
    const other = await searchAtividades('forense', 'INSPETOR', s.inspetorB.id, s.brigadaB.id)
    expect(other).toHaveLength(0)
  })
})

describe('searchDocumentos — substring + scope', () => {
  test('encontra por nome de ficheiro (case-insensitive) e respeita o scope', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.documento.create({
      data: {
        filename: 'Relatorio_Pericial.pdf',
        storedName: `stored-${Date.now()}`,
        mimeType: 'application/pdf',
        tamanho: 100,
        inqueritoid: s.inqA[0].id,
        uploadedById: s.inspetorA.id,
      },
    })

    const found = await searchDocumentos('pericial', 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(found.map((d) => d.filename)).toEqual(['Relatorio_Pericial.pdf'])

    const other = await searchDocumentos('pericial', 'INSPETOR', s.inspetorB.id, s.brigadaB.id)
    expect(other).toHaveLength(0)
  })
})

describe('searchOutros — intervenientes, interceções, apreensões, perícias, tarefas', () => {
  const todos = { intercecoes: true, apreensoes: true, pericias: true }

  async function cenario() {
    const s = await scenarioTwoBrigadas(prisma)
    const inq = s.inqA[0]
    await prisma.interveniente.create({
      data: { inqueritoid: inq.id, tipo: 'TESTEMUNHA', nome: 'Joaquim Ferreira', nif: '123456789' },
    })
    const alvo = await prisma.intercecaoAlvo.create({ data: { inqueritoid: inq.id, nome: 'Alvo Norte' } })
    await prisma.intercecaoLinha.create({
      data: {
        alvoId: alvo.id,
        codigo: '1A',
        tipo: 'SIM',
        identificador: '912345678',
        dataInicio: new Date('2026-01-01'),
        dataFim: new Date('2026-03-01'),
      },
    })
    await prisma.apreensao.create({
      data: {
        inqueritoid: inq.id,
        descricao: 'Telemóvel Samsung',
        tipo: 'OUTRO',
        dataApreensao: new Date('2026-01-10'),
        registadoPorId: s.inspetorA.id,
      },
    })
    await prisma.pericia.create({
      data: {
        inqueritoid: inq.id,
        tipo: 'OUTRO',
        descricao: 'Extração forense do telemóvel',
        dataPedido: new Date('2026-01-12'),
        registadoPorId: s.inspetorA.id,
      },
    })
    await prisma.tarefaInquerito.create({
      data: { inqueritoId: inq.id, autorId: s.inspetorA.id, titulo: 'Pedir faturação detalhada' },
    })
    return s
  }

  test('encontra cada entidade pelo termo e aponta para o inquérito', async () => {
    const s = await cenario()
    const tipos = async (q: string) =>
      (await searchOutros(q, 'INSPETOR', s.inspetorA.id, s.brigadaA.id, todos)).map((h) => h.tipo)

    expect(await tipos('joaquim')).toEqual(['interveniente'])
    expect(await tipos('123456789')).toEqual(['interveniente'])
    expect(await tipos('912345')).toEqual(['intercecao'])
    expect(await tipos('samsung')).toEqual(['apreensao'])
    expect(await tipos('forense')).toEqual(['pericia'])
    expect(await tipos('faturação')).toEqual(['tarefa'])

    const [linha] = await searchOutros('912345', 'INSPETOR', s.inspetorA.id, s.brigadaA.id, todos)
    expect(linha.href).toBe(`/inqueritos/${linha.slug}/intercecoes`)
    expect(linha.nuipc).toBe(s.inqA[0].nuipc)
  })

  test('o termo nunca fura o scope e as tarefas são só do autor', async () => {
    const s = await cenario()
    const outroInspetor = await searchOutros('joaquim', 'INSPETOR', s.inspetorB.id, s.brigadaB.id, todos)
    expect(outroInspetor).toHaveLength(0)

    // O chefe da brigada vê o inquérito, mas não as tarefas pessoais do inspetor.
    const chefe = await searchOutros('faturação', 'INSPETOR_CHEFE', s.chefeA.id, s.brigadaA.id, todos)
    expect(chefe).toHaveLength(0)
  })

  test('módulos desativados não são pesquisados', async () => {
    const s = await cenario()
    const nenhum = { intercecoes: false, apreensoes: false, pericias: false }
    const hits = await searchOutros('telem', 'INSPETOR', s.inspetorA.id, s.brigadaA.id, nenhum)
    expect(hits.filter((h) => h.tipo === 'apreensao' || h.tipo === 'pericia')).toHaveLength(0)
    expect(await searchOutros('912345', 'INSPETOR', s.inspetorA.id, s.brigadaA.id, nenhum)).toHaveLength(0)
  })
})
