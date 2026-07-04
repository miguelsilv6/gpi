-- AlterTable
ALTER TABLE "IntercecaoAlvo" ADD COLUMN     "notas" TEXT;

-- AlterTable
ALTER TABLE "IntercecaoLinha" ADD COLUMN     "renovacoes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "IntercecaoProduto" ADD COLUMN     "duracao" TEXT,
ADD COLUMN     "paraTranscricao" BOOLEAN NOT NULL DEFAULT false;
