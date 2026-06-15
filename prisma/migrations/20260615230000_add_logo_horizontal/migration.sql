-- AddColumn logo horizontal (light/dark variants) + scale/alignment settings
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN IF NOT EXISTS "logoHorizontalLightFilename" TEXT;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN IF NOT EXISTS "logoHorizontalDarkFilename" TEXT;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN IF NOT EXISTS "logoHorizontalEscala" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN IF NOT EXISTS "logoHorizontalAlinhamento" TEXT NOT NULL DEFAULT 'center';
