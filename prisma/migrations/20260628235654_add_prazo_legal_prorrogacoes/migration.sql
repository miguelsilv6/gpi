-- AlterTable
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN     "prazoLegalAlertaDias" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "prazoLegalMeses" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "ProrrogacaoInquerito" (
    "id" TEXT NOT NULL,
    "meses" INTEGER NOT NULL,
    "despacho" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inqueritoId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "ProrrogacaoInquerito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProrrogacaoInquerito_inqueritoId_idx" ON "ProrrogacaoInquerito"("inqueritoId");

-- CreateIndex
CREATE INDEX "ProrrogacaoInquerito_criadoPorId_idx" ON "ProrrogacaoInquerito"("criadoPorId");

-- AddForeignKey
ALTER TABLE "ProrrogacaoInquerito" ADD CONSTRAINT "ProrrogacaoInquerito_inqueritoId_fkey" FOREIGN KEY ("inqueritoId") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProrrogacaoInquerito" ADD CONSTRAINT "ProrrogacaoInquerito_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
