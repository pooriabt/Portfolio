// src/components/SpiralBackground.ts
import * as THREE from "three";
import {
  projectObjectToScreenUv,
  setPortalHoleRadius,
} from "./portalMath";

/**
 * createSpiralBackground(scene, camera, renderer, leftObj, rightObj)
 * - scene/camera/renderer: three core
 * - leftObj/rightObj: objects whose screen positions will become spiral centers
 *
 * Returns: { mesh, update(time), resize(), dispose() }
 */
export function createSpiralBackground(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  leftObj: THREE.Object3D,
  rightObj: THREE.Object3D
) {
  // uniforms
  const uniforms = {
    uTime: { value: 0 },
    uResolution: {
      value: new THREE.Vector2(
        renderer.domElement.width,
        renderer.domElement.height
      ),
    },
    uCenter0: { value: new THREE.Vector2(0.25, 0.5) },
    uCenter1: { value: new THREE.Vector2(0.75, 0.5) },
    uHoleRadius: { value: new THREE.Vector2(0.08, 0.08) },
    uSpeed: { value: 0.7 },
    uBands: { value: 20.0 },
    uContrast: { value: 1.0 },
  };

  // vertex shader (pass uv)
  const vertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // fragment shader: two spirals, holes at centers, black/white bands
  const fragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uCenter0;
  uniform vec2 uCenter1;
  uniform vec2 uHoleRadius;   // now a vec2
  uniform float uSpeed;
  uniform float uBands;
  uniform float uContrast;

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float t = uTime * uSpeed;
    
    float aspect = uResolution.x / max(1.0, uResolution.y);
    
    // Calculate spiral from both centers
    vec2 p0 = uv - uCenter0;
    p0.x *= aspect;
    float r0 = length(p0);
    float a0 = atan(p0.y, p0.x);
    float spiral0 = a0 + r0 * 6.0 - t * 0.7;
    float v0 = sin(spiral0 * uBands);
    
    vec2 p1 = uv - uCenter1;
    p1.x *= aspect;
    float r1 = length(p1);
    float a1 = atan(p1.y, p1.x);
    float spiral1 = a1 + r1 * 6.0 - t * 0.7;
    float v1 = sin(spiral1 * uBands);
    
    // Smoothly blend between spirals based on distance (smooth boundary)
    float d0 = distance(uv, uCenter0);
    float d1 = distance(uv, uCenter1);
    
    // Create smooth blend using inverse distance weighting
    float blendDist = 0.2; // transition distance
    float w0 = exp(-d0 / blendDist);
    float w1 = exp(-d1 / blendDist);
    float totalWeight = w0 + w1;
    
    // Blend the spiral values smoothly
    float combined = (v0 * w0 + v1 * w1) / totalWeight;
    
    // Convert to bands
    float band = smoothstep(0.0, 0.2, combined);
    
    // Elliptical holes (independent x/y scaling) - both portals use same size/shape
    vec2 hp0 = uv - uCenter0;
    hp0.x /= uHoleRadius.x;
    hp0.y /= uHoleRadius.y;
    float holeDist0 = length(hp0);
    
    vec2 hp1 = uv - uCenter1;
    hp1.x /= uHoleRadius.x;
    hp1.y /= uHoleRadius.y;
    float holeDist1 = length(hp1);

    // Use minimum distance for single calculation (both portals same size/shape)
    float holeDist = min(holeDist0, holeDist1);

    float alpha = 1.0;
    if (holeDist < 1.0) alpha = 0.0;

    // Soft fade edges - extended fade range to allow portal brush border to show through
    // Same fade function for both portals (same size/shape)
    float fade = smoothstep(1.05, 1.4, holeDist);
    // Keep alpha lower in the brush border zone (between 1.0 and 1.12) to allow brush to show
    float brushZoneFactor = step(1.0, holeDist) * step(holeDist, 1.12); // 1.0 if in brush zone, 0.0 otherwise
    // In brush zone, reduce alpha moderately to allow portal brush to show through
    alpha *= mix(fade, fade * 0.65, brushZoneFactor);

    // final color
    vec3 color = mix(vec3(0.0), vec3(1.0), band);
    gl_FragColor = vec4(color, alpha);
  }
`;

  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: uniforms as any,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  // Create a large plane that fills the entire view frustum
  // Since we use screen-space coordinates (gl_FragCoord), the exact size doesn't matter
  // as long as it's large enough to fill the camera's view
  const perspectiveCamera = camera as THREE.PerspectiveCamera;
  const scratchVec3 = new THREE.Vector3();
  const planeDistance = 15; // far behind doors
  const fov = (perspectiveCamera.fov * Math.PI) / 180;
  const cameraDistFromOrigin = Math.abs(perspectiveCamera.position.z);
  const totalDistance = cameraDistFromOrigin + planeDistance;
  const planeHeight = 2 * Math.tan(fov / 2) * totalDistance;
  const planeWidth = planeHeight * perspectiveCamera.aspect;

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    mat
  );
  plane.position.set(0, 0, -planeDistance); // far behind doors
  plane.renderOrder = -999; // render first, before everything
  scene.add(plane);

  function updateCenters() {
    projectObjectToScreenUv(
      leftObj,
      perspectiveCamera,
      uniforms.uCenter0.value,
      scratchVec3
    );
    projectObjectToScreenUv(
      rightObj,
      perspectiveCamera,
      uniforms.uCenter1.value,
      scratchVec3
    );
  }
  function resize() {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    uniforms.uResolution.value.set(w, h);

    // Compute independent width/height hole scaling
    setPortalHoleRadius(uniforms.uHoleRadius.value, w, h);

    // Update plane geometry size to match new aspect ratio
    const fov = (perspectiveCamera.fov * Math.PI) / 180;
    const cameraDistFromOrigin = Math.abs(perspectiveCamera.position.z);
    const totalDistance = cameraDistFromOrigin + planeDistance;
    const planeHeight = 2 * Math.tan(fov / 2) * totalDistance;
    const planeWidth = planeHeight * perspectiveCamera.aspect;

    // Update plane geometry dimensions
    plane.geometry.dispose();
    plane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

    updateCenters();
  }

  function update(timeSec: number) {
    uniforms.uTime.value = timeSec;
    updateCenters();
  }

  function dispose() {
    scene.remove(plane);
    plane.geometry.dispose();
    mat.dispose();
  }

  // initial resize
  resize();

  return {
    mesh: plane,
    update,
    resize,
    dispose,
    material: mat,
  };
}
