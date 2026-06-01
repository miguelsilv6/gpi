-- Create Viatura table
CREATE TABLE "Viatura" (
    "id" TEXT NOT NULL,
    "utilizadorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "matricula" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Viatura_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Viatura_utilizadorId_idx" ON "Viatura"("utilizadorId");

ALTER TABLE "Viatura" ADD CONSTRAINT "Viatura_utilizadorId_fkey"
    FOREIGN KEY ("utilizadorId") REFERENCES "Utilizador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add viaturaId FK column to AjudasLinha
ALTER TABLE "AjudasLinha" ADD COLUMN "viaturaId" TEXT;

CREATE INDEX "AjudasLinha_viaturaId_idx" ON "AjudasLinha"("viaturaId");

ALTER TABLE "AjudasLinha" ADD CONSTRAINT "AjudasLinha_viaturaId_fkey"
    FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old enum column
ALTER TABLE "AjudasLinha" DROP COLUMN "viatura";
