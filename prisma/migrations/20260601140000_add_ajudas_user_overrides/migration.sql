-- Add per-user ajudas overrides to Utilizador
ALTER TABLE "Utilizador" ADD COLUMN "ajudasVencimentoBase" DOUBLE PRECISION;
ALTER TABLE "Utilizador" ADD COLUMN "ajudasTaxaIRS" DOUBLE PRECISION;

-- Add prevencaoOnly flag to AjudasLinha
ALTER TABLE "AjudasLinha" ADD COLUMN "prevencaoOnly" BOOLEAN NOT NULL DEFAULT false;
