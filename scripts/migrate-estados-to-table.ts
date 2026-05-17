/**
 * One-shot migration: converts the EstadoInquerito enum into a configurable table.
 *
 * Steps (atomic in a single PG transaction):
 *   1. Create new table EstadoInquerito_new (will be renamed at the end)
 *   2. Seed with the 5 standard states (codigo matches the old enum values)
 *   3. Add column Inquerito.estadoId (nullable)
 *   4. Backfill estadoId based on the existing estado enum
 *   5. Drop the old `estado` column
 *   6. Drop the old enum type
 *   7. Rename EstadoInquerito_new → EstadoInquerito
 *   8. Make estadoId NOT NULL + add FK constraint + index
 *
 * After running this script, edit prisma/schema.prisma to reflect the new shape
 * (no enum, new model, Inquerito.estadoId FK), then run `prisma generate`.
 */
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

// Stable codigos that the code can reference if needed
const ESTADOS = [
  { codigo: 'ABERTO', nome: 'Aberto', ordem: 1, terminal: false, cor: 'blue' },
  { codigo: 'EM_INVESTIGACAO', nome: 'Em Investigação', ordem: 2, terminal: false, cor: 'yellow' },
  { codigo: 'SUSPENSO', nome: 'Suspenso', ordem: 3, terminal: false, cor: 'orange' },
  { codigo: 'CONCLUIDO', nome: 'Concluído', ordem: 4, terminal: true, cor: 'green' },
  { codigo: 'ARQUIVADO', nome: 'Arquivado', ordem: 5, terminal: true, cor: 'gray' },
]

async function main() {
  // 0. Sanity check — does the enum still exist?
  const enumExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoInquerito') AS exists`,
  )
  if (!enumExists[0]?.exists) {
    console.log('Enum EstadoInquerito no longer exists. Migration already done?')
    return
  }

  // Generate ids in TS so SQL can reference them in the seed.
  // (crypto.randomUUID is built-in; mixing UUIDs with cuids in a TEXT column is fine.)
  const { randomUUID } = await import('crypto')
  const seedRows = ESTADOS.map((e) => ({ id: randomUUID(), ...e }))

  await prisma.$transaction(async (tx) => {
    // 1. Create new table with a temp name
    await tx.$executeRawUnsafe(`
      CREATE TABLE "EstadoInquerito_new" (
        id            TEXT PRIMARY KEY,
        codigo        TEXT NOT NULL UNIQUE,
        nome          TEXT NOT NULL,
        descricao     TEXT,
        ordem         INTEGER NOT NULL DEFAULT 0,
        terminal      BOOLEAN NOT NULL DEFAULT FALSE,
        cor           TEXT,
        ativo         BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 2. Seed
    for (const r of seedRows) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "EstadoInquerito_new" (id, codigo, nome, ordem, terminal, cor) VALUES ($1, $2, $3, $4, $5, $6)`,
        r.id,
        r.codigo,
        r.nome,
        r.ordem,
        r.terminal,
        r.cor,
      )
    }

    // 3. Add FK column (nullable for now)
    await tx.$executeRawUnsafe(`ALTER TABLE "Inquerito" ADD COLUMN "estadoId" TEXT`)

    // 4. Backfill — match by codigo against the existing enum
    for (const r of seedRows) {
      await tx.$executeRawUnsafe(
        `UPDATE "Inquerito" SET "estadoId" = $1 WHERE estado::text = $2`,
        r.id,
        r.codigo,
      )
    }

    // 5. Drop old enum column on Inquerito
    await tx.$executeRawUnsafe(`ALTER TABLE "Inquerito" DROP COLUMN estado`)

    // 6. Drop the enum type
    await tx.$executeRawUnsafe(`DROP TYPE "EstadoInquerito"`)

    // 7. Rename new table to the canonical name
    await tx.$executeRawUnsafe(
      `ALTER TABLE "EstadoInquerito_new" RENAME TO "EstadoInquerito"`,
    )

    // 8. Constraints + index
    await tx.$executeRawUnsafe(
      `ALTER TABLE "Inquerito" ALTER COLUMN "estadoId" SET NOT NULL`,
    )
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Inquerito"
        ADD CONSTRAINT "Inquerito_estadoId_fkey"
        FOREIGN KEY ("estadoId") REFERENCES "EstadoInquerito"(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
    `)
    await tx.$executeRawUnsafe(
      `CREATE INDEX "Inquerito_estadoId_idx" ON "Inquerito"("estadoId")`,
    )
  })

  console.log('✅ Migration done.')
  console.log('Next steps:')
  console.log('  1. Update prisma/schema.prisma (remove enum, add model, change Inquerito.estado)')
  console.log('  2. npx prisma generate')
  console.log('  3. Refactor TS code that referenced the enum')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
