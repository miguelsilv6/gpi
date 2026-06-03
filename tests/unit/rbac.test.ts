import { describe, test, expect } from 'vitest'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'

/**
 * Testes da matriz RBAC. Servem como documentação executável das permissões
 * — qualquer alteração ao mapa em `src/lib/rbac.ts` que parta um destes
 * testes força revisão consciente do impacto em produção.
 */

const ROLES: Role[] = ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO']

describe('hasPermission', () => {
  describe('permissions de leitura de inquéritos', () => {
    test('INSPETOR só lê os próprios', () => {
      expect(hasPermission('INSPETOR', 'inquerito:read:own')).toBe(true)
      expect(hasPermission('INSPETOR', 'inquerito:read:brigade')).toBe(false)
      expect(hasPermission('INSPETOR', 'inquerito:read:all')).toBe(false)
    })

    test('INSPETOR_CHEFE lê os da sua brigada', () => {
      expect(hasPermission('INSPETOR_CHEFE', 'inquerito:read:own')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'inquerito:read:brigade')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'inquerito:read:all')).toBe(false)
    })

    test('COORDENADOR, ESTATISTICA, ADMINISTRACAO leem todos', () => {
      expect(hasPermission('COORDENADOR', 'inquerito:read:all')).toBe(true)
      expect(hasPermission('ESTATISTICA', 'inquerito:read:all')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'inquerito:read:all')).toBe(true)
    })
  })

  describe('permissions destrutivas', () => {
    test('só ADMINISTRACAO pode apagar inquéritos', () => {
      for (const role of ROLES) {
        expect(hasPermission(role, 'inquerito:delete')).toBe(role === 'ADMINISTRACAO')
      }
    })

    test('só ADMINISTRACAO gere utilizadores', () => {
      for (const role of ROLES) {
        expect(hasPermission(role, 'utilizador:manage')).toBe(role === 'ADMINISTRACAO')
      }
    })

    test('só ADMINISTRACAO mexe em configurações do sistema', () => {
      for (const role of ROLES) {
        expect(hasPermission(role, 'sistema:config')).toBe(role === 'ADMINISTRACAO')
      }
    })

    test('só ADMINISTRACAO gere estados de inquérito', () => {
      for (const role of ROLES) {
        expect(hasPermission(role, 'inquerito:estados:manage')).toBe(role === 'ADMINISTRACAO')
      }
    })

    test('só ADMINISTRACAO gere o catálogo de crimes', () => {
      for (const role of ROLES) {
        expect(hasPermission(role, 'crime:manage')).toBe(role === 'ADMINISTRACAO')
      }
    })
  })

  describe('permissions de bulk operations', () => {
    test('INSPETOR não pode fazer bulk', () => {
      expect(hasPermission('INSPETOR', 'inquerito:bulk:brigade')).toBe(false)
      expect(hasPermission('INSPETOR', 'inquerito:bulk:all')).toBe(false)
    })

    test('INSPETOR_CHEFE pode bulk dentro da brigada mas não global', () => {
      expect(hasPermission('INSPETOR_CHEFE', 'inquerito:bulk:brigade')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'inquerito:bulk:all')).toBe(false)
    })

    test('COORDENADOR e ADMINISTRACAO podem bulk global', () => {
      expect(hasPermission('COORDENADOR', 'inquerito:bulk:all')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'inquerito:bulk:all')).toBe(true)
    })
  })

  describe('permissions de relatório (introduzidos no Sprint Relatórios)', () => {
    test('INSPETOR não tem relatorio:read', () => {
      expect(hasPermission('INSPETOR', 'relatorio:read')).toBe(false)
    })

    test('INSPETOR_CHEFE / COORDENADOR / ESTATISTICA / ADMINISTRACAO têm relatorio:read', () => {
      expect(hasPermission('INSPETOR_CHEFE', 'relatorio:read')).toBe(true)
      expect(hasPermission('COORDENADOR', 'relatorio:read')).toBe(true)
      expect(hasPermission('ESTATISTICA', 'relatorio:read')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'relatorio:read')).toBe(true)
    })
  })

  describe('permissions de exportação', () => {
    test('todos os roles exportam (INSPETOR incluído, scoped aos seus próprios inquéritos)', () => {
      expect(hasPermission('INSPETOR', 'inquerito:export')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'inquerito:export')).toBe(true)
      expect(hasPermission('COORDENADOR', 'inquerito:export')).toBe(true)
      expect(hasPermission('ESTATISTICA', 'inquerito:export')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'inquerito:export')).toBe(true)
    })
  })

  describe('permissions de férias', () => {
    test('INSPETOR só marca as suas (ferias:own), sem visão de brigada/todos', () => {
      expect(hasPermission('INSPETOR', 'ferias:own')).toBe(true)
      expect(hasPermission('INSPETOR', 'ferias:read:brigade')).toBe(false)
      expect(hasPermission('INSPETOR', 'ferias:read:all')).toBe(false)
      expect(hasPermission('INSPETOR', 'ferias:config')).toBe(false)
    })

    test('INSPETOR_CHEFE vê a sua brigada mas não todos nem config', () => {
      expect(hasPermission('INSPETOR_CHEFE', 'ferias:own')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'ferias:read:brigade')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'ferias:read:all')).toBe(false)
      expect(hasPermission('INSPETOR_CHEFE', 'ferias:config')).toBe(false)
    })

    test('COORDENADOR vê todos mas não tem config', () => {
      expect(hasPermission('COORDENADOR', 'ferias:read:all')).toBe(true)
      expect(hasPermission('COORDENADOR', 'ferias:config')).toBe(false)
    })

    test('ESTATISTICA não tem qualquer permissão de férias', () => {
      expect(hasPermission('ESTATISTICA', 'ferias:own')).toBe(false)
      expect(hasPermission('ESTATISTICA', 'ferias:read:all')).toBe(false)
    })

    test('ADMINISTRACAO tem todas as permissões de férias', () => {
      expect(hasPermission('ADMINISTRACAO', 'ferias:own')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'ferias:read:brigade')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'ferias:read:all')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'ferias:config')).toBe(true)
    })
  })

  test('hasPermission devolve false para permissão desconhecida', () => {
    // @ts-expect-error testando defesa contra string solta
    expect(hasPermission('ADMINISTRACAO', 'permissao:que:nao:existe')).toBe(false)
  })
})
