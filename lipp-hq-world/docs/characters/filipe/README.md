# Filipe — referência de personagem v1

Estado: proposta visual gerada; não implica aprovação final do usuário.
Fonte principal: original.png. Folha derivada: ficha-v1.png.
Uso: referência de identidade para sprites 2.5D no escritório Lipp HQ.

## Identidade fixa
- Adulto de proporções naturais estilizadas; sem proporções chibi.
- Pele quente conforme o desenho original, não as fotografias.
- Cachos castanhos curtos com luzes caramelo; laterais baixas.
- Sobrancelhas escuras espessas e arqueadas, olhos avelã/oliva.
- Nariz arredondado, bigode conectado à barba curta no maxilar e pequeno tufo abaixo do lábio.
- Moletom preto com capuz abaixado, bolso canguru, cordões cinza e punhos canelados.
- Calça cargo preta folgada, bolsos externos com aba.
- Tênis preto e creme, mantendo o desenho da referência.
- Sem acessórios adicionais.

## Paleta de referência
Âncoras propostas para padronização, não cores medidas do original nem garantia de quantização da imagem gerada.

| Grupo | Luz | Base | Sombra |
| --- | --- | --- | --- |
| Pele | #F4A56E | #D8804E | #9B5032 |
| Cabelo / barba | #BD7B4C | #75472F | #38251F |
| Roupa | #414045 | #29282D | #151418 |
| Tênis | #F1DFC0 | #BFA984 | #151418 |
| Olhos | — | #777B42 | #38251F |

## Vistas
Frente, perfil a 90°, costas e três quartos de corpo inteiro; detalhes do rosto em frente, perfil e três quartos.
Manter mesma escala e linha dos pés. Costas inferidas conservadoramente: capuz sobre as costas, sem bolso frontal no verso.
A ficha é referência artística, não spritesheet pronta: grade, resolução nativa, pivôs e quadros serão definidos ao integrar ao diorama.

## Regras para novas gerações
Anexar original.png e ficha-v1.png. O original prevalece em divergências de identidade.
Mudar apenas ação, pose, direção e câmera explicitamente solicitadas.
Preservar rosto, cabelo, proporções, cores, corte da roupa e calçados.
Produzir pixels nítidos; sem converter para render 3D, voxel ou pintura suave.
Para sprites finais, usar fundo transparente e conferir oclusão com mesa/cadeira, escala e contato dos pés.
Não usar gerações sucessivas como única referência: sempre reutilizar a ficha e o original.
Validar consistência de rosto, roupa, mãos, bolsos e tênis em cada novo quadro.

## Prompt reutilizável
Use as referências anexadas para desenhar Filipe em pixel art, na ação [AÇÃO], direção [DIREÇÃO] e câmera [CÂMERA].
Preserve rigorosamente identidade, proporções, paleta e roupa da ficha. Altere apenas a pose solicitada.
Mantenha os detalhes reconhecíveis no tamanho de uso. Fundo [FUNDO]. Sem personagens ou acessórios adicionais.

## Padrão para futuros agentes
Cada agente terá: identificador, versão, fonte original, ficha com quatro vistas, detalhes de rosto, paleta HEX, roupa fixa, variações permitidas, prompt e estado de aprovação.
Não definir aparência dos agentes antes das instruções do usuário.

## Produção
Gerado com ferramenta integrada image_gen. Prompt completo em prompt-geracao-v1.txt.

