import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { childLogger } from '@/lib/logger'
import type { TipoNotificacao, Role } from '@/generated/prisma/enums'

const log = childLogger({ subsystem: 'notifications' })

/**
 * Sistema de notificações — policy-driven.
 *
 * Cada `TipoNotificacao` tem uma row em `NotificationPolicy` (gerida em
 * /configuracoes → Notificações pelo ADMINISTRACAO). A policy define:
 *   - inAppEnabled: cria linhas em `Notificacao`
 *   - emailEnabled: chama `sendMail()` (respeita também `DISABLE_EMAIL` global)
 *   - ccRoles: utilizadores com estes roles recebem em adição ao destinatário
 *     "natural" do contexto (inspetor do inquérito, criador da atividade,
 *     chefes das brigadas envolvidas...).
 *
 * Os helpers públicos (`notifyAtividadeAdicionada`, `notifyAtividadePrazo`,
 * etc.) delegam todos em `applyPolicy` — não duplicam a lógica de envio.
 */

// ─── Policy cache (TTL 60s) ──────────────────────────────────────────────────

interface CachedPolicy {
  policy: { inAppEnabled: boolean; emailEnabled: boolean; ccRoles: Role[] } | null
  expiresAt: number
}

const policyCache = new Map<TipoNotificacao, CachedPolicy>()
const POLICY_TTL_MS = 60_000

async function getPolicy(tipo: TipoNotificacao) {
  const cached = policyCache.get(tipo)
  if (cached && cached.expiresAt > Date.now()) return cached.policy

  const policy = await prisma.notificationPolicy.findUnique({
    where: { tipo },
    select: { inAppEnabled: true, emailEnabled: true, ccRoles: true },
  })
  policyCache.set(tipo, { policy, expiresAt: Date.now() + POLICY_TTL_MS })
  return policy
}

/**
 * Invalida o cache. Chamado pelo endpoint PUT após gravar mudanças. Em
 * deploys multi-processo (e.g. app + worker separados), cada processo tem
 * o seu Map — o worker pode demorar até 60s a ver mudanças via TTL. Para
 * v1 single-process é aceitável.
 */
export function invalidatePolicyCache(tipo?: TipoNotificacao): void {
  if (tipo) policyCache.delete(tipo)
  else policyCache.clear()
}

// ─── Core: applyPolicy ───────────────────────────────────────────────────────

interface ApplyPolicyOpts {
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  inqueritoid?: string | null
  /**
   * Destinatário "natural" — sempre incluído quando definido (e existe e
   * está activo). Quando o tipo não tem natural (e.g. BACKUP_FALHOU),
   * passar null. Excluir o `addedByUserId` antes de passar (e.g. quando o
   * próprio inspetor adicionou a atividade, não notificar a si mesmo).
   */
  naturalUserId?: string | null
}

/**
 * Despacho central de notificações. Resolve a policy do tipo, constrói a
 * lista de destinatários (natural + CC roles, deduplicado), e cria
 * notificações in-app/envia emails consoante a policy.
 *
 * Fail-closed para tipos sem policy em DB (race após adicionar valor ao
 * enum mas antes de seed correr): trata como "tudo desligado" e regista
 * warn — preferimos perder notificações temporariamente a duplicar/spammar.
 */
export async function applyPolicy(opts: ApplyPolicyOpts): Promise<void> {
  const policy = await getPolicy(opts.tipo)

  if (!policy) {
    log.warn({ tipo: opts.tipo }, 'Policy ausente — fail-closed (sem envio)')
    return
  }
  if (!policy.inAppEnabled && !policy.emailEnabled) return

  // Construir lista de destinatários (id, email, ativo).
  const recipients = new Map<string, { id: string; email: string | null }>()

  if (opts.naturalUserId) {
    const natural = await prisma.utilizador.findUnique({
      where: { id: opts.naturalUserId },
      select: { id: true, email: true, ativo: true },
    })
    if (natural && natural.ativo) {
      recipients.set(natural.id, { id: natural.id, email: natural.email })
    }
  }

  if (policy.ccRoles.length > 0) {
    const ccUsers = await prisma.utilizador.findMany({
      where: { ativo: true, role: { in: policy.ccRoles } },
      select: { id: true, email: true },
    })
    for (const u of ccUsers) {
      // Dedup: se o natural já está na lista, não duplicar.
      if (!recipients.has(u.id)) recipients.set(u.id, { id: u.id, email: u.email })
    }
  }

  if (recipients.size === 0) {
    // Tipo configurado mas sem destinatários (ex: BACKUP_FALHOU com
    // ccRoles vazio). Não logamos por defeito — pode ser intencional.
    return
  }

  await Promise.all(
    [...recipients.values()].map(async (r) => {
      let notificacaoId: string | null = null
      if (policy.inAppEnabled) {
        const n = await prisma.notificacao.create({
          data: {
            utilizadorId: r.id,
            tipo: opts.tipo,
            titulo: opts.titulo,
            mensagem: opts.mensagem,
            inqueritoid: opts.inqueritoid ?? null,
          },
        })
        notificacaoId = n.id
      }
      if (policy.emailEnabled && r.email) {
        try {
          await sendMail({
            to: r.email,
            subject: opts.titulo,
            text: opts.mensagem,
            html: `<p>${opts.mensagem.replace(/\n/g, '<br/>')}</p>`,
          })
          if (notificacaoId) {
            await prisma.notificacao.update({
              where: { id: notificacaoId },
              data: { emailEnviado: true },
            })
          }
        } catch (err) {
          // Falha de email é não-fatal — a notificação in-app já está em DB.
          log.warn({ err, tipo: opts.tipo, to: r.email }, 'sendMail falhou')
        }
      }
    }),
  )
}

