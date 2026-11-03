# Validação visual

Nenhum stage é aprovado por compilação, teste unitário ou leitura de DOM. A
aprovação vem de screenshot real do canvas WebGL, inspecionado por um revisor com
capacidade de visão.

## Harness

`scripts/visual-qa/capture.mjs`:

1. Sobe o build de produção em `vite preview`.
2. Abre o Chromium real com `--use-angle=swiftshader` e `--enable-unsafe-swiftshader`.
3. Espera `window.__HQ_WORLD_READY__`, marcado três frames após o mount.
4. Executa as capturas, incluindo arrasto real com o botão direito.
5. Audita cada PNG: luminância média e desvio padrão. Imagem chapada ou preta reprova.
6. Grava `qa/screenshots/manifest.json` com hash, métricas, renderer WebGL e erros de
   console. Erro de console reprova.

Execução:

```bash
pnpm build
node scripts/visual-qa/capture.mjs --serve
```

## Revisão por visão

A rota do modelo principal (DeepSeek V4.1 Flash) não aceita imagem como entrada.
A revisão visual é delegada a um subagente no GPT-6.1 Terra, um dos modelos
permitidos pelo projeto, que recebe a imagem de referência e os screenshots reais.

Cada revisor devolve:

- Notas de 1 a 5 por critério da rubrica.
- Lista objetiva de defeitos com severidade.
- Correções obrigatórias.
- Resultado GO / NO-GO.

## Rubrica

| Critério | Máximo |
| - | -: |
| Semelhança de linguagem visual com a referência | 5 |
| Organização e legibilidade dos departamentos | 5 |
| Geometria, proporções e posicionamento | 5 |
| Câmera e cutaway das paredes | 5 |
| Qualidade e legibilidade dos personagens | 5 |
| Iluminação, materiais e coesão estética | 5 |
| Interface, placas e enquadramento | 5 |
| Estabilidade visual e qualidade da renderização | 5 |

Aprovação final: mínimo 34/40, nenhum critério abaixo de 4, nenhum defeito crítico.

## Relatórios

`qa/reviews/stage-N.md` registra data, commit, screenshots usados, notas, defeitos,
correções obrigatórias e o veredito.
