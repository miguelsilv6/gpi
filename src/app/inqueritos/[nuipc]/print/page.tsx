import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { headers } from 'next/headers'
import { slugToNuipc, formatDate, formatDateTime, formatDateTimeWithSeconds } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'
import { getBrand } from '@/lib/brand'
import type { Metadata } from 'next'
import type { Role } from '@/generated/prisma/enums'
import { PrintButton } from './print-button'

export const metadata: Metadata = {
  title: 'Inquérito — exportação',
}

/**
 * Print-friendly view of a single inquérito. Designed to be opened in a new
 * tab and saved as PDF via the browser's print dialog. Excludes the audit
 * history (kept separate for users with the audit:read permission).
 *
 * This route lives OUTSIDE the (dashboard) route group so the sidebar / nav
 * don't bleed into the printed output.
 */
export default async function InqueritoPrintPage({
  params,
}: {
  params: Promise<{ nuipc: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'inquerito:export')) redirect('/dashboard')

  const { nuipc: slug } = await params
  const nuipc = slugToNuipc(slug)
  const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

  const inquerito = await prisma.inquerito.findFirst({
    where: { nuipc, deletedAt: null, ...roleWhere },
    include: {
      estado: { select: { nome: true, codigo: true } },
      crime: { select: { nome: true } },
      brigada: { select: { nome: true } },
      inspetor: { select: { nome: true, email: true } },
      tribunal: { select: { nome: true } },
      seccao: { select: { nome: true } },
      atividades: {
        // Ordenado pela data de inserção (createdAt) para coincidir com o que
        // é mostrado e com a página de detalhe do inquérito.
        orderBy: { createdAt: 'desc' },
        include: { realizadaPor: { select: { nome: true } } },
      },
    },
  })
  if (!inquerito) notFound()

  try {
    const h = await headers()
    const fakeReq = new Request('http://internal/print', {
      headers: {
        'x-forwarded-for': h.get('x-forwarded-for') ?? '',
        'user-agent': h.get('user-agent') ?? '',
      },
    })
    await writeAudit({
      req: fakeReq,
      acao: 'EXPORT_INQUERITO_PRINT',
      entidade: 'Inquerito',
      entidadeId: inquerito.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: inquerito.nuipc, atividades: inquerito.atividades.length },
    })
  } catch {
    // never block the print on an audit failure
  }

  const exportedAt = new Date()
  const brand = await getBrand()

  // All styles are scoped to .gpi-print so they don't leak into the rest of
  // the app (we still share the root <html> and <body> with the rest of the
  // site — only the inner UI is print-tuned).
  const css = `
    .gpi-print {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111;
      font-size: 11pt;
      max-width: 190mm;
      margin: 18mm auto;
      padding: 0 12mm;
      line-height: 1.45;
      background: white;
    }
    .gpi-print h1 { font-size: 18pt; margin: 0 0 4pt 0; }
    .gpi-print h2 {
      font-size: 12pt;
      margin: 18pt 0 6pt 0;
      padding-bottom: 3pt;
      border-bottom: 1pt solid #333;
      page-break-after: avoid;
    }
    .gpi-print h3 { font-size: 11pt; margin: 12pt 0 2pt 0; }
    .gpi-print .meta-grid {
      display: grid;
      grid-template-columns: 32% 68%;
      gap: 4pt 12pt;
      margin: 6pt 0;
    }
    .gpi-print .meta-grid dt { color: #555; font-weight: normal; }
    .gpi-print .meta-grid dd { margin: 0; font-weight: 500; }
    .gpi-print .header {
      display: flex; justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2pt solid #111;
      padding-bottom: 6pt; margin-bottom: 8pt;
    }
    .gpi-print .header .small { font-size: 9pt; color: #666; text-align: right; }
    .gpi-print .pre { white-space: pre-wrap; }
    .gpi-print .atividade {
      padding: 6pt 0; border-bottom: 0.5pt dashed #bbb;
      page-break-inside: avoid;
    }
    .gpi-print .atividade:last-child { border-bottom: 0; }
    .gpi-print .atividade .row1 { display: flex; gap: 12pt; align-items: baseline; }
    .gpi-print .atividade .row1 .when { color: #555; font-size: 9.5pt; }
    .gpi-print .atividade .row1 .who { color: #555; font-size: 9.5pt; margin-left: auto; }
    .gpi-print .atividade .desc { font-weight: 600; }
    .gpi-print .atividade .meta { font-size: 9.5pt; color: #555; margin-top: 2pt; }
    .gpi-print .atividade .obs { margin-top: 3pt; font-size: 10pt; }
    .gpi-print .empty { color: #777; font-style: italic; }
    .gpi-print .footer {
      margin-top: 24pt; padding-top: 6pt;
      border-top: 0.5pt solid #ccc;
      font-size: 8.5pt; color: #777;
      display: flex; justify-content: space-between;
    }
    .gpi-print-actions {
      position: fixed; top: 12px; right: 12px;
      display: flex; gap: 6pt;
      z-index: 100;
    }
    .gpi-print-actions a, .gpi-print-actions button {
      cursor: pointer;
      background: #2563eb; color: white; border: 0;
      padding: 6pt 10pt; border-radius: 4pt;
      font: inherit; font-size: 10pt;
      text-decoration: none;
    }
    .gpi-print-actions .secondary {
      background: #e5e7eb; color: #111;
    }
    @media print {
      .gpi-print-actions { display: none !important; }
      .gpi-print { max-width: none; margin: 0; padding: 0; }
      body { background: white !important; }
    }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="gpi-print-actions">
        <PrintButton />
        <a className="secondary" href={`/inqueritos/${slug}`}>Voltar</a>
      </div>

      <div className="gpi-print">
        <div className="header">
          <div>
            <h1>Inquérito {inquerito.nuipc}</h1>
            <div style={{ color: '#555', fontSize: '10pt' }}>
              {inquerito.crime?.nome ?? inquerito.natureza}
            </div>
          </div>
          <div className="small">
            <div>Exportado em {formatDateTime(exportedAt)}</div>
            <div>por {session.user.nome ?? session.user.email}</div>
            <div>{brand.appShortName} v{APP_VERSION}</div>
          </div>
        </div>

        <h2>Identificação</h2>
        <dl className="meta-grid">
          <dt>NUIPC</dt><dd>{inquerito.nuipc}</dd>
          {inquerito.nai && (<><dt>NAI</dt><dd>{inquerito.nai}</dd></>)}
          <dt>Crime</dt><dd>{inquerito.crime?.nome ?? inquerito.natureza}</dd>
          <dt>Estado</dt><dd>{inquerito.estado.nome}</dd>
          <dt>Data de abertura</dt><dd>{formatDate(inquerito.dataAbertura)}</dd>
          {inquerito.dataPrazo && (<><dt>Prazo</dt><dd>{formatDate(inquerito.dataPrazo)}</dd></>)}
          {inquerito.dataConclusao && (<><dt>Data de conclusão</dt><dd>{formatDate(inquerito.dataConclusao)}</dd></>)}
        </dl>

        <h2>Atribuição</h2>
        <dl className="meta-grid">
          <dt>Brigada</dt><dd>{inquerito.brigada?.nome ?? '—'}</dd>
          <dt>Inspetor atribuído</dt>
          <dd>
            {inquerito.inspetor?.nome ?? '—'}
            {inquerito.inspetor?.email && <> &lt;{inquerito.inspetor.email}&gt;</>}
          </dd>
        </dl>

        {inquerito.cartaPrecatoria &&
          (inquerito.titularNome ||
            inquerito.titularEmail ||
            inquerito.titularVoip ||
            inquerito.titularUnidade) && (
          <>
            <h2>Inspetor Titular — Carta Precatória</h2>
            <dl className="meta-grid">
              {inquerito.titularNome && (<><dt>Inspetor titular</dt><dd>{inquerito.titularNome}</dd></>)}
              {inquerito.titularUnidade && (<><dt>Unidade / Órgão</dt><dd>{inquerito.titularUnidade}</dd></>)}
              {inquerito.titularEmail && (<><dt>Email</dt><dd>{inquerito.titularEmail}</dd></>)}
              {inquerito.titularVoip && (<><dt>VoIP / Contacto</dt><dd>{inquerito.titularVoip}</dd></>)}
            </dl>
          </>
        )}

        {(inquerito.denuncianteNome ||
          inquerito.denuncianteNif ||
          inquerito.denuncianteMorada ||
          inquerito.denuncianteCodPostal ||
          inquerito.denuncianteLocalidade ||
          inquerito.denuncianteContacto ||
          inquerito.denuncianteEmail ||
          inquerito.denuncianteResponsavel ||
          inquerito.denuncianteNotas) && (
          <>
            <h2>Denunciante</h2>
            <dl className="meta-grid">
              {inquerito.denuncianteNome && (
                <>
                  <dt>{inquerito.denuncianteTipo === 'COLETIVA' || inquerito.denuncianteTipo === 'ENTIDADE_PUBLICA' ? 'Designação' : 'Nome'}</dt>
                  <dd>
                    {inquerito.denuncianteNome}
                    {inquerito.denuncianteTipo === 'SINGULAR' && ' (pessoa singular)'}
                    {inquerito.denuncianteTipo === 'COLETIVA' && ' (pessoa coletiva)'}
                    {inquerito.denuncianteTipo === 'ENTIDADE_PUBLICA' && ' (entidade pública)'}
                    {inquerito.denuncianteTipo === 'OUTROS' && ' (outros)'}
                  </dd>
                </>
              )}
              {inquerito.denuncianteNif && (
                <>
                  <dt>{inquerito.denuncianteTipo === 'COLETIVA' ? 'NIPC' : inquerito.denuncianteTipo === 'ENTIDADE_PUBLICA' ? 'NIF/NIPC' : 'NIF'}</dt>
                  <dd>{inquerito.denuncianteNif}</dd>
                </>
              )}
              {(inquerito.denuncianteMorada || inquerito.denuncianteCodPostal || inquerito.denuncianteLocalidade) && (
                <>
                  <dt>Morada</dt>
                  <dd>
                    {[
                      inquerito.denuncianteMorada,
                      [inquerito.denuncianteCodPostal, inquerito.denuncianteLocalidade].filter(Boolean).join(' '),
                    ].filter(Boolean).join(', ')}
                  </dd>
                </>
              )}
              {inquerito.denuncianteContacto && (<><dt>Contacto</dt><dd>{inquerito.denuncianteContacto}</dd></>)}
              {inquerito.denuncianteEmail && (<><dt>Email</dt><dd>{inquerito.denuncianteEmail}</dd></>)}
              {inquerito.denuncianteResponsavel && (<><dt>Responsável</dt><dd>{inquerito.denuncianteResponsavel}</dd></>)}
            </dl>
            {inquerito.denuncianteNotas && (
              <>
                <h3>Notas sobre o denunciante</h3>
                <div className="pre">{inquerito.denuncianteNotas}</div>
              </>
            )}
          </>
        )}

        {(inquerito.tribunal ||
          inquerito.seccao ||
          inquerito.procurador ||
          inquerito.oficialJustica ||
          inquerito.voip ||
          inquerito.notasTribunal) && (
          <>
            <h2>Tribunal / M.P.</h2>
            <dl className="meta-grid">
              {inquerito.tribunal && (<><dt>Tribunal / M.P.</dt><dd>{inquerito.tribunal.nome}</dd></>)}
              {inquerito.seccao && (<><dt>Secção</dt><dd>{inquerito.seccao.nome}</dd></>)}
              {inquerito.procurador && (<><dt>Procurador/a</dt><dd>{inquerito.procurador}</dd></>)}
              {inquerito.oficialJustica && (<><dt>Oficial de Justiça</dt><dd>{inquerito.oficialJustica}</dd></>)}
              {inquerito.voip && (<><dt>VoIP / Contacto</dt><dd>{inquerito.voip}</dd></>)}
            </dl>
            {inquerito.notasTribunal && (
              <>
                <h3>Notas do tribunal</h3>
                <div className="pre">{inquerito.notasTribunal}</div>
              </>
            )}
          </>
        )}

        {inquerito.notas && (
          <>
            <h2>Notas</h2>
            <div className="pre">{inquerito.notas}</div>
          </>
        )}

        <h2>Atividades ({inquerito.atividades.length})</h2>
        {inquerito.atividades.length === 0 ? (
          <p className="empty">Sem atividades registadas.</p>
        ) : (
          inquerito.atividades.map((a) => (
            <div key={a.id} className="atividade">
              <div className="row1">
                <span className="desc">{a.descricao}</span>
                <span className="when" title={`Realizada em ${formatDate(a.dataRealizacao)}`}>
                  {formatDateTimeWithSeconds(a.createdAt)}
                </span>
                <span className="who">{a.realizadaPor.nome}</span>
              </div>
              {(a.quantidade != null || a.dataPrazo || a.concluidaEm) && (
                <div className="meta">
                  {a.quantidade != null && <>Quantidade: <strong>{a.quantidade}</strong></>}
                  {a.quantidade != null && a.dataPrazo && <> · </>}
                  {a.dataPrazo && <>Prazo: {formatDate(a.dataPrazo)}</>}
                  {(a.quantidade != null || a.dataPrazo) && a.concluidaEm && <> · </>}
                  {a.concluidaEm && (
                    <>Concluída em <strong>{formatDate(a.concluidaEm)}</strong></>
                  )}
                </div>
              )}
              {a.observacoes && <div className="obs pre">{a.observacoes}</div>}
            </div>
          ))
        )}

        <div className="footer">
          <span>Documento exportado de {brand.appShortName} · não inclui o histórico de alterações.</span>
          <span>{inquerito.nuipc}</span>
        </div>
      </div>
    </>
  )
}
