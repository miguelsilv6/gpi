-- Historical fix: the AtividadePadrao catalog table (and its FK to
-- EstadoInquerito) was created out-of-band on existing databases, never as
-- a committed migration. The next migration in this chain
-- (add_tem_controlo_atividade_padrao) only adds one column to it and
-- assumes the table already exists, so a fresh `prisma migrate deploy`
-- fails before reaching it.
--
-- Guarded: a no-op on any database that already has the table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'AtividadePadrao') THEN
    CREATE TABLE "AtividadePadrao" (
        "id" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "descricao" TEXT,
        "ativa" BOOLEAN NOT NULL DEFAULT true,
        "ordem" INTEGER NOT NULL DEFAULT 0,
        "temPrazo" BOOLEAN NOT NULL DEFAULT false,
        "temQuantidade" BOOLEAN NOT NULL DEFAULT false,
        "contaParaEstatistica" BOOLEAN NOT NULL DEFAULT true,
        "transicaoEstadoId" TEXT,
        "categoriaDashboard" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "AtividadePadrao_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "AtividadePadrao_nome_key" ON "AtividadePadrao"("nome");
    CREATE INDEX "AtividadePadrao_transicaoEstadoId_idx" ON "AtividadePadrao"("transicaoEstadoId");
    CREATE INDEX "AtividadePadrao_categoriaDashboard_idx" ON "AtividadePadrao"("categoriaDashboard");
    ALTER TABLE "AtividadePadrao" ADD CONSTRAINT "AtividadePadrao_transicaoEstadoId_fkey"
      FOREIGN KEY ("transicaoEstadoId") REFERENCES "EstadoInquerito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
