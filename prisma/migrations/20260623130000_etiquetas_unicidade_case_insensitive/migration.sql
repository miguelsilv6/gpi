-- Unicidade case-insensitive de etiquetas por utilizador.
--
-- Antes, @@unique([criadoPorId, nome]) era sensível a maiúsculas, pelo que
-- "Roubo" e "roubo" do mesmo utilizador podiam coexistir. Introduzimos
-- `nomeNormalizado` (lower-case de `nome`) e passamos a unicidade para
-- (criadoPorId, nomeNormalizado). Antes de criar o índice único, fundimos as
-- duplicadas já existentes, mantendo a mais antiga e reapontando as ligações
-- aos inquéritos.

-- 1. Nova coluna (temporariamente nullable para permitir backfill).
ALTER TABLE "Etiqueta" ADD COLUMN "nomeNormalizado" TEXT;

-- 2. Backfill a partir do nome existente.
UPDATE "Etiqueta" SET "nomeNormalizado" = lower(trim("nome"));

-- 3. Identificar duplicadas: por (criadoPorId, nomeNormalizado), manter a mais
--    antiga (createdAt, depois id como desempate determinístico).
CREATE TEMP TABLE "_etiqueta_dups" AS
SELECT e."id" AS dup_id, k.keep_id
FROM "Etiqueta" e
JOIN (
  SELECT "criadoPorId", "nomeNormalizado",
         (array_agg("id" ORDER BY "createdAt" ASC, "id" ASC))[1] AS keep_id
  FROM "Etiqueta"
  GROUP BY "criadoPorId", "nomeNormalizado"
) k
  ON e."criadoPorId" = k."criadoPorId"
 AND e."nomeNormalizado" = k."nomeNormalizado"
WHERE e."id" <> k.keep_id;

-- 4. Nas ligações m2m (_EtiquetaToInquerito: A=Etiqueta, B=Inquerito), remover
--    primeiro as que colidiriam com a etiqueta a manter (inquérito já tem a
--    etiqueta a manter), para o reaponte seguinte não violar a PK (A,B).
DELETE FROM "_EtiquetaToInquerito" j
USING "_etiqueta_dups" d
WHERE j."A" = d.dup_id
  AND EXISTS (
    SELECT 1 FROM "_EtiquetaToInquerito" k
    WHERE k."A" = d.keep_id AND k."B" = j."B"
  );

-- 5. Reapontar as restantes ligações da duplicada para a etiqueta a manter.
UPDATE "_EtiquetaToInquerito" j
SET "A" = d.keep_id
FROM "_etiqueta_dups" d
WHERE j."A" = d.dup_id;

-- 6. Apagar as etiquetas duplicadas.
DELETE FROM "Etiqueta" WHERE "id" IN (SELECT dup_id FROM "_etiqueta_dups");

-- 7. Tornar a coluna obrigatória.
ALTER TABLE "Etiqueta" ALTER COLUMN "nomeNormalizado" SET NOT NULL;

-- 8. Trocar o índice único (case-sensitive → case-insensitive).
DROP INDEX "Etiqueta_criadoPorId_nome_key";
CREATE UNIQUE INDEX "Etiqueta_criadoPorId_nomeNormalizado_key" ON "Etiqueta"("criadoPorId", "nomeNormalizado");

-- 9. Limpeza da tabela temporária.
DROP TABLE "_etiqueta_dups";
