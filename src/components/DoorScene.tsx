// components/DoorScene.tsx
"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { createArchDoorCanvas } from "./archdoorCanvas";
import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
import { createSpiralBackground } from "./SpiralBackground";

/**
 * Rick and Morty style portal doors
 * - 2D elliptical portals instead of 3D doors
 * - Each portal displays a texture (arch canvas for left, digital rain for right)
 * - Opening/closing animates with spiral: spreads from center (close), vanishes (open)
 */

function createPortalEllipse(params: {
  texture: THREE.Texture | null;
  hue?: number;
  useDigitalRain?: boolean;
}) {
  const uniforms = {
    uTime: { value: 0 },
    uSpread: { value: 1 }, // 0 = open (hole visible), 1 = closed (texture fully visible)
    uScale: { value: 1.0 },
    uHue: { value: params.hue ?? 0.18 },
    uAlpha: { value: 1.0 },
    uMap: { value: params.texture },
    uResolution: { value: new THREE.Vector2(512, 512) },
    uHoleRadius: { value: new THREE.Vector2(0.15, 0.25) }, // Match spiral background holes
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uSpeed: { value: 0.25 },
    uDensity: { value: 1.8 },
    uRainColor: { value: new THREE.Color(0x00ff55) },
  };

  const vertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

  const digitalRainFunc = params.useDigitalRain
    ? `
    const float PI = 3.14159265359;
    
    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    
    // Generate Matrix-style character pattern
    float matrixChar(vec2 p, float seed) {
      vec2 grid = fract(p * 8.0);
      float pattern = 0.0;
      
      // Create random character-like patterns
      float rnd = hash2(floor(p * 8.0) + seed);
      if (rnd > 0.7) {
        pattern = step(0.3, grid.x) * step(grid.x, 0.7) * step(0.2, grid.y);
      } else if (rnd > 0.4) {
        pattern = step(0.2, grid.y) * step(grid.y, 0.8) * step(0.3, grid.x);
      } else {
        pattern = length(grid - 0.5) < 0.3 ? 1.0 : 0.0;
      }
      
      return pattern;
    }
    
    vec4 getDigitalRainColor(vec2 uv, float t, float speed, float density, vec3 color, vec2 resolution) {
      // Convert to centered coordinates
      vec2 centered = uv - 0.5;
      float radius = length(centered);
      float angle = atan(centered.y, centered.x);
      
      // Spiral parameters - characters flow in spiral paths
      float spiralTightness = 8.0; // How many turns the spiral makes
      float rotationSpeed = speed * 0.3; // Rotation speed
      
      // Create spiral coordinate system
      // Characters move along spiral paths from center outward
      float spiralAngle = angle + radius * spiralTightness - t * rotationSpeed;
      
      // Calculate spiral path position
      float numSpirals = floor(density * 16.0); // Number of spiral arms
      float spiralIndex = floor(spiralAngle / (PI * 2.0) * numSpirals);
      float angleInSpiral = fract(spiralAngle / (PI * 2.0) * numSpirals);
      
      // Character grid along the spiral
      float numCharsAlongRadius = floor(density * 28.0);
      float radialIndex = floor(radius * numCharsAlongRadius * 2.0);
      
      // Per-character randomness
      float charSeed = hash2(vec2(spiralIndex, radialIndex));
      float charTime = t * (0.3 + charSeed * 0.5) * speed;
      
      // Characters flow outward along spiral
      float flowOffset = fract(charTime * 0.2 + charSeed);
      float charRadius = fract((radius + flowOffset) * 2.0);
      
      // Character pattern position
      vec2 charUv = vec2(angleInSpiral, charRadius * 3.0);
      float charPattern = matrixChar(charUv, charSeed + floor(charTime));
      
      // Opacity flicker (0, 0.5, 1)
      float flickerPhase = fract(charTime * 1.0 + charSeed * 10.0);
      float flicker;
      if (flickerPhase < 0.33) {
        flicker = 0.0; // invisible
      } else if (flickerPhase < 0.66) {
        flicker = 0.5; // half opacity
      } else {
        flicker = 1.0; // full opacity
      }
      
      // Distance-based fade (characters fade with distance from center)
      float distanceFade = 1.0 - smoothstep(0.1, 0.5, abs(charRadius - 0.5));
      
      // Combine intensity
      float intensity = charPattern * distanceFade * flicker;
      
      // Color variation along spiral
      float colorShift = sin(spiralAngle * 2.0 + t) * 0.3;
      vec3 finalColor = color * (0.8 + colorShift);
      
      // Radial fade for portal shape
      float radialFade = smoothstep(0.5, 0.15, radius) * smoothstep(0.02, 0.1, radius);
      
      float alpha = intensity * radialFade * (0.7 + flicker * 0.3);
      
      return vec4(finalColor * intensity, alpha);
    }
  `
    : "";

  const fragment = /* glsl */ `
    precision mediump float;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uSpread;
    uniform float uScale;
    uniform float uHue;
    uniform float uAlpha;
    uniform sampler2D uMap;
    uniform vec2 uResolution;
    uniform vec2 uHoleRadius;
    uniform vec2 uCenter;
    ${
      params.useDigitalRain
        ? `
    uniform float uSpeed;
    uniform float uDensity;
    uniform vec3 uRainColor;
    `
        : ""
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 k = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
      return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
    }

    ${digitalRainFunc}

    void main() {
      vec2 uv = vUv;
      vec2 screenUv = gl_FragCoord.xy / uResolution;
      vec2 diffScreen = screenUv - uCenter;

      vec2 ellipseNorm = diffScreen;
      ellipseNorm.x /= uHoleRadius.x;
      ellipseNorm.y /= uHoleRadius.y;
      float ellipseDist = length(ellipseNorm);

      if (ellipseDist > 1.0) {
        discard;
      }

      float t = uTime * 1.5;

      // Base texture color
      vec3 baseColor = vec3(0.05);
      float baseAlpha = 1.0;

      ${
        params.useDigitalRain
          ? `
      vec4 rainData = getDigitalRainColor(uv, t, uSpeed, uDensity, uRainColor, uResolution);
      baseColor = rainData.rgb;
      baseAlpha = rainData.a;
      `
          : `
      vec4 tex = texture2D(uMap, uv);
      baseColor = (tex.a > 0.0) ? tex.rgb : vec3(0.05);
      baseAlpha = tex.a;
      `
      }

      // Portal hole effect (no spiral animation)
      float holeRadius = mix(0.35, 0.0, uSpread);
      float holeSmooth = 0.15;
      float holeMask = 1.0 - smoothstep(holeRadius - holeSmooth, holeRadius + holeSmooth, ellipseDist);

      // Simple color output - just base texture
      vec3 outCol = baseColor;

      // Alpha: create transparent hole when open (uSpread=0), full texture when closed (uSpread=1)
      float outAlpha = baseAlpha * (1.0 - holeMask * (1.0 - uSpread));

      // Ellipse edge fade
      float ellipseFade = smoothstep(1.0, 0.98, ellipseDist);
      outAlpha *= ellipseFade * uAlpha;

      gl_FragColor = vec4(outCol, outAlpha);
    }`;

  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: uniforms as any,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: params.useDigitalRain
      ? THREE.AdditiveBlending
      : THREE.NormalBlending,
  });

  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, mat, uniforms };
}

