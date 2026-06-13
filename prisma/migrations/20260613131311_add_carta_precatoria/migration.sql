-- AlterTable
ALTER TABLE "Inquerito" ADD COLUMN "cartaPrecatoria" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Inquerito_cartaPrecatoria_idx" ON "Inquerito"("cartaPrecatoria");
