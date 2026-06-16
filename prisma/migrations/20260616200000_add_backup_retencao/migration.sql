-- Número de ficheiros de backup a manter por prefixo (rotação FIFO).
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN IF NOT EXISTS "backupRetencao" INTEGER NOT NULL DEFAULT 30;
