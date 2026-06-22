-- Historical fix: the EstadoInquerito enum->table conversion was originally
-- applied to existing databases out-of-band (scripts/migrate-estados-to-table.ts),
-- never as a committed migration. The next migration in this chain
-- (add_distribuido_estado) assumes the "EstadoInquerito" table already exists,
-- so a fresh `prisma migrate deploy` fails before reaching it. This migration
-- replays that conversion here so the history is self-contained.
--
-- Guarded: a no-op on any database where the enum has already been converted
-- (i.e. every database that ran the one-off script directly).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoInquerito' AND typtype = 'e') THEN
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
    );

    INSERT INTO "EstadoInquerito_new" (id, codigo, nome, ordem, terminal, cor) VALUES
      (gen_random_uuid()::text, 'ABERTO', 'Aberto', 1, FALSE, 'blue'),
      (gen_random_uuid()::text, 'EM_INVESTIGACAO', 'Em Investigação', 2, FALSE, 'yellow'),
      (gen_random_uuid()::text, 'SUSPENSO', 'Suspenso', 3, FALSE, 'orange'),
      (gen_random_uuid()::text, 'CONCLUIDO', 'Concluído', 4, TRUE, 'green'),
      (gen_random_uuid()::text, 'ARQUIVADO', 'Arquivado', 5, TRUE, 'gray');

    ALTER TABLE "Inquerito" ADD COLUMN "estadoId" TEXT;

    UPDATE "Inquerito" i SET "estadoId" = e.id
      FROM "EstadoInquerito_new" e
      WHERE i.estado::text = e.codigo;

    ALTER TABLE "Inquerito" DROP COLUMN estado;
    DROP TYPE "EstadoInquerito";
    ALTER TABLE "EstadoInquerito_new" RENAME TO "EstadoInquerito";

    ALTER TABLE "Inquerito" ALTER COLUMN "estadoId" SET NOT NULL;
    ALTER TABLE "Inquerito"
      ADD CONSTRAINT "Inquerito_estadoId_fkey"
      FOREIGN KEY ("estadoId") REFERENCES "EstadoInquerito"(id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
    CREATE INDEX "Inquerito_estadoId_idx" ON "Inquerito"("estadoId");
  END IF;
END $$;
