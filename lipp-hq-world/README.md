# Lipp HQ World

Escritório virtual 3D da Lipp HQ: um diorama corporativo navegável onde os sete
agentes do OpenMausBot aparecem trabalhando nos seus departamentos.

A cena é Three.js real, renderizada em WebGL. Nada aqui é imagem de fundo, CSS 3D
ou vídeo.

## Requisitos

- Node 22 ou superior
- pnpm 12 ou superior
- Um navegador com WebGL 2

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
pnpm preview
```

## Verificações

```bash
pnpm typecheck   # TypeScript estrito
pnpm lint        # ESLint
pnpm build       # build de produção
node scripts/visual-qa/capture.mjs --serve
```

A captura visual abre o Chromium real, espera o primeiro frame da cena, tira os
screenshots em `qa/screenshots/` e reprova imagem chapada ou erro de console.

## Documentação

| Documento | Conteúdo |
| - | - |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | decisões, planta, módulos, sistema de paredes |
| [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) | backlog por stage |
| [docs/PROGRESS.md](docs/PROGRESS.md) | estado atual da implementação |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | contratos do OpenMausBot e proxy de leitura |
| [docs/ASSETS.md](docs/ASSETS.md) | avaliação de assets e decisão procedural |
| [docs/VISUAL_QA.md](docs/VISUAL_QA.md) | harness, rubrica e gates |

## Estado

Em desenvolvimento por stages. O estado real de cada etapa está em
[docs/PROGRESS.md](docs/PROGRESS.md) — não presuma que uma etapa está pronta sem
screenshot correspondente em `qa/screenshots/`.
