# Lipp HQ World

Escritório virtual 3D da Lipp HQ: um diorama corporativo navegável onde os sete
agentes do OpenMausBot (Argos, Forge, Pulse, Echo, Scout, Atlas e Ink) aparecem
trabalhando nos seus departamentos.

A cena é Three.js real, renderizada em WebGL — nada aqui é imagem de fundo, CSS
3D ou vídeo. A referência visual está em
`public/references/lipp-hq-threejs-referencia.png`.

## Requisitos

- Node 22 ou superior
- pnpm 12 ou superior
- Navegador com WebGL 2

## Rodar

```bash
cd lipp-hq-world
pnpm install
pnpm dev
```

Abre em `http://127.0.0.1:5173`.

Build de produção:

```bash
pnpm build
pnpm preview   # http://127.0.0.1:4173
```

## Controles

- **Botão direito + arrastar** gira a câmera em volta do escritório.
- **Roda do mouse** aproxima e afasta.
- **Clique** seleciona sala ou personagem; **clique no fundo** limpa.
- **Duplo clique** em uma sala anima o foco da câmera até ela.
- **Reset** na barra superior devolve a câmera inicial.
- **Paredes**: Auto (cutaway dinâmico), Baixas e Completas.

## Modo Demo e modo Live

A aplicação abre em **Demo**: um cenário determinístico rotulado como simulação
(exibe "Simulação" no topo e no feed) que exercita o ciclo completo — Forge
inicia a rotina, Pulse e Echo coletam, Scout investiga, Atlas atualiza, Ink
elabora, Forge consolida e tudo encerra.

O modo **Live** lê o estado real do OpenMausBot através de um proxy de leitura
same-origin, com o token fora do navegador. Ele é só de leitura: nenhum comando
vai para o servidor dos agentes. Para ativar:

1. Configure o proxy de leitura (contratos e regras em
   [docs/INTEGRATION.md](docs/INTEGRATION.md)) e defina `VITE_HQ_PROXY` com a
   base dele (ex.: `/hq`).
2. Rode `pnpm build` e sirva o `dist/` na mesma origem do proxy.

Sem proxy configurado, a aplicação fica em Demo e diz isso na interface — nunca
finge que está ao vivo.

## Verificações

```bash
pnpm typecheck   # TypeScript estrito
pnpm lint        # ESLint
pnpm build       # build de produção
node scripts/visual-qa/capture.mjs --serve
```

A captura visual abre o Chromium real, espera o primeiro frame, posiciona a
câmera por uma ponte de QA determinística (incluindo arrastos reais com o botão
direito) e reprova captura chapada, enquadramento fora do centro, capturas
idênticas e erro de console. O resultado fica em `qa/screenshots/manifest.json`.

## Documentação

| Documento | Conteúdo |
| - | - |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | decisões, planta, módulos, sistema de paredes |
| [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) | backlog por stage |
| [docs/PROGRESS.md](docs/PROGRESS.md) | estado atual da implementação |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | contratos verificados do OpenMausBot e proxy de leitura |
| [docs/ASSETS.md](docs/ASSETS.md) | avaliação de assets e decisão procedural |
| [docs/VISUAL_QA.md](docs/VISUAL_QA.md) | harness, rubrica e gates |

## Estado

Em desenvolvimento por stages, com gate visual GO/NO-GO por etapa. O estado real
está em [docs/PROGRESS.md](docs/PROGRESS.md) — relatórios de revisão em
`qa/reviews/`.