// ─── Backwards-compat: helper genérico mantido ───────────────────────────────

interface CreateNotificationOpts {
  utilizadorId: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  inqueritoid?: string
  /** @deprecated O envio de email é agora controlado pela policy. Ignorado. */
  sendEmail?: boolean
  /** @deprecated Resolvido a partir do utilizadorId. Ignorado. */
  emailAddress?: string
}

/**
 * Helper de retro-compatibilidade. Antes do refactor enviava in-app + email
 * directamente. Agora delega em `applyPolicy` passando `naturalUserId` = o
 * `utilizadorId` indicado. O envio de email é decidido pela policy.
 */
export async function createNotification(opts: CreateNotificationOpts): Promise<void> {
  await applyPolicy({
    tipo: opts.tipo,
    titulo: opts.titulo,
    mensagem: opts.mensagem,
    inqueritoid: opts.inqueritoid ?? null,
    naturalUserId: opts.utilizadorId,
  })
}

// ─── Wrappers específicos por tipo ───────────────────────────────────────────

export async function notifyAtividadeAdicionada(opts: {
  inqueritoid: string
  nuipc: string
  inspetorId: string | null
  addedByUserId: string
}): Promise<void> {
  // Não notificar o próprio user que criou a atividade — só o inspetor
  // do inquérito, se diferente.
  if (!opts.inspetorId || opts.inspetorId === opts.addedByUserId) {
    // Mesmo sem natural, os CC roles ainda podem ser configurados para
    // receber. Passamos null para natural; applyPolicy itera os roles.
    await applyPolicy({
      tipo: 'ATIVIDADE_ADICIONADA',
      titulo: `Nova atividade — ${opts.nuipc}`,
      mensagem: `Foi adicionada uma nova atividade ao inquérito ${opts.nuipc}.`,
      inqueritoid: opts.inqueritoid,
      naturalUserId: null,
    })
    return
  }

  await applyPolicy({
    tipo: 'ATIVIDADE_ADICIONADA',
    titulo: `Nova atividade — ${opts.nuipc}`,
    mensagem: `Foi adicionada uma nova atividade ao inquérito ${opts.nuipc}.`,
    inqueritoid: opts.inqueritoid,
    naturalUserId: opts.inspetorId,
  })
}

export async function notifyAtividadePrazo(opts: {
  descricao: string
  inqueritoid: string
  nuipc: string
  utilizadorId: string
  diasRestantes: number
  alertaNum: 1 | 2
}): Promise<void> {
  const dias =
    opts.diasRestantes === 0
      ? 'hoje'
      : opts.diasRestantes === 1
        ? 'amanhã'
        : `em ${opts.diasRestantes} dias`

  await applyPolicy({
    tipo: 'ATIVIDADE_PRAZO_APROXIMANDO',
    titulo: `Prazo de atividade — ${opts.nuipc}`,
    mensagem: `A atividade "${opts.descricao}" do inquérito ${opts.nuipc} tem prazo ${dias}${opts.alertaNum === 2 ? ' (2.º aviso)' : ''}.`,
    inqueritoid: opts.inqueritoid,
    naturalUserId: opts.utilizadorId,
  })
}

export async function notifyInqueritoAtribuido(opts: {
  inqueritoid: string
  nuipc: string
  inspetorId: string
}): Promise<void> {
  await applyPolicy({
    tipo: 'INQUERITO_ATRIBUIDO',
    titulo: `Inquérito atribuído — ${opts.nuipc}`,
    mensagem: `O inquérito ${opts.nuipc} foi-lhe atribuído.`,
    inqueritoid: opts.inqueritoid,
    naturalUserId: opts.inspetorId,
  })
}

