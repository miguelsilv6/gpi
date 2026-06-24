-- CreateEnum
CREATE TYPE "TipoDiligencia" AS ENUM ('JULGAMENTO', 'INQUIRICAO', 'BUSCA', 'INTERROGATORIO', 'RECONSTITUICAO', 'REUNIAO', 'OUTRA');

-- AlterTable
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN     "moduloAgendaAtivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moduloAgendaRoles" TEXT NOT NULL DEFAULT 'INSPETOR,INSPETOR_CHEFE,COORDENADOR';

-- CreateTable
CREATE TABLE "Diligencia" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoDiligencia" NOT NULL DEFAULT 'OUTRA',
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "local" TEXT,
    "observacoes" TEXT,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoId" TEXT,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "Diligencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Diligencia_inqueritoId_idx" ON "Diligencia"("inqueritoId");

-- CreateIndex
CREATE INDEX "Diligencia_criadoPorId_idx" ON "Diligencia"("criadoPorId");

-- CreateIndex
CREATE INDEX "Diligencia_dataInicio_idx" ON "Diligencia"("dataInicio");

-- AddForeignKey
ALTER TABLE "Diligencia" ADD CONSTRAINT "Diligencia_inqueritoId_fkey" FOREIGN KEY ("inqueritoId") REFERENCES "Inquerito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diligencia" ADD CONSTRAINT "Diligencia_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
