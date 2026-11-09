# Escritório completo

O andar inteiro, com os bots sentados nos postos usando o modelo aprovado no estúdio.

| Modo         | URL                                       | O que mostra                                                             |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| Frota real   | `/?escritorio=completo`                   | Os bots que o Hermes reporta, com ids, nomes e estados dele              |
| Demonstração | `/?escritorio=completo&modo=demonstracao` | Os sete bots de referência, com o rótulo **Demonstração** sempre visível |

O servidor local costuma ficar em `http://127.0.0.1:5198`. O painel clássico (`/`) tem o
link **Escritório completo**. A cena antiga, `/?prototipo=engenharia` e `/personagens.html`
continuam iguais e não carregam nada desta página.

## O que é real e o que é demonstração

- **Demonstração:** não monta a conexão com o Hermes, então não há polling, sessão nem
  mensagem. Nenhum estado é inventado: o painel do bot diz quem ele é, onde senta e que nada
  está em execução.
- **Frota real:** nome, cargo e estado vêm da frota. Clicar num bot abre a gaveta que já
  existia, com sessões e chat, mas sem a aba Personagem, porque ela mexe nas figuras antigas.
- **Sem conexão:** a página avisa, deixa as cadeiras vazias e oferece **Ver demonstração**,
  **Tentar de novo** e **Configurar conexão**. Ela nunca preenche sozinha. Depois de 6 s sem
  resposta, deixa de dizer "conectando".
- **Todos os modos:** a pose sentada e a respiração são iguais para qualquer estado. Só o
  rótulo muda com o estado, então "trabalhando" não tem animação própria e `SitDown` não é
  digitação. As telas dos monitores são cenário e não mostram dado de bot.

## Primeiro carregamento

A vista inicial é o prédio fechado, e ela não usa nada de dentro dos andares. Por isso:

- **Texturas, personagens e robô vêm depois**, um arquivo por vez, quando o navegador está folgado (`idleQueue.ts`). Quem abre direto num andar, ou a frota real, espera as texturas como sempre.
- **As texturas do escritório são WebP de 512 px** em `public/escritorio/texturas/`: 225 KB no lugar de 3,1 MB, sem diferença visível nesta câmera. As de 1k em `public/prototipo/` são do protótipo da Engenharia.
- **Os retratos da barra lateral ficam guardados no navegador** (`portraitCache.ts`). Mudou como o retrato é desenhado: suba `PORTRAIT_CACHE_VERSION`.
- **`pnpm demo` serve o build de produção**, que é o que mostra o peso real: em servidor de desenvolvimento são 31 MB de JavaScript em 138 arquivos, contra 477 KB em 17. Para mostrar a alguém, use ele; `pnpm dev` é só para programar.

`pnpm qa:primeiro-load` prova tudo isso.

## Dia e noite

O céu e as luzes seguem o relógio de Brasília (`America/Sao_Paulo`): noite das 18h às 5h, dia das
6h às 17h, com uma hora de transição em cada ponta. A cena relê o relógio a cada 30 s. De dia o
céu clareia, o sol sobe de intensidade, a exposição aumenta e as janelas acesas da cidade e da
fachada apagam; à noite é a cena de sempre. `?hora=HH:MM` fixa a hora para conferir qualquer
momento. Tudo em `src/world/office/dayCycle.ts`. O esconderijo ignora a hora: lá é sempre noite.

## O prédio (só na demonstração)

A demonstração abre com a torre do Lipp HQ fechada, na cidade. O seletor discreto no canto (ou
apontar e clicar no pavimento na fachada, ou PageUp/PageDown, ou `?andar=` na URL) abre o corte
de um andar. Só o andar em tela tem móveis e personagens; a fachada é uma malha leve. A frota do
Hermes não tem nada disso: fica no escritório, sem seletor, cidade nem fachada.

**O andar em tela fica sempre em y = 0; é o entorno que desce.** A cidade e os pavimentos abaixo
do corte ficam num grupo em `y = -elevação` (`BuildingSurroundings`).

- _Por quê:_ `worldToScreen`, o raio do clique, `roomAt`, cadeiras, voos e o mapa de sombra são
  todos escritos para o chão em y = 0. Mover a câmera ou o andar para a altura real obrigaria
  cada um deles a aprender um deslocamento, com risco de divergência entre o que se vê e o que
  se clica.
- _O custo:_ tudo o que é da rua precisa descer junto, inclusive o carro do chefe, que vive fora
  do grupo por causa do roteiro, o helicóptero dele e o limite da cidade, que encolhe do lado para onde o chão anda
  na tela (`cityBoundsAt`). A cidade só recebe sombra com o chão colado no andar.
- _Viagem:_ entre 480 e 650 ms, com a cena sempre em tela e no mesmo Canvas. O prédio fica parado
  e quem anda é o corte (`floorTravel.ts`): sair de um andar é erguer a fachada em volta dele até uma
  laje fechá-lo, passar pela torre e, em cima do andar novo, baixar a fachada com a laje abrindo.
  Assim só um andar fica à mostra por vez, e a troca acontece com a laje fechada: nenhum piso
  flutua ou atravessa outro, e nada é fatiado no meio dos móveis.
  - A âncora (o que fica em y = 0) é o andar à mostra e só muda com a laje fechada, junto com a
    câmera: a sombra do andar continua valendo a viagem inteira, sem refazer quadro a quadro.
  - Câmera e chegada usam o `goal` de cada quadro: gaveta aberta ou tela redimensionada no caminho
    mudam o destino sem salto. Outro pedido no meio parte do ponto em que está, sem fila e sem
    cronômetro; voltar ao andar que ainda está à mostra só desfaz o que andou.
  - Na viagem a cena não responde a ponteiro e os rótulos saem do Tab; a barra lateral e o seletor
    continuam respondendo. URL (`replaceState`), seletor e seleção valem na hora, sem navegar.
  - Movimento reduzido: troca na mesma ação, sem quadro no caminho.
  - Os andares fora de tela ficam desmontados; modelos e peças já estão à mão desde a abertura.

Os **andares de expansão** (pavimentos 2 a 5) são salas reservadas para as próximas equipes, e a
etiqueta do andar diz que o que se vê é cenário simulado. Não têm nome de equipe, bot, sessão nem
ação. Tudo vem da tabela em `officeExpansion.ts`: zonas, mobília e figurantes por andar, com id de
zona levando o andar na frente. Para uma equipe ocupar um andar, é só trocar a tabela. Bancadas
abertas (2), células e reunião (3), oficina e mesas redondas (4), cabines e jardim (5). A malha só é
montada na primeira visita ao andar, e o seletor junta os quatro numa linha só.

Os **figurantes** são de 4 a 5 por andar, com a mesma figura e as mesmas peças das Pessoas, cada um
com aparência própria. Só compõem a cena, como a atendente: não entram em Pessoas, não clicam e não
recebem comando, e só existem com o andar deles à mostra. Sentam em cadeira de verdade, no lugar de
uma cadeira fixa da mobília, e só esse lugar ganha laptop, monitor ou papel. Só há figurante virado
para a câmera, para o rosto aparecer. A etiqueta "Figurante · cenário" só aparece com a sala apontada
ou em foco, para a cena não virar uma lista de nomes.

