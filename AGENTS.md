# AGENTS.md — Lipp HQ

Instruções para todo agente que trabalhar neste repositório.

## Fluxo de entrega

Todo avanço é entregue em commit + pull request para `main`. Cada ponto concluído
vira um commit com mensagem clara e chega ao remoto imediatamente — nada fica só no
sandbox. Nenhum trabalho entra em `main` sem passar por PR.

## Modelos permitidos

Apenas estes modelos estão autorizados neste projeto, para a thread e para subagentes:

| Modelo | ID | Reasoning | Papel |
| - | - | - | - |
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash-1017` | `max` | padrão da thread e volume |
| GPT-6.1 Terra | `openai/gpt-6.1-terra` | `medium` | engenharia e retomada |
| GLM-5.3 Flash | `zai/glm-5.3-flash` | `high` | volume e segunda retomada |

Qualquer outro modelo é proibido, inclusive em subagentes.

## Falha de provedor

Os três modelos ficam em provedores diferentes, então servem como cadeia de
failover. A ordem é:

1. `deepseek/deepseek-v4.1-flash-1017` — padrão.
2. `openai/gpt-6.1-terra` com reasoning `medium` — primeira alternativa.
3. `zai/glm-5.3-flash` com reasoning `high` — segunda alternativa.

Quando um subagente morre por erro de provedor, ele é retomado com o modelo
seguinte da cadeia, passado explicitamente na mensagem de retomada. Um erro do
modelo da própria thread só o dono da thread resolve, trocando o modelo no seletor.

## Comunicação

As respostas ao Filipe são em português.
