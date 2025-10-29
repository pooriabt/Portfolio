import * as THREE from "three";

const createDigitalRainMaterial = (params?: {
  width?: number;
  height?: number;
  color?: number;
}): THREE.ShaderMaterial => {
  const { width = 800, height = 600, color = 0x00ff55 } = params || {};

  // Shader code (vertex & fragment)
  const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

  // Swirling "digital rain" shader that wraps around portal center
  const fragmentShader = `precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uDensity;

const float PI = 3.14159265359;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;

  // Convert to polar coordinates around texture center
  vec2 centered = uv - 0.5;
  float radius = length(centered);
  float angle = atan(centered.y, centered.x);

  // Twist coordinates to create a spiraling flow
  float swirl = radius * 6.0 - uTime * (1.2 * uSpeed);
  angle += swirl + sin(radius * 12.0 - uTime * 1.5) * 0.12;

  vec2 twisted = vec2(cos(angle), sin(angle)) * radius;
  vec2 swirlUv = fract(twisted + 0.5);
  swirlUv = mix(swirlUv, uv, smoothstep(0.0, 0.05, radius));

  // Column / row indices in twisted texture space
  float cols = max(10.0, uDensity * 28.0);
  float rows = max(18.0, uDensity * 20.0);
  float colIndex = floor(swirlUv.x * cols);
  float rowIndex = floor(swirlUv.y * rows);

  float colRand = hash(colIndex);
  float t = uTime * (0.6 + uSpeed * 1.2) + colRand * 3.0;

  // Each column has a "head" that travels radially (along swirlUv.y)
  float head = fract(t);
  float symbolPos = fract(swirlUv.y + colRand);
  float dist = abs(symbolPos - head);
  dist = min(dist, 1.0 - dist);

  float headMask = smoothstep(0.02, 0.0, dist);
  float trailMask = smoothstep(0.45, 0.0, dist) - headMask * 0.2;

  float rnd = hash2(vec2(colIndex, rowIndex));
  float glyphPulse = step(0.55, fract((rowIndex + t * 5.5) * (0.45 + rnd * 0.9)));

  float intensity = (0.25 + 0.75 * rnd) * glyphPulse * trailMask + 1.7 * headMask;

  // Hue variation around spiral
  float hueWave = 0.5 + 0.5 * cos(angle * 3.5 - radius * 8.0 + uTime * 1.5);
  vec3 color = uColor * mix(0.7, 1.6, hueWave) * intensity;
  float alpha = clamp(intensity, 0.0, 1.0);

  // Fade towards center and outer edge to avoid harsh seams
  float innerFade = smoothstep(0.04, 0.18, radius);
  float outerFade = 1.0 - smoothstep(0.55, 0.8, radius);
  float radialFade = innerFade * outerFade;
  alpha *= radialFade;

  gl_FragColor = vec4(color, alpha);
}

`;

  // Create ShaderMaterial
  const digitalRainMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uSpeed: { value: 0.25 }, // tweak: speed of rain
      uDensity: { value: 1.8 }, // tweak: density factor
      uColor: { value: new THREE.Color(0x00ff55) },
      uGlow: { value: 1.0 },
    },
    transparent: true, // allow alpha transparency
    depthWrite: false, // don't write depth for transparent surface (prevents occlusion artifacts)
    depthTest: true, // still test depth (optional)
    blending: THREE.AdditiveBlending, // additive gives neon glow; use NormalBlending if you want see-through darker
    side: THREE.DoubleSide, // if you want both faces to show the effect when thin box rotates
  });
  return digitalRainMaterial;
};

export default createDigitalRainMaterial;
