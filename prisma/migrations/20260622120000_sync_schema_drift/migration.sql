-- Catch-up migration: brings a freshly-`migrate deploy`ed database in line
-- with the schema actually declared in prisma/schema.prisma. Each of these
-- changes was historically applied to running databases out-of-band (direct
-- SQL / `prisma db push`) without ever being captured as a migration, so a
-- fresh install ends up missing all of them even after the other historical
-- gaps (EstadoInquerito, Crime, Inquerito.tribunal, AtividadePadrao) are
-- patched. Computed from `prisma migrate diff` between a fully-replayed
-- database and the current schema; every statement is guarded so this is a
-- no-op on databases that already have some or all of this state.

-- AlterEnum
ALTER TYPE "TipoNotificacao" ADD VALUE IF NOT EXISTS 'BACKUP_FALHOU';
ALTER TYPE "TipoNotificacao" ADD VALUE IF NOT EXISTS 'ATIVIDADE_PRAZO_APROXIMANDO';

-- DropIndex
DROP INDEX IF EXISTS "Controlo_atividadeId_idx";
DROP INDEX IF EXISTS "Inquerito_faseProcessual_idx";

-- AlterTable Atividade
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "alerta1Enviado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "alerta2Enviado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "alertaDias1" INTEGER;
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "alertaDias2" INTEGER;
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "concluidaEm" TIMESTAMP(3);
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "dataPrazo" TIMESTAMP(3);
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;
ALTER TABLE "Atividade" ADD COLUMN IF NOT EXISTS "quantidade" INTEGER;

-- AlterTable AuditLog
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

-- AlterTable ConfiguracaoSistema
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN IF NOT EXISTS "inqueritoFiltroEstadosDefault" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN IF NOT EXISTS "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable EstadoInquerito (residue from the enum->table conversion script:
-- the temp table's constraint/index names never got renamed to match what
-- Prisma's naming convention — and therefore schema.prisma — expects)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EstadoInquerito_new_pkey') THEN
    ALTER TABLE "EstadoInquerito" RENAME CONSTRAINT "EstadoInquerito_new_pkey" TO "EstadoInquerito_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'EstadoInquerito_new_codigo_key') THEN
    ALTER INDEX "EstadoInquerito_new_codigo_key" RENAME TO "EstadoInquerito_codigo_key";
  END IF;
END $$;
ALTER TABLE "EstadoInquerito" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable Inquerito
ALTER TABLE "Inquerito" DROP COLUMN IF EXISTS "faseProcessual";
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteCodPostal" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteContacto" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteEmail" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteLocalidade" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteMorada" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteNif" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteNome" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteNotas" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteResponsavel" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "denuncianteTipo" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "nai" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "notasTribunal" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "oficialJustica" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "procurador" TEXT;
ALTER TABLE "Inquerito" ADD COLUMN IF NOT EXISTS "voip" TEXT;

-- DropEnum (only the column above ever used it)
DROP TYPE IF EXISTS "FaseProcessual";

-- AlterTable Utilizador
ALTER TABLE "Utilizador" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Utilizador" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "Utilizador" ADD COLUMN IF NOT EXISTS "lastLoginIp" TEXT;
ALTER TABLE "Utilizador" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "Utilizador" ADD COLUMN IF NOT EXISTS "lt" INTEGER;
ALTER TABLE "Utilizador" ADD COLUMN IF NOT EXISTS "telemovel" TEXT;
ALTER TABLE "Utilizador" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Viatura
ALTER TABLE "Viatura" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "utilizadorId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationPolicy" (
    "tipo" "TipoNotificacao" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ccRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPolicy_pkey" PRIMARY KEY ("tipo")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_utilizadorId_idx" ON "PasswordResetToken"("utilizadorId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "Atividade_dataPrazo_idx" ON "Atividade"("dataPrazo");
CREATE INDEX IF NOT EXISTS "Atividade_concluidaEm_idx" ON "Atividade"("concluidaEm");
CREATE INDEX IF NOT EXISTS "EstadoInquerito_ativo_ordem_idx" ON "EstadoInquerito"("ativo", "ordem");
CREATE UNIQUE INDEX IF NOT EXISTS "Inquerito_nai_key" ON "Inquerito"("nai");
CREATE INDEX IF NOT EXISTS "Inquerito_nai_idx" ON "Inquerito"("nai");
CREATE INDEX IF NOT EXISTS "Inquerito_updatedAt_idx" ON "Inquerito"("updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "Inquerito_brigadaId_updatedAt_idx" ON "Inquerito"("brigadaId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "Inquerito_inspetorId_updatedAt_idx" ON "Inquerito"("inspetorId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "Inquerito_deletedAt_idx" ON "Inquerito"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Utilizador_lt_key" ON "Utilizador"("lt");

-- AddForeignKey (re-pointed onDelete behaviour; cheap to always redo)
ALTER TABLE "Inquerito" DROP CONSTRAINT IF EXISTS "Inquerito_brigadaId_fkey";
ALTER TABLE "Inquerito" ADD CONSTRAINT "Inquerito_brigadaId_fkey"
  FOREIGN KEY ("brigadaId") REFERENCES "Brigada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_utilizadorId_fkey') THEN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_utilizadorId_fkey"
      FOREIGN KEY ("utilizadorId") REFERENCES "Utilizador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
