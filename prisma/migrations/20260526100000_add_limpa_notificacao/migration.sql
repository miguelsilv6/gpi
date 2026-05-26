-- AlterTable
ALTER TABLE "Notificacao" ADD COLUMN "limpa" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Notificacao_utilizadorId_limpa_idx" ON "Notificacao"("utilizadorId", "limpa");
