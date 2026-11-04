# Avatares: pessoas e robôs

Pessoas e bots são coisas diferentes neste projeto, e cada um tem o seu modelo:

| Quem    | Modelo                                                 | O que representa                              |
| ------- | ------------------------------------------------------ | --------------------------------------------- |
| Pessoa  | pacote de avatar do Wawa Sensei, montado peça por peça | gente criada no editor, em `/avatares.html`   |
| Bot     | RobotExpressive oficial do three.js                    | os agentes (demonstração e frota do Hermes)   |

## Origem e licença

### Pessoas: pacote do Wawa Sensei

- Autor: Wawa Sensei (`wass08`).
- Repositório: <https://github.com/wass08/r3f-ultimate-character-configurator>, commit
  `802398d1a195a36c270ab451d883c128044e3177`. Demo: <https://avatar.wawasensei.dev>.
- Fonte: `Assets.zip` da raiz do repositório, 43.745.609 bytes, SHA-256
  `455fc3bf5e31877d5e672e5c2d34557e82d2fd049be6cc6e65aed7f3ba6914ec`, e
  `public/models/Poses.glb`.
- **Licença: não identificada.** O repositório não tem arquivo de licença e a API do
  GitHub devolve `license: null`. Isto não é MIT nem nenhuma outra licença declarada.
