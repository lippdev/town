# Filipe na demonstração

`walk.png` é o atlas que o escritório usa: 4 quadros por 2 linhas, frente em 3/4 em cima e
costas em 3/4 embaixo, com células de 58×115 px e 32 cores. Cada eixo do andar vira uma
diagonal da tela, então as outras duas direções são as mesmas artes espelhadas.

O passo acompanha a distância percorrida (`src/world/office/filipeWalk.ts`), e a sola fica no
ponto do chão. A luz está desenhada na arte: ela não responde às luzes do cenário.

`demo-isometric.png` é a pose parada em 53×132 px. O escritório não a usa mais, porque parado
ele mostra o quadro de pernas juntas da caminhada; ela fica para quando houver uma pose ociosa.

## Como refazer

As fontes ficam em `docs/characters/filipe/`, geradas por imagem, com "pixels" irregulares. Os
scripts reduzem à grade real e aplicam os retoques da ficha:

```sh
blender --background --factory-startup --python scripts/characters/pixelize-walk.py -- \
  docs/characters/filipe/walk-front.png docs/characters/filipe/walk-back.png \
  public/characters/filipe/walk.png

blender --background --factory-startup --python scripts/characters/pixelize-sprite.py -- \
  docs/characters/filipe/isometrico-fonte.png public/characters/filipe/demo-isometric.png
```

Se a célula ou a sola mudarem, atualize as medidas em `src/world/office/FilipeDemoSprite.tsx`:
o script imprime os valores.
