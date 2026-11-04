# Personagens 3D (GLB) — como fazer e colocar no Lipp HQ

Cada bot pode ganhar um personagem semi-realista: um arquivo `.glb` com malha,
texturas, esqueleto e animações. Sem arquivo, o bot continua com a figura
simples de sempre. O modelo é opcional e entra bot por bot.

## O que o app espera

| Item | Como deve ser |
| - | - |
| Formato | `.glb` (glTF binário), um arquivo por bot |
| Esqueleto | humanoide, de preferência o rig do Mixamo |
| Animações | dentro do mesmo arquivo: **parado**, **andar**, **sentado**, **digitando**, **conversando** |
| Andar | "In Place" (sem sair do lugar): quem move o bot pela sala é o app |
| Frente | olhando para a frente do Blender (vista frontal, numpad 1); o exportador converte |
| Tamanho | qualquer um: o app mede e normaliza para 1,72 m (ajustável) |
| Peso | até ~30 mil triângulos, texturas de 1024–2048 px, arquivo de até ~8 MB |

O app procura as animações pelo nome. Ele reconhece os nomes do Mixamo e do
Blender (`Idle`, `Walking`, `Sitting Idle`, `Typing`, `Talking`,
`Armature|Walking`…) e nomes em português (`parado`, `andando`, `sentado`,
`digitando`, `conversando`). Se faltar "digitando" ou "conversando", o bot
fica na animação de sentado. Os estados do Hermes viram poses assim:

| Estado do bot | Pose |
| - | - |
| trabalhando, bloqueado | digitando (sentado na mesa) |
| em reunião / briefing | conversando (sentado na mesa de reunião) |
| andando entre salas | andar |
| aguardando, ocioso, offline | parado |

## Caminho recomendado: criar → riggar → juntar → exportar

Você não precisa modelar do zero. O caminho mais curto até um humano
semi-realista animado tem quatro etapas.

### 1. Criar o personagem

Escolha uma ferramenta:

- **MPFB (MakeHuman para Blender)**: plugin gratuito e open source. Gera
  humanos de proporção real com roupas, cabelo e pele, controlados por
  sliders (idade, peso, altura, etnia). É o melhor custo-benefício para
  semi-realista e fica tudo dentro do Blender.
- **Character Creator (Reallusion)**: pago, com o resultado mais realista e
  roupas prontas. Exporta FBX.
- **Imagem → 3D com IA** (Meshy, Tripo, Rodin e similares): você manda um
  conceito ou foto e recebe malha com textura. Algumas fazem o rig sozinhas.
  O rosto e as mãos variam muito de qualidade; confira os termos de uso de
  cada uma.

Dica de estilo: faça os sete bots com a **mesma ferramenta e as mesmas
proporções**, mudando rosto, cabelo e roupa. Use a cor de identidade de cada
bot na camisa ou num detalhe (a do Pulse é azul `#3b82f6`). Assim a cena fica
coerente e cada um continua reconhecível pela cor que o painel usa.

Exporte em **T-pose ou A-pose**, como FBX ou OBJ.

### 2. Riggar e animar no Mixamo (grátis, conta Adobe)

