# Filipe na demonstração

`walk.png` é o atlas que o escritório usa: 4 quadros por 2 linhas, frente em 3/4 em cima e
costas em 3/4 embaixo, com células de 58×115 px e 32 cores. Cada eixo do andar vira uma
diagonal da tela, então as outras duas direções são as mesmas artes espelhadas.

`walk.json` descreve o PNG, e o código não conhece mais nenhuma dessas medidas:

| Campo | O que é |
| - | - |
| `image` | PNG, relativo ao JSON |
| `cell` | Largura e altura da célula, em pixels |
| `soleRow` | Linha da célula onde a sola encosta no chão |
| `visibleRows` | Linhas ocupadas pela figura; elas valem 1,8 m, em qualquer resolução |
| `animations` | `walk-front`, `walk-back`, `idle-front` e `idle-back` |

Cada animação tem `row`, `frames` e, se não começar na primeira coluna, `firstColumn`. Quem anda
tem `stepMeters`, em metros por quadro: é o que impede o pé de deslizar. Quem anima parado tem
`fps`; zero é pose fixa. Com movimento reduzido, fica no primeiro quadro. A arte de hoje tem o
parado no quadro de pernas juntas da caminhada, por isso `firstColumn: 1` e `frames: 1`.

## Arte nova

Troque os dois arquivos. Para 12 quadros de caminhada, 8 de parado e o dobro da resolução:

```json
{
  "image": "walk.png",
  "cell": { "width": 116, "height": 230 },
  "soleRow": 224,
  "visibleRows": 214,
  "animations": {
    "walk-front": { "row": 0, "frames": 12, "stepMeters": 0.0667 },
    "walk-back": { "row": 1, "frames": 12, "stepMeters": 0.0667 },
    "idle-front": { "row": 2, "frames": 8, "fps": 6 },
    "idle-back": { "row": 3, "frames": 8, "fps": 6 }
  }
}
```

`node scripts/visual-qa/sprite-zoom.mjs --arte-nova` prova esse caminho com um atlas de teste
montado a partir do atual. Se o JSON não fechar com o PNG, o console diz o que há de errado e a
cena segue sem ele. Mantenha a célula com folga transparente: a sombra e o rosto vêm do alfa.

A luz está desenhada na arte: o sprite sai com a cor do atlas sob a luz de referência da cena
(`cameraFacingLight`, em `officeSun.ts`) e só a modula em torno dela, com cor, brilho e a sombra
do sol sobre ele. Ele não passa pelo tone mapping do resto da cena (`toneMapped: false`): a curva
do PBR escurece o preto e satura o laranja da arte. A razão cena/arte, medida pelo harness de zoom,
fica perto de 1 (`LIGHT_CALIBRATION`, em `spriteMaterials.ts`, foi ajustado nela). Prefira arte
com luz neutra e sem sombra no chão: a sombra vem da cena, e parte da sola de cada quadro
(`soleCenters` mede onde estão os pés).

A textura na GPU dá a cada célula uma folga e arredonda para múltiplo de 32 px: 12 quadros de
116 px viram 1536 px de largura. Se passar do limite da GPU, o console avisa e a cena segue sem ele.

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

Se a célula ou a sola mudarem, atualize `walk.json`: o script imprime os valores.

## Atlas de 12 quadros

`walk.png` passou a ter caminhada de 12 quadros e parado de 8, com célula de 127×248 px e 56 cores.
As artes-mestras ficam em `docs/characters/filipe/master-*.png`. Os quadros de caminhada foram pintados
sobre guias de pose (`scripts/characters/pose_guides.py`, no Blender), e o parado é uma deformação sutil da
arte-mestra. O processamento está em `scripts/characters/atlas-filipe/`.

Os 24 quadros brutos (33 MB) não estão no repositório, e os scripts apontam para a pasta de trabalho onde
foram gerados; para refazer o atlas é preciso gerar os quadros de novo e ajustar esse caminho.

Defeitos conhecidos: as poses dos quadros 02, 09, 10 e 11 de frente e 07, 09 e 10 de costas ficaram longe do
guia, e a caminhada é cerca de 8% mais baixa que o parado, o que dá um pequeno pulo de tamanho ao parar.
