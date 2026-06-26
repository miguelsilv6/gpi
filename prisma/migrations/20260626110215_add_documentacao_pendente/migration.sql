-- AlterTable
ALTER TABLE "Inquerito" ADD COLUMN     "documentacaoPendente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "documentacaoPendenteDesde" TIMESTAMP(3),
ADD COLUMN     "documentacaoPendenteNota" TEXT;

-- CreateIndex
CREATE INDEX "Inquerito_documentacaoPendente_idx" ON "Inquerito"("documentacaoPendente");
