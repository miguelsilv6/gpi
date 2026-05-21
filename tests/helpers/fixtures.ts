import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@/generated/prisma/client'
import type { Role } from '@/generated/prisma/enums'

/**
 * Factory functions para construir dados de teste mínimos mas realistas.
 *
 * Convenção: o ID é deixado a ser gerado pelo Prisma (cuid). Tudo o que o
 * teste precisar de referenciar mais tarde, devolvemos do factory.
 */

let counter = 0
const uniq = () => `${Date.now()}-${++counter}`

export async function makeBrigada(
  prisma: PrismaClient,
  override: { nome?: string; ativa?: boolean } = {},
) {
  return prisma.brigada.create({
    data: {
      nome: override.nome ?? `Brigada Teste ${uniq()}`,
      ativa: override.ativa ?? true,
    },
  })
}

export async function makeEstado(
  prisma: PrismaClient,
  override: {
    codigo?: string
    nome?: string
    terminal?: boolean
    ordem?: number
  } = {},
) {
  return prisma.estadoInquerito.create({
    data: {
      codigo: override.codigo ?? `EST_${uniq()}`,
      nome: override.nome ?? `Estado ${uniq()}`,
      terminal: override.terminal ?? false,
      ordem: override.ordem ?? 0,
      ativo: true,
    },
  })
}

export async function makeCrime(
  prisma: PrismaClient,
  override: { nome?: string; ativo?: boolean } = {},
) {
  return prisma.crime.create({
    data: {
      nome: override.nome ?? `Crime Teste ${uniq()}`,
      ativo: override.ativo ?? true,
    },
  })
}

export async function makeUtilizador(
  prisma: PrismaClient,
  override: {
    nome?: string
    email?: string
    role?: Role
    brigadaId?: string | null
    ativo?: boolean
  } = {},
) {
  const passwordHash = await bcrypt.hash('TestPassword123!', 4)
  return prisma.utilizador.create({
    data: {
      nome: override.nome ?? `User ${uniq()}`,
      email: override.email ?? `user-${uniq()}@test.local`,
      passwordHash,
      role: override.role ?? 'INSPETOR',
      brigadaId: override.brigadaId ?? null,
      ativo: override.ativo ?? true,
    },
  })
}

export async function makeInquerito(
  prisma: PrismaClient,
  args: {
    estadoId: string
    brigadaId: string
    inspetorId?: string | null
    crimeId?: string | null
    nuipc?: string
    dataAbertura?: Date
    dataConclusao?: Date | null
  },
) {
  return prisma.inquerito.create({
    data: {
      nuipc: args.nuipc ?? `${Date.now()}/${++counter}-test`,
      natureza: 'Natureza teste',
      dataAbertura: args.dataAbertura ?? new Date(),
      dataConclusao: args.dataConclusao ?? null,
      estadoId: args.estadoId,
      brigadaId: args.brigadaId,
      inspetorId: args.inspetorId ?? null,
      crimeId: args.crimeId ?? null,
    },
  })
}

/**
 * Cenário "duas brigadas, um chefe em cada uma" — base dos testes de scope.
 */
export async function scenarioTwoBrigadas(prisma: PrismaClient) {
  const brigadaA = await makeBrigada(prisma, { nome: 'Brigada Alpha' })
  const brigadaB = await makeBrigada(prisma, { nome: 'Brigada Bravo' })
  const estado = await makeEstado(prisma, { codigo: 'ABERTO', nome: 'Aberto' })

  const chefeA = await makeUtilizador(prisma, {
    nome: 'Chefe Alpha',
    email: 'chefea@test.local',
    role: 'INSPETOR_CHEFE',
    brigadaId: brigadaA.id,
  })
  const chefeB = await makeUtilizador(prisma, {
    nome: 'Chefe Bravo',
    email: 'chefeb@test.local',
    role: 'INSPETOR_CHEFE',
    brigadaId: brigadaB.id,
  })
  const inspetorA = await makeUtilizador(prisma, {
    nome: 'Inspetor Alpha',
    email: 'inspa@test.local',
    role: 'INSPETOR',
    brigadaId: brigadaA.id,
  })
  const inspetorB = await makeUtilizador(prisma, {
    nome: 'Inspetor Bravo',
    email: 'inspb@test.local',
    role: 'INSPETOR',
    brigadaId: brigadaB.id,
  })

  // 2 inquéritos em A, 3 em B — números diferentes facilitam asserts.
  const inqA1 = await makeInquerito(prisma, {
    estadoId: estado.id,
    brigadaId: brigadaA.id,
    inspetorId: inspetorA.id,
    nuipc: 'A-001/22',
  })
  const inqA2 = await makeInquerito(prisma, {
    estadoId: estado.id,
    brigadaId: brigadaA.id,
    inspetorId: inspetorA.id,
    nuipc: 'A-002/22',
  })
  const inqB1 = await makeInquerito(prisma, {
    estadoId: estado.id,
    brigadaId: brigadaB.id,
    inspetorId: inspetorB.id,
    nuipc: 'B-001/22',
  })
  const inqB2 = await makeInquerito(prisma, {
    estadoId: estado.id,
    brigadaId: brigadaB.id,
    inspetorId: inspetorB.id,
    nuipc: 'B-002/22',
  })
  const inqB3 = await makeInquerito(prisma, {
    estadoId: estado.id,
    brigadaId: brigadaB.id,
    inspetorId: inspetorB.id,
    nuipc: 'B-003/22',
  })

  return {
    brigadaA,
    brigadaB,
    estado,
    chefeA,
    chefeB,
    inspetorA,
    inspetorB,
    inqA: [inqA1, inqA2],
    inqB: [inqB1, inqB2, inqB3],
  }
}
