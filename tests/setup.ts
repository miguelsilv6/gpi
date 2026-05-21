/**
 * Setup global Vitest.
 *
 * Configura a env DATABASE_URL para apontar à BD de teste se não tiver sido
 * já definida pelo ambiente (CI sets it; localmente o operador exporta).
 *
 * Os ficheiros de integração ainda precisam de garantir o schema (db push)
 * — isto faz-se em tests/helpers/db.ts no `beforeAll` de cada suite.
 */

if (!process.env.DATABASE_URL) {
  // Default razoável para correr localmente contra o gpi_postgres do compose.
  // O operador deve criar `gpi_test_db` antes de correr os integration tests.
  process.env.DATABASE_URL =
    'postgresql://gpi_user:XwbNB6go6J5TSLx1htotc4ef@localhost:5432/gpi_test_db?schema=public'
}

// NOTA: NODE_ENV='test' é definido automaticamente pelo Vitest — não
// precisamos (e nem podemos, em TS estrito) atribuir manualmente porque
// @types/node declara-o como readonly literal type.
//
// Auth secret estável (testes nunca tocam em sessões reais).
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'test-secret-32-bytes-do-not-use-elsewhere'
process.env.AUTH_TRUST_HOST = 'true'
