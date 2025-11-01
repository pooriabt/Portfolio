// src/components/createDigitalRainShader.ts

import { glsl } from "./glsl";

/**
 * Generates GLSL shader code for digital rain effect with spiral motion
 * Matrix-style characters that spin in spiral paths around the center
 * Characters flicker between opacity states (0, 0.5, 1)
 */
export function createDigitalRainShader(): string {
  return glsl`
    const float PI = 3.14159265359;

    float matrixChar(vec2 p, float seed) {
      vec2 grid = fract(p * 8.0);
      float pattern = 0.0;

      float rnd = hash2(floor(p * 8.0) + seed);
      if (rnd > 0.7) {
        pattern = step(0.3, grid.x) * step(grid.x, 0.7) * step(0.2, grid.y);
      } else if (rnd > 0.4) {
        pattern = step(0.2, grid.y) * step(grid.y, 0.8) * step(0.3, grid.x);
      } else {
        pattern = length(grid - 0.5) < 0.3 ? 1.0 : 0.0;
      }

      return pattern;
    }

    vec4 getDigitalRainColor(
      vec2 uv,
      float t,
      float speed,
      float density,
      vec3 color,
      vec2 resolution
    ) {
      vec2 centered = uv - 0.5;
      float radius = length(centered);
      float angle = atan(centered.y, centered.x);

      float spiralTightness = 8.0;
      float rotationSpeed = speed * 0.3;
      float spiralAngle = angle + radius * spiralTightness - t * rotationSpeed;

      float numSpirals = floor(density * 16.0);
      float spiralIndex = floor(spiralAngle / (PI * 2.0) * numSpirals);
      float angleInSpiral = fract(spiralAngle / (PI * 2.0) * numSpirals);

      float numCharsAlongRadius = floor(density * 28.0);
      float radialIndex = floor(radius * numCharsAlongRadius * 2.0);

      float charSeed = hash2(vec2(spiralIndex, radialIndex));
      float charTime = t * (0.3 + charSeed * 0.5) * speed;

      float flowOffset = fract(charTime * 0.2 + charSeed);
      float charRadius = fract((radius + flowOffset) * 2.0);

      vec2 charUv = vec2(angleInSpiral, charRadius * 3.0);
      float charPattern = matrixChar(charUv, charSeed + floor(charTime));

      float flickerPhase = fract(charTime * 1.0 + charSeed * 10.0);
      float flicker;
      if (flickerPhase < 0.33) {
        flicker = 0.0;
      } else if (flickerPhase < 0.66) {
        flicker = 0.5;
      } else {
        flicker = 1.0;
      }

      float distanceFade = 1.0 - smoothstep(0.1, 0.5, abs(charRadius - 0.5));
      float intensity = charPattern * distanceFade * flicker;

      float colorShift = sin(spiralAngle * 2.0 + t) * 0.3;
      vec3 finalColor = color * (0.8 + colorShift);

      float radialFade = smoothstep(0.5, 0.15, radius) * smoothstep(0.02, 0.1, radius);
      float alpha = intensity * radialFade * (0.7 + flicker * 0.3);

      return vec4(finalColor * intensity, alpha);
    }
  `;
}
