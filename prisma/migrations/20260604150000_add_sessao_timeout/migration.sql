-- Add session idle timeout configuration
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "sessaoTimeoutMinutos" INTEGER NOT NULL DEFAULT 0;
