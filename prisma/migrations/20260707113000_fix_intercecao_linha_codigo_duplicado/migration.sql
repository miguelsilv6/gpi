-- Corrige a migração anterior (20260707095608): quando um alvo tinha mais
-- do que uma linha (o cenário exato que motivou a funcionalidade — um
-- suspeito com interceção SIM + IMEI), o backfill copiava o código do alvo
-- para TODAS as suas linhas, o que fazia a criação do índice único falhar.
--
-- O Prisma para no primeiro erro sem reverter as alterações já aplicadas
-- (não é tudo-ou-nada) — em bases de dados com alvos multi-linha, a
-- `prisma migrate deploy` ficava bloqueada a meio: "IntercecaoLinha.codigo"
-- já existia (preenchido, por vezes duplicado dentro do mesmo alvo) mas
-- "IntercecaoAlvo.codigo" ainda não tinha sido removido. Esta migração é
-- idempotente e cobre os três estados possíveis: a anterior nunca chegou a
-- correr, correu por completo com sucesso (sem alvos multi-linha), ou ficou
-- parada a meio.

-- 1) Garantir a coluna codigo em IntercecaoLinha (pode já existir).
ALTER TABLE "IntercecaoLinha" ADD COLUMN IF NOT EXISTS "codigo" TEXT;

-- 2) Preencher onde ainda estiver vazio, herdando o código do alvo — só
--    faz sentido (e só é seguro referenciar a coluna) se "IntercecaoAlvo.
--    codigo" ainda existir; nas bases de dados onde a migração anterior
--    correu por completo, essa coluna já foi removida.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'IntercecaoAlvo' AND column_name = 'codigo'
  ) THEN
    UPDATE "IntercecaoLinha" AS l
    SET "codigo" = a."codigo"
    FROM "IntercecaoAlvo" AS a
    WHERE l."alvoId" = a."id" AND l."codigo" IS NULL AND a."codigo" IS NOT NULL;
  END IF;
END $$;

-- 3) Desduplicar: quando o mesmo alvo acaba com mais do que uma linha com
--    o mesmo código, as linhas a mais (por ordem de criação) recebem um
--    sufixo "-2", "-3", ... para ficarem únicas dentro do alvo.
WITH ranked AS (
  SELECT id, "codigo",
         ROW_NUMBER() OVER (PARTITION BY "alvoId", "codigo" ORDER BY "createdAt", id) AS rn
  FROM "IntercecaoLinha"
  WHERE "codigo" IS NOT NULL
)
UPDATE "IntercecaoLinha" AS l
SET "codigo" = ranked."codigo" || '-' || ranked.rn
FROM ranked
WHERE l.id = ranked.id AND ranked.rn > 1;

-- 4) Qualquer linha ainda sem código (não deve acontecer em condições
--    normais) recebe um valor de recurso só para satisfazer o NOT NULL,
--    usando o próprio id para garantir unicidade.
UPDATE "IntercecaoLinha" SET "codigo" = 'SEM-CODIGO-' || id WHERE "codigo" IS NULL;

ALTER TABLE "IntercecaoLinha" ALTER COLUMN "codigo" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "IntercecaoLinha_alvoId_codigo_key" ON "IntercecaoLinha"("alvoId", "codigo");

DROP INDEX IF EXISTS "IntercecaoAlvo_inqueritoid_codigo_key";
ALTER TABLE "IntercecaoAlvo" DROP COLUMN IF EXISTS "codigo";

ALTER TABLE "IntercecaoAlvo" ADD COLUMN IF NOT EXISTS "acompanhamento" TEXT;
