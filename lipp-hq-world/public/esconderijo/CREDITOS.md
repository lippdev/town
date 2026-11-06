# Créditos — esconderijo

Os três pacotes abaixo são CC0 1.0: uso comercial e redistribuição permitidos, sem exigir crédito. O crédito fica aqui mesmo assim. Verificação em 2026-11-06, com os pacotes originais baixados dos autores. Hashes em `proveniencia.json`.

| Pacote | Autor | Licença | Origem | Peças usadas |
| - | - | - | - | - |
| Modular SciFi MegaKit [Standard], a versão gratuita | Quaternius | CC0 1.0 | https://quaternius.com/packs/modularscifimegakit.html | `Prop_Computer`, `Prop_Chest`, `Prop_Crate4`, `Prop_Barrel_Large`, `Prop_Fan_Small`, `Prop_PipeHolder`, `Prop_Light_Floor`, `Platform_Round1`, `Platform_DarkPlates`, `Platform_Squares`, `Platform_Metal`, `Door_Frame_Square`, `Door_DarkMetal`, `Column_Hollow` |
| Space Kit 2.0 | Kenney | CC0 1.0 | https://kenney.nl/assets/space-kit | `rock_largeA`, `rock_largeB`, `rock` |
| Car Kit 3.1 | Kenney | CC0 1.0 | https://kenney.nl/assets/car-kit | `wheel-dark` |

Texto CC0: https://creativecommons.org/publicdomain/zero/1.0/. A versão paga do MegaKit não foi comprada nem usada.

## O que foi modificado

- **Só as peças da tabela** entram em `kit.glb`, reunidas e otimizadas por `scripts/assets/build-esconderijo-kit.mjs`: malhas em meshopt, e texturas de 2048 px em PNG reduzidas a 512 px em WebP.
- **MegaKit sem vermelho:** a variante vermelha das texturas foi trocada pela neutra do próprio pacote. Os nomes das imagens dentro do GLB ainda dizem `_Red`, mas o conteúdo é o neutro.
- **Em memória, ao carregar** (`HideoutScene.tsx`): as rochas da Kenney passam de laranja para cinza, e o material de tela do `Prop_Computer` vira um azul liso, sem o logotipo de exemplo do pacote.

## O que não veio de pacote

Não há modelo de Batman nem de Batmóvel de terceiros. A busca só achou marketplaces com licença comercial, como CGTrader e RenderHub, e gratuito não é o mesmo que licença aberta. Além disso, licença aberta do arquivo não libera a propriedade intelectual do personagem. Por isso, estas peças são geometria própria em código, sem derivar de modelo nenhum: carroceria do carro, capuz, capa, cinto, manequim, emblema do morcego, moeda, boneco de treino, terminal, holofote, relógio e telas.

As peças procedurais são inspiradas num personagem da DC Comics, que detém a marca e os direitos dele. É uma homenagem na demonstração do Lipp HQ, sem afiliação. CC0 cobre os arquivos dos pacotes, mas não dá direito nenhum sobre o personagem: publicar isso comercialmente pede avaliação à parte.

## Avaliados e descartados

Nenhum destes arquivos vai no build.

- **Kenney Space Kit, máquinas e terminais** (`desk_computer`, `machine_*`, `rover`): cara de brinquedo, em laranja e branco, destoa do MegaKit.
- **Kenney Car Kit, carrocerias** (`race-future`, `sedan-sports`): carros de brinquedo, sem a silhueta pedida.
- **Quaternius Ultimate Modular Sci-Fi:** não foi baixado. O MegaKit cobriu o que faltava, já em glTF.

Total servido: 389092 bytes.
