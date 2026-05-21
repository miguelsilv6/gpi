import { describe, test, expect } from 'vitest'
import { formatValue } from '@/components/audit/diff-renderer'
import {
  acaoLabel,
  acaoColor,
  labelFor,
  FIELD_LABELS,
  ACAO_LABELS,
} from '@/components/audit/audit-labels'

/**
 * Testes do módulo partilhado de auditoria. Cobrem:
 *   - labels exhaustivos (ACAO_LABELS, FIELD_LABELS)
 *   - cores categóricas
 *   - formatValue: null/booleans/datas/arrays/objectos
 *
 * O dialog em si é integrado por inspecção manual / smoke; o critério
 * de qualidade é que os primitives sejam confiáveis.
 */

describe('acaoLabel + acaoColor', () => {
  test('devolve label conhecido', () => {
    expect(acaoLabel('UPDATE_INQUERITO')).toBe('Inquérito alterado')
    expect(acaoLabel('EXPORT_RELATORIO')).toBe('Relatório exportado')
  })

  test('fallback para o raw quando desconhecido', () => {
    expect(acaoLabel('FOO_BAR_BAZ')).toBe('FOO_BAR_BAZ')
  })

  test('cor por prefixo categórico', () => {
    expect(acaoColor('CREATE_INQUERITO')).toContain('green')
    expect(acaoColor('UPDATE_INQUERITO')).toContain('blue')
    expect(acaoColor('DELETE_INQUERITO')).toContain('red')
    expect(acaoColor('EXPORT_RELATORIO')).toContain('cyan')
    expect(acaoColor('BACKUP_FAILED')).toContain('amber')
    expect(acaoColor('RESTORE_BACKUP')).toContain('orange')
    expect(acaoColor('PASSWORD_RESET_COMPLETED')).toContain('pink')
    expect(acaoColor('BULK_ASSIGN')).toContain('indigo')
  })

  test('cor fallback para prefixo desconhecido', () => {
    expect(acaoColor('XYZ_QUE_NAO_EXISTE')).toContain('muted')
  })
})

describe('labelFor (field labels)', () => {
  test('traduz NUIPC, datas, denunciante', () => {
    expect(labelFor('nuipc')).toBe('NUIPC')
    expect(labelFor('dataAbertura')).toBe('Data de abertura')
    expect(labelFor('denuncianteNif')).toBe('Denunciante (NIF/NIPC)')
    expect(labelFor('inAppEnabled')).toBe('In-app')
  })

  test('fallback para a key raw', () => {
    expect(labelFor('campo_sem_label')).toBe('campo_sem_label')
  })
})

describe('formatValue', () => {
  test('null/undefined/string vazia → traço', () => {
    expect(formatValue('x', null)).toBe('—')
    expect(formatValue('x', undefined)).toBe('—')
    expect(formatValue('x', '')).toBe('—')
  })

  test('booleans → Sim/Não', () => {
    expect(formatValue('flag', true)).toBe('Sim')
    expect(formatValue('flag', false)).toBe('Não')
  })

  test('arrays renderizadas join(, ); array vazio = (vazio)', () => {
    expect(formatValue('roles', ['ADMIN', 'COORD'])).toBe('ADMIN, COORD')
    expect(formatValue('roles', [])).toBe('(vazio)')
  })

  test('campos de data formatados como pt-PT', () => {
    const out = formatValue('dataAbertura', '2026-05-21T00:00:00Z')
    // Pelo menos contém o ano + barras ou hífens
    expect(out).toMatch(/2026/)
  })

  test('objectos viram JSON', () => {
    const out = formatValue('whatever', { a: 1 })
    expect(out).toContain('"a": 1')
  })
})

describe('Coverage de labels (sanity)', () => {
  test('ACAO_LABELS tem pelo menos 20 entries', () => {
    expect(Object.keys(ACAO_LABELS).length).toBeGreaterThanOrEqual(20)
  })

  test('FIELD_LABELS cobre os campos chave de Inquerito', () => {
    for (const key of [
      'nuipc',
      'natureza',
      'dataAbertura',
      'dataConclusao',
      'inspetorId',
      'brigadaId',
    ]) {
      expect(FIELD_LABELS[key]).toBeDefined()
    }
  })
})
