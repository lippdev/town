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
import { floorShadowFactor, screenGroundAxes, shadowAxes } from "./officeSun";
import type { SpriteAtlas, SpriteQuad } from "./spriteAtlas";
import type { SpriteTexels } from "./spriteMipmaps";

/** Empurra a redução um pouco para o nível mais nítido: de longe vale mais o rosto. */
const LOD_BIAS = -0.2;
/** Abre a mistura entre dois níveis só perto da metade: menos tempo com as duas imagens juntas. */
const LOD_BLEND = [0.2, 0.8] as const;
/** Luz que deixa a arte como foi desenhada: a do meio do corpo, de frente, na cena atual. */
const LIGHT_REFERENCE = 0.4;
/** Quanto da variação de luz chega à arte; a luz já está pintada nela. */
const LIGHT_RESPONSE = 0.55;
/** Quanto da cor da luz tinge a arte. */
const LIGHT_TINT = 0.2;
/** Sombra do sol sobre ele: escurece pouco, a roupa já é quase preta. */
const SHADED_SPRITE = 0.82;
/** Penumbra da silhueta no chão, em metros, junto ao pé e na ponta da cabeça. */
const PENUMBRA = { near: 0.02, far: 0.09 };
/** Sombra de contato: raios no chão (metros) e força. */
const CONTACT = { across: 0.2, depth: 0.11, strength: 0.5 };
/** O sol vê o corpo mais de lado do que a câmera: a silhueta fica um pouco mais estreita. */
const SHADOW_WIDTH = 0.9;

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
  };
}

export type SpriteUniforms = ReturnType<typeof spriteUniforms>;

/** Põe o quadro nos uniforms; a arte espelhada lê a célula ao contrário. */
export function selectCell(uniforms: SpriteUniforms, texels: SpriteTexels, column: number, row: number, mirrored: boolean) {
  uniforms.spriteBounds.value.setX(column * texels.pitch.width).setY(row * texels.pitch.height);
  uniforms.spriteMirrored.value = mirrored ? 1 : 0;
}

const SAMPLING = /* glsl */ `
uniform sampler2D spriteAtlas;
uniform vec2 spriteAtlasSize;
uniform vec4 spriteBounds;
uniform vec2 spriteInset;
uniform vec2 spriteContent;
uniform float spriteMirrored;

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
`;

const SPRITE_SAMPLE = /* glsl */ `
vec4 spriteSample( vec2 cellTexel ) {
  vec2 footprint = fwidth( cellTexel );
  vec2 atlasTexel = spriteToAtlas( cellTexel );
  float lod = max( 0.0, log2( max( max( footprint.x, footprint.y ), 1e-4 ) ) + ${LOD_BIAS.toFixed(2)} );
  float base = floor( lod );
  float blend = smoothstep( ${LOD_BLEND[0].toFixed(2)}, ${LOD_BLEND[1].toFixed(2)}, lod - base );
  vec4 color = spriteSharpLevel( atlasTexel, footprint, base );
  if ( blend > 0.0 ) color = mix( color, spriteSharpLevel( atlasTexel, footprint, base + 1.0 ), blend );
  return color;
}
`;

/**
 * A figura usa o material dos móveis, com as mesmas luzes, ambiente, sombra, tone mapping
 * e espaço de cor, e troca só o que ele faz com a luz: a arte já vem com a luz pintada,
 * então a variação chega atenuada. O escritório não tem composer e a saída vai direto
 * para a tela; num alvo intermediário, o próprio Three pula tone mapping e sRGB.
 */
export function createSpriteMaterial(uniforms: SpriteUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true, premultipliedAlpha: true, depthWrite: false });
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
        float spriteLuma = dot( spriteLight, vec3( 0.2126, 0.7152, 0.0722 ) );
        vec3 spriteTint = mix( vec3( 1.0 ), spriteLight / spriteLuma, ${LIGHT_TINT.toFixed(2)} );
        float spriteExposure = pow( spriteLuma / ${LIGHT_REFERENCE.toFixed(2)}, ${LIGHT_RESPONSE.toFixed(2)} );
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
      uniform float shadowLength;
      uniform float shadowWidth;
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

      /* A figura como o sol a vê: largura atravessada, altura ao longo da sombra. */
      float silhouette() {
        float height = dot( vGround, shadowAlong ) / shadowLength;
        vec2 cellTexel = vec2(
          spriteContent.x * 0.5 + dot( vGround, shadowAcross ) / ( spriteTexelWidth * shadowWidth ),
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
        return sum * 0.25;
      }

      /* Mancha escura sob os pés, mais forte onde o quadro atual tem pé no chão. */
      float contact() {
        vec2 local = vec2( dot( vGround, groundRight ), dot( vGround, groundToCamera ) );
        vec2 scaled = local / vec2( ${CONTACT.across.toFixed(3)}, ${CONTACT.depth.toFixed(3)} );
        float blob = exp( -dot( scaled, scaled ) );
        float lod = max( 0.0, log2( 0.05 / spriteTexelMeters ) );
        vec2 foot = vec2( spriteContent.x * 0.5 + local.x / spriteTexelWidth, spriteSoleRow - 0.05 / spriteTexelMeters );
        return blob * ( 0.4 + 0.6 * clamp( spriteAlpha( foot, lod ) * 1.6, 0.0, 1.0 ) );
      }

      void main() {
        bool inside = vWorldGround.x >= shadowClip.x && vWorldGround.x <= shadowClip.y && vWorldGround.y >= shadowClip.z && vWorldGround.y <= shadowClip.w;
        float shadow = inside ? silhouette() * getShadowMask() : 0.0;
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
    shadowLength: { value: axes.length },
    shadowWidth: { value: SHADOW_WIDTH },
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
