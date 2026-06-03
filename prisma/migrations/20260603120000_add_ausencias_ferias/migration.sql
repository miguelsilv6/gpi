-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('FERIAS', 'FOLGA');

-- AlterTable: module toggle for the Férias module
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloFeriasAtivo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Ausencia" (
    "id" TEXT NOT NULL,
    "inspetorId" TEXT NOT NULL,
    "brigadaId" TEXT,
    "tipo" "TipoAusencia" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "nota" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ausencia_inspetorId_idx" ON "Ausencia"("inspetorId");

-- CreateIndex
CREATE INDEX "Ausencia_brigadaId_idx" ON "Ausencia"("brigadaId");

-- CreateIndex
CREATE INDEX "Ausencia_deletedAt_idx" ON "Ausencia"("deletedAt");

-- CreateIndex
CREATE INDEX "Ausencia_inspetorId_dataInicio_idx" ON "Ausencia"("inspetorId", "dataInicio");

-- AddForeignKey
ALTER TABLE "Ausencia" ADD CONSTRAINT "Ausencia_inspetorId_fkey"
    FOREIGN KEY ("inspetorId") REFERENCES "Utilizador"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausencia" ADD CONSTRAINT "Ausencia_brigadaId_fkey"
    FOREIGN KEY ("brigadaId") REFERENCES "Brigada"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
