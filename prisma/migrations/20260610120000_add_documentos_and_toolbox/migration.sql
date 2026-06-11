-- Documentos/anexos de inquéritos
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inqueritoid" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Documento_storedName_key" ON "Documento"("storedName");
CREATE INDEX "Documento_inqueritoid_idx" ON "Documento"("inqueritoid");
CREATE INDEX "Documento_uploadedById_idx" ON "Documento"("uploadedById");

ALTER TABLE "Documento" ADD CONSTRAINT "Documento_inqueritoid_fkey" FOREIGN KEY ("inqueritoid") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Utilizador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Módulo Toolbox (ferramentas de investigação)
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloToolboxAtivo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ConfiguracaoSistema" ADD COLUMN "moduloToolboxRoles" TEXT NOT NULL DEFAULT 'INSPETOR,INSPETOR_CHEFE,COORDENADOR';
