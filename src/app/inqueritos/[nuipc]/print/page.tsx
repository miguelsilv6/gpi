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
import { getRelacoesForInquerito } from '@/lib/relacoes'
import { TIPO_RELACAO_LABEL } from '@/lib/validations/inquerito-relacao'
import { TIPO_INTERVENIENTE_LABEL, TIPO_PESSOA_LABEL } from '@/lib/validations/interveniente'
import { TIPO_DILIGENCIA_LABEL } from '@/lib/validations/diligencia'
import { TIPO_LINHA_LABEL } from '@/lib/validations/intercecao'
import { ESTADO_APREENSAO_LABEL } from '@/lib/validations/apreensao'
import { apreensaoTipoLabel } from '@/lib/apreensoes'
import { ESTADO_PERICIA_LABEL } from '@/lib/validations/pericia'
import { periciaTipoLabel } from '@/lib/pericias'
import type { Metadata } from 'next'
import type { Role } from '@/generated/prisma/enums'
import { PrintButton } from './print-button'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

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
      intervenientes: { orderBy: { createdAt: 'asc' } },
      controlos: {
        orderBy: { dataInicio: 'desc' },
        include: {
          criador: { select: { nome: true } },
          realizacoes: { orderBy: { numero: 'asc' } },
        },
      },
      diligencias: {
        orderBy: { dataInicio: 'desc' },
        include: { criadoPor: { select: { nome: true } } },
      },
      intercecaoAlvos: {
        orderBy: { nome: 'asc' },
        include: {
          linhas: { orderBy: { dataInicio: 'asc' } },
          _count: { select: { produtos: true } },
        },
      },
      apreensoes: { orderBy: [{ dataApreensao: 'desc' }, { createdAt: 'desc' }] },
      pericias: {
        orderBy: [{ dataPedido: 'desc' }, { createdAt: 'desc' }],
        include: { apreensao: { select: { descricao: true } } },
      },
      documentos: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { nome: true } } },
      },
    },
  })
  if (!inquerito) notFound()

  // Inquéritos relacionados (simétrico, com o scope do utilizador aplicado).
  const relacoes = await getRelacoesForInquerito(
    inquerito.id,
    role,
    session.user.id,
    session.user.brigadaId,
  )

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
      detalhes: {
        nuipc: inquerito.nuipc,
        atividades: inquerito.atividades.length,
        intervenientes: inquerito.intervenientes.length,
        controlos: inquerito.controlos.length,
        diligencias: inquerito.diligencias.length,
        intercecaoAlvos: inquerito.intercecaoAlvos.length,
        apreensoes: inquerito.apreensoes.length,
        pericias: inquerito.pericias.length,
        documentos: inquerito.documentos.length,
        relacoes: relacoes.length,
      },
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
    @page { size: A4; margin: 14mm 12mm; }
    .gpi-print .doc-header {
      text-align: center; font-size: 9pt; color: #555;
      letter-spacing: 1pt; text-transform: uppercase;
      border-bottom: 0.5pt solid #ddd;
      padding-bottom: 4pt; margin-bottom: 8pt;
    }
    .gpi-watermark {
      position: fixed;
      top: 42%; left: 0; right: 0;
      text-align: center;
      transform: rotate(-35deg); transform-origin: center;
      font-size: 70pt; font-weight: 800; letter-spacing: 6pt;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.06);
      pointer-events: none; z-index: 0;
    }
    .gpi-print {
      /* Garante que fundos e a marca de água esbatida saem na impressão mesmo
         sem a opção "Gráficos de fundo" ativa. Propriedade herdada → cobre a
         .gpi-watermark e os fundos de tabela. */
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
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
    .gpi-print table.tbl {
      width: 100%; border-collapse: collapse; margin: 4pt 0 2pt 0;
      font-size: 9.5pt;
    }
    .gpi-print table.tbl th, .gpi-print table.tbl td {
      border: 0.5pt solid #ccc; padding: 3pt 5pt; text-align: left;
      vertical-align: top;
    }
    .gpi-print table.tbl th {
      background: #f2f2f2; font-weight: 600; font-size: 9pt;
    }
    .gpi-print table.tbl tr { page-break-inside: avoid; }
    .gpi-print .subitem { margin: 6pt 0; page-break-inside: avoid; }
    .gpi-print .subitem .subhead { font-weight: 600; }
    .gpi-print .subitem .subnote { font-size: 9.5pt; color: #555; }
    .gpi-print .count { color: #666; font-weight: normal; font-size: 10pt; }
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
        {brand.pdfWatermarkText && <div className="gpi-watermark">{brand.pdfWatermarkText}</div>}
        {brand.pdfHeaderText && <div className="doc-header">{brand.pdfHeaderText}</div>}
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

        {relacoes.length > 0 && (
          <>
            <h2>Inquéritos relacionados <span className="count">({relacoes.length})</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Tipo</th><th>NUIPC</th><th>Crime</th><th>Estado</th><th>Nota</th></tr>
              </thead>
              <tbody>
                {relacoes.map((r) => (
                  <tr key={r.relacaoId}>
                    <td>{TIPO_RELACAO_LABEL[r.tipo]}</td>
                    <td>{r.inquerito.nuipc}</td>
                    <td>{r.inquerito.crimeNome}</td>
                    <td>{r.inquerito.estadoNome}</td>
                    <td>{r.nota ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {inquerito.intervenientes.length > 0 && (
          <>
            <h2>Outros intervenientes <span className="count">({inquerito.intervenientes.length})</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Tipo</th><th>Nome / Designação</th><th>NIF / NIPC</th><th>Contacto</th><th>Notas</th></tr>
              </thead>
              <tbody>
                {inquerito.intervenientes.map((it) => {
                  const tipoLabel =
                    it.tipo === 'OUTRO'
                      ? it.tipoOutro || 'Outro'
                      : (TIPO_INTERVENIENTE_LABEL[it.tipo as keyof typeof TIPO_INTERVENIENTE_LABEL] ?? it.tipo)
                  const natureza = it.tipoPessoa
                    ? (TIPO_PESSOA_LABEL[it.tipoPessoa as keyof typeof TIPO_PESSOA_LABEL] ?? it.tipoPessoa)
                    : null
                  const contacto = [it.contacto, it.email].filter(Boolean).join(' · ')
                  return (
                    <tr key={it.id}>
                      <td>{tipoLabel}</td>
                      <td>
                        {it.nome}
                        {natureza && <div className="subnote">{natureza}</div>}
                        {it.responsavel && <div className="subnote">Resp.: {it.responsavel}</div>}
                      </td>
                      <td>{it.nif ?? ''}</td>
                      <td>{contacto}</td>
                      <td>{it.notas ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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

        {inquerito.controlos.length > 0 && (
          <>
            <h2>Controlos <span className="count">({inquerito.controlos.length})</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Descrição</th><th>Início</th><th>Period. (dias)</th><th>Realizações</th><th>Próxima esperada</th><th>Concluído</th><th>Criado por</th></tr>
              </thead>
              <tbody>
                {inquerito.controlos.map((c) => {
                  const total = c.realizacoes.length
                  const feitas = c.realizacoes.filter((r) => r.dataRealizacao).length
                  const proxima = c.realizacoes
                    .filter((r) => !r.dataRealizacao)
                    .sort((a, b) => a.dataEsperada.getTime() - b.dataEsperada.getTime())[0]
                  return (
                    <tr key={c.id}>
                      <td>{c.descricao}{c.observacoes && <div className="subnote">{c.observacoes}</div>}</td>
                      <td>{formatDate(c.dataInicio)}</td>
                      <td>{c.periodoDias ?? '—'}</td>
                      <td>{feitas}/{total}</td>
                      <td>{proxima ? formatDate(proxima.dataEsperada) : '—'}</td>
                      <td>{c.concluidoEm ? formatDate(c.concluidoEm) : '—'}</td>
                      <td>{c.criador.nome}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        {inquerito.diligencias.length > 0 && (
          <>
            <h2>Diligências <span className="count">({inquerito.diligencias.length})</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Tipo</th><th>Título</th><th>Início</th><th>Fim</th><th>Local</th><th>Estado</th><th>Criado por</th></tr>
              </thead>
              <tbody>
                {inquerito.diligencias.map((d) => (
                  <tr key={d.id}>
                    <td>{TIPO_DILIGENCIA_LABEL[d.tipo] ?? d.tipo}</td>
                    <td>{d.titulo}{d.observacoes && <div className="subnote">{d.observacoes}</div>}</td>
                    <td>{formatDateTime(d.dataInicio)}</td>
                    <td>{d.dataFim ? formatDateTime(d.dataFim) : '—'}</td>
                    <td>{d.local ?? '—'}</td>
                    <td>{d.concluida ? 'Concluída' : 'Agendada'}</td>
                    <td>{d.criadoPor.nome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {inquerito.intercecaoAlvos.length > 0 && (
          <>
            <h2>
              Interceções{' '}
              <span className="count">
                ({inquerito.intercecaoAlvos.length} alvo{inquerito.intercecaoAlvos.length !== 1 ? 's' : ''})
              </span>
            </h2>
            {inquerito.intercecaoAlvos.map((alvo) => (
              <div key={alvo.id} className="subitem">
                <div className="subhead">
                  {alvo.nome}{' '}
                  <span className="subnote">· {alvo._count.produtos} produto(s) registado(s)</span>
                </div>
                {alvo.linhas.length > 0 && (
                  <table className="tbl">
                    <thead>
                      <tr><th>Código</th><th>Tipo</th><th>Nº / IMEI</th><th>Rede</th><th>Início</th><th>Fim</th><th>Renov.</th></tr>
                    </thead>
                    <tbody>
                      {alvo.linhas.map((l) => (
                        <tr key={l.id}>
                          <td>{l.codigo}</td>
                          <td>{TIPO_LINHA_LABEL[l.tipo]}</td>
                          <td>{l.identificador}</td>
                          <td>{l.rede ?? '—'}</td>
                          <td>{formatDate(l.dataInicio)}</td>
                          <td>{formatDate(l.dataFim)}</td>
                          <td>{l.renovacoes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
            <div className="subnote">
              O detalhe dos produtos de interceção está disponível na exportação dedicada.
            </div>
          </>
        )}

        {inquerito.apreensoes.length > 0 && (
          <>
            <h2>Apreensões <span className="count">({inquerito.apreensoes.length})</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Objeto</th><th>Tipo</th><th>Nº auto</th><th>Data</th><th>Apreendido a</th><th>Custódia</th><th>Estado</th><th>Destino</th></tr>
              </thead>
              <tbody>
                {inquerito.apreensoes.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.descricao}
                      {a.quantidade && <div className="subnote">Qtd.: {a.quantidade}</div>}
                      {a.observacoes && <div className="subnote">{a.observacoes}</div>}
                    </td>
                    <td>{apreensaoTipoLabel(a.tipo, a.tipoOutro)}</td>
                    <td>{a.numeroAuto ?? '—'}</td>
                    <td>{formatDate(a.dataApreensao)}</td>
                    <td>{a.apreendidoA ?? '—'}</td>
                    <td>{a.localCustodia ?? '—'}</td>
                    <td>{ESTADO_APREENSAO_LABEL[a.estado as keyof typeof ESTADO_APREENSAO_LABEL] ?? a.estado}</td>
                    <td>{a.dataDestino ? formatDate(a.dataDestino) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {inquerito.pericias.length > 0 && (
          <>
            <h2>Perícias <span className="count">({inquerito.pericias.length})</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Perícia</th><th>Tipo</th><th>Entidade</th><th>Ref.</th><th>Pedido</th><th>Prevista</th><th>Estado</th><th>Conclusão</th></tr>
              </thead>
              <tbody>
                {inquerito.pericias.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.descricao}
                      {p.apreensao && <div className="subnote">Sobre: {p.apreensao.descricao}</div>}
                      {p.resultado && <div className="subnote">Resultado: {p.resultado}</div>}
                    </td>
                    <td>{periciaTipoLabel(p.tipo, p.tipoOutro)}</td>
                    <td>{p.entidade ?? '—'}</td>
                    <td>{p.numeroReferencia ?? '—'}</td>
                    <td>{formatDate(p.dataPedido)}</td>
                    <td>{p.dataPrevista ? formatDate(p.dataPrevista) : '—'}</td>
                    <td>{ESTADO_PERICIA_LABEL[p.estado as keyof typeof ESTADO_PERICIA_LABEL] ?? p.estado}</td>
                    <td>{p.dataConclusao ? formatDate(p.dataConclusao) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {inquerito.documentos.length > 0 && (
          <>
            <h2>Documentos anexados <span className="count">({inquerito.documentos.length})</span></h2>
            <table className="tbl">
              <thead>
                <tr><th>Ficheiro</th><th>Tipo</th><th>Tamanho</th><th>Anexado em</th><th>Por</th></tr>
              </thead>
              <tbody>
                {inquerito.documentos.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.filename}</td>
                    <td>{doc.mimeType}</td>
                    <td>{fmtBytes(doc.tamanho)}</td>
                    <td>{formatDateTime(doc.createdAt)}</td>
                    <td>{doc.uploadedBy.nome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="footer">
          <span>{brand.pdfFooterText}</span>
          <span>{inquerito.nuipc}</span>
        </div>
      </div>
    </>
  )
}
