# Spike: Engenharia em “Habbo com realismo”

## Conclusão provisória do protótipo

Uma sala navegável com materiais PBR, luz quente e recorte isométrico é viável. **Este spike não reproduz o acabamento da referência.** O gargalo para chegar à imagem é direção/produção de arte e animação, além da otimização do andar; não basta baixar alguns GLBs e ajustar luzes.

Abrir `http://127.0.0.1:5198/?prototipo=engenharia`. Sem a query exata, continua `HQScene`, sem baixar assets do protótipo. A sala é um cenário isolado, não foi encaixada na planta/navegação do andar. HUD, seleção do Pulse, gaveta e indicador original funcionam. Câmera ortográfica fixa em 45° de azimute e 30° de elevação; os comandos globais de orbitar/focar/parede não controlam este cenário experimental.

## O que o teste entrega e o que falta

- Corte de duas paredes, janela com venezianas, madeira PBR, corredor de pedra clara, vidro simples, estante, livros, sofá, mesa e dois monitores acesos. Identidade azul do Pulse e indicador existente.
- Planta e luminária reais do Poly Haven; humano riggado do Quaternius. Fontes, licenças, alterações e hashes em `public/prototipo/CREDITOS.md` e `proveniencia.json`. GLBs meshopt, texturas até 1k. Downloads não foram executados.
- O sofá CC0 vitoriano não combinava com a referência: foi substituído por geometria arredondada construída em código com relevo de tecido CC0. Mesa/estante/cadeira continuam simples. Repetição dos livros e plantas, paredes lisas, ausência de objetos específicos e falta de iluminação global deixam a cena menos convincente.
- O humano permanece low poly. Reduzir a cabeça corrige parte da proporção, mas não entrega rosto, cabelo, roupa e mãos realistas. `SitDown` é uma transição CC0 que congela sentada; há respiração procedural sutil, **não digitação**. Não foi inventado nem obtido um clipe Mixamo. A pose precisa de ajuste artístico para apoiar mãos/antebraços no teclado e assentar pernas/pés/cadeira com naturalidade.
- Sem SSAO/bloom/composer no protótipo. Um mapa de sombra 2048, PCSS com oito amostras, três outras luzes sem sombra, ambiente PMREM local e ContactShadows 512 calculado uma vez. Não é lightmap baked nem iluminação global. `QualityController` mantém o downgrade Auto, limite de DPR e atualização de sombra a cada 2/4 quadros.
- PCSS foi mantido com o mesmo custo de amostragem em Alta e Leve; Leve reduz DPR. Para o andar, seria preciso reduzir também amostras/sombra e medir de novo.

## Reprodução

No diretório `lipp-hq-world`, em processos separados:

```sh
node scripts/hermes/fixture-gateway.mjs --api-port 18642 --dashboard-port 18119
HQ_CONNECTION_FILE=/tmp/hq-proto-none.json HERMES_API_URL=http://127.0.0.1:18642 HERMES_DASHBOARD_URL=http://127.0.0.1:18119 pnpm dev --port 5198 --strictPort
node scripts/visual-qa/prototype.mjs
```

O harness usa Chromium headless com Metal e GPU blocklist ignorada, viewport 1728×1000, deviceScaleFactor 2. Cada cena/qualidade abre um contexto novo, aquece 10 s e coleta três janelas de 5 s por requestAnimationFrame. VSync permanece ligado. Não mede latência de GPU, potência ou dispositivos móveis. O teto perto de 60 fps não prova folga de GPU. Comparação é **uma sala contra o andar atual inteiro**, não equivalência de conteúdo.

`fpsP95` é o percentil alto (melhores quadros); `frameMsP95` e `fpsP05` mostram a cauda lenta. A ponte `renderInfo()` na cena normal em Alta retorna só o último passe do composer (1 chamada / 1 triângulo), portanto esse número não representa o andar. Em Leve, há contadores úteis do desenho e das sombras, que variam entre quadros porque a sombra não é atualizada em todos.

O harness verifica hover/saída, indicador com Pulse, gaveta e ausência de downloads do protótipo na rota normal/query desconhecida. Retém no JSON o aviso `forwardRef` já presente na cena normal e abortos de snapshot da limpeza dos effects; abortos `ERR_ABORTED` da API são tolerados, outros erros de rede e erros de runtime falham.

Saídas em `/tmp/hq-proto`; métricas e imagens finais são registradas abaixo após a execução.

## Estimativa do andar — esforço, não promessa

O pedido foi tratado literalmente como **9 salas + hall + reunião, 11 ambientes, 7 personagens**. A planta atual tem 9 ambientes no total (7 departamentos + hall + reunião), portanto reaproveitar apenas essa planta reduz o escopo de layout.

| Frente | O que pode ser reaproveitado | Esforço estimado |
| - | - | - |
| Kit de ambientes e montagem de 11 salas | CC0 para móveis/plantas/materiais; código para paredes, pisos, variações, letreiros | 6–10 dias de engenharia/arte técnica |
| Iluminação e coerência visual | PBR, paleta comum, sombras; seleção/retexturização de assets e AO/lightmaps por sala | 4–7 dias de arte técnica |
| Sete personagens coerentes | Um corpo/rig base reutilizado, mas roupas, cabelos, rostos, mãos e silhuetas precisam de autoria/ajuste | 8–15 dias de artista 3D |
| Sentar, digitar, caminhar e conversar | Reaproveitar CC0 quando houver; criar/retargetar clipes e encaixar mesa/cadeira | 5–8 dias de animação/arte técnica |
| Integração, desempenho e QA do andar | Pipeline existente, batching/instancing/LOD, culling, limites de luz, teste dos 7 rigs e hardware inferior | 6–10 dias de engenharia |

