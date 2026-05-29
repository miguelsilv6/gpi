-- CreateTable
CREATE TABLE "Etiqueta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Etiqueta_nome_key" ON "Etiqueta"("nome");

-- CreateIndex
CREATE INDEX "Etiqueta_ativo_ordem_idx" ON "Etiqueta"("ativo", "ordem");

-- CreateTable (implicit m2m join Inquerito <-> Etiqueta)
CREATE TABLE "_EtiquetaToInquerito" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EtiquetaToInquerito_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_EtiquetaToInquerito_B_index" ON "_EtiquetaToInquerito"("B");

-- AddForeignKey
ALTER TABLE "_EtiquetaToInquerito" ADD CONSTRAINT "_EtiquetaToInquerito_A_fkey" FOREIGN KEY ("A") REFERENCES "Etiqueta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EtiquetaToInquerito" ADD CONSTRAINT "_EtiquetaToInquerito_B_fkey" FOREIGN KEY ("B") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
