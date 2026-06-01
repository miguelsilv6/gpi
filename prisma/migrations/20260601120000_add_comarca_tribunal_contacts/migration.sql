-- CreateTable
CREATE TABLE "Comarca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comarca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comarca_nome_key" ON "Comarca"("nome");

-- CreateIndex
CREATE INDEX "Comarca_ativo_ordem_idx" ON "Comarca"("ativo", "ordem");

-- AlterTable: add comarca FK + contact fields to Tribunal
ALTER TABLE "Tribunal" ADD COLUMN "comarcaId" TEXT;
ALTER TABLE "Tribunal" ADD COLUMN "morada"    TEXT;
ALTER TABLE "Tribunal" ADD COLUMN "telefone"  TEXT;
ALTER TABLE "Tribunal" ADD COLUMN "email"     TEXT;

-- AddForeignKey
ALTER TABLE "Tribunal" ADD CONSTRAINT "Tribunal_comarcaId_fkey"
    FOREIGN KEY ("comarcaId") REFERENCES "Comarca"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Tribunal_comarcaId_idx" ON "Tribunal"("comarcaId");
