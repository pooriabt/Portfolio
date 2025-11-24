import * as THREE from "three";
import * as React from "react";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { gsap } from "gsap";
import { createWavyText } from "../components/createWavyText";

type Portal = ReturnType<
  typeof import("../components/createPortalEllipse").createPortalEllipse
>;
type Spiral = ReturnType<
  typeof import("../components/SpiralBackground").createSpiralBackground
>;

export type LoadWavyTextsParams = {
  spiral: Spiral | null;
  textLabels: string[];
  baseTextPositions: Array<{ x: number; y: number; z: number }>;
  baseTextSize: number;
  leftColumnText: string;
  rightColumnText: string;
  sceneRoot: THREE.Group;
  wavyTexts: THREE.Mesh[];
  columnTexts: THREE.Mesh[];
  onFontLoaded: (font: any) => void;
};

export function loadWavyTexts(params: LoadWavyTextsParams): Promise<void> {
  const {
    spiral,
    textLabels,
    baseTextPositions,
    baseTextSize,
    leftColumnText,
    rightColumnText,
    sceneRoot,
    wavyTexts,
    columnTexts,
    onFontLoaded,
  } = params;

  return new Promise<void>((resolve) => {
    const loader = new FontLoader();
    loader.load(
      "/assets/fonts/montserrat black_regular.json",
      (font) => {
        onFontLoaded(font);
        if (spiral?.material?.uniforms) {
          const spiralUniforms = spiral.material.uniforms;
          textLabels.forEach((label, index) => {
            const textMesh = createWavyText({
              text: label,
              font: font,
              position: baseTextPositions[index],
              size: baseTextSize,
              color: "#ff00ff",
              onClick: () => {
                console.log(`Clicked: ${label}`);

                if (textMesh.userData.isAnimating) return;
                textMesh.userData.isAnimating = true;

                const material = textMesh.material as THREE.ShaderMaterial;
                const uniforms = material.uniforms;

                const initialScale = textMesh.userData.initialScale || 1.0;
                const initialDistortionStrength =
                  textMesh.userData.initialDistortionStrength || 0.05;
                const initialRippleIntensity =
                  textMesh.userData.initialRippleIntensity || 0.2;

                const currentScale = textMesh.scale.x;

                const targetScale = currentScale * 1.4;
                const targetDistortionStrength =
                  initialDistortionStrength * 2.0;
                const targetRippleIntensity = initialRippleIntensity * 2.0;

                const tl = gsap.timeline({
                  onComplete: () => {
                    gsap.to(textMesh.scale, {
                      x: currentScale,
                      y: currentScale,
                      z: currentScale,
                      duration: 0.5,
                      ease: "power2.out",
                    });
                    gsap.to(uniforms.uDistortionStrength, {
                      value: initialDistortionStrength,
                      duration: 0.5,
                      ease: "power2.out",
                    });
                    gsap.to(uniforms.uRippleIntensity, {
                      value: initialRippleIntensity,
                      duration: 0.5,
                      ease: "power2.out",
                      onComplete: () => {
                        textMesh.userData.isAnimating = false;
                      },
                    });
                  },
                });

                tl.to(textMesh.scale, {
                  x: targetScale,
                  y: targetScale,
                  z: targetScale,
                  duration: 0.3,
                  ease: "power2.out",
                });
                tl.to(
                  uniforms.uDistortionStrength,
                  {
                    value: targetDistortionStrength,
                    duration: 0.3,
                    ease: "power2.out",
                  },
                  "<"
                );
                tl.to(
                  uniforms.uRippleIntensity,
                  {
                    value: targetRippleIntensity,
                    duration: 0.3,
                    ease: "power2.out",
                  },
                  "<"
                );

                tl.to({}, { duration: 0.75 });
              },
              spiralUniforms: {
                uTime: spiralUniforms.uTime as { value: number },
                uResolution: spiralUniforms.uResolution as {
                  value: THREE.Vector2;
                },
                uCenter0: spiralUniforms.uCenter0 as {
                  value: THREE.Vector2;
                },
                uCenter1: spiralUniforms.uCenter1 as {
                  value: THREE.Vector2;
                },
                uSpeed: spiralUniforms.uSpeed as { value: number },
                uBands: spiralUniforms.uBands as { value: number },
              },
            });
            textMesh.scale.setScalar(0);
            sceneRoot.add(textMesh);
            wavyTexts.push(textMesh);
          });

          const leftTextMesh = createWavyText({
            text: leftColumnText,
            font: font,
            position: { x: 0, y: -2, z: -8 },
            size: 1.08,
            color: "#11edbd",
            distortionStrength: 0.015,
            rippleIntensity: 0.08,
            spiralUniforms: {
              uTime: spiralUniforms.uTime as { value: number },
              uResolution: spiralUniforms.uResolution as {
                value: THREE.Vector2;
              },
              uCenter0: spiralUniforms.uCenter0 as {
                value: THREE.Vector2;
              },
              uCenter1: spiralUniforms.uCenter1 as {
                value: THREE.Vector2;
              },
              uSpeed: spiralUniforms.uSpeed as { value: number },
              uBands: spiralUniforms.uBands as { value: number },
            },
          });

          const rightTextMesh = createWavyText({
            text: rightColumnText,
            font: font,
            position: { x: 0, y: -2, z: -8 },
            size: 0.08,
            color: "#11edbd",
            distortionStrength: 0.015,
            rippleIntensity: 0.08,
            spiralUniforms: {
              uTime: spiralUniforms.uTime as { value: number },
              uResolution: spiralUniforms.uResolution as {
                value: THREE.Vector2;
              },
              uCenter0: spiralUniforms.uCenter0 as {
                value: THREE.Vector2;
              },
              uCenter1: spiralUniforms.uCenter1 as {
                value: THREE.Vector2;
              },
              uSpeed: spiralUniforms.uSpeed as { value: number },
              uBands: spiralUniforms.uBands as { value: number },
            },
          });

          leftTextMesh.scale.setScalar(0);
          rightTextMesh.scale.setScalar(0);

          leftTextMesh.userData.originalText = leftColumnText;
          rightTextMesh.userData.originalText = rightColumnText;

          sceneRoot.add(leftTextMesh, rightTextMesh);
          columnTexts.push(leftTextMesh, rightTextMesh);
        }
        resolve();
      },
      undefined,
      () => {
        console.warn("Failed to load font for wavy text");
        resolve();
      }
    );
  });
}

