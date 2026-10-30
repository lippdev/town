# Plano de execução

Backlog de tarefas pequenas, agrupadas por stage. Cada stage fecha com um PR e um
relatório em `qa/reviews/`. O estado atual fica em [PROGRESS.md](PROGRESS.md).

## Stage 0 — Discovery técnico ✅

- [x] Inspecionar ambiente: Node 24, pnpm 12, Chromium 156 do sistema
- [x] Confirmar WebGL2 em headless (`--use-angle=swiftshader`)
- [x] Confirmar screenshot real do canvas
- [x] Identificar a referência visual em `public/references/`
- [x] Inspecionar contratos do OpenMausBot (`WireBot`, `ServerFrame`, `BotActivity`, SSE)
- [x] Definir estratégia segura de integração (proxy de leitura, somente GET)
- [x] Definir contratos TypeScript (`src/types/hq.ts`)
- [x] Criar plano e documentação
- [x] Confirmar revisão visual multimodal do subagente

## Stage 1 — Fundação e mapa 3D ✅

- [x] Gerador de pisos por sala
- [x] Gerador de paredes a partir das bounds das salas
- [x] Portas como vãos reais com verga
- [x] Muros de perímetro dos corredores
- [x] Pisos diferenciados (sala, corredor, hall)
- [x] Placas de identificação por departamento
- [ ] Iluminação por sala (movida para o Stage 3)
- [x] Screenshots de overview e perspectiva alternativa

## Stage 2 — Câmera e paredes dinâmicas (bloqueante) ✅

- [x] OrbitControls com botão direito para rotação
- [x] Bloqueio de menu de contexto só no canvas
- [x] Limites de zoom e ângulo
- [x] Foco suave em sala
- [x] Reset de câmera
- [x] `occlusion.ts` puro com interseção de segmentos 2D
- [x] Histerese de entrada e saída
- [x] `useWallVisibility` com interpolação em `useFrame`
- [x] Três modos de parede: auto, baixa, completa
- [x] Painel oculto sai do raycast
- [x] Teste real de arrasto com botão direito
- [x] Screenshots dos quatro lados e duas diagonais

## Stage 3 — Ambientação ✅

- [x] Componentes de mobiliário reutilizáveis
- [x] Estação por departamento com identidade própria
- [x] Sala de reuniões e hall
- [x] Plantas, estantes, quadros e detalhes
- [x] Ajuste de materiais e sombras

## Stage 4 — Personagens e navegação ✅

- [x] Figura low-poly com cabeça, tronco, braços e pernas
- [x] Identidade visual por agente
- [x] Máquina de estados de animação
- [x] Grid de navegação com obstáculos
- [x] A* e suavização de caminho
- [x] Caminhada com orientação gradual
- [x] Seleção por clique e painel do agente

## Stage 5 — Estados e integração

- [ ] Store Zustand com estado dos agentes
- [ ] Adaptador Demo determinístico com contrato `HQEvent`
- [ ] Adaptador Live com snapshot e SSE
- [ ] Reconexão, deduplicação e resync
- [ ] Proxy de leitura com allowlist e sanitização
- [ ] Indicador Live/Demo e estado de conexão

## Stage 6 — Interface

- [ ] Sidebar compacta
- [ ] Barra superior com modo, conexão e hora
- [ ] Feed de atividades recolhível
- [ ] Painel do agente e do departamento
- [ ] Controles de câmera e de paredes
- [ ] Estados de loading, erro e offline

## Stage 7 — Polimento e entrega

- [ ] Reduzir draw calls e materiais duplicados
- [ ] Enquadramento inicial revisado
- [ ] Build de produção
- [ ] QA visual completo (todas as capturas obrigatórias)
- [ ] Relatório final com rubrica
- [ ] README de execução para outro desenvolvedor
