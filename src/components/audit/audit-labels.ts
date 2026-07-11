/**
 * Labels canónicos para a UI de auditoria.
 *
 * Centralizados num único módulo (era anteriormente duplicado em
 * `audit-history.tsx`) — usado pelo histórico por inquérito e pela
 * página global /auditlog. Acrescentar uma `acao` nova obriga a
 * passar por aqui (caso contrário fica raw em maiúsculas).
 */

export const ACAO_LABELS: Record<string, string> = {
  CREATE_INQUERITO: 'Inquérito criado',
  UPDATE_INQUERITO: 'Inquérito alterado',
  TRANSFER_INQUERITO: 'Transferido entre brigadas',
  REOPEN_INQUERITO: 'Inquérito reaberto',
  DELETE_INQUERITO: 'Inquérito apagado',
  CREATE_ATIVIDADE: 'Atividade adicionada',
  UPDATE_ATIVIDADE: 'Atividade alterada',
  DELETE_ATIVIDADE: 'Atividade eliminada',
  EXPORT_INQUERITO_DETAIL: 'Exportado em CSV',
  EXPORT_INQUERITO_PRINT: 'Exportado em PDF / impressão',
  EXPORT_INQUERITOS: 'Exportação em massa de inquéritos',
  AUTO_TRANSITION_INQUERITO: 'Transição automática de estado',
  CREATE_ETIQUETA: 'Etiqueta criada',
  UPDATE_ETIQUETA: 'Etiqueta alterada',
  DELETE_ETIQUETA: 'Etiqueta eliminada',
  BULK_ASSIGN: 'Atribuição em massa',
  BULK_CHANGESTATE: 'Alteração de estado em massa',
  BULK_TRANSFER: 'Transferência em massa',
  CREATE_BACKUP: 'Backup criado',
  BACKUP_FAILED: 'Falha de backup',
  DOWNLOAD_BACKUP: 'Backup descarregado',
  UPLOAD_BACKUP: 'Backup carregado (upload)',
  RESTORE_BACKUP: 'Backup restaurado',
  RESTORE_FAILED: 'Falha de restauro',
  DELETE_BACKUP: 'Backup eliminado',
  EXPORT_RELATORIO: 'Relatório exportado',
  PASSWORD_RESET_REQUESTED: 'Reset de password pedido',
  PASSWORD_RESET_COMPLETED: 'Password redefinida via reset',
  UPDATE_NOTIFICATION_POLICIES: 'Configurações de notificação alteradas',
  CREATE_BUG_REPORT: 'Bug reportado',
  UPDATE_BUG_REPORT: 'Bug report alterado',
  DELETE_BUG_REPORT: 'Bug report eliminado',
  LOGIN: 'Início de sessão',
  CREATE_CONTROLO: 'Controlo criado',
  UPDATE_CONTROLO: 'Controlo alterado',
  DELETE_CONTROLO: 'Controlo eliminado',
  CONFIRM_CONTROLO_REALIZACAO: 'Realização de controlo confirmada',
  UPLOAD_DOCUMENTO: 'Documento anexado',
  DELETE_DOCUMENTO: 'Documento eliminado',
  CREATE_NOTA_INQUERITO: 'Nota de inquérito adicionada',
  UPDATE_NOTA_INQUERITO: 'Nota de inquérito alterada',
  DELETE_NOTA_INQUERITO: 'Nota de inquérito eliminada',
  CREATE_TAREFA_INQUERITO: 'Tarefa criada',
  COMPLETE_TAREFA_INQUERITO: 'Tarefa concluída',
  REOPEN_TAREFA_INQUERITO: 'Tarefa reaberta',
  DELETE_TAREFA_INQUERITO: 'Tarefa eliminada',
  CREATE_CONFIG_SISTEMA: 'Configurações do sistema criadas',
  UPDATE_CONFIG_SISTEMA: 'Configurações do sistema alteradas',
  CREATE_INTERCECAO_ALVO: 'Alvo de interceção criado',
  UPDATE_INTERCECAO_ALVO: 'Alvo de interceção alterado',
  DELETE_INTERCECAO_ALVO: 'Alvo de interceção eliminado',
  CREATE_INTERCECAO_LINHA: 'Linha de interceção criada',
  UPDATE_INTERCECAO_LINHA: 'Linha de interceção alterada',
  DELETE_INTERCECAO_LINHA: 'Linha de interceção eliminada',
  RENOVAR_INTERCECAO_LINHA: 'Interceção renovada',
  EXPORT_INTERCECOES_XLSX: 'Interceções exportadas (Excel)',
  EXPORT_TRANSCRICOES_XLSX: 'Produtos para transcrição exportados (Excel)',
  CREATE_INTERCECAO_PRODUTO: 'Produto de interceção registado',
  UPDATE_INTERCECAO_PRODUTO: 'Produto de interceção alterado',
  DELETE_INTERCECAO_PRODUTO: 'Produto de interceção eliminado',
  CREATE_INQUERITO_COLABORADOR: 'Colaborador autorizado',
  DELETE_INQUERITO_COLABORADOR: 'Autorização de colaborador revogada',
  CREATE_INTERVENIENTE: 'Interveniente adicionado',
  UPDATE_INTERVENIENTE: 'Interveniente alterado',
  DELETE_INTERVENIENTE: 'Interveniente removido',
}

/** Cor categórica para os badges de acao em listas. */
export const ACAO_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  TRANSFER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ASSIGN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  EXPORT: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  BACKUP: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  RESTORE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  PASSWORD: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  BULK: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
}

/** Devolve a cor categórica derivada do prefixo da acao (CREATE_*, UPDATE_*, ...). */
export function acaoColor(acao: string): string {
  for (const prefix of Object.keys(ACAO_COLORS)) {
    if (acao.startsWith(prefix)) return ACAO_COLORS[prefix]
  }
  return 'bg-muted text-muted-foreground'
}

