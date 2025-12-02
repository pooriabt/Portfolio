import { MutableRefObject, RefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createArchDoorCanvas } from "./archdoorCanvas";
import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
import { createSpiralBackground } from "./SpiralBackground";
import { createPortalEllipse } from "./createPortalEllipse";
import { projectObjectToScreenUv, setPortalHoleRadius } from "./portalMath";
import { createWavyText } from "./createWavyText";
import {
  createTextGeometry,
  getGeometryWidth,
  calculateWordWidth,
} from "../utils/textGeometryHelpers";
import { getFrustumEdgesAtDepth, getOffScreenPositions } from "./portalMath";
import { updateSpiralCenters } from "../utils/animationLoop";
import {
  wrapTextToFitWidth,
  createJustifiedTextGeometry,
} from "../utils/textWrapping";
import { calculateTextBounds } from "../utils/textGeometryHelpers";
import {
  portalFromIntersected,
  pointerInsidePortal,
  getPointerFromEvent,
  togglePortal,
} from "./portalMath";
import {
  updateSizing,
  UpdateSizingParams,
  MIDDLE_COLUMN_EXTRA,
  MOBILE_GAP_RATIO,
  MOBILE_HEIGHT_RATIO,
} from "../utils/sizingCalculations";
import { createScrollTrigger } from "../hooks/useScrollAnimations";
import { loadWavyTexts, loadEnglish, loadFarsi } from "../utils/textLoaders";
import { createAnimationLoop } from "../utils/animationLoop";

