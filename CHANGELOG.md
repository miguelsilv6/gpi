# Changelog

Todas as alterações relevantes nesta versão estão documentadas aqui.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/).
Versionamento: [SemVer](https://semver.org/lang/pt-PT/).

## [Unreleased]

### Adicionado
- Nada de momento.

### Alterado
- Nada de momento.

### Corrigido
- Nada de momento.

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
