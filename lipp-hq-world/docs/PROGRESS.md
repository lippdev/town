# Progresso

Memória operacional da implementação. Atualizado ao fim de cada ciclo, antes de
qualquer commit.

## Validação final no `main` (2026-11-03, 16:32)

Rodada depois de mergear todas as PRs do ciclo, no commit `1204146`:

| Verificação                  | Resultado                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm typecheck`             | limpo                                                                                   |
| `pnpm lint`                  | 0 problemas                                                                             |
| `pnpm test`                  | **79 testes** passando                                                                  |
| `pnpm build`                 | ok                                                                                      |
| `hermes-capture`             | `ok: true` — 7 bots, 21 sessões, 6 rotinas, 4 endpoints, link do dashboard              |
| `hermes-resilience`          | `ok: true` — gateway caindo e voltando, frota preservada                                |
| `meeting-capture`            | `ok: true` — briefing leva os bots à sala                                               |
| `character-editor`           | `ok: true` — 10/10 (malhas, cores, altura, storage, reload, restaurar)                  |
| `capture` (Demo)             | `ok: true` — 24 capturas, 0 chapadas, 0 fora de centro, 0 duplicadas, 0 erro de console |
| `contract-check --self-test` | contrato completo                                                                       |

Métrica honesta de render nesta máquina: **1,3 fps** (1 vCPU, SwiftShader por
software). É o número medido, não uma estimativa.

## Ciclo 2026-11-03 (tarde) — frota Hermes completa

| Área        | Estado                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Sessões     | aba com origem, recência e drill-down por bot; bloco no painel                                             |
| Rotinas     | agenda com `schedule_display`, última execução, falha de execução e de entrega, sequência de falhas        |
| Diagnóstico | aba Integrações com status, latência e erro cru por endpoint + "testar agora"                              |
| Dashboard   | link por bot escopado em `?profile=`                                                                       |
| Contrato    | `pnpm contract:check` contra instância real, com `--self-test` na CI                                       |
| Personagem  | editor por peça (pele, cabelo cor+estilo, acessório, calça, sapato, camisa, altura), persistido por agente |
| QA          | job `visual` com 5 harnesses (frota, resiliência, reunião, editor, contrato) + 24 capturas                 |

**Limite conhecido:** toda prova de integração rodou contra
`scripts/hermes/fixture-gateway.mjs`, que reproduz o contrato lido do código do
Hermes. Nenhuma instância real foi apontada ainda — `pnpm contract:check` fecha
essa lacuna em um comando.

**Não implementado de propósito:** "precisa de você" (bot esperando decisão
humana). O Hermes só sabe disso no estado local do CLI
(`hermes_cli/cli_status_bar_mixin.py:753` — modais de aprovação/clarify) e as
tarefas bloqueadas por `needs_input` vivem no kanban, que não tem rota no
dashboard. Expor isso exigiria inventar sinal.

## Estado atual

**Stage em andamento:** nenhum — **auditoria geral fechada: 39/40, GO**.

**Cadeia de gates:** Stage 0 GO · Stage 1 GO · Stage 2 GO (bloqueante) ·
Stages 3–4 GO · Stages 5–6 integrados · Stage 7 final **38/40** ·
Stage 8 polimento **GO** · Stage 9 refinamentos **GO** ·
Auditoria geral **39/40 GO** (3 violações de spec corrigidas, testes, CI,
responsividade, conteúdo nos quadros).

**Métrica honesta de render:** 1,3 fps nesta máquina de QA (1 vCPU,
SwiftShader por software). Em GPU dedicada o caminho de render é o mesmo.

**Cadeia de gates:** Stage 0 GO · Stage 1 GO · Stage 2 GO (bloqueante) ·
Stages 3–4 GO · Stages 5–6 integrados · Stage 7 final **38/40**.

## Provas mecânicas do Gate 2 (harness)

Bateria de 18 capturas em 1440×900, Chromium 156 + WebGL 2 (SwiftShader), zero
erro de console. `qa/screenshots/manifest.json`:

| Prova                        | Resultado                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Cutaway por vista            | norte 11, leste 11, sul 11, oeste 11 — exatamente as paredes voltadas para a câmera em cada lado |
| Arrasto real (botão direito) | azimute 40,31° → −78,98° em um arrasto; alvo fixo em [0,0,0]                                     |
| Arrasto vertical             | elevação 37,33° → 65,94°                                                                         |
| Seleção por clique           | centro → `hall`; fundo → seleção limpa                                                           |
| Foco por duplo clique        | Engenharia centrada (cx 0,5046), a 26 unidades, largura da sala em 44% do quadro                 |
| Reset                        | vista volta exata: az 40,31°, el 37,33°, dist 54,42                                              |
| Estabilidade em diagonal     | az 40°→46°: 11→11 paredes em cutaway; sem flicker                                                |
| Enquadramento                | prédio centrado (cx 0,5051) em 76% da largura do quadro                                          |

## Bugs encontrados e consertados nesta etapa

1. **Botão direito fazia pan em vez de girar.** Duas causas somadas: o
   `HQScene` montava um `OrbitControls` cru do drei com o mapeamento padrão
   (esquerdo gira, direito pan), e `MOUSE.ROTATE` vale 0 — usar o código do
   botão (2) no lugar da ação selecionava `MOUSE.PAN`. Corrigido com
   configuração imperativa no `CameraRig` e mapeamento
   `{ LEFT: -1, MIDDLE: DOLLY, RIGHT: ROTATE }`.
2. **Foco de sala parava a câmera dentro do prédio** (15 unidades). Distância
   agora é `clamp(largura × 2,4, 26, 36)`.
3. **Capturas podiam fotografar o resíduo de damping**: o harness agora espera
   a vista assentar (duas leituras idênticas) antes de fotografar.

## Pendências (pós-MVP, todas de polimento)

- Luz de interiores progressivamente mais quente.
- Live real: instância do OpenMausBot acessível + proxy deployado.
- Hover em personagens (hoje hover destaca só salas).