A **torre** tem 14 pavimentos: Térreo (0), Operação (1), expansões (2 a 5), Diretoria (13) e 7 só de fachada, que
não clicam nem têm sala (`decorativeLevels`). A arquitetura é art déco própria do Lipp HQ: base
de dois pavimentos com colunas duplas e friso de bronze, pilastras e janelas estreitas na
vertical, e coroa de três degraus com agulha discreta.

- **Recuo só acima da última laje.** A Diretoria é o andar inteiro, e recuar antes faria os móveis
  vazarem da fachada.
- **O corte vale por construção.** Cada detalhe entra no intervalo de vértices do seu pavimento e
  nunca passa da laje dele; só a coroa passa, e ela vem depois de todos. O teste confere isso.
- **Para um pavimento de fachada virar andar reservado:** entra em `EXPANSION_FLOORS`. Um andar novo de outro tipo entra em `FloorId`, `FLOOR_LEVEL`, `FLOOR_LABEL` e
  `viewRooms`, com a caixa dos elevadores e o interior. A fachada não muda.
- **A cidade cresceu para o fundo** (`CITY_BOUNDS`): do alto da torre se vê mais chão, e sem isso o
  limite da cidade cortaria a coroa no enquadramento. O fit exterior prioriza a torre completa,
  inclusive em telas largas e baixas; o limite da cidade só restringe a câmera livre.
- **A cidade segue a torre** (`cityPlan`): mesmo pavimento de 3,4 m, quarteirões e ruas sem passo
  fixo, praças em ordem e massa mais alta nos dois ombros da torre, com um vale atrás da coroa, nunca
  acima do corpo dela. Na frente, `occlusionCap` limita a altura pelo que esconderia o lote na câmera
  fixa. São 33 mil vértices numa chamada de desenho; o teste trava em 45 mil.
- **A linguagem da cidade é noturna e vertical, e continua limpa:** quatro tons de ardósia mais escuros
  que a pedra da torre, teto de uma cor só, cinco tipologias (`styleOf`) com recuos e coroas só onde a
  câmera não as põe na frente do lote. As fachadas são rasgos de vidro entre pilastras, com uma faixa
  por pavimento no múltiplo do chão, que alinha de um prédio a outro. A luz acende um andar inteiro ou
  uma coluna, com mais prédios apagados quanto mais longe, e de dia a malha acesa nem é desenhada.
- **Três marcos e um trilho:** relógio e cúpula ladeiam a torre na tela, o mastro fica na linha do céu
  (`LANDMARKS`), e duas linhas elevadas cruzam o primeiro plano nos cantos (`elevatedLines`), com pilares
  só no meio de quarteirão, porque os carros atravessam as esquinas. Nada passa da última laje da torre.
- **A névoa é um uniforme** (`cityHaze.ts`): a cor do ar vem de `skyFor`, então a mesma cidade se dissolve
  em azul à noite, em cobre no entardecer e em céu claro de dia, sem refazer malha. É por pixel, mais
  densa perto do chão: os topos altos saem dela. `pnpm qa:cidade` fotografa as três horas para comparar.

O **térreo** é a porta do prédio: recepção, elevadores, lounge e café, com a rua à vista. A
atendente é cenário, com etiqueta que diz isso: não está em Pessoas, não clica e não recebe
comando.

Os **elevadores** continuam desenho: quem muda de andar é o seletor. Mas a porta leva a algum lugar.
A caixa (`ELEVATOR_CORE`) fica atrás da parede do fundo, fora da laje, com a mesma planta nos três
andares: recuo, porta, poço com trilhos e contrapeso, e uma cabine parada em cada andar, de um poço
diferente. Fora da laje para que nenhuma sala, posto ou móvel tivesse de mudar, e o escritório da
frota real segue idêntico, com a parede inteira. A parede é vazada de verdade, com a verga em
2,65 m: mais baixa, ela cobriria o topo da porta nesta câmera a 30°.

A **Diretoria** é o último pavimento. O chefe fica na sala de canto, que tem mesa, reunião privada
e lounge, e é o único ali com gaveta. As duas figuras simuladas são cenário, como a atendente:
etiqueta explícita, nenhuma função, nenhum clique.

O **esconderijo** é um easter egg só da demonstração, inspirado na Batcaverna, atrás da estante da
sala do chefe. Mora no pavimento 6, que continua só de fachada por fora. Fica de fora do seletor, de
PageUp/PageDown, do clique na fachada e da URL: `?andar=esconderijo` é ignorado, e lá dentro a URL diz
`andar=diretoria`, então recarregar volta à estante. Nada é salvo: recarregar esquece tudo.

- **Como achar:** na Diretoria, aponte para a estante na parede oeste da sala do chefe. Um livro claro
  sai um pouco da fileira, e a legenda diz "Um livro fora do lugar". A descrição da sala também dá a
  pista, e o relógio de parede, parado em 10:47, faz o livro brilhar ao ser clicado.
- **Mouse ou toque:** clicar no livro abre a estante. Clicar de novo desce.
- **Teclado:** Tab até o livro, Enter abre e Enter desce. Os botões só aparecem com foco.
- **Voltar:** a porta acesa no fundo, "Voltar à Diretoria" no seletor, Esc ou PageUp/PageDown. Quem subiu
  encontra a estante aberta; ir para outro lugar do prédio a fecha. Depois de achado, o seletor
  oferece o esconderijo até recarregar.

Dentro há central de investigação, vitrine do traje, treino e garagem. O vigia de costas para a câmera
é figurante, com as regras dos outros: fora de Pessoas, sem clique, sem comando. Tudo é cenário, e as
telas dizem que os arquivos são cenográficos. Os easter eggs têm efeito real e voltam atrás:

| Onde                 | Gesto  | O que acontece                                                |
| -------------------- | ------ | ------------------------------------------------------------- |
| Terminal             | Clique | Troca os três painéis de arquivo                              |
| Holofote             | Clique | Liga o sinal na parede e, no prédio fechado, no céu da cidade |
| Carro                | Clique | Liga o motor: farol, luz de baixo e uma volta da plataforma   |
| Moeda gigante        | Clique | Dá cara ou coroa, alternando; a moeda mostra a face           |
| Relógio da Diretoria | Clique | Vai à meia-noite e acende o livro                             |

Com movimento reduzido, nada gira e tudo muda na hora. Não há luz nova na cena: o azul e o âmbar são
planos somados (`HIDEOUT_GLOWS`), e a noite do andar só reduz a força das luzes de sempre, com a laje
fechada, sem refazer sombreador. Peças de pacote em `public/esconderijo/CREDITOS.md`. O kit só baixa
quando a estante abre pela primeira vez, e a frota real nunca baixa. Prova em `pnpm qa:esconderijo`.

Evidências e custo medido em `docs/escritorio-evidencias/esconderijo/`.

Limites do esconderijo: ninguém anda lá dentro, a passagem é um vão pintado na parede, sem furar a torre,
e o carro não sai da plataforma.

Limites do chefe: ele chega de carro na rua ou de helicóptero no deque, some por uns segundos e
reaparece sentado na mesa. Não há trajeto da porta ao elevador nem subida ou descida animada, e ele
não aparece no térreo nem na Operação. O passeio fica na Diretoria; sair do andar no meio dele o
devolve à mesa.

### O heliporto

