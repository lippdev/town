# Quando algo não aparece

Sintoma → causa provável → o que fazer. Tudo aqui foi escrito a partir do que o
app realmente distingue; onde ele não sabe, ele diz "não sei" em vez de fingir
dado.

## A tela está em Demo com "Hermes fora do ar"

O proxy existe no `dev` e no `preview` do Vite; um build estático servido por
outra coisa não tem `/api/hq` e cai em Demo por definição.

```bash
pnpm dev                                     # ou: pnpm build && pnpm preview
HERMES_API_URL=http://127.0.0.1:8642 \
HERMES_DASHBOARD_URL=http://127.0.0.1:8000 pnpm dev
```

Confira o contrato antes de olhar a tela:

```bash
pnpm contract:check
```

## A aba Integrações lista um endpoint em vermelho

| Linha em vermelho | Significado | Ação |
| --- | --- | --- |
| API server `/health` | o serviço de API não respondeu | `hermes gateway` no ar? porta 8642? |
| Dashboard `/api/profiles` | dashboard fora ou exigindo login | `hermes dashboard` no ar? porta 8000? |
| HTTP 401 / 403 | falta credencial | `HERMES_DASHBOARD_TOKEN` (dashboard) e `HERMES_API_KEY` (API) |
| Sem resposta | nada escutando naquela URL | confira `HERMES_API_URL`/`HERMES_DASHBOARD_URL` |
| Sessões / Rotinas em vermelho | dashboard respondeu 200 mas o endpoint falhou | veja o erro cru na própria linha |

"Respondendo em parte" quer dizer que a frota aparece, mas algum bloco de dados
está faltando.

## Frota vazia com os quatro endpoints verdes

O dashboard respondeu sem profiles. O app **não inventa** bot: ele mostra frota
vazia e mantém o aviso. Confira no dashboard se existe pelo menos um profile.

## Rotinas mostrando "sem agenda" ou "nunca rodou"

O Hermes atual grava `next_run_at` e `last_run_at` em ISO-8601; versões antigas e
o fixture usam segundos epoch. O app aceita os dois — se aparecer "sem agenda" com
rotina existindo, rode `pnpm contract:check`: ele mostra o formato que a sua
instância devolve e o campo que faltou.

## "Leitura atrasada" no painel

O gateway parou de responder e o app manteve a **última leitura boa**, marcada
com a idade real do dado. O selo some sozinho quando a leitura volta; "tentar de
novo" força uma tentativa imediata.

## Sessões somem ou vêm sem número

Sessão sem `last_active`/`started_at` vai para o fim da lista em vez de fingir
recência; sessão encerrada nunca conta como ativa. Se o número do resumo for
maior que os itens listados, é a janela de 6 sessões por bot — o total continua
real.

## Personagem não muda depois da edição

A escolha fica em `localStorage` (`lipp-hq-world:agent-looks:v2`). Em aba privada
ou com armazenamento bloqueado ela vale só para a sessão atual. Se um valor antigo
no storage estiver corrompido, o app cai na camada anterior em vez de quebrar.

## Harness falhando na máquina local

- **Porta ocupada**: os harnesses pegam portas livres por execução; se algo
  antigo estiver escutando, mate o processo antes (`pgrep -af fixture-gateway`).
- **Tempo esgotado**: numa máquina sem GPU, a cena roda por software (1–3 fps) e
  as esperas são por pose, não por tempo fixo. Em CI é o mesmo caminho.
- **"Tudo verde sem provar nada"**: rode `pnpm qa:all` e confira o `ok: true` de
  cada relatório em `qa/screenshots/`; captura sem `ok` não é prova.
