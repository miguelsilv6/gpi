-- AlterTable: toggle global para envio de emails de notificação
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "emailNotificacoesAtivo" BOOLEAN NOT NULL DEFAULT true;
