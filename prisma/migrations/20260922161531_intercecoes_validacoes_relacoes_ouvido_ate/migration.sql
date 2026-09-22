-- Interceções: validações quinzenais, relações (contactos identificados),
-- "ouvido até" por linha e colunas do modelo de controlo em papel.
--
-- O booleano `paraTranscricao` dá lugar ao estado `transcricao`; os produtos
-- marcados passam a PEDIDA antes de a coluna antiga ser removida, por isso
-- não há perda de dados apesar do aviso do Prisma.

-- CreateEnum
CREATE TYPE "EstadoTranscricao" AS ENUM ('NENHUMA', 'PEDIDA', 'AUTORIZADA', 'TRANSCRITA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNotificacao" ADD VALUE 'INTERCECAO_VALIDACAO_APROXIMA';
ALTER TYPE "TipoNotificacao" ADD VALUE 'INTERCECAO_RENOVACAO_PREPARAR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoProdutoIntercecao" ADD VALUE 'VOZ';
ALTER TYPE "TipoProdutoIntercecao" ADD VALUE 'RAW';

-- AlterTable
ALTER TABLE "IntercecaoLinha" ADD COLUMN     "dataOficio" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IntercecaoProduto"
ADD COLUMN     "idProduto" TEXT,
ADD COLUMN     "identificacaoDe" TEXT,
ADD COLUMN     "identificacaoPara" TEXT,
ADD COLUMN     "transcricao" "EstadoTranscricao" NOT NULL DEFAULT 'NENHUMA',
ADD COLUMN     "transcricaoEm" TIMESTAMP(3);

-- Migração de dados: o que estava marcado para transcrição fica como PEDIDA.
UPDATE "IntercecaoProduto" SET "transcricao" = 'PEDIDA' WHERE "paraTranscricao" = true;

-- AlterTable
ALTER TABLE "IntercecaoProduto" DROP COLUMN "paraTranscricao";

-- CreateTable
CREATE TABLE "IntercecaoPlanoValidacao" (
    "id" TEXT NOT NULL,
    "dataPrimeira" TIMESTAMP(3) NOT NULL,
    "intervaloDias" INTEGER NOT NULL DEFAULT 14,
    "alertaDias" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoid" TEXT NOT NULL,

    CONSTRAINT "IntercecaoPlanoValidacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntercecaoValidacao" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "feitaEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "alertaEnviado" BOOLEAN NOT NULL DEFAULT false,
    "alertaRenovacaoEnviado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planoId" TEXT NOT NULL,
    "feitaPorId" TEXT,

    CONSTRAINT "IntercecaoValidacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntercecaoRelacao" (
    "id" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "nome" TEXT,
    "morada" TEXT,
    "documento" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "fichaSpo" TEXT,
    "notas" TEXT,
    "fotoStoredName" TEXT,
    "fotoFilename" TEXT,
    "fotoMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoid" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "IntercecaoRelacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntercecaoOuvidoAte" (
    "id" TEXT NOT NULL,
    "numeroProduto" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "horaInicio" TEXT,
    "horaFim" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linhaId" TEXT NOT NULL,
    "registadoPorId" TEXT NOT NULL,

    CONSTRAINT "IntercecaoOuvidoAte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntercecaoPlanoValidacao_inqueritoid_key" ON "IntercecaoPlanoValidacao"("inqueritoid");

-- CreateIndex
CREATE INDEX "IntercecaoValidacao_planoId_idx" ON "IntercecaoValidacao"("planoId");

-- CreateIndex
CREATE INDEX "IntercecaoValidacao_data_idx" ON "IntercecaoValidacao"("data");

-- CreateIndex
CREATE UNIQUE INDEX "IntercecaoValidacao_planoId_numero_key" ON "IntercecaoValidacao"("planoId", "numero");

-- CreateIndex
CREATE INDEX "IntercecaoRelacao_inqueritoid_idx" ON "IntercecaoRelacao"("inqueritoid");

-- CreateIndex
CREATE UNIQUE INDEX "IntercecaoRelacao_inqueritoid_contacto_key" ON "IntercecaoRelacao"("inqueritoid", "contacto");

-- CreateIndex
CREATE INDEX "IntercecaoOuvidoAte_linhaId_createdAt_idx" ON "IntercecaoOuvidoAte"("linhaId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "IntercecaoPlanoValidacao" ADD CONSTRAINT "IntercecaoPlanoValidacao_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoValidacao" ADD CONSTRAINT "IntercecaoValidacao_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "IntercecaoPlanoValidacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoValidacao" ADD CONSTRAINT "IntercecaoValidacao_feitaPorId_fkey" FOREIGN KEY ("feitaPorId") REFERENCES "Utilizador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoRelacao" ADD CONSTRAINT "IntercecaoRelacao_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoRelacao" ADD CONSTRAINT "IntercecaoRelacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoOuvidoAte" ADD CONSTRAINT "IntercecaoOuvidoAte_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "IntercecaoLinha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercecaoOuvidoAte" ADD CONSTRAINT "IntercecaoOuvidoAte_registadoPorId_fkey" FOREIGN KEY ("registadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