1. Em [mixamo.com](https://www.mixamo.com), faça **Upload Character** com o
   FBX/OBJ. Se ele vier sem esqueleto, marque queixo, pulsos, cotovelos,
   joelhos e virilha.
2. Baixe o personagem: **FBX Binary, With Skin**, na pose T.
3. Para cada animação, busque, ajuste e baixe como **FBX Binary, Without
   Skin**:
   - `Breathing Idle` ou `Idle` → parado
   - `Walking`, com **In Place** marcado → andar
   - `Sitting Idle` → sentado
   - `Typing` → digitando
   - `Sitting Talking` → conversando

### 3. Juntar tudo no Blender

1. **File → Import → FBX**: importe o personagem com skin.
2. Importe cada animação. Cada uma vem com uma armature própria.
3. No **Dope Sheet → Action Editor**, renomeie cada action (`Idle`,
   `Walking`, `Sitting Idle`, `Typing`, `Talking`).
4. Selecione a armature do personagem. Para cada action, escolha-a no Action
   Editor e clique em **Push Down**: ela vira uma faixa no NLA, e o exportador
   inclui todas.
5. Apague as armatures extras das importações de animação.
6. Confira a escala (o Mixamo usa centímetros; o app corrige) e se o
   personagem olha para a vista frontal.

### 4. Exportar o GLB

**File → Export → glTF 2.0**:

- Formato: **glTF Binary (.glb)**
- Include: só o personagem e a armature (use "Selected Objects")
- Mesh: **Apply Modifiers**
- Animation: ligado, modo **Actions** (ou NLA Tracks)
- Compressão: deixe **desligada** no Blender. A opção Draco depende de um
  decodificador baixado da internet (gstatic) na hora de abrir; o meshopt,
  usado no passo opcional abaixo, já vem no app e funciona offline.

Opcional, para arquivos menores:

```bash
npx @gltf-transform/cli optimize pulse.glb pulse-otimizado.glb --compress meshopt --texture-compress webp
```

Antes de colocar no app, confira as animações num visualizador, como o
[gltf-viewer](https://gltf-viewer.donmccurdy.com/) ou o
[editor do three.js](https://threejs.org/editor/).

## Colocar no projeto

1. Copie o arquivo para `public/characters/`, por exemplo
   `public/characters/pulse.glb`.
2. Registre em `public/characters/manifest.json`. A chave é o id do bot (o
   nome do perfil no Hermes):

```json
{
  "version": 1,
  "characters": {
    "pulse": { "file": "pulse.glb" },
    "argos": { "file": "argos.glb", "height": 1.8 }
  }
}
```

3. Recarregue a página. Na gaveta do bot, a aba **Personagem** mostra que ele
   usa o modelo 3D.

Ajustes por bot, todos opcionais:

| Campo | Para quê | Exemplo |
| - | - | - |
| `height` | altura final em metros (padrão 1,72) | `1.65` |
| `clips` | nome exato da animação, quando o automático erra | `{ "type": "Armature\|Typing_v2" }` |
| `seatOffset` | encaixar na cadeira: `y` sobe/desce, `z` aproxima da mesa (m) | `{ "y": -0.05, "z": 0.1 }` |
| `yawDeg` | girar o modelo exportado olhando para outro lado | `180` |

`"default": { "file": "base.glb" }` no manifesto veste todos os bots que não
têm entrada própria, o que é útil para testar um modelo na frota inteira.

## Problemas comuns

| Sintoma | Causa e conserto |
| - | - |
| O bot aparece de costas ou de lado | export com outra frente: `"yawDeg": 180` (ou 90) |
| O bot desliza ou sai do lugar ao andar | a animação não é "In Place": baixe de novo no Mixamo com a opção marcada |
| Braços em T parados | o nome da animação não foi reconhecido: mapeie em `clips` |
| O bot afunda ou flutua na cadeira | `seatOffset.y`; para mais perto ou longe da mesa, `seatOffset.z` |
| Voltou a figura simples | o arquivo falhou: o console mostra `[personagens] não consegui carregar …` |
| A cena fica lenta | modelo pesado: reduza triângulos (Decimate no Blender) e otimize as texturas |

No console do navegador, `__HQ_QA__.characterModels()` lista os personagens
carregados com altura e posição, e `__HQ_QA__.getAgentPose("pulse")` mostra a
animação que está tocando.

## Se preferir modelar do zero

Também dá, só leva mais tempo:
1. Corpo base no Blender (ou partindo de um humano do MPFB).
2. Retopologia.
3. UV.
4. Texturas (Substance Painter ou o próprio Blender).
5. Rig com Rigify ou pelo Mixamo.

O contrato do app é o mesmo: um GLB com as animações nomeadas.

Mande os arquivos (FBX, GLB ou o `.blend`) que eu faço o encaixe, ajusto
escala, frente e assento, e registro no manifesto.
