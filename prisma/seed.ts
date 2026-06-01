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
    { codigo: 'DISTRIBUIDO', nome: 'Distribuído', ordem: 2, terminal: false, cor: 'purple' },
    { codigo: 'EM_INVESTIGACAO', nome: 'Em Investigação', ordem: 3, terminal: false, cor: 'yellow' },
    { codigo: 'SUSPENSO', nome: 'Suspenso', ordem: 4, terminal: false, cor: 'orange' },
    { codigo: 'CONCLUIDO', nome: 'Concluído', ordem: 5, terminal: true, cor: 'green' },
    { codigo: 'ARQUIVADO', nome: 'Arquivado', ordem: 6, terminal: true, cor: 'gray' },
  ]
  for (const e of ESTADOS_SEED) {
    await prisma.estadoInquerito.upsert({
      where: { codigo: e.codigo },
      // Keep ordem in sync when re-seeding so order is always consistent.
      update: { ordem: e.ordem },
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

  await seedComarcasETribunais()

  console.log('✅ Seed concluído (estados, admin, configuração, políticas de notificação, comarcas e tribunais).')
  console.log('')
  console.log(`Único utilizador: admin@gpi.pt (pw: ${seedPassword}). Sem dados de exemplo.`)
}

// ─── Comarcas e Tribunais — dados oficiais (comarcas.tribunais.org.pt) ────────

const COURTS_DATA: Array<{ comarca: string; tribunais: Array<{ nome: string; morada: string; telefone: string; email: string }> }> = [
  {
    comarca: 'Tribunal Judicial da Comarca dos Açores',
    tribunais: [
      { nome: 'Juízo de Competência Genérica de Ponta Delgada', morada: 'Rua Conselheiro Luís Bettencourt – 9500-058 Ponta Delgada', telefone: '296209670', email: 'pdelgada.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Angra do Heroísmo', morada: 'Palácio da Justiça, Praça Almeida Garrett – 9701-864 Angra do Heroísmo', telefone: '295204600', email: 'angrah.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica da Horta', morada: 'Palácio da Justiça, Largo Luís de Camões – 9901-863 Horta', telefone: '292208320', email: 'horta.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Nordeste', morada: 'Rua Doutor Manuel João Silveira, 1-A – 9630-142 Nordeste', telefone: '296090020', email: 'nordeste.tc@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Povoação', morada: 'Largo de Fall River – 9650-409 Povoação', telefone: '296550080', email: 'povoacao.tc@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ribeira Grande', morada: 'Palácio da Justiça, Largo das Freiras – 9600-511 Ribeira Grande', telefone: '296470700', email: 'ribgrande.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila Franca do Campo', morada: 'Rua do Relvão, n.º 25 – 9680-147 Vila Franca do Campo', telefone: '296539070', email: 'vfcampo.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Velas (São Jorge)', morada: 'Palácio da Justiça, Rua de Santo André – 9800-537 Velas', telefone: '', email: 'velas.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Santa Cruz da Graciosa', morada: 'Palácio da Justiça, Rebentão – 9880-316 Santa Cruz da Graciosa', telefone: '295730100', email: 'stacgrac.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Santa Cruz das Flores', morada: 'Palácio da Justiça, R. da Esperança – 9970-320 Santa Cruz das Flores', telefone: '292590223', email: 'stacflores.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila do Porto (Santa Maria)', morada: 'Avenida de Santa Maria, 16 – 9580-501 Vila do Porto', telefone: '296090010', email: 'vporto.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de São Roque do Pico', morada: 'Cais do Pico – 9940-355 São Roque do Pico', telefone: '292648060', email: 'sroquepico.judicial@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Aveiro',
    tribunais: [
      { nome: 'Juízos Centrais de Aveiro (Sede)', morada: 'Praça Marquês de Pombal – 3814-502 Aveiro', telefone: '234405300', email: 'aveiro.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Águeda', morada: 'R. Fernando Caldeira – 3750-147 Águeda', telefone: '234610310', email: 'agueda.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Albergaria-a-Velha', morada: 'Praça Ferreira Tavares – 3850-053 Albergaria-a-Velha', telefone: '234520240', email: 'albvelha.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Anadia', morada: 'Rua Dr. Azevedo Neves – 3780-199 Anadia', telefone: '', email: 'anadia@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Arouca', morada: 'Palácio da Justiça, R. Dr. Gil da Costa – 4540-134 Arouca', telefone: '256940000', email: 'arouca.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Castelo de Paiva', morada: 'Palácio da Justiça, Largo Prof. Joaquim Quintas – 4550-100 Castelo de Paiva', telefone: '255690560', email: '' },
      { nome: 'Juízo de Competência Genérica de Espinho', morada: 'Palácio da Justiça, Av. 24 – 4501-951 Espinho', telefone: '227331330', email: 'espinho.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Estarreja', morada: 'Praça Francisco Barbosa – 3860-315 Estarreja', telefone: '', email: 'estarreja@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ílhavo', morada: 'Av. Nossa Senhora do Pranto – 3830-046 Ílhavo', telefone: '234118320', email: 'ilhavo.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mealhada', morada: 'Rua Dr. José Cerveira Lebre, n.º 1 – 3050-340 Mealhada', telefone: '231209330', email: 'mealhada.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Oliveira de Azeméis', morada: 'Av. António José de Almeida – 3720-239 Oliveira de Azeméis', telefone: '256600517', email: 'oazemeis.comercio@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Oliveira do Bairro', morada: 'Rua do Foral, 20 – 3770-852 Oliveira do Bairro', telefone: '234118370', email: 'obairro.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ovar', morada: 'Rua Alexandre Herculano – 3880-146 Ovar', telefone: '256100730', email: 'ovar.execucao@tribunais.org.pt' },
      { nome: 'Juízos de Competência Genérica de Santa Maria da Feira', morada: 'Palácio da Justiça, Rua Dr. Cândido de Pinho, 18-30 – 4520-211 Santa Maria da Feira', telefone: '256371811', email: 'feira.centralcivel@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vagos', morada: 'Largo Branco de Melo – 3840-234 Vagos', telefone: '234118400', email: 'vagos.judicial@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Beja',
    tribunais: [
      { nome: 'Juízos Centrais de Beja (Sede)', morada: 'Largo Eng. Duarte Pacheco – 7801-960 Beja', telefone: '284314480', email: 'beja.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Almodôvar', morada: 'Palácio da Justiça, Rua 1º de Maio, R/c – 7700-078 Almodôvar', telefone: '', email: 'almodovar.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Cuba', morada: 'Largo Cristovão Colon – 7940-171 Cuba', telefone: '', email: 'cuba.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mértola', morada: 'Palácio da Justiça, Rua Cândido dos Reis – 7750-337 Mértola', telefone: '286610940', email: 'mertola@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Moura', morada: 'Palácio da Justiça, Largo Santa Clara – 7860-204 Moura', telefone: '285250830', email: 'moura.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Odemira', morada: 'Largo Brito Pais – 7630-133 Odemira', telefone: '283101530', email: 'odemira.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ourique', morada: 'Rua da Misericórdia – 7670-262 Ourique', telefone: '286510000', email: 'ourique.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Serpa', morada: 'Palácio da Justiça, Av. Capitães de Abril – 7830-493 Serpa', telefone: '284540080', email: 'serpa.judicial@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Braga',
    tribunais: [
      { nome: 'Juízos Centrais de Braga (Sede)', morada: 'Praça da Justiça – 4719-004 Braga', telefone: '253081110', email: 'braga.centralcivel@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Amares', morada: 'Palácio da Justiça, Largo do Município – 4720-058 Amares', telefone: '253909250', email: 'amares.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Barcelos', morada: 'Palácio da Justiça, Praça Dr. Francisco Sá Carneiro – 4750-297 Barcelos', telefone: '', email: 'barcelos.familia@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Cabeceiras de Basto', morada: 'Palácio da Justiça, Rua 25 de Abril, n.º 25 – 4860-350 Cabeceiras de Basto', telefone: '253669140', email: 'cabbasto.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Celorico de Basto', morada: 'Palácio da Justiça, Av. João Pinto Ribeiro – 4890-221 Celorico de Basto', telefone: '255320180', email: 'clbasto.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Esposende', morada: 'Palácio da Justiça, Av. Eng.º Arantes de Oliveira – 4740-204 Esposende', telefone: '', email: 'esposende.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Fafe', morada: 'Palácio da Justiça, Praça José Florêncio Soares – 4820-148 Fafe', telefone: '253700940', email: 'fafe.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Guimarães', morada: 'Palácio da Justiça, Praça da Mumadona – 4810-279 Guimarães', telefone: '253423950', email: 'guimaraes.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Póvoa de Lanhoso', morada: 'Palácio da Justiça, Largo Paços do Concelho – 4830-519 Póvoa de Lanhoso', telefone: '253639260', email: 'planhoso.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vieira do Minho', morada: 'Palácio da Justiça, Praça Guilherme Abreu – 4850-527 Vieira do Minho', telefone: '253649290', email: 'vminho.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Vila Nova de Famalicão', morada: 'Rua Eng.º Pinheiro Braga, 1000/1002 – 4764-501 Vila Nova de Famalicão', telefone: '252089500', email: 'vnfamalicao.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila Verde', morada: 'Palácio da Justiça, Praça da República – 4730-732 Vila Verde', telefone: '', email: 'vilaverde.judicial@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Bragança',
    tribunais: [
      { nome: 'Juízos Centrais de Bragança (Sede)', morada: 'Palácio da Justiça, Praça Prof. Cavaleiro de Ferreira – 5301-860 Bragança', telefone: '273310000', email: 'braganca.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Macedo de Cavaleiros', morada: 'Rua Alexandre Herculano – 5340-228 Macedo de Cavaleiros', telefone: '278420100', email: 'macedocav.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Miranda do Douro', morada: 'Palácio da Justiça, Rua do Paço – 5210-211 Miranda do Douro', telefone: '273090130', email: 'mdouro.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mirandela', morada: 'Palácio da Justiça, Rua dos Távoras – 5370-422 Mirandela', telefone: '278201050', email: 'mirandela.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mogadouro', morada: 'Palácio da Justiça, Largo Duarte Pacheco – 5200-212 Mogadouro', telefone: '279101530', email: 'mogadouro.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Torre de Moncorvo', morada: 'Praça Francisco Meireles – 5160-245 Torre de Moncorvo', telefone: '279200270', email: 'tmoncorvo.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila Flor', morada: 'Av. Marechal Carmona – 5360-303 Vila Flor', telefone: '', email: 'vilaflor.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vimioso', morada: 'Palácio da Justiça, Largo de São Sebastião – 5230-311 Vimioso', telefone: '', email: 'vimioso@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vinhais', morada: 'Palácio da Justiça, Largo do Arrabalde – 5320-318 Vinhais', telefone: '273770120', email: 'vinhais@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Castelo Branco',
    tribunais: [
      { nome: 'Juízos Centrais de Castelo Branco (Sede)', morada: 'Palácio da Justiça, Alameda da Liberdade – 6000-074 Castelo Branco', telefone: '272340570', email: 'cbranco.centralcivel@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Covilhã', morada: 'Palácio da Justiça, Rua Conde da Ericeira – 6201-002 Covilhã', telefone: '275310330', email: 'covilha.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Fundão', morada: 'Palácio da Justiça, Rua Dr. Alfredo Mendes Gil – 6230-287 Fundão', telefone: '275750260', email: 'fundao.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Idanha-a-Nova', morada: 'Palácio da Justiça – 6060-163 Idanha-a-Nova', telefone: '277200530', email: 'idanha.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Oleiros', morada: 'Largo do Município – 6160-409 Oleiros', telefone: '272091500', email: 'oleiros.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Penamacor', morada: 'Palácio da Justiça – 6090-014 Penamacor', telefone: '277090000', email: 'penamacor.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Sertã', morada: 'Palácio da Justiça, Alameda da Carvalha – 6100-730 Sertã', telefone: '', email: 'serta.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Coimbra',
    tribunais: [
      { nome: 'Juízo Central Cível de Coimbra (Sede)', morada: 'Rua João de Ruão, n.º 12, Edifício Arnado, Piso 5 – 3000-229 Coimbra', telefone: '239854970', email: 'coimbra.centralcivel@tribunais.org.pt' },
      { nome: 'Juízo Central Criminal de Coimbra', morada: 'Palácio da Justiça, Rua da Sofia – 3004-502 Coimbra', telefone: '239096580', email: 'coimbra.centralcriminal@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Cantanhede', morada: 'Palácio da Justiça, Rua dos Bombeiros Voluntários – 3060-163 Cantanhede', telefone: '231093500', email: 'cantanhede.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Figueira da Foz', morada: 'Palácio da Justiça, Passeio Infante D. Henrique – 3080-154 Figueira da Foz', telefone: '233401740', email: 'figfoz.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Montemor-o-Velho', morada: 'Palácio da Justiça, Largo dos Anjos – 3140-273 Montemor-o-Velho', telefone: '239687510', email: 'montvelho.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Oliveira do Hospital', morada: 'Palácio da Justiça, Largo Conselheiro Cabral Metelo – 3400-062 Oliveira do Hospital', telefone: '238605230', email: 'ohospital.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Penacova', morada: 'Palácio da Justiça, Rua de São João – 3360-340 Penacova', telefone: '239096500', email: 'penacova.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Évora',
    tribunais: [
      { nome: 'Juízos Centrais de Évora (Sede)', morada: 'Palácio da Justiça, Largo da Porta de Moura – 7004-507 Évora', telefone: '266748730', email: 'evora.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Montemor-o-Novo', morada: 'Palácio da Justiça, Av. Gago Coutinho – 7050-101 Montemor-o-Novo', telefone: '266898360', email: 'montnovo.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Portel', morada: 'Palácio da Justiça, Rua da Vidigueira – 7220-390 Portel', telefone: '266093500', email: 'portel@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Reguengos de Monsaraz', morada: 'Palácio da Justiça, Campo 25 de Abril – 7200-368 Reguengos de Monsaraz', telefone: '266090154', email: 'rmonsaraz.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Redondo', morada: 'Palácio da Justiça, Praça da República – 7170-011 Redondo', telefone: '266989270', email: 'redondo.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila Viçosa', morada: 'Palácio da Justiça, Largo Gago Coutinho – 7160-214 Vila Viçosa', telefone: '268105200', email: 'vvicosa.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Arraiolos', morada: 'Rua Santo Condestável, n.º 2 – 7040-027 Arraiolos', telefone: '266090130', email: 'arraiolos@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Faro',
    tribunais: [
      { nome: 'Juízos Centrais de Faro (Sede)', morada: 'Rua Pedro Nunes, n.º 8 e 10, 3.º – 8000-405 Faro', telefone: '289892900', email: 'faro.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Albufeira', morada: 'Palácio da Justiça, Rua do Município – 8200-161 Albufeira', telefone: '289510700', email: 'albufeira.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Lagoa', morada: 'Rua Dr. Fonseca de Almeida, 24-30 – 8400-346 Lagoa', telefone: '282145900', email: 'lagoa.comercio@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Lagos', morada: 'Palácio da Justiça, Avenida dos Descobrimentos – 8601-852 Lagos', telefone: '282092170', email: 'lagos.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Loulé', morada: 'Palácio da Justiça, Rua Dr.ª Laura Ayres – 8100-851 Loulé', telefone: '289401400', email: 'loule.execucao@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Olhão', morada: 'Palácio da Justiça, Av. Combatentes da Grande Guerra – 8700-440 Olhão', telefone: '289710402', email: 'olhao.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Portimão', morada: 'Palácio da Justiça, Av. Miguel Bombarda – 8500-960 Portimão', telefone: '282092144', email: 'portimao.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Silves', morada: 'Palácio da Justiça, Cruz de Portugal – 8300-135 Silves', telefone: '282440070', email: 'silves.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Tavira', morada: 'Palácio da Justiça, Rua Silvestre Falcão, 10 – 8800-412 Tavira', telefone: '281320973', email: 'tavira.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila Real de Santo António', morada: 'Palácio da Justiça, Avenida dos Bombeiros Portugueses – 8900-209 Vila Real de Santo António', telefone: '281510880', email: 'vrsant.judicial@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca da Guarda',
    tribunais: [
      { nome: 'Juízos Centrais da Guarda (Sede)', morada: 'Palácio da Justiça, Av. Coronel Orlindo de Carvalho – 6301-855 Guarda', telefone: '271090100', email: 'guarda.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Celorico da Beira', morada: 'Palácio da Justiça, Praça da República – 6360-306 Celorico da Beira', telefone: '271747490', email: 'cbeira.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Figueira de Castelo Rodrigo', morada: 'Palácio da Justiça, Av. Heróis de Castelo Rodrigo – 6440-113 Figueira de Castelo Rodrigo', telefone: '271090150', email: 'fcrodrigo.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Gouveia', morada: 'Rua Fernão Lopes – 6290-554 Gouveia', telefone: '238490030', email: 'gouveia.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mêda', morada: 'Palácio da Justiça, Av. Gago Coutinho e Sacadura Cabral – 6430-183 Mêda', telefone: '279095100', email: 'meda@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Pinhel', morada: 'Palácio da Justiça, Av. Frederico Ulrich – 6400-378 Pinhel', telefone: '271410180', email: 'pinhel.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Seia', morada: 'Palácio da Justiça, Largo Dr. Borges Pires – 6270-494 Seia', telefone: '238310200', email: 'seia.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Trancoso', morada: 'Palácio da Justiça, Largo Portas do Prado – 6420-153 Trancoso', telefone: '271829330', email: 'trancoso.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila Nova de Foz Côa', morada: 'Palácio da Justiça, Praça do Município – 5150-642 Vila Nova de Foz Côa', telefone: '279760080', email: 'vnfozcoa.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Leiria',
    tribunais: [
      { nome: 'Juízos Centrais de Leiria (Sede)', morada: 'Palácio da Justiça, Largo da República – 2414-007 Leiria', telefone: '244848800', email: 'leiria.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Alcobaça', morada: 'Palácio da Justiça, Praça João de Deus Ramos – 2461-502 Alcobaça', telefone: '262580060', email: 'alcobaca.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ansião', morada: 'Largo do Ribeiro da Vide – 3240-143 Ansião', telefone: '236670330', email: 'ansiao@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Bombarral', morada: 'Praça do Município, n.º 2 – 2540-046 Bombarral', telefone: '262095900', email: 'bombarral@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Caldas da Rainha', morada: 'Palácio da Justiça, Praça 25 de Abril – 2500-110 Caldas da Rainha', telefone: '262840684', email: 'crainha.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Nazaré', morada: 'Rua Adrião Batalha, n.º 169 – 2450-163 Nazaré', telefone: '262569170', email: 'nazare.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Peniche', morada: 'Palácio da Justiça, Av. Paulo VI – 2520-239 Peniche', telefone: '262790080', email: 'peniche.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Pombal', morada: 'Palácio da Justiça, Av. Heróis do Ultramar – 3101-901 Pombal', telefone: '', email: 'pombal.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Porto de Mós', morada: 'Palácio da Justiça – 2480-185 Porto de Mós', telefone: '', email: 'pmos.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Lisboa',
    tribunais: [
      { nome: 'Juízo Central Cível de Lisboa (Sede)', morada: 'Palácio da Justiça, Rua Marquês de Fronteira – 1098-001 Lisboa', telefone: '213846400', email: 'lisboa.centralcivel@tribunais.org.pt' },
      { nome: 'Juízo Central Criminal de Lisboa', morada: 'Av.ª D. João II, n.º 1.08.01, Edifício A – 1990-097 Lisboa', telefone: '213218300', email: 'lisboa.centralcriminal@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Almada', morada: 'Palácio da Justiça, Rua Marcos Assunção – 2809-015 Almada', telefone: '212721500', email: 'almada.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica do Barreiro', morada: 'Palácio da Justiça, Av. de Santa Maria – 2830-007 Barreiro', telefone: '212149200', email: 'barreiro.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica do Montijo', morada: 'Av. Dr. Manuel Paulino Gomes – 2870-156 Montijo', telefone: '212306500', email: 'montijo.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica do Seixal', morada: 'Quinta dos Franceses – 2840-499 Seixal', telefone: '212274500', email: 'seixal.judicial@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Lisboa Norte',
    tribunais: [
      { nome: 'Juízos Centrais de Loures (Sede)', morada: 'Palácio da Justiça, Rua Professor Afonso Costa – 2674-502 Loures', telefone: '219825200', email: 'loures.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Alenquer', morada: 'Palácio da Justiça, Avenida 25 de Abril – 2580-367 Alenquer', telefone: '263730260', email: 'alenquer.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Cadaval', morada: 'Rua João Paulo II – 2550-165 Cadaval', telefone: '262095910', email: 'cadaval@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Lourinhã', morada: 'Palácio da Justiça, Praça José Máximo da Costa – 2530-119 Lourinhã', telefone: '261417250', email: 'lourinha.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Torres Vedras', morada: 'Rua 9 de Abril, n.º 2 – 2560-301 Torres Vedras', telefone: '261218410', email: 'tvedras.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila Franca de Xira', morada: 'R. Dr. Vasco Moniz, Edif. Varandas da Lezíria – 2600-273 Vila Franca de Xira', telefone: '263285760', email: 'vfxira.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Lisboa Oeste',
    tribunais: [
      { nome: 'Juízos Centrais de Sintra (Sede)', morada: 'Palácio da Justiça, Av. General Mário Firmino Miguel, n.º 2 – 2714-556 Sintra', telefone: '219100500', email: 'sintra.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada da Amadora', morada: 'Palácio da Justiça, Av. da Quinta Grande, n.º 83 – 2610-158 Amadora', telefone: '211550100', email: 'amadora.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Cascais', morada: 'Palácio da Justiça, R. Dr. Fernando M. F. Baptista Viegas – 2754-503 Cascais', telefone: '214824900', email: 'cascais.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mafra', morada: 'Palácio da Justiça, Av. 25 de Abril – 2640-456 Mafra', telefone: '261109650', email: 'mafra.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Oeiras', morada: 'Palácio da Justiça, Av. D. João I – 2784-508 Oeiras', telefone: '214405500', email: 'oeiras.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca da Madeira',
    tribunais: [
      { nome: 'Juízos Centrais do Funchal (Sede)', morada: 'Palácio da Justiça, Rua Marquês do Funchal – 9004-548 Funchal', telefone: '291213400', email: 'funchal.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ponta do Sol', morada: 'Rua Dr. João Augusto Teixeira – 9360-215 Ponta do Sol', telefone: '291970280', email: 'pontasol.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Porto Santo', morada: 'Largo do Pelourinho – 9400-001 Porto Santo', telefone: '291090308', email: 'portosanto.mp@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Santa Cruz (Madeira)', morada: 'Palácio da Justiça, Santa Cruz – 9100-015 Santa Cruz', telefone: '', email: 'stcruz.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Portalegre',
    tribunais: [
      { nome: 'Juízos Centrais de Portalegre (Sede)', morada: 'Rua Dr. Mário Chambel – 7301-851 Portalegre', telefone: '245339980', email: 'portalegre.centralcivelcriminal@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Avis', morada: 'Praceta Serpa Pinto, n.º 11 – 7480-122 Avis', telefone: '242410150', email: 'avis@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Elvas', morada: 'Palácio da Justiça, Praça D. Sancho II – 7350-127 Elvas', telefone: '268105210', email: 'elvas.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Fronteira', morada: 'Palácio da Justiça, Largo Professor Antunes Varela – 7460-111 Fronteira', telefone: '245600120', email: 'fronteira.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Nisa', morada: 'Palácio da Justiça, Praça da República – 6050-350 Nisa', telefone: '245090100', email: 'nisa.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ponte de Sor', morada: 'Palácio da Justiça, Largo 25 de Abril – 7400-228 Ponte de Sor', telefone: '242093500', email: 'pontesor.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca do Porto',
    tribunais: [
      { nome: 'Juízos Centrais do Porto (Sede)', morada: 'Rua de Camões, 155 – 4049-074 Porto', telefone: '', email: 'porto.diap@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Gondomar', morada: 'Rua Monte Crasto, 10, 1.º – 4420-210 Gondomar', telefone: '224664460', email: 'gondomar.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica da Maia', morada: 'Rua Dona Deolinda Duarte dos Santos, 61 – 4470-171 Maia', telefone: '229430110', email: 'maia.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Matosinhos', morada: 'Palácio da Justiça, Rua Augusto Gomes – 4450-053 Matosinhos', telefone: '229393600', email: 'matosinhos.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica da Póvoa de Varzim', morada: 'Palácio da Justiça, Largo das Dores – 4490-421 Póvoa de Varzim', telefone: '252600450', email: 'pvarzim.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Santo Tirso', morada: 'Palácio da Justiça, Praça General Humberto Delgado – 4780-376 Santo Tirso', telefone: '252808120', email: 'stotirso.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Valongo', morada: 'Campus de Justiça, Avenida Emílio Navarro, 291 – 4440-649 Valongo', telefone: '224218310', email: 'valongo.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vila do Conde', morada: 'Palácio da Justiça, Praça Luís de Camões, 9 – 4480-719 Vila do Conde', telefone: '252249316', email: 'vilaconde.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Vila Nova de Gaia', morada: 'Avenida da República, 541-B – 4430-200 Vila Nova de Gaia', telefone: '223749130', email: 'gaia.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca do Porto Este',
    tribunais: [
      { nome: 'Juízos Centrais de Penafiel (Sede)', morada: 'Palácio da Justiça, Av. Egas Moniz – 4564-001 Penafiel', telefone: '255714900', email: 'penafiel.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Amarante', morada: 'Rua Capitão Augusto Casimiro – 4600-056 Amarante', telefone: '255420300', email: 'amarante.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Baião', morada: 'R. Frei Domingos Vieira, Palácio da Justiça, Campelo – 4640-151 Baião', telefone: '255540100', email: 'baiao.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Felgueiras', morada: 'Rua Miguel Bombarda – 4610-198 Felgueiras', telefone: '255318300', email: 'felgueiras.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Lousada', morada: 'Palácio da Justiça, Av. Senhor dos Aflitos – 4620-662 Lousada', telefone: '255810270', email: 'lousada.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Marco de Canaveses', morada: 'Palácio da Justiça, Rua Francisco Sá Carneiro – 4630-205 Marco de Canaveses', telefone: '255538270', email: 'mcanavezes.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Paços de Ferreira', morada: 'Praça da República – 4590-527 Paços de Ferreira', telefone: '255868900', email: 'pferreira.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Paredes', morada: 'Palácio da Justiça, Parque José Guilherme – 4580-130 Paredes', telefone: '255788470', email: 'paredes.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Santarém',
    tribunais: [
      { nome: 'Juízos Centrais de Santarém (Sede)', morada: 'Palácio da Justiça, Campo Sá da Bandeira – 2000-024 Santarém', telefone: '243305150', email: 'santarem.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Abrantes', morada: 'Esplanada 1.º de Maio – 2200-320 Abrantes', telefone: '241360560', email: 'abrantes.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Almeirim', morada: 'Palácio da Justiça, Rua Bernardo Gonçalves, 54-B – 2080-064 Almeirim', telefone: '245090260', email: 'almeirim.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Benavente', morada: 'Av. Dr. Francisco J. Calheiros Lopes – 2130-014 Benavente', telefone: '', email: 'benavente.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Cartaxo', morada: 'Palácio da Justiça, Largo Vasco da Gama – 2070-048 Cartaxo', telefone: '243701030', email: 'cartaxo.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Coruche', morada: 'Palácio da Justiça, Estrada da Lamarosa, Santo Antonino – 2100-042 Coruche', telefone: '243610380', email: 'coruche.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica do Entroncamento', morada: 'Palácio da Justiça, Av. Dr. José Eduardo Vitor das Neves – 2330-066 Entroncamento', telefone: '249720230', email: 'entronc.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ourém', morada: 'Palácio da Justiça, Praça do Município – 2490-499 Ourém', telefone: '249540200', email: 'ourem.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Rio Maior', morada: 'Palácio da Justiça, Parque 25 de Abril – 2040-332 Rio Maior', telefone: '243909440', email: 'riomaior.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Tomar', morada: 'Av. General Tamagnini de Abreu, 36 – 1.º – 2300-536 Tomar', telefone: '249328350', email: 'tomar.tt@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Setúbal',
    tribunais: [
      { nome: 'Juízos Centrais de Setúbal (Sede)', morada: 'Palácio da Justiça, Rua Cláudio Lagrange – 2904-504 Setúbal', telefone: '265541300', email: 'setubal.diap@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Alcácer do Sal', morada: 'Palácio da Justiça, Estrada Nacional, 5 – 7580-175 Alcácer do Sal', telefone: '265100850', email: 'alcasal@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Grândola', morada: 'Av. Jorge Nunes – 7570-113 Grândola', telefone: '', email: 'grandola.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Santiago do Cacém', morada: 'Av. D. Nuno Álvares Pereira – 7540-104 Santiago do Cacém', telefone: '', email: 'santiago.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Sesimbra', morada: 'Rua Navegador Rodrigues Soromenho, Edifício da Falésia, Bloco K – 2970-773 Sesimbra', telefone: '212288150', email: 'sesimbra.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Sines', morada: 'Alameda da Paz, 57 – 7520-110 Sines', telefone: '', email: 'sines.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Viana do Castelo',
    tribunais: [
      { nome: 'Juízos Centrais de Viana do Castelo (Sede)', morada: 'Palácio da Justiça, Av. Combatentes da Grande Guerra, 1 – 4900-544 Viana do Castelo', telefone: '258801555', email: 'vcastelo.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Arcos de Valdevez', morada: 'Praça Municipal – 4974-006 Arcos de Valdevez', telefone: '258090140', email: 'avaldevez.tc@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Caminha', morada: 'Palácio da Justiça, Av. Manuel Xavier – 4910-105 Caminha', telefone: '258710354', email: 'caminha.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Melgaço', morada: 'Palácio da Justiça, Largo Hermenegildo Solheiro – 4960-551 Melgaço', telefone: '251400120', email: 'melgaco.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Monção', morada: 'Palácio da Justiça, Praça da República – 4950-506 Monção', telefone: '251640020', email: 'moncao.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ponte da Barca', morada: 'Palácio da Justiça, Rua da Justiça – 4980-639 Ponte da Barca', telefone: '258480360', email: 'pbarca.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Ponte de Lima', morada: 'Palácio da Justiça, Av. António Feijó – 4990-029 Ponte de Lima', telefone: '258900520', email: 'plima.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Valença', morada: 'Palácio da Justiça, Largo de S. Teotónio – 4930-698 Valença', telefone: '251800180', email: 'valenca.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Vila Real',
    tribunais: [
      { nome: 'Juízos Centrais de Vila Real (Sede)', morada: 'Avenida Almeida Lucena, 327 – 5000-660 Vila Real', telefone: '', email: 'vilareal.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Alijó', morada: 'R. Comendador José Rufino – 5070-031 Alijó', telefone: '259957210', email: 'alijo.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Boticas', morada: 'Tv. do Município – 5460-304 Boticas', telefone: '276095600', email: 'boticas@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Chaves', morada: 'Palácio da Justiça, Largo do Arrabalde – 5400-097 Chaves', telefone: '', email: 'chaves.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mesão Frio', morada: 'Av. Cons. José Maria de Alpoim, 432 – 5040-310 Mesão Frio', telefone: '254095600', email: 'mesaofrio@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Montalegre', morada: 'Palácio da Justiça, Praça do Município – 5470-214 Montalegre', telefone: '', email: 'montalegre.ministeriopublico@tribunais.org.pt' },
    ],
  },
  {
    comarca: 'Tribunal Judicial da Comarca de Viseu',
    tribunais: [
      { nome: 'Juízos Centrais de Viseu (Sede)', morada: 'Palácio da Justiça, Av. da Europa – 3514-506 Viseu', telefone: '232427000', email: 'viseu.centralcivel@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Armamar', morada: 'Rua Gaspar e Manuel Cardoso – 5110-121 Armamar', telefone: '254095500', email: 'armamar@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Castro Daire', morada: 'Palácio da Justiça, Rua Padre Américo – 3600-132 Castro Daire', telefone: '232091520', email: 'cdaire.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Cinfães', morada: 'Palácio da Justiça, Rua Major Monteiro Leite – 4690-030 Cinfães', telefone: '255560130', email: 'cinfaes.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízos de Competência Especializada de Lamego', morada: 'Palácio da Justiça, Av. Infantaria 9 – 5100-147 Lamego', telefone: '254093540', email: 'lamego.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Mangualde', morada: 'Palácio da Justiça, Largo Dr. Couto, 72 – 3530-134 Mangualde', telefone: '', email: 'mangualde.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Resende', morada: 'Palácio da Justiça, Jardim 25 de Abril – 4660-211 Resende', telefone: '254095510', email: 'resende@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Santa Comba Dão', morada: 'Palácio da Justiça, Largo Alves Mateus – 3440-333 Santa Comba Dão', telefone: '232880130', email: 'scdao.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Sátão', morada: 'Praça Paulo VI – 3560-154 Sátão', telefone: '232980060', email: 'satao.ministeriopublico@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Tabuaço', morada: 'Palácio da Justiça, Rua Dr. António José de Almeida – 5120-413 Tabuaço', telefone: '254095520', email: 'tabuaco@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Tondela', morada: 'Palácio da Justiça, Largo Dr. Anselmo Ferraz de Carvalho – 3464-002 Tondela', telefone: '232814280', email: 'tondela.judicial@tribunais.org.pt' },
      { nome: 'Juízo de Competência Genérica de Vouzela', morada: 'Palácio da Justiça, Rua Dr. Guilherme Coutinho – 3670-235 Vouzela', telefone: '232740720', email: 'vouzela@tribunais.org.pt' },
    ],
  },
]

async function seedComarcasETribunais() {
  console.log('  ↳ A importar comarcas e tribunais...')
  let comarcaCount = 0
  let tribunalCount = 0
  for (let i = 0; i < COURTS_DATA.length; i++) {
    const { comarca: nomeComarca, tribunais } = COURTS_DATA[i]!
    const comarca = await prisma.comarca.upsert({
      where: { nome: nomeComarca },
      update: { ordem: i },
      create: { nome: nomeComarca, ordem: i, ativo: true },
    })
    comarcaCount++
    for (let j = 0; j < tribunais.length; j++) {
      const t = tribunais[j]!
      await prisma.tribunal.upsert({
        where: { nome: t.nome },
        update: {
          comarcaId: comarca.id,
          morada: t.morada || null,
          telefone: t.telefone || null,
          email: t.email || null,
          ordem: j,
        },
        create: {
          nome: t.nome,
          comarcaId: comarca.id,
          morada: t.morada || null,
          telefone: t.telefone || null,
          email: t.email || null,
          ordem: j,
          ativo: true,
        },
      })
      tribunalCount++
    }
  }
  console.log(`  ↳ ${comarcaCount} comarcas e ${tribunalCount} tribunais importados.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