export function acaoLabel(acao: string): string {
  return ACAO_LABELS[acao] ?? acao
}

/**
 * Labels human-readable para campos comuns. Quando uma acao UPDATE_*
 * regista `{changed, before, after}`, o renderer usa este map para
 * traduzir as keys.
 */
export const FIELD_LABELS: Record<string, string> = {
  nuipc: 'NUIPC',
  nai: 'NAI',
  natureza: 'Natureza',
  crimeId: 'Crime',
  crimeNome: 'Crime',
  estadoCodigo: 'Estado',
  estadoId: 'Estado',
  faseProcessual: 'Fase processual',
  dataAbertura: 'Data de abertura',
  dataPrazo: 'Prazo',
  dataConclusao: 'Data de conclusão',
  dataRealizacao: 'Data de realização',
  inspetorId: 'Inspetor',
  inspetorRemovido: 'Inspetor (removido)',
  brigadaId: 'Brigada',
  comarcaId: 'Comarca',
  tribunal: 'Tribunal / M.P.',
  tribunalId: 'Tribunal / M.P.',
  seccaoId: 'Secção',
  procurador: 'Procurador/a',
  oficialJustica: 'Oficial de Justiça',
  voip: 'VoIP / Contacto',
  notasTribunal: 'Notas (tribunal)',
  notas: 'Notas',
  quantidade: 'Quantidade',
  observacoes: 'Observações',
  alertaDias1: '1.º aviso (dias)',
  alertaDias2: '2.º aviso (dias)',
  alertaDias: 'Antecedência de alerta (dias)',
  periodoDias: 'Período (dias)',
  concluidaEm: 'Concluída em',
  concluidoEm: 'Concluído em',
  dataEsperada: 'Data esperada',
  numero: 'Número',
  controloId: 'Controlo id',
  tamanho: 'Tamanho',
  descricao: 'Atividade',
  atividadeId: 'Atividade id',
  source: 'Origem',
  format: 'Formato',
  rowCount: 'Linhas exportadas',
  filtros: 'Filtros',
  filename: 'Ficheiro',
  durationMs: 'Duração (ms)',
  contexto: 'Contexto',
  error: 'Erro',
  // Denunciante
  denuncianteNome: 'Denunciante (nome)',
  denuncianteTipo: 'Denunciante (tipo)',
  denuncianteNif: 'Denunciante (NIF/NIPC)',
  denuncianteMorada: 'Denunciante (morada)',
  denuncianteCodPostal: 'Denunciante (cód. postal)',
  denuncianteLocalidade: 'Denunciante (localidade)',
  denuncianteContacto: 'Denunciante (contacto)',
  denuncianteEmail: 'Denunciante (email)',
  denuncianteResponsavel: 'Denunciante (responsável)',
  denuncianteNotas: 'Denunciante (notas)',
  // Notification policy
  inAppEnabled: 'In-app',
  emailEnabled: 'Email',
  ccRoles: 'Roles CC',
  // Etiquetas
  cor: 'Cor',
  ordem: 'Ordem',
  ativo: 'Ativo',
  etiquetas: 'Etiquetas',
  etiquetasBefore: 'Etiquetas (antes)',
  etiquetasAfter: 'Etiquetas (depois)',
  // Bug reports
  titulo: 'Título',
  severidade: 'Severidade',
  estado: 'Estado',
  notaAdmin: 'Nota do admin',
  moduloBugReportsAtivo: 'Módulo Reportar Bug',
  moduloBugReportsRoles: 'Perfis com acesso (Reportar Bug)',
  moduloAnexosAtivo: 'Módulo Anexos',
  moduloAnexosRoles: 'Perfis com acesso (Anexos)',
  moduloIntercecoesAtivo: 'Módulo Interceções',
  moduloIntercecoesRoles: 'Perfis com acesso (Interceções)',
  // Interceções
  nome: 'Nome',
  alvoNome: 'Alvo',
  codigo: 'Código',
  acompanhamento: 'Acompanhamento',
  tipo: 'Tipo',
  identificador: 'N.º telefone / IMEI',
  rede: 'Rede',
  dataInicio: 'Data de início',
  dataFim: 'Data de fim',
  data: 'Data',
  numeroProduto: 'N.º produto',
  direcao: 'Direção',
  horaInicio: 'Hora de início',
  horaFim: 'Hora de fim',
  de: 'De',
  para: 'Para',
  resumo: 'Resumo',
  comentarios: 'Comentários',
  duracao: 'Duração',
  paraTranscricao: 'Para transcrição',
  renovacoes: 'Renovações',
  novaDataFim: 'Nova data de fim',
  // Colaboradores autorizados
  colaboradorNome: 'Colaborador',
  colaboradorEmail: 'Colaborador (email)',
  motivo: 'Motivo',
  expiraEm: 'Expira em',
  // Intervenientes
  tipoOutro: 'Tipo (outro)',
  tipoPessoa: 'Tipo de pessoa',
  nif: 'NIF / NIPC',
  morada: 'Morada',
  codPostal: 'Código postal',
  localidade: 'Localidade',
  contacto: 'Contacto',
  email: 'Email',
  responsavel: 'Responsável',
  // Bulk markers
  __bulk__: '(lote)',
  __bulk_export__: '(exportação)',
}

export const DATE_FIELDS = new Set([
  'dataAbertura',
  'dataPrazo',
  'dataConclusao',
  'dataRealizacao',
  'dataInicio',
  'dataFim',
  'data',
])
export const DATETIME_FIELDS = new Set(['concluidaEm', 'concluidoEm', 'createdAt'])

export function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field
}