- **Autorização de uso:** informada pelo Filipe Moreira em 2026-11-04 ("Já vi aqui tudo
  podemos usar, bora usar"). O registro é do que foi informado; quem for redistribuir
  este projeto fora daqui precisa reavaliar.

### Robôs: RobotExpressive

- Modelo de Tomás Laulhé (Quaternius), com modificações de Don McCurdy (três expressões
  por morph, conversão com FBX2GLTF, redução de metalicidade). Licença **CC0 1.0**.
- Origem: <https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive>.
- `public/avatares/robo/README.md` é o README oficial, sem alterações, e o GLB é o
  arquivo oficial, byte a byte. O autor sugere considerar apoiar o Patreon dele.

SHA-256 de cada origem e o comando usado estão em `public/avatares/proveniencia.json`.
Para refazer tudo: `node scripts/avatar/prepare-assets.mjs`. O script só baixa, confere e
comprime; não executa nada do pacote.

## O que entrou do pacote

São 88 peças, em 15 categorias: cabeça, cabelo, olhos, sobrancelhas, nariz, rosto, barba,
óculos, chapéu, laço, brinco, blusa, calça, sapatos e fantasia. Depois do meshopt ocupam
5,5 MB (eram 27 MB); a geometria não foi simplificada.

Ficaram de fora, de propósito:

| Arquivo                             | Motivo                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| `Outfit.002.glb`                    | fantasia amarela (material "Pika") que imita um personagem de franquia |
| `NakedFullBody.glb`                 | corpo sem roupa; o corpo já vem nas peças de roupa                     |
| `FaceMask.glb`                      | mesma máscara de `Face.007`                                            |
| `*.blend`, `*.fbx`, `*.jpg`, `*.png` | arquivos de trabalho do autor; nenhum é servido                        |
| `Teleporter Base.glb`               | cenário do demo original, sem uso aqui                                 |

As miniaturas do editor (`miniaturas/*.webp`) são fotos das próprias peças, tiradas por
`node scripts/avatar/thumbs.mjs <url do dev> public/avatares/humano/miniaturas`. Não há
arte nova.

## Como a pessoa é montada

O projeto original lê o catálogo de um PocketBase. Aqui ele é a tabela
`src/avatar/human/catalog.ts`, sem rede e sem credencial. Os testes conferem essa tabela
contra os arquivos: toda peça tem GLB e miniatura, e o que ela diz sobre cor é verdade.

- **Um esqueleto por pessoa.** As 88 peças têm os mesmos 75 ossos, na mesma ordem. Cada
  `HumanFigure` clona o esqueleto do `armature.glb` e liga todas as malhas a ele.
- **A compressão muda as matrizes.** O `meshopt` guarda cada peça em coordenadas próprias
  e compensa nas matrizes inversas *do arquivo daquela peça*. Como todas usam o esqueleto
  comum, a mesma compensação vai para a matriz de ligação (`quantizationOf`). Sem isso, a
  figura vira um punhado de pontas. Há teste para isso, osso por osso.
- **Nada de cor no cache.** Geometria e textura são divididas entre as figuras; materiais
  `Color_`, pele e morphs são de cada uma. Mudar a camisa de uma pessoa não muda a de outra.
- **Uma peça por categoria, e travas.** `locks` diz o que a peça cobre: a fantasia com
  capuz tira blusa, calça, sapatos, cabelo e chapéu; o vestido tira blusa e calça; a
  abóbora tira a cabeça inteira. A escolha coberta fica guardada para quando tirar.
- **Memória.** Quando nenhuma figura usa uma peça, a memória de GPU dela é devolvida. Ela
  segue na RAM da página, e o three a envia de novo se voltar.

As travas do original ficam no PocketBase, que não é público. As daqui foram definidas
vendo as peças; **não há detecção automática de colisão**. Cabelo muito volumoso sob
chapéu, por exemplo, ainda pode atravessar um pouco.

## Animações: o que existe de verdade

Inspecionei `Poses.glb`, `Armature.glb` e os `.blend` do pacote.

| Clipe                                                | De onde vem                                             | Tipo               |
| ---------------------------------------------------- | ------------------------------------------------------- | ------------------ |
| Em pé                                                | `Idle` do `Poses.glb` (8,37 s)                          | animação do pacote |
| Relaxada, Descolada, Dramática, Rei, Ninja, Ocupada, Soco | `Poses.glb` (um quadro cada)                            | foto parada        |
| Andando                                              | `Walking` do RobotExpressive, redirecionado             | retarget           |
| Sentada                                              | `SitDown` do `pulse.glb`, redirecionado                 | retarget           |
| Levantar                                             | o `Sentada` de trás para a frente                       | retarget           |

**O pacote não tem andar nem sentar.** `retarget.ts` assa esses dois quadro a quadro no
esqueleto do avatar: membros apontam para onde os da origem apontam (as poses de repouso
são diferentes), e bacia, coluna, cabeça e pés recebem a rotação da origem.

Limites reais: o andar vem de um robô de pernas curtas, então lê como caminhada, mas sem a
qualidade de uma captura feita para esta figura. Dedos não acompanham a origem e o Sentada
deixa as mãos soltas, sem apoiar em nada.

## Persistência

`localStorage`, chave `hq.avatares.v1`. Só ids e cores. Dado corrompido vai para
`hq.avatares.backup` antes de qualquer gravação, versão futura nunca é sobrescrita e peça
que saiu do catálogo volta ao padrão sem apagar a pessoa.

## Verificação

- `pnpm test`: catálogo contra os arquivos, preset, persistência e figura.
- `pnpm qa:avatar`: o fluxo no navegador (`HQ_URL` aponta para o servidor).

## Pessoas no escritório

Quem é salvo no editor aparece no hall da demonstração (`/?escritorio=completo&modo=demonstracao`).
Salvar em outra aba já atualiza o escritório aberto.

- **Pessoa não é bot.** Fica em `humans` no store, separada de `bots`: não ocupa posto, não
  vem do Hermes, não tem sessão nem estado. No modo ao vivo nenhuma pessoa aparece, para não
  se misturar com a frota real.
- **Só se mexe quando mandam.** O painel tem "Sentar na bancada" e "Levantar e voltar". Não
  há rotina própria, para não parecer que a pessoa está trabalhando. Parada, ela só toca o
  `Idle` e pisca.
- **Caminhos contra a mobília real.** `chairRoute` para ao lado da cadeira, no vão entre uma
  e outra, porque por trás a pessoa atravessaria o encosto. Os testes percorrem cada caminho
  contra os `footprints` que `buildOffice()` gera. Pessoas não desviam umas das outras.
- **Movimento reduzido.** O comando vai direto ao fim, sem andar e sem piscar.
- **Capacidade.** Seis no hall, uma para cada cadeira da bancada. Além disso, a pessoa segue
  salva e listada, sem corpo na cena, porque cada uma soma entre 30 e 70 mil triângulos.
- **Escala.** O arquivo tem 2,05 m, e metade é cabeça: no tamanho original ela cobria quem
  estava atrás. No escritório a pessoa fica com 1,48 m. Sentada, os pés ficam soltos: o
  assento é alto para estas pernas.

Limites reais: entrar na cadeira é um deslizar de lado enquanto o clipe toca, não um passo.
As mãos da pose sentada não pousam na mesa. A sombra acompanha quem anda a cada 6 quadros.
