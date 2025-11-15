import { MutableRefObject, RefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { createArchDoorCanvas } from "./archdoorCanvas";
import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
import { createSpiralBackground } from "./SpiralBackground";
import { createPortalEllipse } from "./createPortalEllipse";
import { projectObjectToScreenUv, setPortalHoleRadius } from "./portalMath";
import { createWavyText } from "./createWavyText";

gsap.registerPlugin(ScrollTrigger);

const MIDDLE_COLUMN_EXTRA = 30;
const MOBILE_GAP_RATIO = 0.08;
const MOBILE_HEIGHT_RATIO = 0.45;

type MeshRef = MutableRefObject<THREE.Mesh | null>;
type GeometryRef = MutableRefObject<THREE.BufferGeometry | null>;
type GenericRef<T> = MutableRefObject<T | null>;

type DoorSceneSetupParams = {
  mountRef: RefObject<HTMLDivElement | null>;
  sceneOffsetY: number;
  englishText: string;
  farsiText: string;
  englishFontJsonPath: string;
  farsiFontPath: string;
  textControls: any;
  farsiTextControls: any;
  englishMeshRef: MeshRef;
  originalGeometryRef: GeometryRef;
  fontRef: GenericRef<any>;
  textGroupRef: MutableRefObject<THREE.Group | null>;
  farsiMeshRef: MeshRef;
  farsiOriginalGeometryRef: GeometryRef;
  farsiFontRef: GenericRef<any>;
  rtlTextPluginRef: GenericRef<any>;
  applyPerspectiveDistortion: (
    geometry: THREE.BufferGeometry,
    perspective: number
  ) => void;
  updatePerspectiveDistortion: (
    mesh: THREE.Mesh,
    originalGeom: THREE.BufferGeometry | null,
    perspective: number
  ) => void;
  createGeometryConfigHelper: (
    controls: any,
    font: any,
    isFarsi?: boolean
  ) => any;
  createTextMaterialHelper: (controls: any) => THREE.MeshStandardMaterial;
  farsifyText: (text: string, rtlPlugin: any) => Promise<string>;
};

export function useDoorSceneSetup({
  mountRef,
  sceneOffsetY,
  englishText,
  farsiText,
  englishFontJsonPath,
  farsiFontPath,
  textControls,
  farsiTextControls,
  englishMeshRef,
  originalGeometryRef,
  fontRef,
  textGroupRef,
  farsiMeshRef,
  farsiOriginalGeometryRef,
  farsiFontRef,
  rtlTextPluginRef,
  applyPerspectiveDistortion,
  updatePerspectiveDistortion,
  createGeometryConfigHelper,
  createTextMaterialHelper,
  farsifyText,
}: DoorSceneSetupParams) {
  const squareBaselineRef = useRef<{
    portalWidthCss: number;
    columnWidthCss: number;
    portalHeightCss: number;
  } | null>(null);
  const layoutCategoryRef = useRef<"mobile" | "portrait" | "landscape" | null>(
    null
  );
  const textScaleBaselineRef = useRef<{
    portalWidthWorld: number;
    portalHeightWorld: number;
  } | null>(null);
  const lastViewportRef = useRef<{ width: number; height: number } | null>(
    null
  );
  const textScrollTriggersRef = useRef<ScrollTrigger[]>([]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const sceneRoot = new THREE.Group();
    sceneRoot.position.y = sceneOffsetY;
    scene.add(sceneRoot);
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    let archController: ReturnType<typeof createArchDoorCanvas> | null = null;
    let archTexture: THREE.CanvasTexture | null = null;

    try {
      archController = createArchDoorCanvas(
        [imgC.src, imgA.src, imgB.src],
        1024,
        2048,
        () => {
          if (archTexture) archTexture.needsUpdate = true;
        }
      );
      archController.start?.();
      archTexture = new THREE.CanvasTexture(archController.canvas);
      archTexture.minFilter = THREE.LinearFilter;
      archTexture.magFilter = THREE.LinearFilter;
    } catch (err) {
      console.error("Failed to create arch canvas texture:", err);
    }

    const leftPortal = createPortalEllipse({
      texture: archTexture,
      hue: 0.25,
      useDigitalRain: false,
    });
    const rightPortal = createPortalEllipse({
      texture: null,
      hue: 0.6,
      useDigitalRain: true,
    });

    const portalInnerScale = new THREE.Vector2(0.75, 0.72);
    const portalRingScale = new THREE.Vector2(1.12, 1.08);
    const portalBrushOuterScalar = 2.2;
    const portalGroupScale = 0.85;

    leftPortal.uniforms.uBrushRotation.value = 0.7;
    rightPortal.uniforms.uBrushRotation.value = -0.8;
    // Enable living organ pulsing effect
    leftPortal.uniforms.uBrushPulse.value = 1.0; // Full pulse strength
    rightPortal.uniforms.uBrushPulse.value = 1.0; // Full pulse strength
    leftPortal.uniforms.uBrushPulseSpeed.value = 1.2; // Pulse speed
    rightPortal.uniforms.uBrushPulseSpeed.value = 1.2; // Pulse speed

    if (leftPortal.brushMesh) {
      leftPortal.brushMesh.scale.setScalar(1.0);
    }
    if (rightPortal.brushMesh) {
      rightPortal.brushMesh.scale.setScalar(1.0);
    }

    const tmpBaseHole = new THREE.Vector2();
    const tmpInnerHole = new THREE.Vector2();
    const tmpRingHole = new THREE.Vector2();

    const computeBrushWidth = (
      innerHole: THREE.Vector2,
      ringHole: THREE.Vector2
    ) => {
      const ratio = Math.max(
        ringHole.x / Math.max(innerHole.x, 1e-6),
        ringHole.y / Math.max(innerHole.y, 1e-6)
      );
      const unclamped = (ratio - 1.0) / 0.02 + 1.0;
      return Math.min(9.0, Math.max(1.0, unclamped));
    };

    const leftPortalGroup = new THREE.Group();
    leftPortalGroup.name = "LeftPortal_Group";
    leftPortalGroup.add(leftPortal.mesh);
    if (leftPortal.brushMesh) {
      leftPortalGroup.add(leftPortal.brushMesh);
    }
    leftPortalGroup.scale.setScalar(portalGroupScale);
    // Set initial scale to 0 - will scale to 1 at beginning of step 3
    leftPortalGroup.scale.multiplyScalar(0);

    const rightPortalGroup = new THREE.Group();
    rightPortalGroup.name = "RightPortal_Group";
    rightPortalGroup.add(rightPortal.mesh);
    if (rightPortal.brushMesh) {
      rightPortalGroup.add(rightPortal.brushMesh);
    }
    rightPortalGroup.scale.setScalar(portalGroupScale);
    // Set initial scale to 0 - will scale to 1 at beginning of step 3
    rightPortalGroup.scale.multiplyScalar(0);

    sceneRoot.add(leftPortalGroup, rightPortalGroup);

    let spiral: ReturnType<typeof createSpiralBackground> | null = null;
    const spiralHoleRadiusRef = {
      inner: null as THREE.Vector2 | null,
      outer: null as THREE.Vector2 | null,
    };
    try {
      spiral = createSpiralBackground(
        scene,
        camera,
        renderer,
        leftPortalGroup,
        rightPortalGroup,
        { parent: sceneRoot }
      );
      // Store original hole radius values for animation (will be set after first resize)
      // Initial hole radius will be set to 0 after first resize
    } catch (err) {
      console.error("Failed to create spiral background:", err);
    }

    // Create wavy text elements for navigation (home, about, contacts, resume)
    const wavyTexts: THREE.Mesh[] = [];
    const textLabels = ["home", "about", "contacts", "resume"];
    // Base values for full-screen (will be used in updateSizing)
    const baseTextSize = 0.5; // Full-screen text size
    const baseTextPositions = [
      { x: -6.9, y: 4, z: -8 }, // Full-screen positions
      { x: -2.3, y: 4, z: -8 },
      { x: 2.3, y: 4, z: -8 },
      { x: 6.9, y: 4, z: -8 },
    ];

    // Load font for wavy text (using Montserrat Black Regular)
    const loadWavyTexts = () =>
      new Promise<void>((resolve) => {
        const loader = new FontLoader();
        loader.load(
          "/assets/fonts/montserrat black_regular.json",
          (font) => {
            if (spiral?.material?.uniforms) {
              const spiralUniforms = spiral.material.uniforms;
              textLabels.forEach((label, index) => {
                const textMesh = createWavyText({
                  text: label,
                  font: font,
                  position: baseTextPositions[index], // Use base positions initially
                  size: baseTextSize, // Use base size initially
                  color: "#ff00ff",
                  onClick: () => {
                    console.log(`Clicked: ${label}`);

                    // Prevent multiple simultaneous animations
                    if (textMesh.userData.isAnimating) return;
                    textMesh.userData.isAnimating = true;

                    // Get material uniforms
                    const material = textMesh.material as THREE.ShaderMaterial;
                    const uniforms = material.uniforms;

                    // Get initial values
                    const initialScale = textMesh.userData.initialScale || 1.0;
                    const initialDistortionStrength =
                      textMesh.userData.initialDistortionStrength || 0.05;
                    const initialRippleIntensity =
                      textMesh.userData.initialRippleIntensity || 0.2;

                    // Get current scale (might be different due to responsive sizing)
                    const currentScale = textMesh.scale.x;

                    // Animate to clicked state: scale 2x, distortion/ripple 3x
                    const targetScale = currentScale * 1.4;
                    const targetDistortionStrength =
                      initialDistortionStrength * 2.0;
                    const targetRippleIntensity = initialRippleIntensity * 2.0;

                    // Create animation timeline
                    const tl = gsap.timeline({
                      onComplete: () => {
                        // After 2 seconds, animate back to initial state
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

                    // Animate scale and uniforms simultaneously
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
                    ); // Start at same time as scale
                    tl.to(
                      uniforms.uRippleIntensity,
                      {
                        value: targetRippleIntensity,
                        duration: 0.3,
                        ease: "power2.out",
                      },
                      "<"
                    ); // Start at same time as scale

                    // Wait 2 seconds before returning
                    tl.to({}, { duration: 0.75 });

                    // Add your navigation logic here
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
                // Set initial scale to 0 to prevent large initial size
                textMesh.scale.setScalar(0);
                sceneRoot.add(textMesh);
                wavyTexts.push(textMesh);
              });
              // Update positions and sizes after creation
              // updateSizing will be called after all fonts are loaded
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

    let leftOpen = true;
    let rightOpen = true;
    let animLeft = false;
    let animRight = false;

    function togglePortal(
      portal: ReturnType<typeof createPortalEllipse>,
      isOpen: boolean,
      setOpen: (v: boolean) => void,
      setAnimating: (v: boolean) => void,
      animFlag: boolean
    ) {
      if (animFlag) return;
      setAnimating(true);

      const target = isOpen ? 0 : 1;
      gsap.killTweensOf(portal.uniforms.uSpread);
      gsap.to(portal.uniforms.uSpread, {
        value: target,
        duration: 1.5,
        ease: "power2.inOut",
        onComplete: () => {
          setOpen(!isOpen);
          setAnimating(false);
        },
      });

      gsap.fromTo(
        portal.uniforms.uAlpha,
        { value: 0.8 },
        { value: 1.0, duration: 0.4, yoyo: true, repeat: 1 }
      );
    }

    const toggleLeft = () => {
      togglePortal(
        leftPortal,
        leftOpen,
        (v) => (leftOpen = v),
        (v) => (animLeft = v),
        animLeft
      );
    };

    const toggleRight = () => {
      togglePortal(
        rightPortal,
        rightOpen,
        (v) => (rightOpen = v),
        (v) => (animRight = v),
        animRight
      );
    };

    function portalFromIntersected(obj: THREE.Object3D | null) {
      while (obj) {
        if (obj === leftPortal.mesh) return "left";
        if (obj === rightPortal.mesh) return "right";
        obj = obj.parent;
      }
      return null;
    }

    const tmpVec3 = new THREE.Vector3();
    const pointerScreenUv = new THREE.Vector2();

    const pointerInsidePortal = (
      portal: ReturnType<typeof createPortalEllipse>,
      pointerNdc: THREE.Vector2
    ) => {
      pointerScreenUv.set(pointerNdc.x * 0.5 + 0.5, 0.5 * (1.0 - pointerNdc.y));
      const center = portal.uniforms.uCenter.value as THREE.Vector2;
      const hole = portal.uniforms.uHoleRadius.value as THREE.Vector2;

      if (!center || !hole) return false;

      const dx = (pointerScreenUv.x - center.x) / hole.x;
      const dy = (pointerScreenUv.y - center.y) / hole.y;
      return dx * dx + dy * dy <= 1.0;
    };

    renderer.domElement.style.cursor = "default";

    function onPointerMove(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(
        [leftPortal.mesh, rightPortal.mesh],
        false
      );

      if (intersects.length > 0) {
        const intersectedObj = intersects[0].object;
        const which =
          intersectedObj === leftPortal.mesh
            ? "left"
            : intersectedObj === rightPortal.mesh
            ? "right"
            : null;
        if (which) {
          const portal = which === "left" ? leftPortal : rightPortal;
          projectObjectToScreenUv(
            portal.mesh,
            camera,
            portal.uniforms.uCenter.value as THREE.Vector2,
            tmpVec3
          );
          if (pointerInsidePortal(portal, pointer)) {
            renderer.domElement.style.cursor = "pointer";
            return;
          }
        }
      }
      renderer.domElement.style.cursor = "default";
    }

    function onPointerDown(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Check wavy text clicks using bounding box (allows clicking inside letters)
      // This method checks if click is within the text's bounding box in screen space
      // Works even for letters with holes like "O", "A", "B", etc.
      const clickPoint = new THREE.Vector2(event.clientX, event.clientY);

      for (let i = 0; i < wavyTexts.length; i++) {
        const textMesh = wavyTexts[i];
        if (!textMesh.userData.isClickable || !textMesh.userData.onClick)
          continue;

        // Compute bounding box in world space
        if (!textMesh.geometry.boundingBox) {
          textMesh.geometry.computeBoundingBox();
        }
        const bbox = textMesh.geometry.boundingBox!.clone();

        // Transform bounding box to world space
        bbox.applyMatrix4(textMesh.matrixWorld);

        // Project bounding box corners to screen space
        const corners = [
          new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
          new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
          new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
          new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
          new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
          new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
          new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
          new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z),
        ];

        // Project all corners to screen space
        const screenCorners = corners.map((corner) => {
          const vector = corner.clone();
          vector.project(camera);
          return new THREE.Vector2(
            ((vector.x + 1) / 2) * rect.width + rect.left,
            ((1 - vector.y) / 2) * rect.height + rect.top
          );
        });

        // Find min/max in screen space
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        screenCorners.forEach((corner) => {
          minX = Math.min(minX, corner.x);
          maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y);
          maxY = Math.max(maxY, corner.y);
        });

        // Add padding for easier clicking (10% on each side)
        const paddingX = (maxX - minX) * 0.1;
        const paddingY = (maxY - minY) * 0.1;
        minX -= paddingX;
        maxX += paddingX;
        minY -= paddingY;
        maxY += paddingY;

        // Check if click is within bounding box
        if (
          clickPoint.x >= minX &&
          clickPoint.x <= maxX &&
          clickPoint.y >= minY &&
          clickPoint.y <= maxY
        ) {
          textMesh.userData.onClick();
          return;
        }
      }

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(
        [leftPortal.mesh, rightPortal.mesh],
        false
      );
      if (!intersects.length) return;
      const which = portalFromIntersected(intersects[0].object);
      if (!which) return;

      const portal = which === "left" ? leftPortal : rightPortal;
      projectObjectToScreenUv(
        portal.mesh,
        camera,
        portal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
      if (!pointerInsidePortal(portal, pointer)) return;

      if (which === "left") {
        if (archController) archController.showClickEllipse?.();
        toggleLeft();
      }
      if (which === "right") {
        portal.uniforms.uShowClickEllipse.value = 1.0;
        setTimeout(() => {
          portal.uniforms.uShowClickEllipse.value = 0.0;
        }, 500);
        toggleRight();
      }
    }

    function updateSizing() {
      if (!mount) return;
      const newWidth = window.innerWidth || mount.clientWidth || 1;
      const newHeight = window.innerHeight || mount.clientHeight || 1;
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

      const viewportWidthCss = Math.max(
        1,
        window.innerWidth ||
          mount.clientWidth ||
          renderer.domElement.clientWidth ||
          0
      );
      const viewportHeightCss = Math.max(
        1,
        window.innerHeight ||
          mount.clientHeight ||
          renderer.domElement.clientHeight ||
          0
      );

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
        const baseBlockWidth = Math.min(viewportWidthCss, screenWidth / 2);
        portalWidthCss = baseBlockWidth / 3;
        columnWidthCss = baseBlockWidth / 9;
        portalHeightCss = Math.min(viewportHeightCss / 2, screenHeight / 2);
      } else {
        let baseline = squareBaselineRef.current;
        if (!baseline) {
          const fallbackBlock = Math.min(viewportWidthCss, screenWidth / 2);
          const fallbackHeight = Math.min(
            viewportHeightCss / 2,
            screenHeight / 2
          );
          baseline = {
            portalWidthCss: fallbackBlock / 3,
            columnWidthCss: fallbackBlock / 9,
            portalHeightCss: fallbackHeight,
          };
          squareBaselineRef.current = baseline;
        }
        portalWidthCss = baseline.portalWidthCss;
        columnWidthCss = baseline.columnWidthCss;
        portalHeightCss = baseline.portalHeightCss;

        const baselineMiddleColumnCss = columnWidthCss + middleColumnExtraCss;
        const requiredWidthBaseline =
          portalWidthCss * 2 + columnWidthCss * 2 + baselineMiddleColumnCss;
        if (requiredWidthBaseline > viewportWidthCss) {
          const scale = viewportWidthCss / requiredWidthBaseline;
          portalWidthCss *= scale;
          columnWidthCss *= scale;
          middleColumnExtraCss *= scale;
        }
      }

      let middleColumnCss = columnWidthCss + middleColumnExtraCss;

      const requiredWidthCurrent =
        portalWidthCss * 2 + columnWidthCss * 2 + middleColumnCss;
      if (requiredWidthCurrent > viewportWidthCss) {
        const scaleToFit =
          viewportWidthCss / Math.max(requiredWidthCurrent, 1e-6);
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
      const outerFillerCss = Math.max(
        0,
        (viewportWidthCss - requiredWidth) / 2
      );

      const leftColumnCss = columnWidthCss;

      const leftCenterCss = outerFillerCss + leftColumnCss + portalWidthCss / 2;
      const rightCenterCss =
        viewportWidthCss -
        (outerFillerCss + leftColumnCss + portalWidthCss / 2);

      const portalWidthFraction =
        portalWidthCss / Math.max(viewportWidthCss, 1);
      const targetPortalWidthWorld = frustumWidth * portalWidthFraction;
      const currentPortalWidthWorld = frustumWidth * tmpInnerHole.x * 2;
      const widthScale =
        targetPortalWidthWorld / Math.max(currentPortalWidthWorld, 1e-6);

      const portalHeightCssClamped = Math.min(
        portalHeightCss,
        viewportHeightCss
      );
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

      leftPortal.uniforms.uBrushOuterScale.value = portalBrushOuterScalar;
      rightPortal.uniforms.uBrushOuterScale.value = portalBrushOuterScalar;

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
          currentPortalMetrics.portalHeightWorld <
            baseline.portalHeightWorld - 1e-6
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
        // Ensure spiral mesh is always at scale 1 (always visible)
        if (spiral.mesh) {
          spiral.mesh.scale.setScalar(1);
        }
        if (spiral.material?.uniforms) {
          const spiralHole = spiral.material.uniforms.uHoleRadius
            ?.value as THREE.Vector2;
          const spiralOuter = spiral.material.uniforms.uHoleRadiusOuter
            ?.value as THREE.Vector2;
          if (spiralHole && spiralOuter) {
            // Store/update original values for animation
            spiralHoleRadiusRef.inner = tmpInnerHole.clone();
            spiralHoleRadiusRef.outer = tmpRingHole.clone();
            // Always maintain hole radius at 0 initially - animation will control it during scroll
            // This ensures spiral background is always visible (holes at 0 = fully visible)
            spiralHole.set(0, 0);
            spiralOuter.set(0, 0);
          }
        }
      }

      // Update wavy text positions and sizes responsively
      // Use full-screen (16-inch laptop) positions and sizes as baseline
      if (wavyTexts.length > 0) {
        // Base values for full-screen (16-inch laptop: 1920x1080)
        // Use the same baseTextSize and baseTextPositions defined above
        const baseViewportWidth = 1920;
        const baseViewportHeight = 1080;

        // Determine text size based on screen width (3 breakpoints)
        let targetTextSize: number;
        if (viewportWidthCss >= 900) {
          targetTextSize = 0.43;
        } else if (viewportWidthCss > 600 && viewportWidthCss < 900) {
          targetTextSize = 0.35;
        } else {
          targetTextSize = 0.27;
        }

        // Calculate scale factor to achieve target size from base size
        // baseTextSize is the geometry size, targetTextSize is what we want to display
        // Use ONLY the breakpoint-based size, don't apply viewportScale to size
        const sizeScale = targetTextSize / baseTextSize;

        // Calculate position scale factor based on viewport size
        // Scale down proportionally for smaller windows (only for positions, not size)
        const viewportScale = Math.min(
          viewportWidthCss / baseViewportWidth,
          viewportHeightCss / baseViewportHeight
        );

        // Calculate frustum dimensions for position scaling
        // Use the same distance calculation as portals
        const textZ = -8;
        const distance = Math.abs(camera.position.z - textZ);
        const vFov = (camera.fov * Math.PI) / 180;
        const frustumHeightAtText = 2 * distance * Math.tan(vFov / 2);
        const frustumWidthAtText = frustumHeightAtText * camera.aspect;

        // Base frustum dimensions for full-screen (1920x1080)
        const baseDistance = Math.abs(camera.position.z - textZ);
        const baseFrustumHeight = 2 * baseDistance * Math.tan(vFov / 2);
        const baseAspectRatio = baseViewportWidth / baseViewportHeight;
        const baseFrustumWidth = baseFrustumHeight * baseAspectRatio;

        // Scale factors for positions (how much to scale from base positions)
        const positionScaleX = frustumWidthAtText / baseFrustumWidth;
        const positionScaleY = frustumHeightAtText / baseFrustumHeight;

        // First, position all texts and calculate their bounding box to find center
        const tempPositions: THREE.Vector3[] = [];
        wavyTexts.forEach((textMesh, index) => {
          // Scale positions from base full-screen positions
          const basePos = baseTextPositions[index];
          const scaledX = basePos.x * positionScaleX;
          const scaledY = basePos.y * positionScaleY;

          // Set position temporarily
          textMesh.position.set(scaledX, scaledY, basePos.z);

          // Scale text size based on screen width breakpoints ONLY
          // The geometry was created with baseTextSize, so we scale the mesh
          // Use ONLY sizeScale (from breakpoints), NOT viewportScale (which is only for positions)
          textMesh.scale.setScalar(sizeScale);

          // Update matrix to get accurate world position
          textMesh.updateMatrixWorld(true);

          // Calculate bounding box in world space
          if (!textMesh.geometry.boundingBox) {
            textMesh.geometry.computeBoundingBox();
          }
          const bbox = textMesh.geometry.boundingBox!.clone();
          bbox.applyMatrix4(textMesh.matrixWorld);

          tempPositions.push(new THREE.Vector3(bbox.min.x, 0, 0));
          tempPositions.push(new THREE.Vector3(bbox.max.x, 0, 0));
        });

        // Calculate the center of all texts
        let minX = Infinity;
        let maxX = -Infinity;
        tempPositions.forEach((pos) => {
          minX = Math.min(minX, pos.x);
          maxX = Math.max(maxX, pos.x);
        });
        const groupCenterX = (minX + maxX) / 2;

        // Calculate offset to center the group at x=0
        const centerOffsetX = -groupCenterX;

        // Apply the offset to center all texts
        wavyTexts.forEach((textMesh, index) => {
          const basePos = baseTextPositions[index];
          const scaledX = basePos.x * positionScaleX;
          const scaledY = basePos.y * positionScaleY;

          // Apply center offset to x position
          textMesh.position.set(scaledX + centerOffsetX, scaledY, basePos.z);
        });
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
    updateSizing();
    window.addEventListener("resize", updateSizing);

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const clock = new THREE.Clock();
    let rafId = 0;
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

      leftPortal.uniforms.uTime.value = elapsed;
      rightPortal.uniforms.uTime.value = elapsed * 1.05;
      if (spiral) spiral.update(elapsed);

      // Update wavy text uniforms to sync with spiral
      wavyTexts.forEach((textMesh) => {
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
          }
        }
      });

      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }

    const textGroup = new THREE.Group();
    textGroup.position.set(0, 0, 0);
    sceneRoot.add(textGroup);
    let englishMesh: THREE.Mesh | null = null;
    const loadEnglish = () =>
      new Promise<void>((resolve, reject) => {
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
            englishMesh = new THREE.Mesh(geom, mat);
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

    let farsiMesh: THREE.Mesh | null = null;
    const loadFarsi = () =>
      new Promise<void>(async (resolve, reject) => {
        if (!rtlTextPluginRef.current) {
          try {
            const rtlTextPluginModule = await import(
              "@mapbox/mapbox-gl-rtl-text"
            );
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
            applyPerspectiveDistortion(
              geom,
              farsiTextControls.verticalPerspective
            );

            const mat = createTextMaterialHelper(farsiTextControls);
            farsiMesh = new THREE.Mesh(geom, mat);
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

    Promise.all([loadEnglish(), loadFarsi(), loadWavyTexts()])
      .catch((err) => {
        console.error("Error loading texts", err);
      })
      .finally(() => {
        // Update wavy text positions and sizes after all fonts are loaded
        if (wavyTexts.length > 0) {
          updateSizing();
        }
        textScrollTriggersRef.current.forEach((trigger) => trigger.kill());
        textScrollTriggersRef.current = [];

        const english = englishMesh ?? null;
        const farsi = farsiMesh ?? null;

        if (english) {
          gsap.set(english.scale, { x: 1, y: 1, z: 1 });
          english.rotation.set(0, 0, 0);
        }
        if (farsi) {
          gsap.set(farsi.scale, { x: 1, y: 1, z: 1 });
          farsi.rotation.set(0, 0, 0);
        }

        if (textGroupRef.current && (english || farsi)) {
          const trigger = ScrollTrigger.create({
            trigger: mount,
            start: "top top",
            end: () =>
              `+=${
                Math.max(mount.clientHeight, window.innerHeight || 1000) * 4
              }`,
            scrub: true,
            pin: true,
            pinSpacing: true,
            onEnter: () => {
              // Ensure initial state when entering the trigger
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
              // Reset portals to scale 0 and spiral holes to 0 at initial state
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
            },
            onLeaveBack: () => {
              // Reset to initial state when scrolling back above the trigger
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
              // Reset portals to scale 0 and spiral holes to 0 at initial state
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
            },
            onUpdate: (self) => {
              const progress = Math.max(0, Math.min(1, self.progress)); // Clamp progress between 0 and 1

              // Force complete reset when at the very beginning
              if (progress === 0 || progress < 0.001) {
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
                // Reset portals to scale 0 and spiral holes to 0 at initial state
                leftPortalGroup.scale.setScalar(0);
                rightPortalGroup.scale.setScalar(0);
                // Reset spiral hole radius to 0 (spiral mesh should always be visible at scale 1)
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
                return; // Early return to avoid unnecessary calculations
              }

              // ============================================
              // STEP 1: Scale both texts to 1.2
              // ============================================
              // Phase 1: Scale both texts to 1.2 (progress 0 to 0.2)
              const scaleUpPhase =
                progress < 0.2 ? Math.min(progress / 0.2, 1) : 1;
              const textScale = 1 + scaleUpPhase * 0.2; // Scale from 1 to 1.2

              // ============================================
              // STEP 2: Rotation animation
              // ============================================
              // Phase 2: Rotation and scale down (progress 0.2 to 1.0)
              const phase2Progress =
                progress >= 0.2 ? Math.max(0, (progress - 0.2) / 0.8) : 0;
              const rotProgress = Math.min(phase2Progress * 4, 1);
              const rotation =
                progress >= 0.2 ? (-Math.PI * rotProgress) / 4 : 0;

              // ============================================
              // STEP 3: Final scale down
              // ============================================
              const scaleProgress =
                progress >= 0.2 ? Math.max(phase2Progress - 0.25, 0) / 0.75 : 0;
              const groupScale = Math.max(0, 1 - scaleProgress);

              // Apply individual text scaling
              // In phase 1: scale from 1 to 1.2
              // In phase 2: maintain 1.2 scale while rotation happens
              const individualTextScale = progress < 0.2 ? textScale : 1.2;

              if (english) {
                // STEP 1: Scale to 1.2
                english.scale.setScalar(individualTextScale);

                // STEP 2: Apply rotation and position changes
                if (progress >= 0.2) {
                  english.rotation.x = rotation;
                  // Position changes during rotation
                  const originalPosY = textControls.posY;
                  const originalPosZ = textControls.posZ;
                  english.position.y = originalPosY + 0.05 * rotProgress;
                  english.position.z = originalPosZ + 0.5 * rotProgress;
                } else {
                  // Explicitly reset to initial state in phase 1
                  english.rotation.x = 0;
                  english.position.set(
                    textControls.posX,
                    textControls.posY,
                    textControls.posZ
                  );
                }
              }

              if (farsi) {
                // STEP 1: Scale to 1.2
                farsi.scale.setScalar(individualTextScale);

                // STEP 2: Apply rotation
                if (progress >= 0.2) {
                  farsi.rotation.x = rotation;
                } else {
                  // Explicitly reset to initial state in phase 1
                  farsi.rotation.x = 0;
                }
              }

              // STEP 3: Apply final scale down to the group
              if (progress >= 0.2) {
                textGroupRef.current?.scale.setScalar(groupScale);
              } else {
                textGroupRef.current?.scale.setScalar(1);
              }

              // Scale portals and spiral fade holes at beginning of step 3 (when text scale down starts)
              // Step 3 starts when scaleProgress > 0, which is when phase2Progress > 0.25
              // This means progress > 0.2 + 0.25 * 0.8 = 0.4
              // Synchronize portal scaling with text scale down - portals reach scale 1 when text reaches scale 0
              if (scaleProgress > 0) {
                // Scale portals from 0 to their target scale - synchronized with text scale down
                // Use scaleProgress directly so portals reach 1 when text reaches 0 (when scaleProgress = 1)
                const portalAndHoleScaleProgress = scaleProgress; // Same timeline as text scale down
                const portalScale =
                  portalGroupScale * portalAndHoleScaleProgress;
                leftPortalGroup.scale.setScalar(portalScale);
                rightPortalGroup.scale.setScalar(portalScale);

                // Animate spiral fade holes from 0 to original radius
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
                // Keep portals at scale 0 and spiral holes at 0 before step 3
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
          textScrollTriggersRef.current.push(trigger);
        }

        ScrollTrigger.refresh();
        updateSizing();
      });

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updateSizing);
      if (mount && renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }

      if (archController) archController.stop?.();
      if (archTexture) archTexture.dispose();
      if (leftPortal.mat) leftPortal.mat.dispose();
      if (rightPortal.mat) rightPortal.mat.dispose();
      const disposeMesh = (mesh: THREE.Mesh | null) => {
        if (!mesh) return;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => (m as THREE.Material).dispose());
        } else {
          mesh.material.dispose();
        }
      };
      disposeMesh(farsiMesh);
      disposeMesh(englishMesh);
      renderer.dispose();
      if (spiral) spiral.dispose();
      scene.remove(sceneRoot);
      textScrollTriggersRef.current.forEach((trigger) => trigger.kill());
      textScrollTriggersRef.current = [];
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, [
    applyPerspectiveDistortion,
    createGeometryConfigHelper,
    createTextMaterialHelper,
    englishFontJsonPath,
    englishText,
    farsiFontPath,
    farsiText,
    farsifyText,
    mountRef,
    sceneOffsetY,
    textControls,
    farsiTextControls,
    updatePerspectiveDistortion,
  ]);
}
