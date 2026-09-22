-- Historical residue: 20260528175900_fix_estado_inquerito_history created
-- "codigo" with an inline `UNIQUE` column constraint (a real pg_constraint
-- row backed by an index of the same name), not the bare `CREATE UNIQUE
-- INDEX` that Prisma's own `@unique` convention produces (schema.prisma
-- has no `@@unique` block here — just `codigo String @unique`).
-- 20260622120000_sync_schema_drift only renamed the backing index to
-- match ("EstadoInquerito_codigo_key"), leaving the constraint itself in
-- place — so every database that ran this migration chain ends up with a
-- real UNIQUE CONSTRAINT here, unlike a database whose EstadoInquerito
-- table Prisma created directly (plain unique index).
--
-- This mismatch breaks restoring a `pg_dump --clean` backup taken from an
-- install on the other side of that divide: pg_dump emits
-- `DROP INDEX "EstadoInquerito_codigo_key"` (correct when the source has
-- a plain index), which Postgres refuses here because a constraint owns
-- it: "cannot drop index ... because constraint ... requires it".
--
-- Converts the constraint into the plain unique index Prisma expects, so
-- every fresh install matches. Guarded: a no-op if already a plain index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'EstadoInquerito_codigo_key'
      AND conrelid = '"EstadoInquerito"'::regclass
  ) THEN
    ALTER TABLE "EstadoInquerito" DROP CONSTRAINT "EstadoInquerito_codigo_key";
    CREATE UNIQUE INDEX "EstadoInquerito_codigo_key" ON "EstadoInquerito"("codigo");
  END IF;
END $$;
