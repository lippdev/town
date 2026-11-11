# Trabalho em andamento

Ponto de retomada para continuar de outro computador ou em outra sessão. Atualize ao pausar
ou ao fechar um ciclo. Última atualização: 2026-11-11.

## Onde estamos

A demonstração do escritório (`/?escritorio=completo&modo=demonstracao`) está completa na
`main`: prédio de 14 pavimentos com térreo, Operação (bots), quatro andares de expansão com
figurantes, Diretoria com o chefe, esconderijo secreto, heliporto com voos, cidade estilo
Gotham com ciclo de dia e noite pelo horário de Brasília, e primeiro carregamento leve.
Detalhes em [ESCRITORIO.md](ESCRITORIO.md).

### Arquivado: cenário de tecnologia

Um andar com um squad simulado (Notion, GitHub, Slack, M365) para testar se um "campo
virtual" agregaria ao time mais que um dashboard. Em 2026-11-11 o Filipe decidiu não
apresentar a ideia à empresa: o prédio segue só para os bots do Hermes. Nada entrou na
`main`; as PRs [#111](https://github.com/lippdev/town/pull/111) a
[#118](https://github.com/lippdev/town/pull/118) foram fechadas sem merge e as branches
`feat/tecnologia-*` ficam no remoto caso a ideia volte.

### Próximos passos (bots)
- Ver a tela dos bots do Hermes (sessão e ferramenta em uso) ao abrir um bot.

### Ideias anotadas, sem prioridade
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

Armadilhas conhecidas:
- **Navegador:** os roteiros procuram o Chrome em `/usr/bin/google-chrome` (servidor sem GPU)
  e caem no Chromium do Playwright quando ele não existe. O `character-editor` ainda não tem
  esse fallback: passe `CHROME_PATH` com o caminho de `require('playwright').chromium.executablePath()`.
- **Hora:** o céu segue o relógio. Roteiros que medem pixels fixam `&hora=12:00`.
- **Chegada do chefe:** é sorteada (carro ou helicóptero). Roteiros fixam `&chegada=carro`.
- **Paralelo:** rodar vários roteiros ao mesmo tempo já derrubou o navegador; rode um por vez.
