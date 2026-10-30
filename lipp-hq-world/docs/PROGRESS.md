# Progresso

Memória operacional da implementação. Atualizado ao fim de cada ciclo, antes de
qualquer commit.

## Estado atual

**Stage em andamento:** Stage 0 — Discovery técnico (fechando).

**Última verificação executada:** build de produção + captura visual automatizada.

## Descobertas do ambiente

| Item | Resultado |
| - | - |
| Node / pnpm | 24.22.1 / 12.11.2 |
| Chromium do sistema | Google Chrome 156.0.8078.47 em `/usr/local/bin/google-chrome` |
| WebGL em headless | WebGL 2.0, renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))` |
| Screenshot real do canvas | confirmado, com variância de luminância medida |
| Máquina | 1 vCPU, 3 GB — render por software, capturas levam ~10 s cada |
| Acesso ao OpenMausBot | repositório público `lippdev/OpenMausBot` clonado para inspeção |

## Capacidade de revisão visual

A rota do DeepSeek V4.1 Flash **não aceita imagem como entrada de ferramenta**
(`read` devolve "this route does not support image tool results"). Portanto o agente
principal não consegue inspecionar screenshots.

Solução adotada: revisão visual delegada a subagente no GPT-6.1 Terra, que está
entre os três modelos permitidos no projeto. Pendente de confirmação no Stage 0.

## Decisões técnicas registradas

1. Aplicação isolada em `lipp-hq-world/`, com o repositório dedicado a ela.
2. Nove células em grade 3×3, com corredores nos vãos. Nenhuma parede é compartilhada
   entre duas salas — elimina o problema de paredes sobrepostas.
3. Geometria e personagens procedurais; nenhum asset externo no repositório.
4. Cutaway por parede com normal externa + oclusão por amostras de sala, com histerese.
5. Integração somente de leitura via proxy same-origin com allowlist de dois caminhos.

## Pendências

- Confirmar revisão visual multimodal por subagente.
- Validar aparência da cena base (laje, piso, câmera) antes de empilhar geometria.

## Próxima ação

Fechar o Stage 0, abrir o PR e iniciar o Stage 1 (pisos, paredes, portas e placas).
