-- Add "Distribuído" estado between Aberto and Em Investigação.
-- Shifts the ordem of existing states to make room at position 2.

-- Shift existing states up first to avoid unique-constraint conflicts on ordem
-- (if there is one). The updates run in order so we go highest-first.
UPDATE "EstadoInquerito" SET ordem = 6, "updatedAt" = NOW() WHERE codigo = 'ARQUIVADO';
UPDATE "EstadoInquerito" SET ordem = 5, "updatedAt" = NOW() WHERE codigo = 'CONCLUIDO';
UPDATE "EstadoInquerito" SET ordem = 4, "updatedAt" = NOW() WHERE codigo = 'SUSPENSO';
UPDATE "EstadoInquerito" SET ordem = 3, "updatedAt" = NOW() WHERE codigo = 'EM_INVESTIGACAO';

-- Insert DISTRIBUIDO (idempotent via ON CONFLICT DO NOTHING).
INSERT INTO "EstadoInquerito" (id, codigo, nome, ordem, terminal, cor, ativo, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'DISTRIBUIDO',
  'Distribuído',
  2,
  false,
  'purple',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (codigo) DO NOTHING;
