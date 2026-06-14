-- CreateEnum
CREATE TYPE "PrioridadeTarefa" AS ENUM ('BAIXA', 'NORMAL', 'ALTA');

-- CreateTable
CREATE TABLE "TarefaInquerito" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "prioridade" "PrioridadeTarefa" NOT NULL DEFAULT 'NORMAL',
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inqueritoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,

    CONSTRAINT "TarefaInquerito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TarefaInquerito_autorId_idx" ON "TarefaInquerito"("autorId");

-- CreateIndex
CREATE INDEX "TarefaInquerito_inqueritoId_idx" ON "TarefaInquerito"("inqueritoId");

-- CreateIndex
CREATE INDEX "TarefaInquerito_autorId_concluida_idx" ON "TarefaInquerito"("autorId", "concluida");

-- CreateIndex
CREATE INDEX "TarefaInquerito_autorId_prioridade_idx" ON "TarefaInquerito"("autorId", "prioridade");

-- AddForeignKey
ALTER TABLE "TarefaInquerito" ADD CONSTRAINT "TarefaInquerito_inqueritoId_fkey" FOREIGN KEY ("inqueritoId") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaInquerito" ADD CONSTRAINT "TarefaInquerito_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
