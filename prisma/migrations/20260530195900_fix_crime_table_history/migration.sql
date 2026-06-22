-- Historical fix: the Crime catalog table was originally created out-of-band
-- on existing databases (alongside the natureza->crime backfill in
-- scripts/migrate-natureza-to-crime.ts, which runs on every container boot
-- and is itself idempotent), never as a committed migration. The next
-- migration in this chain (add_crimes_associados) assumes "Crime" already
-- exists, so a fresh `prisma migrate deploy` fails before reaching it.
--
-- Guarded: a no-op on any database that already has the Crime table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Crime') THEN
    CREATE TABLE "Crime" (
        "id" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "descricao" TEXT,
        "ordem" INTEGER NOT NULL DEFAULT 0,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Crime_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "Crime_nome_key" ON "Crime"("nome");
    CREATE INDEX "Crime_ativo_ordem_idx" ON "Crime"("ativo", "ordem");

    ALTER TABLE "Inquerito" ADD COLUMN "crimeId" TEXT;
    ALTER TABLE "Inquerito" ADD CONSTRAINT "Inquerito_crimeId_fkey"
      FOREIGN KEY ("crimeId") REFERENCES "Crime"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    CREATE INDEX "Inquerito_crimeId_idx" ON "Inquerito"("crimeId");
  END IF;
END $$;
