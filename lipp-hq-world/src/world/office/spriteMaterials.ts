import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  MultiplyBlending,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { cameraFacingLight, floorShadowFactor, screenGroundAxes, shadowAxes } from "./officeSun";
import type { SpriteAtlas, SpriteQuad } from "./spriteAtlas";
import { MIP_REDUCTIONS, type SpriteTexels } from "./spriteMipmaps";

/** Grade de amostras por pixel na redução (N × N), cada uma no texel exato: média de caixa. */
const DOWNSCALE_TAPS = 3;
/** Texels por pixel onde o bilinear nítido dá lugar à média de caixa. */
const DOWNSCALE_FROM = [1.0, 1.3] as const;
/** Quanto do detalhe do pixel volta à redução na cor, e na borda da silhueta. */
const DOWNSCALE_SHARPEN = 0.6;
const DOWNSCALE_EDGE = 0.35;
/** Quanto da variação de luz chega à arte; a luz já está pintada nela. */
const LIGHT_RESPONSE = 0.4;
/**
 * O ambiente vem de textura e a conta o subestima: medido na cena (razão cena/arte do harness
 * de zoom, 1,12 com a conta crua), a luz de referência sobe até o sprite sair com a cor do atlas.
 */
const LIGHT_CALIBRATION = 2.5;
/** Limites do fator de exposição: a cena modula a arte, não a refaz. */
const LIGHT_RANGE = [0.45, 1.25] as const;
/** Quanto da cor da luz tinge a arte. */
const LIGHT_TINT = 0.25;
/** Sombra do sol sobre ele: escurece pouco, a roupa já é quase preta. */
const SHADED_SPRITE = 0.82;
/** Penumbra da silhueta no chão, em metros, junto ao pé e na ponta da cabeça. */
const PENUMBRA = { near: 0.03, far: 0.11 };
/** Quanto do alcance que o sol daria a sombra projetada mantém: mais curta, o contato faz o resto. */
const SHADOW_REACH = 0.8;
/** O sol vê o corpo mais de lado do que a câmera: a silhueta fica um pouco mais estreita. */
const SHADOW_WIDTH = 0.9;
/**
 * Sombra dos pés: a projeção exata vale até a altura `to` (m), o corpo entra a partir de
 * `from`, e cada ponto engorda por `width` e `depth` (m) para ter a espessura de um tênis.
 */
const SOLE_SHADOW = { from: 0.12, to: 0.4, width: 0.025, depth: 0.045 };
/** Sombra de contato: profundidade no chão (metros), altura da sola que ela lê, e força. */
const CONTACT = { depth: 0.1, sole: 0.04, strength: 0.55 };

