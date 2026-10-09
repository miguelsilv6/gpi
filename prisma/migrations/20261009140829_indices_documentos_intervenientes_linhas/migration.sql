-- DropIndex
DROP INDEX "Documento_inqueritoid_idx";

-- CreateIndex
CREATE INDEX "Documento_inqueritoid_createdAt_idx" ON "Documento"("inqueritoid", "createdAt");

-- CreateIndex
CREATE INDEX "IntercecaoLinha_identificador_idx" ON "IntercecaoLinha"("identificador");

-- CreateIndex
CREATE INDEX "Interveniente_nif_idx" ON "Interveniente"("nif");
