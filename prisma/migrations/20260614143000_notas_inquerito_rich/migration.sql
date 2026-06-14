-- AlterTable
ALTER TABLE "NotaInquerito" ADD COLUMN "titulo" TEXT;
ALTER TABLE "NotaInquerito" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "NotaInquerito" ADD COLUMN "editadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "NotaInquerito_updatedAt_idx" ON "NotaInquerito"("updatedAt");

-- AddForeignKey
ALTER TABLE "NotaInquerito" ADD CONSTRAINT "NotaInquerito_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "Utilizador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
