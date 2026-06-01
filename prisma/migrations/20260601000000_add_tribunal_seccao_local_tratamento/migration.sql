-- CreateTable Tribunal
CREATE TABLE "Tribunal" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tribunal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tribunal_nome_key" ON "Tribunal"("nome");
CREATE INDEX "Tribunal_ativo_ordem_idx" ON "Tribunal"("ativo", "ordem");

-- CreateTable Seccao
CREATE TABLE "Seccao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Seccao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Seccao_nome_key" ON "Seccao"("nome");
CREATE INDEX "Seccao_ativo_ordem_idx" ON "Seccao"("ativo", "ordem");

-- CreateTable LocalTratamento
CREATE TABLE "LocalTratamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocalTratamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LocalTratamento_nome_key" ON "LocalTratamento"("nome");
CREATE INDEX "LocalTratamento_ativo_ordem_idx" ON "LocalTratamento"("ativo", "ordem");

-- AlterTable Inquerito: drop old free-text tribunal, add FK columns
ALTER TABLE "Inquerito" DROP COLUMN "tribunal";
ALTER TABLE "Inquerito" ADD COLUMN "tribunalId" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN "seccaoId" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN "localTratamentoId" TEXT;

-- FK constraints
ALTER TABLE "Inquerito" ADD CONSTRAINT "Inquerito_tribunalId_fkey" FOREIGN KEY ("tribunalId") REFERENCES "Tribunal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inquerito" ADD CONSTRAINT "Inquerito_seccaoId_fkey" FOREIGN KEY ("seccaoId") REFERENCES "Seccao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inquerito" ADD CONSTRAINT "Inquerito_localTratamentoId_fkey" FOREIGN KEY ("localTratamentoId") REFERENCES "LocalTratamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Inquerito_tribunalId_idx" ON "Inquerito"("tribunalId");
CREATE INDEX "Inquerito_seccaoId_idx" ON "Inquerito"("seccaoId");
CREATE INDEX "Inquerito_localTratamentoId_idx" ON "Inquerito"("localTratamentoId");
