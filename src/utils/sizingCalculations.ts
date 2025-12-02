import * as THREE from "three";
import { MutableRefObject } from "react";
import { setPortalHoleRadius } from "../components/portalMath";
import { projectObjectToScreenUv } from "../components/portalMath";
import {
  wrapTextToFitWidth,
  createJustifiedTextGeometry,
} from "./textWrapping";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { updateSpiralCenters } from "./animationLoop";

/**
 * Layout constants for door scene
 */
export const MIDDLE_COLUMN_EXTRA = 30;
export const MOBILE_GAP_RATIO = 0.08;
export const MOBILE_HEIGHT_RATIO = 0.45;

/**
 * Gets viewport dimensions from window, mount element, or renderer
 */
function getViewportDimensions(
  mount: HTMLElement | null,
  renderer?: { domElement: HTMLElement } | null
): { width: number; height: number } {
  return {
    width: Math.max(
      1,
      window.innerWidth ||
        mount?.clientWidth ||
        renderer?.domElement.clientWidth ||
        0
    ),
    height: Math.max(
      1,
      window.innerHeight ||
        mount?.clientHeight ||
        renderer?.domElement.clientHeight ||
        0
    ),
  };
}

type Portal = ReturnType<
  typeof import("../components/createPortalEllipse").createPortalEllipse
>;
type Spiral = ReturnType<
  typeof import("../components/SpiralBackground").createSpiralBackground
>;

export type UpdateSizingParams = {
  mount: HTMLElement | null;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  leftPortal: Portal;
  rightPortal: Portal;
  leftPortalGroup: THREE.Group;
  rightPortalGroup: THREE.Group;
  tmpBaseHole: THREE.Vector2;
  tmpInnerHole: THREE.Vector2;
  tmpRingHole: THREE.Vector2;
  portalInnerScale: THREE.Vector2;
  portalRingScale: THREE.Vector2;
  portalBrushOuterScalar: number;
  portalGroupScale: number;
  computeBrushWidth: (
    innerHole: THREE.Vector2,
    ringHole: THREE.Vector2
  ) => number;
  squareBaselineRef: MutableRefObject<{
    portalWidthCss: number;
    columnWidthCss: number;
    portalHeightCss: number;
  } | null>;
  textScaleBaselineRef: MutableRefObject<{
    portalWidthWorld: number;
    portalHeightWorld: number;
  } | null>;
  lastViewportRef: MutableRefObject<{ width: number; height: number } | null>;
  layoutCategoryRef: MutableRefObject<
    "mobile" | "portrait" | "landscape" | null
  >;
  spiralHoleRadiusRef: {
    inner: THREE.Vector2 | null;
    outer: THREE.Vector2 | null;
  };
  wavyTexts: THREE.Mesh[];
  columnTexts: THREE.Mesh[];
  columnTextFont: any;
  baseTextSize: number;
  baseTextPositions: Array<{ x: number; y: number; z: number }>;
  leftColumnText: string;
  rightColumnText: string;
  textGroupRef: MutableRefObject<THREE.Group | null>;
  spiral: Spiral | null;
  tmpVec3: THREE.Vector3;
};

