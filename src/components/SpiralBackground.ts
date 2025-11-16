// src/components/SpiralBackground.ts
import * as THREE from "three";
import { projectObjectToScreenUv, setPortalHoleRadius } from "./portalMath";

/**
 * createSpiralBackground(scene, camera, renderer, leftObj, rightObj)
 * - scene/camera/renderer: three core
 * - leftObj/rightObj: objects whose screen positions will become spiral centers
 *
 * Returns: { mesh, update(time), resize(), dispose() }
 */
type SpiralBackgroundOptions = {
  parent?: THREE.Object3D;
};

export function createSpiralBackground(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  leftObj: THREE.Object3D,
  rightObj: THREE.Object3D,
  options?: SpiralBackgroundOptions
) {
  const parent = options?.parent ?? scene;

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
    uHoleRadiusOuter: { value: new THREE.Vector2(0.11, 0.11) },
    uSpeed: { value: 0.7 },
    uBands: { value: 20.0 },
    uContrast: { value: 1.0 },
    // gradient/pulse/scroll uniforms
    uGradientColor: { value: new THREE.Color(0x00bcd4) }, // teal-ish
    // portion from top where gradient starts (0.25 => start at 25% down from top)
    uGradientStartFromTop: { value: 0.25 },
    uGradientStrength: { value: 0.9 },
    uPulseSpeed: { value: 1.8 },
    // 1 at rest, fades to 0 when scrolling
    uScrollFade: { value: 1.0 },
    // flow animation down the triangle
    uGradientFlowSpeed: { value: 0.3 },
    uGradientBandWidth: { value: 0.22 },
    // base half-width of the triangle at its top line (in uv x units)
    uTriBaseHalfWidth: { value: 0.17 },
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
    uniform vec2 uHoleRadiusOuter;
  uniform float uSpeed;
  uniform float uBands;
  uniform float uContrast;
  // gradient/pulse/scroll
  uniform vec3 uGradientColor;
  uniform float uGradientStartFromTop;
  uniform float uGradientStrength;
  uniform float uPulseSpeed;
  uniform float uScrollFade;
  uniform float uGradientFlowSpeed;
  uniform float uGradientBandWidth;
  uniform float uTriBaseHalfWidth;

  // Band shape helper (creates a single moving band centered at phase 'o')
  float bandAt(float o, float ss, float width) {
    float h = smoothstep(o - width, o, ss);
    float tt = 1.0 - smoothstep(o, o + width, ss);
    return clamp(h * tt, 0.0, 1.0);
  }
  
  // Distance from point p to segment AB (screen-space)
  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }
  
  // Projection parameter t of p onto AB (0..1)
  float segT(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return t;
  }

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
    
    // Create smooth blend using inverse distance weighting with improved falloff
    float blendDist = 0.25; // transition distance (slightly increased for smoother blend)
    float w0 = exp(-d0 / blendDist);
    float w1 = exp(-d1 / blendDist);
    float totalWeight = w0 + w1;
    
    // Blend the spiral values smoothly, with fallback to avoid division issues
    float combined = totalWeight > 0.001 ? (v0 * w0 + v1 * w1) / totalWeight : (v0 + v1) * 0.5;
    
    // Smooth out artifacts in the middle region where spirals meet
    // This prevents the white line artifact when windows are resized
    float midDist = abs(uv.x - 0.5);
    float centerDist = distance(uv, vec2(0.5, 0.5));
    float midSmooth = smoothstep(0.2, 0.4, midDist) * smoothstep(0.0, 0.3, centerDist);
    combined = mix(combined, (v0 + v1) * 0.5, (1.0 - midSmooth) * 0.4);
    
    // Convert to bands
    float band = smoothstep(0.0, 0.2, combined);
    
    // Elliptical holes (independent x/y scaling) - both portals use same size/shape
    // When hole radius is 0, make everything fully visible
    float holeRadiusMax = max(uHoleRadiusOuter.x, uHoleRadiusOuter.y);
    float alpha = 1.0;
    
    if (holeRadiusMax > 0.001) {
    vec2 hp0 = uv - uCenter0;
      hp0.x /= max(uHoleRadiusOuter.x, 0.001);
      hp0.y /= max(uHoleRadiusOuter.y, 0.001);
    float outer0 = length(hp0);
    
    vec2 hp1 = uv - uCenter1;
      hp1.x /= max(uHoleRadiusOuter.x, 0.001);
      hp1.y /= max(uHoleRadiusOuter.y, 0.001);
    float outer1 = length(hp1);

    float outerDist = min(outer0, outer1);
      alpha = smoothstep(1.0, 1.35, outerDist);
    }

    // base b/w spiral color
    vec3 color = mix(vec3(0.0), vec3(1.0), band);

    // ===== Gradient overlay only on white bands, triangular region, animated downward =====
    // Determine "white band" mask (apply on bright parts only)
    float whiteMask = smoothstep(0.7, 0.95, band);

    // Triangle-shaped region centered horizontally, from a soft/rippling base line down to a pointy apex
    // Edges ripple following the spiral's white bands
    float baseY = 1.0 - clamp(uGradientStartFromTop, 0.0, 1.0);
    float s = clamp((baseY - uv.y) / max(baseY, 1e-5), 0.0, 1.0); // 0 at base, 1 at bottom
    float halfWidthBase = clamp(uTriBaseHalfWidth, 0.06, 0.5);
    // Make triangle: wide at base, pointy at bottom
    float halfWidth = halfWidthBase * (1.0 - s);

    // Ripple signal from spiral, stronger where white bands
    float whiteMaskLocal = smoothstep(0.6, 0.95, band);
    float rippleSignal = combined;
    float edgeRipple = whiteMaskLocal * rippleSignal * 0.06 * (0.6 + 0.4 * s);

    // Soft, rippling top boundary (no firm line)
    float topRipple = whiteMaskLocal * rippleSignal * 0.03;
    float topY = baseY + topRipple;
    float topSoft = smoothstep(topY + 0.02, topY - 0.02, uv.y);

    float leftEdge = 0.5 - halfWidth - edgeRipple;
    float rightEdge = 0.5 + halfWidth + edgeRipple;
    float sideMask = step(leftEdge, uv.x) * step(uv.x, rightEdge);
    float triMask = topSoft * sideMask;

    // Pulsing factor (0..1)
    float pulse = 0.5 + 0.5 * sin(uTime * uPulseSpeed);

    // Moving bands (3 parallel lines) from base (top) to apex (bottom center)
    float offset = fract(t * uGradientFlowSpeed);
    float w = clamp(uGradientBandWidth, 0.01, 0.5);
    // Evenly spaced phases
    float offset1 = offset;
    float offset2 = fract(offset + 0.3333);
    float offset3 = fract(offset + 0.6666);
    float movingBand = bandAt(offset1, s, w) + bandAt(offset2, s, w) + bandAt(offset3, s, w);
    movingBand = clamp(movingBand, 0.0, 1.0);

    // Disable triangle-wide color tint so only lines render over the spiral
    // float gradIntensity = uGradientStrength * whiteMask * triMask * movingBand * uScrollFade;
    // color = mix(color, uGradientColor, gradIntensity);
    
    // Do not apply a triangle-wide alpha gradient; keep base alpha from outer ellipse only
    float triAlphaMask = whiteMask * triMask;
    
    // ===== Five animated guide lines inside the triangle, adapting to white-band ripples =====
    // Top edge endpoints at baseY (horizontal top of triangle)
    // Ensure perfect symmetry: left and right sides are balanced
    float leftXTop = 0.5 - halfWidthBase;
    float rightXTop = 0.5 + halfWidthBase;
    vec2 apex = vec2(0.5, 0.0); // Intersection point of all 5 lines (scale pivot)

    // Scale factor: scale lines by 1.5 from the apex point
    // Ensure symmetric scaling for left and right
    float lineScale = 1.5;

    // Visual parameters - lines adapt smoothly to spiral white spaces
    float baseLineWidth = 0.018;        // width for detecting white spaces along line paths
    float lineRippleAmp = 0.025;        // stronger ripple to smoothly adapt to spiral white bands
    float lineRippleSpeed = 0.8;        // ripple speed
    float lineGradWidth = 0.22;         // gradient band width along line
    float lineColorStrength = 1.5;     // strength of color applied to white spaces

    float whiteBoost = whiteMaskLocal;  // stronger on white bands

    float totalLineMask = 0.0;
    float totalGradBand = 0.0;

    // Unrolled loop for i=0..4 (five top points -> five lines to apex)
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float tTop = fi / 4.0;
      float xTop = mix(leftXTop, rightXTop, tTop);
      vec2 aOriginal = vec2(xTop, baseY);
      
      // Scale the top point from the apex (scale pivot)
      // Vector from apex to original top point
      vec2 apexToTop = aOriginal - apex;
      // Scale the vector by lineScale
      vec2 scaledApexToTop = apexToTop * lineScale;
      // New scaled top point
      vec2 a = apex + scaledApexToTop;
      
      // For outer lines (indices 0 and 4), extend 50% longer upward (beyond top point)
      float isLeftOuter = step(fi, 0.5); // 1.0 if fi <= 0.5 (index 0)
      float isRightOuter = step(3.5, fi); // 1.0 if fi >= 3.5 (index 4)
      float isOuterLine = isLeftOuter + isRightOuter; // 1.0 if fi is 0.0 or 4.0
      vec2 direction = a - apex; // Direction from apex to top (reverse direction for upward extension)
      vec2 extendedTop = a + direction * 0.5; // Extend 50% upward beyond top point
      vec2 aFinal = mix(a, extendedTop, isOuterLine); // Use extended top point for outer lines
      
      vec2 b = apex;
      
      // Reduce length of all 5 lines to half, except line index 2 which is double length
      // Keep end point fixed, move start point to midpoint between original start and end
      // For line index 2 (center line), use full length (double the half length)
      float isCenterLine = step(1.9, fi) * step(fi, 2.1); // 1.0 if fi is 2.0
      vec2 midpoint = (aFinal + b) * 0.5; // Midpoint for half-length lines
      vec2 lineStart = mix(midpoint, aFinal, isCenterLine); // Full length for center line, half for others
      vec2 lineEnd = b;

      // Parameter along segment and perpendicular normal (use adjusted points)
      float tl = segT(uv, lineStart, lineEnd);
      // Ensure tl covers full range 0-1 for complete path animation
      tl = clamp(tl, 0.0, 1.0);
      vec2 dir = normalize(lineEnd - lineStart);
      vec2 nrm = vec2(-dir.y, dir.x);

      // Smooth ripple that adapts to spiral white bands - lines follow white spaces
      // For line index 2 (center line), make it adapt more to spiral background
      float spiralPhase = combined * 6.28318 + tl * 8.0;
      // Increase ripple amplitude and white band adaptation for center line (more adaptive)
      float adaptiveRippleAmp = mix(lineRippleAmp, lineRippleAmp * 1.5, isCenterLine); // 50% more ripple for center
      float adaptiveWhiteBoost = mix(whiteBoost, whiteBoost * 1.3, isCenterLine); // 30% more white adaptation for center
      float ripple = adaptiveRippleAmp * adaptiveWhiteBoost
        * sin(uTime * lineRippleSpeed + spiralPhase);
      vec2 uvRippled = uv + nrm * ripple;

      // Distance to rippled line (use adjusted points)
      float d = sdSegment(uvRippled, lineStart, lineEnd);

      // Variable width per line index - symmetric: outer lines same width, inner lines thinner
      // Make width symmetric: line 0 and 4 same (thickest), line 1 and 3 same, line 2 takes two white spaces
      float distFromCenter = abs(fi - 2.0); // Distance from center line (0 to 2.0)
      // Center line width - wide enough to take two white spaces horizontally and fill like other lines
      float centerLineScale = 0.6; // Wide enough to cover two white spaces horizontally
      float otherLineScale = mix(0.75, 1.0, distFromCenter / 2.0); // Other lines keep original scale
      float perLineScale = mix(centerLineScale, otherLineScale, 1.0 - isCenterLine); // Use wider scale for center
      // Add adaptive width boost for center line to help fill white spaces like other lines
      float adaptiveWidthBoost = mix(1.0, 1.0 + whiteBoost * 0.5, isCenterLine); // Width variation for center to fill white spaces
      float width = baseLineWidth * perLineScale * adaptiveWidthBoost;
      // Normal falloff for center line to ensure good coverage like other lines
      float falloffRange = mix(1.8, 1.6, isCenterLine); // Normal falloff for good coverage
      float lineMask = 1.0 - smoothstep(width, width * falloffRange, d);

      // Moving gradient from top to bottom - synchronized across lines
      // Faster speed to encourage scrolling down
      // Use full range 0-1 to cover complete path
      float gradOffset = fract(uTime * 0.6);
      // Wider gradient band to ensure full path coverage
      float extendedGradWidth = lineGradWidth * 1.8; // Much wider for complete path visibility
      // Use bandAt function with extended width to cover full path
      float gradBand = bandAt(gradOffset, tl, extendedGradWidth);

      // Triangle region mask - will be handled per-line below
      float lineInsideTri = triMask;

      // For middle 3 lines (indices 1, 2, 3), only use bottom portion
      // Center line (index 2): now uses full path (double length, so full path)
      // Other middle lines (indices 1, 3): use bottom 0.5 (tl >= 0.5)
      // Outer 2 lines (indices 0, 4): use full path
      // isCenterLine already declared above, reuse it
      float isOtherMiddleLine = (step(1.0, fi) * step(fi, 3.0)) * (1.0 - isCenterLine); // 1.0 if fi is 1.0 or 3.0
      float isMiddleLine = isOtherMiddleLine; // Only other middle lines, center line is now like outer lines
      
      // Center line: full path (since it's now double length)
      float centerLineMask = isCenterLine; // Full path for center line
      // Other middle lines: bottom 0.5 (smooth transition at 0.5)
      float otherMiddleLineMask = isOtherMiddleLine * smoothstep(0.48, 0.52, tl);
      // Outer lines: full path
      float outerLineMask = (1.0 - isMiddleLine - isCenterLine);
      
      // Combine masks
      float bottomHalfMask = outerLineMask + centerLineMask + otherMiddleLineMask;

      // Accumulate line masks and gradient bands (apply bottom half mask)
      // For center line, don't restrict by triangle mask to allow full path coverage
      float finalLineMask = mix(lineInsideTri, 1.0, isCenterLine); // No triangle restriction for center line
      
      // Boost intensity for center line slightly to match other lines' filling
      // With width 0.6 (vs 0.75 for other middle lines), need small boost to match filling
      float centerLineIntensityBoost = mix(1.0, 1.3, isCenterLine); // 1.3x intensity boost for center line
      float boostedLineMask = lineMask * centerLineIntensityBoost;
      
      totalLineMask = max(totalLineMask, boostedLineMask * finalLineMask * bottomHalfMask);
      totalGradBand = max(totalGradBand, gradBand * finalLineMask * bottomHalfMask);
    }

    // Use lines to FIND white spaces: only color where lines pass through white spaces
    // Lines act as a guide to locate white spaces, then we color those white spaces
    // Don't restrict by triangle mask here - already handled in line accumulation
    float lineWhiteSpace = totalLineMask * totalGradBand;
    // Only apply color where we have white spaces (whiteMask is high)
    // Lower threshold for more filling, especially for center line adaptation
    float whiteSpaceMask = smoothstep(0.5, 1.0, whiteMask); // Lower threshold (0.5 instead of 0.6) for more filling
    // Increase color intensity to maintain same filling per white space despite narrower width
    // Compensate for narrower domain by increasing intensity so filling is as strong as before
    // Higher multiplier to ensure center line matches other lines' filling intensity
    float enhancedColorStrength = lineColorStrength * 4.0; // Increased to ensure all lines have strong filling
    float colorIntensity = lineWhiteSpace * whiteSpaceMask * enhancedColorStrength;

    // Apply teal color to white spaces found along line paths
    color = mix(color, uGradientColor, colorIntensity);

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
  parent.add(plane);

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
    uniforms.uHoleRadiusOuter.value
      .copy(uniforms.uHoleRadius.value)
      .multiplyScalar(1.35);

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
    parent.remove(plane);
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
