# Trabalho em andamento

Ponto de retomada para continuar de outro computador ou em outra sessão. Atualize ao pausar
ou ao fechar um ciclo. Última atualização: 2026-11-07.

## Onde estamos

A demonstração do escritório (`/?escritorio=completo&modo=demonstracao`) está completa na
`main`: prédio de 14 pavimentos com térreo, Operação (bots), quatro andares de expansão com
figurantes, Diretoria com o chefe, esconderijo secreto, heliporto com voos, cidade estilo
Gotham com ciclo de dia e noite pelo horário de Brasília, e primeiro carregamento leve.
Detalhes em [ESCRITORIO.md](ESCRITORIO.md).

### Em andamento: cenário de tecnologia (pausado)

Objetivo: testar se um "campo virtual" do setor de tecnologia da empresa agrega ao time, ou
se um dashboard bastaria. É um squad fictício simulado com a estrutura das ferramentas reais
(Notion, GitHub, Slack, Microsoft 365), atrás de uma fronteira (`ActivitySource`) que depois
recebe conectores de verdade sem mexer na cena.

- URL: `/?escritorio=completo&modo=demonstracao&cenario=tecnologia`.
- Notion real da empresa: **Projeto → Épico → HU → critérios de aceite**, tudo com responsável;
  épicos em trilhas de **discovery** e **delivery**.
- Identidade: Notion, Slack e M365 usam o e-mail corporativo; o GitHub é pessoal e a pessoa
  vincula no cadastro.
- Privacidade: dados fictícios, e nunca conteúdo de mensagem entre pessoas, só sinais.

