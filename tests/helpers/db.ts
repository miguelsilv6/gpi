import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Helpers para testes de integração contra o Postgres de teste.
 *
 * Cada suite começa com `await resetDatabase(prisma)` que trunca todas as
 * tabelas relevantes, mantendo o schema. Mais rápido do que `db push` por
 * teste e suficientemente isolado para os nossos casos.
 *
 * IMPORTANTE: nunca correr `resetDatabase` contra a BD principal (gpi_db).
 * O helper verifica que `DATABASE_URL` aponta para `gpi_test_db` antes de
 * truncar.
 */

let cachedClient: PrismaClient | null = null

export function getTestPrisma(): PrismaClient {
  if (!cachedClient) {
    if (!process.env.DATABASE_URL?.includes('gpi_test_db')) {
      throw new Error(
        'Recusa de segurança: DATABASE_URL não aponta para gpi_test_db. ' +
          `Actual: ${process.env.DATABASE_URL ?? '<unset>'}. ` +
          'Define DATABASE_URL para o test DB antes de correr testes de integração.',
      )
    }
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    cachedClient = new PrismaClient({ adapter })
  }
  return cachedClient
}

/**
 * Truncate em ordem topológica reversa (FK-safe). RESTART IDENTITY repõe
 * sequências para que ids não acumulem entre testes.
 */
export async function resetDatabase(prisma: PrismaClient = getTestPrisma()): Promise<void> {
  if (!process.env.DATABASE_URL?.includes('gpi_test_db')) {
    throw new Error('Recusa: resetDatabase só corre contra gpi_test_db.')
  }
  // Truncate em cascata simplifica a ordem.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "LoginAttempt",
      "Notificacao",
      "NotificationPolicy",
      "PasswordResetToken",
      "Atividade",
      "Ausencia",
      "Sessao",
      "VerificationToken",
      "Inquerito",
      "InqueritoColaborador",
      "Interveniente",
      "IntercecaoAlvo",
      "IntercecaoLinha",
      "IntercecaoProduto",
      "Utilizador",
      "Brigada",
      "Crime",
      "AtividadePadrao",
      "EstadoInquerito",
      "ConfiguracaoSistema"
    RESTART IDENTITY CASCADE
  `)
}

export async function disconnectTestPrisma(): Promise<void> {
  if (cachedClient) {
    await cachedClient.$disconnect()
    cachedClient = null
  }
}
