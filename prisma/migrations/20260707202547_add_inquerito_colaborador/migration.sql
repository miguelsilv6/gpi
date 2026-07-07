-- CreateTable
CREATE TABLE "InqueritoColaborador" (
    "id" TEXT NOT NULL,
    "motivo" TEXT,
    "expiraEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoid" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "concedidoPorId" TEXT,

    CONSTRAINT "InqueritoColaborador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InqueritoColaborador_inqueritoid_idx" ON "InqueritoColaborador"("inqueritoid");

-- CreateIndex
CREATE INDEX "InqueritoColaborador_colaboradorId_idx" ON "InqueritoColaborador"("colaboradorId");

-- CreateIndex
CREATE INDEX "InqueritoColaborador_expiraEm_idx" ON "InqueritoColaborador"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "InqueritoColaborador_inqueritoid_colaboradorId_key" ON "InqueritoColaborador"("inqueritoid", "colaboradorId");

-- AddForeignKey
ALTER TABLE "InqueritoColaborador" ADD CONSTRAINT "InqueritoColaborador_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InqueritoColaborador" ADD CONSTRAINT "InqueritoColaborador_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Utilizador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InqueritoColaborador" ADD CONSTRAINT "InqueritoColaborador_concedidoPorId_fkey" FOREIGN KEY ("concedidoPorId") REFERENCES "Utilizador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
