type GlslScalar = string | number | boolean | null | undefined;
type GlslValue = GlslScalar | GlslScalar[];

export function glsl(
  strings: TemplateStringsArray,
  ...values: GlslValue[]
): string {
  let result = "";
  strings.forEach((chunk, index) => {
    result += chunk;
    if (index < values.length) {
      const value = values[index];
      if (Array.isArray(value)) {
        result += value.join("");
      } else if (value !== undefined && value !== null) {
        result += String(value);
      }
    }
  });
  return result;
}

export const hsv2rgbFn = glsl`
vec3 hsv2rgb(vec3 c) {
  vec4 k = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
  return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
}
`;

export const hashFns = glsl`
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`;

export const smoothNoiseFn = glsl`
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
`;

export const brushHelpers = glsl`
// Generate a single noisy brush stroke with configurable width and offsets
float getBrushLayerWithWidth(
  vec2 screenUv,
  vec2 center,
  vec2 holeRadius,
  float angle,
  float seed,
  float radialOffset,
  float angleOffset,
  float baseBrushWidth,
  float widthScale
) {
  float w = max(widthScale, 0.001);

  // Offset pixel from portal center in screen space
  vec2 diff = screenUv - center;
  // Prepare elliptical normalization for distance checks
  vec2 ellipseNorm = diff;
  ellipseNorm.x /= holeRadius.x;
  ellipseNorm.y /= holeRadius.y;
  // Distance from center after elliptical scaling
  float ellipseDist = length(ellipseNorm);

  // Offset distance from the portal boundary for this stroke
  float edgeDist = ellipseDist - 1.0 + radialOffset;
  float noiseEdge = edgeDist / w;
  // Determine whether the stroke lives inside (negative offset) or outside
  float isInside = step(radialOffset, 0.0);

  // Visibility mask for strokes on the inside of the ellipse
  float insideRange = smoothstep(-0.05 * w, -0.02 * w, edgeDist) *
    smoothstep(-0.005 * w, -0.02 * w, edgeDist);
  // Visibility mask for strokes on the outside of the ellipse (expanded to allow wider bleed)
  float outsideRange = smoothstep(0.12 * w, 0.01 * w, edgeDist) *
    smoothstep(0.01 * w, 0.12 * w, edgeDist);
  // Blend inside/outside masks depending on stroke side
  float validRange = mix(outsideRange, insideRange, isInside);

  // Angle of pixel around ellipse
  float currentAngle = atan(diff.y / holeRadius.y, diff.x / holeRadius.x);
  // Rotate stroke by animation angle and per-line offset
  float rotatedAngle = currentAngle - angle + angleOffset;
  // Wrap angle into 0..2π range for consistent math
  rotatedAngle = rotatedAngle + 3.14159;
  rotatedAngle = rotatedAngle - floor(rotatedAngle / 6.28318) * 6.28318;

  // Normalized angular coordinate (roughly 0..1)
  float angleCoord = rotatedAngle * 0.159;
  // UV used for noisy texture lookups
  vec2 brushCoord = vec2(angleCoord * 150.0 + seed * 10.0, noiseEdge * 40.0);

  // Base thickness for this stroke
  float brushThickness = baseBrushWidth * w;
  // Small sinusoidal wobble to widen/narrow along the stroke
  float thicknessVar = sin(rotatedAngle * 2.0 + seed) * 0.002;
  // Apply wobble to final thickness
  brushThickness += thicknessVar;

  // Noise coordinate for outer edge fraying
  vec2 outerNoiseCoord = vec2(angleCoord * 200.0, noiseEdge * 50.0 + seed + radialOffset * 100.0);
  // Sum of octave noise to get blobby outer edge
  float outerFray =
    smoothNoise(outerNoiseCoord) * 0.03 +
    smoothNoise(outerNoiseCoord * 2.5) * 0.015 +
    smoothNoise(outerNoiseCoord * 5.0) * 0.008;

  // Noise coordinate for inner edge fraying
  vec2 innerNoiseCoord = vec2(angleCoord * 185.0, noiseEdge * 48.0 + seed * 1.3 + radialOffset * 95.0);
  // Sum of octave noise for inner edge breakup
  float innerFray =
    smoothNoise(innerNoiseCoord) * 0.03 +
    smoothNoise(innerNoiseCoord * 2.3) * 0.015 +
    smoothNoise(innerNoiseCoord * 4.7) * 0.008;

  // Distance from stroke center in normalized space
  float distFromCenter = abs(edgeDist);

  // Signed distance for outer boundary of the stroke
  float outerEdgeDist = (distFromCenter - brushThickness) - outerFray;
  // Outer opacity ramp using smoothstep
  float outerAlpha = 1.0 - smoothstep(0.0, 0.010 * w, outerEdgeDist);
  // Fine noise to add tiny irregularities on outer edge
  float outerMicroFray = smoothNoise(brushCoord * vec2(300.0, 80.0) + seed + radialOffset * 50.0) * 0.002 * w;
  // Additional noise-driven modulation for the outer edge alpha
  outerAlpha *= (0.55 + smoothNoise(brushCoord * vec2(400.0, 100.0) + seed * 2.0 + radialOffset * 60.0) * 0.45);
  // Reapply smoothstep to clamp outer alpha after modulation
  outerAlpha = smoothstep(0.0, 0.015 * w, outerAlpha + outerMicroFray - 0.008 * w);

  // Signed distance for inner boundary of the stroke
  float innerEdgeDist = (brushThickness - distFromCenter) - innerFray;
  // Inner opacity ramp using smoothstep
  float innerAlpha = 1.0 - smoothstep(0.0, 0.010 * w, innerEdgeDist);
  // Fine noise for inner edge irregularities
  float innerMicroFray = smoothNoise(brushCoord * vec2(280.0, 75.0) + seed * 1.5 + radialOffset * 45.0) * 0.002 * w;
  // Additional noise-driven modulation for inner edge alpha
  innerAlpha *= (0.6 + smoothNoise(brushCoord * vec2(380.0, 95.0) + seed * 2.3 + radialOffset * 55.0) * 0.4);
  // Reapply smoothstep to clamp inner alpha after modulation
  innerAlpha = smoothstep(0.0, 0.015 * w, innerAlpha + innerMicroFray - 0.008 * w);

  // Combine inner/outer edge alpha to craft ribbon opacity
  float lineAlpha = min(outerAlpha, innerAlpha);

  // Coordinates for bristle-style variation across the stroke
  vec2 bristleCoord = vec2(angleCoord * 300.0, distFromCenter * 200.0);
  // Noise sample for bristle breakup
  float bristle = smoothNoise(bristleCoord + seed + radialOffset * 200.0);
  // Modulate line alpha by bristle noise
  lineAlpha *= (0.5 + bristle * 0.5);

  // Additional sinusoidal opacity wiggle around the ellipse
  float opacityVar = sin(rotatedAngle * 2.1 + seed + radialOffset * 100.0) * 0.15;
  // Apply opacity variation for flickering look
  lineAlpha *= (0.7 + opacityVar);

  // Fade stroke if too far inside the portal
  float insideFalloff = smoothstep(-0.05 * w, -0.015 * w, edgeDist);
  // Fade stroke if too far outside the portal
  float outsideFalloff = smoothstep(0.025 * w, 0.0, edgeDist);
  // Blend inside/outside falloffs depending on sign of edgeDist
  float falloff = mix(outsideFalloff, insideFalloff, step(0.0, edgeDist));

  // Apply falloff attenuation
  lineAlpha *= falloff;
  // Mask stroke entirely if outside its valid range
  lineAlpha *= validRange;

  // Return final stroke alpha contribution
  return lineAlpha;
}

// Compute brush intensity for the single primary stroke
float getBrushEffect(
  vec2 screenUv,
  vec2 center,
  vec2 holeRadius,
  float angle,
  float seed,
  float widthScale
) {
  // Innermost thin stroke slightly inside the portal
  float line1Width = 0.0052;
  float line1Offset = -0.5 * line1Width * widthScale;
  float line1 = getBrushLayerWithWidth(
    screenUv,
    center,
    holeRadius,
    angle,
    seed,
    line1Offset,
    0.0,
    line1Width,
    widthScale
  );

  // Use the primary line as the base intensity
  float totalBrush = line1;

  // Compute angle around ellipse for gap modulation
  float currentAngle = atan((screenUv.y - center.y) / holeRadius.y, (screenUv.x - center.x) / holeRadius.x);
  float rotatedAngle = currentAngle - angle;
  rotatedAngle = rotatedAngle + 3.14159;
  rotatedAngle = rotatedAngle - floor(rotatedAngle / 6.28318) * 6.28318;
  float angleCoord = rotatedAngle * 0.159;

  // Base sinusoidal gap pattern along the stroke
  float gapBase = sin(rotatedAngle * 0.95 + seed * 0.4);
  gapBase = gapBase * 0.5 + 0.5;
  gapBase = pow(gapBase, 4.0);
  // Noise-based modulation to break up repeating gaps
  float gapNoise = smoothNoise(vec2(angleCoord * 12.0, seed * 1.2));
  //float gapPattern = mix(gapBase, 1.0, smoothstep(0.15, 0.35, gapNoise));

  // Apply gap mask to combined stroke intensity
  //totalBrush *= gapPattern;

  // Final brush intensity for this pixel
  return totalBrush;
}
`;
