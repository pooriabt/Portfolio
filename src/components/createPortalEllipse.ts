// components/createPortalEllipse.ts
import * as THREE from "three";
import { createDigitalRainShader } from "./createDigitalRainShader";

/**
 * Creates a portal ellipse with shader-based effects
 * @param params Configuration for the portal
 * @returns Object containing mesh, material, and uniforms
 */
export function createPortalEllipse(params: {
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
    uBrushRotation: { value: 0.0 }, // Rotation speed for brush border
  };

  const vertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

  const digitalRainFunc = params.useDigitalRain
    ? createDigitalRainShader()
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
    uniform float uBrushRotation;
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

    // Hash functions for random brush patterns
    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }
    float hash2(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    
    // Smooth noise for continuous brush texture
    float smoothNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      
      float a = hash2(i);
      float b = hash2(i + vec2(1.0, 0.0));
      float c = hash2(i + vec2(0.0, 1.0));
      float d = hash2(i + vec2(1.0, 1.0));
      
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    
    // Helper function to create brush layer with specific width (must be defined before use)
    float getBrushLayerWithWidth(vec2 screenUv, vec2 center, vec2 holeRadius, float angle, float seed, float radialOffset, float angleOffset, float brushWidth) {
      // Convert to elliptical coordinates
      vec2 diff = screenUv - center;
      vec2 ellipseNorm = diff;
      ellipseNorm.x /= holeRadius.x;
      ellipseNorm.y /= holeRadius.y;
      float ellipseDist = length(ellipseNorm);
      
      // Distance from edge with radial offset for this line
      float edgeDist = ellipseDist - 1.0 + radialOffset;
      
      // Valid range for this line - wider range to accommodate lines at different positions
      // Allow lines both inside and outside the ellipse
      // Use step function instead of if for WebGL compatibility
      float isInside = step(radialOffset, 0.0); // 1.0 if inside, 0.0 if outside
      
      // Range for lines inside ellipse (negative offset)
      float insideRange = smoothstep(-0.05, -0.02, edgeDist) * smoothstep(-0.005, -0.02, edgeDist);
      
      // Range for lines outside ellipse (positive offset)
      float outsideRange = smoothstep(0.02, 0.005, edgeDist) * smoothstep(0.005, 0.025, edgeDist);
      
      // Mix based on whether line is inside or outside
      float validRange = mix(outsideRange, insideRange, isInside);
      // Multiply by validRange at end instead of early return
      
      // Convert to angle around ellipse with angle offset
      float currentAngle = atan(diff.y / holeRadius.y, diff.x / holeRadius.x);
      
      // Rotate for smooth spinning with per-line angle variation
      float rotatedAngle = currentAngle - angle + angleOffset;
      rotatedAngle = rotatedAngle + 3.14159;
      rotatedAngle = rotatedAngle - floor(rotatedAngle / 6.28318) * 6.28318;
      
      float angleCoord = rotatedAngle * 0.159;
      vec2 brushCoord = vec2(angleCoord * 150.0 + seed * 10.0, edgeDist * 40.0);
      
      // Use specified brush width instead of calculated
      float brushThickness = brushWidth;
      
      // Add some variation to width along the stroke
      float thicknessVar = sin(rotatedAngle * 2.0 + seed) * 0.002;
      brushThickness += thicknessVar;
      
      // IRREGULAR, FRAYED EDGES with line-specific noise
      vec2 outerNoiseCoord = vec2(angleCoord * 200.0, edgeDist * 50.0 + seed + radialOffset * 100.0);
      float outerFray = 
        smoothNoise(outerNoiseCoord) * 0.03 +
        smoothNoise(outerNoiseCoord * 2.5) * 0.015 +
        smoothNoise(outerNoiseCoord * 5.0) * 0.008;
      
      vec2 innerNoiseCoord = vec2(angleCoord * 185.0, edgeDist * 48.0 + seed * 1.3 + radialOffset * 95.0);
      float innerFray = 
        smoothNoise(innerNoiseCoord) * 0.03 +
        smoothNoise(innerNoiseCoord * 2.3) * 0.015 +
        smoothNoise(innerNoiseCoord * 4.7) * 0.008;
      
      float distFromCenter = abs(edgeDist);
      
      // Create brush shape with irregular edges
      float outerEdgeDist = (distFromCenter - brushThickness) - outerFray;
      float outerAlpha = 1.0 - smoothstep(0.0, 0.010, outerEdgeDist);
      float outerMicroFray = smoothNoise(brushCoord * vec2(300.0, 80.0) + seed + radialOffset * 50.0) * 0.002;
      outerAlpha *= (0.55 + smoothNoise(brushCoord * vec2(400.0, 100.0) + seed * 2.0 + radialOffset * 60.0) * 0.45);
      outerAlpha = smoothstep(0.0, 0.015, outerAlpha + outerMicroFray - 0.008);
      
      float innerEdgeDist = (brushThickness - distFromCenter) - innerFray;
      float innerAlpha = 1.0 - smoothstep(0.0, 0.010, innerEdgeDist);
      float innerMicroFray = smoothNoise(brushCoord * vec2(280.0, 75.0) + seed * 1.5 + radialOffset * 45.0) * 0.002;
      innerAlpha *= (0.6 + smoothNoise(brushCoord * vec2(380.0, 95.0) + seed * 2.3 + radialOffset * 55.0) * 0.4);
      innerAlpha = smoothstep(0.0, 0.015, innerAlpha + innerMicroFray - 0.008);
      
      float lineAlpha = min(outerAlpha, innerAlpha);
      
      // Bristle texture - different per line
      vec2 bristleCoord = vec2(angleCoord * 300.0, distFromCenter * 200.0);
      float bristle = smoothNoise(bristleCoord + seed + radialOffset * 200.0);
      lineAlpha *= (0.5 + bristle * 0.5);
      
      // Opacity variation per line
      float opacityVar = sin(rotatedAngle * 2.1 + seed + radialOffset * 100.0) * 0.15;
      lineAlpha *= (0.7 + opacityVar);
      
      // Apply falloffs - wider range for lines at different positions
      float insideFalloff = smoothstep(-0.05, -0.015, edgeDist);
      float outsideFalloff = smoothstep(0.025, 0.0, edgeDist);
      float falloff = mix(outsideFalloff, insideFalloff, step(0.0, edgeDist));
      
      lineAlpha *= falloff;
      // Apply valid range mask (multiplies to 0 if outside range)
      lineAlpha *= validRange;
      
      return lineAlpha;
    }

    // Generate a single brush layer with offset and variations (keeping for backwards compatibility)
    float getBrushLayer(vec2 screenUv, vec2 center, vec2 holeRadius, float angle, float seed, float layerOffset, float angleOffset) {
      // Convert to elliptical coordinates
      vec2 diff = screenUv - center;
      vec2 ellipseNorm = diff;
      ellipseNorm.x /= holeRadius.x;
      ellipseNorm.y /= holeRadius.y;
      float ellipseDist = length(ellipseNorm);
      
      // Distance from edge with layer offset (each layer slightly offset)
      float edgeDist = ellipseDist - 1.0 + layerOffset * 0.002;
      
      // Wider range for visible brush stroke
      float validRange = smoothstep(0.08, -0.06, edgeDist) * smoothstep(-0.05, -0.015, edgeDist);
      
      // Convert to angle around ellipse with angle offset
      float currentAngle = atan(diff.y / holeRadius.y, diff.x / holeRadius.x);
      
      // Rotate for smooth spinning with per-layer angle variation
      float rotatedAngle = currentAngle - angle + angleOffset;
      rotatedAngle = rotatedAngle + 3.14159;
      rotatedAngle = rotatedAngle - floor(rotatedAngle / 6.28318) * 6.28318;
      
      float angleCoord = rotatedAngle * 0.159; // Normalized 0-1
      vec2 brushCoord = vec2(angleCoord * 150.0 + seed * 10.0, edgeDist * 40.0);
      
      // Thickness with layer variation - reduced for thinner brush
      float thicknessBase = 0.007 + layerOffset * 0.002; // Thinner base, each layer slightly different
      float thicknessVar = 
        sin(rotatedAngle * 1.8 + seed + layerOffset) * 0.004 +
        sin(rotatedAngle * 4.3 + seed * 1.7 + layerOffset * 2.0) * 0.002 +
        smoothNoise(vec2(angleCoord * 25.0, seed * 0.5 + layerOffset)) * 0.005;
      float brushThickness = thicknessBase + thicknessVar;
      
      // IRREGULAR, FRAYED EDGES - each layer has different noise pattern
      vec2 outerNoiseCoord = vec2(angleCoord * 200.0, edgeDist * 50.0 + seed + layerOffset * 5.0);
      float outerFray = 
        smoothNoise(outerNoiseCoord) * 0.035 +
        smoothNoise(outerNoiseCoord * 2.5) * 0.018 +
        smoothNoise(outerNoiseCoord * 5.0) * 0.009;
      
      vec2 innerNoiseCoord = vec2(angleCoord * 185.0, edgeDist * 48.0 + seed * 1.3 + layerOffset * 4.5);
      float innerFray = 
        smoothNoise(innerNoiseCoord) * 0.035 +
        smoothNoise(innerNoiseCoord * 2.3) * 0.018 +
        smoothNoise(innerNoiseCoord * 4.7) * 0.009;
      
      float distFromCenter = abs(edgeDist);
      
      // Create brush shape with irregular edges
      float outerEdgeDist = (distFromCenter - brushThickness) - outerFray;
      float outerAlpha = 1.0 - smoothstep(0.0, 0.012, outerEdgeDist);
      float outerMicroFray = smoothNoise(brushCoord * vec2(300.0, 80.0) + seed + layerOffset) * 0.002;
      outerAlpha *= (0.55 + smoothNoise(brushCoord * vec2(400.0, 100.0) + seed * 2.0 + layerOffset) * 0.45);
      outerAlpha = smoothstep(0.0, 0.018, outerAlpha + outerMicroFray - 0.008);
      
      float innerEdgeDist = (brushThickness - distFromCenter) - innerFray;
      float innerAlpha = 1.0 - smoothstep(0.0, 0.012, innerEdgeDist);
      float innerMicroFray = smoothNoise(brushCoord * vec2(280.0, 75.0) + seed * 1.5 + layerOffset) * 0.002;
      innerAlpha *= (0.6 + smoothNoise(brushCoord * vec2(380.0, 95.0) + seed * 2.3 + layerOffset) * 0.4);
      innerAlpha = smoothstep(0.0, 0.018, innerAlpha + innerMicroFray - 0.008);
      
      float layerAlpha = min(outerAlpha, innerAlpha);
      
      // Bristle texture - different per layer
      vec2 bristleCoord = vec2(angleCoord * 300.0, distFromCenter * 200.0);
      float bristle = smoothNoise(bristleCoord + seed + layerOffset * 3.0);
      layerAlpha *= (0.5 + bristle * 0.5);
      
      // Opacity variation per layer
      float opacityVar = sin(rotatedAngle * 2.1 + seed + layerOffset) * 0.2;
      layerAlpha *= (0.7 + opacityVar);
      
      // Apply falloffs
      float insideFalloff = smoothstep(-0.06, -0.015, edgeDist);
      float outsideFalloff = smoothstep(0.08, 0.02, edgeDist);
      float falloff = mix(outsideFalloff, insideFalloff, step(0.0, edgeDist));
      
      layerAlpha *= falloff * validRange;
      
      return layerAlpha;
    }
    
    // Generate 3 distinct brush lines at different distances from portal edge
    float getBrushEffect(vec2 screenUv, vec2 center, vec2 holeRadius, float angle, float seed) {
      // Create 3 separate brush lines at different radial positions with different widths
      // Lines are spaced further apart to be clearly visible as separate strokes
      
      // Line 1 - Closest to portal edge (thinnest line) - inside the ellipse
      float line1Offset = -0.025; // Further inside, clearly separated
      float line1Width = 0.006;   // Increased width (was 0.004)
      float line1 = getBrushLayerWithWidth(screenUv, center, holeRadius, angle, seed, line1Offset, 0.0, line1Width);
      
      // Line 2 - Middle distance (medium width line) - near edge
      float line2Offset = -0.010; // Near edge but inside
      float line2Width = 0.010;   // Increased width (was 0.007)
      float line2 = getBrushLayerWithWidth(screenUv, center, holeRadius, angle, seed, line2Offset, 0.0008, line2Width);
      
      // Line 3 - Furthest from portal edge (thickest line) - outside the ellipse
      float line3Offset = 0.012;   // Outside the ellipse, clearly separated
      float line3Width = 0.014;    // Increased width (was 0.010)
      float line3 = getBrushLayerWithWidth(screenUv, center, holeRadius, angle, seed, line3Offset, -0.0008, line3Width);
      
      // Combine the 3 lines - use max to keep them separate and distinct
      // This ensures each line remains visible as its own stroke
      float totalBrush = max(line1 * 0.75, max(line2 * 0.85, line3 * 0.9));
      // Don't clamp - keep natural opacity
      
      // Create gaps pattern (applies to all lines)
      float currentAngle = atan((screenUv.y - center.y) / holeRadius.y, (screenUv.x - center.x) / holeRadius.x);
      float rotatedAngle = currentAngle - angle;
      rotatedAngle = rotatedAngle + 3.14159;
      rotatedAngle = rotatedAngle - floor(rotatedAngle / 6.28318) * 6.28318;
      float angleCoord = rotatedAngle * 0.159;
      
      float gapBase = sin(rotatedAngle * 0.95 + seed * 0.4);
      gapBase = gapBase * 0.5 + 0.5;
      gapBase = pow(gapBase, 4.0);
      float gapNoise = smoothNoise(vec2(angleCoord * 12.0, seed * 1.2));
      float gapPattern = mix(gapBase, 1.0, smoothstep(0.15, 0.35, gapNoise));
      
      totalBrush *= gapPattern;
      
      return totalBrush;
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

      // Allow rendering slightly outside ellipse for brush border (to cover gaps)
      // Only discard if way outside the brush zone
      if (ellipseDist > 1.05) {
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
      // Swirl effect for arch canvas texture
      vec2 centered = uv - 0.5;
      float dist = length(centered);
      float angle = atan(centered.y, centered.x);
      
      // Animated swirl parameters
      float swirlStrength = 1.0; // How much twist
      float swirlSpeed = 0.3; // Animation speed
      float swirlRadius = 0.5; // Affected area
      
      // Calculate swirl amount based on distance from center
      float swirlAmount = smoothstep(swirlRadius, 0.0, dist) * swirlStrength;
      float angleOffset = swirlAmount * sin(t * swirlSpeed);
      
      // Apply swirl rotation
      float newAngle = angle + angleOffset;
      vec2 swirlUv = vec2(
        cos(newAngle) * dist,
        sin(newAngle) * dist
      ) + 0.5;
      
      // Add subtle wave distortion for more dynamic effect
      float wave = sin(dist * 12.0 - t * 1.2) * 0.015 * smoothstep(0.5, 0.0, dist);
      swirlUv += wave;
      
      // Sample texture with swirled coordinates
      vec4 tex = texture2D(uMap, swirlUv);
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

      // Irregular oil painting brush border - smoothly spinning around ellipse
      // Smooth rotation - use time directly for continuous animation
      float brushAngle = uTime * uBrushRotation;
      
      // Get irregular brush effect (frayed edges, varying thickness, gaps)
      float brushIntensity = getBrushEffect(screenUv, uCenter, uHoleRadius, brushAngle, uHue * 10.0);
      
      // Ellipse edge fade - extend slightly beyond 1.0 for brush effect
      // Use weaker fade in brush zone to allow extension
      float brushZoneFactor = step(0.01, brushIntensity); // 1.0 if in brush zone, 0.0 otherwise
      float normalFade = smoothstep(1.07, 0.98, ellipseDist);
      float brushZoneFade = smoothstep(1.07, 0.94, ellipseDist);
      float ellipseFade = mix(normalFade, brushZoneFade, brushZoneFactor);
      outAlpha *= ellipseFade * uAlpha;
      
      // Calculate gradient position along the spinning brush (0 = start/dark, 1 = end/light)
      // Get the angle around the ellipse for gradient calculation
      vec2 diff = screenUv - uCenter;
      float currentAngle = atan(diff.y / uHoleRadius.y, diff.x / uHoleRadius.x);
      float rotatedAngle = currentAngle - brushAngle;
      rotatedAngle = rotatedAngle + 3.14159;
      rotatedAngle = rotatedAngle - floor(rotatedAngle / 6.28318) * 6.28318;
      
      // Normalize angle to 0-1 range for gradient (0 = start, 1 = end)
      float gradientPos = rotatedAngle / 6.28318;
      
      // Create smooth gradient from dark (start) to lighter gray (end)
      float darkGray = 0.2;   // Dark gray at start
      float lightGray = 0.35; // Lighter gray at end (current color)
      
      // Smooth transition - use smoothstep for gradual color shift from start to end
      // This creates a natural gradient that fades from dark to light
      float gradientFactor = smoothstep(0.0, 1.0, gradientPos);
      float grayValue = mix(darkGray, lightGray, gradientFactor);
      
      // Brush color - gradient from dark to light gray
      vec3 brushColor = vec3(grayValue, grayValue, grayValue);
      
      // Mix brush with existing color - darker appearance
      float brushMix = brushIntensity * 0.75; // Slightly higher opacity to maintain visibility with darker color
      outCol = mix(outCol, brushColor, brushMix);
      // Ensure brush shows even if base alpha is low (for gap coverage) - reduced opacity
      outAlpha = max(outAlpha, brushIntensity * uAlpha * 0.7);

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
