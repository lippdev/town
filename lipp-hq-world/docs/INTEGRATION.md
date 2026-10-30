# Integração com o OpenMausBot

O Lipp HQ World é uma camada de visualização **somente de leitura**. Ele não inicia
tarefas, não altera agentes, não muda permissões e não executa comandos.

## Contratos verificados no fork

Inspeção feita no repositório `lippdev/OpenMausBot` (branch `main`), nos arquivos
`server/index.ts`, `server/request-auth.ts` e `shared/wire.ts`.

### Snapshot

```text
GET /api/bots?messages=0
```

Devolve a frota. Cada bot segue `WireBot` em `shared/wire.ts`, com os campos que
importam aqui:

- `id`, `name`, `title`, `description`, `color`
- `threadId`, `mainThreadId`, `tasks[]`
- `unread`
- `avatarUrl`

Cada item de `tasks[]` é um `WireTask` e traz:

- `threadId`, `title`, `updatedAt`, `closedBy`, `archivedAt`
- `busy`, `activity`, `turnStartedAt`
- `waitingForTeammates`
- `projectId`, `routineRunId`

### Fila e estado derivado

`BotActivity` é a fonte de verdade do que o bot está fazendo:

```ts
type BotActivity =
  | "working"
  | "waiting-on-you"
  | "idle"
  | "no-signal"
  | "dead"
  | "parked.computer";
```

`parked.computer` é nível de tarefa: um turno que parou no teto de espera do
computador e retoma quando a vaga libera. Nunca conta como ocupado.

### Stream

```text
GET /api/events?screens=off
```

Server-Sent Events. Os frames relevantes estão em `ServerFrame`:

- `{ kind: "bot", bot }` — folha inteira do bot a cada mudança
- `{ kind: "bots.order", botIds }` — frota reordenada
- `{ kind: "bot.queued", queues }` — mensagens na fila por thread
- `{ kind: "message" }`, `{ kind: "message.patch" }` — mensagens
- `{ kind: "thread" }`, `{ kind: "runtime" }` — estado de thread e runtime
- `{ kind: "screen" }` — quadro de tela; desligado por `screens=off`

O parâmetro `screens=off` é obrigatório para nós: não queremos tráfego de imagem.

### Reconexão

O servidor aceita `Last-Event-ID` e `?since=<cursor>`. Quando o cursor caiu fora do
buffer, **não há replay parcial** — o cliente precisa descartar o estado e pedir um
novo snapshot. O adaptador trata isso como `resync`.

## Autenticação

`server/request-auth.ts` aceita sessão por cookie ou `Authorization: Bearer`. Há
verificação de mesma origem (`provesSameOrigin`, `isAllowedOrigin`) e escopos por
rota.

Consequência: o token **não pode** ir para o navegador. Por isso o adaptador Live
usa um proxy de leitura no mesmo host da aplicação.

## Proxy de leitura

`server/proxy.mjs` (a implementar no Stage 5) expõe apenas dois caminhos:

| Nosso caminho | Repassa para | Método |
| - | - | - |
| `GET /api/hq/snapshot` | `GET /api/bots?messages=0` | somente GET |
| `GET /api/hq/stream` | `GET /api/events?screens=off` | somente GET |

Regras do proxy:

1. Token lido de variável de ambiente no servidor. Nunca serializado ao cliente.
2. Allowlist de caminho exato. Nenhum repasse genérico.
3. Sanitização antes de responder: descarta `soul`, `soulHash`, prompts, mensagens
   privadas, credenciais e qualquer campo de configuração sensível.
4. Somente os sete agentes da Lipp HQ passam pelo filtro.
5. Nenhum método de escrita é aceito, mesmo que o upstream permita.

Se o proxy não estiver configurado, a aplicação sobe em modo **Demo** e diz isso na
interface. Ela nunca finge estar em Live.

## Mapeamento para a cena

| Origem | Destino visual |
| - | - |
| `task.activity === "working"` e `busy` | personagem `working` na estação |
| `waitingForTeammates` | personagem `waiting` |
| `activity === "waiting-on-you"` | personagem `blocked` com indicador discreto |
| `activity === "idle"` ou ausência de tarefa ativa | personagem `idle` |
| `activity === "no-signal"` ou `"dead"` | personagem `offline` |
| `closedBy`/`archivedAt` | não gera evento de conclusão |

Regras de honestidade aplicadas em código:

- Nenhum evento é inventado. Se um frame não existe no upstream, ele não é emitido.
- `handoff` só é emitido quando houver evidência de delegação (`waitingForTeammates`
  combinado com tarefa aberta por outro bot em `openedBy.botId`).
- Turno terminado não é tarefa concluída.
- Ausência de eventos não é ausência de trabalho: o estado fica `unknown` até o
  próximo snapshot.

## Modo Demo

`src/integrations/mock` gera uma sequência determinística usando **o mesmo contrato**
`HQEvent`. Todo evento Demo carrega `source: "demo"`, e a interface marca o modo em
texto. Uma simulação nunca é apresentada como evento real.
