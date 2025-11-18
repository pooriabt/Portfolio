// src/components/SpiralBackground.ts
import * as THREE from "three";
import gsap from "gsap";
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
    // Arrow animation control: 0 = normal, 1 = restart from top
    uArrowAnimationRestart: { value: 0.0 },
    // Time offset for restart animation
    uArrowRestartTime: { value: 0.0 },
    // Starting offset when restart begins (to smoothly transition from current position)
    uArrowRestartStartOffset: { value: 0.0 },
    // Track if restart has ever reached midpoint (to always use restartOffset after that)
    uArrowRestartHasStarted: { value: 0.0 },
    // Arrow animation visibility: 0 = hidden, 1 = visible
    uArrowAnimationVisible: { value: 0.0 },
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
  uniform float uArrowAnimationRestart;
  uniform float uArrowRestartTime;
  uniform float uArrowRestartStartOffset;
  uniform float uArrowRestartHasStarted;
  uniform float uArrowAnimationVisible;

  // Band shape helper (creates a single moving band centered at phase 'o')
  float bandAt(float o, float ss, float width) {
    float h = smoothstep(o - width, o, ss);
    float tt = 1.0 - smoothstep(o, o + width, ss);
    return clamp(h * tt, 0.0, 1.0);
  }
  
  // Wrap-around aware band function for gradient animation
  // Handles the case when offset wraps from 1.0 to 0.0 smoothly
  // IMPORTANT: Only creates bands in forward direction (top to bottom) to prevent reversal
  float bandAtWrapped(float o, float ss, float width) {
    // Always use normal band calculation - it only creates forward bands
    // The normal bandAt function already handles the forward direction correctly
    return bandAt(o, ss, width);
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

      // Arrow animation: moving gradient from top to bottom - synchronized across lines
      // Faster speed to encourage scrolling down
      // When uArrowAnimationRestart is active, smoothly transition from starting position to top
      float normalTime = uTime * 0.6;
      float normalOffset = fract(normalTime);
      float restartTime = uArrowRestartTime * 0.6; // Restart time offset (starts at 0)
      float restartOffset = fract(restartTime);
      
      // During restart transition: smoothly interpolate from starting offset to 0 (top)
      // When restart is 0: use normal offset (only initially, before restart has been active)
      // When restart transitions 0->1: smoothly go from start offset to 0
      // When restart is 1: use restart offset (which continues from 0)
      // When restart transitions back 1->0: continue using restart offset to maintain direction
      float transitionStart = uArrowRestartStartOffset; // Starting position when restart began
      float transitionEnd = 0.0; // Top position
      float transitionOffset = mix(transitionStart, transitionEnd, uArrowAnimationRestart);
      
      // Arrow animation: Start directly from top (0.0) and go down, no transition
      // When restart is active, immediately use restartOffset starting from 0.0
      // Skip transitionOffset to avoid the "go up then down" animation
      float isRestartActive = step(0.01, uArrowAnimationRestart); // 1 if restart > 0.01
      
      // Use normal offset only when completely inactive
      // Use restartOffset immediately when restart is active (starts at 0.0, goes to 1.0)
      float useNormal = 1.0 - isRestartActive;
      float useRestart = isRestartActive;
      
      float gradOffset = normalOffset * useNormal
                        + restartOffset * useRestart;
      // Wider gradient band to ensure full path coverage
      float extendedGradWidth = lineGradWidth * 1.8; // Much wider for complete path visibility
      // Always use normal bandAt - it ensures forward direction only (top to bottom)
      // The offset calculation already handles the wrap-around correctly
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
    // Apply arrow animation visibility - only show when visible is 1.0
    float colorIntensity = lineWhiteSpace * whiteSpaceMask * enhancedColorStrength * uArrowAnimationVisible;

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

  // Arrow animation state
  let pageLoadTime = Date.now();
  let lastScrollTime = Date.now();
  let arrowRestartTween: gsap.core.Tween | null = null;
  let arrowVisibilityTween: gsap.core.Tween | null = null;
  let isScrolling = false;
  let restartTimeOffset = 0.0; // Time offset to reset animation when restarting
  let hasStartedRestartAnimation = false; // Flag to prevent resetting restartTimeOffset every frame
  let isAtBottom = false; // Track if user is at the bottom of the page

  // Helper function to check if user is at the bottom of the page
  function checkIfAtBottom(): boolean {
    if (typeof window === "undefined") return false;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    // Consider at bottom if within 50px of the bottom
    const threshold = 50;
    return scrollTop + clientHeight >= scrollHeight - threshold;
  }

  function update(timeSec: number) {
    uniforms.uTime.value = timeSec;
    updateCenters();

    // Arrow animation: after 5 seconds of no scroll, show and restart from top
    const currentTime = Date.now();
    const timeSinceLoad = (currentTime - pageLoadTime) / 1000;
    const timeSinceScroll = (currentTime - lastScrollTime) / 1000;

    // Update restart time continuously as long as animation is active
    // This MUST run every frame once started to keep animation looping
    // Start from 0.0 and continuously increase, wrapping naturally from 1.0 to 0.0
    if (restartTimeOffset > 0.0) {
      // Ensure restart stays at 1.0 to keep animation active
      uniforms.uArrowAnimationRestart.value = 1.0;
      // Only ensure visibility stays at 1.0 if we're not scrolling
      // Since restartTimeOffset is reset to 0 on scroll, this check prevents resetting during fade-out
      if (!isScrolling && uniforms.uArrowAnimationVisible.value > 0.01) {
        uniforms.uArrowAnimationVisible.value = 1.0;
      }
      // Calculate restart time: current time minus offset, so it starts from 0
      // This ensures restartOffset continuously increases from 0.0 to 1.0, then wraps to 0.0
      // The direction is always forward (increasing) because timeSec always increases
      // When it wraps, it naturally jumps back to 0.0 (top) and continues
      // This continues indefinitely until restartTimeOffset is reset (on scroll)
      // CRITICAL: This must update every frame to keep the animation looping
      const calculatedRestartTime = timeSec - restartTimeOffset;
      // Ensure restartTime is always updating (should always be >= 0 and increasing)
      uniforms.uArrowRestartTime.value = Math.max(0.0, calculatedRestartTime);
    }

    // Check if user is at the bottom of the page
    isAtBottom = checkIfAtBottom();

    // If at bottom, hide arrow immediately and don't allow it to show
    if (isAtBottom) {
      // Immediately stop the animation loop
      restartTimeOffset = 0.0;
      hasStartedRestartAnimation = false;
      
      // Fade out arrow if visible
      if (uniforms.uArrowAnimationVisible.value > 0.01) {
        if (arrowVisibilityTween && arrowVisibilityTween.isActive()) {
          arrowVisibilityTween.kill();
        }
        arrowVisibilityTween = gsap.to(uniforms.uArrowAnimationVisible, {
          value: 0.0,
          duration: 0.5,
          ease: "power1.out",
        });
      }
      
      // Stop restart animation
      if (arrowRestartTween && arrowRestartTween.isActive()) {
        arrowRestartTween.kill();
      }
      uniforms.uArrowAnimationRestart.value = 0.0;
    }
    // If 5 seconds have passed since page load and no scroll in last 5 seconds, 
    // and we're NOT at the bottom, show and start restart animation
    else if (timeSinceLoad >= 5.0 && timeSinceScroll >= 5.0 && !isScrolling) {
      // Fade in visibility if not already visible
      if (uniforms.uArrowAnimationVisible.value < 0.99) {
        if (arrowVisibilityTween === null || !arrowVisibilityTween.isActive()) {
          arrowVisibilityTween = gsap.to(uniforms.uArrowAnimationVisible, {
            value: 1.0,
            duration: 0.8,
            ease: "power2.out",
            onComplete: () => {
              // After visibility is fully visible, start the restart animation from top
              if (!hasStartedRestartAnimation) {
                // Capture current offset position for smooth transition
                const currentOffset = (timeSec * 0.6) % 1.0;
                uniforms.uArrowRestartStartOffset.value = currentOffset;
                // Initialize restartTimeOffset to current time so restartOffset starts at 0.0
                restartTimeOffset = timeSec;
                uniforms.uArrowRestartTime.value = 0.0; // Start at 0.0
                // Mark as started immediately
                uniforms.uArrowRestartHasStarted.value = 1.0;
                // Start restart at 1.0 immediately (no transition animation)
                // This makes restartOffset start updating right away from 0.0
                uniforms.uArrowAnimationRestart.value = 1.0;
                // Set flag to prevent resetting every frame
                hasStartedRestartAnimation = true;
              }
            },
          });
        }
      } else if (uniforms.uArrowAnimationVisible.value >= 0.99) {
        // If already visible, start restart animation immediately if not already started
        if (!hasStartedRestartAnimation) {
          // Capture current offset position (not used but kept for consistency)
          const currentOffset = (timeSec * 0.6) % 1.0;
          uniforms.uArrowRestartStartOffset.value = currentOffset;
          restartTimeOffset = timeSec;
          uniforms.uArrowRestartTime.value = 0.0;
          // Mark as started immediately
          uniforms.uArrowRestartHasStarted.value = 1.0;
          // Start restart at 1.0 immediately (no transition animation)
          uniforms.uArrowAnimationRestart.value = 1.0;
          // Set flag to prevent resetting every frame
          hasStartedRestartAnimation = true;
        }
      }
    }
  }

  // Handle scroll events - hide arrow animation when user scrolls
  function handleScroll() {
    lastScrollTime = Date.now();
    isScrolling = true;

    // Check if we're at the bottom
    isAtBottom = checkIfAtBottom();

    // Immediately stop the animation loop to prevent update() from resetting visibility
    restartTimeOffset = 0.0;
    hasStartedRestartAnimation = false;

    // If at bottom, hide arrow immediately (don't wait for fade)
    if (isAtBottom) {
      if (arrowVisibilityTween && arrowVisibilityTween.isActive()) {
        arrowVisibilityTween.kill();
      }
      uniforms.uArrowAnimationVisible.value = 0.0;
      
      if (arrowRestartTween && arrowRestartTween.isActive()) {
        arrowRestartTween.kill();
      }
      uniforms.uArrowAnimationRestart.value = 0.0;
      uniforms.uArrowRestartStartOffset.value = 0.0;
      uniforms.uArrowRestartHasStarted.value = 0.0;
    } else {
      // Fade out visibility smoothly when user scrolls (do this first for smooth transition)
      if (arrowVisibilityTween && arrowVisibilityTween.isActive()) {
        arrowVisibilityTween.kill();
      }
      arrowVisibilityTween = gsap.to(uniforms.uArrowAnimationVisible, {
        value: 0.0,
        duration: 1.2,
        ease: "power1.out",
      });

      // Stop restart animation smoothly after a slight delay to allow visibility to fade
      if (arrowRestartTween && arrowRestartTween.isActive()) {
        arrowRestartTween.kill();
      }
      arrowRestartTween = gsap.to(uniforms.uArrowAnimationRestart, {
        value: 0.0,
        duration: 1.0,
        ease: "power1.out",
        onComplete: () => {
          // Reset restart time offset, start offset, has started flag, and animation flag when animation stops
          uniforms.uArrowRestartStartOffset.value = 0.0;
          uniforms.uArrowRestartHasStarted.value = 0.0;
        },
      });
    }

    // Reset scrolling flag after a delay
    setTimeout(() => {
      isScrolling = false;
    }, 1500); // Longer delay to ensure fade-out completes
  }

  // Add scroll listener
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", handleScroll, { passive: true });
    window.addEventListener("touchmove", handleScroll, { passive: true });
  }

  function dispose() {
    // Clean up scroll listeners
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleScroll);
      window.removeEventListener("touchmove", handleScroll);
    }
    // Kill any active tweens
    if (arrowRestartTween) {
      arrowRestartTween.kill();
    }
    if (arrowVisibilityTween) {
      arrowVisibilityTween.kill();
    }
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
