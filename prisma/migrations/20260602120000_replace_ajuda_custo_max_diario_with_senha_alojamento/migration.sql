-- AddColumn: senhaAlojamento with value derived from existing ajudaCustoMaxDiario (50%)
ALTER TABLE "AjudasConfig" ADD COLUMN "senhaAlojamento" DOUBLE PRECISION NOT NULL DEFAULT 31.375;
UPDATE "AjudasConfig" SET "senhaAlojamento" = "ajudaCustoMaxDiario" * 0.5;

-- DropColumn
ALTER TABLE "AjudasConfig" DROP COLUMN "ajudaCustoMaxDiario";
