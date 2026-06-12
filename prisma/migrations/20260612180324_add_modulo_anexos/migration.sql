-- Módulo Anexos (documentos anexados a inquéritos)
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloAnexosAtivo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloAnexosRoles" TEXT NOT NULL DEFAULT 'INSPETOR,INSPETOR_CHEFE,COORDENADOR';
