import { readFileSync } from "node:fs";
import { Group, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { expect, it } from "vitest";
import { PULSE_BASE_SPEC } from "@/character-studio/model/presets";
import { SeatedFigure } from "@/world/office/seatedFigure";
import { sampleVisit, TALK_START } from "@/world/office/officeVisit";
import { FIGURE_SCALE } from "@/world/office/officeRooms";

it("o pé do GLB permanece ancorado no mundo durante uma curva", async () => {
  const bytes = readFileSync("public/prototipo/pulse.glb");
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const figure = new SeatedFigure(gltf.scene, gltf.animations, PULSE_BASE_SPEC, { handY: 0.66, handZ: 0.34, phase: 0 });
  const actor = new Group();
  actor.scale.setScalar(FIGURE_SCALE);
  actor.add(figure.root);
  let checked = 0;
  try {
    for (let t = 2; t < TALK_START - 2; t += 0.02) {
      const a = sampleVisit(t).visitor, b = sampleVisit(t + 0.01).visitor;
      if (!a.feet?.L.planted || !b.feet?.L.planted || Math.abs(a.yaw - b.yaw) < 0.001) continue;
      if (Math.hypot(a.feet.L.x - b.feet.L.x, a.feet.L.z - b.feet.L.z) > 1e-8) continue;
      const positions: Vector3[] = [];
      for (const pose of [a, b]) {
        actor.position.set(pose.x, 0, pose.z);
        actor.rotation.y = pose.yaw;
        figure.perform(pose.standing, pose.walk, pose.talk, t, false, pose);
        actor.updateMatrixWorld(true);
        positions.push(figure.root.getObjectByName("FootL")!.getWorldPosition(new Vector3()));
      }
      expect(positions[0]!.distanceTo(positions[1]!)).toBeLessThan(1e-5);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  } finally {
    figure.dispose();
  }
});
