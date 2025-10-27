// src/components/SpiralBackground.ts
import * as THREE from "three";

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
    uHoleRadius: { value: 0.08 },
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
    uniform float uHoleRadius;
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
      
      // Recalculate distances for holes
      d0 = distance(uv, uCenter0);
      d1 = distance(uv, uCenter1);
      
      // Create holes at both centers by setting alpha to 0
      float alpha = 1.0;
      if (d0 < uHoleRadius) alpha = 0.0;
      if (d1 < uHoleRadius) alpha = 0.0;
      // Soft edges
      alpha *= smoothstep(uHoleRadius, uHoleRadius + 0.02, d0);
      alpha *= smoothstep(uHoleRadius, uHoleRadius + 0.02, d1);

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

  // helper: project object to uv coords (0..1)
  const proj = (obj: THREE.Object3D) => {
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    p.project(camera as THREE.PerspectiveCamera);
    return new THREE.Vector2(0.5 * (p.x + 1.0), 0.5 * (1.0 - p.y));
  };

  function updateCenters() {
    // compute centers once and copy into uniforms
    const c0 = proj(leftObj);
    const c1 = proj(rightObj);
    uniforms.uCenter0.value.copy(c0);
    uniforms.uCenter1.value.copy(c1);
  }

  function resize() {
    uniforms.uResolution.value.set(
      renderer.domElement.width,
      renderer.domElement.height
    );
    // optionally recompute hole radius relative to viewport width:
    const w = renderer.domElement.width;
    // tune hole size so it matches door screen size roughly
    uniforms.uHoleRadius.value = Math.max(
      0.05,
      Math.min(0.12, 120 / Math.max(1, w))
    );
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
