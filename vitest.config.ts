import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest configuration.
 *
 * Estrutura simples: um único projecto, mas com scripts npm dedicados a
 * subconjuntos:
 *
 *   - `npm run test:unit`        → vitest run tests/unit
 *   - `npm run test:integration` → vitest run tests/integration (precisa BD)
 *   - `npm test`                 → corre tudo
 *
 * Os ficheiros de integração precisam do Postgres de teste (gpi_test_db)
 * ligado. Em CI o serviço Postgres é provisionado pelo workflow.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    // Os testes de integração partilham uma BD — desactivamos paralelismo
    // entre ficheiros para evitar interferências (truncate vs queries em curso).
    // Os unit tests não são afectados pela serialização porque são rápidos.
    fileParallelism: false,
    // Hooks bcrypt podem ser lentos no setup; 30s é generoso.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
