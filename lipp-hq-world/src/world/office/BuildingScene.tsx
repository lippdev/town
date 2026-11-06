import { useEffect, useLayoutEffect, useMemo } from "react";
import { BUILDING_HEIGHT, CROWN_STEPS, FACADE_BOUNDS, STORY, viewElevation, visibleLevels } from "./officeBuilding";
import { buildFacade, buildingSignTexture } from "./buildingFacade";
import { OfficeCity } from "./CityScene";
import { useOfficeStore } from "./officeStore";

const CUT_SINK = 0.05;

/** Pavimento apontado no prédio fechado: uma faixa de luz em volta dele. */
function LevelBand({ level }: { level: number }) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  return (
    <mesh position={[(minX + maxX) / 2, (level + 0.5) * STORY, (minZ + maxZ) / 2]} renderOrder={2} name="pavimento-apontado">
      <boxGeometry args={[maxX - minX + 0.6, STORY - 0.1, maxZ - minZ + 0.6]} />
      <meshBasicMaterial color="#ffd9a0" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Facade() {
  const view = useOfficeStore((state) => state.buildingView);
  const hoveredLevel = useOfficeStore((state) => state.hoveredLevel);
  const build = useMemo(buildFacade, []);
  const sign = useMemo(buildingSignTexture, []);
  useEffect(
    () => () => {
      build.body.dispose();
      build.lit.dispose();
      sign.dispose();
    },
    [build, sign],
  );
  const closed = view === "exterior";
  const levels = visibleLevels(view);
  useLayoutEffect(() => {
    // Fechado, vai tudo, com a coroa; no corte, só os pavimentos abaixo do andar em tela.
    build.body.setDrawRange(0, closed ? Infinity : (build.bodyEnds[levels - 1] ?? 0));
    build.lit.setDrawRange(0, closed ? Infinity : (build.litEnds[levels - 1] ?? 0));
  }, [build, closed, levels]);
  if (levels === 0) return null;
  const { minX, maxZ, maxX } = FACADE_BOUNDS;
  return (
    <>
      {/* No corte, o topo da torre fica dentro da laje: no mesmo plano do piso, os dois piscariam. */}
      <group position={[0, closed ? 0 : -CUT_SINK, 0]}>
        <mesh geometry={build.body} name="fachada">
          <meshStandardMaterial vertexColors roughness={0.85} />
        </mesh>
        <mesh geometry={build.lit} name="fachada-acesa">
          <meshBasicMaterial vertexColors />
        </mesh>
      </group>
      {closed && (
        <mesh position={[(minX + maxX) / 2, BUILDING_HEIGHT + 1.85, maxZ - CROWN_STEPS[0]!.inset + 0.2]} name="placa-do-predio">
          <planeGeometry args={[11.4, 1.9]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      )}
      {closed && hoveredLevel !== null && <LevelBand level={hoveredLevel} />}
    </>
  );
}

/**
 * Tudo fora do andar em tela: a cidade e a fachada descem juntas, e o andar fica em y = 0.
 * Nada aqui clica nem projeta sombra; a cidade só recebe a do andar quando está colada nele.
 */
export function BuildingSurroundings() {
  const view = useOfficeStore((state) => state.buildingView);
  const elevation = viewElevation(view);
  return (
    <group position={[0, -elevation, 0]} name="entorno-do-predio">
      <OfficeCity elevated={elevation > STORY} receiveShadow={elevation === 0} />
      <Facade />
    </group>
  );
}