/**
 * Notifica falha de backup/restauro. Sem destinatário "natural" — depende
 * inteiramente dos `ccRoles` configurados (defaults a ['ADMINISTRACAO']
 * pelo seed). Se o admin remover ADMINISTRACAO da lista, ninguém recebe —
 * decisão consciente, com aviso na UI.
 */
export async function notifyBackupFailed(opts: {
  contexto: 'backup_agendado' | 'backup_manual' | 'restauro'
  error: string
}): Promise<void> {
  const contextoLabel =
    opts.contexto === 'backup_agendado'
      ? 'Backup agendado'
      : opts.contexto === 'backup_manual'
        ? 'Backup manual'
        : 'Restauro'

  const titulo = `${contextoLabel} falhou`
  const errSnippet =
    opts.error.length > 500 ? opts.error.slice(0, 500) + '…' : opts.error
  const mensagem = `Falha em ${contextoLabel.toLowerCase()} do GPI:\n\n${errSnippet}\n\nVerifique os logs do worker para detalhes.`

  await applyPolicy({
    tipo: 'BACKUP_FALHOU',
    titulo,
    mensagem,
    naturalUserId: null, // sem destinatário natural — só os CC roles
  })
}

/**
 * Notifica administradores quando o fluxo de auto-atualização falha. O envio
 * segue a NotificationPolicy do tipo (seed cria com ccRoles=[ADMINISTRACAO]).
 */
export async function notifyUpdateFailed(opts: {
  fromVersion: string
  toVersion: string
  phase: string
  error: string
  rolledBack: boolean
}): Promise<void> {
  const titulo = opts.rolledBack
    ? `Atualização ${opts.toVersion} revertida`
    : `Atualização para ${opts.toVersion} falhou`

  const errSnippet =
    opts.error.length > 500 ? opts.error.slice(0, 500) + '…' : opts.error

  const tailMsg = opts.rolledBack
    ? 'O sistema foi revertido para a versão anterior. Verifique os logs do worker e do gpi-updater.'
    : 'O sistema mantém-se em modo de manutenção. Intervenção manual exigida — consulte os logs do gpi-updater no host.'

  const mensagem =
    `Tentativa de atualização ${opts.fromVersion} → ${opts.toVersion} ` +
    `falhou na fase ${opts.phase}.\n\n${errSnippet}\n\n${tailMsg}`

  await applyPolicy({
    tipo: 'ATUALIZACAO_FALHOU',
    titulo,
    mensagem,
    naturalUserId: null,
  })
}

/**
 * Notifica administradores quando uma atualização termina com sucesso.
 */
export async function notifyUpdateConcluida(opts: {
  fromVersion: string
  toVersion: string
  durationMs: number
}): Promise<void> {
  const minutes = Math.round(opts.durationMs / 60000)
  const titulo = `Sistema atualizado para ${opts.toVersion}`
  const mensagem =
    `A atualização ${opts.fromVersion} → ${opts.toVersion} terminou com sucesso ` +
    `em cerca de ${minutes} minuto(s). O modo de manutenção foi desativado.`

  await applyPolicy({
    tipo: 'ATUALIZACAO_CONCLUIDA',
    titulo,
    mensagem,
    naturalUserId: null,
  })
}

export async function notifyInqueritoTransferido(opts: {
  inqueritoid: string
  nuipc: string
  brigadaOrigemChefeId: string | null
  brigadaDestinoChefeId: string | null
}): Promise<void> {
  const jobs: Promise<unknown>[] = []

  if (opts.brigadaOrigemChefeId) {
    jobs.push(
      applyPolicy({
        tipo: 'INQUERITO_TRANSFERIDO',
        titulo: `Inquérito transferido — ${opts.nuipc}`,
        mensagem: `O inquérito ${opts.nuipc} foi transferido para outra brigada.`,
        inqueritoid: opts.inqueritoid,
        naturalUserId: opts.brigadaOrigemChefeId,
      }),
    )
  }

  if (opts.brigadaDestinoChefeId) {
    jobs.push(
      applyPolicy({
        tipo: 'INQUERITO_TRANSFERIDO',
        titulo: `Inquérito recebido — ${opts.nuipc}`,
        mensagem: `O inquérito ${opts.nuipc} foi transferido para a sua brigada.`,
        inqueritoid: opts.inqueritoid,
        naturalUserId: opts.brigadaDestinoChefeId,
      }),
    )
  }

  await Promise.all(jobs)
}
