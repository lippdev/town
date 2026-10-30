# Revisão visual — Stage 2

**Data:** 2026-10-30
**Escopo:** câmera completa (rotação por botão direito, zoom, foco, reset) e
paredes dinâmicas com cutaway estilo The Sims.
**Revisor:** subagente GLM-5.3 Flash `high`, com as 18 capturas reais da bateria.

## Checagens do revisor

| Item | Resultado |
| - | - |
| A. Cutaway nas 4 vistas cardeais | OK — frentes em rodapé, fundo inteiro, pisos visíveis |
| B. Troca de lado norte ↔ sul | OK — swap exato entre as vistas |
| C. Diagonais sem buracos | OK |
| D. Modos baixa/completa | OK — baixa mostra só fitas; completa fecha tudo |
| E. Foco na sala | OK — Engenharia centrada e legível |
| F. Integridade nos arrastos reais | OK — nada flutuando ou quebrado |
| G. Totens | OK nas vistas favoráveis; pequenos nas largas |
| H. Sem captura preta/repetida/glitch | OK — 18 distintas |

## Rubrica

| Critério | Nota |
| - | -: |
| Semelhança com a referência | 2 (sem mobília/personagens — esperado neste stage) |
| Organização dos departamentos | 4 |
| Geometria, proporções e posicionamento | 5 |
| Câmera e cutaway das paredes | 5 |
| Personagens | n/a (Stage 4) |
| Iluminação, materiais e coesão | 4 |
| Interface, placas e enquadramento | 3 |
| Estabilidade visual e renderização | 5 |

## Defeitos

| Severidade | Defeito | Encaminhamento |
| - | - | - |
| Baixo | No foco da sala, o totem fica de perfil e o nome não se lê | Refinar orientação do totem no Stage 3 (encarar a câmera ou duas placas em ângulo) |
| Baixo | Totens só legíveis de sul e no zoom | Mesma correção; nas vistas largas o zoom resolve |

Nada crítico ou alto. Nenhuma geometria quebrada em 18 vistas.

## Provas mecânicas (harness, `qa/screenshots/manifest.json`)

- Cutaway por vista: norte 11, leste 11, sul 11, oeste 11 — exatamente as
  paredes voltadas para a câmera.
- Arrasto real com botão direito: azimute 40,31° → −78,98°, alvo fixo.
- Arrasto vertical: elevação 37,33° → 65,94°.
- Seleção: clique no centro seleciona o hall; clique no fundo limpa.
- Foco: sala centrada (cx 0,5046), largura da sala em 44% do quadro.
- Reset: vista volta exata (az 40,31°, el 37,33°, dist 54,42).
- Estabilidade: ±6° de azimute não alteram nenhuma parede (11 → 11).

## Resultado

**GO** — a fase bloqueante do projeto está aprovada. O ciclo de correção não foi
necessário: a bateria automatizada pegou os três bugs (mapeamento de botões,
distância de foco, resíduo de damping) antes da revisão visual.
