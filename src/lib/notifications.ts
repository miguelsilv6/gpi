import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import type { TipoNotificacao } from '@/generated/prisma/enums'

interface CreateNotificationOpts {
  utilizadorId: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  inqueritoid?: string
  sendEmail?: boolean
  emailAddress?: string
}

export async function createNotification(opts: CreateNotificationOpts) {
  const notificacao = await prisma.notificacao.create({
    data: {
      utilizadorId: opts.utilizadorId,
      tipo: opts.tipo,
      titulo: opts.titulo,
      mensagem: opts.mensagem,
      inqueritoid: opts.inqueritoid ?? null,
    },
  })

  if (opts.sendEmail && opts.emailAddress) {
    try {
      await sendMail({
        to: opts.emailAddress,
        subject: opts.titulo,
        text: opts.mensagem,
        html: `<p>${opts.mensagem}</p>`,
      })
      await prisma.notificacao.update({
        where: { id: notificacao.id },
        data: { emailEnviado: true },
      })
    } catch {
      // Email failure is non-fatal
    }
  }

  return notificacao
}

export async function notifyAtividadeAdicionada(opts: {
  inqueritoid: string
  nuipc: string
  inspetorId: string | null
  inspetorEmail: string | null
  inspetorNome: string | null
  addedByUserId: string
}) {
  if (!opts.inspetorId || opts.inspetorId === opts.addedByUserId) return

  await createNotification({
    utilizadorId: opts.inspetorId,
    tipo: 'ATIVIDADE_ADICIONADA',
    titulo: `Nova atividade — ${opts.nuipc}`,
    mensagem: `Foi adicionada uma nova atividade ao inquérito ${opts.nuipc}.`,
    inqueritoid: opts.inqueritoid,
    sendEmail: true,
    emailAddress: opts.inspetorEmail ?? undefined,
  })
}

export async function notifyAtividadePrazo(opts: {
  descricao: string
  inqueritoid: string
  nuipc: string
  utilizadorId: string
  utilizadorEmail: string | null
  diasRestantes: number
  alertaNum: 1 | 2
}) {
  const dias = opts.diasRestantes === 0
    ? 'hoje'
    : opts.diasRestantes === 1
      ? 'amanhã'
      : `em ${opts.diasRestantes} dias`

  await createNotification({
    utilizadorId: opts.utilizadorId,
    tipo: 'ATIVIDADE_PRAZO_APROXIMANDO',
    titulo: `Prazo de atividade — ${opts.nuipc}`,
    mensagem: `A atividade "${opts.descricao}" do inquérito ${opts.nuipc} tem prazo ${dias}${opts.alertaNum === 2 ? ' (2.º aviso)' : ''}.`,
    inqueritoid: opts.inqueritoid,
    sendEmail: true,
    emailAddress: opts.utilizadorEmail ?? undefined,
  })
}

export async function notifyInqueritoAtribuido(opts: {
  inqueritoid: string
  nuipc: string
  inspetorId: string
  inspetorEmail: string
  inspetorNome: string
}) {
  await createNotification({
    utilizadorId: opts.inspetorId,
    tipo: 'INQUERITO_ATRIBUIDO',
    titulo: `Inquérito atribuído — ${opts.nuipc}`,
    mensagem: `O inquérito ${opts.nuipc} foi-lhe atribuído.`,
    inqueritoid: opts.inqueritoid,
    sendEmail: true,
    emailAddress: opts.inspetorEmail,
  })
}

export async function notifyInqueritoTransferido(opts: {
  inqueritoid: string
  nuipc: string
  brigadaOrigemChefeId: string | null
  brigadaOrigemChefeEmail: string | null
  brigadaDestinoChefeId: string | null
  brigadaDestinoChefeEmail: string | null
}) {
  const jobs: Promise<unknown>[] = []

  if (opts.brigadaOrigemChefeId) {
    jobs.push(
      createNotification({
        utilizadorId: opts.brigadaOrigemChefeId,
        tipo: 'INQUERITO_TRANSFERIDO',
        titulo: `Inquérito transferido — ${opts.nuipc}`,
        mensagem: `O inquérito ${opts.nuipc} foi transferido para outra brigada.`,
        inqueritoid: opts.inqueritoid,
        sendEmail: true,
        emailAddress: opts.brigadaOrigemChefeEmail ?? undefined,
      }),
    )
  }

  if (opts.brigadaDestinoChefeId) {
    jobs.push(
      createNotification({
        utilizadorId: opts.brigadaDestinoChefeId,
        tipo: 'INQUERITO_TRANSFERIDO',
        titulo: `Inquérito recebido — ${opts.nuipc}`,
        mensagem: `O inquérito ${opts.nuipc} foi transferido para a sua brigada.`,
        inqueritoid: opts.inqueritoid,
        sendEmail: true,
        emailAddress: opts.brigadaDestinoChefeEmail ?? undefined,
      }),
    )
  }

  await Promise.all(jobs)
}
