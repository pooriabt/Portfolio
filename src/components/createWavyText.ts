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
    uDistortionStrength: { value: 0.05 }, // Increased for visible ripple effect
    uRippleIntensity: { value: 0.2 }, // Decreased ripple intensity
    uBorderColor: { value: new THREE.Color(0x00ffff) }, // Cyan border color
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
    varying float vRippleValue; // Pass ripple value to fragment shader
    
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
      
      // Convert to wave value (0 to 1) - create visible ripple pattern
      // Use the raw combined value for more dynamic ripple effect
      float ripple = combined; // Raw spiral value (-1 to 1)
      float wave = ripple * 0.5 + 0.5; // Convert to 0-1 range
      
      // Pass ripple value to fragment shader for color modulation
      vRippleValue = ripple;
      
      // Apply visible distortion to vertex position
      // Create multi-directional ripple distortion for more organic effect
      // Distort both horizontally and vertically based on ripple pattern
      vec2 rippleDir = normalize(p0 + p1); // Direction of ripple
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
    uniform vec2 uResolution;
    uniform vec2 uCenter0;
    uniform vec2 uCenter1;
    uniform float uSpeed;
    uniform float uBands;
    uniform float uRippleIntensity;
    uniform vec3 uBorderColor;
    
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec2 vScreenUv;
    varying float vRippleValue;
    
    void main() {
      // Create visible ripple effect on text
      // Use the ripple value passed from vertex shader (raw spiral value -1 to 1)
      // This is already calculated in vertex shader, no need to recalculate
      float ripple = vRippleValue;
      
      // Create wave pattern that makes text more visible when ripple passes through
      // Convert ripple (-1 to 1) to a wave pattern (0 to 1)
      float rippleWave = ripple * 0.5 + 0.5; // 0 to 1
      
      // Create pulsing/glowing effect when ripple is strong
      // Text becomes brighter and more opaque when ripple wave passes through
      float rippleStrength = abs(ripple); // 0 to 1, how strong the ripple is
      
      // Base opacity - text is always visible
      float baseOpacity = 0.95;
      
      // Ripple effect: text becomes more visible (brighter, more opaque) when ripple passes
      // Create a wave that travels across the text
      float rippleGlow = sin(ripple * 3.14159) * 0.5 + 0.5; // Convert to 0-1 wave
      
      // Apply ripple intensity (decreased)
      float brightnessBoost = 1.0 + rippleGlow * 0.2 * uRippleIntensity;
      float opacityBoost = rippleGlow * 0.1 * uRippleIntensity;
      
      // Final color with ripple effect
      vec3 finalColor = uColor * brightnessBoost;
      float finalOpacity = min(1.0, baseOpacity + opacityBoost);
      
      // Add colored border/outline ONLY on outer edges
      // Text surface color should remain unchanged - only border gets color
      vec2 texelSize = 1.0 / uResolution;
      
      // Create outline effect using screen-space edge detection
      // This detects the actual edges of the text geometry
      vec2 screenCoord = gl_FragCoord.xy;
      
      // Calculate edge detection using screen-space derivatives
      // This will be high at geometry edges, low in the center
      float edgeX = length(dFdx(vScreenUv));
      float edgeY = length(dFdy(vScreenUv));
      float edge = max(edgeX, edgeY);
      
      // Detect edges more precisely
      // Adjust threshold to catch only the actual geometry edges
      float edgeThreshold = 0.0008;
      float edgeStrength = smoothstep(edgeThreshold, edgeThreshold * 4.0, edge);
      
      // Create border outline - only on the very edge of the geometry
      // Use a narrow border width to create a clean outline
      float borderWidth = 0.0015; // Border width in normalized screen space
      float borderFactor = smoothstep(borderWidth * 0.3, borderWidth, edgeStrength);
      
      // Ensure border only appears on actual edges (not in text center)
      // Use a threshold to filter out weak edge signals
      float borderThreshold = 0.6;
      float showBorder = step(borderThreshold, borderFactor);
      
      // Apply border color ONLY on edges
      // Text surface (finalColor) remains completely unchanged
      vec3 borderColor = uBorderColor;
      
      // Mix: border color on edges ONLY, original text color everywhere else
      // This ensures text surface is NOT affected by border color
      vec3 outlinedColor = mix(finalColor, borderColor, showBorder);
      
      // Final color - text surface color preserved, only border has color
      finalColor = outlinedColor;
      
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
    depthWrite: false, // Important for proper rendering with transparency
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.renderOrder = 100; // Render on top

  // Store initial values for animation
  const initialScale = 1.0;
  const initialDistortionStrength = uniforms.uDistortionStrength.value;
  const initialRippleIntensity = uniforms.uRippleIntensity.value;

  // Add click handler if provided
  if (onClick) {
    mesh.userData.onClick = onClick;
    mesh.userData.isClickable = true;
    mesh.userData.initialScale = initialScale;
    mesh.userData.initialDistortionStrength = initialDistortionStrength;
    mesh.userData.initialRippleIntensity = initialRippleIntensity;
    mesh.userData.isAnimating = false;
  }

  return mesh;
}
