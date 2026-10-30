# Revisão visual — Stage 9 (refinamentos)

**Data:** 2026-10-30
**Escopo:** hover, rótulos adaptativos, atalhos, materiais compartilhados e
FPS medido.
**Revisor:** subagente GLM-5.3 Flash `high`.

## Validações

| Item | Resultado |
| - | - |
| Totens legíveis nas 4 vistas largas | SIM — todos os 9 nomes lidos de norte, leste, sul e oeste |
| Nenhum totem cobrindo porta/mobília/vizinho | SIM |
| Nenhuma quebra nova (z-fighting, placas atravessadas, luz estourada) | SIM |
| Bônus: agente em stride no corrida no zoom, placas em escala normal de perto | SIM |

## Implementações deste stage

1. **Hover** com destaque discreto na sala (faixa branca + reforço da cor) —
   item da spec que ainda faltava. Raycast de rastro com throttle de 90 ms.
2. **Rótulos adaptativos**: a placa do totem escala com a distância da câmera
   (1× a 2,3×, com amortecimento) — resolve a legibilidade angular em definitivo.
3. **Anel de seleção com pulso** suave.
4. **Atalhos**: `R` reseta a câmera, `W` cicla o modo de parede.
5. **Materiais compartilhados** por chave visual (paredes e mobiliário) — menos
   compilações e menos troca de estado na GPU.
6. **FPS medido de verdade** no relatório de QA: 1,3 fps no render por software
   desta máquina (1 vCPU, SwiftShader). Número registrado, não estimado; em GPU
   dedicada a meta de 60 FPS depende do mesmo caminho de render.

## Resultado

**GO** — o último defeito recorrente (legibilidade angular dos totens) foi
resolvido sem custo de oclusão nem artefato.
