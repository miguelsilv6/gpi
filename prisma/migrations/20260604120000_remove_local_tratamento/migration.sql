-- DropForeignKey
ALTER TABLE "Inquerito" DROP CONSTRAINT "Inquerito_localTratamentoId_fkey";

-- DropIndex
DROP INDEX "Inquerito_localTratamentoId_idx";

-- AlterTable
ALTER TABLE "Inquerito" DROP COLUMN "localTratamentoId";

-- DropTable
DROP TABLE "LocalTratamento";
