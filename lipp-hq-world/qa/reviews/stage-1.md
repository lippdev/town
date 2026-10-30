# Revisão visual — Stage 1

**Data:** 2026-10-29
**Escopo:** prédio completo com nove salas, corredores, portas e letreiros.
**Revisor:** subagente GPT-6.1 Terra (inicial) e GLM-5.3 Flash `high`, ambos com entrada de imagem confirmada.

## Screenshots avaliados

| Arquivo | Conteúdo |
| - | - |
| `qa/screenshots/overview-default.png` | câmera inicial |
| `qa/screenshots/camera-north.png` | vista pelo norte |
| `qa/screenshots/camera-east.png` | vista pelo leste |
| `qa/screenshots/camera-south.png` | vista pelo sul |
| `qa/screenshots/camera-west.png` | vista pelo oeste |
| `qa/screenshots/camera-diagonal-a.png` | diagonal a 40° |
| `qa/screenshots/camera-zoom-in.png` | aproximada |
| `qa/screenshots/drag-right-rotate.png` | após arrasto real com botão direito |
| `qa/screenshots/drag-vertical-orbit.png` | após arrasto vertical real |

Todas em 1440 × 900, renderizadas pelo Chromium com WebGL 2 em SwiftShader.

## Rubrica

| Critério | Nota |
| - | -: |
| Semelhança de linguagem visual com a referência | 3 |
| Organização e legibilidade dos departamentos | 5 |
| Geometria, proporções e posicionamento | 4 |
| Câmera e cutaway das paredes | 4 |
| Qualidade e legibilidade dos personagens | n/a |
| Iluminação, materiais e coesão estética | 3 |
| Interface, placas e enquadramento | 4 |
| Estabilidade visual e qualidade da renderização | 5 |

Nota de estilo baixa é esperada: o stage entrega arquitetura, não acabamento. Mobília,
personagens e iluminação de interiores entram nos stages 3 e 4.

## Defeitos apontados pela revisão

| Severidade | Defeito | Situação |
| - | - | - |
| Médio | Enquadramento inicial com o prédio deslocado e terço esquerdo vazio | **não reproduzido** — verificado por medição, `centerX = 0,5051` e largura `0,7598` do quadro |
| Médio | Totens ausentes no quadrante noroeste | **não reproduzido** — a ponte de QA encontra as 9 instâncias, uma por sala |
| Baixo | Texto dos totens ilegível na captura de visão geral | **procedente** — totens ampliados de 1,42 × 0,49 para 2,15 × 0,71 e textura de 768 px; legibilidade plena só no zoom, o que é esperado. `camera-zoom-in.png` documenta o estado aproximado |

Dois dos três achados eram erro de percepção do revisor, não do app. A medição
objetiva virou parte permanente do harness por causa disso: enquadramento e contagem
de elementos não dependem mais de julgamento visual.

## Medições do harness

| Captura | média | desvio | centro X | largura |
| - | -: | -: | -: | -: |
| overview-default | 60,38 | 74,59 | 0,5051 | 0,7598 |
| camera-north | 50,81 | 62,41 | 0,5000 | 0,7152 |
| camera-east | 52,64 | 69,06 | 0,5000 | 0,6020 |
| camera-south | 52,44 | 69,19 | 0,5000 | 0,7152 |
| camera-west | 52,28 | 63,33 | 0,5000 | 0,6020 |
| camera-diagonal-a | 54,32 | 70,85 | 0,5046 | 0,7475 |

Erros de console: 0. Capturas em branco: 0. Grupos de parede: 44. Letreiros: 9.

## Simetria do cutaway

Cada vista de lado coloca em cutaway exatamente as 11 paredes voltadas para a câmera
— as nove salas mais os dois muros de perímetro daquele lado — e nenhuma outra:

```text
NORTE   cap-v0-north cap-v1-north + 9 salas *-north
SUL     cap-v0-south cap-v1-south + 9 salas *-south
LESTE   cap-h0-east  cap-h1-east  + 9 salas *-east
OESTE   cap-h0-west  cap-h1-west  + 9 salas *-west
```

## Correções obrigatórias

Nenhuma bloqueante. Enquadramento e contagem de totens passaram a ser medidos
automaticamente em vez de julgados a olho.

## Resultado

**GO** — nenhum defeito crítico ou alto; arquitetura íntegra nos quatro lados; a base
para os stages seguintes está correta.
