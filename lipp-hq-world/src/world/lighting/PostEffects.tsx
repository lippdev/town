import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * Pós-processamento da cena, na ordem em que a luz real se comporta:
 *
 * - N8AO escurece cantos, rodapés e o contato de móveis e pessoas com o chão.
 *   É o que tira o aspecto de maquete de papel; roda em meia resolução.
 * - Bloom só nos pontos acima de 1.0 (luminárias, telas, letreiros), que são
 *   os materiais com `toneMapped={false}` — o resto da cena não brilha.
 * - Tone mapping neutro no fim: o composer renderiza em ponto flutuante, então
 *   o tone mapping do renderer não se aplica e precisa vir como efeito.
 * - Vinheta leve, para o olho cair no centro do prédio.
 */
export function PostEffects() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes quality="performance" aoRadius={1.4} distanceFalloff={0.8} intensity={2.4} color="#1a1410" />
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.45} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  );
}
