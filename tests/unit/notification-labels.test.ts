import { describe, test, expect } from 'vitest'
import {
  NOTIFICATION_TIPO_LABELS,
  NOTIFICATION_TIPO_DESCRIPTIONS,
  NOTIFICATION_TIPO_HAS_NATURAL,
  tipoNotificacaoLabel,
} from '@/lib/notification-labels'
import { TipoNotificacao } from '@/generated/prisma/enums'

/**
 * Invariantes do mapa de labels — garantem que ninguém adiciona um valor
 * novo ao enum sem documentar UI/help text/destinatário natural.
 */

describe('Notification labels coverage', () => {
  const enumValues = Object.values(TipoNotificacao)

  test('NOTIFICATION_TIPO_LABELS cobre todos os valores do enum', () => {
    for (const tipo of enumValues) {
      expect(NOTIFICATION_TIPO_LABELS[tipo]).toBeDefined()
      expect(NOTIFICATION_TIPO_LABELS[tipo].length).toBeGreaterThan(0)
    }
  })

  test('NOTIFICATION_TIPO_DESCRIPTIONS cobre todos os valores do enum', () => {
    for (const tipo of enumValues) {
      expect(NOTIFICATION_TIPO_DESCRIPTIONS[tipo]).toBeDefined()
      expect(NOTIFICATION_TIPO_DESCRIPTIONS[tipo].length).toBeGreaterThan(20)
    }
  })

  test('NOTIFICATION_TIPO_HAS_NATURAL cobre todos os valores do enum', () => {
    for (const tipo of enumValues) {
      expect(typeof NOTIFICATION_TIPO_HAS_NATURAL[tipo]).toBe('boolean')
    }
  })

  test('BACKUP_FALHOU é o único sem destinatário natural', () => {
    const semNatural = enumValues.filter((t) => !NOTIFICATION_TIPO_HAS_NATURAL[t])
    expect(semNatural).toEqual(['BACKUP_FALHOU'])
  })
})

describe('tipoNotificacaoLabel', () => {
  test('devolve label para tipo conhecido', () => {
    expect(tipoNotificacaoLabel('BACKUP_FALHOU')).toBe('Falha de backup/restauro')
  })

  test('devolve a string em raw para tipo desconhecido (defensivo)', () => {
    expect(tipoNotificacaoLabel('NAO_EXISTE')).toBe('NAO_EXISTE')
  })
})
