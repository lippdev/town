import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { LinearMipmapLinearFilter, NearestFilter, SRGBColorSpace, type Group } from "three";
import { advanceWalk, initialWalk, walkPose } from "./filipeWalk";
import { OFFICE_ROOMS_BY_ID } from "./officeLayout";

/** Medidas do atlas, impressas por scripts/characters/pixelize-walk.py. */
const CELL = { width: 58, height: 115 };
const COLUMNS = 4;
const ROWS = 2;
const VISIBLE_ROWS = 107;
const SOLE_ROW = 112;

const STANDING_HEIGHT = 1.8;
/** A arte foi desenhada para a câmera do escritório, elevada 30 graus: ela já vem encurtada. */
const CAMERA_FORESHORTENING = Math.cos(Math.PI / 6);

/** Filipe andando pelo hall da demonstração, em pixel art, com a sola no chão. */
export function FilipeDemoSprite() {
  const texture = useTexture("/characters/filipe/walk.png");
  const group = useRef<Group>(null);
  const walk = useRef(initialWalk());
  const reducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const prepared = useMemo(() => {
    const copy = texture.clone();
    copy.colorSpace = SRGBColorSpace;
    copy.magFilter = NearestFilter;
    // de perto o pixel fica duro; de longe os mipmaps evitam que os blocos pisquem
    copy.minFilter = LinearMipmapLinearFilter;
    copy.generateMipmaps = true;
    copy.needsUpdate = true;
    return copy;
  }, [texture]);
  useEffect(() => () => prepared.dispose(), [prepared]);

  const hall = OFFICE_ROOMS_BY_ID.hall!;
  useFrame((_, delta) => {
    // aba em segundo plano devolve um delta enorme: não vale como caminhada
    if (!reducedMotion.current) walk.current = advanceWalk(walk.current, Math.min(delta, 0.1));
    const pose = walkPose(walk.current);
    group.current?.position.set(hall.center.x + pose.x, 0, hall.center.z + pose.z);
    // a textura é invertida com repeat negativo, e aí o deslocamento parte da borda direita
    const column = pose.mirrored ? pose.frame + 1 : pose.frame;
    prepared.repeat.set((pose.mirrored ? -1 : 1) / COLUMNS, 1 / ROWS);
    prepared.offset.set(column / COLUMNS, pose.row === 0 ? 0.5 : 0);
  });

  const height = (STANDING_HEIGHT * CAMERA_FORESHORTENING * CELL.height) / VISIBLE_ROWS;
  const width = (height * CELL.width) / CELL.height;
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[0.25, 32]} />
        <meshBasicMaterial color="#252525" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <sprite position={[0, 0.045, 0]} center={[0.5, (CELL.height - SOLE_ROW) / CELL.height]} scale={[width, height, 1]}>
        <spriteMaterial map={prepared} alphaTest={0.5} transparent depthWrite toneMapped={false} />
      </sprite>
    </group>
  );
}
