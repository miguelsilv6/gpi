-- Historical fix: Inquerito.tribunal (free-text, nullable) was added to
-- existing databases out-of-band, never as a committed migration. The next
-- migration in this chain (add_tribunal_seccao_local_tratamento) drops this
-- column when replacing it with FK references to the new Tribunal/Seccao/
-- LocalTratamento catalogs, so a fresh `prisma migrate deploy` fails before
-- reaching it.
--
-- Guarded: a no-op on any database that already has the column.
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "tribunal" TEXT;
