// components/DoorScene.tsx
"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { useControls, Leva, button } from "leva";
// We'll use dynamic import for mapbox-gl-rtl-text to handle Next.js/Webpack compatibility

gsap.registerPlugin(ScrollTrigger);
import { createArchDoorCanvas } from "./archdoorCanvas";
import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
import { createSpiralBackground } from "./SpiralBackground";
import { createPortalEllipse } from "./createPortalEllipse";
import { projectObjectToScreenUv, setPortalHoleRadius } from "./portalMath";

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
};

export default function DoorScene({
  englishText = "LOVE",
  farsiText = "پوریا برادران توکلی",
  englishFontJsonPath = "/assets/fonts/helvetiker_regular.typeface.json",
  farsiFontPath = "/assets/fonts/Mj Silicon Bold.typeface.json", // JSON for TextGeometry with RTL shaping
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

  // Helper function to apply perspective distortion (using function declaration to hoist)
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

  // Leva controls for text appearance - complete control with persistence
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

  // Helper function to shape Farsi text using mapbox-gl-rtl-text
  // Similar to RtlTextHelper.farsify() from the example
  async function farsifyText(text: string, rtlPlugin: any): Promise<string> {
    if (!rtlPlugin || !text) return text;

    try {
      // Apply Arabic shaping to get proper ligatures
      const shaped = rtlPlugin.applyArabicShaping(text);
      // Process bidirectional text to get visual order (right-to-left)
      const lines = rtlPlugin.processBidirectionalText(shaped, []);
      // Join lines (should be single line for our use case)
      return lines.join("\n");
    } catch (error) {
      console.error("Error shaping Farsi text:", error);
      return text; // Fallback to original text
    }
  }

  // Leva controls for Farsi text - Full 3D support with TextGeometry + RTL shaping
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
      value: 0.05,
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

    // Set brush rotation speeds - faster for both portals
    leftPortal.uniforms.uBrushRotation.value = 0.7; // Faster clockwise rotation
    rightPortal.uniforms.uBrushRotation.value = -0.8; // Faster counter-clockwise rotation

    // Store initial portal scale for scroll animation
    let initialPortalScale = { x: 1, y: 1, z: 1 };
    const startScale = 0.3; // Start small (30% size)

    // Set initial portal scale to small (will animate up during scroll)
    // Scale the entire mesh, which includes brushMesh as child
    // In Three.js, scaling a parent automatically scales all children
    leftPortal.mesh.scale.setScalar(startScale);
    rightPortal.mesh.scale.setScalar(startScale);

    // Ensure brushMesh starts with scale (1,1,1) so it scales proportionally with parent
    if (leftPortal.brushMesh) {
      leftPortal.brushMesh.scale.setScalar(1.0);
    }
    if (rightPortal.brushMesh) {
      rightPortal.brushMesh.scale.setScalar(1.0);
    }

    scene.add(leftPortal.mesh, rightPortal.mesh);

    let spiral: ReturnType<typeof createSpiralBackground> | null = null;
    try {
      spiral = createSpiralBackground(
        scene,
        camera,
        renderer,
        leftPortal.mesh,
        rightPortal.mesh
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

      const holeWidth = (leftPortal.uniforms.uHoleRadius.value as THREE.Vector2)
        .x;
      const holeHeight = (
        leftPortal.uniforms.uHoleRadius.value as THREE.Vector2
      ).y;

      // Compute frustum dimensions at portal depth
      const distance = Math.abs(camera.position.z - leftPortal.mesh.position.z);
      const vFov = (camera.fov * Math.PI) / 180;
      const frustumHeight = 2 * distance * Math.tan(vFov / 2);
      const frustumWidth = frustumHeight * camera.aspect;

      const portalWidthWorld = frustumWidth * holeWidth * 2;
      const portalHeightWorld = frustumHeight * holeHeight * 2;

      // Store the target scale for scroll animation (don't apply directly)
      initialPortalScale.x = portalWidthWorld;
      initialPortalScale.y = portalHeightWorld;
      initialPortalScale.z = 1;

      // Only set scale if not controlled by GSAP (will be set by scroll animation)
      // leftPortal.mesh.scale.set(portalWidthWorld, portalHeightWorld, 1);
      // rightPortal.mesh.scale.set(portalWidthWorld, portalHeightWorld, 1);

      // Determine spacing between portals using UV gap
      const gapUv = Math.max(0.06, holeWidth * 0.8);
      const centerDistanceUv = holeWidth * 2 + gapUv;
      const centerOffsetWorld = (frustumWidth * centerDistanceUv) / 2;

      leftPortal.mesh.position.set(-centerOffsetWorld, 0, 0);
      rightPortal.mesh.position.set(centerOffsetWorld, 0, 0);

      if (spiral) spiral.resize();

      // Update centers immediately after resize
      projectObjectToScreenUv(
        leftPortal.mesh,
        camera,
        leftPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
      projectObjectToScreenUv(
        rightPortal.mesh,
        camera,
        rightPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
    }
    updateSizing();
    window.addEventListener("resize", updateSizing);

    // Set up event handlers AFTER sizing is initialized
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // GSAP ScrollTrigger animation: Scale portals from small to full size
    // Scale the entire portal mesh AND explicitly scale brushMesh
    // In Three.js, scaling a parent should scale children, but let's be explicit
    const portalScaleTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: mount,
        start: "top top",
        end: "bottom top",
        scrub: 1,
      },
    });

    // Scale the portal mesh (main ellipse)
    // Since brushMesh is a child of the portal mesh, it will automatically scale with the parent
    portalScaleTimeline.to(leftPortal.mesh.scale, {
      x: initialPortalScale.x,
      y: initialPortalScale.y,
      z: initialPortalScale.z,
      duration: 1,
    });
    portalScaleTimeline.to(
      rightPortal.mesh.scale,
      {
        x: initialPortalScale.x,
        y: initialPortalScale.y,
        z: initialPortalScale.z,
        duration: 1,
      },
      "<"
    );

    // Note: brushMesh is a child of the portal mesh, so it automatically scales with parent
    // No need to animate brushMesh separately - it inherits parent's scale transformation

    const clock = new THREE.Clock();
    let rafId = 0;
    function animate() {
      const elapsed = clock.getElapsedTime();

      projectObjectToScreenUv(
        leftPortal.mesh,
        camera,
        leftPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
      projectObjectToScreenUv(
        rightPortal.mesh,
        camera,
        rightPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );

      leftPortal.uniforms.uTime.value = elapsed;
      rightPortal.uniforms.uTime.value = elapsed * 1.05;
      if (spiral) spiral.update(elapsed);
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }

    // Add text rendering to the scene
    const textGroup = new THREE.Group();
    textGroup.position.z = 0; // Ensure group is at correct z position
    scene.add(textGroup);

    // English Text using TextGeometry (JSON font only)
    let englishMesh: THREE.Mesh | null = null;
    const loadEnglish = () =>
      new Promise<void>((resolve, reject) => {
        const loader = new FontLoader();
        loader.load(
          englishFontJsonPath,
          (font) => {
            // Store font reference for regeneration
            fontRef.current = font;
            // Store textGroup reference
            textGroupRef.current = textGroup;

            // TextGeometry with all Leva controls
            const geomConfig: any = {
              font,
              size: textControls.size,
              depth: textControls.depth,
              curveSegments: textControls.curveSegments,
            };

            if (textControls.bevelEnabled) {
              geomConfig.bevelEnabled = true;
              geomConfig.bevelThickness = textControls.bevelThickness;
              geomConfig.bevelSize = textControls.bevelSize;
              geomConfig.bevelSegments = textControls.bevelSegments;
            } else {
              geomConfig.bevelEnabled = false;
            }

            const geom = new TextGeometry(englishText, geomConfig);
            geom.computeBoundingBox();
            geom.center();

            // Store original geometry for perspective distortion
            const originalGeom = geom.clone();
            originalGeometryRef.current = originalGeom;

            // Apply vertical perspective distortion
            applyPerspectiveDistortion(geom, textControls.verticalPerspective);

            const mat = new THREE.MeshStandardMaterial({
              color: textControls.color,
              emissive: textControls.emissiveEnabled
                ? textControls.color
                : 0x000000,
              emissiveIntensity: textControls.emissiveEnabled
                ? textControls.emissiveIntensity
                : 0,
              metalness: textControls.metalness,
              roughness: textControls.roughness,
              opacity: textControls.opacity,
              flatShading: false,
              transparent: true,
              side: THREE.FrontSide, // Only render front faces (backface culling)
              depthTest: true, // Enable depth testing for proper 3D rendering
              depthWrite: true, // Enable depth writing for proper occlusion
            });

            englishMesh = new THREE.Mesh(geom, mat);
            englishMesh.position.set(
              textControls.posX,
              textControls.posY,
              textControls.posZ
            );
            englishMesh.rotation.x = textControls.rotX;
            englishMesh.rotation.y = textControls.rotY;
            englishMesh.rotation.z = textControls.rotZ;
            englishMesh.renderOrder = 199;
            englishMesh.frustumCulled = false;
            textGroup.add(englishMesh);
            englishMeshRef.current = englishMesh; // Store ref for reactive updates

            // Store font and textGroup for regeneration
            fontRef.current = font;
            textGroupRef.current = textGroup;
            resolve();
          },
          undefined,
          (err) => {
            console.error("Font load error:", err);
            reject(err);
          }
        );
      });

    // Farsi text using TextGeometry + mapbox-gl-rtl-text for proper ligatures and RTL
    let farsiMesh: THREE.Mesh | null = null;
    const loadFarsi = () =>
      new Promise<void>(async (resolve, reject) => {
        console.log("Loading Farsi font from:", farsiFontPath);

        // Initialize RTL plugin if not already done
        if (!rtlTextPluginRef.current) {
          try {
            // Use dynamic import to handle Next.js/Webpack module resolution
            // @ts-ignore
            const rtlTextPluginModule = await import(
              "@mapbox/mapbox-gl-rtl-text"
            );

            // The library exports a default async function that returns a promise
            // Handle different module formats
            let pluginPromise: Promise<any>;

            // Try different ways the module might be exported
            if (rtlTextPluginModule.default) {
              const defaultExport = rtlTextPluginModule.default;
              if (typeof defaultExport === "function") {
                // Default is a function - call it
                pluginPromise = defaultExport();
              } else if (defaultExport instanceof Promise) {
                // Default is already a promise
                pluginPromise = defaultExport;
              } else {
                // Default is the plugin object itself
                pluginPromise = Promise.resolve(defaultExport);
              }
            } else if (typeof rtlTextPluginModule === "function") {
              // Module itself is a function
              pluginPromise = rtlTextPluginModule();
            } else {
              // Try to use it directly
              pluginPromise = Promise.resolve(rtlTextPluginModule);
            }

            // Await the promise to get the actual plugin object with methods
            const plugin = await pluginPromise;
            rtlTextPluginRef.current = plugin;
            console.log("✅ RTL text plugin initialized", plugin);
          } catch (error) {
            console.error("❌ Failed to initialize RTL plugin:", error);
            reject(error);
            return;
          }
        }

        const loader = new FontLoader();
        loader.load(
          farsiFontPath,
          async (font) => {
            console.log("Farsi font loaded successfully:", font);
            if (!font) {
              console.error("Farsi font loaded but is null or invalid");
              console.warn("Continuing without Farsi text...");
              resolve();
              return;
            }

            // Store font reference for regeneration
            farsiFontRef.current = font;

            // Shape Farsi text using RTL plugin (applies Arabic shaping + bidirectional processing)
            const shapedText = await farsifyText(
              farsiText,
              rtlTextPluginRef.current
            );
            console.log("Shaped Farsi text:", shapedText);

            // Create TextGeometry with all Leva controls (same as English)
            const geomConfig: any = {
              font,
              size: farsiTextControls.fontSize,
              depth: farsiTextControls.depth,
              curveSegments: farsiTextControls.curveSegments,
            };

            if (farsiTextControls.bevelEnabled) {
              geomConfig.bevelEnabled = true;
              geomConfig.bevelThickness = farsiTextControls.bevelThickness;
              geomConfig.bevelSize = farsiTextControls.bevelSize;
              geomConfig.bevelSegments = farsiTextControls.bevelSegments;
            } else {
              geomConfig.bevelEnabled = false;
            }

            const geom = new TextGeometry(shapedText, geomConfig);
            geom.computeBoundingBox();
            geom.center();

            // Store original geometry for perspective distortion
            const originalGeom = geom.clone();
            farsiOriginalGeometryRef.current = originalGeom;

            // Apply vertical perspective distortion
            applyPerspectiveDistortion(
              geom,
              farsiTextControls.verticalPerspective
            );

            const mat = new THREE.MeshStandardMaterial({
              color: farsiTextControls.color,
              emissive: farsiTextControls.emissiveEnabled
                ? farsiTextControls.color
                : 0x000000,
              emissiveIntensity: farsiTextControls.emissiveEnabled
                ? farsiTextControls.emissiveIntensity
                : 0,
              metalness: farsiTextControls.metalness,
              roughness: farsiTextControls.roughness,
              opacity: farsiTextControls.opacity,
              flatShading: false,
              transparent: true,
              side: THREE.FrontSide,
              depthTest: true,
              depthWrite: true,
            });

            farsiMesh = new THREE.Mesh(geom, mat);
            farsiMesh.position.set(
              farsiTextControls.posX,
              farsiTextControls.posY,
              farsiTextControls.posZ
            );
            farsiMesh.rotation.x = farsiTextControls.rotX;
            farsiMesh.rotation.y = farsiTextControls.rotY;
            farsiMesh.rotation.z = farsiTextControls.rotZ;
            farsiMesh.renderOrder = 200;
            farsiMesh.frustumCulled = false;
            textGroup.add(farsiMesh);
            farsiMeshRef.current = farsiMesh;

            console.log("✅ Farsi text with ligatures and 3D depth created");
            resolve();
          },
          (progress) => {
            console.log("Farsi font loading progress:", progress);
          },
          (err) => {
            console.error("❌ Farsi font load error:", err);
            console.warn("⚠️ Continuing without Farsi text...");
            resolve(); // Resolve instead of reject to prevent app crash
          }
        );
      });

    // Load both fonts & text BEFORE starting animation
    Promise.all([loadEnglish(), loadFarsi()])
      .then(() => {
        // Setup initial state: texts centered below portals
        // Set initial scales for scroll animation
        if (englishMesh) {
          // Start with smaller scale, will animate up during scroll
          englishMesh.scale.setScalar(0.6);
        }

        if (farsiMesh) {
          // Start with smaller scale, will animate up during scroll
          farsiMesh.scale.setScalar(0.3);
        }

        // Setup GSAP ScrollTrigger animations: Scale and position texts during scroll
        if (englishMesh) {
          // Scale animation: start small, grow during scroll
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

          // Position animation: move up during scroll
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

        // Animate Farsi text scale and position on same scroll
        if (farsiMesh) {
          // Scale animation: start small, grow during scroll
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

          // Position animation: move up during scroll
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
      // Clean up text meshes
      if (farsiMesh) {
        farsiMesh.geometry.dispose();
        if (Array.isArray(farsiMesh.material)) {
          farsiMesh.material.forEach((m) => (m as THREE.Material).dispose());
        } else {
          farsiMesh.material.dispose();
        }
      }
      if (englishMesh) {
        englishMesh.geometry.dispose();
        if (Array.isArray(englishMesh.material)) {
          englishMesh.material.forEach((m) => (m as THREE.Material).dispose());
        } else englishMesh.material.dispose();
      }
      renderer.dispose();
      if (spiral) spiral.dispose();
      // Clean up ScrollTrigger
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, [englishText, farsiText, englishFontJsonPath, farsiFontPath]);

  // Helper function to regenerate geometry when geometry controls change
  const regenerateGeometry = () => {
    const mesh = englishMeshRef.current;
    const font = fontRef.current;
    const textGroup = textGroupRef.current;

    if (!mesh || !font || !textGroup || !englishText) return;

    // Type assertion for Leva controls
    const controls = textControls as any;

    // Remove old mesh from scene
    textGroup.remove(mesh);

    // Dispose old geometry and material
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => (m as THREE.Material).dispose());
    } else {
      mesh.material.dispose();
    }

    // Create new geometry with updated controls
    const geomConfig: any = {
      font,
      size: controls.size,
      depth: controls.depth,
      curveSegments: controls.curveSegments,
    };

    if (controls.bevelEnabled) {
      geomConfig.bevelEnabled = true;
      geomConfig.bevelThickness = controls.bevelThickness;
      geomConfig.bevelSize = controls.bevelSize;
      geomConfig.bevelSegments = controls.bevelSegments;
    } else {
      geomConfig.bevelEnabled = false;
    }

    const geom = new TextGeometry(englishText, geomConfig);
    geom.computeBoundingBox();
    geom.center();

    // Store original geometry for perspective distortion
    const originalGeom = geom.clone();
    originalGeometryRef.current = originalGeom;

    // Apply vertical perspective distortion
    applyPerspectiveDistortion(geom, controls.verticalPerspective);

    // Create new material
    const mat = new THREE.MeshStandardMaterial({
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
      side: THREE.FrontSide, // Only render front faces (backface culling)
      depthTest: true, // Enable depth testing for proper 3D rendering
      depthWrite: true, // Enable depth writing for proper occlusion
    });

    // Create new mesh with updated geometry
    const newMesh = new THREE.Mesh(geom, mat);
    newMesh.position.set(controls.posX, controls.posY, controls.posZ);
    newMesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);
    newMesh.renderOrder = 199;
    newMesh.frustumCulled = false;

    textGroup.add(newMesh);
    englishMeshRef.current = newMesh;
  };

  // Regenerate geometry when geometry controls change
  useEffect(() => {
    const mesh = englishMeshRef.current;
    if (!mesh) return;

    // Check if geometry-related controls changed - if so, regenerate
    const controls = textControls as any;
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

  // Update text properties when non-geometry controls change
  useEffect(() => {
    const mesh = englishMeshRef.current;
    if (!mesh) return;

    const controls = textControls as any;

    // Update position
    mesh.position.set(controls.posX, controls.posY, controls.posZ);
    // Update rotation
    mesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);

    // Update vertical perspective distortion
    const originalGeom = originalGeometryRef.current;
    if (originalGeom && mesh.geometry) {
      // Restore original positions from cloned geometry
      const originalPositions = originalGeom.attributes.position;
      const currentPositions = mesh.geometry.attributes.position;

      // Copy original positions back
      for (let i = 0; i < originalPositions.count; i++) {
        currentPositions.setXYZ(
          i,
          originalPositions.getX(i),
          originalPositions.getY(i),
          originalPositions.getZ(i)
        );
      }

      // Apply perspective distortion
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      const bbox = mesh.geometry.boundingBox!;
      const height = bbox.max.y - bbox.min.y;
      const centerY = (bbox.max.y + bbox.min.y) / 2;

      for (let i = 0; i < currentPositions.count; i++) {
        const y = currentPositions.getY(i);
        // Normalize Y to -1 (bottom) to 1 (top)
        const normalizedY = height > 0 ? (y - centerY) / (height / 2) : 0;
        // Apply perspective: scale X based on Y position
        const controls = textControls as any;
        const scaleX = 1 + controls.verticalPerspective * normalizedY;
        const x = currentPositions.getX(i);
        currentPositions.setX(i, x * scaleX);
      }
      currentPositions.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
    }

    // Update material properties
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      const controls = textControls as any;
      mesh.material.color.set(controls.color);
      mesh.material.opacity = controls.opacity;
      mesh.material.transparent = true;
      mesh.material.side = THREE.FrontSide; // Ensure backface culling is enabled
      mesh.material.depthTest = true; // Enable depth testing
      mesh.material.depthWrite = true; // Enable depth writing
      mesh.material.roughness = controls.roughness;
      mesh.material.metalness = controls.metalness;
      mesh.material.emissive.set(
        controls.emissiveEnabled ? controls.color : 0x000000
      );
      mesh.material.emissiveIntensity = controls.emissiveEnabled
        ? controls.emissiveIntensity
        : 0;
    }
  }, [textControls]);

  // Helper function to regenerate Farsi geometry when geometry controls change
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

    // Shape Farsi text using RTL plugin
    const shapedText = await farsifyText(farsiText, rtlTextPluginRef.current);

    const geomConfig: any = {
      font,
      size: controls.fontSize,
      depth: controls.depth,
      curveSegments: controls.curveSegments,
    };

    if (controls.bevelEnabled) {
      geomConfig.bevelEnabled = true;
      geomConfig.bevelThickness = controls.bevelThickness;
      geomConfig.bevelSize = controls.bevelSize;
      geomConfig.bevelSegments = controls.bevelSegments;
    } else {
      geomConfig.bevelEnabled = false;
    }

    const geom = new TextGeometry(shapedText, geomConfig);
    geom.computeBoundingBox();
    geom.center();

    const originalGeom = geom.clone();
    farsiOriginalGeometryRef.current = originalGeom;

    applyPerspectiveDistortion(geom, controls.verticalPerspective);

    const mat = new THREE.MeshStandardMaterial({
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

    const newMesh = new THREE.Mesh(geom, mat);
    newMesh.position.set(controls.posX, controls.posY, controls.posZ);
    newMesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);
    newMesh.renderOrder = 200;
    newMesh.frustumCulled = false;

    textGroup.add(newMesh);
    farsiMeshRef.current = newMesh;
  };

  // Regenerate Farsi geometry when geometry controls change
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

  // Update Farsi text properties when non-geometry controls change
  useEffect(() => {
    const mesh = farsiMeshRef.current;
    if (!mesh) return;

    const controls = farsiTextControls as any;

    mesh.position.set(controls.posX, controls.posY, controls.posZ);
    mesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);

    // Update vertical perspective distortion
    const originalGeom = farsiOriginalGeometryRef.current;
    if (originalGeom && mesh.geometry) {
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
        const scaleX = 1 + controls.verticalPerspective * normalizedY;
        const x = currentPositions.getX(i);
        currentPositions.setX(i, x * scaleX);
      }
      currentPositions.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
    }

    // Update material properties
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.color.set(controls.color);
      mesh.material.opacity = controls.opacity;
      mesh.material.transparent = true;
      mesh.material.side = THREE.FrontSide;
      mesh.material.depthTest = true;
      mesh.material.depthWrite = true;
      mesh.material.roughness = controls.roughness;
      mesh.material.metalness = controls.metalness;
      mesh.material.emissive.set(
        controls.emissiveEnabled ? controls.color : 0x000000
      );
      mesh.material.emissiveIntensity = controls.emissiveEnabled
        ? controls.emissiveIntensity
        : 0;
    }
  }, [farsiTextControls]);

  return (
    <>
      <Leva collapsed />
      <div
        ref={mountRef}
        style={{ width: "100%", height: "200vh", touchAction: "none" }}
      />
    </>
  );
}
