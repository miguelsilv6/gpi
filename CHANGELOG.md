# Changelog

Todas as alterações relevantes nesta versão estão documentadas aqui.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/).
Versionamento: [SemVer](https://semver.org/lang/pt-PT/).

## [Unreleased]

## [0.5.90] — 2026-07-13

### Alterado
- **Administração de e-mail reunida num único separador “Email”** nas
  Configurações (perfil de Administração). Passa a concentrar, por esta ordem,
  o **servidor SMTP** (com botão de envio de e-mail de teste), o **interruptor
  de notificações por e-mail** e a **personalização do template** — antes
  dispersos entre o separador “Sistema” (SMTP + interruptor) e o separador
  “Template E-mail”. O separador “Notificações” (políticas por tipo:
  in-app / e-mail / cópias por perfil) mantém-se autónomo, por também governar
  as notificações in-app. Sem alterações de comportamento nem de dados — apenas
  reorganização da interface.

### Adicionado
- **Último acesso de cada utilizador na lista de utilizadores** (perfil de
  Administração) — a página **Utilizadores** passa a mostrar uma coluna
  **Último acesso** com a data/hora do último início de sessão bem-sucedido e o
  **IP** desse acesso (ou *“Nunca”* para quem nunca entrou). Disponível também
  nos cartões em ecrã pequeno.
- **Indicador “online agora”** — um ponto verde junto ao nome (e a etiqueta
  *“· online”*) assinala os utilizadores ativos neste momento. Como as sessões
  são *stateless* (JWT, sem registo de sessões em base de dados), a presença é
  derivada de um **heartbeat de atividade**: enquanto a aplicação está aberta, a
  sondagem periódica do sino de notificações (~90 s) atualiza a “última
  atividade” do utilizador; considera-se online quem foi visto nos últimos
  ~3 minutos (tolera até duas sondagens falhadas). Este sinal é apenas
  indicativo — não substitui o registo de auditoria de início de sessão.
- Testes de integração do heartbeat: a sondagem de contagem do sino
  (`?count=true`) atualiza a última atividade, e o caminho de listagem das
  notificações não a atualiza (mantém o sinal restrito e barato).

## [0.5.86] — 2026-07-13

### Alterado
- **Exportação para PDF do inquérito passa a ser uma visão global completa** —
  a vista de impressão (botão “PDF” no detalhe do inquérito) deixa de mostrar
  apenas as atividades e passa a incluir tudo o que foi feito no inquérito:
  **inquéritos relacionados, outros intervenientes, controlos, diligências,
  interceções (alvos e linhas, com contagem de produtos), apreensões, perícias
  e documentos anexados**, para além da identificação, atribuição, denunciante,
  tribunal/M.P. e notas que já constavam. Cada secção só aparece quando tem
  registos, em tabelas otimizadas para impressão. (O detalhe dos produtos de
  interceção e o conteúdo dos ficheiros continuam nas exportações dedicadas; o
  histórico de auditoria mantém-se fora deste documento.)

## [0.5.84] — 2026-07-13

### Adicionado
- **Personalização do template dos e-mails de notificação** — nova página
  (separador **Template E-mail**) nas Configurações, só para a Administração:
  - **Formulário estruturado** com pré-visualização ao vivo: mostrar/ocultar o
    cabeçalho com o nome da aplicação, cor de destaque, saudação, rodapé/
    assinatura, aviso legal e prefixo do assunto. O sistema gera o HTML do
    e-mail (compatível com clientes de e-mail, estilos inline).
  - Os campos de texto suportam a variável `{appName}`; o título e a mensagem
    de cada notificação entram no corpo. O conteúdo é sempre escapado (sem risco
    de injeção de HTML a partir dos dados das notificações).
  - Aplica-se a **todos** os e-mails de notificação — antes eram um `<p>` simples.
    O template é global, guardado na configuração do sistema (predefinições
    embutidas quando não personalizado), com registo de auditoria e cache de
    60 s no envio.
  - Testes: unitários do render (assunto/HTML/texto, escaping, `{appName}`,
    cabeçalho, cor) e de integração do endpoint (gate de Administração,
    persistência, validação).

### Adicionado
- **Novo módulo "Perícias"** — registo e acompanhamento dos exames técnicos e
  científicos pedidos a entidades externas (LPC, INML, …), companheiro do módulo
  de Apreensões:
  - **Registo por perícia**: tipo (balística, ADN/genética, informática forense,
    documental, toxicológica, dactiloscópica, médico-legal, financeira, avaliação
    ou outra), entidade, nº de referência, data do pedido, data prevista de
    conclusão, estado (solicitada, em curso, concluída, cancelada), data de
    conclusão, resultado e observações.
  - **Ligação opcional a um objeto apreendido** — a perícia pode referenciar a
    apreensão examinada (do mesmo inquérito); ao apagar a apreensão, a perícia
    mantém-se e apenas fica sem ligação.
  - **Gestão dentro do inquérito** (secção própria no detalhe) com o mesmo gate
    operacional das atividades/apreensões — titular, hierarquia e colaboradores
    autorizados podem registar.
  - **Página global "Perícias"** com filtros por estado (pendentes / concluídas /
    todas), agrupada por NUIPC, com as datas previstas em atraso destacadas.
  - **Alerta de "perícia atrasada"**: quando a data prevista de conclusão passa e
    a perícia continua por concluir, o inspetor titular recebe um lembrete
    automático (ligado ao mesmo motor de prazos do worker e da rota de cron).
  - **Módulo opcional** ativável por perfil nas Configurações, com as perícias a
    constarem também do CSV de detalhe do inquérito.
  - Cobertura de testes: validação (unitários) e integração das rotas (gates,
    proteção contra IDs cruzados, validação da apreensão ligada) e do motor do
    alerta (dispara uma vez, é idempotente e respeita estado/data/soft-delete).

## [0.5.80] — 2026-07-13

### Adicionado
- **Novo módulo "Apreensões"** — registo e cadeia de custódia dos objetos
  apreendidos em cada inquérito, substituindo o controlo informal em papel/Excel:
  - **Registo por objeto**: descrição, tipo (arma, veículo, dinheiro/valores,
    estupefaciente, equipamento informático, documento ou outro), quantidade,
    n.º do auto, data e local da apreensão, a quem foi apreendido, local de
    custódia, estado da custódia (em custódia, a aguardar exame, devolvido,
    perdido a favor do Estado, destruído), data e observações do destino.
  - **Gestão dentro do inquérito** (secção própria no detalhe) com o mesmo gate
    operacional das atividades/interceções — o titular, a hierarquia e os
    colaboradores autorizados podem registar.
  - **Página global "Apreensões"** com filtros por estado (em custódia /
    concluídas / todas), agrupada por NUIPC e respeitando o âmbito de acesso de
    cada utilizador.
  - **Alerta de "apreensão parada"**: objetos que fiquem em custódia (ou a
    aguardar exame) além de um prazo configurável (por defeito 180 dias) geram um
    lembrete ao inspetor titular para lhes dar destino. O prazo é ajustável nas
    Configurações e pode ser desligado.
  - **Módulo opcional**: ativável/desativável por perfil nas Configurações
    (padrão dos restantes módulos; a Administração vê sempre).
  - **Exportação**: as apreensões passam a constar do CSV de detalhe do inquérito.
  - Cobertura de testes: validação (unitários) e integração das rotas (gates,
    proteção contra IDs cruzados) e do motor do alerta (dispara uma vez, é
    idempotente e respeita estado/prazo/soft-delete).

## [0.5.78] — 2026-07-12

### Alterado
- **Interno (só testes)**: adicionada cobertura de integração às rotas de
  intervenientes, exercitando os handlers HTTP contra a base de dados real —
  gates de permissão (titular/hierarquia cria; inspetor de outra brigada 404;
  colaborador autorizado lê mas não gere, 403), proteção contra IDs cruzados
  (interveniente de outro inquérito → 404) e limpeza do `responsavel` ao mudar
  a natureza para pessoa singular. Sem alteração de comportamento.

## [0.5.76] — 2026-07-11

### Alterado
- **Interno (sem impacto funcional)**: o registo de auditoria (`writeAudit`)
  passa a aceitar os detalhes como `Record<string, unknown>`, com a conversão
  para o tipo JSON do Prisma feita uma única vez na própria função. Removidos 61
  casts `as never` espalhados por 48 ficheiros de rotas — menos ruído e deixa de
  mascarar eventuais erros de tipo reais nos objetos de auditoria.

### Corrigido
- **Alertas de prazo de atividades não estavam a ser enviados** pelo processo
  agendado. Existiam duas implementações do "deadline-check" que tinham
  divergido: a verificação agendada (worker, diária) tratava prazos de
  inquéritos, controlos e interceções, **mas não os prazos das atividades**;
  a rota manual `/api/cron/deadline-check` tratava os prazos das atividades
  mas **não os controlos**. Como o caminho realmente agendado é o worker, os
  avisos (1.º/2.º) que os inspetores configuram nas atividades nunca
  disparavam. A lógica foi unificada numa única função partilhada
  (`runDeadlineChecks`) usada pelos dois caminhos — passam a correr exatamente
  as mesmas verificações (inquéritos, atividades, controlos e interceções),
  eliminando a divergência. Adicionados testes que cobrem o disparo dos
  alertas de atividades no caminho do worker.

### Adicionado
- **Outros intervenientes no inquérito**: além do denunciante, é agora possível
  registar outros intervenientes — lesado, vítima, testemunha,
  advogado/mandatário, arguido/suspeito, perito ou "outro" (com descrição
  livre). Cada interveniente tem os mesmos campos do denunciante (pessoa
  singular ou coletiva, NIF/NIPC, morada, contactos, responsável e notas). São
  opcionais e geridos ao nível do inquérito, com a mesma permissão do
  denunciante (titular ou hierarquia). Aparecem numa secção própria no detalhe
  do inquérito e são incluídos na exportação CSV. As ações ficam registadas na
  auditoria.
- **Visita guiada de boas-vindas**: no primeiro acesso, arranca automaticamente
  uma visita guiada (em Português) que apresenta as principais funcionalidades,
  **adaptada ao perfil** — só destaca os itens de menu e áreas a que o
  utilizador tem acesso. Pode ser saltada a qualquer momento e voltar a ser
  vista quando se quiser, a partir do **Perfil** → "Ver visita guiada".

### Corrigido
- **Colaboração — colaborador não conseguia editar/eliminar/concluir as suas
  atividades**: a UI mostrava os botões, mas a API de mutação de atividades
  exigia ser o titular do inquérito, pelo que um colaborador autorizado (ou o
  titular perante uma atividade registada por outro inspetor) recebia 403. O
  gate passa a distinguir dois níveis, alinhado com a UI: **concluir** é
  trabalho operacional (titular, hierarquia ou colaborador ativo podem concluir
  qualquer atividade); **editar os dados ou eliminar** continua reservado ao
  autor da entrada (ou à hierarquia).

### Adicionado
- **Notificação ao colaborador autorizado**: quando um inspetor é autorizado a
  colaborar num inquérito, passa a receber uma notificação (in-app/email,
  conforme a política) a informar do novo acesso — antes só ficava registado na
  auditoria. Novo tipo de notificação "Colaboração autorizada", configurável em
  Configurações → Notificações.

### Alterado
- **Colaboração autorizada — pequenos acertos de revisão**: no seletor de data
  de expiração da autorização, o campo passa a impedir a escolha de uma data
  no passado (atributo `min`), evitando um erro do servidor por já-expirada; a
  validação no servidor mantém-se. Simplificação interna: `isColaboradorAtivo`
  reutiliza o fragmento `colaboradorAtivoSomeWhere`, sem alteração de
  comportamento.

## [0.5.68] — 2026-07-07

### Adicionado
- **Colaboração autorizada em inquéritos**: um inspetor pode agora trabalhar
  num inquérito que não lhe está distribuído, desde que autorizado. O titular
  do inquérito — e a hierarquia (chefe da brigada, coordenação e administração)
  — pode conceder autorização a outro inspetor, com um motivo opcional e uma
  data de validade opcional. O colaborador autorizado passa a ver o inquérito e
  a poder registar **trabalho operacional** (atividades, notas, documentos,
  controlos e interceções), mas **não** pode alterar o estado, o prazo ou o
  titular, nem eliminar o inquérito — essas ações continuam reservadas ao
  titular e à hierarquia. As atividades ficam sempre atribuídas a quem as
  registou. Conceder e revogar autorizações fica registado na auditoria. A
  autorização pode ser revogada a qualquer momento e expira automaticamente na
  data definida (se existir).
- **Ícone de interceções junto ao NUIPC**: na listagem de inquéritos, os que
  têm alvos de interceção passam a mostrar um ícone à frente do NUIPC (à
  semelhança do ícone de carta precatória). Um inquérito pode apresentar vários
  ícones em simultâneo.

### Alterado
- **Reabertura de inquéritos pelo inspetor**: o perfil de inspetor passa a poder
  reabrir os seus próprios inquéritos que estejam num estado terminal
  (Arquivado ou Concluído), sem depender da hierarquia.
- **Documentação pendente mostra o estado**: a lista de documentação pendente
  passa a incluir uma coluna com o estado atual de cada inquérito.

## [0.5.66] — 2026-07-07

### Corrigido
- **NUIPC com espaço em branco causava "Página não encontrada"**: o
  formulário de criação/edição não removia espaços iniciais/finais do
  NUIPC antes de gravar. Um NUIPC guardado com esse espaço continuava a
  aparecer na pesquisa (que usa correspondência parcial), mas a página de
  detalhe (que exige correspondência exata) deixava de o encontrar. O
  schema passa agora a fazer `trim()` do NUIPC.



### Corrigido
- **CRÍTICO — arranque falhava (502) quando um alvo de interceção tinha mais
  do que uma linha**: a migração da versão anterior (`código por linha`)
  copiava o código do alvo para todas as suas linhas; se um alvo tivesse
  mais do que uma (ex.: SIM + IMEI, o cenário que motivou a funcionalidade),
  a criação do índice único falhava e a `prisma migrate deploy` ficava
  bloqueada a meio — o `docker-entrypoint.sh` nunca chegava a arrancar o
  Next.js, daí o "Bad Gateway". Nova migração idempotente desduplica os
  códigos dentro do mesmo alvo (sufixo `-2`, `-3`, ...) e completa o que
  tiver ficado por fazer, sem perda de dados. **Ver nota de recuperação no
  corpo do PR** — instalações já bloqueadas precisam de um passo manual
  único antes do próximo arranque.

## [0.5.63] — 2026-07-07

### Alterado
- **Estatísticas — arquivados e concluídos ficam fora por defeito**: o total e
  todas as repartições (estado, brigada, inspetor, natureza, ano, comarca,
  tribunal) deixam de incluir inquéritos Arquivados ou Concluídos por
  omissão — são "trabalho fechado" que poluía a análise de carga. Uma nova
  checkbox "Incluir arquivados e concluídos" (nos dois painéis, geral e
  pessoal) repõe-nos quando necessário. Os cartões-resumo "Arquivados" e
  "Concluídos" continuam sempre a mostrar a contagem real, independentemente
  do filtro.
- **Select "Período" com o dobro da largura**: nos painéis de Estatísticas
  (geral e pessoal), o texto "Período personalizado" deixa de aparecer
  cortado em ecrãs desktop.

### Adicionado
- **Distribuição por Comarca no perfil de inspetor**: a página "Estatística"
  pessoal (`/minha-estatistica`) ganha o mesmo gráfico + tabela "Por Comarca"
  que já existia no painel geral.

## [0.5.61] — 2026-07-07

### Alterado
- **Interceções — código por linha, não por alvo**: um alvo pode ter várias
  interceções (SIM, IMEI, ...), cada uma com o seu próprio código — deixou
  de existir um único código por alvo. O código é agora um campo obrigatório
  de cada linha (único dentro do alvo), aparece numa coluna própria nas
  tabelas e nas folhas Excel, e passa a estar ausente dos diálogos de alvo.
- **Painel de interceções (desktop)**: a subpágina de controlo por inquérito
  passa a ocupar o dobro da largura em ecrãs largos (`xl`).

### Adicionado
- **Acompanhamento por alvo**: cada alvo tem agora um campo de texto livre,
  sempre visível no cartão (sem precisar de abrir um diálogo), para o
  inspetor registar até onde já reviu as interceções e retomar dali na
  próxima vez. Grava-se de forma independente das restantes edições do alvo.

## [0.5.60] — 2026-07-07

### Corrigido
- **Registar produto de interesse**: os campos "Hora início" e "Hora fim"
  passam a incluir os segundos (`HH:mm:ss`), útil para registar a duração
  exata de chamadas. Os campos "De" e "Para" ficam sempre na mesma linha
  (lado a lado), com "De" já não a cair para baixo em ecrãs estreitos.

## [0.5.58] — 2026-07-05

### Adicionado
- **Interceções — relatório de transcrição**: novo botão "Transcrições" na
  subpágina de interceções que exporta em Excel **apenas os produtos marcados
  para transcrição** (worklist do transcritor), numa folha única com alvo,
  linha, data/hora, duração, de/para e descrição.
- **Página global "Interceções" agrupada por inquérito**: as linhas passam a
  estar organizadas por **inquérito** (NUIPC) e, dentro deste, **por alvo**, em
  vez de uma tabela plana.

### Corrigido
- **Horas de início/fim (mobile)**: no formulário de produto de interesse, os
  campos "Hora início" e "Hora fim" passam a **empilhar** (um por baixo do
  outro) em ecrãs estreitos, ficando lado a lado apenas a partir de tablets.

## [0.5.56] — 2026-07-04

### Corrigido
- **Diálogos de interceções em ecrãs baixos (mobile)**: nos diálogos de
  alvo, linha e produto de interesse, o cabeçalho e o rodapé (Guardar /
  Cancelar / fechar) passam a ficar **fixos**, com o corpo do formulário a
  **rolar internamente** — em vez de o diálogo ultrapassar o ecrã e arrastar a
  página de fundo. Corrige o caso em que o botão "Guardar" ficava inacessível
  no registo/edição de produtos de interesse em telemóveis.

## [0.5.54] — 2026-07-04

### Adicionado
- **Interceções — melhorias no controlo de escutas** (a partir do módulo da
  0.5.52):
  - **Marcar produtos para transcrição**: cada produto de interesse passa a ter
    uma opção "Marcar para transcrição" — na tabela mostra-se um selo
    "Transcr." e o estado acompanha o produto nas exportações.
  - **Duração do produto**: novo campo de duração (formato `mm:ss` ou
    `hh:mm:ss`), sobretudo útil para chamadas, apresentado junto às horas.
  - **Renovar a data de fim**: botão dedicado por linha que prorroga o prazo,
    conta o número de renovações (selo "N× renov.") e **reativa os avisos de
    fim** automaticamente para o novo prazo.
  - **Exportar em Excel (.xlsx)**: novo botão na subpágina de interceções que
    gera o ficheiro no formato do modelo de controlo de escutas — folha
    **"Alvos"** (um registo por linha) e uma folha **por código de alvo** com os
    produtos de interesse, incluindo as novas colunas (renovações, notas,
    duração, transcrição).
  - **Notas por alvo**: campo de notas livres do inspetor em cada alvo,
    distinto das observações, destacado no cartão do alvo.
  - A exportação CSV do inquérito passa a incluir as novas colunas (renovações
    e notas nos alvos/linhas; duração e transcrição nos produtos). As novas
    operações (renovação e exportação Excel) ficam no registo de auditoria.

## [0.5.52] — 2026-07-03

### Adicionado
- **Módulo Interceções (controlo de escutas)** — substitui o controlo em Excel:
  - **Por inquérito** (novo cartão no detalhe + subpágina "Controlo de
    Interceções"): registo de **alvos** (suspeito + código), **linhas
    intercetadas** (SIM/IMEI/outro, n.º telefone ou IMEI, operadora, datas de
    início e fim) e **produtos de interesse** (tipo — chamada, SMS, MMS, dados,
    localização, outro —, n.º de produto, direção, data e horas, de/para,
    resumo e comentários), com o registo paginado por alvo.
  - **Alertas de fim de prazo**: até **2 avisos por linha** (dias
    parametrizáveis; por defeito 10 e 3 dias antes do fim), verificados pela
    rotina diária, com notificação ao inspetor do inquérito (novo tipo
    "Interceção a terminar", configurável em Configurações → Notificações).
    Alterar a data de fim (ex.: renovação) ou os dias de aviso **reativa os
    alertas** automaticamente; linhas já vencidas sem aviso alertam uma vez.
  - **Página global "Interceções"** na navegação: todas as linhas dos
    inquéritos no âmbito do utilizador, com filtros (ativas / a expirar em 10
    dias / todas), urgência e ligação direta ao inquérito.
  - **Módulo opcional**: ativável/desativável em Configurações → Sistema →
    Módulos, com perfis com acesso configuráveis (ADMINISTRACAO tem sempre).
  - Exportação CSV do inquérito passa a incluir as secções "Interceções —
    Alvos/Linhas" e "Interceções — Produtos"; todas as operações ficam no
    registo de auditoria. O acesso segue o âmbito do inquérito (inspetor/
    brigada/coordenação). A página de impressão **não** inclui interceções
    (dados sensíveis — decisão deliberada); "contactos relevantes" e importação
    do Excel ficam para versões futuras.

## [0.5.50] — 2026-07-03

### Adicionado
- **Inquéritos por página**: na listagem de inquéritos, um seletor no fundo da
  página permite escolher quantos inquéritos são mostrados de cada vez — **20,
  50, 100 ou 250**. A escolha vai no URL (`?perPage=`), preserva os filtros
  ativos e repõe a 1ª página.
- **Perfil → Inquéritos por página**: cada utilizador pode **predefinir** o
  número de inquéritos por página, usado por defeito na listagem quando não há
  escolha explícita no seletor (recai em 20 se não for definido). Novo campo
  `Utilizador.inqueritoPageSizeDefault` (migração incluída), gravado via
  `/api/perfil` e auditado.

## [0.5.48] — 2026-07-03

### Alterado
- **Formulário de inquérito**: os seletores de **Crime** e **Estado** passam a
  ocupar a largura total (o de Crime igual ao campo "Crimes associados"; o de
  Estado igual aos campos de data na mesma grelha), em vez de se ajustarem ao
  conteúdo.
- **Formulário de inquérito**: o painel **Atribuição** passa a surgir antes do
  painel **Estado e Prazos**.
- **Pesquisa global (Ctrl/⌘ + K)**: a caixa de pesquisa passa a ter o dobro da
  largura em ecrã (de `max-w-sm` para `max-w-3xl`), mostrando mais resultados
  sem truncar.

### Corrigido
- **Formulário de inquérito**: os campos **Prazo** e **Data de conclusão**
  passam a mostrar as mensagens de validação (ex.: data anterior à de abertura),
  evitando submissões bloqueadas sem qualquer feedback visual.

### Removido
- **Minha estatística**: removido o gráfico **"Atividades realizadas"** (top de
  atividades registadas pelo inspetor no período). O detalhe por atividade
  continua disponível em **Estatísticas** (cartão "Atividades do Inspetor") ao
  filtrar por inspetor.

## [0.5.46] — 2026-07-02

### Corrigido
- **Transições automáticas — selects mostravam o ID**: nos seletores de estado
  de origem/destino da configuração, depois de escolher, o campo apresentava o
  identificador interno em vez do nome do estado. O `SelectValue` passa a
  resolver o id para o nome (mesmo padrão dos restantes seletores da app).

## [0.5.44] — 2026-07-02

### Adicionado
- **Transições automáticas de estado por inatividade**: um inquérito parado
  num estado de origem há mais do que um número de meses **parametrizável pelo
  administrador** — sem qualquer atividade nem mudança de estado nesse período
  — passa automaticamente para um estado de destino, notificando o inspetor
  (ex.: "Enviado" → "Arquivado" ao fim de 12 meses sem devolução/atividade).
  - Configura-se em **Configurações → Transições** (nova secção): origem
    (estado não-terminal), destino e meses de inatividade, com toggle ativa/
    inativa. Uma regra por estado de origem; respeita a máquina de estados.
  - A referência de inatividade é o mais recente de: a entrada no estado atual
    (reconstruída do histórico) e a última atividade (criação, realização ou
    devolução) — nunca arquiva algo com trabalho recente.
  - Corre numa **rotina diária** (worker às 07:30; também disponível via
    `POST /api/cron/auto-transicao` para cron externo). A transição fica no
    histórico do inquérito (Cronologia) e ao entrar num estado terminal
    regista a data de conclusão. Notificação nova: "Transição automática de
    estado" (configurável na tab Notificações).

## [0.5.42] — 2026-07-02

### Adicionado
- **Checklist por tipo de crime**: cada crime pode ter uma lista de
  diligências-padrão esperadas (configura-se na gestão de crimes, botão de
  checklist). No detalhe do inquérito aparece o cartão "Checklist do crime"
  com a completude (ex.: 1/3) — um item fica feito automaticamente quando
  existe uma atividade registada com o nome desse padrão, sem estado próprio
  nem duplicação. Alterações à checklist ficam no audit log.
- **Vista Kanban dos inquéritos** (`/inqueritos/kanban`, botão na lista):
  colunas pelos estados ativos (com a cor do catálogo e contagem), cartões
  com NUIPC, crime, inspetor e prazo (vencidos a vermelho; máx. 40 por
  coluna, com atalho para a lista filtrada). Arrastar um cartão muda o
  estado pelo fluxo já validado e auditado (`BULK_CHANGESTATE`) — disponível
  para Inspetor-Chefe (brigada), Coordenador e Administração; o Inspetor
  consulta em leitura. Estados terminais não recebem cartões (concluir exige
  data de conclusão; reabrir tem fluxo próprio com motivo).

## [0.5.41] — 2026-07-01

### Removido
- **Detalhe do inquérito — cartão "Linha do tempo de estados"**: era redundante
  com a Cronologia (que já intercala as mudanças de estado com as restantes
  fontes, incluindo autor e motivo de reabertura). A página fica só com a
  Cronologia; nenhuma informação se perde.

## [0.5.39] — 2026-07-01

### Adicionado
- **Possíveis conexões entre inquéritos (pelo denunciante)**: quando dois
  inquéritos partilham o NIF, o contacto telefónico ou o email do denunciante,
  a ligação passa a ser detetada automaticamente. O matching é tolerante a
  formatação ("123 456 789" ≡ "123456789"; "+351 912 345 678" ≡ "912345678";
  emails sem distinção de maiúsculas). Aparece em dois sítios:
  - **Detalhe do inquérito** — nova secção "Possíveis conexões" com os
    inquéritos coincidentes (e o campo que coincide); os já formalmente
    relacionados não repetem aqui.
  - **Formulário de criação/edição** — aviso não-bloqueante ao preencher o
    denunciante quando os dados já constam noutro inquérito.
  A visibilidade respeita o âmbito de leitura de cada perfil (um inspetor não
  vê coincidências fora do seu âmbito; chefe vê a brigada; coordenador tudo).

## [0.5.37] — 2026-07-01

### Corrigido
- **Calendários em modo escuro**: o fundo dos dias de fim-de-semana/feriado
  (âmbar) era impercetível no tema escuro (âmbar-950 a 20% sobre fundo quase
  preto). Passa a usar âmbar claro com transparência (âmbar-400 a 15%),
  claramente visível sem ofuscar; os dias fora do mês continuam sem tinta
  também no escuro.

### Adicionado
- **Cronologia do inquérito**: nova secção na página de detalhe que intercala,
  numa única linha temporal agrupada por dia, a abertura, as mudanças de
  estado, as atividades (com quantidade), as notas (excerto), os documentos
  anexados, as tarefas pessoais e as diligências do inquérito — do mais
  recente para o mais antigo. Reutiliza exatamente os dados/âmbitos que a
  página já mostra em secções separadas; inquéritos longos colapsam os dias
  mais antigos num "Mostrar mais".
- **"O meu dia" no dashboard**: bloco com os eventos de hoje e de amanhã
  (prazos de inquérito, atividades com prazo, controlos e diligências — mesma
  semântica e âmbito da Agenda), as tarefas pessoais em aberto (prioridade
  mais alta primeiro) e um aviso com o total de atrasados (prazos vencidos,
  atividades e controlos em atraso) com atalho para Prazos e Controlos.
  Oculto para o perfil Estatística (sem permissões operacionais).

## [0.5.35] — 2026-07-01

### Corrigido
- **Logo não-PNG na página de login**: o matcher do middleware só excluía os
  assets `.png`, pelo que um logo em SVG/WebP/JPG/ICO servido em `/branding/*`
  era apanhado pelo middleware e, por falta de sessão, redirecionado para
  `/login` — o logo não carregava no ecrã de login para utilizadores não
  autenticados. O matcher passa a excluir `branding/` por completo (os logos
  são públicos por definição). A proteção anti-XSS do SVG servido diretamente
  passa a ser garantida pela CSP `sandbox` da própria rota (abaixo), já que o
  middleware deixa de a cobrir.

### Segurança
- **Assets de branding (SVG)**: os ficheiros servidos em `/branding/*` passam a
  incluir uma `Content-Security-Policy` própria (`default-src 'none'; sandbox`)
  e `X-Content-Type-Options: nosniff`. Um logo SVG (upload só-admin) servido na
  mesma origem poderia executar script se fosse navegado diretamente. Com o
  `branding/` fora do middleware, esta política local ao recurso é agora a
  proteção primária desse caminho. Não afeta a renderização do logo como
  `<img>` — só o acesso direto ao ficheiro.

## [0.5.33] — 2026-07-01

### Corrigido
- **Detalhe do inquérito — botões no mobile**: os botões de ação (CSV, PDF,
  Editar, Marcar doc. pendente, Reabrir, Eliminar) já não ficam cortados/fora
  do ecrã em ecrãs estreitos — o cabeçalho passa a empilhar o título e os
  botões verticalmente no mobile (lado a lado a partir do breakpoint `sm`).

### Alterado
- **Notas**: a lista deixa de mostrar o conteúdo das notas de imediato — mostra
  apenas o NUIPC (com contagem e data da última atualização); as notas só
  aparecem ao expandir esse inquérito. Durante uma pesquisa ativa, os
  resultados aparecem sempre expandidos, para não esconder o próprio resultado.
- **Calendários**: os dias de fim-de-semana e feriados nacionais passam a ter
  um fundo âmbar distinto em todos os calendários da aplicação (Ausências,
  Agenda, Prazos e Controlos), reutilizando `isWorkingDay` — sem alterar as
  restantes marcações (dots de eventos/urgência) já existentes em cada um.

## [0.5.31] — 2026-06-30

### Corrigido
- **Histórico de alterações — nomes em vez de IDs**: no histórico de um
  inquérito (e na página global de auditoria), campos de referência como
  **Crime**, **Tribunal / M.P.** e **Secção** (e outros: Inspetor, Brigada,
  Comarca) passam a mostrar o **nome** da entidade em vez do id em bruto
  (ex.: `cmpnzvpd4004i01qf2lye5nn0`). A resolução é feita na leitura, por isso
  também corrige entradas já registadas anteriormente (não só as novas). Os
  campos "Tribunal" e "Secção" também ganharam rótulo — antes apareciam como
  `tribunalId`/`seccaoId` em vez do nome do campo.

## [0.5.29] — 2026-06-30

### Adicionado
- **Ausências**: a lista **"Marcações de {ano}"** passa a mostrar a **nota** de
  cada marcação que a tenha. O Gantt anual de cada inspetor (cartão **"Ausências
  {ano}"**, antes "Férias") passa a incluir também as **Folgas** (a amarelo,
  além das férias a azul), com legenda.
- **Estatística do inspetor**: novo cartão de **inquéritos vencidos** (prazo
  ultrapassado) e novo gráfico **"Atividades realizadas"** com as atividades
  registadas pelo próprio inspetor no período (top 10 por número de registos).
  Estes dados já eram calculados mas não eram apresentados.

## [0.5.27] — 2026-06-29

### Corrigido
- **Notificação de atribuição na criação**: ao criar um inquérito já distribuído
  a um inspetor, este passa a receber a notificação **"Inquérito atribuído"**. Até
  agora a notificação só era enviada quando a atribuição era feita mais tarde (na
  edição); na atribuição feita no próprio ato de criação não chegava nada ao
  inspetor. Quem se atribui a si mesmo não recebe a própria notificação, mas os
  destinatários configurados em CC continuam a ser avisados.

## [0.5.25] — 2026-06-29

### Corrigido
- **Ajudas de custo — entradas entre dois meses**: uma entrada cujo intervalo
  atravessa a fronteira de dois meses (prevenção passiva, ou um turno de horas
  extra que vira a meia-noite no fim do mês) passa a aparecer na lista de
  **ambos** os meses — no mês de início como entrada própria e, nos restantes
  meses que abrange, em modo só-leitura, marcada como «outro mês». Antes só era
  visível no mês de início. No caso das horas extra, as horas do mês seguinte
  deixavam de ser contadas (na lista **e** no total desse mês); passam agora a
  contar. Em cada mês, a duração e o valor apresentados correspondem apenas aos
  dias/horas desse mês, e a exportação em PDF passa também a incluir estas
  entradas.

## [0.5.22] — 2026-06-29

### Alterado
- **Estatística Mensal**: a matriz de atividades passa a mostrar **apenas as
  atividades com ocorrências no período** (as linhas a zero são escondidas,
  para a tabela ficar mais legível). A tabela **"Detalhe por inquérito"** passa
  a incluir o **inspetor titular** de cada inquérito (também no envio por
  e-mail).

## [0.5.20] — 2026-06-29

### Adicionado
- **Integridade dos anexos (SHA-256)**: cada documento passa a guardar o
  **SHA-256** do conteúdo, calculado no upload. Na lista de anexos é possível
  **verificar a integridade** de cada documento (recalcula o hash do ficheiro
  em disco e compara com a referência), com resultado claro: íntegro, **alterado**
  ou sem hash de referência (documentos anteriores). O hash é mostrado (com
  cópia rápida) e as **transferências e verificações ficam registadas no log
  de auditoria** (cadeia de custódia). Migração `add_documento_sha256`.

## [0.5.18] — 2026-06-29

### Removido
- **Prazos legais inteligentes** (introduzidos em 0.5.16): por não se enquadrarem
  no objetivo da aplicação, foram removidos o cálculo do prazo legal, a secção e
  as prorrogações no detalhe do inquérito, o digest semanal e as definições em
  Configurações → Sistema. Migração `remove_prazo_legal_prorrogacoes` larga a
  tabela `ProrrogacaoInquerito` e as colunas `prazoLegalMeses`/`prazoLegalAlertaDias`.
  O **backup dos anexos** (também de 0.5.16) mantém-se.

## [0.5.16] — 2026-06-29

### Adicionado
- **Backup dos anexos**: o backup passa a incluir um arquivo companion
  (`*.files.tar.gz`) com os ficheiros do `DOCUMENTOS_DIR` sempre que existirem,
  com a mesma retenção do dump SQL; o restauro repõe-nos automaticamente. O
  `pg_dump` cobria apenas a base de dados.
- **Prazos legais inteligentes**:
  - Cálculo do limite legal de cada inquérito (data de abertura + duração-base
    configurável + prorrogações), com secção no detalhe que mostra a data, os
    dias em falta / de atraso, e permite **registar/remover prorrogações**
    (cada uma com despacho e autor).
  - **Digest semanal** (segunda-feira, 08:00): notifica cada inspetor titular,
    de forma agrupada, dos seus inquéritos com prazo legal a vencer (dentro do
    limiar) ou já ultrapassado.
  - Definições configuráveis pelo administrador em Configurações → Sistema:
    duração-base (meses) e antecedência do aviso (dias). Migração
    `add_prazo_legal_prorrogacoes`.

## [0.5.14] — 2026-06-28

### Adicionado
- **Exportação completa do inquérito**: o CSV de um inquérito (botão CSV no
  detalhe) passa a incluir, além dos metadados e atividades, secções de
  **Controlos** (com nº de realizações feitas/total e próxima data esperada) e
  de **Diligências** (tipo, datas, local, estado). *(Os intervenientes/pessoas
  serão incluídos quando esse modelo existir.)*
- **Análise — carga e antiguidade** (em Estatísticas → Análise, chefe+):
  - **Carga por inspetor**: nº de inquéritos ativos por inspetor titular, com
    contagem dos que estão com prazo vencido.
  - **Antiguidade dos inquéritos ativos**: distribuição por escalões de idade
    (há quanto tempo abertos: <30 dias, 30–90, 90–180, 180–365, >1 ano).
  - (As tendências mensais abertos/concluídos já existiam.) Respeita o âmbito
    por brigada.

## [0.5.12] — 2026-06-28

### Alterado
- **Documentação pendente** passa a ser **privada do autor**: cada utilizador só
  vê na página (e no badge do detalhe) as marcas que ele próprio criou. A página
  deixa de usar o âmbito por role e filtra pelo autor da marca; o badge/realce no
  detalhe do inquérito só aparece a quem o marcou (aos restantes o inquérito surge
  como não-marcado). Migração `add_documentacao_pendente_por` (coluna
  `documentacaoPendentePorId`, relação ao utilizador, índice). O autor pode sempre
  resolver/editar a sua própria marca, mesmo sem permissão de edição do inquérito.

## [0.5.10] — 2026-06-26

### Adicionado
- **Documentação pendente**: é possível marcar um inquérito como tendo
  documentação por juntar (caso típico: o inquérito já foi enviado/concluído mas
  chega documentação que tem de ser anexada a posterior). A marca tem uma nota
  opcional do que falta e regista automaticamente desde quando está pendente.
  - Marcação rápida no **detalhe do inquérito** (com nota), também disponível
    com o inquérito já concluído, e *badge* "Documentação pendente". Igualmente
    presente no formulário de criação/edição.
  - Nova página **Documentação Pendente** que lista todos os inquéritos
    marcados (âmbito por role), com a nota, desde quando, e ação
    **"Marcar como junta"**.
  - Migração `add_documentacao_pendente` (campos `documentacaoPendente`,
    `documentacaoPendenteNota`, `documentacaoPendenteDesde` + índice).

## [0.5.8] — 2026-06-25

### Adicionado
- **Estatística Mensal — detalhe por inquérito**: por baixo da tabela
  agregada passa a haver uma nova tabela que lista, para cada inquérito
  (NUIPC) do período, as atividades realizadas e respetiva quantidade
  (ex.: "no inquérito X foram feitas 3 constituições de arguido"). O NUIPC
  liga ao detalhe do inquérito e a coluna **Brigada** só aparece quando há
  mais do que uma brigada em vista. Respeita o âmbito por role (INSPETOR_CHEFE
  vê apenas a sua brigada) e exclui inquéritos eliminados.
- **Botão "Enviar por e-mail"** na Estatística Mensal: abre um novo e-mail no
  cliente predefinido (Outlook, no ambiente corporativo) já preenchido com o
  período no assunto e, no corpo, o resumo por atividade e o detalhe por
  inquérito — para o utilizador rever e remeter posteriormente. Se o conteúdo
  exceder o limite de tamanho do `mailto:`, o texto é copiado para a área de
  transferência (com aviso) em vez de o clique falhar em silêncio.

## [0.5.6] — 2026-06-24

### Corrigido
- **Agenda**: deixam de aparecer controlos e diligências ligados a inquéritos
  **eliminados** (soft-delete) — a agregação passa a filtrar `inquerito.deletedAt`
  nas duas fontes, mantendo os controlos/diligências sem inquérito associado
  (alinhado com o que já acontecia nos prazos de inquérito e atividades).

## [0.5.4] — 2026-06-24 — "Agenda / Diligências"

### Adicionado
- **Módulo Agenda** (ativável/desativável pelo administrador em Configurações →
  Sistema, com roles configuráveis) — vista de calendário mensal que reúne, no
  mesmo sítio: prazos de inquérito, atividades com prazo, controlos e
  **diligências** (datas de tribunal: julgamentos, inquirições, buscas,
  interrogatórios, reconstituições, reuniões).
- **Modelo `Diligencia`** (migração `20260624134752`) com tipo, datas de
  início/fim, local, observações e ligação opcional a um inquérito. CRUD em
  `/api/diligencias` (criar/editar/eliminar pelo criador ou admin), gated pelo
  módulo.
- **Página `/agenda`** com calendário (react-day-picker), pontos coloridos por
  tipo de evento, lista do dia/mês e diálogo para criar/editar diligências
  (com pesquisa de inquérito por NUIPC).
- `src/lib/agenda.ts` (`getAgendaEvents`) agrega as 4 fontes com o âmbito por
  role; `buildDiligenciaWhere` define a visibilidade das diligências
  (read-all → todas; chefe → brigada; inspetor → próprias/dos seus inquéritos).

### Testes
- 4 testes de integração (agregação das 4 fontes, intervalo do mês, âmbito das
  diligências) + 1 teste E2E.

## [0.5.2] — 2026-06-24

### Alterado
- **Dashboard (chefe e superiores)** passa a mostrar os 8 contadores da página
  de Estatísticas (Total, C. Precatórias, Ativos, Sem inspetor, Distribuídos,
  Aguarda Exames, Enviados, Arquivados) em vez dos 4 anteriores. O INSPETOR
  mantém os 4 cartões essenciais. Os contadores foram extraídos para
  `src/lib/estatisticas-counters.ts` (`getInqueritoCounters`), agora a fonte
  única usada tanto pelo Dashboard como por `/api/estatisticas`, garantindo
  valores idênticos. O âmbito por role é respeitado (chefe → sua brigada).

## [0.5.0] — 2026-06-24 — "Pesquisa, ligações e CSP por nonce"

### Adicionado
- **Pesquisa global / paleta de comandos (⌘K / Ctrl+K)** — campo de pesquisa
  no header e atalho de teclado que navegam para qualquer página acessível e
  pesquisam inquéritos por NUIPC, NAI, denunciante (nome/NIF) e etiqueta.
  Endpoint `GET /api/search`, scope-locked por role. `filterNavItems` passa a
  ser a fonte única da visibilidade da navegação (sidebar, bottom-nav, paleta).
- **Pesquisa full-text em notas, atividades e documentos** — `to_tsvector` +
  `websearch_to_tsquery` em Português (com stemming) para notas e atividades,
  e por nome de ficheiro para documentos. Índices GIN de expressão (migração
  `20260623150000`). A segurança é aplicada em duas fases: match em SQL →
  re-filtragem com scope por role no Prisma.
- **Ligação entre inquéritos (apensos/conexões)** — modelo `InqueritoRelacao`
  (migração `20260623234310`) com tipos RELACIONADO/APENSO/CONEXO. A relação é
  simétrica e respeita o âmbito do utilizador. Secção "Inquéritos relacionados"
  no detalhe, com pesquisa por NUIPC, tipo e nota.
- **Testes E2E (Playwright)** — fluxos de login, rotas protegidas e paleta de
  comandos; workflow de CI dedicado (`.github/workflows/e2e.yml`).

### Alterado
- **Content-Security-Policy baseada em nonce** — `script-src` deixa de usar
  `'unsafe-inline'`: o middleware gera um nonce por pedido com `'strict-dynamic'`
  e o Next.js aplica-o aos seus scripts (e o next-themes ao seu script inline).
  `style-src` mantém `'unsafe-inline'`. As respostas de API passam a ter uma CSP
  mínima `default-src 'none'`. O middleware passa a cobrir também /login e
  /password-reset.

### Testes
- 11 testes de integração novos (pesquisa full-text/scope, ligações simétricas/
  scope) + 5 testes E2E. 

## [0.2.0]

### Adicionado
- **Auto-atualização via GitHub Releases** (`/configurações` → Atualizações,
  admin-only) com backup automático + rollback em caso de falha.
- **Personalização (Aparência)** — nome, descrição, logos claro/escuro e
  favicon configuráveis pelo admin.
- **Seleção múltipla em mobile** na lista de inquéritos (long-press ou botão
  "Selecionar") para aceder às bulk actions, incluindo transferência de
  brigada.
- **Workflow de release** (`.github/workflows/release.yml`): publica uma
  GitHub Release automaticamente quando a versão em `package.json` sobe em
  `main` — é o que permite às instâncias deployed detetarem novas versões.

### Corrigido
- Entrypoint Docker corrige ownership dos bind mounts (`./backups`,
  `./branding`, `./control`) antes de dropar privilégios — resolve o
  "Permission denied" no backup agendado.
- Eliminação de utilizador sem histórico passa a remover mesmo o registo
  (em vez de só desativar com mensagem enganosa).
- Vários fixes de hydration, integridade de dados (atividades de inquéritos
  soft-deleted) e validação de inputs.
- Acessibilidade mobile: touch targets 44px, filtros responsivos, zoom
  desbloqueado, gráficos de estatística na vertical.

### Adicionado (antes do 0.2.0)
- **Tab "Notificações" em /configurações** (apenas ADMINISTRACAO). Para
  cada `TipoNotificacao` o admin escolhe: in-app on/off, email on/off, e
  roles em CC adicionais.
- **`model NotificationPolicy`** no schema — uma row por tipo. Aditiva,
  sem dataloss.
- **Seed idempotente** que cria a row faltante para cada valor do enum.
  Defaults reproduzem o comportamento pré-refactor (in-app + email on,
  ccRoles vazio; excepto `BACKUP_FALHOU` que arranca com
  `ccRoles=['ADMINISTRACAO']`).
- **`src/lib/notification-labels.ts`** — labels + descrições + flag
  `hasNaturalRecipient` centralizados. Refactor de
  `notificacoes-list.tsx` e `notification-bell.tsx` para reusar (fix
  lateral: faltavam labels para `BACKUP_FALHOU` e
  `ATIVIDADE_PRAZO_APROXIMANDO`).
- **`/api/notification-policies`** (GET + PUT, ambos gated por
  `sistema:config`). PUT em transação Prisma única, invalida cache,
  escreve audit `UPDATE_NOTIFICATION_POLICIES` com diff per-tipo.
- **18 testes novos** (6 unit + 12 integration). Total **101 testes**.

### Alterado
- **`src/lib/notifications.ts` reescrito em torno de `applyPolicy()`**:
  função central com cache de 60s da policy, constrói destinatários
  (natural + CC roles, deduplicado), envia in-app/email consoante a
  policy. Todos os helpers (`notifyAtividadeAdicionada`,
  `notifyBackupFailed`, `notifyInqueritoAtribuido`,
  `notifyInqueritoTransferido`, `notifyAtividadePrazo`,
  `createNotification`) passam a delegar.
- Call-sites em `src/app/api/{cron,atividades,inqueritos}/*` simplificados
  — deixaram de passar `inspetorEmail`/`brigadaOrigemChefeEmail`/etc.
  (resolvidos pelo `applyPolicy` a partir do `naturalUserId`).
- `notifyBackupFailed` deixou de iterar admins inline; depende agora da
  policy `BACKUP_FALHOU.ccRoles`.

### Corrigido
- Mapas locais de labels em `notificacoes-list.tsx` e
  `notification-bell.tsx` estavam incompletos — agora cobrem os 7 tipos
  via `notification-labels.ts`.

---

## [0.9.5] — 2026-05-21 — "Hardening de auth"

Sprint #2 — endurecimento das camadas de autenticação e da pilha
HTTP da aplicação. 23 testes novos (total 83).

### Adicionado
- **Rate limiting in-memory** (`src/lib/rate-limit.ts`) — sliding-window,
  por chave, sem dependências externas. Helpers `checkRateLimit`,
  `enforceRateLimit`, `clientFingerprint`. Limites canónicos em
  `src/lib/constants.ts → RATE_LIMITS`.
- **Endpoints sensíveis protegidos**:
  - `/api/relatorios/[id]` (export CSV/MD/PDF) — `REPORT_EXPORT`
  - `/api/backups/upload` — `HEAVY_OPERATIONS`
  - `/api/backups/[filename]/restore` — `HEAVY_OPERATIONS`
  - `/api/inqueritos/import` — `HEAVY_OPERATIONS`
  - `/api/auth/password-reset/request` — `PASSWORD_RESET_REQUEST` (3/IP/10min)
  - `/api/auth/password-reset/confirm` — `PASSWORD_RESET_CONFIRM`
- **Security headers** em `next.config.ts` — HSTS, X-Frame-Options DENY,
  X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin,
  Permissions-Policy, Content-Security-Policy (script-src e style-src
  ainda com 'unsafe-inline' por exigência do Next.js — TODO para
  v1.0: nonce-based via middleware).
- **Password reset self-service** end-to-end:
  - `model PasswordResetToken` no schema (tokenHash SHA-256, expiresAt,
    usedAt, ip, userAgent).
  - `src/lib/password-reset.ts` — `generateResetToken`,
    `requestPasswordReset`, `consumePasswordReset`,
    `cleanupExpiredResetTokens`. Token de 32 bytes (base64url), TTL 1h,
    single-use. Hash SHA-256 em DB.
  - `POST /api/auth/password-reset/request` — sempre 200 (não-enumeração).
  - `POST /api/auth/password-reset/confirm` — bump de tokenVersion
    invalida sessões activas.
  - UI: `/password-reset` (form de pedido) e `/password-reset/[token]`
    (form de confirmação). Link "Esqueci a password" no login.
  - Audit log: `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`.
- **Structured logging** com pino (`src/lib/logger.ts`) — JSON em
  produção, pretty em dev. Redact automático de `password`,
  `passwordHash`, `token`, `tokenHash` em qualquer profundidade.
  Substitui `console.*` em `src/lib/cron.ts` e `src/app/api/cron/*`.
- **`.dockerignore`** — evita levar `node_modules`/`.next` do host
  para o contexto de build, evitando "invalid file request" em
  symlinks de `.bin/`.

### Testes
- `tests/unit/rate-limit.test.ts` — 11 testes (sliding window,
  isolamento de chaves, 429 com Retry-After, etc.).
- `tests/integration/password-reset.test.ts` — 12 testes (token gen,
  request flow, consume flow, expired/used/invalid/weak rejection,
  cleanup, normalização de email).

### Notas
- `next.config.ts` deixou de ser stub-only — agora exporta `headers()`.
  Se algum integrador override-ar este ficheiro, copiar a função.
- A política CSP actual permite inline scripts (Next.js precisa para
  hydration). Apertar para nonce-based fica para v1.0 quando vamos
  introduzir middleware com `crypto.randomBytes`.
- O logger emite para stdout. Em produção, redirecionar para um
  agregador (loki/journald/cloudwatch) ao gosto.

---

## [0.9.0] — 2026-05-21 — "Testabilidade + CI"

Primeira versão com cobertura de testes automatizada. Marca o início do
caminho para a v1.0.

### Adicionado
- **Vitest** + dependências de teste (`@vitest/coverage-v8`, `vitest-mock-extended`).
- **38 testes unitários** (RBAC, role-scope, formatters CSV/Markdown).
- **22 testes de integração** contra o Postgres de teste:
  - 7 testes de regressão para o bug crítico de scope-bypass via URL injection (`tests/integration/scope-bypass.test.ts`).
  - 11 testes do audit log (`writeAudit`, `diff`) e dos handlers de Relatórios.
  - 4 testes script-level do `scripts/backup.sh` (integridade, retenção por prefixo, fail-modes).
- **GitHub Actions workflow** (`.github/workflows/ci.yml`) — lint, build, test em cada PR. Provisiona Postgres 16 como service, instala `postgresql-client` para os testes de backup, corre `shellcheck` nos scripts.
- **`src/lib/role-scope.ts`** — extracção das funções puras de scope-locking (`buildInqueritoWhere`, `buildAtividadePrazoWhere`, `canEditInquerito`) para um módulo sem dependências de NextAuth. `auth-helpers.ts` re-exporta para manter os call-sites estáveis.
- **`Dockerfile.test`** — imagem `gpi-test:local` com `pg_dump`/`flock` para correr a suite localmente fora do contentor da app.
- **Documentação**:
  - `tests/README.md` — como correr, setup do test DB, convenções, gaps roadmap-v1.0.
  - `CHANGELOG.md` (este ficheiro) — convenção Keep-a-Changelog.

### Corrigido
- **Bug crítico de scope-bypass** (segurança): INSPETOR_CHEFE conseguia consultar dados de outras brigadas passando `?brigadaId=<outra>` na URL. A correcção foi aplicada em 4 locais:
  - `src/lib/relatorios/inqueritos.ts`
  - `src/app/api/inqueritos/route.ts`
  - `src/app/api/inqueritos/export/route.ts`
  - `src/app/(dashboard)/inqueritos/page.tsx`
  - Padrão: `...roleWhere` agora é espalhado **por último** no objecto `where` do Prisma, garantindo que as chaves do scope-locking têm precedência sobre as do URL.
  - Regressão coberta por 7 testes em `tests/integration/scope-bypass.test.ts`.

### Notas
- Cobertura inicial focada em endpoints sensíveis e funções puras. Componentes React, E2E, Restore script e Worker cron são deliberadamente deixados para v0.9.x / v1.0 (ver `tests/README.md` → "O que NÃO está coberto").

---

## [0.8.x] e anteriores

Versões pré-changelog. Histórico completo no git log até este commit.

Funcionalidades já existentes:
- Auth + RBAC (5 roles)
- Inquéritos CRUD + soft-delete + audit log per-entity
- Atividades CRUD + concluir/reabrir + categoriaDashboard
- Catálogos geríveis: Crime, EstadoInquerito, AtividadePadrao
- Brigadas + Utilizadores CRUD
- Dashboard parametrizável (Aguarda Exames, Enviados)
- Estatísticas e Estatística Mensal (CSV + Markdown)
- Relatórios v1: Listagem de inquéritos, Resumo por brigada, Resumo por inspetor (CSV/MD/PDF)
- Backup/restore com maintenance mode, agendamento auto-reload, notificação ADMINISTRACAO em falhas
- Bulk import (CSV preview + commit)
- Bulk operations (assign, transfer, changestate)
- Notificações in-app + email opt-in
- Print view + export por inquérito
- Denunciante + tribunal data