O deque fica sobre o último degrau da coroa, em balanço sobre colunas, com o círculo e o H pintados,
luzes de borda, guarda-corpo baixo e a casinha da escada. Mora nas malhas da fachada, depois do último
pavimento: o corte o tira de cena junto com a coroa, não há chamada de desenho a mais, e as luzes
seguem as janelas, acesas à noite e quase apagadas de dia. A agulha virou um mastro fino no canto de
trás, fora do giro do rotor, na mesma altura de antes: o enquadramento do exterior não mudou.

O helicóptero é só cena da demonstração, como o resto do roteiro: não vem de dado nenhum, e a frota
real não tem prédio nem helicóptero. É procedural, sem arquivo, textura ou luz nova, e só é construído
enquanto há voo ou helicóptero pousado; quem chegou de carro nunca paga por ele.

- **Chegar:** vem da direita da tela, passando na frente da coroa, faz a curva, freia, gira no ar para
  o rumo do pouso e desce. O rotor desacelera, o chefe anda até a porta da casinha, e dali em diante é
  como no carro: some e reaparece na mesa. Fica pousado enquanto ele estiver no prédio.
- **Sair:** o chefe aparece na porta da casinha, embarca, o rotor acelera e o helicóptero decola e sai
  pela esquerda. Se ele tinha chegado de carro, o deque está vazio e o helicóptero vem buscá-lo antes,
  com o rotor girando. O status passa a "Fora do prédio", e a gaveta diz isso e oferece a volta.
- **Na gaveta do chefe:** só aparece o que faz sentido naquele momento (`chiefMenu`). Quem chega ou sai
  se vê de fora, então esses botões levam ao exterior.
- **Às vezes:** a chegada da abertura é de helicóptero em cerca de uma a cada três vezes.
  `?chegada=helicoptero` e `?chegada=carro` fixam; qualquer outro valor sorteia.
- **Interrupções:** o roteiro anda pelo relógio em qualquer vista, e com o corte aberto helicóptero e
  deque não são desenhados. Pedir outra chegada no meio recomeça do zero: os botões ficam dentro do
  prédio, com o helicóptero fora do corte, então ninguém o vê sumir do ar.
- **Movimento reduzido:** sem voo. Pousado e com ele na mesa, ou direto fora do prédio.

Prova em `pnpm qa:heliporto`. Custo no exterior de dia, em 1440×900, com o menor valor de 4 s de
quadros: antes do deque 35 chamadas e 119.675 triângulos; com o deque vazio, as mesmas 35 chamadas e
120.643 triângulos; pousado, 36 chamadas e 121.175 triângulos, porque o carro sai de cena. Durante o
voo, a mediana fica entre 38 e 44 chamadas e chega a 122.743 triângulos, no pior momento: o chefe
andando no deque com o rotor girando, quando o helicóptero veio só buscá-lo.

Limites do heliporto: no deque o chefe é um boneco com as cores dele, porque o corpo de verdade só
existe no andar em tela e carregá-lo baixaria arquivos em plena abertura; de perto, com o zoom no
máximo, dá para notar. Ele some ao chegar à porta e ao helicóptero, sem animação de abrir porta ou de
embarcar. O helicóptero não projeta sombra de verdade: há só uma sombra de contato no deque. No celular,
a primeira parte do voo fica fora da tela ou atrás do seletor de andares.

## Cenário de tecnologia

Um modo a mais da demonstração, para avaliar se um "campo virtual" do setor de tecnologia agrega ao
time além do que um painel em tempo real já daria. **Nada é real:** o squad, os projetos, os PRs e a
agenda são fictícios e simulados. A estrutura, porém, é a das ferramentas que o setor usa, para a
simulação poder dar lugar aos conectores sem mexer na cena.

### O modelo (`src/activity/`)

Puro TypeScript, sem React nem three, coberto por `tests/unit/activity.test.ts`.

| Fonte         | O que entra                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- |
| Notion        | Projeto → Épico → HU → critérios de aceite, com responsável; épico na trilha discovery ou delivery |
| GitHub        | PRs (ligados à HU pelo `HU-31` no título ou na branch), revisões, CI, merges e deploys        |
| Slack         | Só sinais: status, huddle (quem entrou e saiu) e contagem de mensagens por canal               |
| Microsoft 365 | Agenda do Outlook (título, horário, participantes, sala ou remoto) e presença do Teams       |

- **Identidade:** o e-mail corporativo é a chave. Notion, Slack e M365 já chegam com ele. O GitHub é
  pessoal: chega com o login, e só vira pessoa se o login estiver vinculado no cadastro. Como a ligação
  é feita na leitura, vincular atribui também o que já tinha acontecido; até lá, o PR mostra "autor não
  identificado" e o login (`identity.ts`).
- **Um formato de evento** (`events.ts`): `{ id, at, source, actor, subject, type, data }` — quem, o
  quê, sobre o quê, quando e de que fonte (`notion`, `github`, `slack`, `m365`, `bot` ou `app`). O estado
  "agora" é o retrato inicial com os eventos aplicados em ordem. Evento repetido é aplicado uma vez, e
  evento sobre algo que não existe é ignorado.
- **Perguntas de acompanhamento** (`selectors.ts`): o que trava o épico X, HUs paradas há mais de N,
  PRs esperando revisão e quem pode revisar agora (dev ou tech lead com GitHub vinculado, que não é o
  autor, está na mesa e não tem reunião nos próximos 30 minutos; foco conta como "não perturbe"; quando
  ninguém pode, `upcomingReviewers` diz quem fica livre hoje e quando, pela mesma regra), HUs
  prontas ou em curso sem critério de aceite, o que os bots fizeram hoje, quem está em reunião, huddle,
  foco ou fora, carga por pessoa e saúde do épico (no prazo, em risco, travado) com o motivo de cada
  ponto. `trackingAnswers` junta as respostas: é por ela que a prova confere que o prédio e o painel
  dizem o mesmo.

### O squad e os projetos

O squad tem o formato do time real, uma pessoa por papel, com nomes fictícios: **Marina Lopes** (PO
sênior), **Bianca Sales** (PO júnior, de férias), **Caio Rezende** (UX), **Renata Okabe** (tech lead),
**Diego Martins** (dev back-end), **Luana Ferraz** (dev front-end) e **Otávio Prado** (diretor de
tecnologia), que senta no andar junto com o squad e não é convidado da daily. Revisa código quem é dev ou
tech lead; PO, UX e diretor não.

Todos os projetos são produtos do app central **HubSmart**, cada um com épicos nas trilhas de discovery e
delivery:

| Projeto | Épicos |
| - | - |
| HubSmart · Franquias (franqueados e gestão das franquias) | E-1 Acesso do franqueado sem senha, E-2 Boleto de royalties do franqueado, E-3 Pesquisa com franqueados |
| HubSmart · Previdência Icatu (contratação com gestão de admin) | E-4 Contratação de previdência Icatu, E-5 Gestão de admin da previdência |
| HubSmart · Vendedor BeSmart | E-6 Comissão do vendedor BeSmart |

### A simulação

`SimulatedDay` gera um dia de trabalho, terça 10/11/2026 das 9h às 18h, determinístico pela semente
(`?semente=`): a mesma semente dá o mesmo dia, e as mesmas ações dão as mesmas consequências. A semente
mexe nos minutos e no movimento dos canais; as situações são sempre as mesmas, para haver o que mostrar.
Na velocidade 1, o dia passa em 15 minutos.

