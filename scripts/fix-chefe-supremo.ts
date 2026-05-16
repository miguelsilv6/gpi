import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const a = await prisma.utilizador.update({
    where: { email: 'admin@gpi.pt' },
    data: { chefeSupremo: true, tokenVersion: { increment: 1 } },
  })
  const c = await prisma.utilizador.update({
    where: { email: 'chefe@gpi.pt' },
    data: { chefeSupremo: false, tokenVersion: { increment: 1 } },
  })
  console.log('admin@gpi.pt    chefeSupremo →', a.chefeSupremo)
  console.log('chefe@gpi.pt    chefeSupremo →', c.chefeSupremo)
}

main().finally(() => prisma.$disconnect())
