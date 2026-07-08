import { describe, test, expect } from 'vitest'
import { atividadeMutationAccess } from '@/lib/colaboradores'

/**
 * Decisão pura de quem pode concluir vs editar/eliminar uma atividade, agora
 * ciente da colaboração autorizada. Regressão para o bug em que um colaborador
 * (ou o titular perante uma atividade registada por outro) via os botões na UI
 * mas a API respondia 403.
 *
 *  - `canWork`       → concluir (trabalho operacional de qualquer autor).
 *  - `canEditEntry`  → editar metadados / eliminar (autor, ou hierarquia).
 */

const REL = {
  titularCreator: { isCreator: true, isTitular: true, isColaboradorAtivo: false, inBrigada: false },
  titularNaoAutor: { isCreator: false, isTitular: true, isColaboradorAtivo: false, inBrigada: false },
  colaboradorAutor: { isCreator: true, isTitular: false, isColaboradorAtivo: true, inBrigada: false },
  colaboradorNaoAutor: { isCreator: false, isTitular: false, isColaboradorAtivo: true, inBrigada: false },
  alheio: { isCreator: false, isTitular: false, isColaboradorAtivo: false, inBrigada: false },
  alheioMasAutor: { isCreator: true, isTitular: false, isColaboradorAtivo: false, inBrigada: false },
}

describe('atividadeMutationAccess', () => {
  test('ESTATISTICA nunca (nem conclui nem edita), mesmo sendo autor', () => {
    expect(atividadeMutationAccess('ESTATISTICA', REL.colaboradorAutor)).toEqual({
      canWork: false,
      canEditEntry: false,
    })
  })

  test('COORDENADOR e ADMINISTRACAO podem tudo, independentemente das relações', () => {
    for (const role of ['COORDENADOR', 'ADMINISTRACAO'] as const) {
      expect(atividadeMutationAccess(role, REL.alheio)).toEqual({ canWork: true, canEditEntry: true })
    }
  })

  test('INSPETOR_CHEFE: tudo na sua brigada, nada fora dela', () => {
    expect(
      atividadeMutationAccess('INSPETOR_CHEFE', { ...REL.alheio, inBrigada: true }),
    ).toEqual({ canWork: true, canEditEntry: true })
    expect(
      atividadeMutationAccess('INSPETOR_CHEFE', { ...REL.alheio, inBrigada: false }),
    ).toEqual({ canWork: false, canEditEntry: false })
  })

  test('INSPETOR titular e autor: conclui e edita', () => {
    expect(atividadeMutationAccess('INSPETOR', REL.titularCreator)).toEqual({
      canWork: true,
      canEditEntry: true,
    })
  })

  test('INSPETOR titular perante atividade de outro (ex.: do colaborador): conclui mas NÃO edita', () => {
    expect(atividadeMutationAccess('INSPETOR', REL.titularNaoAutor)).toEqual({
      canWork: true,
      canEditEntry: false,
    })
  })

  test('INSPETOR colaborador ativo e autor: conclui e edita as suas (o bug fixado)', () => {
    expect(atividadeMutationAccess('INSPETOR', REL.colaboradorAutor)).toEqual({
      canWork: true,
      canEditEntry: true,
    })
  })

  test('INSPETOR colaborador ativo perante atividade do titular: conclui mas NÃO edita', () => {
    expect(atividadeMutationAccess('INSPETOR', REL.colaboradorNaoAutor)).toEqual({
      canWork: true,
      canEditEntry: false,
    })
  })

  test('INSPETOR sem qualquer vínculo ao inquérito: nada, mesmo sendo autor da entrada', () => {
    expect(atividadeMutationAccess('INSPETOR', REL.alheio)).toEqual({
      canWork: false,
      canEditEntry: false,
    })
    // Autor mas já sem colaboração ativa (ex.: expirou): não trabalha nem edita.
    expect(atividadeMutationAccess('INSPETOR', REL.alheioMasAutor)).toEqual({
      canWork: false,
      canEditEntry: false,
    })
  })
})
