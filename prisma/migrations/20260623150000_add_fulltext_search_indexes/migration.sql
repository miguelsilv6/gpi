-- Pesquisa full-text (Português) em notas e atividades de inquéritos.
--
-- Estes são índices FUNCIONAIS (de expressão) sobre to_tsvector(...). O Prisma
-- não os introspeta nem os representa no schema.prisma, pelo que NÃO causam
-- drift em `prisma migrate dev` nem são tocados por `prisma db push` (validado
-- com `prisma migrate diff`, que devolve diff vazio com o índice presente).
--
-- A pesquisa (src/lib/search.ts) usa exatamente a mesma expressão via
-- `to_tsvector('portuguese', ...) @@ websearch_to_tsquery('portuguese', $q)`,
-- pelo que funciona com ou sem o índice — sem ele faz-se sequential scan, com
-- ele usa-se o GIN. Por isso é seguro o ambiente de testes (db push) não os ter.
--
-- IF NOT EXISTS torna a migração idempotente em bases que já os tenham criado
-- manualmente.

CREATE INDEX IF NOT EXISTS "NotaInquerito_fts_idx"
  ON "NotaInquerito"
  USING GIN (to_tsvector('portuguese', coalesce("titulo", '') || ' ' || "conteudo"));

CREATE INDEX IF NOT EXISTS "Atividade_fts_idx"
  ON "Atividade"
  USING GIN (to_tsvector('portuguese', coalesce("descricao", '') || ' ' || coalesce("observacoes", '')));