- A HU-27 está travada desde ontem às 17h esperando decisão da PO sênior, que passa o dia em reuniões:
  o épico Acesso do franqueado sem senha só destrava depois do refinamento, a menos que alguém cobre antes.
- O PR #142 está aberto há quatro dias sem revisor; na daily, a tech lead é quem fica livre às 09:45, e
  a rotina do Pulse a marca no canal do squad às 11h.
- A Luana abre PRs com um login do GitHub que não vinculou: o #145 (o CI quebra durante o foco dela e é
  consertado; a Renata aprova depois do huddle) e o #147, à tarde, aparecem com "autor não identificado".
- A daily é o huddle do #squad-hubsmart às 09:30 (ver abaixo); o refinamento na sala; chamadas remotas na
  mesa (o diretor tem comitê, planejamento e a reunião com a Icatu); três huddles; almoço; a PO júnior de
  férias, com HU no nome dela. Sem QA no squad, a PO aceita ou devolve o que está em QA.
- Deploys em homologação e em produção; um épico de discovery é validado e outro passa para o delivery.
- Rotinas dos bots da Operação: o Forge prepara a pauta da daily, o Atlas atualiza o status dos épicos a
  partir do GitHub, e o Pulse cobra a revisão parada. O resultado é calculado pelos mesmos seletores.

### A daily é o huddle do Slack

A daily está na agenda (convite das 09:30 às 09:45), mas acontece num huddle do canal do squad
(`huddleChannel` no evento da agenda). Às 09:30 a tech lead abre o huddle, quem está no escritório entra
nos dois primeiros minutos e o Caio entra atrasado, às 09:36 ou 09:37 pela semente. A Bianca (férias) não
entra; o diretor não é convidado e fica na mesa.

- **Na sala está quem entrou no huddle**, convidado ou não (`whereIs`). O convidado que não entrou fica
  onde está; ninguém vai à sala antes de entrar, e os lugares seguem a ordem de entrada.
- **Ausente é o convidado da agenda que não entrou no huddle.** Quem não foi convidado nunca conta.
- **Tolerância de 8 minutos** (`DAILY_GRACE_MS`): até 09:38 quem não entrou "ainda não entrou"; a partir
  de 09:38, "ausente". Quem entra atrasado sai da lista e vai para a sala. Quem entrou e saiu antes do
  fim não vira ausente.
