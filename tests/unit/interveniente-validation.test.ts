import { describe, test, expect } from 'vitest'
import {
  intervenienteCreateSchema,
  TIPO_INTERVENIENTE,
  TIPO_PESSOA,
  TIPO_INTERVENIENTE_LABEL,
  TIPO_PESSOA_LABEL,
} from '@/lib/validations/interveniente'

describe('intervenienteCreateSchema', () => {
  test('aceita um interveniente mínimo (tipo + nome)', () => {
    const r = intervenienteCreateSchema.safeParse({ tipo: 'LESADO', nome: 'João Silva' })
    expect(r.success).toBe(true)
  })

  test('rejeita sem nome', () => {
    const r = intervenienteCreateSchema.safeParse({ tipo: 'VITIMA', nome: '   ' })
    expect(r.success).toBe(false)
  })

  test('rejeita tipo inválido', () => {
    const r = intervenienteCreateSchema.safeParse({ tipo: 'DESCONHECIDO', nome: 'X' })
    expect(r.success).toBe(false)
  })

  test('tipo OUTRO exige tipoOutro', () => {
    const semDesc = intervenienteCreateSchema.safeParse({ tipo: 'OUTRO', nome: 'Entidade' })
    expect(semDesc.success).toBe(false)
    const comDesc = intervenienteCreateSchema.safeParse({
      tipo: 'OUTRO',
      tipoOutro: 'Fiel depositário',
      nome: 'Entidade',
    })
    expect(comDesc.success).toBe(true)
  })

  test('normaliza strings vazias para undefined', () => {
    const r = intervenienteCreateSchema.safeParse({
      tipo: 'TESTEMUNHA',
      nome: 'Ana',
      nif: '',
      email: '',
      notas: '   ',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.nif).toBeUndefined()
      expect(r.data.email).toBeUndefined()
      expect(r.data.notas).toBeUndefined()
    }
  })

  test('aceita natureza (tipoPessoa) dos valores conhecidos e rejeita outros', () => {
    expect(
      intervenienteCreateSchema.safeParse({ tipo: 'LESADO', nome: 'X', tipoPessoa: 'COLETIVA' })
        .success,
    ).toBe(true)
    expect(
      intervenienteCreateSchema.safeParse({ tipo: 'LESADO', nome: 'X', tipoPessoa: 'INVALIDO' })
        .success,
    ).toBe(false)
  })
})

describe('mapas de labels', () => {
  test('todos os tipos de interveniente têm label', () => {
    for (const t of TIPO_INTERVENIENTE) {
      expect(TIPO_INTERVENIENTE_LABEL[t]).toBeTruthy()
    }
  })

  test('todas as naturezas têm label', () => {
    for (const t of TIPO_PESSOA) {
      expect(TIPO_PESSOA_LABEL[t]).toBeTruthy()
    }
  })
})
