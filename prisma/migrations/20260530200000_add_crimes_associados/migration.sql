-- CreateTable: join table for the implicit m2m Crime <-> Inquerito (crimes associados).
-- A = Crime.id (C < I alphabetically), B = Inquerito.id.
-- The primary crime relation (crimeId FK) is unchanged; only the new m2m is added here.
CREATE TABLE "_CrimesAssociados" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CrimesAssociados_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CrimesAssociados_B_index" ON "_CrimesAssociados"("B");

-- AddForeignKey
ALTER TABLE "_CrimesAssociados" ADD CONSTRAINT "_CrimesAssociados_A_fkey" FOREIGN KEY ("A") REFERENCES "Crime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CrimesAssociados" ADD CONSTRAINT "_CrimesAssociados_B_fkey" FOREIGN KEY ("B") REFERENCES "Inquerito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
