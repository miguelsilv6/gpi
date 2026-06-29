-- Remove a funcionalidade de prazos legais inteligentes (não se enquadra no
-- objetivo da aplicação). Larga a tabela de prorrogações e as colunas de
-- configuração do prazo legal.

-- DropForeignKey
ALTER TABLE "ProrrogacaoInquerito" DROP CONSTRAINT "ProrrogacaoInquerito_criadoPorId_fkey";

-- DropForeignKey
ALTER TABLE "ProrrogacaoInquerito" DROP CONSTRAINT "ProrrogacaoInquerito_inqueritoId_fkey";

-- DropTable
DROP TABLE "ProrrogacaoInquerito";

-- AlterTable
ALTER TABLE "ConfiguracaoSistema" DROP COLUMN "prazoLegalAlertaDias",
DROP COLUMN "prazoLegalMeses";
