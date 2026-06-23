-- Transição de estado automática ao CONFIRMAR a conclusão de uma atividade
-- (confirmação de devolução / conclusão de exames). Parametrizável pelo
-- administrador por AtividadePadrao, em paralelo com o `transicaoEstadoId`
-- já existente (que se aplica na CRIAÇÃO da atividade).
ALTER TABLE "AtividadePadrao" ADD COLUMN "transicaoEstadoConclusaoId" TEXT;

CREATE INDEX "AtividadePadrao_transicaoEstadoConclusaoId_idx" ON "AtividadePadrao"("transicaoEstadoConclusaoId");

ALTER TABLE "AtividadePadrao" ADD CONSTRAINT "AtividadePadrao_transicaoEstadoConclusaoId_fkey" FOREIGN KEY ("transicaoEstadoConclusaoId") REFERENCES "EstadoInquerito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
