# Arquitetura — Lipp HQ World

Aplicação web independente que representa a operação da Lipp HQ como um escritório
3D interativo. Ela **lê** o estado do OpenMausBot; não executa, altera nem substitui
o trabalho dos agentes.

## Decisões estruturais

**React Three Fiber sobre Three.js puro.** O requisito é cena 3D real com estado de
interface em volta. R3F mantém a árvore declarativa e deixa `useFrame` para tudo que
precisa rodar a 60 FPS, sem re-render do React por frame.

**Cada parede é um objeto.** O prédio não é um mesh único. Todo segmento carrega
dono, eixo, normal externa, portas e estado de cutaway, porque o sistema de paredes
dinâmicas precisa decidir visibilidade por segmento.

**Corredores entre todas as salas.** As nove salas ocupam uma grade 3×3 e os vãos
entre as células são corredores de 2,0 a 2,4 unidades. Consequência arquitetural
importante: nenhuma parede é compartilhada entre duas salas, então não existe parede
duplicada sobreposta e cada segmento tem uma única normal externa.

**Geometria derivada de dados.** `src/world/rooms/rooms.ts` é a planta. Piso, paredes,
portas, placas e âncoras de mobiliário saem dessa estrutura declarativa.

**Estado de simulação fora do Three.js.** Nenhum componente 3D conhece formatos da
API do OpenMausBot. O adaptador normaliza tudo em `HQEvent` antes de chegar à cena.

## Eixos e escala

Uma unidade do Three.js representa aproximadamente um metro. O piso fica no plano
XZ em `y = 0`; `y` é altura. Pé-direito 2,8; paredes 0,2 de espessura; personagens
1,4–1,7; mesas 0,75; portas 2,1 × 1,5.

## Planta

```
z = -12.4  +------------+------------+------------+
           | Engenharia |  Comando   | Comunidade |
z = -5.0   +------------+------------+------------+
              corredor     corredor     corredor
z = -3.0   +------------+------------+------------+
           |  Pesquisa  |    Hall    |   Produto  |
z =  3.0   +------------+------------+------------+
              corredor     corredor     corredor
z =  5.0   +------------+------------+------------+
           |  Conteúdo  | Operações  |  Reuniões  |
z = 12.4   +------------+------------+------------+
          x=-16.2      x=-4.2       x=6.6       x=16.2
```

Os corredores verticais (x entre −6,6 e −4,2 e entre 4,2 e 6,6) e horizontais
(z entre −5,0 e −3,0 e entre 3,0 e 5,0) cruzam-se nos quatro cantos do Hall e
fecham na periferia com muros de perímetro.

## Módulos

| Caminho | Responsabilidade |
| - | - |
| `src/world/scene` | composição da cena raiz, laje, piso |
| `src/world/rooms` | planta declarativa e geradores de geometria por sala |
| `src/world/walls` | geração de paredes, oclusão e sistema de cutaway |
| `src/world/camera` | OrbitControls configurado, foco e reset |
| `src/world/navigation` | grid de navegação, A* e waypoints |
| `src/world/characters` | figuras low-poly, máquina de estados e animação |
| `src/world/furniture` | mobiliário procedural reutilizável |
| `src/world/lighting` | luzes fixas da cena |
| `src/agents` | definição dos sete agentes |
| `src/integrations/openmausbot` | adaptador de leitura da API real |
| `src/integrations/mock` | cenário determinístico de demonstração |
| `src/state` | store Zustand da aplicação |
| `src/components` | HUD, painéis e controles HTML |
| `scripts/visual-qa` | captura e auditoria de screenshots |

## Sistema de paredes dinâmicas

O cálculo vive em `src/world/walls/occlusion.ts`, puro TypeScript, sem dependência
do Three.js além de vetores, para poder ser testado isoladamente.

Para cada parede:

1. `facingScore` = produto escalar entre a normal externa e o vetor câmera→parede.
   Positivo significa câmera do lado externo, ou seja, a parede está entre a câmera
   e o interior.
2. `occlusionRatio` = fração das amostras da sala cujo segmento câmera→amostra, no
   plano XZ, cruza o segmento da parede.
3. A parede entra em cutaway quando `facingScore` e `occlusionRatio` passam dos
   limiares de entrada. Sai quando caem abaixo dos limiares de saída (histerese),
   para não piscar em ângulos diagonais.

`useWallVisibility` roda em `useFrame`, lê a câmera, recalcula apenas quando o
azimute muda o suficiente e interpola opacidade e altura do painel superior por
referência direta — sem `setState`.

No cutaway o rodapé (0,38) permanece visível e o painel superior colapsa. Painéis
ocultos saem do raycast para não roubar cliques de personagens atrás deles.

## Integração

`OpenMausBotAdapter` fala com um proxy de leitura no mesmo host, que guarda o token
fora do navegador. O navegador só recebe `HQEvent` normalizado. Contrato completo em
[INTEGRATION.md](INTEGRATION.md).

## Validação

Nada é declarado pronto por compilação. Cada stage fecha com screenshots reais do
canvas WebGL, analisados por um revisor com visão. Ver [VISUAL_QA.md](VISUAL_QA.md).
