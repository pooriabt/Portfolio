import * as THREE from "three";
import { projectObjectToScreenUv } from "../components/portalMath";
import { calculateTextBounds } from "./textGeometryHelpers";

type SpiralMaterial = {
  material?: {
    uniforms?: {
      uTime?: { value: number };
      uCenter0?: { value: THREE.Vector2 };
      uCenter1?: { value: THREE.Vector2 };
      uResolution?: { value: THREE.Vector2 };
      uSpeed?: { value: number };
      uBands?: { value: number };
    };
  };
};

type Portal = ReturnType<
  typeof import("../components/createPortalEllipse").createPortalEllipse
>;
type Spiral = ReturnType<
  typeof import("../components/SpiralBackground").createSpiralBackground
>;

/**
 * Updates spiral center uniforms from portal centers
 */
export function updateSpiralCenters(
  spiral: Spiral | null,
  leftPortal: Portal,
  rightPortal: Portal
): void {
  if (spiral?.material?.uniforms) {
    const spiralUniforms = spiral.material.uniforms;
    const leftCenter = leftPortal.uniforms.uCenter.value as THREE.Vector2;
    const rightCenter = rightPortal.uniforms.uCenter.value as THREE.Vector2;
    const spiralCenter0 = spiralUniforms.uCenter0?.value as
      | THREE.Vector2
      | undefined;
    const spiralCenter1 = spiralUniforms.uCenter1?.value as
      | THREE.Vector2
      | undefined;
    if (spiralCenter0 && leftCenter) {
      spiralCenter0.copy(leftCenter);
    }
    if (spiralCenter1 && rightCenter) {
      spiralCenter1.copy(rightCenter);
    }
  }
}

/**
 * Syncs spiral background uniforms to text materials
 */
function syncSpiralUniforms(
  textMeshes: THREE.Mesh[],
  spiral: SpiralMaterial | null,
  elapsed: number,
  includeSpeedAndBands = false
) {
  textMeshes.forEach((textMesh) => {
    if (textMesh.material instanceof THREE.ShaderMaterial) {
      const uniforms = textMesh.material.uniforms;
      if (uniforms.uTime) uniforms.uTime.value = elapsed;
      if (spiral?.material?.uniforms) {
        const spiralUniforms = spiral.material.uniforms;
        if (uniforms.uCenter0 && spiralUniforms.uCenter0) {
          (uniforms.uCenter0.value as THREE.Vector2).copy(
            spiralUniforms.uCenter0.value as THREE.Vector2
          );
        }
        if (uniforms.uCenter1 && spiralUniforms.uCenter1) {
          (uniforms.uCenter1.value as THREE.Vector2).copy(
            spiralUniforms.uCenter1.value as THREE.Vector2
          );
        }
        if (uniforms.uResolution && spiralUniforms.uResolution) {
          (uniforms.uResolution.value as THREE.Vector2).copy(
            spiralUniforms.uResolution.value as THREE.Vector2
          );
        }
        if (includeSpeedAndBands) {
          if (uniforms.uSpeed && spiralUniforms.uSpeed) {
            uniforms.uSpeed.value = spiralUniforms.uSpeed.value;
          }
          if (uniforms.uBands && spiralUniforms.uBands) {
            uniforms.uBands.value = spiralUniforms.uBands.value;
          }
        }
      }
    }
  });
}

export type AnimationLoopParams = {
  clock: THREE.Clock;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  leftPortalGroup: THREE.Group;
  rightPortalGroup: THREE.Group;
  leftPortal: Portal;
  rightPortal: Portal;
  tmpVec3: THREE.Vector3;
  spiral: Spiral | null;
  columnTexts: THREE.Mesh[];
  wavyTexts: THREE.Mesh[];
};