export function updateSizing(params: UpdateSizingParams) {
  const {
    mount,
    renderer,
    camera,
    leftPortal,
    rightPortal,
    leftPortalGroup,
    rightPortalGroup,
    tmpBaseHole,
    tmpInnerHole,
    tmpRingHole,
    portalInnerScale,
    portalRingScale,
    portalBrushOuterScalar,
    portalGroupScale,
    computeBrushWidth,
    squareBaselineRef,
    textScaleBaselineRef,
    lastViewportRef,
    layoutCategoryRef,
    spiralHoleRadiusRef,
    wavyTexts,
    columnTexts,
    columnTextFont,
    baseTextSize,
    baseTextPositions,
    leftColumnText,
    rightColumnText,
    textGroupRef,
    spiral,
    tmpVec3,
  } = params;

  if (!mount) return;
  const viewportDims = getViewportDimensions(mount, renderer);
  const newWidth = viewportDims.width;
  const newHeight = viewportDims.height;
  renderer.setSize(newWidth, newHeight);
  camera.aspect = newWidth / newHeight;
  camera.updateProjectionMatrix();

  const w = renderer.domElement.width;
  const h = renderer.domElement.height;

  if (leftPortal.uniforms.uResolution) {
    leftPortal.uniforms.uResolution.value.set(w, h);
    setPortalHoleRadius(
      leftPortal.uniforms.uHoleRadius.value as THREE.Vector2,
      w,
      h
    );
  }
  if (rightPortal.uniforms.uResolution) {
    rightPortal.uniforms.uResolution.value.set(w, h);
    rightPortal.uniforms.uHoleRadius.value.copy(
      leftPortal.uniforms.uHoleRadius.value as THREE.Vector2
    );
  }

  tmpBaseHole.copy(leftPortal.uniforms.uHoleRadius.value as THREE.Vector2);
  tmpInnerHole
    .copy(tmpBaseHole)
    .multiply(portalInnerScale)
    .multiplyScalar(portalGroupScale);
  tmpRingHole.copy(tmpInnerHole).multiply(portalRingScale);

  const distance = Math.abs(camera.position.z - leftPortalGroup.position.z);
  const vFov = (camera.fov * Math.PI) / 180;
  const frustumHeight = 2 * distance * Math.tan(vFov / 2);
  const frustumWidth = frustumHeight * camera.aspect;

  const viewportWidthCss = viewportDims.width;
  const viewportHeightCss = viewportDims.height;

  const lastViewport = lastViewportRef.current;
  const viewportChanged =
    !lastViewport ||
    lastViewport.width !== viewportWidthCss ||
    lastViewport.height !== viewportHeightCss;
  if (viewportChanged) {
    squareBaselineRef.current = null;
    textScaleBaselineRef.current = null;
    lastViewportRef.current = {
      width: viewportWidthCss,
      height: viewportHeightCss,
    };
  }

  const aspectRatio = viewportWidthCss / viewportHeightCss;
  const isMobileViewport = viewportWidthCss <= 600;
  const layoutCategory = isMobileViewport
    ? "mobile"
    : aspectRatio <= 1
    ? "portrait"
    : "landscape";

  if (layoutCategoryRef.current !== layoutCategory) {
    squareBaselineRef.current = null;
    textScaleBaselineRef.current = null;
    layoutCategoryRef.current = layoutCategory;
  }

  const screenWidth = viewportWidthCss;
  const screenHeight = viewportHeightCss;

  let middleColumnExtraCss = isMobileViewport
    ? viewportWidthCss * MOBILE_GAP_RATIO
    : MIDDLE_COLUMN_EXTRA;
  let portalWidthCss: number;
  let columnWidthCss: number;
  let portalHeightCss: number;

  if (isMobileViewport) {
    const baseBlockWidth = viewportWidthCss;
    portalWidthCss = baseBlockWidth / 3;
    columnWidthCss = baseBlockWidth / 9;
    portalHeightCss = Math.min(
      viewportHeightCss * MOBILE_HEIGHT_RATIO,
      screenHeight / 2
    );
  } else if (aspectRatio <= 1) {
    const minViewportWidth = 600;
    const maxViewportWidth = 1920;
    const minPortalWidth = minViewportWidth / 3;
    const maxPortalWidth = maxViewportWidth / 2 / 3;

    let interpolatedPortalWidth: number;

    if (viewportWidthCss <= maxViewportWidth) {
      const clampedViewport = Math.max(minViewportWidth, viewportWidthCss);
      const transitionFactor =
        (clampedViewport - minViewportWidth) /
        (maxViewportWidth - minViewportWidth);
      interpolatedPortalWidth =
        minPortalWidth + (maxPortalWidth - minPortalWidth) * transitionFactor;
    } else {
      const baseBlockWidthBeyond = Math.min(viewportWidthCss, screenWidth / 2);
      interpolatedPortalWidth = baseBlockWidthBeyond / 3;
    }

    const baseBlockWidth = interpolatedPortalWidth * 3;
    portalWidthCss = interpolatedPortalWidth;
    columnWidthCss = baseBlockWidth / 9;
    portalHeightCss = Math.min(viewportHeightCss / 2, screenHeight / 2);
  } else {
    const minViewportWidth = 600;
    const maxViewportWidth = 1920;
    const minPortalWidth = minViewportWidth / 3;
    const maxPortalWidth = maxViewportWidth / 2 / 6;

    let interpolatedPortalWidth: number;

    if (viewportWidthCss <= maxViewportWidth) {
      const clampedViewport = Math.max(minViewportWidth, viewportWidthCss);
      const transitionFactor =
        (clampedViewport - minViewportWidth) /
        (maxViewportWidth - minViewportWidth);
      interpolatedPortalWidth =
        minPortalWidth + (maxPortalWidth - minPortalWidth) * transitionFactor;
    } else {
      const baseBlockWidthBeyond = Math.min(viewportWidthCss, screenWidth / 2);
      interpolatedPortalWidth = baseBlockWidthBeyond / 3;
    }

    const baseBlockWidth = interpolatedPortalWidth * 3;
    portalWidthCss = interpolatedPortalWidth;
    columnWidthCss = baseBlockWidth / 9;
    portalHeightCss = Math.min(viewportHeightCss / 2, screenHeight / 2);

    const baselineMiddleColumnCss = columnWidthCss + middleColumnExtraCss;
    const requiredWidthBaseline =
      portalWidthCss * 2 + columnWidthCss * 2 + baselineMiddleColumnCss;
    if (requiredWidthBaseline > viewportWidthCss) {
      const scale = viewportWidthCss / requiredWidthBaseline;
      portalWidthCss *= scale;
      columnWidthCss *= scale;
      middleColumnExtraCss *= scale;
    }

    if (
      viewportWidthCss >= maxViewportWidth * 0.98 &&
      viewportWidthCss <= maxViewportWidth * 1.02
    ) {
      const requiredWidthAtTarget =
        maxPortalWidth * 2 +
        ((maxPortalWidth * 3) / 9) * 2 +
        ((maxPortalWidth * 3) / 9 + middleColumnExtraCss);

      if (
        requiredWidthAtTarget <= viewportWidthCss &&
        portalWidthCss < maxPortalWidth * 0.98
      ) {
        portalWidthCss = maxPortalWidth;
        const targetBaseBlockWidth = maxPortalWidth * 3;
        columnWidthCss = targetBaseBlockWidth / 9;
      }
    }
  }

  let middleColumnCss = columnWidthCss + middleColumnExtraCss;

  const requiredWidthCurrent =
    portalWidthCss * 2 + columnWidthCss * 2 + middleColumnCss;
  if (requiredWidthCurrent > viewportWidthCss) {
    const scaleToFit = viewportWidthCss / Math.max(requiredWidthCurrent, 1e-6);
    portalWidthCss *= scaleToFit;
    columnWidthCss *= scaleToFit;
    middleColumnExtraCss *= scaleToFit;
    middleColumnCss = columnWidthCss + middleColumnExtraCss;
  }

  squareBaselineRef.current = {
    portalWidthCss,
    columnWidthCss,
    portalHeightCss,
  };

  const requiredWidth =
    portalWidthCss * 2 + columnWidthCss * 2 + middleColumnCss;
  const outerFillerCss = Math.max(0, (viewportWidthCss - requiredWidth) / 2);

  const leftColumnCss = columnWidthCss;

  const leftCenterCss = outerFillerCss + leftColumnCss + portalWidthCss / 2;
  const rightCenterCss =
    viewportWidthCss - (outerFillerCss + leftColumnCss + portalWidthCss / 2);

  const portalWidthFraction = portalWidthCss / Math.max(viewportWidthCss, 1);
  const targetPortalWidthWorld = frustumWidth * portalWidthFraction;
  const currentPortalWidthWorld = frustumWidth * tmpInnerHole.x * 2;
  const widthScale =
    targetPortalWidthWorld / Math.max(currentPortalWidthWorld, 1e-6);

  const portalHeightCssClamped = Math.min(portalHeightCss, viewportHeightCss);
  const portalHeightFraction =
    portalHeightCssClamped / Math.max(viewportHeightCss, 1);
  const targetPortalHeightWorld = frustumHeight * portalHeightFraction;
  const currentPortalHeightWorld = frustumHeight * tmpInnerHole.y * 2;
  const heightScale =
    targetPortalHeightWorld / Math.max(currentPortalHeightWorld, 1e-6);

  tmpInnerHole.x *= widthScale;
  tmpRingHole.x *= widthScale;
  tmpInnerHole.y *= heightScale;
  tmpRingHole.y *= heightScale;

  leftPortal.uniforms.uHoleRadius.value.copy(tmpInnerHole);
  rightPortal.uniforms.uHoleRadius.value.copy(tmpInnerHole);

  const brushWidthValue = computeBrushWidth(tmpInnerHole, tmpRingHole);
  leftPortal.uniforms.uBrushWidth.value = brushWidthValue;
  rightPortal.uniforms.uBrushWidth.value = brushWidthValue;

  leftPortal.uniforms.uBrushOuterScale.value = portalBrushOuterScalar * 1.5;
  rightPortal.uniforms.uBrushOuterScale.value = portalBrushOuterScalar * 1.5;

  const portalWidthWorld = frustumWidth * tmpInnerHole.x * 2;
  const portalHeightWorld = frustumHeight * tmpInnerHole.y * 2;
  const meshScaleX = portalWidthWorld / portalGroupScale;
  const meshScaleY = portalHeightWorld / portalGroupScale;

  leftPortal.mesh.scale.set(meshScaleX, meshScaleY, 1);
  rightPortal.mesh.scale.set(meshScaleX, meshScaleY, 1);

  if (leftPortal.brushMesh) {
    leftPortal.brushMesh.scale.set(meshScaleX, meshScaleY, 1);
  }
  if (rightPortal.brushMesh) {
    rightPortal.brushMesh.scale.set(meshScaleX, meshScaleY, 1);
  }

  const leftCenterFraction = leftCenterCss / viewportWidthCss;
  const rightCenterFraction = rightCenterCss / viewportWidthCss;
  const leftCenterWorld = (leftCenterFraction - 0.5) * frustumWidth;
  const rightCenterWorld = (rightCenterFraction - 0.5) * frustumWidth;
  leftPortalGroup.position.set(leftCenterWorld, 0, 0);
  rightPortalGroup.position.set(rightCenterWorld, 0, 0);

  if (textGroupRef.current) {
    const midpointWorld = (leftCenterWorld + rightCenterWorld) / 2;
    textGroupRef.current.position.x = midpointWorld;

    const currentPortalMetrics = {
      portalWidthWorld,
      portalHeightWorld,
    };
    const baseline = textScaleBaselineRef.current;
    if (
      !baseline ||
      currentPortalMetrics.portalWidthWorld <
        baseline.portalWidthWorld - 1e-6 ||
      currentPortalMetrics.portalHeightWorld < baseline.portalHeightWorld - 1e-6
    ) {
      textScaleBaselineRef.current = {
        portalWidthWorld: currentPortalMetrics.portalWidthWorld,
        portalHeightWorld: currentPortalMetrics.portalHeightWorld,
      };
    }
    const effectiveBaseline = textScaleBaselineRef.current;
    if (effectiveBaseline) {
      const widthRatio =
        effectiveBaseline.portalWidthWorld > 0
          ? currentPortalMetrics.portalWidthWorld /
            effectiveBaseline.portalWidthWorld
          : 1;
      const heightRatio =
        effectiveBaseline.portalHeightWorld > 0
          ? currentPortalMetrics.portalHeightWorld /
            effectiveBaseline.portalHeightWorld
          : 1;
      const uniformScale = Math.min(widthRatio, heightRatio);
      textGroupRef.current.scale.setScalar(uniformScale);
    }
  }

  if (spiral) {
    spiral.resize();
    if (spiral.mesh) {
      spiral.mesh.scale.setScalar(1);
    }
    if (spiral.material?.uniforms) {
      const spiralHole = spiral.material.uniforms.uHoleRadius
        ?.value as THREE.Vector2;
      const spiralOuter = spiral.material.uniforms.uHoleRadiusOuter
        ?.value as THREE.Vector2;
      if (spiralHole && spiralOuter) {
        spiralHoleRadiusRef.inner = tmpInnerHole.clone();
        spiralHoleRadiusRef.outer = tmpRingHole.clone();
        spiralHole.set(0, 0);
        spiralOuter.set(0, 0);
      }
    }
  }

  if (wavyTexts.length > 0) {
    const baseViewportWidth = 1920;
    const baseViewportHeight = 1080;

    let targetTextSize: number;
    if (viewportWidthCss >= 900) {
      targetTextSize = 0.3;
    } else if (viewportWidthCss > 600 && viewportWidthCss < 900) {
      targetTextSize = 0.23;
    } else if (viewportWidthCss < 600 && viewportWidthCss > 400) {
      targetTextSize = 0.17;
    } else {
      targetTextSize = 0.11;
    }

    const sizeScale = targetTextSize / baseTextSize;

    const viewportScale = Math.min(
      viewportWidthCss / baseViewportWidth,
      viewportHeightCss / baseViewportHeight
    );

    const textZ = -8;
    const distance = Math.abs(camera.position.z - textZ);
    const vFov = (camera.fov * Math.PI) / 180;
    const frustumHeightAtText = 2 * distance * Math.tan(vFov / 2);
    const frustumWidthAtText = frustumHeightAtText * camera.aspect;

    const baseDistance = Math.abs(camera.position.z - textZ);
    const baseFrustumHeight = 2 * baseDistance * Math.tan(vFov / 2);
    const baseAspectRatio = baseViewportWidth / baseViewportHeight;
    const baseFrustumWidth = baseFrustumHeight * baseAspectRatio;

    const positionScaleX = frustumWidthAtText / baseFrustumWidth;
    const positionScaleY = frustumHeightAtText / baseFrustumHeight;

    const tempPositions: THREE.Vector3[] = [];
    wavyTexts.forEach((textMesh, index) => {
      const basePos = baseTextPositions[index];
      const scaledX = basePos.x * positionScaleX;
      const scaledY = basePos.y * positionScaleY;

      textMesh.position.set(scaledX, scaledY, basePos.z);
      textMesh.scale.setScalar(sizeScale);
      textMesh.updateMatrixWorld(true);

      if (!textMesh.geometry.boundingBox) {
        textMesh.geometry.computeBoundingBox();
      }
      const bbox = textMesh.geometry.boundingBox!.clone();
      bbox.applyMatrix4(textMesh.matrixWorld);

      tempPositions.push(new THREE.Vector3(bbox.min.x, 0, 0));
      tempPositions.push(new THREE.Vector3(bbox.max.x, 0, 0));
    });

    let minX = Infinity;
    let maxX = -Infinity;
    tempPositions.forEach((pos) => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
    });
    const groupCenterX = (minX + maxX) / 2;

    const centerOffsetX = -groupCenterX;

    wavyTexts.forEach((textMesh, index) => {
      const basePos = baseTextPositions[index];
      const scaledX = basePos.x * positionScaleX;
      const scaledY = basePos.y * positionScaleY;

      textMesh.position.set(scaledX + centerOffsetX, scaledY, basePos.z);
    });
  }

  if (columnTexts.length >= 2) {
    const leftTextMesh = columnTexts[0];
    const rightTextMesh = columnTexts[1];

    const textZ = -8;

    const textDistance = Math.abs(camera.position.z - textZ);
    const textVfov = (camera.fov * Math.PI) / 180;
    const frustumHeightAtText = 2 * textDistance * Math.tan(textVfov / 2);
    const frustumWidthAtText = frustumHeightAtText * camera.aspect;

    const toWorldText = (css: number) =>
      (css / viewportWidthCss - 0.5) * frustumWidthAtText;

    const frustumLeftEdgeWorldText = -frustumWidthAtText / 2;
    const frustumRightEdgeWorldText = frustumWidthAtText / 2;

    const leftOuterLeftCss = 0;
    const leftOuterRightCss = outerFillerCss + leftColumnCss;
    const leftPortalLeftCss = leftOuterRightCss;
    const leftPortalRightCss = leftPortalLeftCss + portalWidthCss;
    const middleLeftCss = leftPortalRightCss;
    const middleRightCss = middleLeftCss + middleColumnCss;
    const rightPortalLeftCss = middleRightCss;
    const rightPortalRightCss = rightPortalLeftCss + portalWidthCss;
    const rightOuterLeftCss = rightPortalRightCss;
    const rightOuterRightCss = viewportWidthCss;

    const leftOuterLeftWorldText = Math.max(
      toWorldText(leftOuterLeftCss),
      frustumLeftEdgeWorldText
    );
    const leftOuterRightWorldText = Math.min(
      toWorldText(leftOuterRightCss),
      frustumRightEdgeWorldText
    );
    const rightOuterLeftWorldText = Math.max(
      toWorldText(rightOuterLeftCss),
      frustumLeftEdgeWorldText
    );
    const rightOuterRightWorldText = Math.min(
      toWorldText(rightOuterRightCss),
      frustumRightEdgeWorldText
    );

    const leftOuterWidthWorldText =
      leftOuterRightWorldText - leftOuterLeftWorldText;
    const rightOuterWidthWorldText =
      rightOuterRightWorldText - rightOuterLeftWorldText;

    const commonColumnWidth = Math.min(
      leftOuterWidthWorldText,
      rightOuterWidthWorldText
    );

    const textY = -1.4;

    let columnTextSize: number;
    if (viewportWidthCss >= 900) {
      columnTextSize = 0.2;
    } else {
      columnTextSize = 0.0;
    }

    const paddingRatio = 0.1;
    const distortionMargin = 0.05;
    const effectivePaddingRatio = paddingRatio + distortionMargin;

    const commonMaxAllowedWidthForWrap =
      commonColumnWidth * (1 - 2 * effectivePaddingRatio);
    const leftMaxAllowedWidthForWrap = commonMaxAllowedWidthForWrap;
    const rightMaxAllowedWidthForWrap = commonMaxAllowedWidthForWrap;

    if (columnTextSize <= 0) {
      leftTextMesh.scale.setScalar(0);
      rightTextMesh.scale.setScalar(0);
    } else if (columnTextFont) {
      const leftOriginalText =
        leftTextMesh.userData.originalText || leftColumnText;
      const rightOriginalText =
        rightTextMesh.userData.originalText || rightColumnText;

      const leftWrappedText = wrapTextToFitWidth(
        leftOriginalText,
        columnTextFont,
        columnTextSize,
        leftMaxAllowedWidthForWrap
      );
      const rightWrappedText = wrapTextToFitWidth(
        rightOriginalText,
        columnTextFont,
        columnTextSize,
        rightMaxAllowedWidthForWrap
      );

      const leftCurrentText = leftTextMesh.userData.currentWrappedText;
      const rightCurrentText = rightTextMesh.userData.currentWrappedText;

      let leftFirstLineFontSize: number | undefined = undefined;

      if (leftCurrentText !== leftWrappedText) {
        leftTextMesh.geometry.dispose();
        const lineHeight = columnTextSize * 1.5;
        const result = createJustifiedTextGeometry(
          leftWrappedText,
          columnTextFont,
          columnTextSize,
          leftMaxAllowedWidthForWrap,
          lineHeight
        );
        result.geometry.computeBoundingBox();
        leftTextMesh.geometry = result.geometry;
        leftTextMesh.userData.currentWrappedText = leftWrappedText;
        leftFirstLineFontSize = result.firstLineFontSize;
        leftTextMesh.userData.firstLineFontSize = result.firstLineFontSize;
        console.log(
          "Left text first line font size calculated:",
          leftFirstLineFontSize,
          "base size:",
          columnTextSize
        );
      } else {
        leftFirstLineFontSize = leftTextMesh.userData.firstLineFontSize;

        if (leftFirstLineFontSize === undefined || leftFirstLineFontSize <= 0) {
          const lineHeight = columnTextSize * 1.5;
          const tempResult = createJustifiedTextGeometry(
            leftWrappedText,
            columnTextFont,
            columnTextSize,
            leftMaxAllowedWidthForWrap,
            lineHeight
          );
          leftFirstLineFontSize = tempResult.firstLineFontSize;
          leftTextMesh.userData.firstLineFontSize = leftFirstLineFontSize;
          tempResult.geometry.dispose();
        }
      }

      const shouldRecreateRightText =
        rightCurrentText !== rightWrappedText ||
        leftCurrentText !== leftWrappedText ||
        rightTextMesh.userData.firstLineFontSize !== leftFirstLineFontSize;

      if (shouldRecreateRightText) {
        rightTextMesh.geometry.dispose();
        const lineHeight = columnTextSize * 1.5;

        let rightFirstLineFontSize: number | undefined = undefined;

        const rightFirstLine = rightWrappedText.split("\n")[0]?.trim();
        if (rightFirstLine && columnTextFont) {
          let minSize = columnTextSize * 0.5;
          let maxSize = columnTextSize * 3.0;
          let targetSize = columnTextSize;
          const tolerance = 0.001;
          const maxIterations = 20;

          for (let iter = 0; iter < maxIterations; iter++) {
            try {
              const testGeom = new TextGeometry(rightFirstLine, {
                font: columnTextFont,
                size: targetSize,
                depth: 0.02,
                curveSegments: 12,
                bevelEnabled: false,
              });
              testGeom.computeBoundingBox();
              let lineWidth = 0;
              if (testGeom.boundingBox) {
                const minX = testGeom.boundingBox.min.x;
                const maxX = testGeom.boundingBox.max.x;
                if (!isNaN(minX) && !isNaN(maxX)) {
                  lineWidth = maxX - minX;
                }
              }
              testGeom.dispose();

              if (isNaN(lineWidth) || lineWidth <= 0) {
                break;
              }

              const ratio = rightMaxAllowedWidthForWrap / lineWidth;

              if (Math.abs(ratio - 1.0) < tolerance) {
                rightFirstLineFontSize = targetSize;
                break;
              }

              if (ratio < 1.0) {
                maxSize = targetSize;
                targetSize = (minSize + maxSize) / 2;
              } else {
                minSize = targetSize;
                targetSize = (minSize + maxSize) / 2;
              }

              rightFirstLineFontSize = targetSize;
            } catch (error) {
              console.warn(
                "Error calculating right first line font size:",
                error
              );
              break;
            }
          }
        }

        if (
          rightFirstLineFontSize === undefined ||
          rightFirstLineFontSize <= 0 ||
          isNaN(rightFirstLineFontSize)
        ) {
          rightFirstLineFontSize = columnTextSize;
        }

        console.log(
          "Creating right text with calculated first line font size:",
          rightFirstLineFontSize,
          "to fill width:",
          rightMaxAllowedWidthForWrap,
          "base size:",
          columnTextSize
        );

        const result = createJustifiedTextGeometry(
          rightWrappedText,
          columnTextFont,
          columnTextSize,
          rightMaxAllowedWidthForWrap,
          lineHeight,
          rightFirstLineFontSize
        );
        result.geometry.computeBoundingBox();
        rightTextMesh.geometry = result.geometry;
        rightTextMesh.userData.currentWrappedText = rightWrappedText;
        rightTextMesh.userData.firstLineFontSize = result.firstLineFontSize;

        console.log(
          "Right text first line font size result:",
          result.firstLineFontSize
        );
      }
    }

    if (columnTextSize > 0) {
      if (!leftTextMesh.geometry.boundingBox) {
        leftTextMesh.geometry.computeBoundingBox();
      }
      if (!rightTextMesh.geometry.boundingBox) {
        rightTextMesh.geometry.computeBoundingBox();
      }

      const leftTextBaseWidth =
        leftTextMesh.geometry.boundingBox!.max.x -
        leftTextMesh.geometry.boundingBox!.min.x;
      const rightTextBaseWidth =
        rightTextMesh.geometry.boundingBox!.max.x -
        rightTextMesh.geometry.boundingBox!.min.x;

      const commonMaxAllowedWidth =
        commonColumnWidth * (1 - 2 * effectivePaddingRatio);
      const leftMaxAllowedWidth = commonMaxAllowedWidth;
      const rightMaxAllowedWidth = commonMaxAllowedWidth;

      const leftTextScale = Math.min(
        1.0,
        leftMaxAllowedWidth / Math.max(leftTextBaseWidth, 1e-6)
      );
      const rightTextScale = Math.min(
        1.0,
        rightMaxAllowedWidth / Math.max(rightTextBaseWidth, 1e-6)
      );

      const leftTextActualWidth = leftTextBaseWidth * leftTextScale;
      const rightTextActualWidth = rightTextBaseWidth * rightTextScale;

      const leftTextMinX = Math.max(
        leftOuterLeftWorldText +
          effectivePaddingRatio * leftOuterWidthWorldText,
        frustumLeftEdgeWorldText
      );
      const leftTextMaxX = Math.min(
        leftOuterRightWorldText -
          effectivePaddingRatio * leftOuterWidthWorldText,
        frustumRightEdgeWorldText
      );

      const rightTextMinX = Math.max(
        rightOuterLeftWorldText +
          effectivePaddingRatio * rightOuterWidthWorldText,
        frustumLeftEdgeWorldText
      );
      const rightTextMaxX = Math.min(
        rightOuterRightWorldText -
          effectivePaddingRatio * rightOuterWidthWorldText,
        frustumRightEdgeWorldText
      );

      const leftTextAvailableWidth = leftTextMaxX - leftTextMinX;
      const rightTextAvailableWidth = rightTextMaxX - rightTextMinX;

      let finalLeftTextScale = leftTextScale;
      let finalRightTextScale = rightTextScale;

      if (leftTextActualWidth > leftTextAvailableWidth) {
        finalLeftTextScale = leftTextAvailableWidth / leftTextBaseWidth;
      }
      if (rightTextActualWidth > rightTextAvailableWidth) {
        finalRightTextScale = rightTextAvailableWidth / rightTextBaseWidth;
      }

      const finalLeftTextWidth = leftTextBaseWidth * finalLeftTextScale;
      const finalRightTextWidth = rightTextBaseWidth * finalRightTextScale;

      // Convert UV offset (0.02) to world coordinates
      const uvOffsetWorld = 0.02 * frustumWidthAtText;
      const leftTextX = leftTextMinX - uvOffsetWorld;
      const rightTextX = rightTextMinX + uvOffsetWorld;

      leftTextMesh.position.set(leftTextX, textY, textZ);
      leftTextMesh.scale.setScalar(finalLeftTextScale);
      leftTextMesh.userData.targetX = leftTextX;
      leftTextMesh.userData.targetY = textY;
      leftTextMesh.userData.targetZ = textZ;
      leftTextMesh.userData.finalScale = finalLeftTextScale;

      rightTextMesh.position.set(rightTextX, textY, textZ);
      rightTextMesh.scale.setScalar(finalRightTextScale);
      rightTextMesh.userData.targetX = rightTextX;
      rightTextMesh.userData.targetY = textY;
      rightTextMesh.userData.targetZ = textZ;
      rightTextMesh.userData.finalScale = finalRightTextScale;
    }
  }

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
}
