import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { childLogger } from '@/lib/logger'
import { getEmailTemplateContext } from '@/lib/email-template-loader'
import { renderEmailSubject, renderEmailText, renderEmailHtml } from '@/lib/email-template'
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

  // Preferências por utilizador: opt-out de email por tipo. A ausência de linha
  // = ativo (default on); só guardamos opt-outs explícitos. Não afeta o in-app.
  let emailOptOut = new Set<string>()
  // Template (global) dos e-mails — carregado uma vez por despacho (cache 60s).
  let emailCtx: Awaited<ReturnType<typeof getEmailTemplateContext>> | null = null
  if (policy.emailEnabled) {
    const prefs = await prisma.notificacaoPreferencia.findMany({
      where: {
        tipo: opts.tipo,
        emailEnabled: false,
        utilizadorId: { in: [...recipients.keys()] },
      },
      select: { utilizadorId: true },
    })
    emailOptOut = new Set(prefs.map((p) => p.utilizadorId))
    emailCtx = await getEmailTemplateContext()
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
      if (policy.emailEnabled && emailCtx && r.email && !emailOptOut.has(r.id)) {
        try {
          const content = { titulo: opts.titulo, mensagem: opts.mensagem, appName: emailCtx.appName }
          await sendMail({
            to: r.email,
            subject: renderEmailSubject(emailCtx.tpl, { titulo: opts.titulo, appName: emailCtx.appName }),
            text: renderEmailText(emailCtx.tpl, content),
            html: renderEmailHtml(emailCtx.tpl, content),
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
  /**
   * Quem efetuou a atribuição. Quando coincide com o inspetor (auto-atribuição),
   * não se notifica o próprio — mas os `ccRoles` configurados continuam a
   * receber. Mesma convenção de `notifyAtividadeAdicionada`. Omitir/null mantém
   * o comportamento anterior (notifica sempre o inspetor como natural).
   */
  assignedByUserId?: string | null
}): Promise<void> {
  const selfAssigned =
    opts.assignedByUserId != null && opts.assignedByUserId === opts.inspetorId

  await applyPolicy({
    tipo: 'INQUERITO_ATRIBUIDO',
    titulo: `Inquérito atribuído — ${opts.nuipc}`,
    mensagem: `O inquérito ${opts.nuipc} foi-lhe atribuído.`,
    inqueritoid: opts.inqueritoid,
    naturalUserId: selfAssigned ? null : opts.inspetorId,
  })
}

/**
 * Escala prazos de inquérito ultrapassados para o Inspetor-Chefe da brigada
 * respetiva — para além do aviso ao inspetor já feito pelo deadline-check.
 * Reutiliza o tipo PRAZO_ULTRAPASSADO (a policy controla in-app/email).
 *
 * Resolve um chefe por brigada (uma query batch) e notifica-o por cada
 * inquérito vencido cuja brigada lhe pertence — exceto quando o próprio chefe
 * é o inspetor atribuído (já foi avisado no loop principal).
 */
export async function escalateOverdueToChefes(
  overdue: { id: string; nuipc: string; brigadaId: string | null; inspetorId: string | null }[],
): Promise<void> {
  const brigadaIds = [...new Set(overdue.map((o) => o.brigadaId).filter((b): b is string => !!b))]
  if (brigadaIds.length === 0) return

  const chefes = await prisma.utilizador.findMany({
    where: { role: 'INSPETOR_CHEFE', ativo: true, brigadaId: { in: brigadaIds } },
    select: { id: true, brigadaId: true },
  })
  // Um chefe por brigada (o primeiro encontrado).
  const chefeByBrigada = new Map<string, string>()
  for (const c of chefes) {
    if (c.brigadaId && !chefeByBrigada.has(c.brigadaId)) {
      chefeByBrigada.set(c.brigadaId, c.id)
    }
  }
  if (chefeByBrigada.size === 0) return

  const jobs: Promise<unknown>[] = []
  for (const inq of overdue) {
    if (!inq.brigadaId) continue
    const chefeId = chefeByBrigada.get(inq.brigadaId)
    // Sem chefe na brigada, ou o chefe é o próprio inspetor (já avisado).
    if (!chefeId || chefeId === inq.inspetorId) continue
    jobs.push(
      applyPolicy({
        tipo: 'PRAZO_ULTRAPASSADO',
        titulo: `Prazo ultrapassado na brigada — ${inq.nuipc}`,
        mensagem: `O prazo do inquérito ${inq.nuipc} (sua brigada) foi ultrapassado.`,
        inqueritoid: inq.id,
        naturalUserId: chefeId,
      }),
    )
  }
  await Promise.all(jobs)
}

/**
 * Escala inquéritos com prazo a aproximar-se do limiar "urgente" (configurável
 * em ConfiguracaoSistema.prazoAlertaDiasUrgente) ao Inspetor-Chefe da brigada —
 * para além do aviso normal ao inspetor. Mesmo padrão de
 * `escalateOverdueToChefes`, mas usa PRAZO_APROXIMANDO com mensagem urgente e
 * salta quando o chefe é o próprio inspetor (já avisado no loop principal).
 */
export async function escalateUrgentToChefes(
  urgent: { id: string; nuipc: string; brigadaId: string | null; inspetorId: string | null }[],
): Promise<void> {
  const brigadaIds = [...new Set(urgent.map((o) => o.brigadaId).filter((b): b is string => !!b))]
  if (brigadaIds.length === 0) return

  const chefes = await prisma.utilizador.findMany({
    where: { role: 'INSPETOR_CHEFE', ativo: true, brigadaId: { in: brigadaIds } },
    select: { id: true, brigadaId: true },
  })
  const chefeByBrigada = new Map<string, string>()
  for (const c of chefes) {
    if (c.brigadaId && !chefeByBrigada.has(c.brigadaId)) {
      chefeByBrigada.set(c.brigadaId, c.id)
    }
  }
  if (chefeByBrigada.size === 0) return

  const jobs: Promise<unknown>[] = []
  for (const inq of urgent) {
    if (!inq.brigadaId) continue
    const chefeId = chefeByBrigada.get(inq.brigadaId)
    if (!chefeId || chefeId === inq.inspetorId) continue
    jobs.push(
      applyPolicy({
        tipo: 'PRAZO_APROXIMANDO',
        titulo: `Prazo urgente na brigada — ${inq.nuipc}`,
        mensagem: `O prazo do inquérito ${inq.nuipc} (sua brigada) está prestes a terminar.`,
        inqueritoid: inq.id,
        naturalUserId: chefeId,
      }),
    )
  }
  await Promise.all(jobs)
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

/**
 * Notifica os administradores (via ccRoles da policy BUGREPORT_CRIADO, que o
 * seed cria com [ADMINISTRACAO]) quando um utilizador submete um novo bug
 * report. Sem destinatário "natural" — o report dirige-se à administração.
 */
export async function notifyBugReportCriado(opts: {
  titulo: string
  autorNome: string
  severidadeLabel: string
}): Promise<void> {
  await applyPolicy({
    tipo: 'BUGREPORT_CRIADO',
    titulo: `Novo bug reportado — ${opts.titulo}`,
    mensagem: `${opts.autorNome} submeteu um relatório de bug (severidade: ${opts.severidadeLabel}). Consulte a gestão de bugs para analisar.`,
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
