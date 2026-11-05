import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Matrix4, Quaternion, Vector3, type InstancedMesh, type Material } from "three";
import { OFFICE_SEATS } from "./officeLayout";
import { chairAtHome, type ChairPose } from "./officeHumans";
import { humanChairGeometry } from "./officeRooms";
import { humanActors } from "./officeStore";

const SEATS = OFFICE_SEATS.filter((seat) => seat.roomId === "hall");
const UP = new Vector3(0, 1, 0);
const UNIT = new Vector3(1, 1, 1);
const matrix = new Matrix4();
const rotation = new Quaternion();
const place = new Vector3();

/** As cadeiras da bancada, numa chamada de desenho só. Paradas, não custam nada por quadro. */
export function HumanChairs({ material }: { material: Material }) {
  const geometry = useMemo(() => humanChairGeometry(), []);
  const mesh = useRef<InstancedMesh | null>(null);
  const last = useRef<(ChairPose | null)[]>(SEATS.map(() => null));

  useEffect(() => () => geometry.dispose(), [geometry]);

  const put = (index: number, pose: ChairPose) => {
    const known = last.current[index];
    if (known && known.x === pose.x && known.z === pose.z && known.yaw === pose.yaw) return false;
    last.current[index] = pose;
    matrix.compose(place.set(pose.x, 0, pose.z), rotation.setFromAxisAngle(UP, pose.yaw), UNIT);
    mesh.current!.setMatrixAt(index, matrix);
    return true;
  };

  useLayoutEffect(() => {
    SEATS.forEach((seat, index) => put(index, chairAtHome(seat)));
    mesh.current!.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(() => {
    if (!mesh.current) return;
    let changed = false;
    SEATS.forEach((seat, index) => {
      let pose = chairAtHome(seat);
      for (const actor of humanActors.values()) {
        if (actor.seatId === seat.id && actor.chair) pose = actor.chair;
      }
      if (put(index, pose)) changed = true;
    });
    if (changed) mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} name="cadeiras-do-hall" args={[geometry, material, SEATS.length]} castShadow receiveShadow frustumCulled={false} raycast={() => null} />;
}
