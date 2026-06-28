-- AlterTable
ALTER TABLE "Inquerito" ADD COLUMN     "documentacaoPendentePorId" TEXT;

-- CreateIndex
CREATE INDEX "Inquerito_documentacaoPendentePorId_idx" ON "Inquerito"("documentacaoPendentePorId");

-- AddForeignKey
ALTER TABLE "Inquerito" ADD CONSTRAINT "Inquerito_documentacaoPendentePorId_fkey" FOREIGN KEY ("documentacaoPendentePorId") REFERENCES "Utilizador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: marcas pendentes pré-existentes (sem autor registado) passam a
-- pertencer ao inspetor titular, para não ficarem órfãs/invisíveis com a nova
-- listagem privada por autor. Rows sem inspetor permanecem sem autor (raro).
UPDATE "Inquerito"
SET "documentacaoPendentePorId" = "inspetorId"
WHERE "documentacaoPendente" = TRUE AND "documentacaoPendentePorId" IS NULL;
