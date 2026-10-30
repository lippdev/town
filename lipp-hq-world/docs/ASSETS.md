# Assets

## Avaliação

| Pacote | Uso pretendido | Licença | Situação |
| - | - | - | - |
| Kenney — Furniture Kit | mesas, cadeiras, estantes | CC0 | avaliado, não usado no MVP |
| Quaternius — Ultimate Animated Character Pack | personagens animados | CC0 | avaliado, não usado no MVP |
| Quaternius — Universal Animation Library | locomoção e idle | CC0 | avaliado, não usado no MVP |

Nenhum arquivo externo entrou no repositório neste momento.

## Decisão

A cena usa **geometria procedural** para móveis e personagens.

Motivos, em ordem de peso:

1. **Determinismo de build.** O download de um pacote externo pode falhar em CI ou
   numa máquina nova, e o requisito do projeto é uma cena executável sempre.
2. **Proporção controlada.** O escritório precisa de medidas coerentes (mesa 0,75,
   cadeira encostada, monitor sobre a mesa, personagem 1,4–1,7). Gerar a geometria
   a partir de parâmetros garante isso sem retrabalho de importação.
3. **Licença sem ambiguidade.** Nada de terceiros no repositório significa nada para
   auditar depois.

O contrato dos componentes (`<Desk>`, `<Chair>`, `<Monitor>`, `<AgentFigure>`) é o
mesmo que um GLB ocuparia. Trocar por assets externos depois é substituir o corpo
do componente, não reescrever a cena.

## Troca por GLB

Se um pacote for incorporado no futuro:

1. Converter para GLB otimizado.
2. Registrar abaixo nome, URL, autor, licença, versão e arquivos usados.
3. Manter a geometria procedural como fallback quando o arquivo não carregar.