export default function DoorScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

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

    function onPointerDown(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(
        [leftPortal.mesh, rightPortal.mesh],
        true
      );
      if (!intersects.length) return;
      const which = portalFromIntersected(intersects[0].object);
      if (!which) return;

      const portal = which === "left" ? leftPortal : rightPortal;
      if (!pointerInsidePortal(portal, pointer)) return;

      if (which === "left") toggleLeft();
      if (which === "right") toggleRight();
    }

    renderer.domElement.style.cursor = "pointer";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const tmpVec3 = new THREE.Vector3();
    const tmpVec2A = new THREE.Vector2();
    const tmpVec2B = new THREE.Vector2();

    const projectToScreenUv = (obj: THREE.Object3D, target: THREE.Vector2) => {
      obj.getWorldPosition(tmpVec3);
      tmpVec3.project(camera);
      target.set(0.5 * (tmpVec3.x + 1.0), 0.5 * (1.0 - tmpVec3.y));
      return target;
    };

    const pointerScreenUv = new THREE.Vector2();

    const pointerInsidePortal = (
      portal: ReturnType<typeof createPortalEllipse>,
      pointerNdc: THREE.Vector2
    ) => {
      pointerScreenUv.set(pointerNdc.x * 0.5 + 0.5, 0.5 * (1.0 - pointerNdc.y));
      const center = portal.uniforms.uCenter.value as THREE.Vector2;
      const hole = portal.uniforms.uHoleRadius.value as THREE.Vector2;
      const dx = (pointerScreenUv.x - center.x) / hole.x;
      const dy = (pointerScreenUv.y - center.y) / hole.y;
      return dx * dx + dy * dy <= 1.0;
    };

    function updateSizing() {
      if (!mount) return;
      const newWidth = mount.clientWidth || window.innerWidth;
      const newHeight = mount.clientHeight || window.innerHeight;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      const w = renderer.domElement.width;
      const h = renderer.domElement.height;

      // Calculate hole radius exactly like SpiralBackground
      const holeWidth = Math.max(0.05, Math.min(0.17, 125 / Math.max(1, w)));
      const holeHeight = Math.max(0.05, Math.min(0.5, 200 / Math.max(1, h)));

      if (leftPortal.uniforms.uResolution) {
        leftPortal.uniforms.uResolution.value.set(w, h);
        leftPortal.uniforms.uHoleRadius.value.set(holeWidth, holeHeight);
      }
      if (rightPortal.uniforms.uResolution) {
        rightPortal.uniforms.uResolution.value.set(w, h);
        rightPortal.uniforms.uHoleRadius.value.set(holeWidth, holeHeight);
      }

      // Compute frustum dimensions at portal depth
      const distance = Math.abs(camera.position.z - leftPortal.mesh.position.z);
      const vFov = (camera.fov * Math.PI) / 180;
      const frustumHeight = 2 * distance * Math.tan(vFov / 2);
      const frustumWidth = frustumHeight * camera.aspect;

      const portalWidthWorld = frustumWidth * holeWidth * 2;
      const portalHeightWorld = frustumHeight * holeHeight * 2;

      leftPortal.mesh.scale.set(portalWidthWorld, portalHeightWorld, 1);
      rightPortal.mesh.scale.set(portalWidthWorld, portalHeightWorld, 1);

      // Determine spacing between portals using UV gap
      const gapUv = Math.max(0.06, holeWidth * 0.8);
      const centerDistanceUv = holeWidth * 2 + gapUv;
      const centerOffsetWorld = (frustumWidth * centerDistanceUv) / 2;

      leftPortal.mesh.position.set(-centerOffsetWorld, 0, 0);
      rightPortal.mesh.position.set(centerOffsetWorld, 0, 0);

      if (spiral) spiral.resize();

      // Update centers immediately after resize
      const centerLeft = projectToScreenUv(leftPortal.mesh, tmpVec2A);
      leftPortal.uniforms.uCenter.value.copy(centerLeft);
      const centerRight = projectToScreenUv(rightPortal.mesh, tmpVec2B);
      rightPortal.uniforms.uCenter.value.copy(centerRight);
    }
    updateSizing();
    window.addEventListener("resize", updateSizing);

    const clock = new THREE.Clock();
    let rafId = 0;
    function animate() {
      const elapsed = clock.getElapsedTime();

      const centerLeft = projectToScreenUv(leftPortal.mesh, tmpVec2A);
      leftPortal.uniforms.uCenter.value.copy(centerLeft);
      const centerRight = projectToScreenUv(rightPortal.mesh, tmpVec2B);
      rightPortal.uniforms.uCenter.value.copy(centerRight);

      leftPortal.uniforms.uTime.value = elapsed;
      rightPortal.uniforms.uTime.value = elapsed * 1.05;
      if (spiral) spiral.update(elapsed);
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updateSizing);
      if (mount && renderer.domElement.parentElement === mount)
        mount.removeChild(renderer.domElement);

      if (archController) archController.stop?.();
      if (archTexture) archTexture.dispose();
      if (leftPortal.mat) leftPortal.mat.dispose();
      if (rightPortal.mat) rightPortal.mat.dispose();
      renderer.dispose();
      if (spiral) spiral.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100vh", touchAction: "none" }}
    />
  );
}
