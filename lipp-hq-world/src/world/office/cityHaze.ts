import { Color, type Material } from "three";
import { NIGHT_AIR } from "./dayCycle";

/**
 * A névoa da cidade: a cor do ar é um uniforme só, então a mesma cidade fica azul à noite, alaranjada
 * no entardecer e clara de dia sem refazer malha nenhuma. Antes a mistura vinha cozida na cor de cada
 * vértice e só servia para a noite: ao meio-dia, o fundo da cidade escurecia em vez de clarear.
 * Pinta por pixel: uma via ou um quarteirão compridos vão ficando no ar ao longo do comprimento.
 */
export const CITY_AIR = { value: new Color(NIGHT_AIR) };

/** Abaixo desta força as janelas da cidade nem são desenhadas. */
export const CITY_LIT_MIN = 0.2;

/** Até aqui o ar não aparece: a torre e o entorno ficam nítidos. */
const CLEAR_UNTIL = 42;
const FULL_AT = 190;
/** O máximo de ar sobre o chão; os topos altos saem da névoa, é o que dá a cara de cidade vertical. */
const GROUND_HAZE = 0.86;
const TOP_HAZE = 0.46;
const HAZE_CEILING = 42;

const GLSL_HAZE = `
  float cityFar = smoothstep(${CLEAR_UNTIL.toFixed(1)}, ${FULL_AT.toFixed(1)}, length(vCityPlace.xz));
  float cityLift = clamp(vCityPlace.y / ${HAZE_CEILING.toFixed(1)}, 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, cityAir, cityFar * mix(${GROUND_HAZE.toFixed(2)}, ${TOP_HAZE.toFixed(2)}, cityLift));
`;

/** Liga a névoa num material da cidade. O programa é o mesmo por tipo de material. */
export function withCityHaze<T extends Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cityAir = CITY_AIR;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCityPlace;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCityPlace = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 cityAir;\nvarying vec3 vCityPlace;")
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>\n${GLSL_HAZE}`);
  };
  material.customProgramCacheKey = () => "cidade-nevoa";
  return material;
}
