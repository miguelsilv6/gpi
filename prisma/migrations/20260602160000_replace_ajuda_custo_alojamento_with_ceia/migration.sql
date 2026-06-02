-- Replace accommodation allowance with supper allowance on AjudasLinha
ALTER TABLE "AjudasLinha" DROP COLUMN "ajudaCustoAlojamento";
ALTER TABLE "AjudasLinha" ADD COLUMN "ajudaCustoCeia" INTEGER NOT NULL DEFAULT 0;

-- Remove the alojamento rate from AjudasConfig (no longer tracked)
ALTER TABLE "AjudasConfig" DROP COLUMN "senhaAlojamento";
