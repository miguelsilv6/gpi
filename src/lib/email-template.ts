/**
 * Template (global) dos e-mails de notificação — puro e sem dependências de
 * servidor, para poder ser reutilizado na pré-visualização do lado do cliente.
 *
 * O admin personaliza um formulário estruturado (cabeçalho, cor, saudação,
 * rodapé, aviso legal, prefixo do assunto); o sistema gera o HTML. O título e
 * a mensagem de CADA notificação entram como conteúdo — aqui apenas os
 * "envolvemos" com a marca. Todo o conteúdo injetado é escapado.
 */

export interface EmailTemplate {
  /** Mostrar a faixa de cabeçalho com o nome da aplicação. */
  mostrarCabecalho: boolean
  /** Cor de destaque (hex #rrggbb) do cabeçalho e do título. */
  corDestaque: string
  /** Linha de saudação (ex.: "Olá,"). Suporta {appName}. */
  saudacao: string
  /** Texto de rodapé/assinatura. Suporta {appName}. */
  rodape: string
  /** Aviso legal / letra miúda (opcional). Suporta {appName}. */
  avisoLegal: string
  /** Prefixo do assunto (ex.: "[GPI]"). Suporta {appName}. Vazio = sem prefixo. */
  assuntoPrefixo: string
}

export const EMAIL_TEMPLATE_DEFAULTS: EmailTemplate = {
  mostrarCabecalho: true,
  corDestaque: '#1d4ed8',
  saudacao: 'Olá,',
  rodape: 'Mensagem automática do {appName}. Por favor, não responda a este e-mail.',
  avisoLegal: '',
  assuntoPrefixo: '',
}

/** Limites de comprimento (espelhados no zod do endpoint). */
export const EMAIL_TEMPLATE_LIMITS = {
  saudacao: 120,
  rodape: 500,
  avisoLegal: 500,
  assuntoPrefixo: 40,
} as const

/** Escapa uma string para inserção segura em HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Cor hex válida, ou o default se inválida (evita injeção no atributo style). */
function safeColor(c: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : EMAIL_TEMPLATE_DEFAULTS.corDestaque
}

/** Substitui {appName} num campo de texto do admin e escapa para HTML. */
function fieldHtml(text: string, appName: string): string {
  return esc(text).replaceAll('{appName}', esc(appName))
}

/** Substitui {appName} para texto simples (assunto/plaintext). */
function fieldText(text: string, appName: string): string {
  return text.replaceAll('{appName}', appName)
}

/**
 * Normaliza um valor guardado (Json, possivelmente parcial ou null) para um
 * `EmailTemplate` completo, aplicando os defaults a tudo o que faltar.
 */
export function normalizeEmailTemplate(raw: unknown): EmailTemplate {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
  return {
    mostrarCabecalho:
      typeof r.mostrarCabecalho === 'boolean'
        ? r.mostrarCabecalho
        : EMAIL_TEMPLATE_DEFAULTS.mostrarCabecalho,
    corDestaque: safeColor(str(r.corDestaque, EMAIL_TEMPLATE_DEFAULTS.corDestaque)),
    saudacao: str(r.saudacao, EMAIL_TEMPLATE_DEFAULTS.saudacao),
    rodape: str(r.rodape, EMAIL_TEMPLATE_DEFAULTS.rodape),
    avisoLegal: str(r.avisoLegal, EMAIL_TEMPLATE_DEFAULTS.avisoLegal),
    assuntoPrefixo: str(r.assuntoPrefixo, EMAIL_TEMPLATE_DEFAULTS.assuntoPrefixo),
  }
}

export interface EmailContent {
  titulo: string
  mensagem: string
  appName: string
}

/** Assunto final: prefixo (se houver) + título. Texto simples. */
export function renderEmailSubject(tpl: EmailTemplate, c: { titulo: string; appName: string }): string {
  const prefixo = fieldText(tpl.assuntoPrefixo, c.appName).trim()
  return prefixo ? `${prefixo} ${c.titulo}` : c.titulo
}

/** Corpo em texto simples (fallback para clientes sem HTML). */
export function renderEmailText(tpl: EmailTemplate, c: EmailContent): string {
  const partes = [
    fieldText(tpl.saudacao, c.appName).trim(),
    c.titulo,
    c.mensagem,
    fieldText(tpl.rodape, c.appName).trim(),
    fieldText(tpl.avisoLegal, c.appName).trim(),
  ].filter(Boolean)
  return partes.join('\n\n')
}

/** Corpo em HTML (email-safe, estilos inline, conteúdo escapado). */
export function renderEmailHtml(tpl: EmailTemplate, c: EmailContent): string {
  const cor = safeColor(tpl.corDestaque)
  const appName = esc(c.appName)
  const titulo = esc(c.titulo)
  const corpo = esc(c.mensagem).replace(/\r?\n/g, '<br/>')
  const saudacao = tpl.saudacao.trim() ? fieldHtml(tpl.saudacao, c.appName) : ''
  const rodape = tpl.rodape.trim() ? fieldHtml(tpl.rodape, c.appName) : ''
  const avisoLegal = tpl.avisoLegal.trim() ? fieldHtml(tpl.avisoLegal, c.appName) : ''

  const cabecalho = tpl.mostrarCabecalho
    ? `<tr><td style="background:${cor};padding:16px 24px;">` +
      `<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px;">${appName}</span>` +
      `</td></tr>`
    : ''

  const saudacaoHtml = saudacao
    ? `<p style="margin:0 0 12px;font-size:14px;color:#374151;">${saudacao}</p>`
    : ''

  const rodapeBloco =
    rodape || avisoLegal
      ? `<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;">` +
        (rodape ? `<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">${rodape}</p>` : '') +
        (avisoLegal
          ? `<p style="margin:8px 0 0;font-size:11px;color:#9ca3af;line-height:1.5;">${avisoLegal}</p>`
          : '') +
        `</td></tr>`
      : ''

  return (
    `<div style="background:#f3f4f6;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>` +
    `<td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">` +
    cabecalho +
    `<tr><td style="padding:24px;">` +
    saudacaoHtml +
    `<h1 style="margin:0 0 12px;font-size:18px;font-weight:700;color:${cor};">${titulo}</h1>` +
    `<div style="font-size:14px;color:#374151;line-height:1.6;">${corpo}</div>` +
    `</td></tr>` +
    rodapeBloco +
    `</table></td></tr></table></div>`
  )
}
