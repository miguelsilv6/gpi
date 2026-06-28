-- AlterTable
ALTER TABLE "Inquerito" ADD COLUMN     "documentacaoPendentePorId" TEXT;

-- CreateIndex
CREATE INDEX "Inquerito_documentacaoPendentePorId_idx" ON "Inquerito"("documentacaoPendentePorId");

-- AddForeignKey
ALTER TABLE "Inquerito" ADD CONSTRAINT "Inquerito_documentacaoPendentePorId_fkey" FOREIGN KEY ("documentacaoPendentePorId") REFERENCES "Utilizador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
