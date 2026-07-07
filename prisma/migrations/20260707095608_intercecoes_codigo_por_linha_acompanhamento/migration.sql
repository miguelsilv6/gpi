-- O código do alvo deixa de ser único por alvo: cada linha intercetada
-- (SIM, IMEI, ...) passa a ter o seu próprio código, associado ao tipo de
-- interceção. O código de cada linha é herdado do código que o alvo tinha
-- (preserva o valor visível ao utilizador; passa a ser editável por linha).

-- AlterTable: linha ganha "codigo" (nullable, para permitir o backfill)
ALTER TABLE "IntercecaoLinha" ADD COLUMN     "codigo" TEXT;

-- Backfill: cada linha herda o código do alvo a que pertencia.
UPDATE "IntercecaoLinha" AS l
SET "codigo" = a."codigo"
FROM "IntercecaoAlvo" AS a
WHERE l."alvoId" = a."id";

-- Agora todas as linhas têm código: tornar a coluna obrigatória.
ALTER TABLE "IntercecaoLinha" ALTER COLUMN "codigo" SET NOT NULL;

-- CreateIndex: código único por alvo (cada linha do mesmo alvo tem o seu).
CREATE UNIQUE INDEX "IntercecaoLinha_alvoId_codigo_key" ON "IntercecaoLinha"("alvoId", "codigo");

-- DropIndex + AlterTable: o alvo deixa de ter um único código.
DROP INDEX "IntercecaoAlvo_inqueritoid_codigo_key";
ALTER TABLE "IntercecaoAlvo" DROP COLUMN "codigo";

-- AlterTable: campo de acompanhamento (progresso de revisão), sempre visível.
ALTER TABLE "IntercecaoAlvo" ADD COLUMN     "acompanhamento" TEXT;
