import * as THREE from "three";

export function setPortalHoleRadius(
  target: THREE.Vector2,
  width: number,
  height: number
) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const holeWidth = Math.max(0.05, Math.min(0.17, 125 / safeWidth));
  const holeHeight = Math.max(0.05, Math.min(0.5, 200 / safeHeight));
  target.set(holeWidth, holeHeight);
}

export function projectObjectToScreenUv(
  obj: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector2,
  scratch: THREE.Vector3
) {
  obj.getWorldPosition(scratch);
  scratch.project(camera);
  target.set(0.5 * (scratch.x + 1.0), 0.5 * (1.0 - scratch.y));
  return target;
}

