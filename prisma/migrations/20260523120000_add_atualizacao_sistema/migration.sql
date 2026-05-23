-- AlterEnum
ALTER TYPE "TipoNotificacao" ADD VALUE 'ATUALIZACAO_FALHOU';
ALTER TYPE "TipoNotificacao" ADD VALUE 'ATUALIZACAO_CONCLUIDA';

-- AlterTable
ALTER TABLE "ConfiguracaoSistema"
  ADD COLUMN "latestVersionTag" TEXT,
  ADD COLUMN "latestVersionCheckedAt" TIMESTAMP(3),
  ADD COLUMN "latestVersionUrl" TEXT,
  ADD COLUMN "latestVersionNotes" TEXT;

-- CreateTable
CREATE TABLE "AtualizacaoSistema" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "fromCommitSha" TEXT NOT NULL,
    "toCommitSha" TEXT,
    "state" TEXT NOT NULL,
    "preBackupFile" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "iniciadoPorId" TEXT NOT NULL,

    CONSTRAINT "AtualizacaoSistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtualizacaoSistema_requestId_key" ON "AtualizacaoSistema"("requestId");

-- CreateIndex
CREATE INDEX "AtualizacaoSistema_startedAt_idx" ON "AtualizacaoSistema"("startedAt");

-- CreateIndex
CREATE INDEX "AtualizacaoSistema_state_idx" ON "AtualizacaoSistema"("state");

-- AddForeignKey
ALTER TABLE "AtualizacaoSistema" ADD CONSTRAINT "AtualizacaoSistema_iniciadoPorId_fkey" FOREIGN KEY ("iniciadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
