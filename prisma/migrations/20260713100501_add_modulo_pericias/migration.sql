-- CreateEnum
CREATE TYPE "TipoPericia" AS ENUM ('BALISTICA', 'ADN', 'INFORMATICA_FORENSE', 'DOCUMENTAL', 'TOXICOLOGICA', 'DACTILOSCOPICA', 'MEDICO_LEGAL', 'FINANCEIRA', 'AVALIACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoPericia" AS ENUM ('SOLICITADA', 'EM_CURSO', 'CONCLUIDA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "TipoNotificacao" ADD VALUE 'PERICIA_ATRASADA';

-- AlterTable
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN     "moduloPericiasAtivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moduloPericiasRoles" TEXT NOT NULL DEFAULT 'INSPETOR,INSPETOR_CHEFE,COORDENADOR';

-- CreateTable
CREATE TABLE "Pericia" (
    "id" TEXT NOT NULL,
    "tipo" "TipoPericia" NOT NULL DEFAULT 'OUTRO',
    "tipoOutro" TEXT,
    "descricao" TEXT NOT NULL,
    "entidade" TEXT,
    "numeroReferencia" TEXT,
    "dataPedido" TIMESTAMP(3) NOT NULL,
    "dataPrevista" TIMESTAMP(3),
    "estado" "EstadoPericia" NOT NULL DEFAULT 'SOLICITADA',
    "dataConclusao" TIMESTAMP(3),
    "resultado" TEXT,
    "observacoes" TEXT,
    "alertaAtrasoEnviado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoid" TEXT NOT NULL,
    "apreensaoId" TEXT,
    "registadoPorId" TEXT NOT NULL,

    CONSTRAINT "Pericia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pericia_inqueritoid_idx" ON "Pericia"("inqueritoid");

-- CreateIndex
CREATE INDEX "Pericia_estado_idx" ON "Pericia"("estado");

-- CreateIndex
CREATE INDEX "Pericia_dataPrevista_idx" ON "Pericia"("dataPrevista");

-- CreateIndex
CREATE INDEX "Pericia_apreensaoId_idx" ON "Pericia"("apreensaoId");

-- AddForeignKey
ALTER TABLE "Pericia" ADD CONSTRAINT "Pericia_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pericia" ADD CONSTRAINT "Pericia_apreensaoId_fkey" FOREIGN KEY ("apreensaoId") REFERENCES "Apreensao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pericia" ADD CONSTRAINT "Pericia_registadoPorId_fkey" FOREIGN KEY ("registadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
