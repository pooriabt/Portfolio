import * as THREE from "three";
import { gsap } from "gsap";

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

/**
 * Calculates frustum edges at a given depth
 */
export function getFrustumEdgesAtDepth(
  camera: THREE.PerspectiveCamera,
  depth: number
) {
  const aspect = camera.aspect;
  const fov = camera.fov * (Math.PI / 180);
  const heightAtDepth =
    2 * Math.tan(fov / 2) * Math.abs(camera.position.z - depth);
  const widthAtDepth = heightAtDepth * aspect;
  return {
    left: -widthAtDepth / 2,
    right: widthAtDepth / 2,
    width: widthAtDepth,
    height: heightAtDepth,
  };
}

/**
 * Calculates off-screen positions for side texts
 */
export function getOffScreenPositions(
  camera: THREE.PerspectiveCamera,
  textZ: number,
  offScreenOffset = 15
) {
  const edges = getFrustumEdgesAtDepth(camera, textZ);
  return {
    left: edges.left - offScreenOffset,
    right: edges.right + offScreenOffset,
  };
}

type Portal = ReturnType<
  typeof import("./createPortalEllipse").createPortalEllipse
>;

type TogglePortalOptions = {
  navigateTo?: string;
  portalGroup?: THREE.Group | null;
  spiral?: ReturnType<
    typeof import("./SpiralBackground").createSpiralBackground
  > | null;
  side?: "left" | "right";
};

/**
 * Checks if a portal contains the given intersected object
 */
export function portalFromIntersected(
  obj: THREE.Object3D | null,
  leftPortal: Portal,
  rightPortal: Portal
): "left" | "right" | null {
  while (obj) {
    if (obj === leftPortal.mesh) return "left";
    if (obj === rightPortal.mesh) return "right";
    obj = obj.parent;
  }
  return null;
}

/**
 * Checks if pointer is inside portal bounds
 */
export function pointerInsidePortal(
  portal: Portal,
  pointerNdc: THREE.Vector2
): boolean {
  const pointerScreenUv = new THREE.Vector2(
    pointerNdc.x * 0.5 + 0.5,
    0.5 * (1.0 - pointerNdc.y)
  );
  const center = portal.uniforms.uCenter.value as THREE.Vector2;
  const hole = portal.uniforms.uHoleRadius.value as THREE.Vector2;

  if (!center || !hole) return false;

  const dx = (pointerScreenUv.x - center.x) / hole.x;
  const dy = (pointerScreenUv.y - center.y) / hole.y;
  return dx * dx + dy * dy <= 1.0;
}

/**
 * Calculates pointer position from event
 */
export function getPointerFromEvent(
  event: PointerEvent,
  renderer: THREE.WebGLRenderer
): THREE.Vector2 {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  return pointer;
}

/**
 * Toggles portal open/closed state
 */
export function togglePortal(
  portal: Portal,
  isOpen: boolean,
  setOpen: (v: boolean) => void,
  setAnimating: (v: boolean) => void,
  animFlag: boolean,
  options?: TogglePortalOptions
) {
  if (animFlag) return;
  setAnimating(true);

  const targetGroup =
    options?.portalGroup ??
    (portal.mesh.parent instanceof THREE.Group
      ? (portal.mesh.parent as THREE.Group)
      : null);
  const scaleTarget = targetGroup ? targetGroup.scale : portal.mesh.scale;
  const enlargedScale = scaleTarget.clone().multiplyScalar(10);
  const timeMultiplierUniform = portal.uniforms.uTimeMultiplier;
  const clickScaleUniform = portal.uniforms.uClickScale;
  const spiralUniforms = options?.spiral?.material
    ?.uniforms as Record<string, { value: number }> | undefined;
  const spiralClickScale =
    spiralUniforms && options?.side === "left"
      ? spiralUniforms.uClickScale0
      : spiralUniforms && options?.side === "right"
      ? spiralUniforms.uClickScale1
      : null;

  const timeline = gsap.timeline({
    onComplete: () => {
      if (timeMultiplierUniform) {
        timeMultiplierUniform.value = 1;
      }
      if (clickScaleUniform) {
        clickScaleUniform.value = 1;
      }
      if (spiralClickScale) {
        spiralClickScale.value = 1;
      }
      setOpen(!isOpen);
      setAnimating(false);
      if (options?.navigateTo) {
        window.location.assign(options.navigateTo);
      }
    },
  });

  timeline.add(() => {
    if (timeMultiplierUniform) {
      timeMultiplierUniform.value = 2;
    }
  }, 0);

  timeline.to({}, { duration: 1 });

  timeline.add(() => {
    if (timeMultiplierUniform) {
      timeMultiplierUniform.value = 1;
    }
  });

  timeline.to(
    scaleTarget,
    {
      x: enlargedScale.x,
      y: enlargedScale.y,
      z: enlargedScale.z,
      duration: 0.8,
      ease: "power2.in",
    },
    "-=0.2"
  );

  if (clickScaleUniform) {
    timeline.to(
      clickScaleUniform,
      {
        value: 10,
        duration: 0.8,
        ease: "power2.in",
      },
      "<"
    );
  }

  if (spiralClickScale) {
    timeline.to(
      spiralClickScale,
      {
        value: 10,
        duration: 0.8,
        ease: "power2.in",
      },
      "<"
    );
  }
}

