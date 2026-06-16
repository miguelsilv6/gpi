-- AddColumn Carta Precatória — dados do inspetor titular (de outra unidade)
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "titularNome" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "titularEmail" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "titularVoip" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "titularUnidade" TEXT;
