# Integração com o Hermes (gateway)

O Lipp HQ World é a **visão dos bots do Hermes sobre o escritório**. Ele lê o
Hermes via gateway e nunca escreve, comanda ou aprova nada: nenhum POST, PATCH
ou DELETE sai do navegador em direção ao Hermes.

Contrato verificado no repositório `NousResearch/hermes-agent` (clone em
`~/.capy/work/hermes-agent`, commit de 2026-11-02), com os arquivos citados
abaixo.

## Os dois serviços lidos

O Hermes expõe duas superfícies HTTP, e cada uma serve uma parte da visão:

| Serviço | Padrão | De onde vêm | Usamos para |
| --- | --- | --- | --- |
| API server (`hermes gateway`) | `http://127.0.0.1:8642` | `gateway/platforms/api_server.py` | saúde e versão do gateway |
| Dashboard (`hermes dashboard`) | `http://127.0.0.1:8000` | `hermes_cli/web_routers/*.py` | a frota (bots), as sessões e as rotinas |

O gateway sozinho não expõe a frota: a projeção de sessão do API server
(`_session_response`, `api_server.py:2440`) remove `profile_name` de propósito.
Quem sabe quais bots existem é o dashboard.

### Endpoints usados (somente GET)

```text
GET /health                          (API server)  → { status, platform, version }
GET /api/profiles                    (dashboard)   → { profiles: [...] }
GET /api/profiles/sessions?limit=200 (dashboard)   → { sessions: [...], profile_totals }
GET /api/cron/jobs                   (dashboard)   → { jobs: [...] }
```

Formato de `profiles[]` (`_profile_to_dict`, `web_routers/profiles.py:84`):

- `name`, `display_name`, `bot_title`, `description`
- `model`, `provider`
- `is_default`, `gateway_running`, `skill_count`, `has_alias`

Cada linha de `sessions[]` vem **marcada com o `profile` dono**
(`_tag_rows`, mesma rota) e traz a atividade real:

- `title`, `preview` — o que o bot está fazendo
- `last_active`, `started_at`, `ended_at` — em segundos (epoch)
- `message_count`, `tool_call_count`, `input_tokens`, `output_tokens`
- `estimated_cost_usd`, `model`

Rotinas (`/api/cron/jobs`): `id`, `name`, `profile`, `enabled`, `paused`,
`schedule`, `next_run` (segundos).

### Sessões no HUD

O número do resumo ("21 sessões") tem drill-down. Cada bot carrega as
`SESSION_PREVIEW_LIMIT` (6) sessões mais recentes, com `id`, `title`, `preview`,
`source`, `model`, `messageCount`, `toolCallCount`, custo e `active` — esta
última usando a **mesma** heurística do Hermes (`ended_at` nulo e visto nos
últimos 5 min), não uma regra nossa. O total continua em `sessionCount`, então
cortar a janela não inventa número menor.

A aba **Sessões** lista a frota inteira da mais recente para a mais antiga e
mostra a origem crua traduzida só onde muda de sentido (`cron` → rotina,
`cli` → terminal); o resto aparece como veio (`telegram`, `dashboard`). Clicar
leva ao painel do bot dono. Sessão sem `last_active` vai para o fim em vez de
fingir recência.

A origem usada pelo fixture segue `KNOWN_SOURCES`
(`hermes_cli/session_lost_and_found.py`): `cli`, `telegram`, `dashboard`, `cron`.

## Derivação de estado (sem inventar nada)

`src/integrations/hermes/botsFromHermes.ts`:

- Sessão **ativa** = aberta (`ended_at` nulo) e vista nos últimos 5 min — a
  mesma janela que o Hermes usa em `/api/status`
  (`web_routers/status.py:78`).
- Bot **trabalhando** = escreveu nos últimos 90 s — a janela que o Bot Mode
  usa para "Active now" (`website/docs/user-guide/bot-mode.md`).
- Bot com sessão aberta recente e sem escrita agora = `waiting`.
- Bot sem sessão alguma = `idle`, com atividade **ausente**. A UI mostra
  "sem sinal"; nunca preenchemos um texto fictício.
- Sem dashboard, os bots são nomeados a partir das sessões em vez de a frota
  desaparecer.

## Proxy de leitura (credencial fora do navegador)

`server/hermesProxy.ts` roda no dev e no preview do Vite e serve `/api/hq`:

```text
GET /api/hq/status            → configuração ativa (sem segredos)
GET /api/hq/hermes/snapshot   → { health, profiles, sessions, jobs, blocks }
```

Variáveis lidas **pelo proxy** (nunca pelo navegador):

| Variável | Padrão | Função |
| --- | --- | --- |
| `HERMES_API_URL` | `http://127.0.0.1:8642` | API server |
| `HERMES_DASHBOARD_URL` | `http://127.0.0.1:8000` | dashboard |
| `HERMES_API_KEY` | — | vira `Authorization: Bearer` no API server |
| `HERMES_DASHBOARD_TOKEN` | — | vira `Authorization: Bearer` no dashboard |
| `HERMES_TIMEOUT_MS` | `5000` | timeout de cada leitura |

Um serviço fora não derruba o outro: o snapshot traz um bloco de estado por
endpoint (`blocks`) e a UI diz exatamente o que faltou. `401/403` do dashboard
aparece como "dashboard exigiu autenticação: defina HERMES_DASHBOARD_TOKEN".

## Provando sem uma instalação real

`scripts/hermes/fixture-gateway.mjs` sobe os dois serviços na mesma porta
padrão com os formatos acima e dados que evoluem com o tempo. Ele existe para
o harness de QA e para desenvolvimento; **não é o Hermes**.

```bash
node scripts/hermes/fixture-gateway.mjs   # 8642 + 8000
pnpm dev                                  # app em 5173 lendo o fixture
```

Contra um Hermes real nada muda no app: `hermes dashboard` e
`hermes gateway` já respondem nesses endereços.

## Sala de reuniões e briefings

Quando um bot está fazendo o **briefing** (diário, semanal ou mensal), ele vai
para a sala de reuniões e senta numa cadeira — o mesmo assento entre polls.

A detecção (`src/integrations/hermes/briefings.ts`) exige três evidências do
Hermes, todas verificáveis na sessão mais recente do bot:

1. `source: "cron"` — a sessão foi disparada por rotina;
2. atividade nos últimos 20 minutos;
3. título (ou nome da rotina do bot) classificando o tipo:
   `diário|daily`, `semanal|weekly`, `mensal|monthly`, ou `briefing|resumo|standup`.

Sem as três, o bot fica no posto — nada de reunião inventada. O quadro na parede
da sala mostra o tipo e quem está lá, e volta ao estado neutro quando o briefing
acaba.

## Limites honestos

- **Somente leitura.** Não iniciamos turnos, não pausamos rotinas, não
  aprovamos nada. O botão "abrir no Hermes" fica no backlog até existir uma
  superfície de link estável.
- **Sem WebSocket.** O dashboard usa socket para eventos; aqui a leitura é
  polling (padrão 4 s). Latência de alguns segundos é esperada e declarada.
- **Sem dashboard não há frota nomeada.** A UI mostra "gateway degradado" e a
  origem dos dados, em vez de inventar bots.