export function spriteTexture(texels: SpriteTexels): DataTexture {
  const base = texels.levels[0]!;
  const texture = new DataTexture(base.data, base.width, base.height, RGBAFormat, UnsignedByteType);
  texture.mipmaps = texels.levels as unknown as DataTexture["mipmaps"];
  texture.generateMipmaps = false;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Uniforms de amostragem: um objeto só, para figura e sombra mudarem de quadro juntas. */
export function spriteUniforms(atlas: SpriteAtlas, texels: SpriteTexels, texture: DataTexture) {
  return {
    spriteAtlas: { value: texture },
    spriteAtlasSize: { value: new Vector2(texels.levels[0]!.width, texels.levels[0]!.height) },
    /** Canto da célula e tamanho do espaço dela, em texels do nível 0. */
    spriteBounds: { value: new Vector4(0, 0, texels.pitch.width, texels.pitch.height) },
    spriteInset: { value: new Vector2(texels.inset.x, texels.inset.y) },
    spriteContent: { value: new Vector2(atlas.cell.width, atlas.cell.height) },
    spriteMirrored: { value: 0 },
    /** Onde os pés do quadro estão em x, em texels a partir do meio da célula, já espelhado. */
    spriteSoleCenter: { value: 0 },
    /** A luz que a arte supõe: com ela, o sprite sai exatamente como o atlas. */
    spriteLightReference: { value: new Vector3(...cameraFacingLight()).multiplyScalar(LIGHT_CALIBRATION) },
  };
}

export type SpriteUniforms = ReturnType<typeof spriteUniforms>;

/** Põe o quadro nos uniforms; a arte espelhada lê a célula ao contrário. */
export function selectCell(uniforms: SpriteUniforms, texels: SpriteTexels, column: number, row: number, mirrored: boolean, soleCenter = 0) {
  uniforms.spriteBounds.value.setX(column * texels.pitch.width).setY(row * texels.pitch.height);
  uniforms.spriteMirrored.value = mirrored ? 1 : 0;
  uniforms.spriteSoleCenter.value = mirrored ? -soleCenter : soleCenter;
}

const SAMPLING = /* glsl */ `
uniform sampler2D spriteAtlas;
uniform vec2 spriteAtlasSize;
uniform vec4 spriteBounds;
uniform vec2 spriteInset;
uniform vec2 spriteContent;
uniform float spriteMirrored;
uniform vec3 spriteLightReference;
uniform float spriteSoleCenter;

/* Da célula para o atlas, em texels do nível 0, já com o espelhamento. */
vec2 spriteToAtlas( vec2 cellTexel ) {
  float x = spriteMirrored > 0.5 ? spriteContent.x - cellTexel.x : cellTexel.x;
  return spriteBounds.xy + spriteInset + vec2( x, cellTexel.y );
}

/* Nunca lê fora do espaço da célula: é o que impede vazar da vizinha em qualquer nível. */
vec2 spriteClampUv( vec2 levelTexel, float scale ) {
  vec2 low = spriteBounds.xy / scale + 0.5;
  vec2 high = ( spriteBounds.xy + spriteBounds.zw ) / scale - 0.5;
  return clamp( levelTexel, low, high ) * scale / spriteAtlasSize;
}

/*
 * Bilinear nítido: longe da fronteira entre texels, lê o centro do texel; perto dela,
 * interpola ao longo de um pixel de tela. Bloco nítido e de largura certa em qualquer escala.
 */
vec4 spriteSharpLevel( vec2 atlasTexel, vec2 footprint, float level ) {
  float scale = exp2( level );
  vec2 position = atlasTexel / scale;
  vec2 pixel = max( footprint / scale, vec2( 1e-4 ) );
  vec2 boundary = floor( position + 0.5 );
  vec2 offset = clamp( ( position - boundary ) / pixel, -0.5, 0.5 );
  return textureLod( spriteAtlas, spriteClampUv( boundary + offset, scale ), level );
}

float spriteAlpha( vec2 cellTexel, float lod ) {
  float scale = exp2( lod );
  return textureLod( spriteAtlas, spriteClampUv( spriteToAtlas( cellTexel ) / scale, scale ), lod ).a;
}

/* O texel inteiro, sem interpolar: um ponto da grade da média de caixa. */
vec4 spriteTexelAt( vec2 atlasTexel, float level ) {
  float scale = exp2( level );
  return textureLod( spriteAtlas, spriteClampUv( floor( atlasTexel / scale ) + 0.5, scale ), level );
}

/*
 * Média de caixa do pixel de tela: uma grade de amostras de texel, em gama e pesada pelo alfa.
 * Em gama, um olho escuro não lava contra a pele; pelo alfa, o vazio não puxa franja escura.
 * O nível é o que deixa as amostras mais próximas que um texel dele: nada some entre elas.
 */
void spriteBox( vec2 atlasTexel, vec2 footprint, float level, out vec3 gamma, out float coverage ) {
  vec3 sum = vec3( 0.0 );
  float alpha = 0.0;
  for ( int i = 0; i < ${DOWNSCALE_TAPS}; i ++ ) {
    for ( int j = 0; j < ${DOWNSCALE_TAPS}; j ++ ) {
      vec2 offset = ( vec2( float( i ), float( j ) ) + 0.5 ) / ${DOWNSCALE_TAPS}.0 - 0.5;
      vec4 tap = spriteTexelAt( atlasTexel + offset * footprint, level );
      if ( tap.a > 0.0 ) {
        sum += tap.a * pow( tap.rgb / tap.a, vec3( 1.0 / 2.2 ) );
        alpha += tap.a;
      }
    }
  }
  gamma = alpha > 0.0 ? sum / alpha : vec3( 0.0 );
  coverage = alpha / ${DOWNSCALE_TAPS * DOWNSCALE_TAPS}.0;
}

/*
 * A média de caixa devolve o que a redução tira: contorno. A diferença para a mesma média
 * com o dobro de largura é o detalhe do pixel (olho, sobrancelha, cordão), e volta somada.
 */
vec4 spriteDownscale( vec2 atlasTexel, vec2 footprint, float level ) {
  vec3 near;
  vec3 wide;
  float nearCoverage;
  float wideCoverage;
  spriteBox( atlasTexel, footprint, level, near, nearCoverage );
  spriteBox( atlasTexel, footprint * 2.0, min( level + 1.0, ${MIP_REDUCTIONS}.0 ), wide, wideCoverage );
  if ( nearCoverage <= 0.0 ) return vec4( 0.0 );
  vec3 gamma = wideCoverage > 0.0 ? clamp( near + ${DOWNSCALE_SHARPEN.toFixed(2)} * ( near - wide ), 0.0, 1.0 ) : near;
  float coverage = clamp( nearCoverage + ${DOWNSCALE_EDGE.toFixed(2)} * ( nearCoverage - wideCoverage ), 0.0, 1.0 );
  return vec4( pow( gamma, vec3( 2.2 ) ) * coverage, coverage );
}
`;

const SPRITE_SAMPLE = /* glsl */ `
vec4 spriteSample( vec2 cellTexel ) {
  vec2 footprint = fwidth( cellTexel );
  float size = max( max( footprint.x, footprint.y ), 1e-4 );
  vec2 atlasTexel = spriteToAtlas( cellTexel );
  // Perto de um texel por pixel, o bilinear nítido; mais longe, a média de caixa.
  float box = smoothstep( ${DOWNSCALE_FROM[0].toFixed(2)}, ${DOWNSCALE_FROM[1].toFixed(2)}, size );
  vec4 color = vec4( 0.0 );
  if ( box < 1.0 ) color = spriteSharpLevel( atlasTexel, footprint, 0.0 );
  if ( box > 0.0 ) {
    float level = clamp( floor( log2( size / 2.0 ) ), 0.0, ${MIP_REDUCTIONS}.0 );
    color = mix( color, spriteDownscale( atlasTexel, footprint, level ), box );
  }
  return color;
}
`;

/**
 * A figura usa o material dos móveis, com as mesmas luzes, ambiente e sombra, e troca o que
 * ele faz com a luz: a arte já vem com a luz pintada, então a cena só a modula, em relação à
 * luz de referência (`spriteLightReference`). Sob essa luz o resultado é a cor do atlas. Sem
 * tone mapping: ele comprime e satura, e a arte de pixel não quer a curva de um PBR. O
 * escritório não tem composer e a saída vai direto para a tela, só com a codificação sRGB.
 */
export function createSpriteMaterial(uniforms: SpriteUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 spriteContent;\nvarying vec2 vSpriteCell;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSpriteCell = uv * spriteContent;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vSpriteCell;\n${SAMPLING}\n${SPRITE_SAMPLE}`)
      .replace("#include <shadowmap_pars_fragment>", "#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>")
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        vec4 spriteTexel = spriteSample( vSpriteCell );
        if ( spriteTexel.a < 0.004 ) discard;
        vec3 spriteAlbedo = spriteTexel.rgb / spriteTexel.a;
        diffuseColor.a = spriteTexel.a;
        `,
      )
      .replace(
        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
        /* glsl */ `
        // Com a cor branca, a parte difusa é só a luz que chega: atenua, e aplica na arte.
        vec3 spriteLight = max( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3( 1e-3 ) );
        vec3 spriteWeights = vec3( 0.2126, 0.7152, 0.0722 );
        float spriteLuma = dot( spriteLight, spriteWeights );
        float spriteReferenceLuma = dot( spriteLightReference, spriteWeights );
        // Cor e brilho só pelo que a luz tem de diferente da referência.
        vec3 spriteTint = mix( vec3( 1.0 ), ( spriteLight / spriteLuma ) / ( spriteLightReference / spriteReferenceLuma ), ${LIGHT_TINT.toFixed(2)} );
        float spriteExposure = clamp( pow( spriteLuma / spriteReferenceLuma, ${LIGHT_RESPONSE.toFixed(2)} ), ${LIGHT_RANGE[0].toFixed(2)}, ${LIGHT_RANGE[1].toFixed(2)} );
        float spriteShade = mix( ${SHADED_SPRITE.toFixed(2)}, 1.0, getShadowMask() );
        vec3 outgoingLight = spriteAlbedo * spriteTint * spriteExposure * spriteShade;
        `,
      );
  };
  material.customProgramCacheKey = () => "filipe-sprite";
  return material;
}

