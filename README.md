# GPI — Gestão de Processos de Investigação

Plataforma web para gestão do ciclo de vida de inquéritos criminais. Construída em Next.js 16 + Prisma 7 + PostgreSQL 16.

---

## Funcionalidades principais

- **Gestão de inquéritos** — criação, edição, transições de estado, reabertura, exportação PDF
- **Cartas Precatórias** — identificação do inspetor titular (de outra unidade) e respetivo contacto/VoIP
- **Atribuição e transferência** — distribuição por brigada e inspetor, com auditoria
- **Atividades e prazos** — tarefas por inquérito com alertas configuráveis, visão global de prazos
- **Tarefas pessoais e notas** — bloco de notas por inquérito e lista de tarefas pessoais estilo Notion
- **Etiquetas** — tags personalizáveis para categorização transversal (ex.: "Prioritário", "Aguardando MP")
- **Catálogos configuráveis** — estados, crimes, tribunais, secções, locais de tratamento
- **Estatísticas** — dashboards por perfil (global, por brigada, pessoal), relatório mensal exportável
- **Férias e Ausências** — calendário de férias/folgas com Gantt anual, gestão por brigada
- **Ajudas Mensais** — registo e relatório PDF de ajudas de custo por inspetor/mês
- **Toolbox OSINT** — IP lookup, DNS, WHOIS/RDAP, certificados (CT), histórico Wayback, cabeçalhos de email, defang de IOCs, dígito de controlo IMEI, e explicações por IA local (Ollama)
- **Reporte de bugs** — módulo interno para reportar e acompanhar problemas
- **Notificações** — in-app e email (SMTP), com políticas configuráveis por tipo
- **Auditoria completa** — registo de todas as alterações com IP, agente e utilizador
- **Backups automáticos** — dumps PostgreSQL agendados com retenção configurável e restauro
- **Atualização do sistema** — mecanismo integrado de self-update com rollback
- **Branding** — logótipo e favicon personalizáveis por instância

---

## Instalação rápida (Docker)

Único pré-requisito: **Docker** (Docker Desktop em Windows/macOS, Docker Engine em Linux) + **Git**.

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/miguelsilv6/gestao-projetos/main/scripts/install.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/miguelsilv6/gestao-projetos/main/scripts/install.ps1 | iex
```

O script de instalação:
1. Verifica que o Docker está a correr (em Windows, inicia o Docker Desktop se necessário)
2. Clona o repositório para `~/gpi` (ou `%USERPROFILE%\gpi` em Windows)
3. Gera um `.env` com secrets aleatórios (NextAuth, password do Postgres, cron secret)
4. Deteta um porto livre a partir do 3000
5. Corre `docker compose -f docker-compose.prod.yml up -d --build`
6. Aguarda a aplicação ficar disponível e abre o browser
7. (Opcional) Instala um daemon `systemd` para atualização automática

Após a instalação, inicia sessão com o email `admin@gpi.pt` e a password definida no seed.
**Muda a password imediatamente após o primeiro login** em Perfil → Alterar password.

### Instalação manual

```bash
git clone https://github.com/miguelsilv6/gestao-projetos.git
cd gestao-projetos
./scripts/install.sh           # ou .\scripts\install.ps1 em Windows
```

---

## Comandos úteis

A partir do diretório de instalação (`~/gpi` ou `%USERPROFILE%\gpi`):

| Acção | Linux/macOS | Windows |
|---|---|---|
| Ver logs em tempo real | `docker compose -f docker-compose.prod.yml logs -f` | idem |
| Parar | `docker compose -f docker-compose.prod.yml stop` | idem |
| Reiniciar | `docker compose -f docker-compose.prod.yml restart` | idem |
| Atualizar | `./scripts/update.sh` | `.\scripts\update.ps1` |
| Desinstalar | `./scripts/uninstall.sh` | `.\scripts\uninstall.ps1` |

Os dados (base de dados e backups) ficam em **volumes Docker nomeados** e persistem entre arranques. O `uninstall` pergunta antes de os apagar.

---

## Perfis de acesso (RBAC)

| Perfil | Acesso a inquéritos | Gestão | Estatísticas |
|---|---|---|---|
| **INSPETOR** | Próprios | Atividades próprias | Pessoal |
| **INSPETOR_CHEFE** | Brigada | Brigada | Brigada |
| **COORDENADOR** | Todos | Brigadas, utilizadores | Global |
| **ESTATISTICA** | Leitura global | — | Global + relatórios |
| **ADMINISTRACAO** | Todos + eliminar | Sistema completo + catálogos | Global |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose (prod)                              │
│                                                     │
│  ┌──────────────┐    ┌──────────────┐               │
│  │  app         │    │  worker      │               │
│  │  Next.js 16  │    │  Node 22     │               │
│  │  port 3000   │    │  cron jobs   │               │
│  └──────┬───────┘    └──────┬───────┘               │
│         │                   │                       │
│         └────────┬──────────┘                       │
│                  │                                  │
│          ┌───────▼────────┐                         │
│          │  PostgreSQL 16  │                         │
│          └────────────────┘                         │
│                                                     │
│  Volumes: postgres_data · backups · control · branding│
└─────────────────────────────────────────────────────┘
```

