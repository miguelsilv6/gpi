-- Add comarcaId column to Seccao
ALTER TABLE "Seccao" ADD COLUMN "comarcaId" TEXT;

-- Migrate existing data: inherit comarca from the section's tribunal
UPDATE "Seccao" s
SET "comarcaId" = t."comarcaId"
FROM "Tribunal" t
WHERE s."tribunalId" = t.id AND t."comarcaId" IS NOT NULL;

-- Add foreign key
ALTER TABLE "Seccao" ADD CONSTRAINT "Seccao_comarcaId_fkey"
    FOREIGN KEY ("comarcaId") REFERENCES "Comarca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index on comarcaId
CREATE INDEX "Seccao_comarcaId_idx" ON "Seccao"("comarcaId");

-- Drop old index and column
DROP INDEX IF EXISTS "Seccao_tribunalId_idx";
ALTER TABLE "Seccao" DROP COLUMN "tribunalId";
