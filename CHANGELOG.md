# Changelog

Todas as alterações relevantes nesta versão estão documentadas aqui.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/).
Versionamento: [SemVer](https://semver.org/lang/pt-PT/).

## [Unreleased]

## [0.5.8] — 2026-06-25

### Adicionado
- **Estatística Mensal — detalhe por inquérito**: por baixo da tabela
  agregada passa a haver uma nova tabela que lista, para cada inquérito
  (NUIPC) do período, as atividades realizadas e respetiva quantidade
  (ex.: "no inquérito X foram feitas 3 constituições de arguido"). O NUIPC
  liga ao detalhe do inquérito e a coluna **Brigada** só aparece quando há
  mais do que uma brigada em vista. Respeita o âmbito por role (INSPETOR_CHEFE
  vê apenas a sua brigada) e exclui inquéritos eliminados.
- **Botão "Enviar por e-mail"** na Estatística Mensal: abre um novo e-mail no
  cliente predefinido (Outlook, no ambiente corporativo) já preenchido com o
  período no assunto e, no corpo, o resumo por atividade e o detalhe por
  inquérito — para o utilizador rever e remeter posteriormente. Se o conteúdo
  exceder o limite de tamanho do `mailto:`, o texto é copiado para a área de
  transferência (com aviso) em vez de o clique falhar em silêncio.

## [0.5.6] — 2026-06-24

### Corrigido
- **Agenda**: deixam de aparecer controlos e diligências ligados a inquéritos
  **eliminados** (soft-delete) — a agregação passa a filtrar `inquerito.deletedAt`
  nas duas fontes, mantendo os controlos/diligências sem inquérito associado
  (alinhado com o que já acontecia nos prazos de inquérito e atividades).

## [0.5.4] — 2026-06-24 — "Agenda / Diligências"

### Adicionado
- **Módulo Agenda** (ativável/desativável pelo administrador em Configurações →
  Sistema, com roles configuráveis) — vista de calendário mensal que reúne, no
  mesmo sítio: prazos de inquérito, atividades com prazo, controlos e
  **diligências** (datas de tribunal: julgamentos, inquirições, buscas,
  interrogatórios, reconstituições, reuniões).
- **Modelo `Diligencia`** (migração `20260624134752`) com tipo, datas de
  início/fim, local, observações e ligação opcional a um inquérito. CRUD em
  `/api/diligencias` (criar/editar/eliminar pelo criador ou admin), gated pelo
  módulo.
- **Página `/agenda`** com calendário (react-day-picker), pontos coloridos por
  tipo de evento, lista do dia/mês e diálogo para criar/editar diligências
  (com pesquisa de inquérito por NUIPC).
- `src/lib/agenda.ts` (`getAgendaEvents`) agrega as 4 fontes com o âmbito por
  role; `buildDiligenciaWhere` define a visibilidade das diligências
  (read-all → todas; chefe → brigada; inspetor → próprias/dos seus inquéritos).

### Testes
- 4 testes de integração (agregação das 4 fontes, intervalo do mês, âmbito das
  diligências) + 1 teste E2E.

## [0.5.2] — 2026-06-24

### Alterado
- **Dashboard (chefe e superiores)** passa a mostrar os 8 contadores da página
  de Estatísticas (Total, C. Precatórias, Ativos, Sem inspetor, Distribuídos,
  Aguarda Exames, Enviados, Arquivados) em vez dos 4 anteriores. O INSPETOR
  mantém os 4 cartões essenciais. Os contadores foram extraídos para
  `src/lib/estatisticas-counters.ts` (`getInqueritoCounters`), agora a fonte
  única usada tanto pelo Dashboard como por `/api/estatisticas`, garantindo
  valores idênticos. O âmbito por role é respeitado (chefe → sua brigada).

## [0.5.0] — 2026-06-24 — "Pesquisa, ligações e CSP por nonce"

### Adicionado
- **Pesquisa global / paleta de comandos (⌘K / Ctrl+K)** — campo de pesquisa
  no header e atalho de teclado que navegam para qualquer página acessível e
  pesquisam inquéritos por NUIPC, NAI, denunciante (nome/NIF) e etiqueta.
  Endpoint `GET /api/search`, scope-locked por role. `filterNavItems` passa a
  ser a fonte única da visibilidade da navegação (sidebar, bottom-nav, paleta).
- **Pesquisa full-text em notas, atividades e documentos** — `to_tsvector` +
  `websearch_to_tsquery` em Português (com stemming) para notas e atividades,
  e por nome de ficheiro para documentos. Índices GIN de expressão (migração
  `20260623150000`). A segurança é aplicada em duas fases: match em SQL →
  re-filtragem com scope por role no Prisma.
- **Ligação entre inquéritos (apensos/conexões)** — modelo `InqueritoRelacao`
  (migração `20260623234310`) com tipos RELACIONADO/APENSO/CONEXO. A relação é
  simétrica e respeita o âmbito do utilizador. Secção "Inquéritos relacionados"
  no detalhe, com pesquisa por NUIPC, tipo e nota.
- **Testes E2E (Playwright)** — fluxos de login, rotas protegidas e paleta de
  comandos; workflow de CI dedicado (`.github/workflows/e2e.yml`).

### Alterado
- **Content-Security-Policy baseada em nonce** — `script-src` deixa de usar
  `'unsafe-inline'`: o middleware gera um nonce por pedido com `'strict-dynamic'`
  e o Next.js aplica-o aos seus scripts (e o next-themes ao seu script inline).
  `style-src` mantém `'unsafe-inline'`. As respostas de API passam a ter uma CSP
  mínima `default-src 'none'`. O middleware passa a cobrir também /login e
  /password-reset.

### Testes
- 11 testes de integração novos (pesquisa full-text/scope, ligações simétricas/
  scope) + 5 testes E2E. 

## [0.2.0]

### Adicionado
- **Auto-atualização via GitHub Releases** (`/configurações` → Atualizações,
  admin-only) com backup automático + rollback em caso de falha.
- **Personalização (Aparência)** — nome, descrição, logos claro/escuro e
  favicon configuráveis pelo admin.
- **Seleção múltipla em mobile** na lista de inquéritos (long-press ou botão
  "Selecionar") para aceder às bulk actions, incluindo transferência de
  brigada.
- **Workflow de release** (`.github/workflows/release.yml`): publica uma
  GitHub Release automaticamente quando a versão em `package.json` sobe em
  `main` — é o que permite às instâncias deployed detetarem novas versões.

### Corrigido
- Entrypoint Docker corrige ownership dos bind mounts (`./backups`,
  `./branding`, `./control`) antes de dropar privilégios — resolve o
  "Permission denied" no backup agendado.
- Eliminação de utilizador sem histórico passa a remover mesmo o registo
  (em vez de só desativar com mensagem enganosa).
- Vários fixes de hydration, integridade de dados (atividades de inquéritos
  soft-deleted) e validação de inputs.
- Acessibilidade mobile: touch targets 44px, filtros responsivos, zoom
  desbloqueado, gráficos de estatística na vertical.

### Adicionado (antes do 0.2.0)
- **Tab "Notificações" em /configurações** (apenas ADMINISTRACAO). Para
  cada `TipoNotificacao` o admin escolhe: in-app on/off, email on/off, e
  roles em CC adicionais.
- **`model NotificationPolicy`** no schema — uma row por tipo. Aditiva,
  sem dataloss.
- **Seed idempotente** que cria a row faltante para cada valor do enum.
  Defaults reproduzem o comportamento pré-refactor (in-app + email on,
  ccRoles vazio; excepto `BACKUP_FALHOU` que arranca com
  `ccRoles=['ADMINISTRACAO']`).
- **`src/lib/notification-labels.ts`** — labels + descrições + flag
  `hasNaturalRecipient` centralizados. Refactor de
  `notificacoes-list.tsx` e `notification-bell.tsx` para reusar (fix
  lateral: faltavam labels para `BACKUP_FALHOU` e
  `ATIVIDADE_PRAZO_APROXIMANDO`).
- **`/api/notification-policies`** (GET + PUT, ambos gated por
  `sistema:config`). PUT em transação Prisma única, invalida cache,
  escreve audit `UPDATE_NOTIFICATION_POLICIES` com diff per-tipo.
- **18 testes novos** (6 unit + 12 integration). Total **101 testes**.

### Alterado
- **`src/lib/notifications.ts` reescrito em torno de `applyPolicy()`**:
  função central com cache de 60s da policy, constrói destinatários
  (natural + CC roles, deduplicado), envia in-app/email consoante a
  policy. Todos os helpers (`notifyAtividadeAdicionada`,
  `notifyBackupFailed`, `notifyInqueritoAtribuido`,
  `notifyInqueritoTransferido`, `notifyAtividadePrazo`,
  `createNotification`) passam a delegar.
- Call-sites em `src/app/api/{cron,atividades,inqueritos}/*` simplificados
  — deixaram de passar `inspetorEmail`/`brigadaOrigemChefeEmail`/etc.
  (resolvidos pelo `applyPolicy` a partir do `naturalUserId`).
- `notifyBackupFailed` deixou de iterar admins inline; depende agora da
  policy `BACKUP_FALHOU.ccRoles`.

### Corrigido
- Mapas locais de labels em `notificacoes-list.tsx` e
  `notification-bell.tsx` estavam incompletos — agora cobrem os 7 tipos
  via `notification-labels.ts`.

---

## [0.9.5] — 2026-05-21 — "Hardening de auth"

Sprint #2 — endurecimento das camadas de autenticação e da pilha
HTTP da aplicação. 23 testes novos (total 83).

### Adicionado
- **Rate limiting in-memory** (`src/lib/rate-limit.ts`) — sliding-window,
  por chave, sem dependências externas. Helpers `checkRateLimit`,
  `enforceRateLimit`, `clientFingerprint`. Limites canónicos em
  `src/lib/constants.ts → RATE_LIMITS`.
- **Endpoints sensíveis protegidos**:
  - `/api/relatorios/[id]` (export CSV/MD/PDF) — `REPORT_EXPORT`
  - `/api/backups/upload` — `HEAVY_OPERATIONS`
  - `/api/backups/[filename]/restore` — `HEAVY_OPERATIONS`
  - `/api/inqueritos/import` — `HEAVY_OPERATIONS`
  - `/api/auth/password-reset/request` — `PASSWORD_RESET_REQUEST` (3/IP/10min)
  - `/api/auth/password-reset/confirm` — `PASSWORD_RESET_CONFIRM`
- **Security headers** em `next.config.ts` — HSTS, X-Frame-Options DENY,
  X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin,
  Permissions-Policy, Content-Security-Policy (script-src e style-src
  ainda com 'unsafe-inline' por exigência do Next.js — TODO para
  v1.0: nonce-based via middleware).
- **Password reset self-service** end-to-end:
  - `model PasswordResetToken` no schema (tokenHash SHA-256, expiresAt,
    usedAt, ip, userAgent).
  - `src/lib/password-reset.ts` — `generateResetToken`,
    `requestPasswordReset`, `consumePasswordReset`,
    `cleanupExpiredResetTokens`. Token de 32 bytes (base64url), TTL 1h,
    single-use. Hash SHA-256 em DB.
  - `POST /api/auth/password-reset/request` — sempre 200 (não-enumeração).
  - `POST /api/auth/password-reset/confirm` — bump de tokenVersion
    invalida sessões activas.
  - UI: `/password-reset` (form de pedido) e `/password-reset/[token]`
    (form de confirmação). Link "Esqueci a password" no login.
  - Audit log: `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`.
- **Structured logging** com pino (`src/lib/logger.ts`) — JSON em
  produção, pretty em dev. Redact automático de `password`,
  `passwordHash`, `token`, `tokenHash` em qualquer profundidade.
  Substitui `console.*` em `src/lib/cron.ts` e `src/app/api/cron/*`.
- **`.dockerignore`** — evita levar `node_modules`/`.next` do host
  para o contexto de build, evitando "invalid file request" em
  symlinks de `.bin/`.

### Testes
- `tests/unit/rate-limit.test.ts` — 11 testes (sliding window,
  isolamento de chaves, 429 com Retry-After, etc.).
- `tests/integration/password-reset.test.ts` — 12 testes (token gen,
  request flow, consume flow, expired/used/invalid/weak rejection,
  cleanup, normalização de email).

### Notas
- `next.config.ts` deixou de ser stub-only — agora exporta `headers()`.
  Se algum integrador override-ar este ficheiro, copiar a função.
- A política CSP actual permite inline scripts (Next.js precisa para
  hydration). Apertar para nonce-based fica para v1.0 quando vamos
  introduzir middleware com `crypto.randomBytes`.
- O logger emite para stdout. Em produção, redirecionar para um
  agregador (loki/journald/cloudwatch) ao gosto.

---

## [0.9.0] — 2026-05-21 — "Testabilidade + CI"

Primeira versão com cobertura de testes automatizada. Marca o início do
caminho para a v1.0.

### Adicionado
- **Vitest** + dependências de teste (`@vitest/coverage-v8`, `vitest-mock-extended`).
- **38 testes unitários** (RBAC, role-scope, formatters CSV/Markdown).
- **22 testes de integração** contra o Postgres de teste:
  - 7 testes de regressão para o bug crítico de scope-bypass via URL injection (`tests/integration/scope-bypass.test.ts`).
  - 11 testes do audit log (`writeAudit`, `diff`) e dos handlers de Relatórios.
  - 4 testes script-level do `scripts/backup.sh` (integridade, retenção por prefixo, fail-modes).
- **GitHub Actions workflow** (`.github/workflows/ci.yml`) — lint, build, test em cada PR. Provisiona Postgres 16 como service, instala `postgresql-client` para os testes de backup, corre `shellcheck` nos scripts.
- **`src/lib/role-scope.ts`** — extracção das funções puras de scope-locking (`buildInqueritoWhere`, `buildAtividadePrazoWhere`, `canEditInquerito`) para um módulo sem dependências de NextAuth. `auth-helpers.ts` re-exporta para manter os call-sites estáveis.
- **`Dockerfile.test`** — imagem `gpi-test:local` com `pg_dump`/`flock` para correr a suite localmente fora do contentor da app.
- **Documentação**:
  - `tests/README.md` — como correr, setup do test DB, convenções, gaps roadmap-v1.0.
  - `CHANGELOG.md` (este ficheiro) — convenção Keep-a-Changelog.

### Corrigido
- **Bug crítico de scope-bypass** (segurança): INSPETOR_CHEFE conseguia consultar dados de outras brigadas passando `?brigadaId=<outra>` na URL. A correcção foi aplicada em 4 locais:
  - `src/lib/relatorios/inqueritos.ts`
  - `src/app/api/inqueritos/route.ts`
  - `src/app/api/inqueritos/export/route.ts`
  - `src/app/(dashboard)/inqueritos/page.tsx`
  - Padrão: `...roleWhere` agora é espalhado **por último** no objecto `where` do Prisma, garantindo que as chaves do scope-locking têm precedência sobre as do URL.
  - Regressão coberta por 7 testes em `tests/integration/scope-bypass.test.ts`.

### Notas
- Cobertura inicial focada em endpoints sensíveis e funções puras. Componentes React, E2E, Restore script e Worker cron são deliberadamente deixados para v0.9.x / v1.0 (ver `tests/README.md` → "O que NÃO está coberto").

---

## [0.8.x] e anteriores

Versões pré-changelog. Histórico completo no git log até este commit.

Funcionalidades já existentes:
- Auth + RBAC (5 roles)
- Inquéritos CRUD + soft-delete + audit log per-entity
- Atividades CRUD + concluir/reabrir + categoriaDashboard
- Catálogos geríveis: Crime, EstadoInquerito, AtividadePadrao
- Brigadas + Utilizadores CRUD
- Dashboard parametrizável (Aguarda Exames, Enviados)
- Estatísticas e Estatística Mensal (CSV + Markdown)
- Relatórios v1: Listagem de inquéritos, Resumo por brigada, Resumo por inspetor (CSV/MD/PDF)
- Backup/restore com maintenance mode, agendamento auto-reload, notificação ADMINISTRACAO em falhas
- Bulk import (CSV preview + commit)
- Bulk operations (assign, transfer, changestate)
- Notificações in-app + email opt-in
- Print view + export por inquérito
- Denunciante + tribunal data
