-- CreateTable
CREATE TABLE "NotaInquerito" (
    "id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inqueritoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,

    CONSTRAINT "NotaInquerito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotaInquerito_inqueritoId_idx" ON "NotaInquerito"("inqueritoId");

-- CreateIndex
CREATE INDEX "NotaInquerito_autorId_idx" ON "NotaInquerito"("autorId");

-- CreateIndex
CREATE INDEX "NotaInquerito_inqueritoId_createdAt_idx" ON "NotaInquerito"("inqueritoId", "createdAt");

-- AddForeignKey
ALTER TABLE "NotaInquerito" ADD CONSTRAINT "NotaInquerito_inqueritoId_fkey" FOREIGN KEY ("inqueritoId") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaInquerito" ADD CONSTRAINT "NotaInquerito_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
