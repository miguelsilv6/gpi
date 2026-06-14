'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Globe,
  MailSearch,
  Network,
  FileSearch,
  FileKey2,
  History,
  ShieldOff,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToolboxIaContext } from './toolbox-shared'
import { IpLookupTool, DnsTool, WhoisTool } from './tools-network'
import { EmailHeadersTool } from './tools-email'
import { CertHistoryTool, WebHistoryTool } from './tools-osint'
import { DefangTool } from './tools-utils'
import { HelpButton, HelpSection } from '@/components/ui/help-button'

interface Tool {
  id: string
  label: string
  descricao: string
  icon: LucideIcon
  component: React.ComponentType
}

const TOOLS: Tool[] = [
  {
    id: 'ip',
    label: 'IP Lookup',
    descricao: 'Geolocalização, ISP/ASN e reverse DNS de um endereço IP.',
    icon: Globe,
    component: IpLookupTool,
  },
  {
    id: 'dns',
    label: 'DNS',
    descricao: 'Registos A/AAAA/MX/NS/TXT/CNAME e reverse DNS de IPs.',
    icon: Network,
    component: DnsTool,
  },
  {
    id: 'whois',
    label: 'WHOIS / RDAP',
    descricao: 'Registo de domínios e blocos IP: registrar, datas, nameservers.',
    icon: FileSearch,
    component: WhoisTool,
  },
  {
    id: 'certs',
    label: 'Certificados (CT)',
    descricao: 'Histórico de certificados TLS e subdomínios via Certificate Transparency.',
    icon: FileKey2,
    component: CertHistoryTool,
  },
  {
    id: 'wayback',
    label: 'Histórico Web',
    descricao: 'Capturas históricas de sites na Wayback Machine (Internet Archive).',
    icon: History,
    component: WebHistoryTool,
  },
  {
    id: 'email',
    label: 'Cabeçalhos de Email',
    descricao: 'Cadeia de entrega, IP de origem, SPF/DKIM/DMARC e sinais de spoofing.',
    icon: MailSearch,
    component: EmailHeadersTool,
  },
  {
    id: 'defang',
    label: 'Defang IOCs',
    descricao: 'Neutralizar/reativar URLs e domínios maliciosos para partilha segura.',
    icon: ShieldOff,
    component: DefangTool,
  },
]

export function ToolboxView({ iaAtiva = false }: { iaAtiva?: boolean }) {
  const [activeId, setActiveId] = useState<string>(TOOLS[0].id)
  const active = TOOLS.find((t) => t.id === activeId) ?? TOOLS[0]
  const ActiveComponent = active.component

  return (
    <ToolboxIaContext.Provider value={iaAtiva}>
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
      {/* Selector de ferramentas */}
      <div className="space-y-2">
        <HelpButton title="Ajuda — Toolbox OSINT" variant="outline" className="w-full justify-start">
            <HelpSection title="Ferramentas disponíveis">
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>IP Lookup</strong> — geolocalização, ISP/ASN e DNS reverso de um endereço IP.</li>
                <li><strong>DNS</strong> — registos A/AAAA/MX/NS/TXT/CNAME de um domínio e DNS reverso de IPs.</li>
                <li><strong>WHOIS / RDAP</strong> — registar, datas de criação/expiração e nameservers de domínios e blocos IP.</li>
                <li><strong>Certificados (CT)</strong> — histórico de certificados TLS e subdomínios expostos via Certificate Transparency.</li>
                <li><strong>Histórico Web</strong> — capturas históricas de sites na Wayback Machine (Internet Archive).</li>
                <li><strong>Cabeçalhos de Email</strong> — análise da cadeia de entrega, IP de origem e autenticação SPF/DKIM/DMARC.</li>
                <li><strong>Defang IOCs</strong> — neutraliza ou reverte URLs e domínios maliciosos para partilha segura em relatórios.</li>
              </ul>
            </HelpSection>
            <HelpSection title="Privacidade">
              <p>Todas as pesquisas são feitas a partir do servidor — os dados inseridos <strong>não</strong> passam pelo browser do utilizador para serviços externos. Os resultados ficam registados no audit log do sistema.</p>
            </HelpSection>
            <HelpSection title="Limites de utilização">
              <p>Cada ferramenta tem um limite de pedidos por minuto por utilizador para evitar abusos. Se receber um erro de limite, aguarde um momento e tente novamente.</p>
            </HelpSection>
          </HelpButton>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveId(tool.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                activeId === tool.id
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-card hover:bg-accent/50 text-muted-foreground',
              )}
            >
              <tool.icon className={cn('h-4 w-4 shrink-0', activeId === tool.id && 'text-primary')} />
              <span className="text-sm font-medium truncate">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ferramenta ativa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <active.icon className="h-4 w-4" />
            {active.label}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{active.descricao}</p>
        </CardHeader>
        <CardContent>
          <ActiveComponent />
        </CardContent>
      </Card>
    </div>
    </ToolboxIaContext.Provider>
  )
}
