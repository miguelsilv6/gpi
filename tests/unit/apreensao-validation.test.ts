import { describe, test, expect } from 'vitest'
import {
  apreensaoCreateSchema,
  TIPO_APREENSAO,
  ESTADO_APREENSAO,
  TIPO_APREENSAO_LABEL,
  ESTADO_APREENSAO_LABEL,
  ESTADO_APREENSAO_TERMINAL,
} from '@/lib/validations/apreensao'

describe('apreensaoCreateSchema', () => {
  test('aceita uma apreensão mínima (descrição + tipo + data)', () => {
    const r = apreensaoCreateSchema.safeParse({
      descricao: 'Pistola Glock 17',
      tipo: 'ARMA',
      dataApreensao: '2026-01-10',
    })
    expect(r.success).toBe(true)
  })

  test('rejeita sem descrição', () => {
    const r = apreensaoCreateSchema.safeParse({
      descricao: '   ',
      tipo: 'ARMA',
      dataApreensao: '2026-01-10',
    })
    expect(r.success).toBe(false)
  })

  test('rejeita tipo inválido', () => {
    const r = apreensaoCreateSchema.safeParse({
      descricao: 'X',
      tipo: 'FOGUETE',
      dataApreensao: '2026-01-10',
    })
    expect(r.success).toBe(false)
  })

  test('rejeita data inválida', () => {
    const r = apreensaoCreateSchema.safeParse({
      descricao: 'X',
      tipo: 'OUTRO',
      tipoOutro: 'Chave',
      dataApreensao: 'ontem',
    })
    expect(r.success).toBe(false)
  })

  test('tipo OUTRO exige tipoOutro', () => {
    const sem = apreensaoCreateSchema.safeParse({
      descricao: 'Objeto',
      tipo: 'OUTRO',
      dataApreensao: '2026-01-10',
    })
    expect(sem.success).toBe(false)
    const com = apreensaoCreateSchema.safeParse({
      descricao: 'Objeto',
      tipo: 'OUTRO',
      tipoOutro: 'Ferramenta',
      dataApreensao: '2026-01-10',
    })
    expect(com.success).toBe(true)
  })

  test('normaliza strings vazias para undefined', () => {
    const r = apreensaoCreateSchema.safeParse({
      descricao: 'Telemóvel',
      tipo: 'EQUIPAMENTO_INFORMATICO',
      dataApreensao: '2026-01-10',
      numeroAuto: '',
      local: '   ',
      apreendidoA: '',
      dataDestino: '',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.numeroAuto).toBeUndefined()
      expect(r.data.local).toBeUndefined()
      expect(r.data.apreendidoA).toBeUndefined()
      expect(r.data.dataDestino).toBeUndefined()
    }
  })

  test('aceita estado dos valores conhecidos e rejeita outros', () => {
    expect(
      apreensaoCreateSchema.safeParse({
        descricao: 'X',
        tipo: 'DINHEIRO',
        dataApreensao: '2026-01-10',
        estado: 'PERDIDO_A_FAVOR_ESTADO',
      }).success,
    ).toBe(true)
    expect(
      apreensaoCreateSchema.safeParse({
        descricao: 'X',
        tipo: 'DINHEIRO',
        dataApreensao: '2026-01-10',
        estado: 'PERDIDO',
      }).success,
    ).toBe(false)
  })
})

describe('mapas de labels', () => {
  test('todos os tipos têm label', () => {
    for (const t of TIPO_APREENSAO) {
      expect(TIPO_APREENSAO_LABEL[t]).toBeTruthy()
    }
  })

  test('todos os estados têm label', () => {
    for (const e of ESTADO_APREENSAO) {
      expect(ESTADO_APREENSAO_LABEL[e]).toBeTruthy()
    }
  })

  test('o conjunto de estados terminais são exatamente os que dão destino', () => {
    expect([...ESTADO_APREENSAO_TERMINAL].sort()).toEqual(
      ['DESTRUIDO', 'DEVOLVIDO', 'PERDIDO_A_FAVOR_ESTADO'].sort(),
    )
    // Os terminais são um subconjunto próprio dos estados válidos.
    for (const e of ESTADO_APREENSAO_TERMINAL) {
      expect(ESTADO_APREENSAO).toContain(e)
    }
    expect(ESTADO_APREENSAO_TERMINAL.has('EM_CUSTODIA')).toBe(false)
    expect(ESTADO_APREENSAO_TERMINAL.has('A_AGUARDAR_EXAME')).toBe(false)
  })
})
