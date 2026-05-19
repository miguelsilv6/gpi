/**
 * Idempotent backfill: ensure every Inquerito has a `crimeId` pointing to a
 * Crime row whose `nome` matches the legacy free-text `natureza`.
 *
 * Runs from docker-entrypoint after `prisma db push`. Safe to re-run: only
 * touches inquéritos whose crimeId is null.
 *
 * Once every Inquerito has crimeId set and the UI no longer reads the legacy
 * column, a future migration can drop `Inquerito.natureza` and make
 * `crimeId` NOT NULL.
 */
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const pending = await prisma.inquerito.findMany({
    where: { crimeId: null },
    select: { id: true, natureza: true },
  })

  if (pending.length === 0) {
    console.log('[migrate-natureza] Nothing to do (all inquéritos already have crimeId).')
    return
  }

  // Distinct, trimmed, non-empty naturezas
  const naturezas = Array.from(
    new Set(
      pending
        .map((p) => p.natureza?.trim())
        .filter((n): n is string => !!n && n.length > 0),
    ),
  ).sort()

  console.log(
    `[migrate-natureza] ${pending.length} inquérito(s) sem crimeId; ${naturezas.length} natureza(s) distinta(s).`,
  )

  // Upsert Crime rows (case-insensitive lookup, exact-case insert)
  const nameToId = new Map<string, string>()
  for (const nome of naturezas) {
    const existing = await prisma.crime.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) {
      nameToId.set(nome, existing.id)
      continue
    }
    const created = await prisma.crime.create({
      data: { nome },
      select: { id: true },
    })
    nameToId.set(nome, created.id)
    console.log(`[migrate-natureza]   + Crime «${nome}»`)
  }

  // Backfill — group by natureza so we issue one UPDATE per crime
  let updated = 0
  for (const [nome, crimeId] of nameToId.entries()) {
    const ids = pending
      .filter((p) => p.natureza?.trim() === nome)
      .map((p) => p.id)
    if (ids.length === 0) continue
    const res = await prisma.inquerito.updateMany({
      where: { id: { in: ids }, crimeId: null },
      data: { crimeId },
    })
    updated += res.count
  }

  console.log(`[migrate-natureza] ✓ ${updated} inquérito(s) atualizado(s).`)
}

main()
  .catch((e) => {
    console.error('[migrate-natureza] FAILED:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
