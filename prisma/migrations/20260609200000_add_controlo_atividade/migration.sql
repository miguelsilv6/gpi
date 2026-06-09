-- Link Controlo → Atividade (optional 1-to-1)
ALTER TABLE "Controlo" ADD COLUMN "atividadeId" TEXT;
ALTER TABLE "Controlo" ADD CONSTRAINT "Controlo_atividadeId_key" UNIQUE ("atividadeId");
ALTER TABLE "Controlo" ADD CONSTRAINT "Controlo_atividadeId_fkey"
  FOREIGN KEY ("atividadeId") REFERENCES "Atividade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Controlo_atividadeId_idx" ON "Controlo"("atividadeId");
