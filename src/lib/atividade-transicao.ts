/**
 * Auto state-transition triggered by activity creation.
 *
 * Some `AtividadePadrao` entries are configured to move the parent inquérito
 * to a specific estado when an Atividade of that type is created. This helper
 * encapsulates that side-effect so the POST /api/atividades route stays
 * focused on the activity itself.
 *
 * Behaviour:
 *  - If the padrão has no transition target → no-op.
 *  - If the target estado was deleted / deactivated → log AUTO_TRANSITION_SKIPPED.
 *  - If the state machine rejects the transition → log AUTO_TRANSITION_SKIPPED.
 *  - Otherwise → update inquerito.estadoId (+ dataConclusao if terminal),
 *    log AUTO_TRANSITION_INQUERITO.
 *
 * Always runs inside the caller's transaction (a `tx` client must be passed)
 * so that the atividade creation and the transition stay atomic.
 */
import type { Prisma } from '@/generated/prisma/client'
import type { NextRequest } from 'next/server'
import { canTransition } from '@/lib/inquerito-state'
import { getRequestInfo } from '@/lib/request-info'

export type TransicaoResult =
  | { applied: false; skipped: false }
  | { applied: false; skipped: true; reason: 'estado_alvo_invalido' | 'transicao_invalida' }
  | {
      applied: true
      skipped: false
      novoEstado: { id: string; codigo: string; nome: string; terminal: boolean }
    }

interface Args {
  tx: Prisma.TransactionClient
  atividade: { id: string; descricao: string; dataRealizacao: Date }
  inquerito: {
    id: string
    estadoId: string
    estado: { id: string; codigo: string; terminal: boolean; ativo: boolean }
  }
  utilizadorId: string
  req: NextRequest | Request
}

const ESTADO_SELECT = {
  id: true,
  codigo: true,
  nome: true,
  terminal: true,
  ativo: true,
} as const

export async function applyAtividadeTransicao({
  tx,
  atividade,
  inquerito,
  utilizadorId,
  req,
}: Args): Promise<TransicaoResult> {
  // Find the AtividadePadrao that matches this Atividade's descricao
  // (Atividade.descricao is a snapshot of AtividadePadrao.nome).
  const padrao = await tx.atividadePadrao.findUnique({
    where: { nome: atividade.descricao },
    select: { id: true, nome: true, transicaoEstadoId: true },
  })

  if (!padrao || !padrao.transicaoEstadoId) {
    return { applied: false, skipped: false }
  }

  const targetEstado = await tx.estadoInquerito.findUnique({
    where: { id: padrao.transicaoEstadoId },
    select: ESTADO_SELECT,
  })

  const { ip, userAgent } = getRequestInfo(req)
  const auditBase = {
    entidade: 'Inquerito',
    entidadeId: inquerito.id,
    utilizadorId,
    ip,
    userAgent,
  }

  if (!targetEstado || !targetEstado.ativo) {
    await tx.auditLog.create({
      data: {
        ...auditBase,
        acao: 'AUTO_TRANSITION_SKIPPED',
        detalhes: {
          reason: 'estado_alvo_invalido',
          atividadeId: atividade.id,
          atividadePadraoId: padrao.id,
          atividadePadraoNome: padrao.nome,
          estadoAlvoId: padrao.transicaoEstadoId,
        } as never,
      },
    })
    return { applied: false, skipped: true, reason: 'estado_alvo_invalido' }
  }

  // No-op if already in the target state.
  if (targetEstado.id === inquerito.estadoId) {
    return { applied: false, skipped: false }
  }

  if (!canTransition(inquerito.estado, targetEstado)) {
    await tx.auditLog.create({
      data: {
        ...auditBase,
        acao: 'AUTO_TRANSITION_SKIPPED',
        detalhes: {
          reason: 'transicao_invalida',
          atividadeId: atividade.id,
          atividadePadraoId: padrao.id,
          atividadePadraoNome: padrao.nome,
          estadoAnterior: inquerito.estado.codigo,
          estadoAlvo: targetEstado.codigo,
        } as never,
      },
    })
    return { applied: false, skipped: true, reason: 'transicao_invalida' }
  }

  // Apply: set estadoId, and dataConclusao if terminal.
  const dataConclusaoSet = targetEstado.terminal ? atividade.dataRealizacao : null

  await tx.inquerito.update({
    where: { id: inquerito.id },
    data: {
      estadoId: targetEstado.id,
      // Only overwrite dataConclusao when transitioning into a terminal state.
      // Keep existing dataConclusao when transitioning between non-terminals.
      ...(targetEstado.terminal && { dataConclusao: dataConclusaoSet }),
    },
  })

  await tx.auditLog.create({
    data: {
      ...auditBase,
      acao: 'AUTO_TRANSITION_INQUERITO',
      detalhes: {
        atividadeId: atividade.id,
        atividadePadraoId: padrao.id,
        atividadePadraoNome: padrao.nome,
        estadoAnterior: inquerito.estado.codigo,
        estadoNovo: targetEstado.codigo,
        dataConclusaoSet: dataConclusaoSet?.toISOString() ?? null,
      } as never,
    },
  })

  return {
    applied: true,
    skipped: false,
    novoEstado: {
      id: targetEstado.id,
      codigo: targetEstado.codigo,
      nome: targetEstado.nome,
      terminal: targetEstado.terminal,
    },
  }
}
