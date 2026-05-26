import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { TipoNotificacao, Role } from '../src/generated/prisma/enums'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/**
 * Seed idempotente — apenas o essencial para uma instalação utilizável:
 *
 *   - 5 EstadoInquerito padrão (os codigos são referenciados por code paths,
 *     têm de existir).
 *   - Utilizador admin "break-glass" + ConfiguracaoSistema singleton.
 *   - NotificationPolicy (uma row por TipoNotificacao).
 *
 * NÃO carrega quaisquer dados de exemplo (brigadas, inquéritos, atividades)
 * nem utilizadores além do admin — uma instalação nova arranca limpa. O
 * operador cria brigadas, crimes, utilizadores e inquéritos pela aplicação.
 */
async function main() {
  console.log('🌱 A criar seed da base de dados...')

  // ───── Estados (catálogo protegido, referenciado por código) ──────────────

  const ESTADOS_SEED = [
    { codigo: 'ABERTO', nome: 'Aberto', ordem: 1, terminal: false, cor: 'blue' },
    { codigo: 'EM_INVESTIGACAO', nome: 'Em Investigação', ordem: 2, terminal: false, cor: 'yellow' },
    { codigo: 'SUSPENSO', nome: 'Suspenso', ordem: 3, terminal: false, cor: 'orange' },
    { codigo: 'CONCLUIDO', nome: 'Concluído', ordem: 4, terminal: true, cor: 'green' },
    { codigo: 'ARQUIVADO', nome: 'Arquivado', ordem: 5, terminal: true, cor: 'gray' },
  ]
  for (const e of ESTADOS_SEED) {
    await prisma.estadoInquerito.upsert({
      where: { codigo: e.codigo },
      update: {},
      create: e,
    })
  }

  const seedPassword = process.env.SEED_PASSWORD ?? 'Admin123!'
  const hash = (pw: string) => bcrypt.hash(pw, 12)

  // ADMINISTRACAO break-glass — protegido: só role/active/password são fixos
  // (chefeSupremo=true); nome/email podem ter sido personalizados na UI.
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

  // ───── Notification policies (idempotente, uma row por TipoNotificacao) ──
  //
  // `update: {}` é deliberado: se o admin já editou a policy via UI, não
  // queremos sobrescrever em cada boot. Para preencher rows faltantes
  // quando se adiciona um tipo novo ao enum, o upsert ainda corre o create.
  for (const tipo of Object.values(TipoNotificacao)) {
    const adminCcTypes: TipoNotificacao[] = [
      TipoNotificacao.BACKUP_FALHOU,
      TipoNotificacao.ATUALIZACAO_FALHOU,
      TipoNotificacao.ATUALIZACAO_CONCLUIDA,
    ]
    const ccRoles: Role[] = adminCcTypes.includes(tipo) ? [Role.ADMINISTRACAO] : []
    await prisma.notificationPolicy.upsert({
      where: { tipo },
      update: {},
      create: { tipo, inAppEnabled: true, emailEnabled: true, ccRoles },
    })
  }

  console.log('✅ Seed concluído (estados, admin, configuração, políticas de notificação).')
  console.log('')
  console.log(`Único utilizador: admin@gpi.pt (pw: ${seedPassword}). Sem dados de exemplo.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
