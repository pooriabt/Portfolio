// components/DoorScene.tsx
"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { useControls, Leva } from "leva";

gsap.registerPlugin(ScrollTrigger);
import { createArchDoorCanvas } from "./archdoorCanvas";
import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
import { createSpiralBackground } from "./SpiralBackground";
import { createPortalEllipse } from "./createPortalEllipse";
import { projectObjectToScreenUv, setPortalHoleRadius } from "./portalMath";

const MIDDLE_COLUMN_EXTRA = 30;
const MOBILE_GAP_RATIO = 0.08; // fraction of viewport width
const MOBILE_HEIGHT_RATIO = 0.45; // fraction of viewport height

/**
 * Rick and Morty style portal doors
 * - 2D elliptical portals instead of 3D doors
 * - Each portal displays a texture (arch canvas for left, digital rain for right)
 * - Opening/closing animates with spiral: spreads from center (close), vanishes (open)
 */

type DoorSceneProps = {
  englishText?: string;
  farsiText?: string;
  englishFontJsonPath?: string;
  farsiFontPath?: string;
  containerHeight?: number | string;
  containerStyle?: React.CSSProperties;
  sceneOffsetY?: number;
};

export default function DoorScene({
  englishText = "LOVE",
  farsiText = "توکلی",
  englishFontJsonPath = "/assets/fonts/helvetiker_regular.typeface.json",
  farsiFontPath = "/assets/fonts/Mj Silicon Bold.typeface.json",
  containerHeight = "200vh",
  containerStyle,
  sceneOffsetY = 0,
}: DoorSceneProps = {}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const englishMeshRef = useRef<THREE.Mesh | null>(null);
  const originalGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const fontRef = useRef<any>(null);
  const textGroupRef = useRef<THREE.Group | null>(null);
  const farsiMeshRef = useRef<THREE.Mesh | null>(null);
  const farsiOriginalGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const farsiFontRef = useRef<any>(null);
  const rtlTextPluginRef = useRef<any>(null);
  const squareBaselineRef = useRef<{
    portalWidthCss: number;
    columnWidthCss: number;
    baseBlockWidth: number;
    portalHeightCss: number;
  } | null>(null);
  const layoutCategoryRef = useRef<"mobile" | "portrait" | "landscape" | null>(
    null
  );

  function applyPerspectiveDistortion(
    geometry: THREE.BufferGeometry,
    perspective: number
  ) {
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const bbox = geometry.boundingBox!;
    const height = bbox.max.y - bbox.min.y;
    const centerY = (bbox.max.y + bbox.min.y) / 2;

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const normalizedY = height > 0 ? (y - centerY) / (height / 2) : 0;
      const scaleX = 1 + perspective * normalizedY;
      const x = positions.getX(i);
      positions.setX(i, x * scaleX);
    }
    positions.needsUpdate = true;
    geometry.computeBoundingBox();
  }

  const textControls = useControls("English Text", {
    // Geometry Settings
    size: { value: 0.3, min: 0.05, max: 1, step: 0.05 },
    depth: { value: 0.1, min: 0, max: 1, step: 0.05 },
    curveSegments: { value: 36, min: 4, max: 256, step: 4 },
    bevelEnabled: true,
    bevelThickness: {
      value: 0.07,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("English Text.bevelEnabled"),
    },
    bevelSize: {
      value: 0.05,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("English Text.bevelEnabled"),
    },
    bevelSegments: {
      value: 13,
      min: 1,
      max: 16,
      step: 1,
      render: (get) => get("English Text.bevelEnabled"),
    },

    // Position
    posX: { value: 0.0, min: -5, max: 5, step: 0.1 },
    posY: { value: -1.3, min: -5, max: 5, step: 0.1 },
    posZ: { value: 0.5, min: -5, max: 5, step: 0.1 },

    // Rotation
    rotX: {
      value: -0.65,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },
    rotY: {
      value: 0,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },
    rotZ: {
      value: 0,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },

    // Vertical Perspective (Trapezoid Distortion)
    verticalPerspective: {
      value: -0.15,
      min: -2,
      max: 2,
      step: 0.01,
      label: "Vertical Perspective (Trapezoid)",
    },

    // Material - Appearance
    color: "#ff5fa8",
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },

    // Material - Lighting
    roughness: { value: 0.3, min: 0, max: 1, step: 0.05 },
    metalness: { value: 0, min: 0, max: 1, step: 0.05 },

    // Material - Emissive
    emissiveEnabled: true,
    emissiveIntensity: {
      value: 0.2,
      min: 0,
      max: 2,
      step: 0.05,
      render: (get) => get("English Text.emissiveEnabled"),
    },
  });

  async function farsifyText(text: string, rtlPlugin: any): Promise<string> {
    if (!rtlPlugin || !text) return text;

    try {
      const shaped = rtlPlugin.applyArabicShaping(text);
      const lines = rtlPlugin.processBidirectionalText(shaped, []);
      return lines.join("\n");
    } catch (error) {
      console.error("Error shaping Farsi text:", error);
      return text;
    }
  }

  // Helper function to update perspective distortion on existing geometry
  function updatePerspectiveDistortion(
    mesh: THREE.Mesh,
    originalGeom: THREE.BufferGeometry | null,
    perspective: number
  ) {
    if (!originalGeom || !mesh.geometry) return;

    const originalPositions = originalGeom.attributes.position;
    const currentPositions = mesh.geometry.attributes.position;

    for (let i = 0; i < originalPositions.count; i++) {
      currentPositions.setXYZ(
        i,
        originalPositions.getX(i),
        originalPositions.getY(i),
        originalPositions.getZ(i)
      );
    }

    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    const bbox = mesh.geometry.boundingBox!;
    const height = bbox.max.y - bbox.min.y;
    const centerY = (bbox.max.y + bbox.min.y) / 2;

    for (let i = 0; i < currentPositions.count; i++) {
      const y = currentPositions.getY(i);
      const normalizedY = height > 0 ? (y - centerY) / (height / 2) : 0;
      const scaleX = 1 + perspective * normalizedY;
      const x = currentPositions.getX(i);
      currentPositions.setX(i, x * scaleX);
    }
    currentPositions.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
  }

  // Helper function to update material properties
  function updateMaterialProperties(
    material: THREE.MeshStandardMaterial,
    controls: any
  ) {
    material.color.set(controls.color);
    material.opacity = controls.opacity;
    material.transparent = true;
    material.side = THREE.FrontSide;
    material.depthTest = true;
    material.depthWrite = true;
    material.roughness = controls.roughness;
    material.metalness = controls.metalness;
    material.emissive.set(controls.emissiveEnabled ? controls.color : 0x000000);
    material.emissiveIntensity = controls.emissiveEnabled
      ? controls.emissiveIntensity
      : 0;
  }

  const farsiTextControls = useControls("Farsi Text", {
    // Geometry Settings
    fontSize: { value: 0.3, min: 0.05, max: 1, step: 0.05 },
    depth: { value: 0.1, min: 0, max: 1, step: 0.05 },
    curveSegments: { value: 36, min: 4, max: 256, step: 4 },
    bevelEnabled: true,
    bevelThickness: {
      value: 0.07,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("Farsi Text.bevelEnabled"),
    },
    bevelSize: {
      value: 0.05,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("Farsi Text.bevelEnabled"),
    },
    bevelSegments: {
      value: 13,
      min: 1,
      max: 16,
      step: 1,
      render: (get) => get("Farsi Text.bevelEnabled"),
    },

    // Position
    posX: { value: 0.0, min: -5, max: 5, step: 0.1 },
    posY: { value: -1.0, min: -5, max: 5, step: 0.1 },
    posZ: { value: 0.5, min: -5, max: 5, step: 0.1 },

    // Rotation
    rotX: {
      value: -0.65,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },
    rotY: {
      value: 0.0,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },
    rotZ: {
      value: 0,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },

    // Vertical Perspective (Trapezoid Distortion)
    verticalPerspective: {
      value: -0.15,
      min: -2,
      max: 2,
      step: 0.01,
      label: "Vertical Perspective (Trapezoid)",
    },

    // Material - Appearance
    color: "#2d9cdb",
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },

    // Material - Lighting
    roughness: { value: 0.3, min: 0, max: 1, step: 0.05 },
    metalness: { value: 0, min: 0, max: 1, step: 0.05 },

    // Material - Emissive
    emissiveEnabled: true,
    emissiveIntensity: {
      value: 0.2,
      min: 0,
      max: 2,
      step: 0.05,
      render: (get) => get("Farsi Text.emissiveEnabled"),
    },
  });

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

    // Adjustable scaling factors for both portals (affects texture ellipse and ring)
    const portalInnerScale = new THREE.Vector2(0.75, 0.72);
    const portalRingScale = new THREE.Vector2(1.12, 1.08);
    const portalBrushOuterScalar = 2.2;
    const portalGroupScale = 0.85;

    // Set brush rotation speeds - faster for both portals
    leftPortal.uniforms.uBrushRotation.value = 0.7; // Faster clockwise rotation
    rightPortal.uniforms.uBrushRotation.value = -0.8; // Faster counter-clockwise rotation

    // Ensure brushMesh starts with scale (1,1,1) so it scales proportionally with parent
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

    const rightPortalGroup = new THREE.Group();
    rightPortalGroup.name = "RightPortal_Group";
    rightPortalGroup.add(rightPortal.mesh);
    if (rightPortal.brushMesh) {
      rightPortalGroup.add(rightPortal.brushMesh);
    }
    rightPortalGroup.scale.setScalar(portalGroupScale);

    sceneRoot.add(leftPortalGroup, rightPortalGroup);

    let spiral: ReturnType<typeof createSpiralBackground> | null = null;
    try {
      spiral = createSpiralBackground(
        scene,
        camera,
        renderer,
        leftPortalGroup,
        rightPortalGroup,
        { parent: sceneRoot }
      );
    } catch (err) {
      console.error("Failed to create spiral background:", err);
    }

    // Start with portals closed (showing full texture)
    let leftOpen = true, // true = closed (showing texture)
      rightOpen = true, // true = closed (showing texture)
      animLeft = false,
      animRight = false;

    function togglePortal(
      portal: ReturnType<typeof createPortalEllipse>,
      isOpen: boolean,
      setOpen: (v: boolean) => void,
      setAnimating: (v: boolean) => void,
      animFlag: boolean
    ) {
      if (animFlag) return;
      setAnimating(true);

      // Toggle: if closed (uSpread=1), open it (uSpread=0); if open (uSpread=0), close it (uSpread=1)
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

      // Pulse effect during animation
      gsap.fromTo(
        portal.uniforms.uAlpha,
        { value: 0.8 },
        { value: 1.0, duration: 0.4, yoyo: true, repeat: 1 }
      );
    }

    function toggleLeft() {
      togglePortal(
        leftPortal,
        leftOpen,
        (v) => (leftOpen = v),
        (v) => (animLeft = v),
        animLeft
      );
    }

    function toggleRight() {
      togglePortal(
        rightPortal,
        rightOpen,
        (v) => (rightOpen = v),
        (v) => (animRight = v),
        animRight
      );
    }

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

      // Check if center and hole are valid
      if (!center || !hole) return false;

      const dx = (pointerScreenUv.x - center.x) / hole.x;
      const dy = (pointerScreenUv.y - center.y) / hole.y;
      return dx * dx + dy * dy <= 1.0;
    };

    // Set default cursor
    renderer.domElement.style.cursor = "default";

    function onPointerMove(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      // Only raycast against main portal meshes (not children like brushMesh)
      const intersects = raycaster.intersectObjects(
        [leftPortal.mesh, rightPortal.mesh],
        false
      );

      if (intersects.length > 0) {
        // Since we're not using recursive raycasting, the object is directly the portal mesh
        const intersectedObj = intersects[0].object;
        const which =
          intersectedObj === leftPortal.mesh
            ? "left"
            : intersectedObj === rightPortal.mesh
            ? "right"
            : null;
        if (which) {
          const portal = which === "left" ? leftPortal : rightPortal;
          // Update portal center before checking (in case it changed)
          projectObjectToScreenUv(
            portal.mesh,
            camera,
            portal.uniforms.uCenter.value as THREE.Vector2,
            tmpVec3
          );
          // Check if pointer is inside the elliptical portal bounds
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
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      // Only raycast against main portal meshes (not children like brushMesh)
      const intersects = raycaster.intersectObjects(
        [leftPortal.mesh, rightPortal.mesh],
        false
      );
      if (!intersects.length) return;
      const which = portalFromIntersected(intersects[0].object);
      if (!which) return;

      const portal = which === "left" ? leftPortal : rightPortal;
      // Update portal center before checking (in case it changed)
      projectObjectToScreenUv(
        portal.mesh,
        camera,
        portal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
      if (!pointerInsidePortal(portal, pointer)) return;

      // Show click ellipse for both portals
      if (which === "left") {
        if (archController) archController.showClickEllipse?.();
        toggleLeft();
      }
      if (which === "right") {
        // Show click ellipse on right portal
        portal.uniforms.uShowClickEllipse.value = 1.0;
        setTimeout(() => {
          portal.uniforms.uShowClickEllipse.value = 0.0;
        }, 500);
        toggleRight();
      }
    }

    function updateSizing() {
      if (!mount) return;
      const newWidth = mount.clientWidth || window.innerWidth;
      const newHeight = mount.clientHeight || window.innerHeight;
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

      // Compute frustum dimensions at portal depth
      const distance = Math.abs(camera.position.z - leftPortalGroup.position.z);
      const vFov = (camera.fov * Math.PI) / 180;
      const frustumHeight = 2 * distance * Math.tan(vFov / 2);
      const frustumWidth = frustumHeight * camera.aspect;

      // Determine 5-column layout sizing based on viewport aspect
      const viewportWidthCss = Math.max(
        1,
        window.innerWidth || 0,
        mount.clientWidth || 0,
        renderer.domElement.clientWidth || 0
      );
      const viewportHeightCss = Math.max(
        1,
        window.innerHeight || 0,
        renderer.domElement.clientHeight || 0
      );
      const aspectRatio = viewportWidthCss / viewportHeightCss;
      const isMobileViewport = viewportWidthCss <= 600;
      const layoutCategory = isMobileViewport
        ? "mobile"
        : aspectRatio <= 1
        ? "portrait"
        : "landscape";

      if (layoutCategoryRef.current !== layoutCategory) {
        squareBaselineRef.current = null;
        layoutCategoryRef.current = layoutCategory;
      }

      const screenWidth =
        typeof window !== "undefined" && window.screen
          ? window.screen.width || viewportWidthCss
          : viewportWidthCss;
      const screenHeight =
        typeof window !== "undefined" && window.screen
          ? window.screen.height || viewportHeightCss
          : viewportHeightCss;

      let middleColumnExtraCss = isMobileViewport
        ? viewportWidthCss * MOBILE_GAP_RATIO
        : MIDDLE_COLUMN_EXTRA;
      let portalWidthCss: number;
      let columnWidthCss: number;
      let baseBlockWidth: number;
      let portalHeightCss: number;
      let heightWidthRatio =
        squareBaselineRef.current &&
        squareBaselineRef.current.portalWidthCss > 0
          ? squareBaselineRef.current.portalHeightCss /
            squareBaselineRef.current.portalWidthCss
          : 0;

      if (isMobileViewport) {
        baseBlockWidth = viewportWidthCss;
        portalWidthCss = baseBlockWidth / 3;
        columnWidthCss = baseBlockWidth / 9;
        const baselineHeight = Math.min(
          viewportHeightCss * MOBILE_HEIGHT_RATIO,
          screenHeight / 2
        );
        heightWidthRatio = baselineHeight / Math.max(portalWidthCss, 1);
        portalHeightCss = baselineHeight;

        squareBaselineRef.current = {
          portalWidthCss,
          columnWidthCss,
          baseBlockWidth,
          portalHeightCss,
        };
      } else if (aspectRatio <= 1) {
        baseBlockWidth = Math.min(viewportWidthCss, screenWidth / 2);
        portalWidthCss = baseBlockWidth / 3;
        columnWidthCss = baseBlockWidth / 9;

        const baselineHeight = viewportHeightCss / 2;
        heightWidthRatio = baselineHeight / Math.max(portalWidthCss, 1);
        portalHeightCss = Math.min(baselineHeight, screenHeight / 2);

        squareBaselineRef.current = {
          portalWidthCss,
          columnWidthCss,
          baseBlockWidth,
          portalHeightCss,
        };
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
            baseBlockWidth: fallbackBlock,
            portalHeightCss: fallbackHeight,
          };
          squareBaselineRef.current = baseline;
        }
        portalWidthCss = baseline.portalWidthCss;
        columnWidthCss = baseline.columnWidthCss;
        baseBlockWidth = baseline.baseBlockWidth;
        portalHeightCss = baseline.portalHeightCss;
        heightWidthRatio =
          baseline.portalWidthCss > 0
            ? baseline.portalHeightCss / baseline.portalWidthCss
            : heightWidthRatio;

        const baselineMiddleColumnCss = columnWidthCss + middleColumnExtraCss;
        const requiredWidthBaseline =
          portalWidthCss * 2 + columnWidthCss * 2 + baselineMiddleColumnCss;
        if (requiredWidthBaseline > viewportWidthCss) {
          const scale = viewportWidthCss / requiredWidthBaseline;
          portalWidthCss *= scale;
          columnWidthCss *= scale;
          middleColumnExtraCss *= scale;
          baseBlockWidth =
            portalWidthCss * 2 +
            columnWidthCss * 2 +
            (columnWidthCss + middleColumnExtraCss);
        }

        squareBaselineRef.current = {
          portalWidthCss,
          columnWidthCss,
          baseBlockWidth,
          portalHeightCss,
        };
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
        baseBlockWidth,
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

      // Position portals according to column layout
      const leftCenterFraction = leftCenterCss / viewportWidthCss;
      const rightCenterFraction = rightCenterCss / viewportWidthCss;
      const leftCenterWorld = (leftCenterFraction - 0.5) * frustumWidth;
      const rightCenterWorld = (rightCenterFraction - 0.5) * frustumWidth;
      leftPortalGroup.position.set(leftCenterWorld, 0, 0);
      rightPortalGroup.position.set(rightCenterWorld, 0, 0);

      if (spiral) {
        spiral.resize();
        if (spiral.material?.uniforms) {
          const spiralHole = spiral.material.uniforms.uHoleRadius
            ?.value as THREE.Vector2;
          const spiralOuter = spiral.material.uniforms.uHoleRadiusOuter
            ?.value as THREE.Vector2;
          if (spiralHole) {
            spiralHole.copy(tmpInnerHole);
          }
          if (spiralOuter) {
            spiralOuter.copy(tmpRingHole);
          }
        }
      }

      // Update centers immediately after resize
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

    // Load both fonts & text BEFORE starting animation
    Promise.all([loadEnglish(), loadFarsi()])
      .then(() => {
        if (englishMesh) {
          englishMesh.scale.setScalar(0.6);
        }

        if (farsiMesh) {
          farsiMesh.scale.setScalar(0.3);
        }

        if (englishMesh) {
          gsap.to(englishMesh.scale, {
            x: 1.0,
            y: 1.0,
            z: 1.0,
            ease: "none",
            scrollTrigger: {
              trigger: mount,
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          });

          gsap.to(englishMesh.position, {
            y: -1.0, // Final position higher (closer to Farsi)
            ease: "none",
            scrollTrigger: {
              trigger: mount,
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          });
        }

        if (farsiMesh) {
          gsap.to(farsiMesh.scale, {
            x: 0.5,
            y: 0.5,
            z: 0.5,
            ease: "none",
            scrollTrigger: {
              trigger: mount,
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          });

          gsap.to(farsiMesh.position, {
            y: -0.7, // Final position higher
            ease: "none",
            scrollTrigger: {
              trigger: mount,
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          });
        }
      })
      .catch((err) => {
        console.error("Error loading texts", err);
      });

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updateSizing);
      if (mount && renderer.domElement.parentElement === mount)
        mount.removeChild(renderer.domElement);

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
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, [
    englishText,
    farsiText,
    englishFontJsonPath,
    farsiFontPath,
    sceneOffsetY,
  ]);

  function createGeometryConfigHelper(
    controls: any,
    font: any,
    isFarsi: boolean = false
  ) {
    const config: any = {
      font,
      size: isFarsi ? controls.fontSize : controls.size,
      depth: controls.depth,
      curveSegments: controls.curveSegments,
    };
    if (controls.bevelEnabled) {
      config.bevelEnabled = true;
      config.bevelThickness = controls.bevelThickness;
      config.bevelSize = controls.bevelSize;
      config.bevelSegments = controls.bevelSegments;
    } else {
      config.bevelEnabled = false;
    }
    return config;
  }

  function createTextMaterialHelper(controls: any) {
    return new THREE.MeshStandardMaterial({
      color: controls.color,
      emissive: controls.emissiveEnabled ? controls.color : 0x000000,
      emissiveIntensity: controls.emissiveEnabled
        ? controls.emissiveIntensity
        : 0,
      metalness: controls.metalness,
      roughness: controls.roughness,
      opacity: controls.opacity,
      flatShading: false,
      transparent: true,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true,
    });
  }

  const regenerateGeometry = () => {
    const mesh = englishMeshRef.current;
    const font = fontRef.current;
    const textGroup = textGroupRef.current;

    if (!mesh || !font || !textGroup || !englishText) return;

    const controls = textControls as any;
    textGroup.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => (m as THREE.Material).dispose());
    } else {
      mesh.material.dispose();
    }

    const geomConfig = createGeometryConfigHelper(controls, font, false);
    const geom = new TextGeometry(englishText, geomConfig);
    geom.computeBoundingBox();
    geom.center();

    originalGeometryRef.current = geom.clone();
    applyPerspectiveDistortion(geom, controls.verticalPerspective);

    const mat = createTextMaterialHelper(controls);
    const newMesh = new THREE.Mesh(geom, mat);
    newMesh.position.set(controls.posX, controls.posY, controls.posZ);
    newMesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);
    newMesh.renderOrder = 199;
    newMesh.frustumCulled = false;

    textGroup.add(newMesh);
    englishMeshRef.current = newMesh;
  };

  useEffect(() => {
    const mesh = englishMeshRef.current;
    if (!mesh) return;
    regenerateGeometry();
  }, [
    (textControls as any).size,
    (textControls as any).depth,
    (textControls as any).curveSegments,
    (textControls as any).bevelEnabled,
    (textControls as any).bevelThickness,
    (textControls as any).bevelSize,
    (textControls as any).bevelSegments,
    englishText,
  ]);

  useEffect(() => {
    const mesh = englishMeshRef.current;
    if (!mesh) return;

    const controls = textControls as any;
    mesh.position.set(controls.posX, controls.posY, controls.posZ);
    mesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);

    updatePerspectiveDistortion(
      mesh,
      originalGeometryRef.current,
      controls.verticalPerspective
    );

    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      updateMaterialProperties(mesh.material, controls);
    }
  }, [textControls]);

  const regenerateFarsiGeometry = async () => {
    const mesh = farsiMeshRef.current;
    const font = farsiFontRef.current;
    const textGroup = textGroupRef.current;

    if (!mesh || !font || !textGroup || !farsiText || !rtlTextPluginRef.current)
      return;

    const controls = farsiTextControls as any;
    textGroup.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => (m as THREE.Material).dispose());
    } else {
      mesh.material.dispose();
    }

    const shapedText = await farsifyText(farsiText, rtlTextPluginRef.current);
    const geomConfig = createGeometryConfigHelper(controls, font, true);
    const geom = new TextGeometry(shapedText, geomConfig);
    geom.computeBoundingBox();
    geom.center();

    farsiOriginalGeometryRef.current = geom.clone();
    applyPerspectiveDistortion(geom, controls.verticalPerspective);

    const mat = createTextMaterialHelper(controls);
    const newMesh = new THREE.Mesh(geom, mat);
    newMesh.position.set(controls.posX, controls.posY, controls.posZ);
    newMesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);
    newMesh.renderOrder = 200;
    newMesh.frustumCulled = false;

    textGroup.add(newMesh);
    farsiMeshRef.current = newMesh;
  };

  useEffect(() => {
    const mesh = farsiMeshRef.current;
    if (!mesh) return;
    regenerateFarsiGeometry();
  }, [
    (farsiTextControls as any).fontSize,
    (farsiTextControls as any).depth,
    (farsiTextControls as any).curveSegments,
    (farsiTextControls as any).bevelEnabled,
    (farsiTextControls as any).bevelThickness,
    (farsiTextControls as any).bevelSize,
    (farsiTextControls as any).bevelSegments,
    farsiText,
  ]);

  useEffect(() => {
    const mesh = farsiMeshRef.current;
    if (!mesh) return;

    const controls = farsiTextControls as any;
    mesh.position.set(controls.posX, controls.posY, controls.posZ);
    mesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);

    updatePerspectiveDistortion(
      mesh,
      farsiOriginalGeometryRef.current,
      controls.verticalPerspective
    );

    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      updateMaterialProperties(mesh.material, controls);
    }
  }, [farsiTextControls]);

  return (
    <>
      <Leva collapsed />
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: containerHeight,
          touchAction: "manipulation",
          ...containerStyle,
        }}
      />
    </>
  );
}
