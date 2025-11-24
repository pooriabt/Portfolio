import * as THREE from "three";
import * as React from "react";
import { gsap } from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { getOffScreenPositions } from "../components/portalMath";

type Portal = ReturnType<
  typeof import("../components/createPortalEllipse").createPortalEllipse
>;
type Spiral = ReturnType<
  typeof import("../components/SpiralBackground").createSpiralBackground
>;

export type ScrollAnimationParams = {
  mount: HTMLElement;
  textGroupRef: React.MutableRefObject<THREE.Group | null>;
  english: THREE.Mesh | null;
  farsi: THREE.Mesh | null;
  textControls: any;
  farsiTextControls: any;
  leftPortalGroup: THREE.Group;
  rightPortalGroup: THREE.Group;
  spiral: Spiral | null;
  spiralHoleRadiusRef: {
    inner: THREE.Vector2 | null;
    outer: THREE.Vector2 | null;
  };
  portalGroupScale: number;
  columnTexts: THREE.Mesh[];
  camera: THREE.PerspectiveCamera;
};

export function createScrollTrigger(
  params: ScrollAnimationParams
): ScrollTrigger {
  const {
    mount,
    textGroupRef,
    english,
    farsi,
    textControls,
    farsiTextControls,
    leftPortalGroup,
    rightPortalGroup,
    spiral,
    spiralHoleRadiusRef,
    portalGroupScale,
    columnTexts,
    camera,
  } = params;

  const resetScrollTriggerState = () => {
    if (english) {
      english.scale.setScalar(1);
      english.rotation.set(0, 0, 0);
      english.position.set(
        textControls.posX,
        textControls.posY,
        textControls.posZ
      );
    }
    if (farsi) {
      farsi.scale.setScalar(1);
      farsi.rotation.set(0, 0, 0);
    }
    if (textGroupRef.current) {
      textGroupRef.current.scale.setScalar(1);
    }
    leftPortalGroup.scale.setScalar(0);
    rightPortalGroup.scale.setScalar(0);
    if (spiral?.material?.uniforms) {
      const spiralHole = spiral.material.uniforms.uHoleRadius
        ?.value as THREE.Vector2;
      const spiralOuter = spiral.material.uniforms.uHoleRadiusOuter
        ?.value as THREE.Vector2;
      if (spiralHole && spiralOuter) {
        spiralHole.set(0, 0);
        spiralOuter.set(0, 0);
      }
      if ((spiral.material.uniforms as any).uScrollFade) {
        (spiral.material.uniforms as any).uScrollFade.value = 1.0;
      }
    }
    if (columnTexts.length >= 2) {
      const leftTextMesh = columnTexts[0];
      const rightTextMesh = columnTexts[1];

      const textZ =
        leftTextMesh.userData.targetZ || leftTextMesh.position.z || 0;
      const offScreenPos = getOffScreenPositions(camera, textZ);

      if (leftTextMesh.userData.targetX !== undefined) {
        leftTextMesh.position.x = offScreenPos.left;
        leftTextMesh.position.y = leftTextMesh.userData.targetY || 0;
        leftTextMesh.position.z = leftTextMesh.userData.targetZ || 0;
      }
      if (rightTextMesh.userData.targetX !== undefined) {
        rightTextMesh.position.x = offScreenPos.right;
        rightTextMesh.position.y = rightTextMesh.userData.targetY || 0;
        rightTextMesh.position.z = rightTextMesh.userData.targetZ || 0;
      }
      leftTextMesh.scale.setScalar(0);
      rightTextMesh.scale.setScalar(0);
    }
  };

  return ScrollTrigger.create({
    trigger: mount,
    start: "top top",
    end: () =>
      `+=${Math.max(mount.clientHeight, window.innerHeight || 1000) * 6}`,
    scrub: true,
    pin: true,
    pinSpacing: true,
    onEnter: resetScrollTriggerState,
    onLeaveBack: resetScrollTriggerState,
    onUpdate: (self) => {
      const progress = Math.max(0, Math.min(1, self.progress));

      if (progress === 0 || progress < 0.001) {
        resetScrollTriggerState();
        return;
      }

      if (spiral?.material?.uniforms) {
        const su = spiral.material.uniforms as any;
        if (su.uScrollFade) {
          const startFade = 0.0;
          const endFade = 0.1;
          const k = Math.max(
            0,
            Math.min(
              1,
              (progress - startFade) / Math.max(endFade - startFade, 1e-6)
            )
          );
          const eased = k * k * (3.0 - 2.0 * k);
          su.uScrollFade.value = 1.0 - eased;
        }
      }

      const scaleUpPhase = progress < 0.2 ? Math.min(progress / 0.2, 1) : 1;
      const textScale = 1 + scaleUpPhase * 0.2;

      const phase2Progress =
        progress >= 0.2 ? Math.max(0, (progress - 0.2) / 0.8) : 0;
      const rotProgress = Math.min(phase2Progress * 4, 1);
      const rotation = progress >= 0.2 ? (-Math.PI * rotProgress) / 4 : 0;

      const scaleProgress =
        progress >= 0.2 ? Math.max(phase2Progress - 0.25, 0) / 0.75 : 0;
      const groupScale = Math.max(0, 1 - scaleProgress);

      const individualTextScale = progress < 0.2 ? textScale : 1.2;

      if (english) {
        english.scale.setScalar(individualTextScale);

        if (progress >= 0.2) {
          english.rotation.x = rotation;
          const originalPosY = textControls.posY;
          const originalPosZ = textControls.posZ;
          english.position.y = originalPosY + 0.05 * rotProgress;
          english.position.z = originalPosZ + 0.5 * rotProgress;
        } else {
          english.rotation.x = 0;
          english.position.set(
            textControls.posX,
            textControls.posY,
            textControls.posZ
          );
        }
      }

      if (farsi) {
        farsi.scale.setScalar(individualTextScale);

        if (progress >= 0.2) {
          farsi.rotation.x = rotation;
        } else {
          farsi.rotation.x = 0;
        }
      }

      if (progress >= 0.2) {
        textGroupRef.current?.scale.setScalar(groupScale);
      } else {
        textGroupRef.current?.scale.setScalar(1);
      }

      const sideTextStartProgress = 0.4;
      const sideTextProgressRaw =
        progress >= sideTextStartProgress
          ? (progress - sideTextStartProgress) / (1.0 - sideTextStartProgress)
          : 0;
      const sideTextDurationStretch = 0.7;
      const sideTextProgress = Math.pow(
        Math.min(sideTextProgressRaw, 1.0),
        sideTextDurationStretch
      );

      if (columnTexts.length >= 2 && sideTextProgress > 0) {
        const leftTextMesh = columnTexts[0];
        const rightTextMesh = columnTexts[1];

        const shouldAnimateLeft = leftTextMesh.userData.targetX !== undefined;
        const shouldAnimateRight = rightTextMesh.userData.targetX !== undefined;

        if (shouldAnimateLeft || shouldAnimateRight) {
          const easedProgress =
            sideTextProgress *
            sideTextProgress *
            (3.0 - 2.0 * sideTextProgress);

          if (leftTextMesh.userData.targetX === undefined) {
            leftTextMesh.userData.targetX = leftTextMesh.position.x;
            leftTextMesh.userData.targetY = leftTextMesh.position.y;
            leftTextMesh.userData.targetZ = leftTextMesh.position.z;
          }
          if (rightTextMesh.userData.targetX === undefined) {
            rightTextMesh.userData.targetX = rightTextMesh.position.x;
            rightTextMesh.userData.targetY = rightTextMesh.position.y;
            rightTextMesh.userData.targetZ = rightTextMesh.position.z;
          }

          const textZ =
            leftTextMesh.userData.targetZ || leftTextMesh.position.z;
          const offScreenOffset = 15;
          const offScreenPos = getOffScreenPositions(
            camera,
            textZ,
            offScreenOffset
          );

          const leftStartX = offScreenPos.left;
          const rightStartX = offScreenPos.right;

          if (shouldAnimateLeft) {
            leftTextMesh.position.x =
              leftStartX +
              (leftTextMesh.userData.targetX - leftStartX) * easedProgress;
            leftTextMesh.position.y = leftTextMesh.userData.targetY;
            leftTextMesh.position.z = leftTextMesh.userData.targetZ;
            if (leftTextMesh.userData.finalScale !== undefined) {
              leftTextMesh.scale.setScalar(
                leftTextMesh.userData.finalScale * easedProgress
              );
            }
          }

          if (shouldAnimateRight) {
            rightTextMesh.position.x =
              rightStartX +
              (rightTextMesh.userData.targetX - rightStartX) * easedProgress;
            rightTextMesh.position.y = rightTextMesh.userData.targetY;
            rightTextMesh.position.z = rightTextMesh.userData.targetZ;
            if (rightTextMesh.userData.finalScale !== undefined) {
              rightTextMesh.scale.setScalar(
                rightTextMesh.userData.finalScale * easedProgress
              );
            }
          }
        }
      } else if (columnTexts.length >= 2 && scaleProgress === 0) {
        const leftTextMesh = columnTexts[0];
        const rightTextMesh = columnTexts[1];

        if (
          leftTextMesh.userData.targetX === undefined &&
          leftTextMesh.userData.finalScale !== undefined
        ) {
          leftTextMesh.userData.targetX = leftTextMesh.position.x;
          leftTextMesh.userData.targetY = leftTextMesh.position.y;
          leftTextMesh.userData.targetZ = leftTextMesh.position.z;
        }
        if (
          rightTextMesh.userData.targetX === undefined &&
          rightTextMesh.userData.finalScale !== undefined
        ) {
          rightTextMesh.userData.targetX = rightTextMesh.position.x;
          rightTextMesh.userData.targetY = rightTextMesh.position.y;
          rightTextMesh.userData.targetZ = rightTextMesh.position.z;
        }

        const textZ =
          leftTextMesh.userData.targetZ || leftTextMesh.position.z || 0;
        const offScreenPos = getOffScreenPositions(camera, textZ);

        if (leftTextMesh && leftTextMesh.userData.targetX !== undefined) {
          leftTextMesh.position.x = offScreenPos.left;
          leftTextMesh.position.y = leftTextMesh.userData.targetY || 0;
          leftTextMesh.position.z = leftTextMesh.userData.targetZ || 0;
          leftTextMesh.scale.setScalar(0);
        }
        if (rightTextMesh && rightTextMesh.userData.targetX !== undefined) {
          rightTextMesh.position.x = offScreenPos.right;
          rightTextMesh.position.y = rightTextMesh.userData.targetY || 0;
          rightTextMesh.position.z = rightTextMesh.userData.targetZ || 0;
          rightTextMesh.scale.setScalar(0);
        }
      }

      if (scaleProgress > 0) {
        const portalAndHoleScaleProgress = scaleProgress;
        const portalScale = portalGroupScale * portalAndHoleScaleProgress;
        leftPortalGroup.scale.setScalar(portalScale);
        rightPortalGroup.scale.setScalar(portalScale);

        if (
          spiral?.material?.uniforms &&
          spiralHoleRadiusRef.inner &&
          spiralHoleRadiusRef.outer
        ) {
          const spiralHole = spiral.material.uniforms.uHoleRadius
            ?.value as THREE.Vector2;
          const spiralOuter = spiral.material.uniforms.uHoleRadiusOuter
            ?.value as THREE.Vector2;
          if (spiralHole && spiralOuter) {
            spiralHole.set(
              spiralHoleRadiusRef.inner.x * portalAndHoleScaleProgress,
              spiralHoleRadiusRef.inner.y * portalAndHoleScaleProgress
            );
            spiralOuter.set(
              spiralHoleRadiusRef.outer.x * portalAndHoleScaleProgress,
              spiralHoleRadiusRef.outer.y * portalAndHoleScaleProgress
            );
          }
        }
      } else {
        leftPortalGroup.scale.setScalar(0);
        rightPortalGroup.scale.setScalar(0);
        if (spiral?.material?.uniforms) {
          const spiralHole = spiral.material.uniforms.uHoleRadius
            ?.value as THREE.Vector2;
          const spiralOuter = spiral.material.uniforms.uHoleRadiusOuter
            ?.value as THREE.Vector2;
          if (spiralHole && spiralOuter) {
            spiralHole.set(0, 0);
            spiralOuter.set(0, 0);
          }
        }
      }
    },
  });
}