export type LoadEnglishParams = {
  englishFontJsonPath: string;
  englishText: string;
  textControls: any;
  fontRef: React.MutableRefObject<any>;
  textGroupRef: React.MutableRefObject<THREE.Group | null>;
  originalGeometryRef: React.MutableRefObject<THREE.BufferGeometry | null>;
  applyPerspectiveDistortion: (
    geometry: THREE.BufferGeometry,
    perspective: number
  ) => void;
  createGeometryConfigHelper: (
    controls: any,
    font: any,
    isFarsi?: boolean
  ) => any;
  createTextMaterialHelper: (controls: any) => THREE.MeshStandardMaterial;
  textGroup: THREE.Group;
  englishMeshRef: React.MutableRefObject<THREE.Mesh | null>;
};

export function loadEnglish(params: LoadEnglishParams): Promise<void> {
  const {
    englishFontJsonPath,
    englishText,
    textControls,
    fontRef,
    textGroupRef,
    originalGeometryRef,
    applyPerspectiveDistortion,
    createGeometryConfigHelper,
    createTextMaterialHelper,
    textGroup,
    englishMeshRef,
  } = params;

  return new Promise<void>((resolve, reject) => {
    const loader = new FontLoader();
    loader.load(
      englishFontJsonPath,
      (font) => {
        fontRef.current = font;
        textGroupRef.current = textGroup;

        const geomConfig = createGeometryConfigHelper(
          textControls,
          font,
          false
        );
        const geom = new TextGeometry(englishText, geomConfig);
        geom.computeBoundingBox();
        geom.center();

        originalGeometryRef.current = geom.clone();
        applyPerspectiveDistortion(geom, textControls.verticalPerspective);

        const mat = createTextMaterialHelper(textControls);
        const englishMesh = new THREE.Mesh(geom, mat);
        englishMesh.position.set(
          textControls.posX,
          textControls.posY,
          textControls.posZ
        );
        englishMesh.rotation.set(
          textControls.rotX,
          textControls.rotY,
          textControls.rotZ
        );
        englishMesh.renderOrder = 199;
        englishMesh.frustumCulled = false;
        textGroup.add(englishMesh);
        englishMeshRef.current = englishMesh;
        resolve();
      },
      undefined,
      (err) => {
        console.error("Font load error:", err);
        reject(err);
      }
    );
  });
}

