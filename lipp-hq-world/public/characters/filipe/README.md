# Filipe na demonstração

`demo-isometric.png` é a arte para a câmera elevada do escritório, derivada da ficha v1
(`docs/characters/filipe/`). Tela de 53×132 px, com blocos regulares e 28 cores.

Sprite estático, somente demonstração. A sola fica no ponto do chão, e a altura considera
a câmera a 30 graus. A luz está desenhada na arte: ela não responde às luzes do cenário.

## Como refazer

A fonte é `docs/characters/filipe/isometrico-fonte.png`, gerada por imagem, com "pixels"
irregulares em 1168×1346 px. O script reduz para a grade real e aplica os retoques da ficha:

```sh
blender --background --factory-startup --python scripts/characters/pixelize-sprite.py -- \
  docs/characters/filipe/isometrico-fonte.png public/characters/filipe/demo-isometric.png
```

Se a tela ou a sola mudarem, atualize as medidas em `src/world/office/FilipeDemoSprite.tsx`:
o script imprime os valores.
