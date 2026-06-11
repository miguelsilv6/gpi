-- Explicações por IA na Toolbox (LLM local via Ollama).
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "toolboxIaAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "toolboxIaModelo" TEXT NOT NULL DEFAULT 'qwen3:4b';
