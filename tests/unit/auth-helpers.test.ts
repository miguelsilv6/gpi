import { describe, test, expect } from 'vitest'
import {
  buildInqueritoWhere,
  buildAtividadePrazoWhere,
  buildNotaInqueritoAutorWhere,
  canEditInquerito,
  getInqueritoColumnsVisibility,
} from '@/lib/role-scope'

/**
 * Garante que o scope-locking devolve as where-clauses certas. Estes testes
 * complementam o teste de integração contra a BD em
 * `tests/integration/scope-bypass.test.ts` — aqui validamos a forma do
 * objecto; lá validamos o resultado final da query.
 */

describe('buildInqueritoWhere', () => {
  test('INSPETOR: os seus próprios OU onde é colaborador ativo', () => {
    const where = buildInqueritoWhere('INSPETOR', 'user-id-1', 'brigada-1')
    // Disjunção: inspetorId próprio + colaboração ativa (sem prazo ou futura).
    expect(where.OR).toBeDefined()
    expect(where.OR).toContainEqual({ inspetorId: 'user-id-1' })
    const colabClause = (where.OR as Array<Record<string, unknown>>).find((c) => 'colaboradores' in c)
    expect(colabClause).toBeDefined()
    // A cláusula de colaboração filtra pelo utilizador e por não-expirada.
    const some = (colabClause!.colaboradores as { some: Record<string, unknown> }).some
    expect(some.colaboradorId).toBe('user-id-1')
    expect(some.OR).toBeDefined() // expiraEm null OU futura
  })

  test('INSPETOR_CHEFE limita à própria brigada', () => {
    const where = buildInqueritoWhere('INSPETOR_CHEFE', 'user-id-2', 'brigada-7')
    expect(where).toEqual({ brigadaId: 'brigada-7' })
  })

  test('INSPETOR_CHEFE sem brigada cai num sentinel impossível (fail-closed)', () => {
    const where = buildInqueritoWhere('INSPETOR_CHEFE', 'user-id-3', null)
    expect(where).toMatchObject({ id: expect.stringContaining('__inspetor_chefe_sem_brigada__') })
  })

  test('COORDENADOR/ESTATISTICA/ADMINISTRACAO devolvem where vazio (vê tudo)', () => {
    expect(buildInqueritoWhere('COORDENADOR', 'u', null)).toEqual({})
    expect(buildInqueritoWhere('ESTATISTICA', 'u', null)).toEqual({})
    expect(buildInqueritoWhere('ADMINISTRACAO', 'u', null)).toEqual({})
  })
})

describe('buildAtividadePrazoWhere', () => {
  test('INSPETOR limita a atividades.utilizadorId = user', () => {
    const where = buildAtividadePrazoWhere('INSPETOR', 'user-id-1', 'brigada-1')
    expect(where).toEqual({ utilizadorId: 'user-id-1' })
  })

  test('INSPETOR_CHEFE limita às próprias atividades (privacidade por proprietário)', () => {
    const where = buildAtividadePrazoWhere('INSPETOR_CHEFE', 'user-id-2', 'brigada-7')
    expect(where).toEqual({ utilizadorId: 'user-id-2' })
  })

  test('COORDENADOR limita às próprias atividades (privacidade por proprietário)', () => {
    expect(buildAtividadePrazoWhere('COORDENADOR', 'u', null)).toEqual({ utilizadorId: 'u' })
  })
})

describe('canEditInquerito', () => {
  const inq = { inspetorId: 'user-A', brigadaId: 'brigada-A' }

  test('INSPETOR edita só os próprios', () => {
    expect(canEditInquerito('INSPETOR', 'user-A', 'brigada-A', inq)).toBe(true)
    expect(canEditInquerito('INSPETOR', 'user-B', 'brigada-A', inq)).toBe(false)
  })

  test('INSPETOR_CHEFE edita os da sua brigada', () => {
    expect(canEditInquerito('INSPETOR_CHEFE', 'user-X', 'brigada-A', inq)).toBe(true)
    expect(canEditInquerito('INSPETOR_CHEFE', 'user-X', 'brigada-B', inq)).toBe(false)
  })

  test('INSPETOR_CHEFE sem brigada não edita nada', () => {
    expect(canEditInquerito('INSPETOR_CHEFE', 'user-X', null, inq)).toBe(false)
  })

  test('COORDENADOR e ADMINISTRACAO editam tudo (inquerito:edit:all)', () => {
    expect(canEditInquerito('COORDENADOR', 'u', null, inq)).toBe(true)
    expect(canEditInquerito('ADMINISTRACAO', 'u', null, inq)).toBe(true)
  })

  test('ESTATISTICA não tem edit (read-only role)', () => {
    expect(canEditInquerito('ESTATISTICA', 'u', null, inq)).toBe(false)
  })
})

describe('getInqueritoColumnsVisibility', () => {
  test('INSPETOR: oculta Inspetor (é sempre o próprio), mostra Denunciante e Prazo', () => {
    expect(getInqueritoColumnsVisibility('INSPETOR')).toEqual({
      showInspetor: false,
      showDenunciante: true,
      showPrazo: true,
    })
  })

  test('INSPETOR_CHEFE: mostra Inspetor e Denunciante, oculta Prazo', () => {
    expect(getInqueritoColumnsVisibility('INSPETOR_CHEFE')).toEqual({
      showInspetor: true,
      showDenunciante: true,
      showPrazo: false,
    })
  })

  test('COORDENADOR/ESTATISTICA/ADMINISTRACAO: mostra Inspetor e Prazo, oculta Denunciante', () => {
    for (const role of ['COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'] as const) {
      expect(getInqueritoColumnsVisibility(role)).toEqual({
        showInspetor: true,
        showDenunciante: false,
        showPrazo: true,
      })
    }
  })
})

describe('buildNotaInqueritoAutorWhere', () => {
  test('INSPETOR não tem restrição por autor (vê todas as notas a que tem acesso)', () => {
    expect(buildNotaInqueritoAutorWhere('INSPETOR', 'user-1')).toEqual({})
  })

  test('INSPETOR_CHEFE e superior só veem as próprias notas', () => {
    for (const role of ['INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'] as const) {
      expect(buildNotaInqueritoAutorWhere(role, 'user-1')).toEqual({ autorId: 'user-1' })
    }
  })
})
