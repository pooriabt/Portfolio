// src/components/PortalExample.tsx
"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";

/**
 * Minimal standalone portal demo.
 * - Creates two elliptical portal planes (left & right)
 * - Each plane samples a simple generated canvas texture
 * - Clicking toggles open/close via GSAP animating `uSpread`
 */

function createCanvasTexture(text: string, w = 512, h = 512) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // background
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);
  // label
  ctx.fillStyle = "#fff";
  ctx.font = "48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  return new THREE.CanvasTexture(c);
}

function createPortalEllipse(params: {
  texture: THREE.Texture | null;
  hue?: number;
}) {
  const uniforms = {
    uTime: { value: 0 },
    uSpread: { value: 0 }, // 0 open, 1 closed
    uScale: { value: 1.0 },
    uHue: { value: params.hue ?? 0.18 },
    uAlpha: { value: 1.0 },
    uMap: { value: params.texture },
    uResolution: { value: new THREE.Vector2(512, 512) },
  };

  const vertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`;

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

    vec3 hsv2rgb(vec3 c) {
      vec3 k = vec3(1.0, 2.0/3.0, 1.0/3.0);
      vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
      return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);
      float a = atan(c.y, c.x);

      float t = uTime * 1.2;
      float spreadBoost = mix(0.6, 6.0, clamp(uSpread, 0.0, 1.0));
      float spir = a + r * (8.0 * uScale * spreadBoost) - t * (0.8 + uSpread * 1.2);
      float band = sin(spir * 6.0);
      float edge0 = mix(0.18, 0.06, uSpread);
      float edge1 = mix(0.45, 0.18, uSpread);
      float bandMask = smoothstep(edge0, edge1, band);
      float radialFade = smoothstep(0.9, 0.2, r * (1.0 + uSpread * 0.8));
      float spiralAlpha = bandMask * radialFade * uAlpha;
      float closedMask = clamp(uSpread * spiralAlpha, 0.0, 1.0);

      vec4 tex = texture2D(uMap, uv);
      vec3 baseColor = (tex.a > 0.0) ? tex.rgb : vec3(0.06, 0.06, 0.06);
      vec3 spirCol = hsv2rgb(vec3(uHue, 0.85, 1.0));
      vec3 outCol = mix(baseColor, spirCol, closedMask);
      float outAlpha = mix(tex.a, spiralAlpha, closedMask);

      // also fade outside ellipse subtly
      float ellipse = smoothstep(0.95, 0.5, r);
      outAlpha *= ellipse;

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
  });

  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, mat, uniforms };
}

export default function PortalExample() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = ref.current!;
    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // textures
    const texA = createCanvasTexture("Left");
    const texB = createCanvasTexture("Right");

    // portals
    const left = createPortalEllipse({ texture: texA, hue: 0.25 });
    const right = createPortalEllipse({ texture: texB, hue: 0.6 });

    left.mesh.position.set(-0.9, 0, 0);
    right.mesh.position.set(0.9, 0, 0);

    // initial sizes
    const baseW = 1.0;
    const baseH = 1.6;
    left.mesh.scale.set(baseW, baseH, 1);
    right.mesh.scale.set(baseW, baseH, 1);

    scene.add(left.mesh, right.mesh);

    // click handling
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function onPointerDown(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects([left.mesh, right.mesh], true);
      if (!hits.length) return;
      const mesh = hits[0].object as THREE.Mesh;
      const which = mesh === left.mesh ? left : right;
      // toggle
      const cur = which.uniforms.uSpread.value;
      gsap.killTweensOf(which.uniforms.uSpread);
      gsap.to(which.uniforms.uSpread, {
        value: cur < 0.5 ? 1 : 0,
        duration: 0.9,
        ease: "power2.inOut",
      });
      // also alpha pulse
      gsap.fromTo(
        which.uniforms.uAlpha,
        { value: 0.0 },
        { value: 1.0, duration: 0.22, yoyo: true, repeat: 1 }
      );
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // resize
    function onResize() {
      w = mount.clientWidth || window.innerWidth;
      h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // animate
    const clock = new THREE.Clock();
    let raf = 0;
    function animate() {
      const t = clock.getElapsedTime();
      left.uniforms.uTime.value = t;
      right.uniforms.uTime.value = t * 1.05;
      raf = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // cleanup
    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      mount.removeChild(renderer.domElement);
      // dispose materials/textures
      (left.mat as any).dispose();
      (right.mat as any).dispose();
      texA.dispose();
      texB.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ width: "100%", height: "100vh", touchAction: "none" }}
    />
  );
}
