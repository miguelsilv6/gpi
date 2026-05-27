-- Make brigadaId optional on Inquerito (imported records may not have a brigade)
ALTER TABLE "Inquerito" ALTER COLUMN "brigadaId" DROP NOT NULL;
