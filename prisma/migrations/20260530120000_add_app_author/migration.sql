-- Autor da aplicação — campo de branding configurável em /configurações → Aparência.
-- Null = usar string vazia (não apresentado na sidebar).
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "appAuthor" TEXT;