/**
 * Sombra num só desenho: a silhueta do quadro atual estirada no chão, na direção do sol,
 * mais o contato sob os pés. Multiplica o que já está na tela, com a sobra de luz que os
 * móveis têm, e não escurece de novo onde o sol já está tapado por um móvel. Sai só com a
 * codificação de saída: um fator não passa por tone mapping.
 */
export function createSpriteShadowMaterial(
  uniforms: SpriteUniforms,
  atlas: SpriteAtlas,
  quad: SpriteQuad,
  clip: { minX: number; maxX: number; minZ: number; maxZ: number },
): ShaderMaterial {
  const axes = shadowAxes();
  const ground = screenGroundAxes();
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.lights]),
    lights: true,
    transparent: true,
    premultipliedAlpha: true,
    blending: MultiplyBlending,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <shadowmap_pars_vertex>
      varying vec2 vGround;
      varying vec2 vWorldGround;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
        vGround = position.xz;
        vWorldGround = ( modelMatrix * vec4( position, 1.0 ) ).xz;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <packing>
      #include <bsdfs>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      ${SAMPLING}
      uniform vec2 shadowAlong;
      uniform vec2 shadowAcross;
      uniform vec2 shadowRun;
      uniform float shadowReach;
      uniform float spriteTexelMeters;
      uniform float spriteTexelWidth;
      uniform float spriteSoleRow;
      uniform float spriteHeight;
      uniform vec3 shadowTint;
      uniform vec4 shadowClip;
      uniform vec2 groundRight;
      uniform vec2 groundToCamera;
      varying vec2 vGround;
      varying vec2 vWorldGround;

      /*
       * O corpo visto do sol: largura atravessada na sombra, altura ao longo dela. É o que dá
       * volume à sombra, e ele parte do ponto médio dos pés.
       */
      float body( vec2 world ) {
        // O corpo parte de onde os pés estão neste quadro, não do meio da célula.
        vec2 ground = world - groundRight * spriteSoleCenter * spriteTexelWidth;
        float height = dot( ground, shadowAlong ) / shadowReach;
        vec2 cellTexel = vec2(
          spriteContent.x * 0.5 + spriteSoleCenter + dot( ground, shadowAcross ) / ( spriteTexelWidth * ${SHADOW_WIDTH.toFixed(2)} ),
          spriteSoleRow - height / spriteTexelMeters
        );
        // A penumbra abre com a altura, como a dos móveis: quanto mais longe do que projeta.
        float penumbra = mix( ${PENUMBRA.near.toFixed(3)}, ${PENUMBRA.far.toFixed(3)}, clamp( height / spriteHeight, 0.0, 1.0 ) ) / spriteTexelMeters;
        vec2 footprint = fwidth( cellTexel );
        float radius = max( penumbra, max( footprint.x, footprint.y ) );
        float lod = max( 0.0, log2( radius ) );
        float sum = 0.0;
        sum += spriteAlpha( cellTexel + vec2( -0.5, -0.5 ) * radius, lod );
        sum += spriteAlpha( cellTexel + vec2( 0.5, -0.5 ) * radius, lod );
        sum += spriteAlpha( cellTexel + vec2( -0.5, 0.5 ) * radius, lod );
        sum += spriteAlpha( cellTexel + vec2( 0.5, 0.5 ) * radius, lod );
        // Embaixo, quem manda é a projeção dos pés: o corpo entra só acima deles.
        return sum * 0.25 * smoothstep( ${SOLE_SHADOW.from.toFixed(2)}, ${SOLE_SHADOW.to.toFixed(2)}, height );
      }

      /*
       * A figura em pé projetada pelo sol: um ponto a "a" metros do centro, no plano dela, e a
       * "h" de altura, cai no chão em a · direita + h · shadowRun. O inverso devolve o texel de
       * cada ponto do chão, e a sola (h = 0) fica sob si mesma em qualquer quadro: a sombra
       * dos tênis nasce nos tênis e sai deles. Só o pedaço de baixo, onde isto vale: o sol
       * quase de lado da câmera faz do plano uma fatia, e a fatia inteira seria uma risca.
       */
      float soleAt( vec2 ground ) {
        float det = groundRight.x * shadowRun.y - groundRight.y * shadowRun.x;
        float across = ( ground.x * shadowRun.y - ground.y * shadowRun.x ) / det;
        float height = ( groundRight.x * ground.y - groundRight.y * ground.x ) / det;
        if ( height < -0.03 || height > ${SOLE_SHADOW.to.toFixed(2)} ) return 0.0;
        vec2 cellTexel = vec2( spriteContent.x * 0.5 + across / spriteTexelWidth, spriteSoleRow - height / spriteTexelMeters );
        float lod = max( 0.0, log2( ${PENUMBRA.near.toFixed(3)} / spriteTexelMeters ) );
        return spriteAlpha( cellTexel, lod ) * ( 1.0 - smoothstep( ${(SOLE_SHADOW.to * 0.5).toFixed(2)}, ${SOLE_SHADOW.to.toFixed(2)}, height ) );
      }

      /* A mesma projeção com a espessura de um pé: a risca de um plano vira a sombra de um tênis. */
      float soles() {
        vec2 side = groundRight * ${SOLE_SHADOW.width.toFixed(3)};
        vec2 depth = groundToCamera * ${SOLE_SHADOW.depth.toFixed(3)};
        float sum = 0.0;
        sum += soleAt( vGround + side + depth );
        sum += soleAt( vGround - side + depth );
        sum += soleAt( vGround + side - depth );
        sum += soleAt( vGround - side - depth );
        return sum * 0.25;
      }

      /* Mancha escura sob os pés, no que o quadro atual tem de sola: só onde há pé no chão. */
      float contact() {
        vec2 local = vec2( dot( vGround, groundRight ), dot( vGround, groundToCamera ) );
        float depth = exp( -pow( local.y / ${CONTACT.depth.toFixed(3)}, 2.0 ) );
        float lod = max( 0.0, log2( 0.07 / spriteTexelMeters ) );
        vec2 sole = vec2( spriteContent.x * 0.5 + local.x / spriteTexelWidth, spriteSoleRow - ${CONTACT.sole.toFixed(3)} / spriteTexelMeters );
        return depth * clamp( spriteAlpha( sole, lod ) * 1.5, 0.0, 1.0 );
      }

      void main() {
        bool inside = vWorldGround.x >= shadowClip.x && vWorldGround.x <= shadowClip.y && vWorldGround.y >= shadowClip.z && vWorldGround.y <= shadowClip.w;
        float shadow = inside ? max( body( vGround ), soles() ) * getShadowMask() : 0.0;
        vec3 factor = mix( vec3( 1.0 ), shadowTint, shadow ) * ( 1.0 - ${CONTACT.strength.toFixed(2)} * contact() );
        gl_FragColor = vec4( factor, 1.0 );
        #include <colorspace_fragment>
      }
    `,
  });
  const tint = floorShadowFactor();
  Object.assign(material.uniforms, uniforms, {
    shadowAlong: { value: new Vector2(axes.along.x, axes.along.z) },
    shadowAcross: { value: new Vector2(axes.across.x, axes.across.z) },
    shadowReach: { value: axes.length * SHADOW_REACH },
    shadowRun: { value: new Vector2(axes.along.x * axes.length * SHADOW_REACH, axes.along.z * axes.length * SHADOW_REACH) },
    spriteTexelMeters: { value: quad.texelMeters },
    spriteTexelWidth: { value: quad.texelWidth },
    spriteSoleRow: { value: atlas.soleRow },
    spriteHeight: { value: atlas.visibleRows * quad.texelMeters },
    shadowTint: { value: new Vector3(tint[0], tint[1], tint[2]) },
    shadowClip: { value: new Vector4(clip.minX, clip.maxX, clip.minZ, clip.maxZ) },
    groundRight: { value: new Vector2(ground.right.x, ground.right.z) },
    groundToCamera: { value: new Vector2(ground.toCamera.x, ground.toCamera.z) },
  });
  return material;
}
