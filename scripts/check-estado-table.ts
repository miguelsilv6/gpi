import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const cols = await prisma.$queryRawUnsafe<unknown[]>(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'EstadoInquerito'
    ORDER BY ordinal_position
  `)
  console.log('EstadoInquerito columns:')
  console.table(cols)

  const constraints = await prisma.$queryRawUnsafe<unknown[]>(`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid = '"EstadoInquerito"'::regclass
  `)
  console.log('Constraints:')
  console.table(constraints)
}

main().finally(() => prisma.$disconnect())
