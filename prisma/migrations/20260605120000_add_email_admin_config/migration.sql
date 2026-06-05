-- AlterTable: SMTP server config + optional urgent deadline threshold
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "prazoAlertaDiasUrgente" INTEGER;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "smtpPasswordEnc" TEXT;

-- CreateTable: per-user email preference per notification type
CREATE TABLE "NotificacaoPreferencia" (
    "utilizadorId" TEXT NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificacaoPreferencia_pkey" PRIMARY KEY ("utilizadorId", "tipo")
);

-- CreateIndex
CREATE INDEX "NotificacaoPreferencia_utilizadorId_idx" ON "NotificacaoPreferencia"("utilizadorId");

-- AddForeignKey
ALTER TABLE "NotificacaoPreferencia" ADD CONSTRAINT "NotificacaoPreferencia_utilizadorId_fkey"
    FOREIGN KEY ("utilizadorId") REFERENCES "Utilizador"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
