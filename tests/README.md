# Testes — GPI

Suite de testes automatizados (Vitest). Adicionada no Sprint #1 da v0.9.

## Estrutura

```
tests/
├── setup.ts                       # Env defaults para test runs
├── helpers/
│   ├── db.ts                      # PrismaClient + resetDatabase para integration
│   └── fixtures.ts                # Factories (makeBrigada, scenarioTwoBrigadas, ...)
├── unit/                          # Sem rede, sem BD — rápidos
├── ui/                            # Componentes React em jsdom (Testing Library): cliques, pop-ups
│   ├── rbac.test.ts
│   ├── auth-helpers.test.ts
│   └── formatters.test.ts
└── integration/                   # Encostam ao test DB (Postgres)
    ├── scope-bypass.test.ts       # Regressão do bug #91 (override-last)
    ├── audit-relatorios.test.ts   # writeAudit + diff + handlers
    └── backup-script.test.ts      # scripts/backup.sh end-to-end
```

## Correr localmente

### Unit tests (sempre disponíveis)

```bash
npm run test:unit
```

Não precisam de BD nem de rede.

### UI tests (jsdom)

Testam componentes React com interação real (`@testing-library/react` +
`user-event`), com `fetch`, `next/navigation` e `sonner` mockados. Não precisam
de BD nem de rede. Cada ficheiro declara `// @vitest-environment jsdom`.

```bash
npm run test:ui
```

### Lint

```bash
npm run lint       # ESLint (flat config em eslint.config.mjs)
npm run lint:ci    # o mesmo, com teto de avisos (usado no CI)
```

Erros e avisos bloqueiam o CI (`--max-warnings=0`). Para carregar dados ou
ressincronizar estado num efeito, usar `useDeferredEffect` (src/hooks) em vez de
`useEffect` + `setState` síncrono.

### Integration tests (exigem Postgres de teste)

1. **Criar a BD de teste uma vez:**

   ```bash
   docker exec gpi_postgres psql -U gpi_user -d postgres -c "CREATE DATABASE gpi_test_db OWNER gpi_user;"
   ```

2. **Aplicar o schema:**

   ```bash
   DATABASE_URL="postgresql://gpi_user:$POSTGRES_PASSWORD@gpi_postgres:5432/gpi_test_db?schema=public" \
     npx prisma db push --accept-data-loss
   ```

3. **Correr:**

   ```bash
   DATABASE_URL="postgresql://gpi_user:$POSTGRES_PASSWORD@gpi_postgres:5432/gpi_test_db?schema=public" \
     npm run test:integration
   ```

### Tudo de uma vez

```bash
npm test       # unit + integration
```

## Em CI

O workflow `.github/workflows/ci.yml` provisiona automaticamente um serviço Postgres 16 e corre toda a suite em cada PR / push para `main`.

## Convenções

- **Cada teste de integração** começa com `resetDatabase(prisma)` no `beforeEach`. Os testes assumem BD limpa.
- **Cada factory** em `fixtures.ts` devolve a entidade criada (não usa string IDs fixos — o Prisma gera cuids).
- **Scope-locking** é validado tanto a nível unitário (`role-scope.ts`) como integração (`scope-bypass.test.ts`). Os dois cobrem ângulos diferentes; nenhum substitui o outro.
- **Audit log** PII-free: testes verificam que `EXPORT_RELATORIO.detalhes` contém só `format`, `filtros`, `rowCount` — nada de dados resultantes.

## O que NÃO está coberto (v0.9 → roadmap para v1.0)

- Componentes React (precisa de @testing-library/react + jsdom)
- E2E (Playwright)
- Restore script — gera complexidade (precisa de um dump válido pré-construído)
- Notificações (SMTP) — externamente integrado, mock-out preferível
- Worker cron lifecycle — precisa de manipular tempo (vi.useFakeTimers)
