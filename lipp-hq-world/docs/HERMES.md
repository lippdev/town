# Integração com o Hermes (gateway)

O Lipp HQ World é a **visão dos bots do Hermes sobre o escritório**. Ele lê o
Hermes via gateway e nunca escreve, comanda ou aprova nada: nenhum POST, PATCH
ou DELETE chega ao Hermes. O único POST/DELETE do app é o da própria conexão
(link + token), que fica no proxy local.

Contrato verificado no repositório `NousResearch/hermes-agent` (clone em
`~/.capy/work/hermes-agent`, commit de 2026-11-02), com os arquivos citados
abaixo.

## Os dois serviços lidos

O Hermes expõe duas superfícies HTTP, e cada uma serve uma parte da visão:

| Serviço                        | Padrão                  | De onde vêm                       | Usamos para                             |
| ------------------------------ | ----------------------- | --------------------------------- | --------------------------------------- |
| API server (`hermes gateway`)  | `http://127.0.0.1:8642` | `gateway/platforms/api_server.py` | saúde e versão do gateway               |
| Dashboard (`hermes dashboard`) | `http://127.0.0.1:8000` | `hermes_cli/web_routers/*.py`     | a frota (bots), as sessões e as rotinas |

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

Rotinas (`/api/cron/jobs`) — campos lidos de `cron/jobs.py`:

- `id`, `name`, `profile`, `enabled`, `state` (`scheduled`/`paused`), `paused`
- `schedule` (objeto) e `schedule_display` (texto pronto, ex.: `0 9 * * *`)
- `next_run_at` e `last_run_at` — **ISO-8601** no Hermes atual
- `last_status` (`ok`, `error`, `delivery_failed`, `delivery_queued`, `cancelled`),
  `last_error`, `failure_streak`

O app aceita ISO-8601, segundos epoch e milissegundos para esses carimbos
(`cronTimestampMs`): versões antigas e o fixture usam segundos, o Hermes atual usa
ISO, e ler só um dos formatos faria toda rotina real aparecer como "sem agenda".

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
## Abrir no dashboard

O painel do bot tem o link "Abrir no dashboard do Hermes", que aponta para
`<HERMES_DASHBOARD_URL>/?profile=<nome do bot>` — `profile` é o parâmetro que o
próprio dashboard lê para abrir escopado naquele profile
(`apps/desktop/src/app/gateway/hooks/use-gateway-boot-webapp-profile`). Abre em
aba nova com `rel="noopener noreferrer"`.

Sem `HERMES_DASHBOARD_URL` ou fora do modo ao vivo, o link não aparece: ausente
é melhor que quebrado.

## Diagnóstico na tela

A aba **Integrações** mostra o resultado da última leitura de cada endpoint, com
latência medida no proxy (`getJson` cronometra a chamada, inclusive a falha):

| Linha | Endpoint | Fonte |
| --- | --- | --- |
| API server | `/health` | `HERMES_API_URL` |
| Dashboard | `/api/profiles` | `HERMES_DASHBOARD_URL` |
| Sessões | `/api/profiles/sessions` | idem |
| Rotinas | `/api/cron/jobs` | idem |

O bloco `blocks` do snapshot (já existia, era descartado) carrega `ok`, `status`,
`error` e `ms` por endpoint; o HUD resume em "tudo respondendo", "respondendo em
parte", "sem resposta" ou "ainda sem leitura", lista o erro **cru** do Hermes e
mostra modo, URLs, se há chave/token (nunca o valor) e o botão "testar agora",
que usa o mesmo caminho do `gatewayRefresh`.

É a primeira tela a abrir quando um bot não aparece: ela diz qual dos quatro
endpoints falhou, se foi HTTP 401 (token ausente) ou falta de resposta.

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

## Conectar com link + session token (como o Hermes Desktop)

A aba **Integrações** tem o mesmo par de campos do Hermes Desktop no modo
"token" de gateway remoto (`apps/desktop/electron/connection-config.ts` e
`src/components/remote-setup/fields.tsx`):

1. **Link do dashboard.** Aceita sem esquema (`100.64.0.1:9119`,
   `homelab.lan:9119`) e vira `http://`. Só http e https passam. O padrão do
   `hermes dashboard` é a porta **9119** (`hermes_cli/main_dashboard.py`).
2. **Session token.** Vai no header `X-Hermes-Session-Token`, o mesmo do
   Desktop. O dashboard também aceita `Authorization: Bearer`
   (`web_server._has_valid_session_token`), mas o header dedicado não colide
   com proxies que já usam `Authorization`. Um token colado no próprio link
   (`?token=` ou `#token=`) também vale.

O teste roda **antes** de salvar, na ordem do Desktop:

| Passo | Endpoint                   | O que prova                                                         |
| ----- | -------------------------- | ------------------------------------------------------------------- |
| 1     | `GET /api/status` (público) | é um dashboard do Hermes; `auth_required: true` indica OAuth         |
| 2     | `GET /api/profiles` + token | o token vale (o status é público, então não prova nada sobre o token) |

Com OAuth (`auth_required: true`) a conexão é recusada com o motivo: o Lipp
HQ conecta só por session token.

### Hermes local num clique

Ao abrir a aba, o app procura o `hermes dashboard` nesta máquina, no
`HERMES_DASHBOARD_URL` (se for loopback) e na porta 9119. A ideia vem do
Claw3D, que preenche URL e token a partir da instalação local
(`readOpenclawGatewayDefaults`). O token sai de onde o Hermes Desktop o lê:
o dashboard em loopback sem gate injeta `window.__HERMES_SESSION_TOKEN__` na
própria página (`web_server_dashboard.py`; leitura em
`apps/desktop/electron/dashboard-token.ts`).

