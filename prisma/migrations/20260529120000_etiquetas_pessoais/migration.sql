-- Etiquetas passam de catálogo global (gerido pela Administração) para tags
-- pessoais por utilizador. Como o modelo antigo não mapeia para o novo (não há
-- dono associado às etiquetas globais já existentes), limpamos a tabela antes
-- de adicionar a coluna NOT NULL `criadoPorId`.
DELETE FROM "_EtiquetaToInquerito";
DELETE FROM "Etiqueta";

-- Remover artefactos do modelo global
DROP INDEX IF EXISTS "Etiqueta_nome_key";
DROP INDEX IF EXISTS "Etiqueta_ativo_ordem_idx";

ALTER TABLE "Etiqueta" DROP COLUMN IF EXISTS "descricao";
ALTER TABLE "Etiqueta" DROP COLUMN IF EXISTS "cor";
ALTER TABLE "Etiqueta" DROP COLUMN IF EXISTS "ordem";
ALTER TABLE "Etiqueta" DROP COLUMN IF EXISTS "ativo";

-- Dono da etiqueta
ALTER TABLE "Etiqueta" ADD COLUMN "criadoPorId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Etiqueta_criadoPorId_nome_key" ON "Etiqueta"("criadoPorId", "nome");

-- CreateIndex
CREATE INDEX "Etiqueta_criadoPorId_idx" ON "Etiqueta"("criadoPorId");

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Utilizador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
