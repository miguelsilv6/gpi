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

  describe('reabertura de inquéritos terminais', () => {
    test('INSPETOR pode reabrir (o scope da rota limita aos seus próprios)', () => {
      expect(hasPermission('INSPETOR', 'inquerito:reopen')).toBe(true)
    })

    test('INSPETOR_CHEFE não tem reabertura; COORDENADOR e ADMINISTRACAO têm', () => {
      expect(hasPermission('INSPETOR_CHEFE', 'inquerito:reopen')).toBe(false)
      expect(hasPermission('COORDENADOR', 'inquerito:reopen')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'inquerito:reopen')).toBe(true)
      expect(hasPermission('ESTATISTICA', 'inquerito:reopen')).toBe(false)
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

  describe('permissions de histórico de auditoria do inquérito', () => {
    test('todos exceto ESTATISTICA veem o histórico (scoped ao seu âmbito de leitura)', () => {
      for (const role of ROLES) {
        expect(hasPermission(role, 'inquerito:audit:read')).toBe(role !== 'ESTATISTICA')
      }
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

  describe('permissions de ausências', () => {
    test('INSPETOR só marca as suas (ausencias:own), sem visão de brigada/todos', () => {
      expect(hasPermission('INSPETOR', 'ausencias:own')).toBe(true)
      expect(hasPermission('INSPETOR', 'ausencias:read:brigade')).toBe(false)
      expect(hasPermission('INSPETOR', 'ausencias:read:all')).toBe(false)
      expect(hasPermission('INSPETOR', 'ausencias:config')).toBe(false)
    })

    test('INSPETOR_CHEFE vê a sua brigada mas não todos nem config', () => {
      expect(hasPermission('INSPETOR_CHEFE', 'ausencias:own')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'ausencias:read:brigade')).toBe(true)
      expect(hasPermission('INSPETOR_CHEFE', 'ausencias:read:all')).toBe(false)
      expect(hasPermission('INSPETOR_CHEFE', 'ausencias:config')).toBe(false)
    })

    test('COORDENADOR vê todos mas não tem config', () => {
      expect(hasPermission('COORDENADOR', 'ausencias:read:all')).toBe(true)
      expect(hasPermission('COORDENADOR', 'ausencias:config')).toBe(false)
    })

    test('ESTATISTICA não tem qualquer permissão de ausências', () => {
      expect(hasPermission('ESTATISTICA', 'ausencias:own')).toBe(false)
      expect(hasPermission('ESTATISTICA', 'ausencias:read:all')).toBe(false)
    })

    test('ADMINISTRACAO tem todas as permissões de ausências', () => {
      expect(hasPermission('ADMINISTRACAO', 'ausencias:own')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'ausencias:read:brigade')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'ausencias:read:all')).toBe(true)
      expect(hasPermission('ADMINISTRACAO', 'ausencias:config')).toBe(true)
    })
  })

  test('hasPermission devolve false para permissão desconhecida', () => {
    // @ts-expect-error testando defesa contra string solta
    expect(hasPermission('ADMINISTRACAO', 'permissao:que:nao:existe')).toBe(false)
  })
})