| Achou                     | A tela mostra                                            |
| ------------------------- | -------------------------------------------------------- |
| dashboard com token na página | link, versão, perfis e **Usar Hermes local**          |
| dashboard sem token (gate)    | o motivo e "usar este link" para colar o token        |
| nada escutando                | `hermes dashboard --no-open` com copiar e "procurar de novo" |

```text
GET  /api/hq/connection/local   → detecção (nunca devolve o token)
POST /api/hq/connection/local   → detecta, lê o token servido e salva
```

**Renovação do token.** Sem `HERMES_DASHBOARD_SESSION_TOKEN`, o dashboard
sorteia um token novo a cada partida. Uma conexão feita pela detecção fica
marcada `tokenSource: "served"`. Quando o dashboard recusa, o proxy relê o
token da página e repete a leitura, sem pedir nada ao usuário. Token colado
à mão (`"typed"`) nunca é trocado sozinho. O token servido só é lido em
loopback, nunca de um host remoto.

**Causa e ação.** Como o `classifyGatewayFailure` do claw3doctor, cada falha
(nas linhas do diagnóstico e ao conectar) mostra a causa provável e o que
fazer: nada escutando → subir o dashboard; token recusado → reconectar ou
fixar o token; sem resposta a tempo → rede/Tailscale; OAuth → usar token.

### De onde vem o session token

Sem `HERMES_DASHBOARD_SESSION_TOKEN`, o dashboard sorteia um token novo a
cada partida (`web_server_session_token.py`). A conexão feita por "Usar
Hermes local" se renova sozinha; um token colado à mão deixa de valer quando
o dashboard reinicia. Para um token estável (útil em acesso remoto), suba o
dashboard com o token fixo:

```bash
HERMES_DASHBOARD_SESSION_TOKEN="$(openssl rand -hex 24)" hermes dashboard --no-open
# ou, sem pôr o segredo no ambiente:
HERMES_DASHBOARD_SESSION_TOKEN=file:$HOME/.hermes/dashboard.token hermes dashboard --no-open
```

### Onde fica salvo

O proxy grava link + token em `.hq-connection.json` (diretório do app, ou
`HQ_CONNECTION_FILE`), com permissão `0600`, e o arquivo está no
`.gitignore`. A página manda o token uma vez e nunca o lê de volta: o status
mostra só a prévia `...abc123`, como o Desktop. Com conexão salva:

- o dashboard é lido no link salvo, com o token salvo;
- a saúde e a versão vêm do `/api/status` do dashboard, e o API server
  (`:8642`) fica fora. O diagnóstico mostra a linha "Status `/api/status`";
- as variáveis `HERMES_DASHBOARD_URL` e `HERMES_DASHBOARD_TOKEN` só valem
  quando não há conexão salva.

"Desconectar" apaga o arquivo e volta para as variáveis de ambiente.

```text
POST   /api/hq/connection   { url, token }  → testa e salva; 422 com o erro se falhar
DELETE /api/hq/connection                   → apaga a conexão salva
```

As duas rotas só aceitam JSON da mesma origem (`Origin` igual ao `Host`,
`Sec-Fetch-Site: same-origin` quando presente). Assim, outro site aberto no
navegador não consegue trocar a conexão. Essa escrita fica neste servidor: o
Hermes continua recebendo só GET.

## Proxy de leitura (credencial fora do navegador)

`server/hermesProxy.ts` roda no dev e no preview do Vite e serve `/api/hq`:

```text
GET /api/hq/status            → configuração ativa e origem (sem segredos)
GET /api/hq/hermes/snapshot   → { health, profiles, sessions, jobs, blocks }
```

Variáveis lidas **pelo proxy** (nunca pelo navegador):

| Variável                 | Padrão                  | Função                                     |
| ------------------------ | ----------------------- | ------------------------------------------ |
| `HERMES_API_URL`         | `http://127.0.0.1:8642` | API server                                 |
| `HERMES_DASHBOARD_URL`   | `http://127.0.0.1:8000` | dashboard (o real sobe em `:9119`)         |
| `HERMES_API_KEY`         | —                       | vira `Authorization: Bearer` no API server |
| `HERMES_DASHBOARD_TOKEN` | —                       | vira `X-Hermes-Session-Token` no dashboard |
| `HERMES_TIMEOUT_MS`      | `5000`                  | timeout de cada leitura                    |

Um serviço fora não derruba o outro: o snapshot traz um bloco de estado por
endpoint (`blocks`) e a UI diz exatamente o que faltou. `401/403` do dashboard
aparece como "dashboard recusou o session token: conecte de novo na aba
Integrações".

## Provando sem uma instalação real

`scripts/hermes/fixture-gateway.mjs` sobe os dois serviços na mesma porta
padrão com os formatos acima e dados que evoluem com o tempo. Ele existe para
o harness de QA e para desenvolvimento; **não é o Hermes**.

```bash
node scripts/hermes/fixture-gateway.mjs   # 8642 + 8000
pnpm dev                                  # app em 5173 lendo o fixture
```

Contra um Hermes real, o caminho mais curto é a aba Integrações com o link do
`hermes dashboard` (porta 9119) e o session token. Para usar as variáveis de
ambiente no lugar dela, aponte `HERMES_DASHBOARD_URL` para a 9119.

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
