import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Matrix4, Quaternion, Vector3, type InstancedMesh, type Material } from "three";
import { OFFICE_SEATS, type OfficeSeat } from "./officeLayout";
import { chairAtHome, type ChairPose } from "./officeHumans";
import { humanChairGeometry } from "./officeRooms";
import { humanActors, sceneryActors } from "./officeStore";

const HALL_SEATS = OFFICE_SEATS.filter((seat) => seat.roomId === "hall");
const UP = new Vector3(0, 1, 0);
const UNIT = new Vector3(1, 1, 1);
const matrix = new Matrix4();
const rotation = new Quaternion();
const place = new Vector3();

/** As cadeiras da bancada, numa chamada de desenho só. Paradas, não custam nada por quadro. */
export function HumanChairs({ material, seats = HALL_SEATS }: { material: Material; seats?: readonly OfficeSeat[] }) {
  const geometry = useMemo(() => humanChairGeometry(), []);
  const mesh = useRef<InstancedMesh | null>(null);
  const last = useRef<(ChairPose | null)[]>(seats.map(() => null));

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
    seats.forEach((seat, index) => put(index, chairAtHome(seat)));
    mesh.current!.instanceMatrix.needsUpdate = true;
    // Cada andar monta o próprio conjunto: a lista não muda depois disso.
  }, []);

  useFrame(() => {
    if (!mesh.current) return;
    let changed = false;
    seats.forEach((seat, index) => {
      let pose = chairAtHome(seat);
      for (const actors of [humanActors, sceneryActors]) {
        for (const actor of actors.values()) {
          if (actor.seatId === seat.id && actor.chair) pose = actor.chair;
        }
      }
      if (put(index, pose)) changed = true;
    });
    if (changed) mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} name="cadeiras-do-hall" args={[geometry, material, seats.length]} castShadow receiveShadow frustumCulled={false} raycast={() => null} />;
}
