-- AlterTable
ALTER TABLE "ConfiguracaoSistema"
  ADD COLUMN "appName" TEXT,
  ADD COLUMN "appShortName" TEXT,
  ADD COLUMN "appDescription" TEXT,
  ADD COLUMN "manifestDescription" TEXT,
  ADD COLUMN "pdfFooterText" TEXT,
  ADD COLUMN "logoLightFilename" TEXT,
  ADD COLUMN "logoDarkFilename" TEXT,
  ADD COLUMN "faviconFilename" TEXT,
  ADD COLUMN "brandUpdatedAt" TIMESTAMP(3);
