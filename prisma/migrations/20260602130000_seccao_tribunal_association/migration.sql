-- Seccao passa a ter associação opcional a Tribunal.
-- O índice único global em nome é removido (secções de tribunais diferentes
-- podem ter o mesmo nome, e.g. "1ª Secção").

-- DropIndex
DROP INDEX IF EXISTS "Seccao_nome_key";

-- AlterTable: adicionar tribunalId
ALTER TABLE "Seccao" ADD COLUMN "tribunalId" TEXT;

-- AddForeignKey
ALTER TABLE "Seccao" ADD CONSTRAINT "Seccao_tribunalId_fkey"
  FOREIGN KEY ("tribunalId") REFERENCES "Tribunal"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Seccao_tribunalId_idx" ON "Seccao"("tribunalId");
