/*
  Warnings:

  - You are about to drop the column `toolboxIaAtivo` on the `ConfiguracaoSistema` table. All the data in the column will be lost.
  - You are about to drop the column `toolboxIaModelo` on the `ConfiguracaoSistema` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ConfiguracaoSistema" DROP COLUMN "toolboxIaAtivo",
DROP COLUMN "toolboxIaModelo";
