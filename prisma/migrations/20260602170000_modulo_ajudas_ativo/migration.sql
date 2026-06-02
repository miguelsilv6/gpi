-- Toggle to enable/disable the Ajudas Mensais module system-wide
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloAjudasAtivo" BOOLEAN NOT NULL DEFAULT true;
