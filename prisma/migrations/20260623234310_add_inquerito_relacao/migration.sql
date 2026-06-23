-- CreateEnum
CREATE TYPE "TipoRelacaoInquerito" AS ENUM ('RELACIONADO', 'APENSO', 'CONEXO');

-- CreateTable
CREATE TABLE "InqueritoRelacao" (
    "id" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "tipo" "TipoRelacaoInquerito" NOT NULL DEFAULT 'RELACIONADO',
    "nota" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InqueritoRelacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InqueritoRelacao_origemId_idx" ON "InqueritoRelacao"("origemId");

-- CreateIndex
CREATE INDEX "InqueritoRelacao_destinoId_idx" ON "InqueritoRelacao"("destinoId");

-- CreateIndex
CREATE INDEX "InqueritoRelacao_criadoPorId_idx" ON "InqueritoRelacao"("criadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "InqueritoRelacao_origemId_destinoId_key" ON "InqueritoRelacao"("origemId", "destinoId");

-- AddForeignKey
ALTER TABLE "InqueritoRelacao" ADD CONSTRAINT "InqueritoRelacao_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InqueritoRelacao" ADD CONSTRAINT "InqueritoRelacao_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InqueritoRelacao" ADD CONSTRAINT "InqueritoRelacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
