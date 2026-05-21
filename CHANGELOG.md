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
