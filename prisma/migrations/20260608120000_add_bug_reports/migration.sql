-- AlterEnum: novo tipo de notificação para reports de bug (não usado nesta
-- transação — a policy é criada pelo seed no boot, evitando o erro de PG ao
-- usar um valor de enum acabado de adicionar dentro da mesma transação).
ALTER TYPE "TipoNotificacao" ADD VALUE 'BUGREPORT_CRIADO';

-- CreateEnum
CREATE TYPE "SeveridadeBug" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');
CREATE TYPE "EstadoBug" AS ENUM ('ABERTO', 'EM_ANALISE', 'RESOLVIDO', 'REJEITADO');

-- AlterTable: toggle + roles do módulo de bug reports
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloBugReportsAtivo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloBugReportsRoles" TEXT NOT NULL DEFAULT 'INSPETOR,INSPETOR_CHEFE,COORDENADOR';

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "severidade" "SeveridadeBug" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoBug" NOT NULL DEFAULT 'ABERTO',
    "pagina" TEXT,
    "notaAdmin" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_estado_createdAt_idx" ON "BugReport"("estado", "createdAt");
CREATE INDEX "BugReport_criadoPorId_idx" ON "BugReport"("criadoPorId");
CREATE INDEX "BugReport_createdAt_idx" ON "BugReport"("createdAt");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_criadoPorId_fkey"
    FOREIGN KEY ("criadoPorId") REFERENCES "Utilizador"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
