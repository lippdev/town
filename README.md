# Lipp HQ World

Escritório virtual 3D da Lipp HQ: os sete agentes do OpenMausBot (Argos, Forge,
Pulse, Echo, Scout, Atlas e Ink) representados como personagens num diorama
corporativo navegável.

A aplicação está em [`lipp-hq-world/`](lipp-hq-world/), com instrução completa
de execução no [README dela](lipp-hq-world/README.md). Resumo:

```bash
cd lipp-hq-world
pnpm install
pnpm dev        # http://127.0.0.1:5173
```

## Documentação

| Documento | Conteúdo |
| - | - |
| [lipp-hq-world/docs/ARCHITECTURE.md](lipp-hq-world/docs/ARCHITECTURE.md) | arquitetura e decisões |
| [lipp-hq-world/docs/BACKLOG.md](lipp-hq-world/docs/BACKLOG.md) | auditoria geral e melhorias |
| [lipp-hq-world/docs/PROGRESS.md](lipp-hq-world/docs/PROGRESS.md) | estado atual |
| [lipp-hq-world/docs/INTEGRATION.md](lipp-hq-world/docs/INTEGRATION.md) | contratos do OpenMausBot |
| [AGENTS.md](AGENTS.md) | regras para agentes neste repositório |

## Fluxo de trabalho

Todo avanço é entregue em commit + pull request para `main`, com gate visual
GO/NO-GO por stage — relatórios em `lipp-hq-world/qa/reviews/`.
