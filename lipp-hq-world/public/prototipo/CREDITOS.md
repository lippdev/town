# Créditos — protótipo Engenharia

Todos os assets externos abaixo são CC0 1.0. Verificação em 2026-11-03.

| Asset | Autor | Licença | Origem | Arquivos finais | Bytes |
| - | - | - | - | - | -: |
| Potted Plant 02 | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/potted_plant_02 | planta.glb | 888380 |
| Desk Lamp Arm 01 | Kuutti Siitonen (modelagem/textura); Yann Kervran (rig) | CC0 1.0 | https://polyhaven.com/a/desk_lamp_arm_01 | luminaria.glb | 502116 |
| Wood Floor | Dimitrios Savva | CC0 1.0 | https://polyhaven.com/a/wood_floor | wood_floor_arm_1k.jpg, wood_floor_diff_1k.jpg, wood_floor_nor_gl_1k.jpg | 1605651 |
| Floor Tiles 04 | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/floor_tiles_04 | floor_tiles_04_diff_1k.jpg, floor_tiles_04_nor_gl_1k.jpg, floor_tiles_04_arm_1k.jpg | 520761 |
| Fabric Pattern 07 | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/fabric_pattern_07 | fabric_pattern_07_arm_1k.jpg, fabric_pattern_07_diff_1k.jpg, fabric_pattern_07_nor_gl_1k.jpg | 1843723 |
| Casual Male — Ultimate Animated Character Pack | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatedanimatedcharacter.html | pulse.glb | 148048 |

Licença Poly Haven: https://polyhaven.com/license. Licença Quaternius: na página oficial do pack acima. Texto CC0: https://creativecommons.org/publicdomain/zero/1.0/.

O download oficial do Casual Male no Google Drive retornou “Quota exceeded”. Foi usada a cópia FBX do mesmo asset em https://github.com/bearlikelion/godot-xr-gamejam/blob/main/Assets/Models/Church/Crowd/Quatertnius/Casual_Male.fbx. A atribuição/licença do personagem vem do pack original, não da licença do jogo que hospeda a cópia. Nenhum script desse repositório foi executado. SHA256 da cópia em proveniencia.json.

Conversão FBX → GLB via FBXLoader/GLTFExporter do three 0.186.1, reproduzível em scripts/prototype/convert-character.mjs. Materiais reconstruídos em PBR: camisa #3b82f6, pele, cabelo e calça em cores uniformes. Grupos por material consolidados de 96 para 6; pesos normalizados após limite do importador a quatro por vértice. Cabeça reduzida a 52% da escala original para diminuir a proporção cartunesca. Isso não transforma o modelo em um humano realista.

Preservados os clipes Idle e SitDown. Sem Mixamo. Não contém digitação: SitDown toca a transição uma vez e segura a pose. Uma respiração sutil procedural continua na cena.

Modelos Poly Haven obtidos pela API pública em glTF 1k; arquivos conferidos contra MD5 da API. GLBs passaram por `npx @gltf-transform/cli@4.5.1 optimize entrada saida --compress meshopt --texture-compress webp --texture-size 1024`; personagem usa ainda `--palette false` para preservar cores nomeadas. Texturas de piso são JPEG 1k originais (diffuse, normal OpenGL, ARM). Fabric usa relevo/roughness, com cor cinza substituindo o xadrez vermelho; diffuse original fica disponível no pacote. Downloads em diretórios novos de /tmp/hq-proto/downloads, tratados apenas como dados.

Arquitetura, mesa, estante, sofá, cadeira simples, livros, telas, tapete e vidro foram construídos em código neste spike. Não são modelos realistas prontos nem derivados das imagens conceituais.

O sofá vitoriano Sofa 03 (Fran Calvente) e Stone Floor (Dimitrios Savva), ambos CC0/Poly Haven, foram experimentados e removidos do pacote final por destoarem da referência. Downloads e hashes permanecem no histórico de proveniência; não são carregados nem distribuídos no build final.

Total binário servido: 5508679 bytes.
