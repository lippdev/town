# Revisão visual — Stage 8 (polimento)

**Data:** 2026-10-30
**Escopo:** luz quente de interiores, decoração, variedade de personagens,
totens maiores e provas de animação.
**Revisor:** subagente GLM-5.3 Flash `high`, com as 20 capturas finais.

## Rubrica

| Critério | Nota |
| - | -: |
| Semelhança de linguagem visual com a referência | 4 |
| Organização e legibilidade dos departamentos | 5 |
| Geometria, proporções e posicionamento | 5 |
| Câmera e cutaway das paredes | 5 |
| Qualidade e legibilidade dos personagens | 4 → **5** (cabelos, poses de caminhada e card rico) |
| Iluminação, materiais e coesão estética | 5 (luminárias de teto âmbar transformaram o interior) |
| Interface, placas e enquadramento | 5 |
| Estabilidade visual e renderização | 5 |

**Total: 38/40** com o calor e a densidade da referência finalmente presentes.

## Defeitos encontrados e corrigidos NESTE stage

1. **Figuras estáticas desde o início** (crítico escondido sob aparência de ok):
   os runtimes de animação eram criados num efeito que rodava depois dos refs
   dos filhos, e nenhum re-render re-registrava. Registro preguiçoso resolveu.
2. **Caminhada em câmera lenta**: o cap de 0,12 s do delta (proteção de física)
   estrangulava a locomoção em renders de 1–2 fps. Locomoção agora usa o delta
   real; o cap baixo ficou só nas animações de pose.
3. **Provas por tempo viraram provas por pose**: as capturas de evidência
   esperam o personagem chegar ao corredor/à mesa de reuniões, com o ciclo demo
   pausado durante a captura.

## Evidências finais

- `agents-walking.png`: Scout no vão da porta da Pesquisa e Ink no meio do
  corredor, ambos em stride, mesas vazias — locomoção provada visualmente.
- `agents-meeting.png`: Forge na mesa de reuniões com o feed registrando "meeting".
- Bateria completa: 20 capturas, zero erro de console, reset provado, 9 letreiros.

## Resultado

**GO — polimento aprovado.** Defeitos residuais baixos: rótulos ainda pequenos
nas vistas largas de norte/leste/oeste (zoom e tooltip compensam) e luz de
interiores ainda mais quente possível — ambos registrados como polimento
futuro, sem caráter estrutural.
