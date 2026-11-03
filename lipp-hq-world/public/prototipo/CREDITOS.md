# Créditos — protótipo Engenharia

Todos os assets externos abaixo são CC0 1.0. Verificação em 2026-11-03.

| Asset | Autor | Licença | Origem | Arquivos finais | Bytes |
| - | - | - | - | - | -: |
| Sofa 03 | Fran Calvente | CC0 1.0 | https://polyhaven.com/a/sofa_03 | sofa.glb | 296620 |
| Potted Plant 02 | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/potted_plant_02 | planta.glb | 888380 |
| Desk Lamp Arm 01 | Kuutti Siitonen (modelagem/textura); Yann Kervran (rig) | CC0 1.0 | https://polyhaven.com/a/desk_lamp_arm_01 | luminaria.glb | 502116 |
| Wood Floor | Dimitrios Savva | CC0 1.0 | https://polyhaven.com/a/wood_floor | wood_floor_arm_1k.jpg, wood_floor_diff_1k.jpg, wood_floor_nor_gl_1k.jpg | 1605651 |
| Stone Floor | Dimitrios Savva | CC0 1.0 | https://polyhaven.com/a/stone_floor | stone_floor_nor_gl_1k.jpg, stone_floor_arm_1k.jpg, stone_floor_diff_1k.jpg | 2557896 |
| Casual Male — Ultimate Animated Character Pack | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatedanimatedcharacter.html | pulse.glb | 303236 |

Licença Poly Haven: https://polyhaven.com/license. Licença Quaternius: na página oficial do pack acima. Texto CC0: https://creativecommons.org/publicdomain/zero/1.0/.

O download oficial do Casual Male no Google Drive retornou “Quota exceeded”. Foi usada a cópia FBX do mesmo asset em https://github.com/bearlikelion/godot-xr-gamejam/blob/main/Assets/Models/Church/Crowd/Quatertnius/Casual_Male.fbx. A atribuição/licença do personagem vem do pack original, não da licença do jogo que hospeda a cópia. Nenhum script desse repositório foi executado.

Conversão FBX → GLB via FBXLoader/GLTFExporter do three 0.186.1. Materiais reconstruídos em PBR: camisa #3b82f6, pele, cabelo e calça em cores uniformes; preservados os clipes Idle e SitDown. FBXLoader limitou pesos de skin a quatro por vértice (aviso do importador). Sem Mixamo. O arquivo não contém digitação.

Modelos Poly Haven obtidos pela API pública em glTF 1k; arquivos conferidos contra MD5 da API. Todos os GLBs passaram por `@gltf-transform/cli@4.5.1 optimize --compress meshopt --texture-compress webp --texture-size 1024`. Texturas de piso são JPEG 1k originais (diffuse, normal OpenGL, ARM). Downloads em diretórios novos de /tmp/hq-proto/downloads, tratados apenas como dados.

Arquitetura, mesa, estante, cadeira simples, livros, telas, tapete e vidro foram construídos em código neste spike. Não são modelos realistas prontos nem derivados das imagens conceituais.

Total binário servido: 6153899 bytes.
