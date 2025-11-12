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

    Promise.all([loadEnglish(), loadFarsi()])
      .catch((err) => {
        console.error("Error loading texts", err);
      })
      .finally(() => {
        textScrollTriggersRef.current.forEach((trigger) => trigger.kill());
        textScrollTriggersRef.current = [];

        const english = englishMesh ?? null;
        const farsi = farsiMesh ?? null;

        if (english) {
          gsap.set(english.scale, { x: 1, y: 1, z: 1 });
        }
        if (farsi) {
          gsap.set(farsi.scale, { x: 1, y: 1, z: 1 });
        }

        if (english || farsi) {
          const trigger = ScrollTrigger.create({
            trigger: mount,
            start: "top top",
            end: () =>
              `+=${Math.max(mount.clientHeight, window.innerHeight || 1000)}`,
            scrub: true,
            pin: true,
            pinSpacing: true,
            onUpdate: (self) => {
              const scale = Math.max(0, 1 - self.progress);
              if (english) english.scale.setScalar(scale);
              if (farsi) farsi.scale.setScalar(scale);
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