Total para aproximar o acabamento pretendido: **29–50 pessoa-dias**, cerca de **6–10 semanas de uma pessoa especializada**, com incerteza de ~30% e revisão visual do dono. Com engenharia e artista em paralelo, o calendário pode diminuir; a soma do esforço não desaparece. Não inclui gerar nove salas distintas com qualidade de render offline nem garante fidelidade à imagem conceitual.

Para expandir **o nível desta captura**, com humano low poly, peças simples e materiais compartilhados: aproximadamente **6–10 dias úteis**, mais uma rodada de desempenho em máquina inferior. Isso é uma entrega visual diferente da referência.

O peso não cresce 11 vezes se o kit e os materiais forem compartilhados. Orçamento inicial razoável para planejar: 15–30 MB para o andar carregado progressivamente, 3–6 MB na entrada, 1–3 MB de modelos extras por personagem realista (estimativa, não medição). O atual personagem comprimido é muito menor porque não tem pele/roupa texturizadas. Em memória, imagens JPEG/WebP viram texturas descomprimidas: download pequeno não elimina custo de VRAM.

Não multiplicar o FPS desta sala por onze. A geometria, os rigs e sombras crescem por instância; luzes por sala podem afetar todos os materiais. Antes de ampliar: atlas/material compartilhado, mobiliário instanciado, plantas com LOD, luzes baked/emissivas onde possível, somente uma sombra global e limite explícito de geometria visível. Reavaliar perto de 500–800 chamadas e ~1 milhão de triângulos visíveis no equipamento alvo; são metas iniciais de orçamento, não capacidade garantida.

**Recomendação:** seguir com uma direção intermediária de diorama isométrico, materiais críveis e personagens estilizados coerentes. O resultado fica mais fácil de manter e expandir. Para perseguir a referência de perto, reservar artista 3D/animação e validar primeiro um personagem e um kit de móveis; replicar o spike agora ampliaria suas limitações. Pixel art não é automaticamente mais barata: sprites, direções e animações próprios também exigem produção, e migrar o renderer/planta traria outro custo.

## Resultado medido em 2026-11-03

Estado visual medido: `422711fc1ed03fb4b8c94c8680c53017aa37684f`; commits posteriores só registram evidência/harness/documentação. Apple M1, 8 GB, macOS arm64, Chromium 156.0.8078.4.

| Cena | Qualidade | DPR efetivo | FPS médio | FPS p50 | FPS p95 | Quadro p95 (ms) |
| - | - | -: | -: | -: | -: | -: |
| atual | alta | 1.5 | 31.73 | 30.03 | 59.88 | 33.4 |
| prototipo | alta | 1.5 | 60.00 | 59.88 | 60.24 | 16.7 |
| atual | leve | 1 | 59.54 | 59.88 | 60.24 | 16.8 |
| prototipo | leve | 1 | 60.00 | 59.88 | 60.24 | 16.7 |
| atual | auto | 1 | 60.00 | 59.88 | 60.24 | 16.8 |
| prototipo | auto | 1.5 | 59.93 | 59.88 | 60.24 | 16.7 |

Auto manteve Alta no protótipo e reduziu a cena atual para Leve. Três amostras por linha, agregadas pela média de FPS médio e mediana dos percentis. Valores crus em `prototipo-evidencias/metricas.json`.

**Geometria/chamadas:** protótipo 127 chamadas e 240.371 triângulos sem atualizar sombra; 199 / 472.242 quando atualiza. Cena atual em Leve: 694 / 45.742 e 1.186 / 78.712 respectivamente. A sala tem 5,25× a geometria visível do andar atual, embora menos chamadas e sem composer. Onze cópias ingênuas seriam ~2,64 milhões de triângulos visíveis antes das sombras — extrapolação, não teste realizado. Não foi validado o andar inteiro neste nível.

**Peso:** 5.508.679 bytes (5,51 MB decimal / 5,25 MiB) de assets binários no disco e recebidos pelo navegador sem cache. 3 GLBs e 9 JPEGs 1024×1024; metadata/créditos somam cerca de 15 KB e não são solicitados pela cena. O bundle do protótipo é lazy; nenhum asset `/prototipo/` foi baixado pela cena normal ou pela query desconhecida.

**Interações:** hover mostra Engenharia / Pulse / trabalhando / 1 sessão ativa; sair remove o indicador; clique na lista abre a gaveta. Zero erros de runtime e zero falhas de recursos da cena. Mesmo aviso React `forwardRef` e aborto inicial do snapshot aparecem nas duas cenas; permanecem no JSON, não foram ocultados.

**Limites do QA:** `renderInfo` em Alta na cena atual conta só o passe final. `characterModels()` usa AABB que não acompanha corretamente o skin importado deste FBX, portanto não foi usado como medida de altura. Capturas conferidas visualmente; não houve validação artística, de hardware inferior ou de navegação dos sete personagens no novo cenário.
