-- AlterEnum
ALTER TYPE "TipoNotificacao" ADD VALUE 'TRANSICAO_AUTOMATICA';

-- CreateTable
CREATE TABLE "RegraTransicaoAutomatica" (
    "id" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "meses" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraTransicaoAutomatica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegraTransicaoAutomatica_origemId_key" ON "RegraTransicaoAutomatica"("origemId");

-- CreateIndex
CREATE INDEX "RegraTransicaoAutomatica_destinoId_idx" ON "RegraTransicaoAutomatica"("destinoId");

-- CreateIndex
CREATE INDEX "RegraTransicaoAutomatica_ativa_idx" ON "RegraTransicaoAutomatica"("ativa");

-- AddForeignKey
ALTER TABLE "RegraTransicaoAutomatica" ADD CONSTRAINT "RegraTransicaoAutomatica_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "EstadoInquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraTransicaoAutomatica" ADD CONSTRAINT "RegraTransicaoAutomatica_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "EstadoInquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
