# Estúdio de personagens

Página própria para criar variações a partir do modelo real do Pulse, sem Blender.
A forma dos personagens continua sendo a do Pulse: o estúdio muda cor, proporção e
acessório, e o refinamento livre acontece no chat com o agente.

- **Dev:** `http://127.0.0.1:5173/personagens.html` (ou a porta em que o Vite estiver)
- **Build:** `pnpm build` gera `dist/personagens.html` junto do app principal
- **Independência:** não carrega o mundo nem fala com o Hermes, e não faz requisição externa

## O que dá para mudar, e por quê

Os controles vêm de uma inspeção do `public/prototipo/pulse.glb`, não de uma lista
de desejos. Só existe controle para o que o arquivo suporta.

| Controle | Como funciona | Faixa |
| - | - | - |
| Pele, Cabelo, Camisa, Bermuda, Cinto, Olhos e sobrancelhas | Cor do material nomeado (Skin, Hair, Shirt, Pants, Belt, Face), em cópia por personagem | qualquer cor |
| Altura | Escala da figura; desconta o quanto a cabeça soma, então 1,76 m é medido de verdade | 1,50–2,00 m |
| Largura do corpo | Escala lateral e em profundidade; desfeita no osso da cabeça para ela não achatar | 85–120% |
| Tamanho da cabeça | Escala do osso `Head`, que não tem trilha de escala nas animações | 80–130% do Pulse |
| Óculos | Geometria simples presa ao osso da cabeça: segue pose e tamanho | ligado/desligado |

Poses: **Em pé** (primeiro quadro do `Idle`, ou o clipe tocando com **Movimento**) e
**Sentado** (`SitDown`, com um banco neutro na altura medida do assento).

### O que não existe, e não adianta procurar

- **Corte de cabelo e roupa:** são uma malha só com um material cada. Dá para mudar a
  cor, não a forma. O mesmo vale para rosto, nariz e boca: o material Face são só os
  olhos e as sobrancelhas, e não há boca.
- **Sapatos:** os pés fazem parte da pele. E "Pants" é uma bermuda: a malha termina
  acima do joelho.
- **Comprimento de pernas:** os ossos dos pés não são filhos das pernas (são irmãos,
  presos por IK e assados nos clipes). Esticar a perna soltaria o pé.
- **Formas novas** pedem outro modelo, ou modelagem fora daqui.

### Duas descobertas sobre o arquivo

**O rosto do arquivo é claro.** Face é `#ece7db` no `pulse.glb` e `#fffff0` no FBX
original, então a base é fiel ao arquivo e parece ter olhos brancos. As amostras e os
outros modelos oferecem tons escuros; é um clique. A base não foi escurecida para
continuar igual ao arquivo (há teste conferindo).

**As trilhas do osso raiz estão ligadas ao nó errado.** Na conversão FBX → GLB, a malha
e o osso raiz ficaram com o nome `Body`, e o exportador ligou as trilhas à malha. Por
isso, tocando o arquivo como está, o quadril nunca desce no `SitDown` e a canela fica a
43 unidades do pé. O estúdio religa as trilhas ao osso **numa cópia em memória**, e a
distância cai para menos de 1 unidade (`retargetBodyTracks`, com teste). Fora daqui nada
mudou: `pulse.glb` e a cena do protótipo seguem como estavam, então o protótipo ainda
tem esse defeito e o quadril dele continua alto. A cabeça levemente inclinada para trás
ao sentar é da animação original.

## Trabalhar prompt a prompt

A página **não interpreta texto e não chama IA**. O ciclo é:

1. Escolha um modelo ou variação e ajuste o que quiser nos controles.
2. Escreva o pedido em **Notas e pedido**, por exemplo "mais velho, camisa social".
3. Use **Copiar pedido e ficha** e cole no chat.
4. O agente responde de uma das duas formas:
   - **Modelo novo:** edita `src/character-studio/model/presets.ts`, e ele aparece em
     *Modelos* ao recarregar.
   - **Ficha:** você cola em **Importar**, e ela vira uma variação nova.

Se o pedido não couber nos controles (trocar corte de cabelo, por exemplo), a resposta
certa é dizer isso e propor outro caminho, não fingir que deu.

### Para o agente

- **Presets** ficam em `presets.ts` e nunca vão para o localStorage. Ao mudar um preset,
  suba `revision` e explique em `changelog`.
- **Variações** guardam a impressão digital do preset de origem. Se o conteúdo mudar na
  fonte, a variação mantém seus valores e mostra um aviso com **Usar a revisão** e
  **Manter a minha**. A detecção é pelo conteúdo, então esquecer de subir o número não
  esconde a mudança; subir o número só melhora a mensagem.
- **Ficha:** `kind: "lipp-hq/ficha-personagem"`, `version: 1`. Valores fora da faixa são
  recusados com a mensagem do campo, nunca corrigidos em silêncio. A ficha carrega o
  crédito e o SHA-256 da base.

## Salvamento

- Só variações e seleção vão para `hq.personagens.v1`, neste navegador.
- Dado corrompido ou variação inválida vai para `hq.personagens.backup`, com aviso.
- Se o backup falhar, o original é preservado e o salvamento fica bloqueado; novas
  variações ainda podem ser exportadas.
- Dado salvo por uma versão futura não é sobrescrito: a aba avisa e não grava.
- Essa proteção também vale quando outra aba salva uma versão futura com o estúdio já aberto.
- O desfazer vale para a sessão e cobre edição, exclusão, importação e restauração. Não
  sobrevive a recarregar.
- Para guardar de verdade ou levar a outro lugar, exporte a ficha.

## Custo

Renderização sob demanda: parado, nenhum quadro é desenhado (medido pelo contador do
renderizador). DPR limitado a 1,75, três luzes direcionais e uma hemisférica, um mapa de
sombra de 1024 e nenhum pós-processamento. O laço só roda continuamente com
**Movimento** ligado e para com a aba oculta. Não houve benchmark de FPS: nada aqui
afirma desempenho em outras máquinas.

## Verificar

```sh
pnpm test                # lógica e contrato com o pulse.glb
pnpm qa:personagens      # navegador real; HQ_ORIGIN escolhe o servidor
```

O QA lê os materiais presos às malhas, os vértices com esqueleto aplicado e os pixels do
canvas, e cobre import/export, recarga, estados de falha e larguras. Grava capturas e
`resultado.json` em `/tmp/hq-personagens` (ou `HQ_STUDIO_OUTPUT`).

## Limites

- As variações ainda **não aparecem no escritório**: a cena principal e o protótipo não
  leem as fichas. Ligar isso é um próximo passo separado.
- O sombreamento é facetado porque o modelo é low-poly; o estúdio não melhora a malha.
- Largura muito alta com cabeça pequena fica caricata: as faixas evitam quebra, não
  garantem bom gosto.

## Créditos

Base: **Casual Male — Ultimate Animated Character Pack**, de Quaternius, CC0 1.0.
Detalhes e conversão em `public/prototipo/CREDITOS.md`, hashes em
`public/prototipo/proveniencia.json`, e o painel do estúdio aponta para os dois.