export type LoadFarsiParams = {
  farsiFontPath: string;
  farsiText: string;
  farsiTextControls: any;
  farsiFontRef: React.MutableRefObject<any>;
  farsiOriginalGeometryRef: React.MutableRefObject<THREE.BufferGeometry | null>;
  rtlTextPluginRef: React.MutableRefObject<any>;
  applyPerspectiveDistortion: (
    geometry: THREE.BufferGeometry,
    perspective: number
  ) => void;
  createGeometryConfigHelper: (
    controls: any,
    font: any,
    isFarsi?: boolean
  ) => any;
  createTextMaterialHelper: (controls: any) => THREE.MeshStandardMaterial;
  farsifyText: (text: string, rtlPlugin: any) => Promise<string>;
  textGroup: THREE.Group;
  farsiMeshRef: React.MutableRefObject<THREE.Mesh | null>;
};

export function loadFarsi(params: LoadFarsiParams): Promise<void> {
  const {
    farsiFontPath,
    farsiText,
    farsiTextControls,
    farsiFontRef,
    farsiOriginalGeometryRef,
    rtlTextPluginRef,
    applyPerspectiveDistortion,
    createGeometryConfigHelper,
    createTextMaterialHelper,
    farsifyText,
    textGroup,
    farsiMeshRef,
  } = params;

  return new Promise<void>(async (resolve, reject) => {
    if (!rtlTextPluginRef.current) {
      try {
        const rtlTextPluginModule = await import("@mapbox/mapbox-gl-rtl-text");
        let pluginPromise: Promise<any>;

        if (rtlTextPluginModule.default) {
          const defaultExport = rtlTextPluginModule.default;
          if (typeof defaultExport === "function") {
            pluginPromise = (defaultExport as () => Promise<any>)();
          } else if (defaultExport instanceof Promise) {
            pluginPromise = defaultExport;
          } else {
            pluginPromise = Promise.resolve(defaultExport);
          }
        } else if (typeof rtlTextPluginModule === "function") {
          pluginPromise = (rtlTextPluginModule as any)();
        } else {
          pluginPromise = Promise.resolve(rtlTextPluginModule);
        }

        rtlTextPluginRef.current = await pluginPromise;
      } catch (error) {
        console.error("Failed to initialize RTL plugin:", error);
        reject(error);
        return;
      }
    }

    const loader = new FontLoader();
    loader.load(
      farsiFontPath,
      async (font) => {
        if (!font) {
          console.warn("Continuing without Farsi text...");
          resolve();
          return;
        }

        farsiFontRef.current = font;
        const shapedText = await farsifyText(
          farsiText,
          rtlTextPluginRef.current
        );

        const geomConfig = createGeometryConfigHelper(
          farsiTextControls,
          font,
          true
        );
        const geom = new TextGeometry(shapedText, geomConfig);
        geom.computeBoundingBox();
        geom.center();

        farsiOriginalGeometryRef.current = geom.clone();
        applyPerspectiveDistortion(geom, farsiTextControls.verticalPerspective);

        const mat = createTextMaterialHelper(farsiTextControls);
        const farsiMesh = new THREE.Mesh(geom, mat);
        farsiMesh.position.set(
          farsiTextControls.posX,
          farsiTextControls.posY,
          farsiTextControls.posZ
        );
        farsiMesh.rotation.set(
          farsiTextControls.rotX,
          farsiTextControls.rotY,
          farsiTextControls.rotZ
        );
        farsiMesh.renderOrder = 200;
        farsiMesh.frustumCulled = false;
        textGroup.add(farsiMesh);
        farsiMeshRef.current = farsiMesh;
        resolve();
      },
      undefined,
      (err) => {
        console.error("Farsi font load error:", err);
        resolve();
      }
    );
  });
}
