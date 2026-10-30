# Progresso

Memória operacional da implementação. Atualizado ao fim de cada ciclo, antes de
qualquer commit.

## Estado atual

**Stage em andamento:** Stage 2 — câmera e paredes dinâmicas.

**Último fechado:** Stage 1 — prédio, pisos, portas e letreiros (GO em 2026-10-29).

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

Solução adotada: revisão visual delegada a subagente, confirmada funcionando.

- **GLM-5.3 Flash `high`**: entrada de imagem confirmada e usada na revisão do Stage 1.
- **GPT-6.1 Terra `medium`**: caiu num pedido de créditos (Codex desligado, próxima
  conexão é crédito Capy). Não usei porque exige decisão do dono da thread.

O revisor do Stage 1 errou dois de três achados. Por isso o harness passou a medir
enquadramento e contagem de elementos automaticamente: percepção visual é insumo,
medição é prova.

## Decisões técnicas registradas

1. Aplicação isolada em `lipp-hq-world/`, com o repositório dedicado a ela.
2. Nove células em grade 3×3, com corredores nos vãos. Nenhuma parede é compartilhada
   entre duas salas — elimina o problema de paredes sobrepostas.
3. Geometria e personagens procedurais; nenhum asset externo no repositório.
4. Cutaway por parede com normal externa + oclusão por amostras de sala, com histerese.
5. Integração somente de leitura via proxy same-origin com allowlist de dois caminhos.

## Resultado do Stage 1

Prédio completo com nove salas, corredores, portas com verga e nove letreiros.
44 grupos de parede, 9 letreiros instanciados, zero erro de console.

O cutaway já está operante e simétrico: cada uma das quatro vistas coloca em cutaway
exatamente as 11 paredes voltadas para a câmera (nove salas mais dois muros de
perímetro) e nenhuma outra.

## Pendências

- Stage 2: `CameraRig` com botão direito para rotação, foco suave, reset e três modos
  de parede; validar histerese e ausência de flicker nas diagonais.
- GPT-6.1 Terra continua indisponível sem aprovação de créditos do dono da thread.

## Próxima ação

Ligar o `CameraRig`, expor os três modos de parede na interface e rodar a bateria
completa do Gate 2, incluindo diagonais e comparação entre modos.