export function createAnimationLoop(params: AnimationLoopParams): () => void {
  const {
    clock,
    scene,
    camera,
    renderer,
    leftPortalGroup,
    rightPortalGroup,
    leftPortal,
    rightPortal,
    tmpVec3,
    spiral,
    columnTexts,
    wavyTexts,
  } = params;

  function animate() {
    const elapsed = clock.getElapsedTime();

    projectObjectToScreenUv(
      leftPortalGroup,
      camera,
      leftPortal.uniforms.uCenter.value as THREE.Vector2,
      tmpVec3
    );
    projectObjectToScreenUv(
      rightPortalGroup,
      camera,
      rightPortal.uniforms.uCenter.value as THREE.Vector2,
      tmpVec3
    );

    updateSpiralCenters(spiral, leftPortal, rightPortal);

    leftPortal.uniforms.uTime.value = elapsed;
    rightPortal.uniforms.uTime.value = elapsed * 1.05;
    if (spiral) spiral.update(elapsed);

    if (spiral && columnTexts.length >= 2) {
      const leftTextMesh = columnTexts[0];
      const rightTextMesh = columnTexts[1];
      const leftTextPos = new THREE.Vector2();
      const rightTextPos = new THREE.Vector2();
      const leftTextSize = new THREE.Vector2();
      const rightTextSize = new THREE.Vector2();

      if (
        leftTextMesh.userData.targetX !== undefined &&
        leftTextMesh.scale.x > 0 &&
        leftTextMesh.geometry
      ) {
        const leftBounds = calculateTextBounds(leftTextMesh, camera);

        if (leftBounds.size.x > 0 && leftBounds.size.y > 0) {
          // Calculate right edge position (uSideTextLeftPos is the RIGHT EDGE)
          const rightEdgeX = leftBounds.center.x + leftBounds.size.x * 0.5;
          
          leftTextPos.set(rightEdgeX, leftBounds.center.y);
          leftTextSize.copy(leftBounds.size);
        } else {
          leftTextPos.set(-1.0, 0.5);
          leftTextSize.set(0.0, 0.0);
        }
      } else {
        leftTextPos.set(-1.0, 0.5);
        leftTextSize.set(0.0, 0.0);
      }

      if (
        rightTextMesh.userData.targetX !== undefined &&
        rightTextMesh.scale.x > 0 &&
        rightTextMesh.geometry
      ) {
        const rightBounds = calculateTextBounds(rightTextMesh, camera);

        if (rightBounds.size.x > 0 && rightBounds.size.y > 0) {
          // Calculate left edge position (uSideTextRightPos is the LEFT EDGE)
          const leftEdgeX = rightBounds.center.x - rightBounds.size.x * 0.5;
          
          rightTextPos.set(leftEdgeX, rightBounds.center.y);
          rightTextSize.copy(rightBounds.size);
        } else {
          rightTextPos.set(-1.0, 0.5);
          rightTextSize.set(0.0, 0.0);
        }
      } else {
        rightTextPos.set(-1.0, 0.5);
        rightTextSize.set(0.0, 0.0);
      }

      if (spiral.updateSideTextPositions) {
        spiral.updateSideTextPositions(
          leftTextPos.x >= 0 ? leftTextPos : null,
          rightTextPos.x >= 0 ? rightTextPos : null,
          leftTextSize.x > 0 && leftTextSize.y > 0 ? leftTextSize : null,
          rightTextSize.x > 0 && rightTextSize.y > 0 ? rightTextSize : null
        );
      }

      if (spiral.material?.uniforms) {
        const uniforms = spiral.material.uniforms;
        if (uniforms.uSideTextLeftTopAngle)
          uniforms.uSideTextLeftTopAngle.value;
        if (uniforms.uSideTextLeftBottomAngle)
          uniforms.uSideTextLeftBottomAngle.value;
        if (uniforms.uSideTextRightTopAngle)
          uniforms.uSideTextRightTopAngle.value;
        if (uniforms.uSideTextRightBottomAngle)
          uniforms.uSideTextRightBottomAngle.value;
      }
    }

    syncSpiralUniforms(wavyTexts, spiral, elapsed, false);
    syncSpiralUniforms(columnTexts, spiral, elapsed, true);

    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  return animate;
}
