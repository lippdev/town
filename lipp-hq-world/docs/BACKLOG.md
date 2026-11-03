# Backlog de melhorias

## 0. Fechado em 2026-11-03 (rodada Hermes)

- ✅ **Visão dos bots do Hermes via gateway** — frota, sessões e rotinas lidas do
  dashboard + API server, com proxy de leitura e contrato verificado no repo do
  Hermes ([HERMES.md](HERMES.md)).
- ✅ **Sala de reunião dirigida por briefing** — briefing diário/semanal/mensal
  leva os bots à mesa, com três evidências exigidas e quadro na parede.
- ✅ **Leitura resiliente** — backoff, pausa com aba oculta, frota mantida e
  marcada como atrasada em vez de zerar.
- ✅ **Busca, filtros e teclado na frota** — com foco visível (fecha o item de
  acessibilidade que estava aqui).
- ✅ **Histórico real em sparkline** — tendência dos últimos minutos no resumo.
- ✅ **QA visual na CI** — job `visual` roda os três harnesses do Hermes e as 24
  capturas da cena em todo PR.
- ✅ **Sessões com drill-down** — aba Sessões com origem (`cron`, `cli`,
  `telegram`…), recência real e bloco de sessões no painel do bot; o número do
  resumo deixou de ser um beco sem saída.

## Check geral de 2026-10-30

Auditoria completa após o MVP: conformidade com a spec, código, integração,
performance e QA. Itens marcados com ✅ foram resolvidos no mesmo dia da
auditoria; os demais estão prontos para execução.

## 1. Conformidade com a spec (críticos)

- ✅ **DemoDriver rodava em modo Live** — misturaria evento fictício com real,
  violando §9.1 ("nunca apresente uma simulação como evento real"). O driver
  agora só roda quando a fonte é Demo.
- ✅ **"Meeting" deslizava através de paredes** — a transição usava
  interpolação direta até a mesa de reuniões, ignorando navegação (§8.4:
  personagens não atravessam paredes). Agora anda por A* até a mesa e só
  então assume a pose.
- ✅ **Demo não era determinístico** — `Math.random` nos passeios de idle
  (§9.8). Substituído por hash determinístico do id do agente.
- ✅ **Contrato SSE verificado no fork** — frames `data:` sem nome com
  `id: stream:seq`; o adaptador escutava certo. Documentado em
  INTEGRATION.md.

## 2. Robustez e qualidade de código

- ✅ **Testes unitários** para os módulos puros (`occlusion.ts`, `navGrid.ts`,
  `solidPieces`) com Vitest — interseção de segmentos, histerese, caminhos
  desviando de paredes e móveis.
- ✅ **CI no repositório** — GitHub Actions rodando typecheck, lint e build na
  PR e na main.
- ✅ **Lint limpo** — erros de variável morta, `no-self-assign` e warnings de
  tipo resolvidos; script de debug removido.
- ✅ **Código morto removido** — exports sem consumidor (`DECOR_PALETTE`,
  `hallDecor`, `applyAgentState`), `frames.current` nunca lido, hacks `void`.
- ✅ **README da raiz** atualizado (apontava para um "dashboard" que não é o
  produto) e imagem de referência deduplicada (2,4 MB em dois lugares).
- ✅ **Fallback sem WebGL** — detecção no boot com mensagem amigável em vez de
  tela preta.
- ✅ **Tela de carregamento** com rótulo até o primeiro frame.

## 3. Requisitos da spec ainda não cobertos

- ✅ **Capturas responsivas** — 1280×800, 1366×768 e 1920×1080 no harness
  (§13.4).
- ✅ **Friso no topo das paredes** — acabamento visível na referência.
- ✅ **Conteúdo nos quadros** — o quadro de fluxo do Forge com caixas e setas
  desenhadas, post-its no Kanban do Atlas (antes eram superfícies lisas).
- ✅ **Papéis na mesa** — folhas espalhadas em cada estação.
- ✅ **Máquina de café no hall** — ponto de encontro.
- ✅ **Rótulo flutuante no personagem em hover** — nome sobre a cabeça.
- ✅ **Botão "Replay demo"** no HUD (§16 pede botão de desenvolvimento).
- ✅ **Botão "abrir no dashboard"** no painel do agente — leva ao dashboard do
  Hermes já escopado no profile daquele bot (`?profile=`). O item antigo falava
  em OpenMausBot e ficou obsoleto com a troca de fonte.

## 4. Performance (métricas honestas)

- ✅ **Materiais compartilhados** por chave visual — menos compilações e trocas
  de estado.
- ✅ **FPS medido de verdade** no relatório de QA (1,3 fps nesta máquina de
  render por software; número registrado, não estimado).
- ✅ **Code-splitting** — o bundle principal caiu de 1.156 kB para 244 kB
  (77,5 kB gzip); three.js + cena carregam em chunk próprio após o primeiro
  paint.
- **Instancing** para cadeiras e plantas — avaliado e recusado por enquanto:
  ~600 draw calls de geometria simples já rodam a 60 FPS em GPU dedicada, e o
  gargalo real é o render por software da máquina de QA (1,3 fps). A
  reestruturação dos componentes para `<Instances>` vale só se a cena crescer
  muito (mais móveis, mais agentes) — registrado como gatilho futuro.

