// Sonda unitária do OrbitControls fora do React.
import * as THREE from "/workspace/town/lipp-hq-world/node_modules/three/build/three.module.js";
import { OrbitControls } from "/workspace/town/lipp-hq-world/node_modules/.pnpm/three-stdlib@2.36.1_three@0.186.1/node_modules/three-stdlib/controls/OrbitControls.js";

const camera = new THREE.PerspectiveCamera(38, 1.28, 0.1, 400);
camera.position.set(28, 33, 33);

const events = {};
const fakeDom = {
  style: {},
  addEventListener: (type, fn) => { events[type] = fn; },
  removeEventListener: () => {},
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
  clientHeight: 800,
  clientWidth: 1280,
  ownerDocument: { addEventListener: (t, f) => { events["doc:" + t] = f; }, removeEventListener: () => {} },
  dispatchEvent: () => true,
};

const controls = new OrbitControls(camera, fakeDom);
controls.mouseButtons = { LEFT: -1, MIDDLE: 1, RIGHT: 2 };
controls.enableDamping = true;
controls.enablePan = false;

const makeEvent = (type, x, y, button, buttons) => ({
  type, button, buttons, clientX: x, clientY: y,
  pointerId: 1, pointerType: "mouse", isPrimary: true,
  preventDefault: () => {}, stopPropagation: () => {},
  target: fakeDom,
});

const before = camera.position.clone();
console.log("azimuth inicial:", controls.getAzimuthalAngle().toFixed(3));
events.pointerdown(makeEvent("pointerdown", 640, 400, 2, 2));
console.log("azimuth depois do down:", controls.getAzimuthalAngle().toFixed(3));
console.log("event types registrados:", Object.keys(events).join(","));
const moveHandler = events["doc:pointermove"];
for (let i = 1; i <= 10; i++) {
  // ownerDocument do fakeDom não registra pointermove; chama direto via dispatcher
  if (moveHandler) moveHandler(makeEvent("pointermove", 640 + i * 20, 400, -1, 2));
}
const after = camera.position.clone();
events.pointerup?.(makeEvent("pointerup", 840, 400, -1, 0));

const az = (v) => Math.atan2(v.x, v.z) * 180 / Math.PI;
console.log("ANTES_AZ :", az(before).toFixed(2));
console.log("DEPOIS_AZ:", az(after).toFixed(2));
console.log("MUDOU:", az(before) !== az(after));
console.log("azimuth final via getAzimuthalAngle:", controls.getAzimuthalAngle().toFixed(3));
