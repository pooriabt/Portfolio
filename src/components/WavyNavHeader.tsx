"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { gsap } from "gsap";

type NavItem = {
  label: string;
  route: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "HOME", route: "/" },
  { label: "ABOUT", route: "/about" },
  { label: "CONTACTS", route: "/contacts" },
  { label: "RESUME", route: "/resume" },
];

// Base values matching home page (from useDoorSceneSetup.ts)
const BASE_TEXT_SIZE = 0.5;
const BASE_TEXT_POSITIONS = [
  { x: -6.9, y: 3.9, z: -8 },
  { x: -2.3, y: 3.9, z: -8 },
  { x: 2.3, y: 3.9, z: -8 },
  { x: 6.9, y: 3.9, z: -8 },
];
const BASE_VIEWPORT_WIDTH = 1920;
const BASE_VIEWPORT_HEIGHT = 1080;

export default function WavyNavHeader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const rafRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock | null>(null);
  const pathname = usePathname();

  // Calculate target text size based on viewport (matching sizingCalculations.ts)
  const getTargetTextSize = useCallback((viewportWidth: number) => {
    if (viewportWidth >= 900) {
      return 0.3;
    } else if (viewportWidth > 600 && viewportWidth < 900) {
      return 0.23;
    } else if (viewportWidth < 600 && viewportWidth > 400) {
      return 0.17;
    } else {
      return 0.11;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Match home page camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const clock = new THREE.Clock();
    clockRef.current = clock;

    const loader = new FontLoader();
    loader.load("/assets/fonts/montserrat black_regular.json", (font) => {
      NAV_ITEMS.forEach((item, index) => {
        const geometry = new TextGeometry(item.label, {
          font: font,
          size: BASE_TEXT_SIZE,
          depth: 0.02,
          curveSegments: 12,
          bevelEnabled: false,
        });

        geometry.computeBoundingBox();
        const centerOffset = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
        geometry.translate(-centerOffset / 2, 0, 0);

        const uniforms = {
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(width, height) },
          uCenter0: { value: new THREE.Vector2(0.25, 0.5) },
          uCenter1: { value: new THREE.Vector2(0.75, 0.5) },
          uSpeed: { value: 0.7 },
          uBands: { value: 20.0 },
          uColor: { value: new THREE.Color("#ff00ff") },
          uDistortionStrength: { value: 0.04 },
          uRippleIntensity: { value: 0.2 },
        };

        const vertexShader = /* glsl */ `
          uniform float uTime;
          uniform vec2 uResolution;
          uniform vec2 uCenter0;
          uniform vec2 uCenter1;
          uniform float uSpeed;
          uniform float uBands;
          uniform float uDistortionStrength;
          
          varying vec2 vUv;
          varying vec3 vPosition;
          varying vec2 vScreenUv;
          varying float vRippleValue;
          
          void main() {
            vUv = uv;
            vPosition = position;
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vec4 projectedPosition = projectionMatrix * mvPosition;
            
            vec2 screenUv = (projectedPosition.xy / projectedPosition.w) * 0.5 + 0.5;
            screenUv.y = 1.0 - screenUv.y;
            vScreenUv = screenUv;
            
            float t = uTime * uSpeed;
            float aspect = uResolution.x / max(1.0, uResolution.y);
            
            vec2 p0 = screenUv - uCenter0;
            p0.x *= aspect;
            float r0 = length(p0);
            float a0 = atan(p0.y, p0.x);
            float spiral0 = a0 + r0 * 6.0 - t * 0.7;
            float v0 = sin(spiral0 * uBands);
            
            vec2 p1 = screenUv - uCenter1;
            p1.x *= aspect;
            float r1 = length(p1);
            float a1 = atan(p1.y, p1.x);
            float spiral1 = a1 + r1 * 6.0 - t * 0.7;
            float v1 = sin(spiral1 * uBands);
            
            float d0 = distance(screenUv, uCenter0);
            float d1 = distance(screenUv, uCenter1);
            float blendDist = 0.25;
            float w0 = exp(-d0 / blendDist);
            float w1 = exp(-d1 / blendDist);
            float totalWeight = w0 + w1;
            float combined = totalWeight > 0.001 ? (v0 * w0 + v1 * w1) / totalWeight : (v0 + v1) * 0.5;
            
            float ripple = combined;
            vRippleValue = ripple;
            
            vec2 rippleDir = normalize(p0 + p1);
            vec3 offset = vec3(
              rippleDir.x * ripple * uDistortionStrength,
              rippleDir.y * ripple * uDistortionStrength,
              0.0
            );
            
            vec3 distortedPosition = position + offset;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(distortedPosition, 1.0);
          }
        `;

        const fragmentShader = /* glsl */ `
          uniform vec3 uColor;
          uniform float uTime;
          uniform float uRippleIntensity;
          
          varying vec2 vUv;
          varying vec3 vPosition;
          varying vec2 vScreenUv;
          varying float vRippleValue;
          
          void main() {
            float ripple = vRippleValue;
            float rippleGlow = sin(ripple * 3.14159) * 0.5 + 0.5;
            
            float baseOpacity = 0.95;
            float brightnessBoost = 1.0 + rippleGlow * 0.2 * uRippleIntensity;
            float opacityBoost = rippleGlow * 0.1 * uRippleIntensity;
            
            vec3 finalColor = uColor * brightnessBoost;
            float finalOpacity = min(1.0, baseOpacity + opacityBoost);
            
            gl_FragColor = vec4(finalColor, finalOpacity);
          }
        `;

        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: uniforms as any,
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        // Set initial position from base positions
        const basePos = BASE_TEXT_POSITIONS[index];
        mesh.position.set(basePos.x, basePos.y, basePos.z);
        mesh.scale.setScalar(0); // Start at 0, will be set in updateSizing
        
        mesh.userData = {
          route: item.route,
          label: item.label,
          uniforms,
          isAnimating: false,
          initialDistortionStrength: 0.04,
          initialRippleIntensity: 0.2,
          initialScale: 1.0,
        };
        scene.add(mesh);
        meshesRef.current.push(mesh);
      });

      // Initial sizing
      updateSizing();

      // Animation loop
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();
        meshesRef.current.forEach((mesh) => {
          if (mesh.userData.uniforms) {
            mesh.userData.uniforms.uTime.value = elapsed;
          }
        });
        renderer.render(scene, camera);
      };
      animate();
    });

    // Update sizing to match home page calculations
    const updateSizing = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      const targetTextSize = getTargetTextSize(viewportWidth);
      const sizeScale = targetTextSize / BASE_TEXT_SIZE;

      const textZ = -8;
      const distance = Math.abs(camera.position.z - textZ);
      const vFov = (camera.fov * Math.PI) / 180;
      const frustumHeightAtText = 2 * distance * Math.tan(vFov / 2);
      const frustumWidthAtText = frustumHeightAtText * camera.aspect;

      const baseDistance = Math.abs(camera.position.z - textZ);
      const baseFrustumHeight = 2 * baseDistance * Math.tan(vFov / 2);
      const baseAspectRatio = BASE_VIEWPORT_WIDTH / BASE_VIEWPORT_HEIGHT;
      const baseFrustumWidth = baseFrustumHeight * baseAspectRatio;

      const positionScaleX = frustumWidthAtText / baseFrustumWidth;
      const positionScaleY = frustumHeightAtText / baseFrustumHeight;

      const tempPositions: THREE.Vector3[] = [];
      meshesRef.current.forEach((mesh, index) => {
        const basePos = BASE_TEXT_POSITIONS[index];
        const scaledX = basePos.x * positionScaleX;
        const scaledY = basePos.y * positionScaleY;

        mesh.position.set(scaledX, scaledY, basePos.z);
        mesh.scale.setScalar(sizeScale);
        mesh.userData.initialScale = sizeScale;
        mesh.updateMatrixWorld(true);

        if (!mesh.geometry.boundingBox) {
          mesh.geometry.computeBoundingBox();
        }
        const bbox = mesh.geometry.boundingBox!.clone();
        bbox.applyMatrix4(mesh.matrixWorld);

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

      meshesRef.current.forEach((mesh, index) => {
        const basePos = BASE_TEXT_POSITIONS[index];
        const scaledX = basePos.x * positionScaleX;
        const scaledY = basePos.y * positionScaleY;

        mesh.position.set(scaledX + centerOffsetX, scaledY, basePos.z);
      });

      // Update resolution uniforms
      meshesRef.current.forEach((mesh) => {
        if (mesh.userData.uniforms) {
          mesh.userData.uniforms.uResolution.value.set(viewportWidth, viewportHeight);
        }
      });
    };

    // Helper to check if point is within mesh bounding box (screen space)
    // This allows clicking inside letters with holes like "O", "A", "B", etc.
    const isPointInMeshBounds = (
      clickX: number,
      clickY: number,
      mesh: THREE.Mesh
    ): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      const bbox = mesh.geometry.boundingBox!.clone();
      bbox.applyMatrix4(mesh.matrixWorld);

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

      return clickX >= minX && clickX <= maxX && clickY >= minY && clickY <= maxY;
    };

    // Trigger click animation and navigation for a mesh
    const triggerMeshClick = (mesh: THREE.Mesh) => {
      const { route, uniforms, isAnimating, initialDistortionStrength, initialRippleIntensity } = mesh.userData;

      if (isAnimating) return;
      mesh.userData.isAnimating = true;

      // Check if already on this page (will skip navigation but still animate)
      const normalizedCurrent = pathname === "" ? "/" : pathname;
      const normalizedTarget = route === "" ? "/" : route;
      const isCurrentPage = normalizedCurrent === normalizedTarget;

      const currentScale = mesh.scale.x;
      const targetScale = currentScale * 1.4;
      const targetDistortionStrength = initialDistortionStrength * 2.0;
      const targetRippleIntensity = initialRippleIntensity * 2.0;

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.to(mesh.scale, {
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
              mesh.userData.isAnimating = false;
            },
          });
        },
      });

      tl.to(mesh.scale, {
        x: targetScale,
        y: targetScale,
        z: targetScale,
        duration: 0.3,
        ease: "power2.out",
      });
      tl.to(
        uniforms.uDistortionStrength,
        { value: targetDistortionStrength, duration: 0.3, ease: "power2.out" },
        "<"
      );
      tl.to(
        uniforms.uRippleIntensity,
        { value: targetRippleIntensity, duration: 0.3, ease: "power2.out" },
        "<"
      );
      tl.to({}, { duration: 0.75 });

      // Navigate after animation only if not on current page
      if (!isCurrentPage) {
        window.setTimeout(() => {
          window.location.assign(route);
        }, 600);
      }
    };

    // Click handler - using bounding box detection like home page
    // This allows clicking inside letters with holes like "O", "A", "B", etc.
    const handleClick = (event: MouseEvent) => {
      const clickX = event.clientX;
      const clickY = event.clientY;

      // Check each mesh using bounding box detection
      for (const mesh of meshesRef.current) {
        if (isPointInMeshBounds(clickX, clickY, mesh)) {
          triggerMeshClick(mesh);
          return;
        }
      }
    };

    // Pointer cursor on hover - using bounding box detection
    const handleMouseMove = (event: MouseEvent) => {
      const clickX = event.clientX;
      const clickY = event.clientY;

      let isHovering = false;
      for (const mesh of meshesRef.current) {
        if (isPointInMeshBounds(clickX, clickY, mesh)) {
          isHovering = true;
          break;
        }
      }

      renderer.domElement.style.cursor = isHovering ? "pointer" : "default";
      document.body.style.cursor = isHovering ? "pointer" : "auto";
    };

    // Attach listeners to window to capture events even with pointer-events: none on canvas
    window.addEventListener("click", handleClick);
    window.addEventListener("mousemove", handleMouseMove);

    // Handle resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      updateSizing();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
      meshesRef.current.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      meshesRef.current = [];
      renderer.dispose();
      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      // Reset cursor
      document.body.style.cursor = "default";
    };
  }, [pathname, getTargetTextSize]);

  return (
    <div
      ref={containerRef}
      className="fixed top-0 left-0 right-0 bottom-0 z-50 pointer-events-none" // Ensure container is none
      style={{ pointerEvents: "none" }}
    >
      <style jsx>{`
        div :global(canvas) {
          pointer-events: none; /* Allow clicks to pass through canvas */
        }
      `}</style>
    </div>
  );
}
