-- Add CONTROLO_APROXIMANDO to TipoNotificacao enum
ALTER TYPE "TipoNotificacao" ADD VALUE IF NOT EXISTS 'CONTROLO_APROXIMANDO';

-- CreateTable Controlo
CREATE TABLE "Controlo" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "observacoes" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "periodoDias" INTEGER,
    "alertaDias" INTEGER NOT NULL DEFAULT 3,
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inqueritoid" TEXT,
    "criadorId" TEXT NOT NULL,

    CONSTRAINT "Controlo_pkey" PRIMARY KEY ("id")
);

-- CreateTable ControloRealizacao
CREATE TABLE "ControloRealizacao" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dataEsperada" TIMESTAMP(3) NOT NULL,
    "dataRealizacao" TIMESTAMP(3),
    "observacoes" TEXT,
    "alertaEnviado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "controloId" TEXT NOT NULL,
    "realizadoPorId" TEXT,

    CONSTRAINT "ControloRealizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Controlo_inqueritoid_idx" ON "Controlo"("inqueritoid");
CREATE INDEX "Controlo_criadorId_idx" ON "Controlo"("criadorId");
CREATE INDEX "Controlo_dataInicio_idx" ON "Controlo"("dataInicio");
CREATE UNIQUE INDEX "ControloRealizacao_controloId_numero_key" ON "ControloRealizacao"("controloId", "numero");
CREATE INDEX "ControloRealizacao_controloId_idx" ON "ControloRealizacao"("controloId");
CREATE INDEX "ControloRealizacao_dataEsperada_idx" ON "ControloRealizacao"("dataEsperada");

-- AddForeignKey
ALTER TABLE "Controlo" ADD CONSTRAINT "Controlo_inqueritoid_fkey"
    FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Controlo" ADD CONSTRAINT "Controlo_criadorId_fkey"
    FOREIGN KEY ("criadorId") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ControloRealizacao" ADD CONSTRAINT "ControloRealizacao_controloId_fkey"
    FOREIGN KEY ("controloId") REFERENCES "Controlo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ControloRealizacao" ADD CONSTRAINT "ControloRealizacao_realizadoPorId_fkey"
    FOREIGN KEY ("realizadoPorId") REFERENCES "Utilizador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
