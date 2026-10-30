# Backlog de melhorias — check geral de 2026-10-30

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
- **Botão "Replay demo"** no HUD (§16 pede botão de desenvolvimento) — pendente.
- **Botão "abrir no OpenMausBot"** no painel do agente — depende de Live com
  URL válida; pendente de integração real.

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
- **Navegação por teclado na sidebar** já funciona (botões nativos); foco
  visível refinado. Pendente refinamento de estilo de foco.

## 6. Ideias futuras (não priorizadas)

- Ciclo dia/noite com luz quente à noite.
- Visitante (persona sem agente) passeando no hall.
- Sons ambientes (teclado, passos) com mudo padrão.
- Exportar GIF do passeio do agente para compartilhar.
- Painel "projetos" com métricas reais quando a integração Live existir
  (nunca inventadas).
