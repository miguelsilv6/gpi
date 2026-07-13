-- CreateEnum
CREATE TYPE "TipoApreensao" AS ENUM ('ARMA', 'VEICULO', 'DINHEIRO', 'DROGA', 'EQUIPAMENTO_INFORMATICO', 'DOCUMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoApreensao" AS ENUM ('EM_CUSTODIA', 'A_AGUARDAR_EXAME', 'DEVOLVIDO', 'PERDIDO_A_FAVOR_ESTADO', 'DESTRUIDO');

-- AlterEnum
ALTER TYPE "TipoNotificacao" ADD VALUE 'APREENSAO_PARADA';

-- AlterTable
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN     "apreensaoAlertaDias" INTEGER DEFAULT 180,
ADD COLUMN     "moduloApreensoesAtivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moduloApreensoesRoles" TEXT NOT NULL DEFAULT 'INSPETOR,INSPETOR_CHEFE,COORDENADOR';

-- CreateTable
CREATE TABLE "Apreensao" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoApreensao" NOT NULL DEFAULT 'OUTRO',
    "tipoOutro" TEXT,
    "quantidade" TEXT,
    "numeroAuto" TEXT,
    "dataApreensao" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "apreendidoA" TEXT,
    "localCustodia" TEXT,
    "estado" "EstadoApreensao" NOT NULL DEFAULT 'EM_CUSTODIA',
    "dataDestino" TIMESTAMP(3),
    "observacoes" TEXT,
    "alertaParadaEnviado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoid" TEXT NOT NULL,
    "registadoPorId" TEXT NOT NULL,

    CONSTRAINT "Apreensao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Apreensao_inqueritoid_idx" ON "Apreensao"("inqueritoid");

-- CreateIndex
CREATE INDEX "Apreensao_estado_idx" ON "Apreensao"("estado");

-- CreateIndex
CREATE INDEX "Apreensao_dataApreensao_idx" ON "Apreensao"("dataApreensao");

-- AddForeignKey
ALTER TABLE "Apreensao" ADD CONSTRAINT "Apreensao_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apreensao" ADD CONSTRAINT "Apreensao_registadoPorId_fkey" FOREIGN KEY ("registadoPorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
