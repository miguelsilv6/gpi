import { describe, test, expect } from 'vitest'
import { normalizarNif, normalizarContacto, normalizarEmail } from '@/lib/conexoes'

describe('normalizarNif', () => {
  test('remove formatação e aceita 9+ dígitos', () => {
    expect(normalizarNif('123 456 789')).toBe('123456789')
    expect(normalizarNif('123.456.789')).toBe('123456789')
    expect(normalizarNif('PT 123456789')).toBe('123456789')
  })

  test('rejeita curtos, vazios e nulos', () => {
    expect(normalizarNif('12345678')).toBeNull()
    expect(normalizarNif('')).toBeNull()
    expect(normalizarNif(null)).toBeNull()
    expect(normalizarNif(undefined)).toBeNull()
    expect(normalizarNif('abc')).toBeNull()
  })
})

describe('normalizarContacto', () => {
  test('reduz aos últimos 9 dígitos — absorve indicativo e formatação', () => {
    expect(normalizarContacto('912345678')).toBe('912345678')
    expect(normalizarContacto('912 345 678')).toBe('912345678')
    expect(normalizarContacto('+351 912 345 678')).toBe('912345678')
    expect(normalizarContacto('00351912345678')).toBe('912345678')
  })

  test('rejeita números com menos de 9 dígitos', () => {
    expect(normalizarContacto('12345')).toBeNull()
    expect(normalizarContacto('')).toBeNull()
    expect(normalizarContacto(null)).toBeNull()
  })
})

describe('normalizarEmail', () => {
  test('lowercase + trim', () => {
    expect(normalizarEmail('  Joao.Silva@Exemplo.PT ')).toBe('joao.silva@exemplo.pt')
  })

  test('rejeita sem @ ou vazio', () => {
    expect(normalizarEmail('nao-e-email')).toBeNull()
    expect(normalizarEmail('')).toBeNull()
    expect(normalizarEmail(null)).toBeNull()
  })
})
