// components/createPortalEllipse.ts
import * as THREE from "three";
import { createDigitalRainShader } from "./createDigitalRainShader";
import { glsl, hashFns, hsv2rgbFn, brushHelpers, smoothNoiseFn } from "./glsl";

/**
 * Creates a portal ellipse with shader-based effects
 * @param params Configuration for the portal
 * @returns Object containing mesh, material, and uniforms
 */
export function createPortalEllipse(params: {
  texture: THREE.Texture | null;
  hue?: number;
  useDigitalRain?: boolean;
  brushWidth?: number;
  brushOuterScale?: number;
  borderColor?: THREE.ColorRepresentation;
  brushBorderColor?: THREE.ColorRepresentation;
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
    uShowClickEllipse: { value: 0.0 }, // Show click ellipse overlay (0 = hide, 1 = show)
    uBrushWidth: { value: params.brushWidth ?? 5.0 },
    uRenderBrushOnly: { value: 0.0 },
    uBrushOuterScale: { value: params.brushOuterScale ?? 5.0 },
  };

  const vertex = glsl`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const digitalRainFunc = params.useDigitalRain
    ? createDigitalRainShader()
    : "";

  const fragment = glsl`
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
    uniform float uShowClickEllipse;
    uniform float uBrushWidth;
    uniform float uRenderBrushOnly;
    uniform float uBrushOuterScale;
    ${
      params.useDigitalRain
        ? glsl`
    uniform float uSpeed;
    uniform float uDensity;
    uniform vec3 uRainColor;
    `
        : ""
    }

    ${hsv2rgbFn}
    ${hashFns}
    ${smoothNoiseFn}
    ${brushHelpers}
    ${digitalRainFunc}

    void main() {
      vec2 uv = vUv;
      vec2 screenUv = gl_FragCoord.xy / uResolution;
      vec2 diffScreen = screenUv - uCenter;

      vec2 ellipseNorm = diffScreen;
      ellipseNorm.x /= uHoleRadius.x;
      ellipseNorm.y /= uHoleRadius.y;
      float ellipseDist = length(ellipseNorm);

      // Elliptical clipping - use alpha instead of discard to remove rectangular clipping
      // This allows rendering outside mesh bounds by controlling visibility with alpha
      float clipEllipseDist = ellipseDist / uBrushOuterScale; // Scale to create larger clipping ellipse
      
      // Don't discard - use alpha to fade out beyond clipping boundary instead
      // This prevents rectangular mesh geometry from clipping the ellipse
      float clipFade = 1.0 - smoothstep(
        uBrushOuterScale - 0.2,
        uBrushOuterScale + 0.2,
        ellipseDist
      );

      float t = uTime * 1.5;

      // Base texture color
      vec3 baseColor = vec3(0.05);
      float baseAlpha = 1.0;

      if (uRenderBrushOnly < 0.5) {
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
      } else {
        baseColor = vec3(0.0);
        baseAlpha = 0.0;
      }

      // Portal hole effect (no spiral animation)
      // When uSpread=0 (open), holeRadius=7.0 (70% of texture - bigger hole)
      // When uSpread=1 (closed), holeRadius=0.0 (no hole)
      float holeRadius = mix(0.7, 0.0, uSpread);
      float holeSmooth = 0.15;
      float holeMask = 1.0 - smoothstep(holeRadius - holeSmooth, holeRadius + holeSmooth, ellipseDist);

      // Simple color output - just base texture
      vec3 outCol = baseColor;

      // Alpha: create transparent hole when open (uSpread=0), full texture when closed (uSpread=1)
      float outAlpha = baseAlpha * (1.0 - holeMask * (1.0 - uSpread));

      // Irregular oil painting brush border - smoothly spinning around ellipse
      // Smooth rotation - use time directly for continuous animation
      float brushAngle = uTime * uBrushRotation;
      
      // Calculate mesh boundary in UV space to align brush inner edge with mesh border
      // Mesh boundary is at UV distance 0.5 from center (circle radius 0.5)
      // Convert UV boundary to screen-space: mesh UV boundary corresponds to portal ellipse size
      // Brush inner edge should align with mesh border (portal boundary), outer edge extends beyond
      vec2 uvCentered = vUv - 0.5;
      float uvDistFromCenter = length(uvCentered) * 2.0; // Normalize: max distance from center in UV is 0.707, *2 = ~1.414
      
      // Calculate mesh boundary ellipse in screen space
      // When uvDistFromCenter = 1.0, we're at mesh boundary (radius 0.5 in UV = normalized 1.0)
      // At mesh boundary, the screen-space ellipse should match uHoleRadius
      float brushRadiusScale = 1.0 + clamp(uBrushWidth - 1.0, 0.0, 8.0) * 0.02;
      vec2 meshBoundaryRadius = uHoleRadius * brushRadiusScale;
      
      // Get irregular brush effect (frayed edges, varying thickness, gaps)
      // Brush inner edge aligns with mesh boundary (portal ellipse), extends outward
      float brushIntensity = getBrushEffect(
        screenUv,
        uCenter,
        meshBoundaryRadius,
        brushAngle,
        uHue * 10.0,
        uBrushWidth
      );
      
      // Ellipse edge fade - extend beyond 1.0 for brush effect to cover SpiralBackground
      // Brush should extend with half width outside portal, so fade starts later
      float brushZoneFactor = step(0.01, brushIntensity); // 1.0 if in brush zone, 0.0 otherwise
      float normalFade = smoothstep(uBrushOuterScale + 0.3, 0.98, ellipseDist); // Extend fade range for brush extension
      float brushZoneFade = smoothstep(uBrushOuterScale + 0.3, 0.88, ellipseDist); // Allow brush to extend further out
      float ellipseFade = mix(normalFade, brushZoneFade, brushZoneFactor);
      // Apply clipping fade to remove rectangular clipping - fade out beyond clipping boundary
      outAlpha *= ellipseFade * uAlpha ;
      
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

      // Allow brush to render outside mesh boundary by not making border transparent
      // The brush will extend beyond mesh UV bounds, but since we use screen-space coordinates
      // and don't discard, pixels outside mesh will still render if they're within render bounds

      // Draw click ellipse overlay (ORANGE) - CLICK HANDLER - triggered when portal is clicked
      if (uShowClickEllipse > 0.5) {
        // Use full texture dimensions (same as clipping - covers entire texture)
        vec2 clickCenter = vec2(0.5, 0.5); // Center of texture in UV space
        vec2 clickRadius = vec2(0.5, 0.5); // Full texture dimensions (half width/height = full size)
        vec2 clickDiff = vUv - clickCenter;
        vec2 clickEllipseNorm = clickDiff;
        clickEllipseNorm.x /= clickRadius.x;
        clickEllipseNorm.y /= clickRadius.y;
        float clickEllipseDist = length(clickEllipseNorm);
        
        // Draw orange ellipse border (15px equivalent - very thick for visibility)
        float ellipseBorder = abs(clickEllipseDist - 1.0);
        float borderWidth = 0.015; // Border width (increased for visibility - matches canvas version)
        float ellipseAlpha = 1.0 - smoothstep(0.0, borderWidth, ellipseBorder);
        
        if (ellipseAlpha > 0.0) {
          vec3 orangeColor = vec3(1.0, 0.533, 0.0); // Orange color (#ff8800)
          outCol = mix(outCol, orangeColor, ellipseAlpha); // Orange - click ellipse (click handler)
        }
      }

      gl_FragColor = vec4(outCol, outAlpha);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: uniforms as any,
    transparent: true,
    depthWrite: false,
    depthTest: false, // Disable depth test to prevent clipping
    side: THREE.DoubleSide,
    blending: params.useDigitalRain
      ? THREE.AdditiveBlending
      : THREE.NormalBlending,
    // Prevent any culling or clipping
    alphaTest: 0.0, // Allow all pixels to render
  });

  // Create elliptical geometry to match portal shape - removes rectangular clipping
  // Base geometry size is 0.5 (radius) - actual portal size determined by DoorScene scaling
  // Mesh is scaled larger in DoorScene to allow brush to render outside portal boundary
  const segments = 64; // High detail for smooth ellipse
  const geo = new THREE.CircleGeometry(0.5, segments); // Base radius 0.5 (diameter 1.0)
  const mesh = new THREE.Mesh(geo, mat);


  const brushOuterScale = uniforms.uBrushOuterScale.value as number;
  const brushInnerScale = 1.0;
  const brushOuterRadius = 0.5 * brushOuterScale;
  const brushInnerRadius = 0.5 * brushInnerScale;
  const brushGeo = new THREE.RingGeometry(brushInnerRadius, brushOuterRadius, segments);
  const brushUniforms = THREE.UniformsUtils.clone(mat.uniforms as any);
  const sharedUniformKeys = [
    "uTime",
    "uSpread",
    "uScale",
    "uHue",
    "uAlpha",
    "uMap",
    "uResolution",
    "uHoleRadius",
    "uCenter",
    "uBrushRotation",
    "uBrushWidth",
    "uBrushOuterScale",
  ] as const;
  sharedUniformKeys.forEach((key) => {
    brushUniforms[key] = uniforms[key];
  });
  brushUniforms.uRenderBrushOnly.value = 1.0;
  const brushMat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: brushUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: mat.blending,
  });
  const brushMesh = new THREE.Mesh(brushGeo, brushMat);
  brushMesh.position.z = 0.0001;
  brushMesh.name = "portalBrushRing";
  mesh.add(brushMesh);

  return { mesh, mat, uniforms, brushMesh };
}
