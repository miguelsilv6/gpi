/**
 * Resumo diário "O meu dia" por email — enviado nos dias úteis de manhã a
 * quem o ativou no Perfil (`Utilizador.resumoDiarioEmail`). Usa exatamente os
 * dados do bloco do dashboard (`getMeuDia`, mesmo âmbito por role) e o
 * template de email global. Não envia resumos vazios.
 */
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { getMeuDia, meuDiaTemConteudo, type MeuDiaData } from '@/lib/meu-dia'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { getEmailTemplateContext } from '@/lib/email-template-loader'
import { renderEmailHtml, renderEmailSubject, renderEmailText } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { childLogger } from '@/lib/logger'
import { formatDate, formatTime } from '@/lib/utils'
import type { AgendaEvent } from '@/lib/agenda'
import type { Role } from '@/generated/prisma/enums'

const log = childLogger({ subsystem: 'resumo-diario' })

const TIPO_LABEL: Record<AgendaEvent['tipo'], string> = {
  inquerito: 'Prazo',
  atividade: 'Atividade',
  controlo: 'Controlo',
  diligencia: 'Diligência',
}

function linhaEvento(ev: AgendaEvent): string {
  const hora = ev.tipo === 'diligencia' ? formatTime(ev.data) : null
  const partes = [
    TIPO_LABEL[ev.tipo],
    hora && hora !== '00:00' ? hora : null,
    ev.nuipc,
  ].filter(Boolean)
  return `• ${ev.titulo} (${partes.join(' · ')})`
}

/** Corpo em texto do resumo (o template trata do HTML/escape). */
export function formatResumoDiario(d: MeuDiaData, baseUrl: string): string {
  const blocos: string[] = []

  const a = d.atrasados
  const atrasados = [
    a.prazos > 0 && `${a.prazos} ${a.prazos === 1 ? 'prazo vencido' : 'prazos vencidos'}`,
    a.atividades > 0 && `${a.atividades} ${a.atividades === 1 ? 'atividade em atraso' : 'atividades em atraso'}`,
    a.controlos > 0 && `${a.controlos} ${a.controlos === 1 ? 'controlo em atraso' : 'controlos em atraso'}`,
  ].filter(Boolean)
  if (atrasados.length) blocos.push(`⚠ Em atraso: ${atrasados.join(' · ')}`)

  blocos.push(
    d.hoje.length
      ? `Hoje:\n${d.hoje.map(linhaEvento).join('\n')}`
      : 'Hoje: sem eventos.',
  )

  if (d.intercecoesTotal > 0) {
    const linhas = d.intercecoes.map(
      (l) => `• ${l.identificador} — ${l.alvoNome} (termina ${formatDate(l.dataFim)} · ${l.nuipc})`,
    )
    if (d.intercecoesTotal > d.intercecoes.length) {
      linhas.push(`• … e mais ${d.intercecoesTotal - d.intercecoes.length}`)
    }
    blocos.push(`Interceções a terminar (${d.intercecoesTotal}):\n${linhas.join('\n')}`)
  }

  if (d.tarefasTotal > 0) {
    const linhas = d.tarefas.map((t) => `• ${t.titulo} (${t.nuipc})`)
    if (d.tarefasTotal > d.tarefas.length) linhas.push(`• … e mais ${d.tarefasTotal - d.tarefas.length}`)
    blocos.push(`Tarefas em aberto (${d.tarefasTotal}):\n${linhas.join('\n')}`)
  }

  blocos.push(`Abrir o dashboard: ${baseUrl}/dashboard`)
  blocos.push('Pode desativar este resumo no seu Perfil.')
  return blocos.join('\n\n')
}

/**
 * Envia o resumo a todos os utilizadores ativos que o pediram. Erros de um
 * utilizador não impedem os restantes. Devolve contagens para o log.
 */
export async function runResumoDiario(now: Date = new Date()): Promise<{ enviados: number; vazios: number; falhas: number }> {
  const utilizadores = await prisma.utilizador.findMany({
    where: { ativo: true, resumoDiarioEmail: true },
    select: { id: true, email: true, role: true, brigadaId: true },
  })
  if (utilizadores.length === 0) return { enviados: 0, vazios: 0, falhas: 0 }

  const { tpl, appName } = await getEmailTemplateContext()
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const titulo = `O meu dia — ${formatDate(now)}`
  let enviados = 0
  let vazios = 0
  let falhas = 0

  for (const u of utilizadores) {
    const role = u.role as Role
    if (!hasPermission(role, 'prazo:read:own')) continue
    try {
      const intercecoes = await isModuloIntercecoesAtivo(role)
      const dia = await getMeuDia(role, u.id, u.brigadaId, now, { intercecoes })
      if (!meuDiaTemConteudo(dia)) {
        vazios++
        continue
      }
      const mensagem = formatResumoDiario(dia, baseUrl)
      await sendMail({
        to: u.email,
        subject: renderEmailSubject(tpl, { titulo, appName }),
        text: renderEmailText(tpl, { titulo, mensagem, appName }),
        html: renderEmailHtml(tpl, { titulo, mensagem, appName }),
      })
      enviados++
    } catch (err) {
      falhas++
      log.error({ err, utilizadorId: u.id }, 'Falha ao enviar resumo diário')
    }
  }
  return { enviados, vazios, falhas }
}
