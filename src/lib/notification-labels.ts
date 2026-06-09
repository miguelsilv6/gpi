import type { TipoNotificacao } from '@/generated/prisma/enums'

/**
 * Labels human-readable para cada `TipoNotificacao`. Única fonte de
 * verdade — reusada em:
 *   - `/notificacoes` (lista + sino)
 *   - `/configuracoes` → tab Notificações (configurar policy)
 *
 * O Record é exhaustivo por construção do tipo: se um valor novo for
 * adicionado ao enum, o TypeScript reclama até ser preenchido aqui.
 * Um teste em `tests/unit/notification-labels.test.ts` reforça este
 * invariante em runtime contra `Object.values(TipoNotificacao)`.
 */
export const NOTIFICATION_TIPO_LABELS: Record<TipoNotificacao, string> = {
  PRAZO_APROXIMANDO: 'Prazo a aproximar-se',
  PRAZO_ULTRAPASSADO: 'Prazo ultrapassado',
  ATIVIDADE_PRAZO_APROXIMANDO: 'Prazo de atividade a aproximar-se',
  ATIVIDADE_ADICIONADA: 'Nova atividade',
  INQUERITO_ATRIBUIDO: 'Inquérito atribuído',
  INQUERITO_TRANSFERIDO: 'Inquérito transferido entre brigadas',
  BACKUP_FALHOU: 'Falha de backup/restauro',
  ATUALIZACAO_FALHOU: 'Atualização do sistema falhou',
  ATUALIZACAO_CONCLUIDA: 'Atualização do sistema concluída',
  BUGREPORT_CRIADO: 'Novo relatório de bug',
  CONTROLO_APROXIMANDO: 'Controlo a aproximar-se',
}

/**
 * Descrição curta do contexto em que cada tipo é disparado. Usada como
 * help text na tab de configuração para que o admin perceba o que está
 * a ligar/desligar sem ter de adivinhar.
 */
export const NOTIFICATION_TIPO_DESCRIPTIONS: Record<TipoNotificacao, string> = {
  PRAZO_APROXIMANDO: 'Disparada quando o prazo de um inquérito está prestes a vencer (configurável em "prazoAlertaDias").',
  PRAZO_ULTRAPASSADO: 'Disparada quando o prazo de um inquérito já foi ultrapassado e o estado não é terminal.',
  ATIVIDADE_PRAZO_APROXIMANDO: 'Disparada quando uma atividade com prazo está perto do limite (alertaDias1/2 por atividade).',
  ATIVIDADE_ADICIONADA: 'Disparada quando alguém adiciona uma atividade num inquérito atribuído a outro inspetor.',
  INQUERITO_ATRIBUIDO: 'Disparada quando um inquérito é atribuído (ou re-atribuído) a um inspetor.',
  INQUERITO_TRANSFERIDO: 'Disparada quando um inquérito muda de brigada — chefes da origem e do destino são notificados.',
  BACKUP_FALHOU: 'Disparada quando um backup automático, manual ou restauro falha. Sem destinatário "natural" — só envia para os roles CC configurados.',
  ATUALIZACAO_FALHOU: 'Disparada quando uma atualização automática do sistema falha ou é revertida. Sem destinatário natural — só envia para os roles CC configurados.',
  ATUALIZACAO_CONCLUIDA: 'Disparada quando uma atualização automática do sistema termina com sucesso. Sem destinatário natural — só envia para os roles CC configurados.',
  BUGREPORT_CRIADO: 'Disparada quando um utilizador submete um novo relatório de bug. Sem destinatário natural — só envia para os roles CC configurados (por defeito, ADMINISTRACAO).',
  CONTROLO_APROXIMANDO: 'Disparada quando um controlo periódico está prestes a vencer (configurable via alertaDias no controlo).',
}

/**
 * Indica se o tipo tem um destinatário "natural" no contexto que o
 * dispara (inspetor do inquérito, criador da atividade, chefes das
 * brigadas envolvidas). Usado pela UI da tab Notificações para mostrar
 * o aviso "Acrescenta a [destinatário natural]" vs "Lista exclusiva".
 *
 * BACKUP_FALHOU é o único tipo sem natural: o backup é uma operação
 * do sistema, não associada a um utilizador específico.
 */
export const NOTIFICATION_TIPO_HAS_NATURAL: Record<TipoNotificacao, boolean> = {
  PRAZO_APROXIMANDO: true,
  PRAZO_ULTRAPASSADO: true,
  ATIVIDADE_PRAZO_APROXIMANDO: true,
  ATIVIDADE_ADICIONADA: true,
  INQUERITO_ATRIBUIDO: true,
  INQUERITO_TRANSFERIDO: true,
  BACKUP_FALHOU: false,
  ATUALIZACAO_FALHOU: false,
  ATUALIZACAO_CONCLUIDA: false,
  BUGREPORT_CRIADO: false,
  CONTROLO_APROXIMANDO: true,
}

/**
 * Helper compacto para o UI: devolve o label, ou o próprio enum value
 * (em caps) se o tipo não estiver mapeado. Não deve acontecer com o
 * Record exhaustivo, mas defensivo para JSON vindo da BD com tipos
 * desconhecidos (ex: rolling deployment durante uma migração).
 */
export function tipoNotificacaoLabel(tipo: string): string {
  return NOTIFICATION_TIPO_LABELS[tipo as TipoNotificacao] ?? tipo
}