gsap.registerPlugin(ScrollTrigger);

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
  onPortalTransition?: (url: string) => void;
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
  onPortalTransition,
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
        },
        false // Disable debug overlay for left portal
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
      // Initialize spiral gradient/scroll fade uniforms
      if (spiral.material?.uniforms) {
        const su = spiral.material.uniforms as any;
        if (su.uScrollFade) su.uScrollFade.value = 1.0;
        if (su.uGradientStartFromTop) su.uGradientStartFromTop.value = 0.75; // start at 3/4 from top
        if (su.uGradientStrength) su.uGradientStrength.value = 0.9;
        if (su.uPulseSpeed) su.uPulseSpeed.value = 1.8;
      }
    } catch (err) {
      console.error("Failed to create spiral background:", err);
    }

    // Create wavy text elements for navigation (home, about, contacts, resume)
    const wavyTexts: THREE.Mesh[] = [];
    const textLabels = ["HOME", "ABOUT", "CONTACTS", "RESUME"];

    // Column text elements for left and right columns
    const columnTexts: THREE.Mesh[] = [];
    const leftColumnText =
      "Design Works\nArchitecture, jewelry, and industrial works created through precise 3D modeling, prepared for visualization, 3D printing, and CNC fabrication.";
    const rightColumnText =
      "Development\nPython and JavaScript–based solutions integrating machine learning, image processing, and frameworks including React, React Native, and Next.js.";

    // Store font for text wrapping in updateSizing
    let columnTextFont: any = null;
    // Base values for full-screen (will be used in updateSizing)
    const baseTextSize = 0.5; // Full-screen text size
    const baseTextPositions = [
      { x: -6.9, y: 3.9, z: -8 }, // Full-screen positions
      { x: -2.3, y: 3.9, z: -8 },
      { x: 2.3, y: 3.9, z: -8 },
      { x: 6.9, y: 3.9, z: -8 },
    ];

    // Load font for wavy text (using Montserrat Black Regular)
    const loadWavyTextsWrapper = () =>
      loadWavyTexts({
        spiral,
        textLabels,
        baseTextPositions,
        baseTextSize,
        leftColumnText,
        rightColumnText,
        sceneRoot,
        wavyTexts,
        columnTexts,
        onFontLoaded: (font) => {
          columnTextFont = font;
        },
      });

    let leftOpen = true;
    let rightOpen = true;
    let animLeft = false;
    let animRight = false;

    const toggleLeft = () => {
      togglePortal(
        leftPortal,
        leftOpen,
        (v) => (leftOpen = v),
        (v) => (animLeft = v),
        animLeft,
        {
          navigateTo: "/design-works",
          portalGroup: leftPortalGroup,
          spiral,
          side: "left",
          onTransition: (url) => {
            // Hide other elements to prevent them from showing on top of the scaled portal
            rightPortalGroup.visible = false;
            columnTexts.forEach((t) => (t.visible = false));
            wavyTexts.forEach((t) => (t.visible = false));
            if (englishMesh) englishMesh.visible = false;
            if (farsiMesh) farsiMesh.visible = false;

            if (onPortalTransition) onPortalTransition(url);
          },
        }
      );
    };

    const toggleRight = () => {
      togglePortal(
        rightPortal,
        rightOpen,
        (v) => (rightOpen = v),
        (v) => (animRight = v),
        animRight,
        {
          navigateTo: "/development",
          portalGroup: rightPortalGroup,
          spiral,
          side: "right",
          onTransition: (url) => {
            // Hide other elements to prevent them from showing on top of the scaled portal
            leftPortalGroup.visible = false;
            columnTexts.forEach((t) => (t.visible = false));
            wavyTexts.forEach((t) => (t.visible = false));
            if (englishMesh) englishMesh.visible = false;
            if (farsiMesh) farsiMesh.visible = false;

            if (onPortalTransition) onPortalTransition(url);
          },
        }
      );
    };

    const tmpVec3 = new THREE.Vector3();

    renderer.domElement.style.cursor = "default";

    // Helper to check if point is within mesh bounding box (screen space)
    const isPointInMeshBounds = (
      clickX: number,
      clickY: number,
      textMesh: THREE.Mesh
    ): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      
      if (!textMesh.geometry.boundingBox) {
        textMesh.geometry.computeBoundingBox();
      }
      const bbox = textMesh.geometry.boundingBox!.clone();
      bbox.applyMatrix4(textMesh.matrixWorld);

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

      const screenCorners = corners.map((corner) => {
        const vector = corner.clone();
        vector.project(camera);
        return new THREE.Vector2(
          ((vector.x + 1) / 2) * rect.width + rect.left,
          ((1 - vector.y) / 2) * rect.height + rect.top
        );
      });

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

      const paddingX = (maxX - minX) * 0.1;
      const paddingY = (maxY - minY) * 0.1;
      minX -= paddingX;
      maxX += paddingX;
      minY -= paddingY;
      maxY += paddingY;

      return clickX >= minX && clickX <= maxX && clickY >= minY && clickY <= maxY;
    };

    function onPointerMove(event: PointerEvent) {
      const pointer = getPointerFromEvent(event, renderer);
      
      // Check wavy text hover using bounding box
      for (let i = 0; i < wavyTexts.length; i++) {
        const textMesh = wavyTexts[i];
        if (!textMesh.userData.isClickable) continue;
        
        if (isPointInMeshBounds(event.clientX, event.clientY, textMesh)) {
          renderer.domElement.style.cursor = "pointer";
          return;
        }
      }
      
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
      const pointer = getPointerFromEvent(event, renderer);

      // Check wavy text clicks using bounding box (allows clicking inside letters)
      // This method checks if click is within the text's bounding box in screen space
      // Works even for letters with holes like "O", "A", "B", etc.
      const rect = renderer.domElement.getBoundingClientRect();
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
      const which = portalFromIntersected(
        intersects[0].object,
        leftPortal,
        rightPortal
      );
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
        toggleLeft();
      }
      if (which === "right") {
        toggleRight();
      }
    }

    const updateSizingWrapper = () => {
      updateSizing({
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
      });
    };
    updateSizingWrapper();
    window.addEventListener("resize", updateSizingWrapper);

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const clock = new THREE.Clock();
    let rafId = 0;
    const animate = createAnimationLoop({
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
    });

    const textGroup = new THREE.Group();
    textGroup.position.set(0, 0, 0);
    sceneRoot.add(textGroup);
    let englishMesh: THREE.Mesh | null = null;
    const loadEnglishWrapper = () =>
      loadEnglish({
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
      }).then(() => {
        englishMesh = englishMeshRef.current;
      });

    let farsiMesh: THREE.Mesh | null = null;
    const loadFarsiWrapper = () =>
      loadFarsi({
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
      }).then(() => {
        farsiMesh = farsiMeshRef.current;
      });

    rafId = requestAnimationFrame(animate);

    // Defer font loading to next frame to ensure spiral renders first
    requestAnimationFrame(() => {
      Promise.all([
        loadEnglishWrapper(),
        loadFarsiWrapper(),
        loadWavyTextsWrapper(),
      ])
        .catch((err) => {
          console.error("Error loading texts", err);
        })
        .finally(() => {
          // Update wavy text and column text positions and sizes after all fonts are loaded
          if (wavyTexts.length > 0 || columnTexts.length > 0) {
            updateSizingWrapper();
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
            const trigger = createScrollTrigger({
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
            });
            textScrollTriggersRef.current.push(trigger);
          }

          ScrollTrigger.refresh();
          updateSizingWrapper();

          // After updateSizing sets target positions, hide side texts initially
          // They will animate in during scroll when scaleProgress > 0
          if (columnTexts.length >= 2) {
            const leftTextMesh = columnTexts[0];
            const rightTextMesh = columnTexts[1];

            // Calculate off-screen positions
            const textZ =
              leftTextMesh.userData.targetZ || leftTextMesh.position.z || 0;
            const offScreenPos = getOffScreenPositions(camera, textZ);

            // Position off-screen and scale to 0
            if (leftTextMesh.userData.targetX !== undefined) {
              leftTextMesh.position.x = offScreenPos.left;
              leftTextMesh.position.y = leftTextMesh.userData.targetY || 0;
              leftTextMesh.position.z = leftTextMesh.userData.targetZ || 0;
              leftTextMesh.scale.setScalar(0);
            }
            if (rightTextMesh.userData.targetX !== undefined) {
              rightTextMesh.position.x = offScreenPos.right;
              rightTextMesh.position.y = rightTextMesh.userData.targetY || 0;
              rightTextMesh.position.z = rightTextMesh.userData.targetZ || 0;
              rightTextMesh.scale.setScalar(0);
            }
          }
        });
    });

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updateSizingWrapper);
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
      // Dispose column texts
      columnTexts.forEach((textMesh) => {
        if (textMesh.geometry) textMesh.geometry.dispose();
        if (textMesh.material instanceof THREE.Material)
          textMesh.material.dispose();
      });
      columnTexts.length = 0;
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
