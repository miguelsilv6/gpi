-- CreateEnum
CREATE TYPE "TipoInterveniente" AS ENUM ('LESADO', 'VITIMA', 'TESTEMUNHA', 'ADVOGADO', 'ARGUIDO', 'PERITO', 'OUTRO');

-- AlterTable
ALTER TABLE "Utilizador" ADD COLUMN     "tourConcluidaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Interveniente" (
    "id" TEXT NOT NULL,
    "tipo" "TipoInterveniente" NOT NULL,
    "tipoOutro" TEXT,
    "nome" TEXT NOT NULL,
    "tipoPessoa" TEXT,
    "nif" TEXT,
    "morada" TEXT,
    "codPostal" TEXT,
    "localidade" TEXT,
    "contacto" TEXT,
    "email" TEXT,
    "responsavel" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inqueritoid" TEXT NOT NULL,

    CONSTRAINT "Interveniente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interveniente_inqueritoid_idx" ON "Interveniente"("inqueritoid");

-- AddForeignKey
ALTER TABLE "Interveniente" ADD CONSTRAINT "Interveniente_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
