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
    const textLabels = ["home", "about", "contacts", "resume"];

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
            // Store font for text wrapping
            columnTextFont = font;
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

              // Create column text meshes
              const leftTextMesh = createWavyText({
                text: leftColumnText,
                font: font,
                position: { x: 0, y: -2, z: -8 }, // Will be positioned in updateSizing
                size: 1.08, // Smaller size for body text (will be adjusted in updateSizing)
                color: "#11edbd", // Change this to any hex color (e.g., "#ff5fa8", "#2d9cdb", "#00ff00")
                distortionStrength: 0.015, // Lower value = less wavy distortion (default: 0.04)
                rippleIntensity: 0.08, // Lower value = less ripple effect (default: 0.2)
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
                position: { x: 0, y: -2, z: -8 }, // Will be positioned in updateSizing
                size: 0.08, // Smaller size for body text (will be adjusted in updateSizing)
                color: "#11edbd", // Change this to any hex color (e.g., "#ff5fa8", "#2d9cdb", "#00ff00")
                distortionStrength: 0.015, // Lower value = less wavy distortion (default: 0.04)
                rippleIntensity: 0.08, // Lower value = less ripple effect (default: 0.2)
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

              // Set initial scale to 0 to prevent rendering in center before updateSizing
              leftTextMesh.scale.setScalar(0);
              rightTextMesh.scale.setScalar(0);

              // Store original text for wrapping
              leftTextMesh.userData.originalText = leftColumnText;
              rightTextMesh.userData.originalText = rightColumnText;

              sceneRoot.add(leftTextMesh, rightTextMesh);
              columnTexts.push(leftTextMesh, rightTextMesh);

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

    // Helper function to calculate pointer position from event
    const getPointerFromEvent = (event: PointerEvent): THREE.Vector2 => {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      return pointer;
    };

    // Helper function to update spiral centers
    const updateSpiralCenters = () => {
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
    };

    renderer.domElement.style.cursor = "default";

    function onPointerMove(event: PointerEvent) {
      const pointer = getPointerFromEvent(event);
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
      const pointer = getPointerFromEvent(event);

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
        toggleLeft();
      }
      if (which === "right") {
        toggleRight();
      }
    }

    function wrapTextToFitWidth(
      text: string,
      font: any,
      baseSize: number,
      maxWidth: number
    ): string {
      // Split text into words (preserve existing line breaks)
      const paragraphs = text.split(/\n/);
      const wrappedLines: string[] = [];

      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          wrappedLines.push(""); // Preserve empty lines
          continue;
        }

        const words = paragraph.trim().split(/\s+/);
        const lines: string[] = [];
        let currentLine = "";

        for (const word of words) {
          // Test if adding this word would exceed the width
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testGeometry = new TextGeometry(testLine, {
            font: font,
            size: baseSize,
            depth: 0.02,
            curveSegments: 12,
            bevelEnabled: false,
          });
          testGeometry.computeBoundingBox();
          const testWidth =
            testGeometry.boundingBox!.max.x - testGeometry.boundingBox!.min.x;

          // Dispose temporary geometry
          testGeometry.dispose();

          if (testWidth <= maxWidth || currentLine === "") {
            // Fits or it's the first word (must add it even if too long)
            currentLine = testLine;
          } else {
            // Doesn't fit, start new line
            lines.push(currentLine);
            currentLine = word;
          }
        }

        // Add remaining line
        if (currentLine) {
          lines.push(currentLine);
        }

        wrappedLines.push(...lines);
      }

      return wrappedLines.join("\n");
    }

    function createJustifiedTextGeometry(
      text: string,
      font: any,
      baseSize: number,
      maxWidth: number,
      lineHeight: number,
      firstLineFontSizeOverride?: number
    ): { geometry: THREE.BufferGeometry; firstLineFontSize: number } {
      // Constant: maximum space each word can get for justification (as multiplier of normal space)
      const MAX_SPACE_PER_WORD_MULTIPLIER = 2.5;
      const lines = text.split("\n");
      const geometries: THREE.BufferGeometry[] = [];
      let currentY = 0;
      let actualFirstLineFontSize = baseSize;
      let firstNonEmptyLineIndex = -1; // Track the first non-empty line
      let overrideApplied = false; // Track if override was applied

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex].trim();
        if (!line) {
          currentY -= lineHeight;
          continue;
        }

        // Track first non-empty line
        if (firstNonEmptyLineIndex === -1) {
          firstNonEmptyLineIndex = lineIndex;
        }

        const words = line.split(/\s+/);
        if (words.length === 0) {
          currentY -= lineHeight;
          continue;
        }

        // Validate font before processing
        if (!font) {
          console.warn("Font is not available, skipping line");
          currentY -= lineHeight;
          continue;
        }

        // Validate baseSize
        if (isNaN(baseSize) || baseSize <= 0) {
          console.warn(`Invalid baseSize: ${baseSize}, using fallback`);
          baseSize = 0.2; // Fallback
        }

        // Check if this is the first non-empty line
        const isFirstLine = lineIndex === firstNonEmptyLineIndex;
        console.log(
          `Processing line ${lineIndex}: isFirstLine=${isFirstLine}, firstNonEmptyLineIndex=${firstNonEmptyLineIndex}, words.length=${words.length}, override=${firstLineFontSizeOverride}`
        );

        // Justify the line
        if (words.length === 1) {
          // Single word - just left-align it
          const word = words[0].trim();
          if (!word) {
            currentY -= lineHeight;
            continue;
          }

          // Use override font size if this is the first line
          let fontSizeToUse = baseSize;

          if (
            isFirstLine &&
            firstLineFontSizeOverride !== undefined &&
            firstLineFontSizeOverride > 0
          ) {
            fontSizeToUse = firstLineFontSizeOverride;
            actualFirstLineFontSize = fontSizeToUse;
            overrideApplied = true;
            console.log(
              `Single word first line override applied: word="${word}", baseSize=${baseSize}, override=${firstLineFontSizeOverride}, fontSizeToUse=${fontSizeToUse}`
            );
          } else if (isFirstLine && !overrideApplied) {
            actualFirstLineFontSize = fontSizeToUse;
          }

          try {
            const wordGeometry = new TextGeometry(word, {
              font: font,
              size: fontSizeToUse,
              depth: 0.02,
              curveSegments: 12,
              bevelEnabled: false,
            });

            // Validate geometry
            if (
              !wordGeometry ||
              !wordGeometry.attributes ||
              !wordGeometry.attributes.position
            ) {
              console.warn(`Invalid geometry for single word: "${word}"`);
              wordGeometry.dispose();
              currentY -= lineHeight;
              continue;
            }

            wordGeometry.computeBoundingBox();

            // Validate bounding box
            if (wordGeometry.boundingBox) {
              const minX = wordGeometry.boundingBox.min.x;
              const maxX = wordGeometry.boundingBox.max.x;
              if (isNaN(minX) || isNaN(maxX)) {
                console.warn(`NaN values in bounding box for word: "${word}"`);
                wordGeometry.dispose();
                currentY -= lineHeight;
                continue;
              }
            }

            wordGeometry.translate(0, currentY, 0);
            geometries.push(wordGeometry);
          } catch (error) {
            console.warn(
              `Error creating geometry for single word "${word}":`,
              error
            );
            currentY -= lineHeight;
            continue;
          }
        } else {
          // Multiple words - justify by spacing and font scaling
          const isLastLine = lineIndex === lines.length - 1;

          // Step 1: Calculate normal space width
          let normalSpaceWidth = 0;
          try {
            const spaceGeom = new TextGeometry(" ", {
              font: font,
              size: baseSize,
              depth: 0.02,
              curveSegments: 12,
              bevelEnabled: false,
            });

            // Validate space geometry
            if (
              spaceGeom &&
              spaceGeom.attributes &&
              spaceGeom.attributes.position
            ) {
              spaceGeom.computeBoundingBox();
              if (spaceGeom.boundingBox) {
                const minX = spaceGeom.boundingBox.min.x;
                const maxX = spaceGeom.boundingBox.max.x;
                if (!isNaN(minX) && !isNaN(maxX)) {
                  normalSpaceWidth = maxX - minX;
                }
              }
            }

            if (isNaN(normalSpaceWidth) || normalSpaceWidth <= 0) {
              normalSpaceWidth = baseSize * 0.3;
            }
            spaceGeom.dispose();
          } catch (error) {
            console.warn("Error creating space geometry:", error);
            normalSpaceWidth = baseSize * 0.3;
          }

          // Step 2: Calculate maximum allowed space between words using constant
          const maxAllowedSpaceBetweenWords =
            normalSpaceWidth * MAX_SPACE_PER_WORD_MULTIPLIER;

          // Step 3: Calculate total width of all words at base size
          // Validate font and baseSize before creating geometries
          if (!font) {
            console.warn(
              "Font is not available, skipping text geometry creation"
            );
            currentY -= lineHeight;
            continue;
          }

          if (isNaN(baseSize) || baseSize <= 0) {
            console.warn(`Invalid baseSize: ${baseSize}, using fallback`);
            baseSize = 0.2; // Fallback
          }

          let totalWordWidth = 0;
          const wordWidths: number[] = [];

          for (const word of words) {
            const trimmedWord = word.trim();
            if (!trimmedWord) {
              // Skip empty words
              wordWidths.push(0);
              continue;
            }

            try {
              const wordGeom = new TextGeometry(trimmedWord, {
                font: font,
                size: baseSize,
                depth: 0.02,
                curveSegments: 12,
                bevelEnabled: false,
              });

              // Validate geometry before computing bounding box
              if (
                !wordGeom ||
                !wordGeom.attributes ||
                !wordGeom.attributes.position
              ) {
                console.warn(`Invalid geometry for word: "${trimmedWord}"`);
                wordGeom.dispose();
                const fallbackWidth = baseSize * trimmedWord.length * 0.5;
                wordWidths.push(fallbackWidth);
                totalWordWidth += fallbackWidth;
                continue;
              }

              wordGeom.computeBoundingBox();
              let wordWidth = 0;
              if (wordGeom.boundingBox) {
                const minX = wordGeom.boundingBox.min.x;
                const maxX = wordGeom.boundingBox.max.x;

                // Validate bounding box values
                if (!isNaN(minX) && !isNaN(maxX)) {
                  wordWidth = maxX - minX;
                }
              }

              if (isNaN(wordWidth) || wordWidth <= 0) {
                wordWidth = baseSize * trimmedWord.length * 0.5;
              }

              wordWidths.push(wordWidth);
              totalWordWidth += wordWidth;
              wordGeom.dispose();
            } catch (error) {
              console.warn(
                `Error creating geometry for word "${trimmedWord}":`,
                error
              );
              // Use fallback width
              const fallbackWidth = baseSize * trimmedWord.length * 0.5;
              wordWidths.push(fallbackWidth);
              totalWordWidth += fallbackWidth;
            }
          }

          // Validate inputs
          if (isNaN(totalWordWidth) || totalWordWidth < 0) {
            totalWordWidth = 0;
          }
          if (isNaN(maxWidth) || maxWidth <= 0) {
            maxWidth = totalWordWidth || baseSize * 10;
          }

          // Step 4: Start with normal space between words
          const numSpaces = words.length - 1;
          const totalWidthWithNormalSpacing =
            totalWordWidth + numSpaces * normalSpaceWidth;
          let remainingSpace = maxWidth - totalWidthWithNormalSpacing;

          // Step 5: Distribute remaining space up to maximum limit
          let spaceBetweenWords = normalSpaceWidth;
          let finalFontSize = baseSize;

          // isFirstLine is already defined above, use it here
          console.log(
            `Multiple words line ${lineIndex}: isFirstLine=${isFirstLine}, firstNonEmptyLineIndex=${firstNonEmptyLineIndex}, override=${firstLineFontSizeOverride}, overrideDefined=${
              firstLineFontSizeOverride !== undefined
            }, override>0=${
              firstLineFontSizeOverride !== undefined &&
              firstLineFontSizeOverride > 0
            }`
          );

          if (
            isFirstLine &&
            firstLineFontSizeOverride !== undefined &&
            firstLineFontSizeOverride > 0
          ) {
            // Use the provided font size for first line
            finalFontSize = firstLineFontSizeOverride;
            actualFirstLineFontSize = finalFontSize;
            overrideApplied = true; // Mark that override was applied
            console.log(
              `First line override applied: baseSize=${baseSize}, override=${firstLineFontSizeOverride}, finalFontSize=${finalFontSize}, actualFirstLineFontSize=${actualFirstLineFontSize}`
            );

            // Recalculate word widths and normal space width at the override font size for accurate spacing
            let overrideTotalWordWidth = 0;
            for (let i = 0; i < words.length; i++) {
              const trimmedWord = words[i].trim();
              if (!trimmedWord) continue;

              try {
                const testGeom = new TextGeometry(trimmedWord, {
                  font: font,
                  size: finalFontSize,
                  depth: 0.02,
                  curveSegments: 12,
                  bevelEnabled: false,
                });
                testGeom.computeBoundingBox();
                if (testGeom.boundingBox) {
                  const minX = testGeom.boundingBox.min.x;
                  const maxX = testGeom.boundingBox.max.x;
                  if (!isNaN(minX) && !isNaN(maxX)) {
                    overrideTotalWordWidth += maxX - minX;
                  }
                }
                testGeom.dispose();
              } catch (error) {
                // Use fallback
                overrideTotalWordWidth +=
                  finalFontSize * trimmedWord.length * 0.5;
              }
            }

            // Recalculate normal space width at override font size
            let overrideNormalSpaceWidth = normalSpaceWidth;
            try {
              const overrideSpaceGeom = new TextGeometry(" ", {
                font: font,
                size: finalFontSize,
                depth: 0.02,
                curveSegments: 12,
                bevelEnabled: false,
              });
              overrideSpaceGeom.computeBoundingBox();
              if (overrideSpaceGeom.boundingBox) {
                const minX = overrideSpaceGeom.boundingBox.min.x;
                const maxX = overrideSpaceGeom.boundingBox.max.x;
                if (!isNaN(minX) && !isNaN(maxX)) {
                  overrideNormalSpaceWidth = maxX - minX;
                }
              }
              overrideSpaceGeom.dispose();
            } catch (error) {
              // Use scaled version of base normal space width
              overrideNormalSpaceWidth =
                normalSpaceWidth * (finalFontSize / baseSize);
            }

            // Recalculate max allowed space at override font size
            const overrideMaxAllowedSpaceBetweenWords =
              overrideNormalSpaceWidth * MAX_SPACE_PER_WORD_MULTIPLIER;

            // Recalculate spacing with override font size widths
            const overrideTotalWidthWithNormalSpacing =
              overrideTotalWordWidth + numSpaces * overrideNormalSpaceWidth;
            const overrideRemainingSpace =
              maxWidth - overrideTotalWidthWithNormalSpacing;

            if (numSpaces > 0 && overrideRemainingSpace > 0) {
              const maxExtraSpacePerGap =
                overrideMaxAllowedSpaceBetweenWords - overrideNormalSpaceWidth;
              const maxTotalExtraSpace = numSpaces * maxExtraSpacePerGap;

              if (overrideRemainingSpace <= maxTotalExtraSpace) {
                const extraSpacePerGap = overrideRemainingSpace / numSpaces;
                spaceBetweenWords = overrideNormalSpaceWidth + extraSpacePerGap;
              } else {
                spaceBetweenWords = overrideMaxAllowedSpaceBetweenWords;
              }
            } else {
              // No remaining space, use normal spacing
              spaceBetweenWords = overrideNormalSpaceWidth;
            }
          } else if (numSpaces > 0 && remainingSpace > 0) {
            // Calculate how much extra space we can add per gap (up to max limit)
            const maxExtraSpacePerGap =
              maxAllowedSpaceBetweenWords - normalSpaceWidth;
            const maxTotalExtraSpace = numSpaces * maxExtraSpacePerGap;

            if (remainingSpace <= maxTotalExtraSpace) {
              // Can fill with spacing alone - distribute remaining space evenly
              const extraSpacePerGap = remainingSpace / numSpaces;
              spaceBetweenWords = normalSpaceWidth + extraSpacePerGap;
              remainingSpace = 0; // All space used
            } else {
              // Use maximum spacing, then scale font if not last line
              spaceBetweenWords = maxAllowedSpaceBetweenWords;
              remainingSpace = remainingSpace - maxTotalExtraSpace;

              // If there's still remaining space and not last line, scale font
              if (remainingSpace > 0.001 && !isLastLine) {
                // Calculate font scale to fill remaining space
                // Current total width with max spacing
                const currentTotalWidth =
                  totalWordWidth + numSpaces * maxAllowedSpaceBetweenWords;
                // Target total width to fill remaining space
                const targetTotalWidth = currentTotalWidth + remainingSpace;
                // Scale factor: newWidth = oldWidth * scale
                const scaleFactor = targetTotalWidth / currentTotalWidth;
                finalFontSize = baseSize * scaleFactor;
              } else if (isLastLine) {
                // Last line: use max spacing, no scaling, no right justification
                remainingSpace = 0; // Don't justify to right for last line
              }
            }

            // Track first line font size if this is the first line
            // But don't overwrite if override was already applied
            if (isFirstLine && !overrideApplied) {
              actualFirstLineFontSize = finalFontSize;
            }
          } else if (isFirstLine) {
            // First line but no spacing needed - still track the font size
            // But don't overwrite if override was already applied
            if (!overrideApplied) {
              actualFirstLineFontSize = finalFontSize;
            }
          }

          // Step 6: Create word geometries with final font size
          const finalWordGeometries: THREE.BufferGeometry[] = [];
          const finalWordWidths: number[] = [];
          let finalTotalWordWidth = 0;

          // Validate font and font size before creating geometries
          if (!font) {
            console.warn(
              "Font is not available, skipping text geometry creation"
            );
            continue;
          }

          // Validate finalFontSize
          if (isNaN(finalFontSize) || finalFontSize <= 0) {
            console.warn(`Invalid font size: ${finalFontSize}, using baseSize`);
            finalFontSize = baseSize;
          }

          for (let i = 0; i < words.length; i++) {
            const word = words[i].trim();
            if (!word) {
              // Skip empty words
              continue;
            }

            try {
              const wordGeom = new TextGeometry(word, {
                font: font,
                size: finalFontSize,
                depth: 0.02,
                curveSegments: 12,
                bevelEnabled: false,
              });

              // Validate geometry before computing bounding box
              if (
                !wordGeom ||
                !wordGeom.attributes ||
                !wordGeom.attributes.position
              ) {
                console.warn(`Invalid geometry for word: "${word}"`);
                wordGeom.dispose();
                continue;
              }

              wordGeom.computeBoundingBox();

              let wordWidth = 0;
              if (wordGeom.boundingBox) {
                const minX = wordGeom.boundingBox.min.x;
                const maxX = wordGeom.boundingBox.max.x;

                // Validate bounding box values
                if (!isNaN(minX) && !isNaN(maxX)) {
                  wordWidth = maxX - minX;
                }
              }

              // Fallback if width is invalid
              if (isNaN(wordWidth) || wordWidth <= 0) {
                wordWidth = finalFontSize * word.length * 0.5;
              }

              finalWordWidths.push(wordWidth);
              finalTotalWordWidth += wordWidth;
              finalWordGeometries.push(wordGeom);
            } catch (error) {
              console.warn(
                `Error creating geometry for word "${word}":`,
                error
              );
              // Use fallback width
              const fallbackWidth = finalFontSize * word.length * 0.5;
              finalWordWidths.push(fallbackWidth);
              finalTotalWordWidth += fallbackWidth;
              // Don't add geometry if creation failed
            }
          }

          // If no valid geometries were created, skip this line
          if (finalWordGeometries.length === 0) {
            currentY -= lineHeight;
            continue;
          }

          // Step 7: Recalculate spacing if font was scaled (but not if we used an override)
          // Skip recalculation if we used firstLineFontSizeOverride, as spacing was already calculated in Step 5
          const usedOverride =
            isFirstLine &&
            firstLineFontSizeOverride !== undefined &&
            firstLineFontSizeOverride > 0;

          if (finalFontSize !== baseSize && !isLastLine && !usedOverride) {
            const newTotalWidthWithNormalSpacing =
              finalTotalWordWidth + numSpaces * normalSpaceWidth;
            const newRemainingSpace = maxWidth - newTotalWidthWithNormalSpacing;

            if (newRemainingSpace > 0 && numSpaces > 0) {
              const maxExtraSpacePerGap =
                maxAllowedSpaceBetweenWords - normalSpaceWidth;
              const maxTotalExtraSpace = numSpaces * maxExtraSpacePerGap;

              if (newRemainingSpace <= maxTotalExtraSpace) {
                const extraSpacePerGap = newRemainingSpace / numSpaces;
                spaceBetweenWords = normalSpaceWidth + extraSpacePerGap;
              } else {
                spaceBetweenWords = maxAllowedSpaceBetweenWords;
                // If still space remaining, it should be minimal due to scaling
                // Distribute any tiny remaining space
                const finalRemaining =
                  maxWidth -
                  (finalTotalWordWidth +
                    numSpaces * maxAllowedSpaceBetweenWords);
                if (Math.abs(finalRemaining) > 0.001 && numSpaces > 0) {
                  const extraSpacePerGap = finalRemaining / numSpaces;
                  spaceBetweenWords += extraSpacePerGap;
                }
              }
            }
          }

          // Step 8: Position words with justified spacing
          // For last line: left-align only (no right justification)
          // For other lines: full justification (left and right margins)
          let currentX = 0;

          if (isLastLine) {
            // Last line: left-align only, use max spacing
            for (let i = 0; i < words.length; i++) {
              const wordGeom = finalWordGeometries[i].clone();
              wordGeom.translate(currentX, currentY, 0);
              geometries.push(wordGeom);
              if (i < words.length - 1) {
                currentX += finalWordWidths[i] + spaceBetweenWords;
              } else {
                currentX += finalWordWidths[i];
              }
            }
          } else {
            // Other lines: full justification (fill both margins)
            const totalWidthWithSpacing =
              finalTotalWordWidth + numSpaces * spaceBetweenWords;
            const finalRemainingSpace = maxWidth - totalWidthWithSpacing;

            // Distribute any tiny remaining space evenly for perfect justification
            if (Math.abs(finalRemainingSpace) > 0.001 && numSpaces > 0) {
              const extraSpacePerGap = finalRemainingSpace / numSpaces;
              spaceBetweenWords += extraSpacePerGap;
            }

            for (let i = 0; i < words.length; i++) {
              const wordGeom = finalWordGeometries[i].clone();
              wordGeom.translate(currentX, currentY, 0);
              geometries.push(wordGeom);
              if (i < words.length - 1) {
                currentX += finalWordWidths[i] + spaceBetweenWords;
              } else {
                currentX += finalWordWidths[i];
              }
            }
          }

          // Dispose original word geometries
          finalWordGeometries.forEach((geom) => geom.dispose());
        }

        currentY -= lineHeight;
      }

      // Merge all geometries into one
      if (geometries.length === 0) {
        return {
          geometry: new THREE.BufferGeometry(),
          firstLineFontSize: actualFirstLineFontSize,
        };
      }

      if (geometries.length === 1) {
        return {
          geometry: geometries[0],
          firstLineFontSize: actualFirstLineFontSize,
        };
      }

      // Manually merge geometries by combining attributes
      const mergedGeometry = new THREE.BufferGeometry();
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      let indexOffset = 0;
      const indices: number[] = [];

      // Check if all geometries have normals and uvs
      let hasNormals = true;
      let hasUvs = true;
      for (const geom of geometries) {
        if (!geom.attributes.normal) hasNormals = false;
        if (!geom.attributes.uv) hasUvs = false;
      }

      for (const geom of geometries) {
        const pos = geom.attributes.position;
        const norm = geom.attributes.normal;
        const uv = geom.attributes.uv;
        const index = geom.index;

        if (!pos || pos.count === 0) {
          continue; // Skip empty geometries
        }

        const vertexCount = pos.count;

        for (let i = 0; i < vertexCount; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);

          // Validate values are not NaN
          if (isNaN(x) || isNaN(y) || isNaN(z)) {
            console.warn(
              "NaN value detected in geometry position, skipping vertex"
            );
            continue;
          }

          positions.push(x, y, z);

          if (hasNormals && norm) {
            const nx = norm.getX(i);
            const ny = norm.getY(i);
            const nz = norm.getZ(i);
            normals.push(
              isNaN(nx) ? 0 : nx,
              isNaN(ny) ? 0 : ny,
              isNaN(nz) ? 0 : nz
            );
          } else if (hasNormals) {
            // Fill with default normal if missing
            normals.push(0, 0, 1);
          }

          if (hasUvs && uv) {
            const u = uv.getX(i);
            const v = uv.getY(i);
            uvs.push(isNaN(u) ? 0 : u, isNaN(v) ? 0 : v);
          } else if (hasUvs) {
            // Fill with default UV if missing
            uvs.push(0, 0);
          }
        }

        if (index && index.count > 0) {
          // Access index array properly
          const indexArray = index.array;
          for (let i = 0; i < index.count; i++) {
            const idx = indexArray[i];
            if (!isNaN(idx) && idx >= 0 && idx < vertexCount) {
              indices.push(idx + indexOffset);
            }
          }
          indexOffset += vertexCount;
        } else {
          // No index, create sequential indices
          for (let i = 0; i < vertexCount; i++) {
            indices.push(i + indexOffset);
          }
          indexOffset += vertexCount;
        }
      }

      // Validate we have valid data before creating attributes
      if (positions.length === 0) {
        console.warn("No valid positions found, returning empty geometry");
        geometries.forEach((geom) => geom.dispose());
        return {
          geometry: new THREE.BufferGeometry(),
          firstLineFontSize: actualFirstLineFontSize,
        };
      }

      mergedGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );

      if (
        hasNormals &&
        normals.length > 0 &&
        normals.length === positions.length
      ) {
        mergedGeometry.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(normals, 3)
        );
      }

      if (
        hasUvs &&
        uvs.length > 0 &&
        uvs.length === (positions.length / 3) * 2
      ) {
        mergedGeometry.setAttribute(
          "uv",
          new THREE.Float32BufferAttribute(uvs, 2)
        );
      }

      if (indices.length > 0) {
        mergedGeometry.setIndex(indices);
      }

      // Dispose individual geometries after merging
      geometries.forEach((geom) => geom.dispose());

      // Compute bounding box for the merged geometry
      try {
        mergedGeometry.computeBoundingBox();
      } catch (error) {
        console.warn("Failed to compute bounding box:", error);
        // Set a default bounding box to prevent errors
        mergedGeometry.boundingBox = new THREE.Box3(
          new THREE.Vector3(-1, -1, -1),
          new THREE.Vector3(1, 1, 1)
        );
      }

      return {
        geometry: mergedGeometry,
        firstLineFontSize: actualFirstLineFontSize,
      };
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
        // Keep current value for <600px: portalWidthCss = viewportWidthCss / 3
        const baseBlockWidth = viewportWidthCss;
        portalWidthCss = baseBlockWidth / 3;
        columnWidthCss = baseBlockWidth / 9;
        portalHeightCss = Math.min(
          viewportHeightCss * MOBILE_HEIGHT_RATIO,
          screenHeight / 2
        );
      } else if (aspectRatio <= 1) {
        // Portrait/square: implement transition between min (600px) and max widths
        // Same transition logic as landscape mode
        const minViewportWidth = 600;
        const maxViewportWidth = 1920; // Reference width for maximum portal size

        // Calculate portal widths at endpoints
        const minPortalWidth = minViewportWidth / 3; // 200px at 600px (current <600px value)
        const maxPortalWidth = maxViewportWidth / 2 / 3; // 320px at 1920px (current highest value)

        let interpolatedPortalWidth: number;

        if (viewportWidthCss <= maxViewportWidth) {
          // Within transition range: interpolate between min and max
          const clampedViewport = Math.max(minViewportWidth, viewportWidthCss);
          const transitionFactor =
            (clampedViewport - minViewportWidth) /
            (maxViewportWidth - minViewportWidth);
          interpolatedPortalWidth =
            minPortalWidth +
            (maxPortalWidth - minPortalWidth) * transitionFactor;
        } else {
          // Beyond max width: use current calculation (allows growth beyond reference)
          const baseBlockWidthBeyond = Math.min(
            viewportWidthCss,
            screenWidth / 2
          );
          interpolatedPortalWidth = baseBlockWidthBeyond / 3;
        }

        // Calculate base block width from interpolated portal width
        const baseBlockWidth = interpolatedPortalWidth * 3;

        portalWidthCss = interpolatedPortalWidth;
        columnWidthCss = baseBlockWidth / 9;
        portalHeightCss = Math.min(viewportHeightCss / 2, screenHeight / 2);
      } else {
        // Landscape mode: implement transition between min (600px) and max widths
        // Current highest value: at large screens (e.g., 1920px), portal width = 1920/2/3 = 320px
        // Current <600px value: portal width = 600/3 = 200px

        // Fixed values for transition endpoints
        const minViewportWidth = 600;
        const maxViewportWidth = 1920; // Reference width for maximum portal size

        // Calculate portal widths at endpoints
        const minPortalWidth = minViewportWidth / 3; // 200px at 600px (current <600px value)

        // Calculate the maximum portal width at 1920px
        // This should be the value that results after all calculations and scaling
        // At 1920px, using current highest value calculation: (1920/2)/3 = 320px
        // But we need to account for scaling that happens after interpolation
        // So we calculate what interpolated value would result in the desired final value

        // At 1920px with current logic: baseBlock = 1920/2 = 960, portalWidth = 960/3 = 320
        // After scaling check: if 320*2 + 106.67*2 + 136.67 > 1920, it gets scaled
        // Checking: 640 + 213.33 + 136.67 = 990 < 1920, so no scaling needed
        // So maxPortalWidth should be 320px
        const maxPortalWidth = maxViewportWidth / 2 / 6; // 320px at 1920px (current highest value)

        // Interpolate portal width based on viewport width
        let interpolatedPortalWidth: number;

        if (viewportWidthCss <= maxViewportWidth) {
          // Within transition range: interpolate between min and max
          // This interpolation should result in portals reaching maxPortalWidth at maxViewportWidth
          const clampedViewport = Math.max(minViewportWidth, viewportWidthCss);
          const transitionFactor =
            (clampedViewport - minViewportWidth) /
            (maxViewportWidth - minViewportWidth);
          interpolatedPortalWidth =
            minPortalWidth +
            (maxPortalWidth - minPortalWidth) * transitionFactor;
        } else {
          // Beyond max width: use current calculation (allows growth beyond reference)
          const baseBlockWidthBeyond = Math.min(
            viewportWidthCss,
            screenWidth / 2
          );
          interpolatedPortalWidth = baseBlockWidthBeyond / 3;
        }

        // Calculate base block width from interpolated portal width
        const baseBlockWidth = interpolatedPortalWidth * 3;

        portalWidthCss = interpolatedPortalWidth;
        columnWidthCss = baseBlockWidth / 9;
        portalHeightCss = Math.min(viewportHeightCss / 2, screenHeight / 2);

        // Apply scaling if needed (this happens after interpolation)
        // The scaling will reduce portal size if total width exceeds viewport
        const baselineMiddleColumnCss = columnWidthCss + middleColumnExtraCss;
        const requiredWidthBaseline =
          portalWidthCss * 2 + columnWidthCss * 2 + baselineMiddleColumnCss;
        if (requiredWidthBaseline > viewportWidthCss) {
          const scale = viewportWidthCss / requiredWidthBaseline;
          portalWidthCss *= scale;
          columnWidthCss *= scale;
          middleColumnExtraCss *= scale;
        }

        // Ensure portals reach maxPortalWidth at maxViewportWidth
        // At 1920px, interpolatedPortalWidth should be 320px and it should fit (990px < 1920px)
        // If we're at or near maxViewportWidth and portals are below target, adjust
        if (
          viewportWidthCss >= maxViewportWidth * 0.98 &&
          viewportWidthCss <= maxViewportWidth * 1.02
        ) {
          // Very close to maxViewportWidth - ensure we reach the target
          const requiredWidthAtTarget =
            maxPortalWidth * 2 +
            ((maxPortalWidth * 3) / 9) * 2 +
            ((maxPortalWidth * 3) / 9 + middleColumnExtraCss);

          // Only adjust if target fits and current is below target
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

      leftPortal.uniforms.uBrushOuterScale.value = portalBrushOuterScalar * 1.5;
      rightPortal.uniforms.uBrushOuterScale.value =
        portalBrushOuterScalar * 1.5;

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
        } else if (viewportWidthCss < 600 && viewportWidthCss > 400) {
          targetTextSize = 0.27;
        } else {
          targetTextSize = 0.2;
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

      // Update column text positions and sizes
      // Text goes in Left Outer Column (red) and Right Outer Column (blue)
      if (columnTexts.length >= 2) {
        const leftTextMesh = columnTexts[0];
        const rightTextMesh = columnTexts[1];

        // Layout: [Left Outer][Left Portal][Middle][Right Portal][Right Outer]
        // Left text goes in Left Outer Column (red)
        // Right text goes in Right Outer Column (blue)

        // Position text beside portals (at portal Y level)
        const textZ = -8;

        // Calculate frustum for text position (at textZ depth) - MUST match text position calculation
        const textDistance = Math.abs(camera.position.z - textZ);
        const textVfov = (camera.fov * Math.PI) / 180;
        const frustumHeightAtText = 2 * textDistance * Math.tan(textVfov / 2);
        const frustumWidthAtText = frustumHeightAtText * camera.aspect;

        // Convert column boundaries from CSS to world space using text frustum
        const toWorldText = (css: number) =>
          (css / viewportWidthCss - 0.5) * frustumWidthAtText;

        // Get visible frustum boundaries in world space at text depth
        const frustumLeftEdgeWorldText = -frustumWidthAtText / 2;
        const frustumRightEdgeWorldText = frustumWidthAtText / 2;

        // Calculate column boundaries in CSS
        // Layout: [Left Outer][Left Portal][Middle][Right Portal][Right Outer]
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

        // Get column boundaries in world space at text depth, clamped to visible frustum
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

        // Calculate actual column widths in world space at text depth
        const leftOuterWidthWorldText =
          leftOuterRightWorldText - leftOuterLeftWorldText;
        const rightOuterWidthWorldText =
          rightOuterRightWorldText - rightOuterLeftWorldText;

        // Use the same width for both texts to ensure matching justification
        // Use the minimum width to ensure both fit, or use left width for consistency
        const commonColumnWidth = Math.min(
          leftOuterWidthWorldText,
          rightOuterWidthWorldText
        );

        const textY = -1.4; // Increased from -1.6 to move texts higher (less negative = higher position)

        // Determine text size based on screen width
        // Text only renders at 900px and above, sharply disappears below 900px
        let columnTextSize: number;
        if (viewportWidthCss >= 900) {
          columnTextSize = 0.2;
        } else {
          columnTextSize = 0.0; // No rendering below 900px
        }

        // Padding from column edges (10% on each side = 20% total padding)
        // Add extra margin for shader distortion effects
        const paddingRatio = 0.1;
        const distortionMargin = 0.05; // Extra margin for wavy text distortion
        const effectivePaddingRatio = paddingRatio + distortionMargin;

        // Calculate available width for text wrapping - use same width for both
        const commonMaxAllowedWidthForWrap =
          commonColumnWidth * (1 - 2 * effectivePaddingRatio);
        const leftMaxAllowedWidthForWrap = commonMaxAllowedWidthForWrap;
        const rightMaxAllowedWidthForWrap = commonMaxAllowedWidthForWrap;

        // Skip text rendering if columnTextSize is 0 (viewport width < 900px)
        if (columnTextSize <= 0) {
          // Hide text meshes by setting scale to 0
          leftTextMesh.scale.setScalar(0);
          rightTextMesh.scale.setScalar(0);
          // Skip geometry creation and positioning
        } else if (columnTextFont) {
          // Get original text
          const leftOriginalText =
            leftTextMesh.userData.originalText || leftColumnText;
          const rightOriginalText =
            rightTextMesh.userData.originalText || rightColumnText;

          // Wrap text based on available width
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

          // Store current text to check if we need to recreate geometry
          const leftCurrentText = leftTextMesh.userData.currentWrappedText;
          const rightCurrentText = rightTextMesh.userData.currentWrappedText;

          // Recreate geometry if text changed
          let leftFirstLineFontSize: number | undefined = undefined;

          // Always ensure we have the left text's first line font size
          // If geometry needs to be recreated, we'll get it from the result
          // Otherwise, try to get it from stored userData
          if (leftCurrentText !== leftWrappedText) {
            leftTextMesh.geometry.dispose();
            // Calculate line height (typically 1.2-1.5 times font size)
            const lineHeight = columnTextSize * 1.5; // Increased from 1.3 to 1.5 for more spacing between lines
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
            // Store first line font size for right text
            leftFirstLineFontSize = result.firstLineFontSize;
            leftTextMesh.userData.firstLineFontSize = result.firstLineFontSize;
            console.log(
              "Left text first line font size calculated:",
              leftFirstLineFontSize,
              "base size:",
              columnTextSize
            );
          } else {
            // If geometry wasn't recreated, try to get stored first line font size
            leftFirstLineFontSize = leftTextMesh.userData.firstLineFontSize;

            // If we don't have it stored, we need to calculate it
            // This can happen if the geometry was created before we added this feature
            if (
              leftFirstLineFontSize === undefined ||
              leftFirstLineFontSize <= 0
            ) {
              // Recalculate to get the first line font size
              const lineHeight = columnTextSize * 1.5; // Increased from 1.3 to 1.5 for more spacing between lines
              const tempResult = createJustifiedTextGeometry(
                leftWrappedText,
                columnTextFont,
                columnTextSize,
                leftMaxAllowedWidthForWrap,
                lineHeight
              );
              leftFirstLineFontSize = tempResult.firstLineFontSize;
              leftTextMesh.userData.firstLineFontSize = leftFirstLineFontSize;
              // Dispose the temporary geometry since we already have the real one
              tempResult.geometry.dispose();
            }
          }

          // Always recreate right text if left text changed OR right text changed
          // This ensures right text always uses the correct left text first line font size
          const shouldRecreateRightText =
            rightCurrentText !== rightWrappedText ||
            leftCurrentText !== leftWrappedText ||
            rightTextMesh.userData.firstLineFontSize !== leftFirstLineFontSize;

          if (shouldRecreateRightText) {
            rightTextMesh.geometry.dispose();
            // Calculate line height (typically 1.2-1.5 times font size)
            const lineHeight = columnTextSize * 1.5; // Increased from 1.3 to 1.5 for more spacing between lines

            // Calculate font size for right text's first line to fill entire width
            let rightFirstLineFontSize: number | undefined = undefined;

            // Get the first line of the right text
            const rightFirstLine = rightWrappedText.split("\n")[0]?.trim();
            if (rightFirstLine && columnTextFont) {
              // Binary search or iterative approach to find font size that fills width
              // Start with a reasonable range
              let minSize = columnTextSize * 0.5;
              let maxSize = columnTextSize * 3.0;
              let targetSize = columnTextSize;
              const tolerance = 0.001; // 0.1% tolerance
              const maxIterations = 20;

              for (let iter = 0; iter < maxIterations; iter++) {
                // Test current size
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
                    break; // Can't calculate, use fallback
                  }

                  const ratio = rightMaxAllowedWidthForWrap / lineWidth;

                  // Check if we're close enough
                  if (Math.abs(ratio - 1.0) < tolerance) {
                    rightFirstLineFontSize = targetSize;
                    break;
                  }

                  // Adjust size based on ratio
                  if (ratio < 1.0) {
                    // Line is too wide, reduce size
                    maxSize = targetSize;
                    targetSize = (minSize + maxSize) / 2;
                  } else {
                    // Line is too narrow, increase size
                    minSize = targetSize;
                    targetSize = (minSize + maxSize) / 2;
                  }

                  // Update rightFirstLineFontSize with current best guess
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

            // Fallback to base size if calculation failed
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
              rightFirstLineFontSize // Use calculated font size to fill width
            );
            result.geometry.computeBoundingBox();
            rightTextMesh.geometry = result.geometry;
            rightTextMesh.userData.currentWrappedText = rightWrappedText;
            // Store first line font size for reference
            rightTextMesh.userData.firstLineFontSize = result.firstLineFontSize;

            console.log(
              "Right text first line font size result:",
              result.firstLineFontSize
            );
          }
        }

        // Only position and scale texts if they should be visible (columnTextSize > 0)
        if (columnTextSize > 0) {
          // Get text geometry bounding boxes
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

          // Use common width for both texts to ensure matching justification
          const commonMaxAllowedWidth =
            commonColumnWidth * (1 - 2 * effectivePaddingRatio);
          const leftMaxAllowedWidth = commonMaxAllowedWidth;
          const rightMaxAllowedWidth = commonMaxAllowedWidth;

          // Calculate scale: ensure text fits within column boundaries
          // Geometry is already created at columnTextSize, so base width is already correct
          // Only scale down if text still doesn't fit after wrapping
          const leftTextScale = Math.min(
            1.0, // Geometry is already at columnTextSize, no scaling needed
            leftMaxAllowedWidth / Math.max(leftTextBaseWidth, 1e-6) // Width constraint - scale down if needed
          );
          const rightTextScale = Math.min(
            1.0, // Geometry is already at columnTextSize, no scaling needed
            rightMaxAllowedWidth / Math.max(rightTextBaseWidth, 1e-6) // Width constraint - scale down if needed
          );

          // Calculate actual text width after scaling (base width only)
          const leftTextActualWidth = leftTextBaseWidth * leftTextScale;
          const rightTextActualWidth = rightTextBaseWidth * rightTextScale;

          // Position texts with proper alignment within columns

          // Calculate safe text boundaries within each column
          // Left text must stay strictly within left outer column: [leftOuterLeftWorldText, leftOuterRightWorldText]
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

          // Right text must stay strictly within right outer column: [rightOuterLeftWorldText, rightOuterRightWorldText]
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

          // Ensure text fits within available space
          const leftTextAvailableWidth = leftTextMaxX - leftTextMinX;
          const rightTextAvailableWidth = rightTextMaxX - rightTextMinX;

          // If text doesn't fit, reduce scale further
          let finalLeftTextScale = leftTextScale;
          let finalRightTextScale = rightTextScale;

          if (leftTextActualWidth > leftTextAvailableWidth) {
            finalLeftTextScale = leftTextAvailableWidth / leftTextBaseWidth;
          }
          if (rightTextActualWidth > rightTextAvailableWidth) {
            finalRightTextScale = rightTextAvailableWidth / rightTextBaseWidth;
          }

          // Recalculate actual widths with final scale
          const finalLeftTextWidth = leftTextBaseWidth * finalLeftTextScale;
          const finalRightTextWidth = rightTextBaseWidth * finalRightTextScale;

          // Position justified texts at left edge of their columns
          // The justified geometry starts at x=0 and fills the width
          // For left text: first line is right-aligned, other lines are justified from left
          // For right text: all lines are justified from left
          const leftTextX = leftTextMinX;
          const rightTextX = rightTextMinX;

          // Update left column text - justified, first line right-aligned
          leftTextMesh.position.set(leftTextX, textY, textZ);
          leftTextMesh.scale.setScalar(finalLeftTextScale);
          // Store target position and scale for scroll animation
          leftTextMesh.userData.targetX = leftTextX;
          leftTextMesh.userData.targetY = textY;
          leftTextMesh.userData.targetZ = textZ;
          leftTextMesh.userData.finalScale = finalLeftTextScale;

          // Update right column text - justified
          rightTextMesh.position.set(rightTextX, textY, textZ);
          rightTextMesh.scale.setScalar(finalRightTextScale);
          // Store target position and scale for scroll animation
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

      updateSpiralCenters();
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

      updateSpiralCenters();

      leftPortal.uniforms.uTime.value = elapsed;
      rightPortal.uniforms.uTime.value = elapsed * 1.05;
      if (spiral) spiral.update(elapsed);

      // Update spiral background with side text positions for obstacle effect
      if (spiral && columnTexts.length >= 2) {
        const leftTextMesh = columnTexts[0];
        const rightTextMesh = columnTexts[1];
        const leftTextPos = new THREE.Vector2();
        const rightTextPos = new THREE.Vector2();
        const leftTextSize = new THREE.Vector2();
        const rightTextSize = new THREE.Vector2();

        // Helper function to calculate text center position and dimensions in screen UV space
        // Uses the actual mesh position and bounding box to get accurate screen coordinates
        const calculateTextBounds = (
          mesh: THREE.Mesh
        ): { center: THREE.Vector2; size: THREE.Vector2 } => {
          if (!mesh.geometry) {
            return {
              center: new THREE.Vector2(-1.0, 0.5),
              size: new THREE.Vector2(0, 0),
            };
          }

          // Ensure bounding box is computed
          if (!mesh.geometry.boundingBox) {
            mesh.geometry.computeBoundingBox();
          }

          const bbox = mesh.geometry.boundingBox!;

          // Ensure mesh matrixWorld is updated
          mesh.updateMatrixWorld(true);

          // Get the mesh's world position (like projectObjectToScreenUv does)
          const meshWorldPos = new THREE.Vector3();
          mesh.getWorldPosition(meshWorldPos);

          // Project mesh position to screen UV (this is the reference point)
          const meshScreenPos = meshWorldPos.clone();
          meshScreenPos.project(camera);
          const meshScreenUV = new THREE.Vector2(
            0.5 * (meshScreenPos.x + 1.0),
            0.5 * (1.0 - meshScreenPos.y)
          );

          // Use the center z of the bounding box (text depth)
          const centerZ = (bbox.min.z + bbox.max.z) * 0.5;
          const corners = [
            new THREE.Vector3(bbox.min.x, bbox.min.y, centerZ),
            new THREE.Vector3(bbox.max.x, bbox.min.y, centerZ),
            new THREE.Vector3(bbox.min.x, bbox.max.y, centerZ),
            new THREE.Vector3(bbox.max.x, bbox.max.y, centerZ),
          ];

          // Transform corners to world space using mesh's world matrix
          const worldCorners = corners.map((corner) => {
            const worldCorner = corner.clone();
            worldCorner.applyMatrix4(mesh.matrixWorld);
            return worldCorner;
          });

          // Project all corners to screen UV space
          // IMPORTANT: Match the shader's coordinate system
          // The shader uses: uv = gl_FragCoord.xy / uResolution
          // gl_FragCoord has (0,0) at bottom-left, so uv has Y=0 at bottom, Y=1 at top
          // Three.js project() gives NDC where y=-1 is top, y=1 is bottom
          // So we need to flip Y to match gl_FragCoord: Y=0 at bottom, Y=1 at top
          const screenCorners = worldCorners.map((corner) => {
            const worldPos = corner.clone();
            worldPos.project(camera);
            // Convert from NDC (-1 to 1) to screen UV (0 to 1)
            // NDC: x=-1 (left) to x=1 (right), y=-1 (top) to y=1 (bottom) in Three.js
            // UV (gl_FragCoord): x=0 (left) to x=1 (right), y=0 (bottom) to y=1 (top)
            // So: x = (ndc.x + 1) * 0.5, y = 1.0 - (ndc.y + 1) * 0.5 (FLIP Y!)
            // Use the same formula as projectObjectToScreenUv for consistency
            return new THREE.Vector2(
              0.5 * (worldPos.x + 1.0),
              0.5 * (1.0 - worldPos.y) // Same as projectObjectToScreenUv
            );
          });

          // Find min/max in screen space
          // This gives us the actual visual bounds of the text in screen space
          let minX = screenCorners[0].x;
          let maxX = screenCorners[0].x;
          let minY = screenCorners[0].y;
          let maxY = screenCorners[0].y;

          screenCorners.forEach((corner) => {
            minX = Math.min(minX, corner.x);
            maxX = Math.max(maxX, corner.x);
            minY = Math.min(minY, corner.y);
            maxY = Math.max(maxY, corner.y);
          });

          // Calculate center from the min/max of projected corners
          // This ensures the center matches the exact visual center in screen space
          // accounting for any perspective distortion
          const size = new THREE.Vector2(maxX - minX, maxY - minY);

          // Calculate center from min/max of projected corners
          // This gives us the visual center of the bounding box in screen space
          const centerX = (minX + maxX) * 0.5;
          const centerY = (minY + maxY) * 0.5;
          const textHeight = maxY - minY;

          // Calculate center - use the exact center from projected corners
          // Note: In the shader, uv.y has Y=0 at bottom, Y=1 at top (from gl_FragCoord)
          // But projectObjectToScreenUv flips Y, so we need to match that
          // If obstacles appear above text, we need to DECREASE Y (move toward bottom)
          // Since projectObjectToScreenUv: y = 0.5 * (1.0 - ndc.y), where ndc.y=-1 is bottom, ndc.y=1 is top
          // This gives: bottom (ndc=-1) -> UV y=1, top (ndc=1) -> UV y=0
          // So in the UV space from projectObjectToScreenUv: Y=0 is top, Y=1 is bottom
          // But the shader uses gl_FragCoord which has Y=0 at bottom, Y=1 at top
          // So there's a mismatch! We need to flip Y again to match the shader
          const center = new THREE.Vector2(
            centerX,
            1.0 - centerY // Flip Y to match shader coordinate system (Y=0 at bottom, Y=1 at top)
          );

          return { center, size };
        };

        // Check if left text is visible and has a valid position
        if (
          leftTextMesh.userData.targetX !== undefined &&
          leftTextMesh.scale.x > 0.01 &&
          leftTextMesh.geometry
        ) {
          // Calculate center position and size from bounding box
          const leftBounds = calculateTextBounds(leftTextMesh);

          // Use the center calculated from projected corners (most accurate)
          leftTextPos.copy(leftBounds.center);
          leftTextSize.copy(leftBounds.size);
        } else {
          leftTextPos.set(-1.0, 0.5); // Hide obstacle
          leftTextSize.set(0.0, 0.0);
        }

        // Check if right text is visible and has a valid position
        if (
          rightTextMesh.userData.targetX !== undefined &&
          rightTextMesh.scale.x > 0.01 &&
          rightTextMesh.geometry
        ) {
          // Calculate center position and size from bounding box
          const rightBounds = calculateTextBounds(rightTextMesh);

          // Use the center calculated from projected corners (most accurate)
          rightTextPos.copy(rightBounds.center);
          rightTextSize.copy(rightBounds.size);
        } else {
          rightTextPos.set(-1.0, 0.5); // Hide obstacle
          rightTextSize.set(0.0, 0.0);
        }

        // Update spiral background with side text positions and actual dimensions
        if (spiral.updateSideTextPositions) {
          spiral.updateSideTextPositions(
            leftTextPos.x >= 0 ? leftTextPos : null,
            rightTextPos.x >= 0 ? rightTextPos : null,
            leftTextSize.x > 0 && leftTextSize.y > 0 ? leftTextSize : null,
            rightTextSize.x > 0 && rightTextSize.y > 0 ? rightTextSize : null
          );
        }

        // Ensure edge angles are updated immediately whenever positions are updated
        // This prevents delay between obstacle movement and text movement
        // Edge angles are updated directly via uniforms, so we just need to ensure they're synced
        if (spiral.material?.uniforms) {
          // Force uniform update by accessing the values
          // This ensures shader receives the latest values immediately
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

      // Update column text uniforms to sync with spiral
      columnTexts.forEach((textMesh) => {
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
            if (uniforms.uSpeed && spiralUniforms.uSpeed) {
              uniforms.uSpeed.value = spiralUniforms.uSpeed.value;
            }
            if (uniforms.uBands && spiralUniforms.uBands) {
              uniforms.uBands.value = spiralUniforms.uBands.value;
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
        // Update wavy text and column text positions and sizes after all fonts are loaded
        if (wavyTexts.length > 0 || columnTexts.length > 0) {
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

        // Helper function to reset scroll trigger state
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
            if ((spiral.material.uniforms as any).uScrollFade) {
              (spiral.material.uniforms as any).uScrollFade.value = 1.0;
            }
          }
          // Hide side texts initially - position them off-screen and scale to 0
          if (columnTexts.length >= 2) {
            const leftTextMesh = columnTexts[0];
            const rightTextMesh = columnTexts[1];

            // Calculate off-screen positions
            const textZ =
              leftTextMesh.userData.targetZ || leftTextMesh.position.z || 0;
            const aspect = camera.aspect;
            const fov = camera.fov * (Math.PI / 180);
            const heightAtDepth =
              2 * Math.tan(fov / 2) * Math.abs(camera.position.z - textZ);
            const widthAtDepth = heightAtDepth * aspect;
            const leftFrustumEdge = -widthAtDepth / 2;
            const rightFrustumEdge = widthAtDepth / 2;
            const offScreenOffset = 15;

            // Position off-screen and scale to 0
            if (leftTextMesh.userData.targetX !== undefined) {
              leftTextMesh.position.x = leftFrustumEdge - offScreenOffset;
              leftTextMesh.position.y = leftTextMesh.userData.targetY || 0;
              leftTextMesh.position.z = leftTextMesh.userData.targetZ || 0;
            }
            if (rightTextMesh.userData.targetX !== undefined) {
              rightTextMesh.position.x = rightFrustumEdge + offScreenOffset;
              rightTextMesh.position.y = rightTextMesh.userData.targetY || 0;
              rightTextMesh.position.z = rightTextMesh.userData.targetZ || 0;
            }
            // Scale to 0 to hide them
            leftTextMesh.scale.setScalar(0);
            rightTextMesh.scale.setScalar(0);
          }
        };

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
            onEnter: resetScrollTriggerState,
            onLeaveBack: resetScrollTriggerState,
            onUpdate: (self) => {
              const progress = Math.max(0, Math.min(1, self.progress)); // Clamp progress between 0 and 1

              // Force complete reset when at the very beginning
              if (progress === 0 || progress < 0.001) {
                resetScrollTriggerState();
                return; // Early return to avoid unnecessary calculations
              }

              // Smoothly fade out the gradient as soon as scrolling starts
              if (spiral?.material?.uniforms) {
                const su = spiral.material.uniforms as any;
                if (su.uScrollFade) {
                  // Fade to 0 over first ~10% of scroll; ease with smoothstep
                  const startFade = 0.0;
                  const endFade = 0.1;
                  const k = Math.max(
                    0,
                    Math.min(
                      1,
                      (progress - startFade) /
                        Math.max(endFade - startFade, 1e-6)
                    )
                  );
                  const eased = k * k * (3.0 - 2.0 * k); // smoothstep
                  su.uScrollFade.value = 1.0 - eased;
                }
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

              // ============================================
              // STEP 4: Side texts animation (synchronized with scale down)
              // ============================================
              // Side texts animate in during the same timeline as farsi/english texts scale down
              // scaleProgress starts at progress 0.4 and goes from 0 to 1 as progress goes from 0.4 to 1.0
              if (columnTexts.length >= 2 && scaleProgress > 0) {
                const leftTextMesh = columnTexts[0];
                const rightTextMesh = columnTexts[1];

                // Only animate if texts have target positions stored (they should be visible)
                const shouldAnimateLeft =
                  leftTextMesh.userData.targetX !== undefined;
                const shouldAnimateRight =
                  rightTextMesh.userData.targetX !== undefined;

                if (shouldAnimateLeft || shouldAnimateRight) {
                  // Use scaleProgress directly - it goes from 0 to 1 during the scale down phase
                  // This synchronizes side text animation with farsi/english text scale down
                  const sideTextProgress = scaleProgress;
                  // Use easing for smooth animation
                  const easedProgress =
                    sideTextProgress *
                    sideTextProgress *
                    (3.0 - 2.0 * sideTextProgress); // smoothstep

                  // Store target positions if not already stored
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

                  // Calculate off-screen positions using camera frustum
                  const frustum = new THREE.Frustum();
                  const matrix = new THREE.Matrix4().multiplyMatrices(
                    camera.projectionMatrix,
                    camera.matrixWorldInverse
                  );
                  frustum.setFromProjectionMatrix(matrix);

                  // Get frustum bounds at text depth
                  // Use a large offset to ensure they're completely off-screen
                  const offScreenOffset = 15; // World units

                  // Calculate world space positions at text depth (z = textZ)
                  // Approximate frustum edges at text depth
                  const textZ =
                    leftTextMesh.userData.targetZ || leftTextMesh.position.z;
                  const aspect = camera.aspect;
                  const fov = camera.fov * (Math.PI / 180);
                  const heightAtDepth =
                    2 * Math.tan(fov / 2) * Math.abs(camera.position.z - textZ);
                  const widthAtDepth = heightAtDepth * aspect;

                  const leftFrustumEdge = -widthAtDepth / 2;
                  const rightFrustumEdge = widthAtDepth / 2;

                  const leftStartX = leftFrustumEdge - offScreenOffset;
                  const rightStartX = rightFrustumEdge + offScreenOffset;

                  // Animate left text from left side
                  if (shouldAnimateLeft) {
                    leftTextMesh.position.x =
                      leftStartX +
                      (leftTextMesh.userData.targetX - leftStartX) *
                        easedProgress;
                    leftTextMesh.position.y = leftTextMesh.userData.targetY;
                    leftTextMesh.position.z = leftTextMesh.userData.targetZ;
                    // Animate scale from 0 to finalScale
                    if (leftTextMesh.userData.finalScale !== undefined) {
                      leftTextMesh.scale.setScalar(
                        leftTextMesh.userData.finalScale * easedProgress
                      );
                    }
                  }

                  // Animate right text from right side
                  if (shouldAnimateRight) {
                    rightTextMesh.position.x =
                      rightStartX +
                      (rightTextMesh.userData.targetX - rightStartX) *
                        easedProgress;
                    rightTextMesh.position.y = rightTextMesh.userData.targetY;
                    rightTextMesh.position.z = rightTextMesh.userData.targetZ;
                    // Animate scale from 0 to finalScale
                    if (rightTextMesh.userData.finalScale !== undefined) {
                      rightTextMesh.scale.setScalar(
                        rightTextMesh.userData.finalScale * easedProgress
                      );
                    }
                  }
                }
              } else if (columnTexts.length >= 2 && scaleProgress === 0) {
                // Keep side texts off-screen and hidden before scale down phase starts
                const leftTextMesh = columnTexts[0];
                const rightTextMesh = columnTexts[1];

                // Store target positions if not already stored (from updateSizing)
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

                // Calculate off-screen positions
                const textZ =
                  leftTextMesh.userData.targetZ || leftTextMesh.position.z || 0;
                const aspect = camera.aspect;
                const fov = camera.fov * (Math.PI / 180);
                const heightAtDepth =
                  2 * Math.tan(fov / 2) * Math.abs(camera.position.z - textZ);
                const widthAtDepth = heightAtDepth * aspect;

                const leftFrustumEdge = -widthAtDepth / 2;
                const rightFrustumEdge = widthAtDepth / 2;
                const offScreenOffset = 15;

                if (
                  leftTextMesh &&
                  leftTextMesh.userData.targetX !== undefined
                ) {
                  leftTextMesh.position.x = leftFrustumEdge - offScreenOffset;
                  leftTextMesh.position.y = leftTextMesh.userData.targetY || 0;
                  leftTextMesh.position.z = leftTextMesh.userData.targetZ || 0;
                  leftTextMesh.scale.setScalar(0); // Hide text
                }
                if (
                  rightTextMesh &&
                  rightTextMesh.userData.targetX !== undefined
                ) {
                  rightTextMesh.position.x = rightFrustumEdge + offScreenOffset;
                  rightTextMesh.position.y =
                    rightTextMesh.userData.targetY || 0;
                  rightTextMesh.position.z =
                    rightTextMesh.userData.targetZ || 0;
                  rightTextMesh.scale.setScalar(0); // Hide text
                }
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

        // After updateSizing sets target positions, hide side texts initially
        // They will animate in during scroll when scaleProgress > 0
        if (columnTexts.length >= 2) {
          const leftTextMesh = columnTexts[0];
          const rightTextMesh = columnTexts[1];

          // Calculate off-screen positions
          const textZ =
            leftTextMesh.userData.targetZ || leftTextMesh.position.z || 0;
          const aspect = camera.aspect;
          const fov = camera.fov * (Math.PI / 180);
          const heightAtDepth =
            2 * Math.tan(fov / 2) * Math.abs(camera.position.z - textZ);
          const widthAtDepth = heightAtDepth * aspect;
          const leftFrustumEdge = -widthAtDepth / 2;
          const rightFrustumEdge = widthAtDepth / 2;
          const offScreenOffset = 15;

          // Position off-screen and scale to 0
          if (leftTextMesh.userData.targetX !== undefined) {
            leftTextMesh.position.x = leftFrustumEdge - offScreenOffset;
            leftTextMesh.position.y = leftTextMesh.userData.targetY || 0;
            leftTextMesh.position.z = leftTextMesh.userData.targetZ || 0;
            leftTextMesh.scale.setScalar(0);
          }
          if (rightTextMesh.userData.targetX !== undefined) {
            rightTextMesh.position.x = rightFrustumEdge + offScreenOffset;
            rightTextMesh.position.y = rightTextMesh.userData.targetY || 0;
            rightTextMesh.position.z = rightTextMesh.userData.targetZ || 0;
            rightTextMesh.scale.setScalar(0);
          }
        }
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