- Um seletor só, `dailyAttendance(state, at)`, alimenta os três lugares: o **quadro da daily** sobre a
  sala de reunião no andar, a seção **"Daily · huddle em #squad-hubsmart"** no topo do Painel (com onde
  está quem não entrou: férias, fora, na mesa) e o rótulo da **barra lateral** ("Daily · ainda não
  entrou", "Daily · ausente"). Fora da daily, nada aparece.
- O Teams não marca "em reunião" na daily: o huddle é do Slack.

`qa:tecnologia` prova num bloco à parte (`HQ_ONLY=daily`), com o relógio parado e movimento reduzido:
às 09:35 o Caio e a Bianca aparecem como "ainda não entrou" no quadro, no Painel e na barra, iguais a
`dailyAttendance`, e o diretor em lista nenhuma; às 09:40 a Bianca aparece como ausente nos três e o Caio
está sentado na sala; às 09:46 nada fica marcado.

### O andar da Tecnologia

`/?escritorio=completo&modo=demonstracao&cenario=tecnologia`. Sem `cenario`, a demonstração é a de
sempre, e a frota real nunca aceita cenário (`parseScenario`). No cenário, o pavimento 2 deixa de ser
expansão reservada e vira **Tecnologia**, com botão próprio no seletor; os pavimentos 3 a 5 seguem na
linha da Expansão. `?hora_sim=HH:MM` abre o dia numa hora, `?velocidade=1|2|4|8` e `?semente=` também
valem.

- **Planta** (`TECH_FLOOR` em `officeExpansion.ts`): o quadro dos épicos na parede do fundo, duas ilhas
  com as oito mesas (sete do squad, com o diretor), a sala de reunião com oito lugares (quatro de frente para a câmera) e o
  canto do huddle perto dos elevadores. Não há figurante: quem está ali é o squad simulado.
- **Cada pessoa** é uma `HumanFigure` com aparência própria (`src/tech/techPeople.ts`) e uma mesa. O plano
  (`personPlans`) diz onde ela deve estar: reunião presencial na agenda leva à sala (oito minutos do
  dia antes, para chegar a tempo; na daily, só quem entra no huddle), huddle do Slack ao canto do huddle, presença offline ou ausente ao
  elevador, onde a pessoa some. Foco e chamada remota ficam na mesa; foco ganha a lua de "não perturbe",
  sempre à vista. A cena levanta, anda pela rede de caminhos (`techPlaces.ts`, testada para não atravessar
  móvel), troca de casa e senta. Ninguém para no meio de um movimento: termina e segue o plano novo.
- **O rótulo** de cada pessoa ("revisando PR #145", "Daily", "foco · HU-32", "indo para Refinamento")
  aparece ao apontar, ao selecionar ou com o foco do teclado, para a cena não virar uma lista de nomes.
- **O quadro dos épicos**: discovery à esquerda (Ideia, Pesquisa, Validado), delivery à direita
  (Planejado, Em andamento, Homologação, Entregue). Cada épico é um cartão na cor da saúde: verde no
  prazo, âmbar em risco, vermelho travado. É uma textura só, redesenhada quando muda etapa ou saúde, com
  botões de verdade por cima: clicar (ou Tab e Enter) abre a gaveta do épico, com os motivos.
- **Os bots trabalhando**: quando o Forge, o Pulse ou o Atlas começam uma tarefa, um robô sai do
  elevador, voa até o lugar do trabalho (a sala da daily, o cartão do épico ou a mesa de quem abriu o
  PR), fica lá enquanto ela dura e volta. A etiqueta diz qual bot e o que faz.
- **A gaveta da pessoa**: agora (o que faz, até quando, Teams e Slack), agenda do dia, HUs, PRs abertos,
  revisões pedidas e o histórico do dia. Quem não vinculou o GitHub vê "GitHub não vinculado" e **Vincular**, que
  abre o cadastro nessa pessoa. A gaveta não sugere login: o app não sabe de quem é um login sem vínculo
  (os logins sem pessoa ficam no cadastro, onde se escolhe a quem vincular). Para quem abre PR (dev e
  tech lead) o aviso diz que PRs e revisões não entram na carga até o vínculo; para produto, UX e
  diretoria o tom é neutro.
- **Squad na barra lateral:** com o cenário ligado, o Roster ganha a seção **"Tecnologia · squad"**
  (com selo "Simulação" e contagem de 7 pessoas). Lista as sete pessoas com cargo e estado em tempo
  real calculado pelos seletores puros (`whereIs`, `doingNow`, `PLACE_LABEL`): Na mesa, Em foco 🌙 ("não
  perturbe"), Em reunião · Daily até 09:45, Em huddle, Em chamada, Fora/Férias. Clicar em qualquer membro
  abre a gaveta dele (e navega para o andar da Tecnologia caso esteja em outro pavimento); no celular
  (largura <= 480px), fecha a barra lateral ao selecionar. A busca filtra por nome e papel (ex.: "diretor"
  isola o Otávio, "PO" mostra as duas POs). Recolher a seção persiste em `localStorage` (`COLLAPSED_TEAMS_KEY` via `toggleTeam`). O carregamento
  é feito por slot dinâmico (`lazy`), garantindo que sem cenário nada de `src/tech/` seja baixado.
- **Esc** fecha primeiro a gaveta do cenário (`escapeLayers`), depois segue como no resto do prédio.

**Primeiro carregamento:** o cenário mora num pedaço de JavaScript à parte (`src/tech/`), baixado só
com `cenario=tecnologia`. Sem ele, `qa:tecnologia` confere que nenhum arquivo do cenário é pedido. Com
ele, a vista inicial continua o prédio fechado; o squad, o quadro e os robôs só são montados no andar.

**Custo medido** (1440×900, Apple M1, servidor de desenvolvimento, mediana de 12 quadros):

| Vista                  | Chamadas | Triângulos |
| ---------------------- | -------- | ---------- |
| Andar 2 sem cenário    | 85       | 333 mil    |
| Tecnologia, 10h20      | 113      | 461 mil    |
| Exterior sem cenário   | 36       | 121 mil    |
| Exterior com cenário   | 36       | 121 mil    |

As 28 chamadas a mais (medidas com o squad antigo, de oito) são as pessoas (cinco figurantes saem), as cadeiras ocupáveis e o quadro.

`pnpm qa:tecnologia` prova o cenário: abre, o dia anda, pausa e muda de velocidade, a daily leva o
squad à sala e devolve, huddle, o épico destrava no quadro, gaveta da pessoa e do épico, robô da rotina,
movimento reduzido, celular, custo, e que sem `cenario` nada muda. O roteiro não aposta corrida com o
relógio: cada página abre com ele pausado na `hora_sim` pedida, cada prova salta para a hora do que vai
provar (`jumpToClock` da ponte `__HQ_TECH_QA__`) e só então espera a cena alcançar o plano; só a prova do
próprio relógio o deixa andar. A ponte também liga o tempo real da cena (`realTime`): sem GPU um quadro
passa de um segundo e cada quadro anda no máximo 50 ms, então a caminhada da mesa à sala levava mais de
15 minutos; com ele, o quadro lento é dividido em passos de até 50 ms e o squad e os robôs andam no ritmo
do tempo real. Fora da prova ele fica desligado e nada muda. Assim o roteiro passa igual numa máquina
lenta, sem GPU, com `HQ_TIMEOUT_SCALE=3` (12 provas em cerca de 25 minutos num Linux de 6 núcleos com
swiftshader). As provas do painel (mesmas respostas no prédio e no painel), das três ações e do
cadastro do GitHub entram no roteiro junto com as PRs que criam essas telas.

Limites do andar: o passo do squad é apressado (1,7×) para o dia comprimido caber, e mesmo assim, a 4× e
8×, as pessoas chegam atrasadas às reuniões curtas. Ninguém sobe pelo elevador: quem sai some na porta e
quem chega aparece nela. Os robôs também aparecem na porta do elevador, sem a viagem desde a Operação, e
a mesa do bot na Operação não fica vazia enquanto ele visita. O texto do quadro só se lê de perto.

### Projetos e Painel: o mesmo dia fora do prédio

O experimento é saber se o campo virtual agrega mais que um dashboard. Para a comparação ser justa, o
cenário tem também o dashboard, bom e com os mesmos dados. Na barra de cima, ao lado do relógio, o
seletor **Prédio | Projetos | Painel** (abas de verdade: clique, setas, Home e End; no celular só os
ícones, o nome segue para o leitor de tela). `?visao=projetos` ou `?visao=painel` abre direto, e a URL
acompanha a troca. Tudo vem no mesmo pedaço de JavaScript do cenário.

- **Uma fonte só.** As três visões leem o mesmo `useTechStore` e o mesmo `ActivityState`. A árvore
  (`projectTree`) e o painel (`dailyBoard`), em `src/tech/techViews.ts`, são montados pelos seletores de
  `src/activity/selectors.ts`: as listas de travadas, paradas, sem critério, revisões, sem autor e
  presença são as de `trackingAnswers`. O teste confere a cada 20 minutos do dia que dizem o mesmo.
- **Projetos** é a árvore do Notion: Projeto → Épico → HU → critérios de aceite, com expandir e
  recolher. Cada nível tem as propriedades em colunas: responsável (quem está fora vem marcado com o
  motivo, "Férias até 16/11"), etapa com a trilha discovery/delivery, saúde do épico na mesma cor e
  rótulo do quadro, HU travada (desde quando, esperando quem), parada ou sem critério, os riscos do
  épico que caem na HU (CI quebrado, PR sem revisão, responsável fora), critérios marcados ou não e os
  PRs ligados, com estado, CI, revisões e "autor não identificado" quando o GitHub não está vinculado.
  O motivo que é do próprio épico (entrega perto com pouco pronto) aparece na linha dele, ao lado do selo.
  Abre de cara o que pede atenção; o filtro "Pede atenção" esconde o que está em dia. É uma lista
  aninhada (não um `tree` do ARIA): cada nível tem o botão de expandir com `aria-expanded` e
  `aria-controls`.
- **Painel** responde à daily de cima para baixo. No topo, os números com contexto (a travada mais
  antiga e quem ela espera, o PR que espera há mais tempo e quantos podem revisar agora, épicos por
  saúde, quem está disponível). Depois, **precisa de ação**: HUs travadas (desde quando, esperando quem,
  e onde essa pessoa está agora), PRs esperando revisão (há quanto tempo, a quem foi pedida e quem pode
  revisar agora, pela regra de `reviewCandidates`; na daily, com o squad todo na sala, quem fica livre e
  quando, "Renata livre às 09:45", e o resumo diz "ninguém livre agora · próxima às 09:45"), HUs
  paradas, sem critério e PRs sem autor; o número do grupo conta HUs e PRs distintos. Ao lado,
  a saúde de cada épico com os motivos, o time agora (reunião, chamada, huddle, foco, fora, na mesa) e
  o que os bots fizeram hoje. Embaixo, a carga por pessoa: HUs, PRs abertos e revisões pedidas (cada
  número de PR abre a gaveta da pessoa).
- **Tudo leva à origem.** Abrir um épico, HU, PR ou motivo abre a gaveta do épico que o prédio já tem,
  com a HU em destaque (a gaveta rola até ela); um nome abre a gaveta da pessoa; PR sem HU abre quem o
  abriu. O que não tem origem (PR sem HU nem autor no cadastro, bot com alvo reunião) não parece
  clicável. Não há gaveta duplicada. **Esc** fecha a gaveta primeiro; o seguinte volta ao prédio.
- **Teclado.** O Tab da aba entra no painel dela (o Shift+Tab do começo volta à aba), embora a seção
  venha depois da navegação lateral no DOM. Fechar a gaveta (X ou Esc) devolve o foco a quem a abriu;
  sair da visão devolve à aba Prédio. Com a visão aberta (`data-scene-cover`), as teclas da câmera
  (PageUp/PageDown, setas, +/-) não agem na cena escondida; só o Esc passa. Com Conversas, Equipe ou
  Kanban por cima, a visão fica `inert` e escondida.
- **A cena para.** Com Projetos ou Painel cobrindo o 3D, o render vai para `frameloop="never"`, o laço
  das etiquetas não trabalha e o palco nem é composto (`visibility: hidden`); volta sozinho ao prédio. Só
  para com a cena pronta e fora de viagem. O `setFrameloop` do R3F 9.8 zera `clock.elapsedTime`, que
  conta o voo e o balanço dos robôs: a pausa guarda o tempo e devolve ao voltar, e zera os quadros que
  o R3F ainda devia (`internal.frames`: todo `set` na store do R3F invalida), que senão saíam
  depois da pausa. O monitor de desempenho sai durante a pausa e volta zerado, para o tempo parado não
  contar como 0 fps. Medido no servidor sem GPU (swiftshader, 1440×900): o andar
  da Tecnologia desenha 6 quadros por segundo; com o Painel aberto, 0. A primeira captura com o Painel
  aberto caiu de 28 s para 9 s quando o canvas deixou de ser composto por baixo.
- **Largura.** A visão mede a si mesma (container query): com a gaveta aberta ao lado, ou no celular,
  a árvore vira linhas com a propriedade rotulada, em vez de cortar colunas.
- **Prova.** O bloco das visões do `qa:tecnologia` (`HQ_ONLY=visoes` roda só ele) compara painel,
  árvore e prédio com `trackingAnswers` às 09:00, 09:35 (dentro da daily), 10:40, 11:21, 14:00, 15:20
  e 17:55: listas, os seis grupos do time, o resumo de disponíveis, quem pode revisar e quem fica livre,
  cada motivo de cada épico por tipo e sujeito, a carga por pessoa. Confere também o foco depois do Esc
  e do X, que PageDown com o Painel aberto não troca de andar, que nenhum quadro sai com a cena pausada
  e, com três segundos de relógio real, que o dia anda com o Painel aberto.

Mensagem entre pessoas continua fora: o modelo não tem, as visões não inventam.

`qa:tecnologia` prova, num bloco à parte, que **o prédio e o painel dizem o mesmo**: em 10:40, 11:21,
14:00 e 15:20, com o relógio parado e levado por `jumpToClock`, compara `trackingAnswers` com os `data-*`
do painel (ids, não texto), com a árvore de Projetos e com o prédio (saúde no quadro via `data-health`,
lugares pelo plano e pela cena, a lua de "não perturbe" de quem está em foco). Também troca de visão por
clique, teclado e URL, Esc em camadas, celular sem rolagem lateral e que sem `cenario` nada é baixado.

### Ações: cobrar, reatribuir, pedir ao bot

As ações aparecem onde a pergunta aparece, com uma implementação só (`src/tech/TechActions.tsx`):

| Onde | O que pede ação | Ação |
| ---- | --------------- | ---- |
| Painel · HUs travadas | quem a trava espera | **Cobrar** essa pessoa |
| Painel · HUs paradas | ninguém mexe | **Cobrar** e **Reatribuir** |
| Painel · PRs esperando revisão | quem pode revisar agora | **Pulse: pedir revisão** e **Pulse: resumir o PR** |
| Painel · HUs sem critério | ninguém sabe quando acaba | **Atlas: completar critérios** |
| Painel · PRs sem autor | login sem pessoa | **Vincular no cadastro** |
| Gaveta do épico, gaveta da pessoa, árvore de Projetos (HU aberta) | cada HU e cada PR aberto | as mesmas, conforme o item |

- **Cada botão abre um painel que diz o que vai acontecer antes de enviar.** Cobrar mostra para quem vai
  ("Cobrar Marina": quem a trava espera, senão quem responde pela HU), onde a pessoa está agora e a
  **mensagem do Lipp HQ**, palavra por palavra. A cobrança sai **no canal do squad (#squad-hubsmart),
  marcando a pessoa**, nunca por mensagem direta, em tom leve: "@Marina, a HU-27 está esperando uma
  decisão de produto sua desde ontem às 17h, consegue olhar? Motivo: o link vale 15 minutos ou 24
  horas?". HU parada pergunta se ainda é isso ("… sem atualização desde dom às 11h20. Ainda é isso, ou
  tem algo travando?"). O Pulse, ao pedir revisão, também marca a pessoa no canal. É o único texto
  que existe: ninguém escreve em nome de ninguém. Reatribuir lista o squad com a carga de cada um (HUs,
  PRs, revisões, de `personLoad`), quem está fora com o motivo ("Férias até 16/11") e o responsável
  atual, que não se escolhe; confirmar diz "A HU-37 sai de Bianca Sales e vai para Marina Lopes". Pedir
  ao bot diz o que o bot faz (o Atlas para o Notion, o Pulse para o GitHub; pedir revisão já nomeia quem
  está livre pela agenda) e se ele começa já ou depois da tarefa atual.
- **Uma fronteira só.** Enviar chama `useTechStore.perform`, que chama `ActivityRuntime.perform`, que
  chama `ActivitySource.perform`: nenhuma tela muda o estado. Quem cobrar e o texto da mensagem saem de
  `src/activity/actions.ts`, usado pela tela e pela simulação, então o botão nunca cobra outra pessoa que
  não a anunciada.
- **Depois.** O resultado vira aviso (`aria-live="polite"`). A HU cobrada mostra "Cobrado às 10:05,
  aguardando resposta de Marina" (também na coluna de sinais da árvore) até a resposta chegar pela
  simulação, quando vira "Marina respondeu às 10:17". A resposta é lida do feed (`nudgeStatus`): a pessoa
  cobrada mexeu na HU no Notion, ou a HU destravou ou foi concluída. O pedido ao bot mostra "Atlas
  trabalhando desde 10:50" e depois o resultado; o robô sai do elevador e vai ao lugar (o cartão do
  épico no quadro, ou a mesa de quem abriu o PR), como nas rotinas.
- **Teclado.** Os botões são botões; o painel recebe o foco (Enviar, ou a primeira pessoa da lista) e
  o Esc fecha de dentro para fora: o painel da ação, depois o cadastro, depois a gaveta, depois a visão.
  Fechado, o foco volta ao botão. Um painel aberto por vez na tela.
- **Consequência de verdade.** Cobrar a HU-27 às 10:05 faz a Marina decidir entre uma chamada e outra
  (10:17): o épico Acesso do franqueado sem senha destrava de manhã. Sem cobrança, a decisão só sai
  depois do refinamento (15:06 na semente 7).

### Cadastro do squad

Uma gaveta, não uma quarta visão: o cadastro não responde pergunta da daily, é onde se arruma a
identidade. Como gaveta, abre de qualquer visão sem tirar o que está por baixo, e o efeito do vínculo
aparece ao lado. Abre pelo botão **Cadastro** da barra do cenário (no celular, só o ícone), pelo aviso
da gaveta de quem não vinculou o GitHub (agora com **Vincular**, que já abre o campo da pessoa) e pelo
PR sem autor no Painel.

- Para cada pessoa: nome, cargo e papel, e-mail corporativo e as fontes que a reconhecem (Notion, Slack e
  Microsoft 365 sempre, pelo e-mail; GitHub só com o login vinculado). No topo, a cobertura por fonte
  (`identityCoverage`: GitHub 3/7 no começo do dia) e os **logins do GitHub sem pessoa**
  (`unidentifiedLogins`), com os PRs em que aparecem; para cada login, um atalho preenche o campo de
  quem ainda não vinculou, e a pessoa confirma.
- **Vincular** é digitar o login, **trocar** e **desvincular** também (desvincular pede confirmação e
  avisa que os PRs voltam a "autor não identificado"). Os erros de `LINK_PROBLEM_LABEL` aparecem junto
  do campo (`aria-invalid`, `role="alert"`): login inválido, login já vinculado a outra pessoa, e-mail
  fora do cadastro. Campo vazio pede o login em vez de desvincular por engano.
- Tudo é a ação `vincular_github`. Como a ligação é feita na leitura, ao vincular o `luaferraz` os PRs
  que já existiam (#140, mesclado ontem, #145 e #147, de hoje) passam a mostrar a Luana em todas as
  visões, saem de "sem autor" e entram na carga dela.
- **Na demonstração, o login é digitado. Com os conectores, o vínculo será "Entrar com GitHub"
  (OAuth):** a pessoa entra na própria conta e o login chega confirmado pelo GitHub, sem digitação e
  sem como vincular o login de outra pessoa. A ação continua a mesma.

`qa:tecnologia` prova as ações e o cadastro num bloco no fim (`HQ_ONLY=acoes` roda só ele), pela
interface, com o relógio parado e `jumpToClock`: cobra a HU-27 às 10:05 (o botão diz "Cobrar Marina",
a mensagem enviada é a mostrada, sai no #squad-hubsmart marcando a Marina, a HU fica "aguardando"; às
10:30 ela destravou às 10:17, contra 15:06
no mesmo dia sem cobrança, e o E-1 deixou de estar travado); reatribui a HU-37 da Bianca para a Marina
pela árvore e confere árvore, painel (carga) e gaveta da pessoa, e que o Painel segue batendo com
`trackingAnswers`; pede ao Atlas os critérios da HU-40 pela gaveta do épico (começa já, entra em "bots
hoje", o robô chega ao cartão do E-5 no quadro); e no cadastro tenta "luana ferraz" (inválido) e
"rokabe" (em uso) antes de vincular `luaferraz`, conferindo que o #147 sai de `semAutor` e que ele, o
#145 e o #140 mostram a Luana no Painel, na árvore e nas gavetas. Captura cada ação em 1440×900 e o cadastro também em 390×844.

### A fronteira simulação/conector (`source.ts`)

A cena, o painel e os seletores só conhecem `ActivityState`. Quem o alimenta implementa `ActivitySource`:

- `initial()`: a sincronização inicial, um retrato completo lido das APIs uma vez.
- `pull(until, estado)`: os eventos novos até `until`, já normalizados. No conector, vêm de webhooks
  (ou de leitura periódica onde não há webhook), guardados numa fila no servidor até a tela pedir.
- `perform(ação, estado)`: executa uma ação da tela. No conector, vira chamada de API; o que ela causa
  depois chega por `pull`, como qualquer outro evento.

Trocar `SimulatedDay` por um conector é escrever outra classe com esses três métodos. Nada na cena muda.

### Privacidade por desenho

- Não existe, no modelo, mensagem entre pessoas: nem texto, nem contagem por pessoa. Canal só tem
  horário e total do dia. Huddle só tem quem entrou e saiu. O teste confere isso.
- A única mensagem com texto é a que o próprio Lipp HQ (ou um bot dele) envia numa ação ou rotina.
- Agenda: só título, horário, participantes e lugar; nada de corpo do convite.
- Todos os dados da demonstração são fictícios, com e-mails no domínio reservado `lipp.example`.

### O que falta para ligar as ferramentas reais

Um pequeno serviço no servidor (como o proxy do Hermes em `server/`) que recebe os webhooks, traduz para
`ActivityEvent`, guarda numa fila e serve `initial` e `pull` para a tela. Os segredos ficam nele, nunca
no navegador. Por ferramenta:

- **Notion:** integração interna aprovada por quem administra o workspace, compartilhada com as bases
  de Projetos, Épicos e HUs, com a permissão de ler e-mail dos usuários. Webhooks de página e base
  para mudança de status, responsável e critérios; escrita (`pages.update`) para reatribuir.
- **GitHub:** GitHub App instalado na organização por um admin, com leitura de pull requests, checks,
  actions e deployments, e escrita em pull requests para pedir revisão. Webhooks `pull_request`,
  `pull_request_review`, `check_suite`/`workflow_run`, `push` e `deployment_status`. No cadastro, o
  vínculo deve passar a ser por "Entrar com GitHub" (OAuth), para provar que o login é da pessoa; na
  demonstração ele é digitado.
- **Slack:** app instalado por admin do workspace, com `users:read`, `users:read.email` (ligar ao
  e-mail), `users.profile:read` (status), `chat:write` (só as mensagens do app) e leitura de canais.
  Eventos `user_status_changed`, `user_huddle_changed` e `message.channels`. Atenção: o evento de
  mensagem traz o texto; o conector precisa descartá-lo na chegada e guardar só a contagem.
- **Microsoft 365:** registro de app no Entra ID com consentimento de admin para `Calendars.Read`,
  `Presence.Read.All` e `User.Read.All`, restrito às caixas do squad por política de acesso de
  aplicativo. Assinaturas do Graph (change notifications) para eventos de agenda e presença, com
  renovação periódica, e um endpoint HTTPS público para recebê-las.

## Como usar

| Ação              | Como                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Entrar numa sala  | Clicar no chão dela, na etiqueta ou na lista                                                         |
| Ver um bot        | Clicar na figura, no nome sobre a cabeça ou na lista                                                 |
| Mover e aproximar | Arrastar; roda do mouse ou pinça; botões − e +; setas e teclas + e −                                 |
| Voltar            | Esc fecha a gaveta e, no segundo toque, volta ao andar; **Voltar ao andar**; **Ver o andar inteiro** |
| Qualidade         | Auto, Alta ou Leve, na barra de baixo                                                                |

A câmera não gira. O azimute (45°) e a elevação (30°) são os da sala aprovada, e é isso que
garante que o corte das paredes nunca fique na frente de ninguém.

## Planta

São as nove salas de `world/rooms/rooms.ts`, nas mesmas posições relativas, em medidas
compactas que só valem aqui (`world/office/officeLayout.ts`). O andar mede 22,4 × 18 m, com
corredores de 1,5 m cruzados em #.

|       | Oeste              | Centro            | Leste             |
| ----- | ------------------ | ----------------- | ----------------- |
| Norte | Engenharia (Pulse) | Comando (Forge)   | Comunidade (Echo) |
| Meio  | Pesquisa (Scout)   | Hall              | Produto (Atlas)   |
| Sul   | Conteúdo (Ink)     | Operações (Argos) | Reuniões          |

- **Paredes:** as do limite do prédio (norte e oeste) ficam inteiras, com janelas. As internas
  do fundo são cortadas a 1,3 m, porque a 30° isso só cobre o corredor atrás delas. As da frente
  são muretas de 0,32 m. Na sala em foco, as internas do fundo sobem até 3 m sem projetar sombra,
  para a luz não mudar ao entrar.
- **Móveis altos:** só em parede de limite. Em parede interna, ficam até a altura que não
  esconde a sala de trás.
- **Cor do bot:** aparece na camisa, na etiqueta, na faixa da porta e em pequenos objetos. As
  paredes são neutras.

## Postos e capacidade

São 19 postos (`OFFICE_SEATS`): 7 de departamento, 6 na bancada do hall e 6 na mesa de reunião.
Acrescentar posto é acrescentar uma linha.

1. Bot conhecido senta no próprio departamento, mesmo que outro tenha ocupado o lugar antes.
2. Quem já sentou fica onde está quando a frota muda ou chega em outra ordem.
3. Os demais pegam o primeiro posto livre, em ordem de id.
4. Passou de 19, o bot entra em **Sem posto** na lista, com aviso de capacidade: abre a gaveta
   normalmente, mas não tem corpo na cena. Nunca há dois corpos na mesma cadeira.

## Personagens

`FigureRig` do estúdio, com o GLB intacto e a correção em memória do `SitDown`. O Pulse usa
exatamente `PULSE_BASE_SPEC`; os outros seis têm cores e proporções em `officeRoster.ts`. Bot
novo ganha aparência estável derivada do id. Variações salvas no estúdio não entram aqui.

A figura tem pernas curtas: em postura natural, o assento fica a 0,28 m. Por isso a figura entra
em escala 1,15 e a mobília foi medida a partir dela: assento a 0,33 m e tampo a 0,72 m (a mesa da
sala aprovada tinha 0,885 m, porque lá o quadril flutuava com o bug do GLB). É a única mudança
de proporção na Engenharia. Os braços são refeitos por cinemática inversa para as mãos pousarem
no tampo; os testes conferem pés, assento e mãos dos sete com o GLB real.

## Desempenho

Medido no commit `073cdbe` (build de produção), Apple M1 com 8 GB, Chromium 156 sem
interface, 1728×1000 com deviceScaleFactor 2. Cada linha é a última de três janelas de 5 s, depois
de 8 s de aquecimento. Dados completos em `docs/escritorio-evidencias/metricas.json`.

| Cena                        | Qualidade      | fps | Quadro p95 | Chamadas | Triângulos      |
| --------------------------- | -------------- | --- | ---------- | -------- | --------------- |
| Andar parado, 7 bots        | Alta (dpr 1,5) | 60  | 16,8 ms    | 73–121   | 472 mil–929 mil |
| Andar com câmera arrastando | Alta           | 60  | 16,7 ms    | 74–122   | 472 mil–929 mil |
| Engenharia em foco          | Alta           | 60  | 16,7 ms    | 70–121   | 555 mil–1,10 mi |
| Hall em foco                | Alta           | 60  | 16,7 ms    | 70–120   | 555 mil–1,10 mi |
| Andar parado, 7 bots        | Leve (dpr 1)   | 60  | 16,8 ms    | 73–121   | 381 mil–748 mil |
| Andar parado, 19 bots       | Alta           | 60  | 16,7 ms    | 166–286  | 553 mil–1,09 mi |

O valor maior de chamadas e triângulos é o quadro que refaz a sombra (1 a cada 20 em Alta, 1 a
cada 60 em Leve).

Com VSync, 60 fps é o teto da tela e não mostra folga. Sem VSync, na mesma máquina:

| Cena         | Qualidade | fps médio | Quadro p50 | Quadro p95 |
| ------------ | --------- | --------- | ---------- | ---------- |
| Andar parado | Alta      | 96        | 9,6 ms     | 20,9 ms    |
| Hall em foco | Alta      | 76        | 12,0 ms    | 30,5 ms    |
| Andar parado | Leve      | 176       | 5,2 ms     | 12,2 ms    |
| Hall em foco | Leve      | 124       | 7,0 ms     | 17,2 ms    |

**Limites da medição:** um único M1, sem janela visível. Sem VSync, o p95 em Alta passa de 16,7 ms,
e o provável responsável é o quadro que refaz a sombra; ou seja, em Alta a folga é pequena. Não há
medição em GPU integrada mais fraca, em tela 4K nem em celular, e nada aqui promete 60 fps nesses
casos. O modo Auto cai para Leve se a cena ficar abaixo de cerca de 38 fps. Essa queda não foi
provocada nos testes.

**Peso:** uma visita sem cache baixa 5,1 MB até a cena ficar pronta, sendo 4,7 MB de texturas e
GLBs (nada de novo: são os arquivos que a sala aprovada já usava). As texturas viram memória de
vídeo descomprimida, então o custo real em GPU é maior que o download.

**O que segura o custo:**

- Mobília fixa fundida por material (`officeKit.ts`), com uma dúzia de malhas no andar inteiro.
- Texturas compartilhadas, telas e placas em atlas.
- Um sol com sombra e um preenchimento para o andar todo, sem luz por sala e sem pós-processamento.
- Planta e luminária por instância. Medir o GLB mostrou que 53 mil dos 69 mil triângulos da planta
  são pedrinhas da terra; fora da sala em foco, a maior parte delas sai (`thinIslands.ts`).
- Clique por caixas analíticas, sem testar malha com esqueleto.

## Falhas tratadas

| Situação                  | O que acontece                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem WebGL                 | Mensagem explicando, sem tela preta                                                                                                                                                          |
| Contexto WebGL perdido    | Tela de falha com **Tentar de novo** (código escrito, mas o harness não provoca esse caso)                                                                                                   |
| Falta textura             | A interface fica de pé e diz qual arquivo faltou, com **Tentar de novo**                                                                                                                     |
| Arquivo que nunca chega   | O aviso entra quando os downloads **param de avançar** (12 s sem arquivo novo), não por cronômetro; teto duro de 90 s. Durante o carregamento aparece o progresso real ("10 de 72 arquivos") |
| Falta `pulse.glb`         | Planta e lista seguem, com aviso; nada de figura antiga no lugar                                                                                                                             |
| Falta planta ou luminária | A cena segue sem elas, com aviso no console (o harness não provoca esse caso)                                                                                                                |
| Hermes fora               | Aviso com demonstração e nova tentativa                                                                                                                                                      |
| Leitura atrasada          | Aviso; a última leitura boa continua na tela (coberto só em teste de unidade)                                                                                                                |

## Reproduzir

```sh
pnpm build
pnpm qa:escritorio   # --skip-perf para só o comportamento, --only-perf para só as medições
pnpm qa:heliporto    # deque, voos com fotos no meio, interrupções, reduzido, celular e noite
```

O harness sobe o fixture do Hermes e dois `vite preview` com `HQ_CONNECTION_FILE` temporário, então
a conexão salva nunca é lida nem escrita. A frota de 25 bots é simulada só na rede do teste. Saída
em `/tmp/hq-escritorio`. O harness não roda no CI: precisa de GPU real.

## Limites e próximos passos

- **Bots não andam:** ficam sentados em qualquer estado, inclusive "em reunião" e "offline". Falta
  ligar estado a lugar e animar a caminhada.
- **Sem digitação:** o modelo só tem `Idle` e `SitDown`. Animar digitação ou conversa pede clipe novo.
- **Mesa de reunião como posto provisório:** é a saída para a capacidade, não uma reunião de verdade.
- **Rosto e roupa:** continuam os do modelo low poly aprovado.
- **Chat:** só o que a gaveta já fazia; o escritório não acrescentou nada ao backend.
- **Associação com o estúdio:** ligar uma variação salva a um bot ficou fora desta etapa.
- **CI visual:** `hermes-capture.mjs` já falhava em #48 e #49 esperando `.panel-sessions`. Não é
  deste trabalho e não foi mexido.
