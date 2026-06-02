-- Normalize existing non-null matriculas to uppercase before adding unique index
UPDATE "Viatura" SET "matricula" = UPPER("matricula") WHERE "matricula" IS NOT NULL;

-- Deduplicate: for each set of duplicate (normalized) matriculas, keep the most recently
-- updated row and null-out the matricula on the older duplicates so the unique index
-- can be created without failing on pre-existing data.
UPDATE "Viatura" v
SET "matricula" = NULL
WHERE "matricula" IS NOT NULL
  AND "id" NOT IN (
    SELECT DISTINCT ON ("matricula") "id"
    FROM "Viatura"
    WHERE "matricula" IS NOT NULL
    ORDER BY "matricula", "updatedAt" DESC
  );

-- CreateIndex
CREATE UNIQUE INDEX "Viatura_matricula_key" ON "Viatura"("matricula");
