import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/**
 * Idempotent seed split in two:
 *
 *   ALWAYS (every boot)
 *     - 5 standard EstadoInquerito rows (the codigos are referenced by code
 *       paths — they have to be present).
 *     - Admin "break-glass" user + ConfiguracaoSistema singleton (so a fresh
 *       deployment is immediately usable).
 *
 *   FIRST INSTALL ONLY (when the DB has no inquéritos and no non-admin
 *   users — i.e. nobody has used the app yet)
 *     - Demo brigadas (Alfa/Beta), demo users (coord/chefe/inspetor/estat),
 *       starter Crime catalogue, three example inquéritos and a few example
 *       atividades.
 *
 * The second group used to run on every boot via upsert-by-name, which meant
 * that renaming or deleting a demo brigada would resurrect it on the next
 * container restart. With this guard, once the operator has done any real
 * work, the demo data stays out of the way.
 */
async function main() {
  console.log('🌱 A criar seed da base de dados...')

  // ───── ALWAYS-ON: protected catalogue + admin ─────────────────────────────

  const ESTADOS_SEED = [
    { codigo: 'ABERTO', nome: 'Aberto', ordem: 1, terminal: false, cor: 'blue' },
    { codigo: 'EM_INVESTIGACAO', nome: 'Em Investigação', ordem: 2, terminal: false, cor: 'yellow' },
    { codigo: 'SUSPENSO', nome: 'Suspenso', ordem: 3, terminal: false, cor: 'orange' },
    { codigo: 'CONCLUIDO', nome: 'Concluído', ordem: 4, terminal: true, cor: 'green' },
    { codigo: 'ARQUIVADO', nome: 'Arquivado', ordem: 5, terminal: true, cor: 'gray' },
  ]
  const estadosByCodigo: Record<string, { id: string }> = {}
  for (const e of ESTADOS_SEED) {
    const r = await prisma.estadoInquerito.upsert({
      where: { codigo: e.codigo },
      update: {},
      create: e,
    })
    estadosByCodigo[e.codigo] = r
  }

  const seedPassword = process.env.SEED_PASSWORD ?? 'Admin123!'
  const hash = (pw: string) => bcrypt.hash(pw, 12)

  // ADMINISTRACAO break-glass — protected: only the role/active/password are
  // pinned (chefeSupremo=true), name/email may have been customised in the UI.
  await prisma.utilizador.upsert({
    where: { email: 'admin@gpi.pt' },
    update: { chefeSupremo: true },
    create: {
      nome: 'Administrador Sistema',
      email: 'admin@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'ADMINISTRACAO',
      chefeSupremo: true,
      ativo: true,
    },
  })

  await prisma.configuracaoSistema.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      backupScheduleCron: '0 2 * * *',
      prazoAlertaDias: 7,
      emailRemetenteNome: 'GPI Sistema',
      emailRemetenteAddr: 'noreply@gpi.pt',
    },
  })

  // ───── FRESH-INSTALL ONLY: demo data ──────────────────────────────────────
  //
  // Detect a fresh install: no inquéritos at all, AND no users besides the
  // admin we just upserted. Operators who have started using the app — even
  // just by creating one inquérito or one extra user — will not see the demo
  // brigades / crimes / example rows reappear on the next deploy.
  const [inqueritosCount, otherUsersCount] = await Promise.all([
    prisma.inquerito.count(),
    prisma.utilizador.count({ where: { email: { not: 'admin@gpi.pt' } } }),
  ])
  const freshInstall = inqueritosCount === 0 && otherUsersCount === 0

  if (!freshInstall) {
    console.log('ℹ️  Instalação já em uso — seed demo (brigadas/utilizadores/crimes/inquéritos/atividades) ignorado.')
    console.log('✅ Seed concluído!')
    return
  }

  console.log('🆕 Instalação nova — a carregar dados de exemplo.')

  // ───── Demo brigades ──────────────────────────────────────────────────────

  const brigadaAlfa = await prisma.brigada.create({
    data: { nome: 'Brigada Alfa', descricao: 'Brigada de investigação criminal A' },
  })
  const brigadaBeta = await prisma.brigada.create({
    data: { nome: 'Brigada Beta', descricao: 'Brigada de investigação criminal B' },
  })

  // ───── Demo users (one per non-admin role) ────────────────────────────────

  const coordenador = await prisma.utilizador.create({
    data: {
      nome: 'Carlos Coordenador',
      email: 'coordenador@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'COORDENADOR',
      ativo: true,
    },
  })

  const chefe = await prisma.utilizador.create({
    data: {
      nome: 'Ana Inspetora Chefe',
      email: 'chefe@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'INSPETOR_CHEFE',
      brigadaId: brigadaAlfa.id,
      ativo: true,
    },
  })

  const inspetor = await prisma.utilizador.create({
    data: {
      nome: 'João Inspetor',
      email: 'inspetor@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'INSPETOR',
      brigadaId: brigadaAlfa.id,
      ativo: true,
    },
  })

  await prisma.utilizador.create({
    data: {
      nome: 'Sofia Estatística',
      email: 'estatistica@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'ESTATISTICA',
      ativo: true,
    },
  })

  // ───── Starter Crime catalogue ────────────────────────────────────────────

  const CRIMES_SEED = [
    { nome: 'Furto qualificado', ordem: 1 },
    { nome: 'Tráfico de estupefacientes', ordem: 2 },
    { nome: 'Burla informática', ordem: 3 },
    { nome: 'Roubo', ordem: 4 },
    { nome: 'Ofensa à integridade física', ordem: 5 },
    { nome: 'Violência doméstica', ordem: 6 },
  ]
  const crimesByNome: Record<string, { id: string }> = {}
  for (const c of CRIMES_SEED) {
    const r = await prisma.crime.create({ data: c })
    crimesByNome[c.nome] = r
  }

  // ───── Example inquéritos + atividades ────────────────────────────────────

  const inq1 = await prisma.inquerito.create({
    data: {
      nuipc: '2024/000001/YUSTR',
      natureza: 'Furto qualificado',
      crimeId: crimesByNome['Furto qualificado']!.id,
      estadoId: estadosByCodigo.EM_INVESTIGACAO!.id,
      dataAbertura: new Date('2024-01-15'),
      dataPrazo: new Date('2026-07-15'),
      brigadaId: brigadaAlfa.id,
      inspetorId: inspetor.id,
      notas: 'Processo relacionado com furto em residência.',
    },
  })

  const inq2 = await prisma.inquerito.create({
    data: {
      nuipc: '2024/000002/YUSTR',
      natureza: 'Tráfico de estupefacientes',
      crimeId: crimesByNome['Tráfico de estupefacientes']!.id,
      estadoId: estadosByCodigo.ABERTO!.id,
      dataAbertura: new Date('2024-03-20'),
      dataPrazo: new Date('2026-06-01'),
      brigadaId: brigadaAlfa.id,
      inspetorId: inspetor.id,
    },
  })

  await prisma.inquerito.create({
    data: {
      nuipc: '2024/000003/YUSTR',
      natureza: 'Burla informática',
      crimeId: crimesByNome['Burla informática']!.id,
      estadoId: estadosByCodigo.CONCLUIDO!.id,
      dataAbertura: new Date('2023-06-10'),
      dataConclusao: new Date('2025-12-01'),
      brigadaId: brigadaBeta.id,
    },
  })

  await prisma.atividade.create({
    data: {
      descricao: 'Recolha de depoimentos de testemunhas no local do crime.',
      dataRealizacao: new Date('2024-01-20'),
      inqueritoid: inq1.id,
      utilizadorId: inspetor.id,
    },
  })

  await prisma.atividade.create({
    data: {
      descricao: 'Análise de registos de videovigilância.',
      dataRealizacao: new Date('2024-02-05'),
      inqueritoid: inq1.id,
      utilizadorId: inspetor.id,
    },
  })

  await prisma.atividade.create({
    data: {
      descricao: 'Perícia ao telemóvel apreendido.',
      dataRealizacao: new Date('2024-04-01'),
      inqueritoid: inq2.id,
      utilizadorId: chefe.id,
    },
  })

  // Silence unused-variable warnings — coordenador is created for completeness
  // even though no example records reference it.
  void coordenador

  console.log('✅ Seed concluído!')
  console.log('')
  console.log('Utilizadores criados:')
  console.log(`  admin@gpi.pt         → ADMINISTRACAO  (pw: ${seedPassword})`)
  console.log(`  coordenador@gpi.pt   → COORDENADOR    (pw: ${seedPassword})`)
  console.log(`  chefe@gpi.pt         → INSPETOR_CHEFE (pw: ${seedPassword})`)
  console.log(`  inspetor@gpi.pt      → INSPETOR       (pw: ${seedPassword})`)
  console.log(`  estatistica@gpi.pt   → ESTATISTICA    (pw: ${seedPassword})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
