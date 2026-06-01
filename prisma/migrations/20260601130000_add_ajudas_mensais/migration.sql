-- CreateEnum
CREATE TYPE "AjudasPrevencao" AS ENUM ('NENHUMA', 'PIQUETE', 'PREVENCAO_PASSIVA');

-- CreateEnum
CREATE TYPE "AjudasViatura" AS ENUM ('PROPRIA', 'BRIGADA');

-- CreateTable
CREATE TABLE "AjudasConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "vencimentoBase" DOUBLE PRECISION NOT NULL DEFAULT 1974.41,
    "vencimentoDN" DOUBLE PRECISION NOT NULL DEFAULT 7143.207,
    "percentPiqueteSemana" DOUBLE PRECISION NOT NULL DEFAULT 0.083,
    "percentPiqueteFds" DOUBLE PRECISION NOT NULL DEFAULT 0.105,
    "percentPrevencaoPassiva" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "ajudaCustoMaxDiario" DOUBLE PRECISION NOT NULL DEFAULT 62.75,
    "senhaAlmoco" DOUBLE PRECISION NOT NULL DEFAULT 9.60,
    "senhaJantar" DOUBLE PRECISION NOT NULL DEFAULT 8.23,
    "senhaCeia" DOUBLE PRECISION NOT NULL DEFAULT 4.24,
    "taxaIRS" DOUBLE PRECISION NOT NULL DEFAULT 0.1116,
    "taxaSS" DOUBLE PRECISION NOT NULL DEFAULT 0.11,
    "distanciaMinKmAjudas" INTEGER NOT NULL DEFAULT 35,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AjudasConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjudasRegisto" (
    "id" TEXT NOT NULL,
    "utilizadorId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AjudasRegisto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjudasLinha" (
    "id" TEXT NOT NULL,
    "registoId" TEXT NOT NULL,
    "nuipc" TEXT,
    "local" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "prevencao" "AjudasPrevencao" NOT NULL DEFAULT 'NENHUMA',
    "ajudaCustoAlmoco" INTEGER NOT NULL DEFAULT 0,
    "ajudaCustoJantar" INTEGER NOT NULL DEFAULT 0,
    "ajudaCustoAlojamento" INTEGER NOT NULL DEFAULT 0,
    "senhaAlmoco" INTEGER NOT NULL DEFAULT 0,
    "senhaJantar" INTEGER NOT NULL DEFAULT 0,
    "senhaCeia" INTEGER NOT NULL DEFAULT 0,
    "viatura" "AjudasViatura",
    "km" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AjudasLinha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AjudasRegisto_utilizadorId_ano_mes_key" ON "AjudasRegisto"("utilizadorId", "ano", "mes");

-- CreateIndex
CREATE INDEX "AjudasRegisto_utilizadorId_idx" ON "AjudasRegisto"("utilizadorId");

-- CreateIndex
CREATE INDEX "AjudasLinha_registoId_idx" ON "AjudasLinha"("registoId");

-- AddForeignKey
ALTER TABLE "AjudasRegisto" ADD CONSTRAINT "AjudasRegisto_utilizadorId_fkey"
    FOREIGN KEY ("utilizadorId") REFERENCES "Utilizador"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjudasLinha" ADD CONSTRAINT "AjudasLinha_registoId_fkey"
    FOREIGN KEY ("registoId") REFERENCES "AjudasRegisto"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