## 5. Acessibilidade e UX

- ✅ **`prefers-reduced-motion`** respeitado de verdade: câmera sem
  amortecimento, foco/reset instantâneos e anel estático (a marcação anterior
  estava incorreta — a auditoria a corrigiu).
- ✅ **Cursor de apontador** sobre salas e personagens clicáveis.
- ✅ **Navegação por teclado na sidebar** — setas movem a seleção na frota e
  abrem o painel do bot; foco visível estilizado.

## 6a. Descartado com evidência

- **"Precisa de você" no HUD** — sinal de bot esperando decisão humana não existe
  no gateway: o CLI sabe (`cli_status_bar_mixin.py` lê modais de aprovação,
  clarify, sudo e secret) e o kanban marca tarefas com `needs_input`, mas nenhuma
  rota do dashboard serve kanban. Derivar de `waiting` seria inventar semântica
  que o Hermes não reporta. Reabrir se o dashboard publicar o estado de atenção.

## 6. Ideias futuras (não priorizadas)

- Ciclo dia/noite com luz quente à noite.
- Visitante (persona sem agente) passeando no hall.
- Sons ambientes (teclado, passos) com mudo padrão.
- Exportar GIF do passeio do agente para compartilhar.
- Painel "projetos" com métricas reais quando a integração Live existir
  (nunca inventadas).

## 7. Multi-bot — veredito de 2026-10-30 (OpenBot e GrokBot)

Pergunta: o app (visão por cima do OpenMausBot) serve também para OpenBot
(nightly-labs/openbot) e GrokBot? Veredito, com contratos verificados no
clone do repo (`~/.capy/work/openbot`, commit de 2026-10-29): **backlog para
os dois**. OpenMausBot continua sendo o alvo primário e nada muda nele.

### OpenBot — viável, mas 2–3× o esforço do adapter do OpenMausBot

O que existe de verdade no repo:

- **Team API HTTP versionada** (`src/main/team-api/`, rotas em
  `packages/contracts/src/team-api-routes.ts`): `GET /v1/agents` (coleção),
  `GET /v1/agents/status` (fase, auth, capacidades, mensagem) e conversa/
  fila por agente. Ou seja, dá para ler agentes de verdade.
- **Eventos só por WebSocket** — `GET /v1/events` responde 426
  ("Use WebSocket for remote events", `route-team.ts`). Não é SSE como no
  OpenMausBot; o adaptador precisa de cliente WS com reconexão própria.
- **Fase ≠ atividade.** `AgentPhase` é `idle | starting | ready | restarting
| blocked | stopped` — estado do runtime do CLI, não "trabalhando na
  tarefa X". Derivar working/waiting exige interpretar presença
  (`GET /v1/team/presence`) + fila/conversa. No OpenMausBot o campo
  `activity` já vem pronto; no OpenBot é inferência nossa.
- **Auth por conta OpenBot** (código por e-mail) mesmo self-hosted. O modelo
  do nosso proxy de leitura same-origin resolve (o proxy guarda a sessão,
  como já faz com o token do OpenMausBot), mas é um pré-requisito a mais.
- **"Development preview"**: o repo declara preview e o contrato se protege
  de version skew (strings abertas em `AgentStatus.kind`) — o que confirma
  que a API pode mudar entre releases. Integrar hoje é mirar em areia
  moviça, sem versão estável para testar.

Por que não agora: sem instância OpenBot rodando com conta para testar, o
adaptador ficaria no mesmo estado em que o Live do OpenMausBot estava antes
do proxy — código sem prova. E o mapeamento para a cena muda de conceito: os
7 personagens são os agentes reais da Lipp HQ no OpenMausBot; para OpenBot,
a lista de agentes é arbitrária e precisa de política genérica de
nome→personagem (escopo V0 continua Lipp HQ only).

Quando pegar: depois do Live do OpenMausBot provado de ponta a ponta, com
uma instância OpenBot self-hosted disponível para teste real.

### GrokBot — sem API pública; automatizar o app não é integração

GrokBot (produto desktop da xAI) **não expõe API** — projetos da comunidade
confirmam por tabela: o `grokbot-bridge` existe porque "It doesn't have an
API, so other agents can't hand it work", e o `grokbot-cdp` só funciona
anexando via Chrome DevTools Protocol no Electron do app. Integrar hoje
significaria automação de UI/CDP — frágil, não suportada, e contra as
regras de honestidade do projeto (dados raspadinhos de uma interface não
oferecida não são um contrato). Backlog até a xAI publicar uma API.

Ressalva: o OpenBot se chamava "Grok Bot" até ago/2026 (rename no próprio
repo); se "GrokBot" aqui for outro produto, o veredito precisa do contrato
dele — mas todo GrokBot sem API conhecida cai no mesmo lugar.

### Ponto de extensão que já existe (nada a fazer agora)

A interface `HQSource` existe (`src/integrations/hq/types.ts`) e o Hermes a
implementa; o adaptador do OpenMausBot continua no repositório como fonte
alternativa, pronto para ser ligado ao mesmo contrato quando fizer sentido.