| PR | Branch | Estado |
| - | - | - |
| [#111](https://github.com/lippdev/town/pull/111) | `feat/tecnologia-modelo` → `main` | Pronta para revisão: modelo, identidade, simulação determinística, seletores, `ActivitySource` |
| [#112](https://github.com/lippdev/town/pull/112) | `feat/tecnologia-andar` → `feat/tecnologia-modelo` | Pronta para revisão: andar da Tecnologia, quadro de épicos, gavetas, relógio da simulação; `qa:tecnologia` completo para a cena |

Próximos passos, nesta ordem:
1. ~~Completar o `qa:tecnologia` da #112~~ (concluído): o roteiro passa de ponta a ponta para a
   cena, inclusive em máquina lenta sem GPU. As provas de "mesmas respostas no prédio e no
   painel", das três ações e do cadastro do GitHub vão com as PRs que criam essas telas (passos
   2 e 3), que acrescentam suas provas ao roteiro.
2. `feat/tecnologia-visoes`, a partir da #112: visões **Projetos** (árvore estilo Notion) e
   **Painel** (dashboard com os mesmos dados, usando `trackingAnswers`). O painel não pode ser
   propositalmente fraco: ele existe para a comparação ser justa.
3. `feat/tecnologia-acoes`: interface de cobrar o responsável, reatribuir HU, pedir ao bot, e a
   tela de cadastro com vínculo do GitHub. A lógica já está no modelo, testada.
4. Squad na barra lateral.
5. Rodar o experimento: 4 a 6 perguntas reais da daily, respondidas no prédio e no painel por
   3 a 5 pessoas, medindo tempo, acerto e se a pessoa sabe o que fazer em seguida.

Depois do experimento, se valer: ligar conectores reais (apps e permissões de admin no
GitHub, Slack, Notion e Azure/Graph para agenda e presença). Se não valer, o prédio segue
como ferramenta pessoal com os bots do Hermes, e a camada de atividade serve ao dashboard.

### Ideias anotadas, sem prioridade
- Ver a tela dos bots do Hermes (sessão e ferramenta em uso) ao abrir um bot.
- Times novos na organização (além de Open Source, um time de desenvolvimento).
- Elevador animado, trem e ponteiros do relógio na cidade (ficaram de fora por custo).

## Como trabalhamos

- **Respostas ao Filipe em português.** Ele avalia no demo; mostre capturas antes de mergear.
- **Uma PR por tema, empilhadas** quando uma depende da outra, com **commits granulares** em
  português explicando o porquê. Nada entra na `main` sem PR. Merge só quando o Filipe pedir.
- **Orquestração com subagentes.** A sessão principal orquestra e revisa; a implementação vai
  para subagentes, cada um num worktree próprio, pelo T3 Code (`delegate_task` com
  `isolation: "worktree"`):
  - **Implementação e revisão independente:** Claude Opus 5.5, esforço alto (provedor
    `claudeAgent`, "Alyx").
  - **Tarefas menores** (guia de arte, roteiro de QA): contas do Antigravity, que têm cota curta.
  - **Briefing completo**, porque o subagente não vê a conversa: pedido do Filipe, base e
    branch, arquivos para ler, direção decidida, restrições, entrega e formato do relatório
    (última linha `PR <URL>, head <SHA>, checks e reviews <estado>`).
  - **Portas:** cada subagente sobe o próprio Vite numa porta livre (5243, 5251, 5271…) e
    nunca usa nem derruba 5199 (demo), 5198, 5173 ou 5341.
  - **Antes de mostrar ou mergear**, a sessão principal confere as capturas e roda de novo os
    roteiros de QA no próprio checkout. Duas revisões independentes já acharam defeitos reais.
- **Agentes não alteram `AGENTS.md`.** As regras de modelos e failover dele são do Capy.ai,
  não valem para o Claude Code.

## Como subir em outro computador

```bash
git clone https://github.com/lippdev/town.git && cd town/lipp-hq-world
pnpm install --frozen-lockfile
npx playwright install chromium   # navegador dos roteiros de QA
pnpm demo                         # build + preview em http://127.0.0.1:5199
```

- `pnpm demo` serve o build de produção, que é o peso real; `pnpm dev` é só para programar
  (31 MB de JavaScript, bem mais lento).
- O demo é um build: depois de mudar código, rode `pnpm demo` de novo.
- Para ver o cenário em andamento: `git checkout feat/tecnologia-andar && pnpm demo`.

## Verificação

`pnpm typecheck`, `pnpm lint`, `pnpm test`, e os roteiros de QA contra o demo, um de cada
vez (`HQ_URL=http://127.0.0.1:5199 node scripts/visual-qa/<roteiro>.mjs <pasta>`):

| Roteiro | O que prova |
| - | - |
| `qa:predio` | prédio, andares, chefe, seleção, celular, movimento reduzido |
| `qa:predio-transicoes` | viagem entre andares sem tela vazia nem acúmulo na GPU |
| `qa:predio-expansao` | figurantes das expansões |
| `qa:esconderijo` | segredo, easter eggs, volta |
| `qa:heliporto` | deque, chegada e saída de helicóptero |
| `qa:cidade` | capturas e custo nas três horas do dia |
| `qa:primeiro-load` | o que a abertura baixa e que entrar cedo num andar não trava |
| `qa:tecnologia` | cenário de tecnologia (na branch dele) |

Armadilhas conhecidas:
- **Navegador:** os roteiros procuram o Chrome em `/usr/bin/google-chrome` (servidor sem GPU)
  e caem no Chromium do Playwright quando ele não existe. O `character-editor` ainda não tem
  esse fallback: passe `CHROME_PATH` com o caminho de `require('playwright').chromium.executablePath()`.
- **Hora:** o céu segue o relógio. Roteiros que medem pixels fixam `&hora=12:00`.
- **Chegada do chefe:** é sorteada (carro ou helicóptero). Roteiros fixam `&chegada=carro`.
- **Paralelo:** rodar vários roteiros ao mesmo tempo já derrubou o navegador; rode um por vez.
- **Hora simulada:** roteiros que dependem da hora simulada pausam e saltam o relógio
  (`__HQ_TECH_QA__.pause` e `jumpToClock`), em vez de esperar o dia andar, e ligam o tempo real da
  cena (`realTime`) para o squad não andar em câmera lenta a um quadro por segundo; nesta classe de
  máquina (sem GPU, Chromium com swiftshader) use `HQ_TIMEOUT_SCALE=3`. O `qa:tecnologia` leva
  cerca de 25 minutos nela.
