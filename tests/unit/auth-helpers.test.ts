import { describe, test, expect } from 'vitest'
import {
  buildInqueritoWhere,
  buildAtividadePrazoWhere,
  canEditInquerito,
} from '@/lib/role-scope'

/**
 * Garante que o scope-locking devolve as where-clauses certas. Estes testes
 * complementam o teste de integração contra a BD em
 * `tests/integration/scope-bypass.test.ts` — aqui validamos a forma do
 * objecto; lá validamos o resultado final da query.
 */

describe('buildInqueritoWhere', () => {
  test('INSPETOR limita a inqueritos.inspetorId = user', () => {
    const where = buildInqueritoWhere('INSPETOR', 'user-id-1', 'brigada-1')
    expect(where).toEqual({ inspetorId: 'user-id-1' })
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

  test('INSPETOR_CHEFE limita a atividades cujo inquérito está na sua brigada', () => {
    const where = buildAtividadePrazoWhere('INSPETOR_CHEFE', 'user-id-2', 'brigada-7')
    expect(where).toEqual({ inquerito: { brigadaId: 'brigada-7' } })
  })

  test('COORDENADOR vê todas as atividades', () => {
    expect(buildAtividadePrazoWhere('COORDENADOR', 'u', null)).toEqual({})
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
