-- Filtro de estados pré-definido por utilizador na pesquisa de inquéritos.
-- Guardado como codigos (estável a renomeações). Vazio por defeito; quando
-- preenchido, sobrepõe-se ao default global em ConfiguracaoSistema.
ALTER TABLE "Utilizador" ADD COLUMN "inqueritoFiltroEstadosDefault" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
