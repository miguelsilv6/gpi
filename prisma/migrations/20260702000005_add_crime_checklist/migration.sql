-- CreateTable
CREATE TABLE "CrimeChecklistItem" (
    "id" TEXT NOT NULL,
    "crimeId" TEXT NOT NULL,
    "atividadePadraoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrimeChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrimeChecklistItem_crimeId_idx" ON "CrimeChecklistItem"("crimeId");

-- CreateIndex
CREATE INDEX "CrimeChecklistItem_atividadePadraoId_idx" ON "CrimeChecklistItem"("atividadePadraoId");

-- CreateIndex
CREATE UNIQUE INDEX "CrimeChecklistItem_crimeId_atividadePadraoId_key" ON "CrimeChecklistItem"("crimeId", "atividadePadraoId");

-- AddForeignKey
ALTER TABLE "CrimeChecklistItem" ADD CONSTRAINT "CrimeChecklistItem_crimeId_fkey" FOREIGN KEY ("crimeId") REFERENCES "Crime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrimeChecklistItem" ADD CONSTRAINT "CrimeChecklistItem_atividadePadraoId_fkey" FOREIGN KEY ("atividadePadraoId") REFERENCES "AtividadePadrao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
