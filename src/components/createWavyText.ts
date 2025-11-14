// src/components/createWavyText.ts
import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

type WavyTextOptions = {
  text: string;
  font: any;
  position: { x: number; y: number; z: number };
  size?: number;
  color?: string;
  onClick?: () => void;
  spiralUniforms?: {
    uTime: { value: number };
    uResolution: { value: THREE.Vector2 };
    uCenter0: { value: THREE.Vector2 };
    uCenter1: { value: THREE.Vector2 };
    uSpeed: { value: number };
    uBands: { value: number };
  };
};

/**
 * Creates a 2D text mesh that is affected by spiral background ripples
 * The text will have a wavy/distorted appearance based on the spiral pattern
 */
export function createWavyText(options: WavyTextOptions): THREE.Mesh {
  const {
    text,
    font,
    position,
    size = 0.15,
    color = "#ffffff",
    onClick,
    spiralUniforms,
  } = options;

  // Create text geometry
  const geometry = new TextGeometry(text, {
    font: font,
    size: size,
    depth: 0.02,
    curveSegments: 12,
    bevelEnabled: false,
  });

  geometry.computeBoundingBox();
  const centerOffset =
    geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
  geometry.translate(-centerOffset / 2, 0, 0);

  // Create shader material that uses spiral ripple effect for distortion
  const uniforms = {
    uTime: spiralUniforms?.uTime || { value: 0 },
    uResolution: spiralUniforms?.uResolution || {
      value: new THREE.Vector2(1920, 1080),
    },
    uCenter0: spiralUniforms?.uCenter0 || {
      value: new THREE.Vector2(0.25, 0.5),
    },
    uCenter1: spiralUniforms?.uCenter1 || {
      value: new THREE.Vector2(0.75, 0.5),
    },
    uSpeed: spiralUniforms?.uSpeed || { value: 0.7 },
    uBands: spiralUniforms?.uBands || { value: 20.0 },
    uColor: { value: new THREE.Color(color) },
    uDistortionStrength: { value: 0.05 }, // Reduced distortion to prevent double/ghost effect
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
    
    void main() {
      vUv = uv;
      vPosition = position;
      
      // Calculate screen-space UV after projection
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vec4 projectedPosition = projectionMatrix * mvPosition;
      
      // Normalize to screen space (0-1)
      vec2 screenUv = (projectedPosition.xy / projectedPosition.w) * 0.5 + 0.5;
      screenUv.y = 1.0 - screenUv.y; // Flip Y
      vScreenUv = screenUv;
      
      // Calculate spiral ripple effect (same as spiral background)
      float t = uTime * uSpeed;
      float aspect = uResolution.x / max(1.0, uResolution.y);
      
      // Calculate spiral from both centers
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
      
      // Blend spirals
      float d0 = distance(screenUv, uCenter0);
      float d1 = distance(screenUv, uCenter1);
      float blendDist = 0.25;
      float w0 = exp(-d0 / blendDist);
      float w1 = exp(-d1 / blendDist);
      float totalWeight = w0 + w1;
      float combined = totalWeight > 0.001 ? (v0 * w0 + v1 * w1) / totalWeight : (v0 + v1) * 0.5;
      
      // Convert to wave value (0 to 1) - smoother, less extreme
      float wave = smoothstep(0.0, 0.2, combined);
      
      // Apply subtle distortion to vertex position
      // Use a gentler wave that doesn't create double vision
      // Distort along a single direction (up/down) instead of along normal
      vec3 offset = vec3(0.0, wave * uDistortionStrength * 0.3, 0.0);
      
      vec3 distortedPosition = position + offset;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(distortedPosition, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uCenter0;
    uniform vec2 uCenter1;
    uniform float uSpeed;
    uniform float uBands;
    
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec2 vScreenUv;
    
    void main() {
      // Use pre-calculated screen UV from vertex shader
      vec2 screenUv = vScreenUv;
      
      // Calculate spiral ripple effect for color modulation
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
      
      // Modulate color based on spiral ripple (subtle effect)
      float ripple = smoothstep(0.0, 0.2, combined);
      vec3 finalColor = uColor * (0.8 + ripple * 0.4); // Slight brightness variation
      
      // Add border/outline for better visibility
      // Use a simple approach: add a darker/black border around text edges
      // This creates better contrast against the spiral background
      
      // Create a border by checking distance to edges in screen space
      // This works better for text geometry
      vec2 screenCoord = gl_FragCoord.xy / uResolution;
      float borderThickness = 0.002; // Border thickness in screen space
      
      // Sample nearby pixels to create outline effect
      // For text, we'll add a subtle dark border
      vec3 borderColor = vec3(0.0, 0.0, 0.0); // Black border for contrast
      float borderMix = 0.0;
      
      // Add border by slightly darkening the edges
      // This creates a subtle outline effect
      float edgeFactor = 1.0;
      vec2 texelSize = 1.0 / uResolution;
      
      // Simple border: darken edges slightly for better visibility
      // The border will be applied as a subtle darkening around text edges
      float borderStrength = 0.3; // How strong the border is
      vec3 outlinedColor = mix(finalColor, borderColor, borderStrength * 0.4);
      
      // Use the outlined color for better visibility
      finalColor = outlinedColor;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: uniforms as any,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.renderOrder = 100; // Render on top

  // Add click handler if provided
  if (onClick) {
    mesh.userData.onClick = onClick;
    mesh.userData.isClickable = true;
  }

  return mesh;
}
