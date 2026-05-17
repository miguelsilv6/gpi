import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 A criar seed da base de dados...')

  // Estados de inquérito (5 standard codigos)
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

  // Brigadas
  const brigadaAlfa = await prisma.brigada.upsert({
    where: { nome: 'Brigada Alfa' },
    update: {},
    create: { nome: 'Brigada Alfa', descricao: 'Brigada de investigação criminal A' },
  })

  const brigadaBeta = await prisma.brigada.upsert({
    where: { nome: 'Brigada Beta' },
    update: {},
    create: { nome: 'Brigada Beta', descricao: 'Brigada de investigação criminal B' },
  })

  const seedPassword = process.env.SEED_PASSWORD ?? 'Admin123!'
  const hash = (pw: string) => bcrypt.hash(pw, 12)

  // Utilizadores (1 por role)
  // The ADMINISTRACAO account is the platform's "break-glass" super-admin
  // (chefeSupremo). Its role/active state/password cannot be modified via
  // the user management UI — protection enforced in the PUT/DELETE endpoint.
  const admin = await prisma.utilizador.upsert({
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

  const coordenador = await prisma.utilizador.upsert({
    where: { email: 'coordenador@gpi.pt' },
    update: {},
    create: {
      nome: 'Carlos Coordenador',
      email: 'coordenador@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'COORDENADOR',
      ativo: true,
    },
  })

  const chefe = await prisma.utilizador.upsert({
    where: { email: 'chefe@gpi.pt' },
    update: { chefeSupremo: false },
    create: {
      nome: 'Ana Inspetora Chefe',
      email: 'chefe@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'INSPETOR_CHEFE',
      brigadaId: brigadaAlfa.id,
      ativo: true,
    },
  })

  const inspetor = await prisma.utilizador.upsert({
    where: { email: 'inspetor@gpi.pt' },
    update: {},
    create: {
      nome: 'João Inspetor',
      email: 'inspetor@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'INSPETOR',
      brigadaId: brigadaAlfa.id,
      ativo: true,
    },
  })

  await prisma.utilizador.upsert({
    where: { email: 'estatistica@gpi.pt' },
    update: {},
    create: {
      nome: 'Sofia Estatística',
      email: 'estatistica@gpi.pt',
      passwordHash: await hash(seedPassword),
      role: 'ESTATISTICA',
      ativo: true,
    },
  })

  // Configuração do sistema (singleton)
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

  // Inquéritos de exemplo
  const inq1 = await prisma.inquerito.upsert({
    where: { nuipc: '2024/000001/YUSTR' },
    update: {},
    create: {
      nuipc: '2024/000001/YUSTR',
      natureza: 'Furto qualificado',
      estadoId: estadosByCodigo.EM_INVESTIGACAO!.id,
      faseProcessual: 'INQUERITO',
      dataAbertura: new Date('2024-01-15'),
      dataPrazo: new Date('2026-07-15'),
      brigadaId: brigadaAlfa.id,
      inspetorId: inspetor.id,
      notas: 'Processo relacionado com furto em residência.',
    },
  })

  const inq2 = await prisma.inquerito.upsert({
    where: { nuipc: '2024/000002/YUSTR' },
    update: {},
    create: {
      nuipc: '2024/000002/YUSTR',
      natureza: 'Tráfico de estupefacientes',
      estadoId: estadosByCodigo.ABERTO!.id,
      faseProcessual: 'INSTRUCAO',
      dataAbertura: new Date('2024-03-20'),
      dataPrazo: new Date('2026-06-01'),
      brigadaId: brigadaAlfa.id,
      inspetorId: inspetor.id,
    },
  })

  await prisma.inquerito.upsert({
    where: { nuipc: '2024/000003/YUSTR' },
    update: {},
    create: {
      nuipc: '2024/000003/YUSTR',
      natureza: 'Burla informática',
      estadoId: estadosByCodigo.CONCLUIDO!.id,
      faseProcessual: 'JULGAMENTO',
      dataAbertura: new Date('2023-06-10'),
      dataConclusao: new Date('2025-12-01'),
      brigadaId: brigadaBeta.id,
    },
  })

  // Atividades de exemplo
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
