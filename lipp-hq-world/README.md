# Lipp HQ World

Escritório virtual 3D da Lipp HQ: um diorama corporativo navegável que é, acima
de tudo, a **visão dos bots do Hermes** — cada bot da frota aparece trabalhando
no seu departamento, com estado, sessões e rotinas lidos do gateway.

O foco do produto é o Hermes. Em Demo (sem gateway), a cena usa os sete agentes
da Lipp HQ como frota simulada, sempre rotulada como simulação.

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

### Ligar no Hermes

O app lê o Hermes por um proxy de leitura same-origin (`/api/hq`), que roda no
dev e no preview do Vite. Aponte para a sua instância:

```bash
# padrões: API em 8642, dashboard em 8000
HERMES_API_URL=http://127.0.0.1:8642 \
HERMES_DASHBOARD_URL=http://127.0.0.1:8000 \
pnpm dev
```

Com autenticação:

```bash
HERMES_API_KEY=...            # vira Authorization: Bearer no API server
HERMES_DASHBOARD_TOKEN=...    # vira Authorization: Bearer no dashboard
```

A chave fica **no proxy**, nunca no navegador. Sem Hermes respondendo, o app
declara "Hermes fora do ar" e cai em Demo — não inventa frota.

Contrato completo, endpoints e limites em [docs/HERMES.md](docs/HERMES.md).

Sem uma instalação do Hermes à mão, o fixture local responde os mesmos
endpoints com os mesmos formatos:

```bash
node scripts/hermes/fixture-gateway.mjs   # 8642 + 8000 (fixture, não é o Hermes)
pnpm dev
```

Build de produção:

```bash
pnpm build
pnpm preview   # http://127.0.0.1:4173
```

## O que a tela mostra

- **Bots** — a frota real, com busca, filtros por estado e navegação por teclado.
- **Briefing** — quem está na sala de reuniões agora (briefing diário/semanal/mensal
  detectado de sessão de rotina real) e a agenda de briefing de cada bot.
- **Rotinas** — a agenda por bot, vinda de `hermes cron`.
- **Resumo** — trabalhando / aguardando / ociosos / sessões / rotinas, com
  sparkline do histórico real dos últimos minutos.
- **Painel do bot** — atividade em curso (título da sessão), sessões, rotinas,
  modelo e a biblioteca de personagens.

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
pnpm test        # Vitest (51 testes: frota, briefings, resiliência, busca, histórico)
pnpm build       # build de produção

# QA visual em Chromium real
node scripts/visual-qa/hermes-capture.mjs     # frota via gateway
node scripts/visual-qa/hermes-resilience.mjs  # gateway caindo e voltando
node scripts/visual-qa/meeting-capture.mjs    # sala de reunião com briefing
node scripts/visual-qa/capture.mjs --serve    # 24 capturas da cena
```

A captura visual abre o Chromium real, espera o primeiro frame, posiciona a
câmera por uma ponte de QA determinística (incluindo arrastos reais com o botão
direito) e reprova captura chapada, enquadramento fora do centro, capturas
idênticas e erro de console. O resultado fica em `qa/screenshots/manifest.json`.

**Tudo isso roda em CI** (`.github/workflows/qa.yml`, job `visual`) em todo PR.
Não é ritual manual: lint, tipos e build passaram por três bugs reais que só a
tela mostrava.

## Documentação

| Documento | Conteúdo |
| - | - |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | decisões, planta, módulos, sistema de paredes |
| [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) | backlog por stage |
| [docs/PROGRESS.md](docs/PROGRESS.md) | estado atual da implementação |
| [docs/HERMES.md](docs/HERMES.md) | contrato verificado do gateway Hermes, proxy e briefings |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | contrato do OpenMausBot (fonte alternativa) |
| [docs/ASSETS.md](docs/ASSETS.md) | avaliação de assets e decisão procedural |
| [docs/VISUAL_QA.md](docs/VISUAL_QA.md) | harness, rubrica e gates |

## Estado

Em desenvolvimento por stages, com gate visual GO/NO-GO por etapa. O estado real
está em [docs/PROGRESS.md](docs/PROGRESS.md) — relatórios de revisão em
`qa/reviews/`.
