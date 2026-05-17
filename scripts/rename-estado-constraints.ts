import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  // List current constraints on EstadoInquerito
  const before = await prisma.$queryRawUnsafe<{ conname: string }[]>(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"EstadoInquerito"'::regclass
  `)
  console.log('Before:', before)

  // Rename to what Prisma expects
  for (const c of before) {
    if (c.conname === 'EstadoInquerito_new_pkey') {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "EstadoInquerito" RENAME CONSTRAINT "EstadoInquerito_new_pkey" TO "EstadoInquerito_pkey"`,
      )
    }
    if (c.conname === 'EstadoInquerito_new_codigo_key') {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "EstadoInquerito" RENAME CONSTRAINT "EstadoInquerito_new_codigo_key" TO "EstadoInquerito_codigo_key"`,
      )
    }
  }

  // Indexes too
  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'EstadoInquerito'
  `)
  console.log('Indexes:', idx)
  for (const i of idx) {
    if (i.indexname.startsWith('EstadoInquerito_new_')) {
      const newName = i.indexname.replace('EstadoInquerito_new_', 'EstadoInquerito_')
      await prisma.$executeRawUnsafe(
        `ALTER INDEX "${i.indexname}" RENAME TO "${newName}"`,
      )
    }
  }

  const after = await prisma.$queryRawUnsafe<{ conname: string }[]>(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"EstadoInquerito"'::regclass
  `)
  console.log('After:', after)
}

main().finally(() => prisma.$disconnect())
