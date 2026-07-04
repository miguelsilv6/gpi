-- CreateEnum
CREATE TYPE "TipoLinhaIntercecao" AS ENUM ('SIM', 'IMEI', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoProdutoIntercecao" AS ENUM ('CHAMADA', 'SMS', 'MMS', 'DADOS', 'LOCALIZACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DirecaoProdutoIntercecao" AS ENUM ('EFETUADA', 'RECEBIDA');

-- AlterEnum
ALTER TYPE "TipoNotificacao" ADD VALUE 'INTERCECAO_A_TERMINAR';

-- AlterTable
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN     "moduloIntercecoesAtivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moduloIntercecoesRoles" TEXT NOT NULL DEFAULT 'INSPETOR,INSPETOR_CHEFE,COORDENADOR';

-- CreateTable
CREATE TABLE "IntercecaoAlvo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoid" TEXT NOT NULL,

    CONSTRAINT "IntercecaoAlvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntercecaoLinha" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLinhaIntercecao" NOT NULL,
    "identificador" TEXT NOT NULL,
    "rede" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "alertaDias1" INTEGER DEFAULT 10,
    "alertaDias2" INTEGER DEFAULT 3,
    "alerta1Enviado" BOOLEAN NOT NULL DEFAULT false,
    "alerta2Enviado" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "alvoId" TEXT NOT NULL,

    CONSTRAINT "IntercecaoLinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntercecaoProduto" (
    "id" TEXT NOT NULL,
    "tipo" "TipoProdutoIntercecao" NOT NULL,
    "numeroProduto" TEXT,
    "direcao" "DirecaoProdutoIntercecao",
    "data" TIMESTAMP(3) NOT NULL,
    "horaInicio" TEXT,
    "horaFim" TEXT,
    "de" TEXT,
    "para" TEXT,
    "resumo" TEXT NOT NULL,
    "comentarios" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alvoId" TEXT NOT NULL,
    "linhaId" TEXT,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "IntercecaoProduto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntercecaoAlvo_inqueritoid_idx" ON "IntercecaoAlvo"("inqueritoid");

-- CreateIndex
CREATE UNIQUE INDEX "IntercecaoAlvo_inqueritoid_codigo_key" ON "IntercecaoAlvo"("inqueritoid", "codigo");

-- CreateIndex
CREATE INDEX "IntercecaoLinha_alvoId_idx" ON "IntercecaoLinha"("alvoId");

-- CreateIndex
CREATE INDEX "IntercecaoLinha_dataFim_idx" ON "IntercecaoLinha"("dataFim");

-- CreateIndex
CREATE INDEX "IntercecaoProduto_alvoId_data_idx" ON "IntercecaoProduto"("alvoId", "data");

-- CreateIndex
CREATE INDEX "IntercecaoProduto_alvoId_idx" ON "IntercecaoProduto"("alvoId");

-- CreateIndex
CREATE INDEX "IntercecaoProduto_linhaId_idx" ON "IntercecaoProduto"("linhaId");

-- CreateIndex
CREATE INDEX "IntercecaoProduto_criadoPorId_idx" ON "IntercecaoProduto"("criadoPorId");

-- AddForeignKey
ALTER TABLE "IntercecaoAlvo" ADD CONSTRAINT "IntercecaoAlvo_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoLinha" ADD CONSTRAINT "IntercecaoLinha_alvoId_fkey" FOREIGN KEY ("alvoId") REFERENCES "IntercecaoAlvo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoProduto" ADD CONSTRAINT "IntercecaoProduto_alvoId_fkey" FOREIGN KEY ("alvoId") REFERENCES "IntercecaoAlvo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoProduto" ADD CONSTRAINT "IntercecaoProduto_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "IntercecaoLinha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoProduto" ADD CONSTRAINT "IntercecaoProduto_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
