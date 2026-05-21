import { FileText, Users, Building2 } from 'lucide-react'
import type { RelatorioDefinition } from './types'
import { queryInqueritos } from './inqueritos'
import { queryBrigadas } from './brigadas'
import { queryInspetores } from './inspetores'

/**
 * Registry de relatórios. Cada entrada produz um `RelatorioResult` canónico
 * consumido pelos formatadores CSV/MD/PDF e pela UI de pré-visualização.
 *
 * Adicionar um relatório: criar um novo handler que devolva `RelatorioResult`
 * e registar uma entrada aqui — nada mais é preciso mudar em endpoints/UI.
 */
export const RELATORIOS: Record<string, RelatorioDefinition> = {
  inqueritos: {
    id: 'inqueritos',
    titulo: 'Listagem de inquéritos',
    descricao:
      'Lista filtrável de inquéritos (NUIPC, crime, estado, brigada, inspetor, datas), exportável.',
    icon: FileText,
    handler: queryInqueritos,
  },
  brigadas: {
    id: 'brigadas',
    titulo: 'Resumo por brigada',
    descricao:
      'Contagens por brigada: abertos no período, concluídos, ativos hoje, aguarda exames, enviados, prazos vencidos.',
    icon: Building2,
    handler: queryBrigadas,
  },
  inspetores: {
    id: 'inspetores',
    titulo: 'Resumo por inspetor',
    descricao:
      'Atribuídos / concluídos / ativos por inspetor + atividades realizadas no período.',
    icon: Users,
    handler: queryInspetores,
  },
}

export function getRelatorio(id: string): RelatorioDefinition | null {
  return RELATORIOS[id] ?? null
}

export function listRelatorios(): RelatorioDefinition[] {
  return Object.values(RELATORIOS)
}

export type { RelatorioResult, RelatorioHandler, RelatorioDefinition } from './types'
