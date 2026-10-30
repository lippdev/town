# Progresso

Memória operacional da implementação. Atualizado ao fim de cada ciclo, antes de
qualquer commit.

## Estado atual

**Stage em andamento:** nenhum — **MVP + polimento + refinamentos entregues**.

**Cadeia de gates:** Stage 0 GO · Stage 1 GO · Stage 2 GO (bloqueante) ·
Stages 3–4 GO · Stages 5–6 integrados · Stage 7 final **38/40** ·
Stage 8 polimento **GO** · Stage 9 refinamentos **GO** (rótulos adaptativos
fecharam a legibilidade angular).

**Métrica honesta de render:** 1,3 fps nesta máquina de QA (1 vCPU,
SwiftShader por software). Em GPU dedicada o caminho de render é o mesmo.

**Cadeia de gates:** Stage 0 GO · Stage 1 GO · Stage 2 GO (bloqueante) ·
Stages 3–4 GO · Stages 5–6 integrados · Stage 7 final **38/40**.

## Provas mecânicas do Gate 2 (harness)

Bateria de 18 capturas em 1440×900, Chromium 156 + WebGL 2 (SwiftShader), zero
erro de console. `qa/screenshots/manifest.json`:

| Prova | Resultado |
| - | - |
| Cutaway por vista | norte 11, leste 11, sul 11, oeste 11 — exatamente as paredes voltadas para a câmera em cada lado |
| Arrasto real (botão direito) | azimute 40,31° → −78,98° em um arrasto; alvo fixo em [0,0,0] |
| Arrasto vertical | elevação 37,33° → 65,94° |
| Seleção por clique | centro → `hall`; fundo → seleção limpa |
| Foco por duplo clique | Engenharia centrada (cx 0,5046), a 26 unidades, largura da sala em 44% do quadro |
| Reset | vista volta exata: az 40,31°, el 37,33°, dist 54,42 |
| Estabilidade em diagonal | az 40°→46°: 11→11 paredes em cutaway; sem flicker |
| Enquadramento | prédio centrado (cx 0,5051) em 76% da largura do quadro |

## Bugs encontrados e consertados nesta etapa

1. **Botão direito fazia pan em vez de girar.** Duas causas somadas: o
   `HQScene` montava um `OrbitControls` cru do drei com o mapeamento padrão
   (esquerdo gira, direito pan), e `MOUSE.ROTATE` vale 0 — usar o código do
   botão (2) no lugar da ação selecionava `MOUSE.PAN`. Corrigido com
   configuração imperativa no `CameraRig` e mapeamento
   `{ LEFT: -1, MIDDLE: DOLLY, RIGHT: ROTATE }`.
2. **Foco de sala parava a câmera dentro do prédio** (15 unidades). Distância
   agora é `clamp(largura × 2,4, 26, 36)`.
3. **Capturas podiam fotografar o resíduo de damping**: o harness agora espera
   a vista assentar (duas leituras idênticas) antes de fotografar.

## Pendências (pós-MVP, todas de polimento)

- Luz de interiores progressivamente mais quente.
- Live real: instância do OpenMausBot acessível + proxy deployado.
- Hover em personagens (hoje hover destaca só salas).
