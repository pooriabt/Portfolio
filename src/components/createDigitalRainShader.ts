// src/components/createDigitalRainShader.ts

/**
 * Generates GLSL shader code for digital rain effect with spiral motion
 * Matrix-style characters that spin in spiral paths around the center
 * Characters flicker between opacity states (0, 0.5, 1)
 */
export function createDigitalRainShader(): string {
  return `
    const float PI = 3.14159265359;
    
    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    
    // Generate Matrix-style character pattern
    float matrixChar(vec2 p, float seed) {
      vec2 grid = fract(p * 8.0);
      float pattern = 0.0;
      
      // Create random character-like patterns
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
    
    vec4 getDigitalRainColor(vec2 uv, float t, float speed, float density, vec3 color, vec2 resolution) {
      // Convert to centered coordinates
      vec2 centered = uv - 0.5;
      float radius = length(centered);
      float angle = atan(centered.y, centered.x);
      
      // Spiral parameters - characters flow in spiral paths
      float spiralTightness = 8.0; // How many turns the spiral makes
      float rotationSpeed = speed * 0.3; // Rotation speed
      
      // Create spiral coordinate system
      // Characters move along spiral paths from center outward
      float spiralAngle = angle + radius * spiralTightness - t * rotationSpeed;
      
      // Calculate spiral path position
      float numSpirals = floor(density * 16.0); // Number of spiral arms
      float spiralIndex = floor(spiralAngle / (PI * 2.0) * numSpirals);
      float angleInSpiral = fract(spiralAngle / (PI * 2.0) * numSpirals);
      
      // Character grid along the spiral
      float numCharsAlongRadius = floor(density * 28.0);
      float radialIndex = floor(radius * numCharsAlongRadius * 2.0);
      
      // Per-character randomness
      float charSeed = hash2(vec2(spiralIndex, radialIndex));
      float charTime = t * (0.3 + charSeed * 0.5) * speed;
      
      // Characters flow outward along spiral
      float flowOffset = fract(charTime * 0.2 + charSeed);
      float charRadius = fract((radius + flowOffset) * 2.0);
      
      // Character pattern position
      vec2 charUv = vec2(angleInSpiral, charRadius * 3.0);
      float charPattern = matrixChar(charUv, charSeed + floor(charTime));
      
      // Opacity flicker (0, 0.5, 1)
      float flickerPhase = fract(charTime * 1.0 + charSeed * 10.0);
      float flicker;
      if (flickerPhase < 0.33) {
        flicker = 0.0; // invisible
      } else if (flickerPhase < 0.66) {
        flicker = 0.5; // half opacity
      } else {
        flicker = 1.0; // full opacity
      }
      
      // Distance-based fade (characters fade with distance from center)
      float distanceFade = 1.0 - smoothstep(0.1, 0.5, abs(charRadius - 0.5));
      
      // Combine intensity
      float intensity = charPattern * distanceFade * flicker;
      
      // Color variation along spiral
      float colorShift = sin(spiralAngle * 2.0 + t) * 0.3;
      vec3 finalColor = color * (0.8 + colorShift);
      
      // Radial fade for portal shape
      float radialFade = smoothstep(0.5, 0.15, radius) * smoothstep(0.02, 0.1, radius);
      
      float alpha = intensity * radialFade * (0.7 + flicker * 0.3);
      
      return vec4(finalColor * intensity, alpha);
    }
  `;
}