- **app** — Next.js com App Router, server components, output standalone. Serve o frontend e todos os endpoints REST (`/api/*`). Aplica migrações e seed no arranque.
- **worker** — Processo Node separado que corre os cron jobs: verificação de prazos (com notificações ao inspetor e inspetor-chefe) e backups automáticos da base de dados.
- **Canal de controlo** (`./control/`) — ficheiros JSON partilhados por bind-mount entre `app`, `worker` e o daemon do host para coordenar self-updates.
- **RBAC em três camadas** — middleware Edge (Next.js), guards de servidor (route handlers), UI condicional.
- **Auditoria** — todas as escritas geram entradas em `AuditLog` com detalhes do `diff`, IP e agente.

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, standalone) |
| Runtime | Node.js 22 |
| Base de dados | PostgreSQL 16 via Prisma 7 + `@prisma/adapter-pg` |
| Autenticação | NextAuth v5 (Credentials + JWT, lockout, tokenVersion) |
| UI | React 19 + shadcn/ui + Tailwind CSS 4 |
| Gráficos | Recharts 3 |
| Formulários | react-hook-form 7 + Zod 4 |
| Email | Nodemailer 7 (SMTP configurável) |
| PDF | @react-pdf/renderer 4 |
| Datas | date-fns 4 + react-day-picker 10 |
| IA local | Ollama (LLM leve, ex. `qwen3:4b`) — explicações da Toolbox, opt-in pelo admin |
| Testes | Vitest 2 (unit + integration) |
| CI/CD | GitHub Actions |

---

## Desenvolvimento local

```bash
git clone https://github.com/miguelsilv6/gestao-projetos.git
cd gestao-projetos
cp .env.example .env
# Editar .env: DATABASE_URL, NEXTAUTH_SECRET, CRON_SECRET
npm install
npx prisma migrate dev
npx tsx prisma/seed.ts
npm run dev
```

Ou usa o `docker-compose.yml` (dev — inclui MailHog em `localhost:8025` para inspecionar emails).

### Variáveis de ambiente obrigatórias

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL |
| `NEXTAUTH_SECRET` | Secret para JWT (mínimo 32 chars aleatórios) |
| `NEXTAUTH_URL` | URL pública da aplicação (ex.: `https://gpi.example.com`) |
| `CRON_SECRET` | Header de autenticação para triggers externos de cron |
| `SMTP_HOST` / `SMTP_PORT` | Servidor de email de saída |
| `SMTP_FROM_EMAIL` | Endereço remetente |

---

## Testes

```bash
npm run test:unit          # testes unitários (sem base de dados)
npm run test:integration   # testes de integração (requerem PostgreSQL em gpi_test_db)
npm test                   # ambos
```

Setup da base de dados de testes e detalhes adicionais em [tests/README.md](tests/README.md).

O CI corre automaticamente em cada PR (`.github/workflows/ci.yml`): type-check, build, testes unitários, testes de integração, e lint dos scripts shell.

---

## Contas criadas pelo seed

O script `prisma/seed.ts` cria contas de demonstração para cada perfil de acesso:
`admin@gpi.pt`, `coordenador@gpi.pt`, `chefe@gpi.pt`, `inspetor@gpi.pt`, `estatistica@gpi.pt`.

> **Importante**: altera as passwords de todas estas contas antes de colocar em produção. A conta `admin@gpi.pt` é particularmente sensível — é a única protegida contra desactivação acidental.

---

## Resolução de problemas

**"Docker daemon não está a correr"** → Abre o Docker Desktop e aguarda que o ícone fique estável.

**"Porto 3000 ocupado"** → O script de instalação tenta 3001, 3002... e regista a porta escolhida em `.env` (`HOST_PORT=...`).

**"git pull falha durante update"** → Há alterações locais não confirmadas. Usa `git stash` ou clona de novo num diretório limpo.

**"Schema diverge / migration failed"** → O entrypoint corre `prisma migrate deploy` no arranque. Se a migração falhar, verifica os logs do container `gpi_app` com `docker logs gpi_app`.

**Aceder a partir de outras máquinas na rede** → O compose de produção vincula a porta ao `HOST_PORT` em `0.0.0.0`. Garante que o firewall e/ou proxy reverso (nginx, Caddy) estão configurados antes de expor à internet.

**Emails não chegam** → Em dev, usa o MailHog (`localhost:8025`). Em produção, verifica as variáveis `SMTP_*` e os logs do worker (`docker logs gpi_worker`).

---

## Licença

Projecto privado / interno. Sem licença pública atribuída.
