# Escritório completo

O andar inteiro, com os bots sentados nos postos usando o modelo aprovado no estúdio.

| Modo | URL | O que mostra |
| - | - | - |
| Frota real | `/?escritorio=completo` | Os bots que o Hermes reporta, com ids, nomes e estados dele |
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

## O prédio (só na demonstração)

A demonstração abre com a torre do Lipp HQ fechada, na cidade. O seletor discreto no canto (ou
apontar e clicar no pavimento na fachada, ou PageUp/PageDown, ou `?andar=` na URL) abre o corte
de um andar. Só o andar em tela tem móveis e personagens; a fachada é uma malha leve. A frota do
Hermes não tem nada disso: fica no escritório, sem seletor, cidade nem fachada.

**O andar em tela fica sempre em y = 0; é o entorno que desce.** A cidade e os pavimentos abaixo
do corte ficam num grupo em `y = -elevação` (`BuildingSurroundings`).

- *Por quê:* `worldToScreen`, o raio do clique, `roomAt`, cadeiras, voos e o mapa de sombra são
  todos escritos para o chão em y = 0. Mover a câmera ou o andar para a altura real obrigaria
  cada um deles a aprender um deslocamento, com risco de divergência entre o que se vê e o que
  se clica.
- *O custo:* tudo o que é da rua precisa descer junto, inclusive o carro do chefe, que vive fora
  do grupo por causa do roteiro, e o limite da cidade, que encolhe do lado para onde o chão anda
  na tela (`cityBoundsAt`). A cidade só recebe sombra com o chão colado no andar.
- *Troca:* direta. Clique, tecla ou seleção mudam `buildingView` na mesma hora, com a câmera já
  enquadrada, e o andar novo aparece no próximo quadro. Não há escuro, cobertura, espera nem
  animação no lugar deles, e o Canvas e o resto da tela não são recriados: a URL muda por
  `replaceState`. Os andares fora de tela ficam desmontados, mas modelos e peças já estão
  carregados desde a abertura da demonstração, então nada espera a rede na hora da troca.

A **torre** tem 14 pavimentos: Térreo (0), Operação (1), Diretoria (13) e 11 só de fachada, que
não clicam nem têm sala (`decorativeLevels`). A arquitetura é art déco própria do Lipp HQ: base
de dois pavimentos com colunas duplas e friso de bronze, pilastras e janelas estreitas na
vertical, e coroa de três degraus com agulha discreta.

- **Recuo só acima da última laje.** A Diretoria é o andar inteiro, e recuar antes faria os móveis
  vazarem da fachada.
- **O corte vale por construção.** Cada detalhe entra no intervalo de vértices do seu pavimento e
  nunca passa da laje dele; só a coroa passa, e ela vem depois de todos. O teste confere isso.
- **Para um pavimento de fachada virar andar:** entra em `FloorId`, `FLOOR_LEVEL`, `FLOOR_LABEL` e
  `viewRooms`, com a caixa dos elevadores e o interior. A fachada não muda.
- **A cidade cresceu para o fundo** (`CITY_BOUNDS`): do alto da torre se vê mais chão, e sem isso o
  limite da cidade cortaria a coroa no enquadramento. O fit exterior prioriza a torre completa,
  inclusive em telas largas e baixas; o limite da cidade só restringe a câmera livre.

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

Limites do chefe: ele chega de carro na rua, some por uns segundos e reaparece sentado na mesa.
Não há trajeto da porta ao elevador nem subida animada, e ele não aparece no térreo nem na
Operação. O passeio fica na Diretoria; sair do andar no meio dele o devolve à mesa.

## Como usar

| Ação | Como |
| - | - |
| Entrar numa sala | Clicar no chão dela, na etiqueta ou na lista |
| Ver um bot | Clicar na figura, no nome sobre a cabeça ou na lista |
| Mover e aproximar | Arrastar; roda do mouse ou pinça; botões − e +; setas e teclas + e − |
| Voltar | Esc fecha a gaveta e, no segundo toque, volta ao andar; **Voltar ao andar**; **Ver o andar inteiro** |
| Qualidade | Auto, Alta ou Leve, na barra de baixo |

A câmera não gira. O azimute (45°) e a elevação (30°) são os da sala aprovada, e é isso que
garante que o corte das paredes nunca fique na frente de ninguém.

## Planta

São as nove salas de `world/rooms/rooms.ts`, nas mesmas posições relativas, em medidas
compactas que só valem aqui (`world/office/officeLayout.ts`). O andar mede 22,4 × 18 m, com
corredores de 1,5 m cruzados em #.

| | Oeste | Centro | Leste |
| - | - | - | - |
| Norte | Engenharia (Pulse) | Comando (Forge) | Comunidade (Echo) |
| Meio | Pesquisa (Scout) | Hall | Produto (Atlas) |
| Sul | Conteúdo (Ink) | Operações (Argos) | Reuniões |

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

| Cena | Qualidade | fps | Quadro p95 | Chamadas | Triângulos |
| - | - | - | - | - | - |
| Andar parado, 7 bots | Alta (dpr 1,5) | 60 | 16,8 ms | 73–121 | 472 mil–929 mil |
| Andar com câmera arrastando | Alta | 60 | 16,7 ms | 74–122 | 472 mil–929 mil |
| Engenharia em foco | Alta | 60 | 16,7 ms | 70–121 | 555 mil–1,10 mi |
| Hall em foco | Alta | 60 | 16,7 ms | 70–120 | 555 mil–1,10 mi |
| Andar parado, 7 bots | Leve (dpr 1) | 60 | 16,8 ms | 73–121 | 381 mil–748 mil |
| Andar parado, 19 bots | Alta | 60 | 16,7 ms | 166–286 | 553 mil–1,09 mi |

O valor maior de chamadas e triângulos é o quadro que refaz a sombra (1 a cada 20 em Alta, 1 a
cada 60 em Leve).

Com VSync, 60 fps é o teto da tela e não mostra folga. Sem VSync, na mesma máquina:

| Cena | Qualidade | fps médio | Quadro p50 | Quadro p95 |
| - | - | - | - | - |
| Andar parado | Alta | 96 | 9,6 ms | 20,9 ms |
| Hall em foco | Alta | 76 | 12,0 ms | 30,5 ms |
| Andar parado | Leve | 176 | 5,2 ms | 12,2 ms |
| Hall em foco | Leve | 124 | 7,0 ms | 17,2 ms |

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

| Situação | O que acontece |
| - | - |
| Sem WebGL | Mensagem explicando, sem tela preta |
| Contexto WebGL perdido | Tela de falha com **Tentar de novo** (código escrito, mas o harness não provoca esse caso) |
| Falta textura | A interface fica de pé e diz qual arquivo faltou, com **Tentar de novo** |
| Arquivo que nunca chega | Em 20 s, troca o carregamento por aviso e **Tentar de novo** |
| Falta `pulse.glb` | Planta e lista seguem, com aviso; nada de figura antiga no lugar |
| Falta planta ou luminária | A cena segue sem elas, com aviso no console (o harness não provoca esse caso) |
| Hermes fora | Aviso com demonstração e nova tentativa |
| Leitura atrasada | Aviso; a última leitura boa continua na tela (coberto só em teste de unidade) |

## Reproduzir

```sh
pnpm build
pnpm qa:escritorio   # --skip-perf para só o comportamento, --only-perf para só as medições
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
