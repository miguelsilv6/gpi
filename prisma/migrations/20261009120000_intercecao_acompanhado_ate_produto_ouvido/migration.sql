-- AlterTable
ALTER TABLE "IntercecaoAlvo" ADD COLUMN     "acompanhadoAte" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IntercecaoProduto" ADD COLUMN     "ouvido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ouvidoEm" TIMESTAMP(3);

