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

  // A simple digital rain shader: columns of falling bright glyph-like strips with trails
  const fragmentShader = `precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uDensity;

// simple hash for per-column/row variation (must be declared at global scope)
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  // --- Matrix-style character rain (no texture) ---
  // We'll create columns with per-column randomness, a bright head and a fading trail.
  // Works with uniforms: uTime, uResolution, uColor, uSpeed, uDensity

  // columns and rows density
  float cols = max(6.0, floor(uDensity * uResolution.x / 24.0));
  float rows = max(16.0, floor(uResolution.y / 12.0));
  float colIndex = floor(uv.x * cols);
  float rowIndex = floor(uv.y * rows);

  // per-column time offset so columns fall independently
  float colOffset = hash(colIndex) * 4.0;
  float t = uTime * uSpeed + colOffset;

  // position of the falling head along the column in [0,1]
  float head = fract(t * 0.25);

  // create a repeating vertical symbol grid and compute how far each symbol is from the head
  float symbolPos = (rowIndex + 0.5) / rows;
  float dist = fract(symbolPos - head);
  // make dist cover distance in 0..1 where small values mean near the head (account for wrap)
  dist = min(dist, 1.0 - dist);

  // randomness per-symbol to change brightness/characters
  float rnd = hash2(vec2(colIndex, rowIndex));

  // head intensity (sharp bright head)
  float headMask = smoothstep(0.02, 0.0, dist);
  // trail intensity (fades away from head)
  float trailMask = smoothstep(0.35, 0.0, dist) - headMask * 0.1;

  // flicker / glyph-on pattern: use fract pattern to make characters appear/disappear
  float glyphPulse = step(0.6, fract((rowIndex + t * 6.0) * (0.5 + rnd * 0.8)));

  // combine masks with randomness so not all symbols light at once
  float intensity = (0.2 + 0.8 * rnd) * glyphPulse * trailMask + 1.6 * headMask;

  // color: keep greenish but use provided uColor, boost head slightly
  vec3 color = uColor * intensity;
  float alpha = clamp(intensity, 0.0, 1.0);

  // subtle vignette to reduce edges (make sure to subtract vec2 not a float)
  float vignette = smoothstep(0.0, 0.5, 1.0 - length(uv - vec2(0.5)));
  alpha *= vignette;

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
