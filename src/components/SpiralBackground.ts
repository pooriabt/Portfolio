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
    // Side text obstacle positions (in screen UV space, 0-1)
    uSideTextLeftPos: { value: new THREE.Vector2(-1.0, 0.5) }, // -1 means not visible
    uSideTextRightPos: { value: new THREE.Vector2(-1.0, 0.5) }, // -1 means not visible
    uSideTextLeftSize: { value: new THREE.Vector2(0.0, 0.0) }, // Width and height of left text in screen UV space
    uSideTextRightSize: { value: new THREE.Vector2(0.0, 0.0) }, // Width and height of right text in screen UV space
    uSideTextObstacleStrength: { value: 0.7 }, // How strong the obstacle effect is
    // Edge angles in radians (0 = horizontal, positive = rotated counterclockwise)
    uSideTextLeftTopAngle: { value: -0.25 }, // Top edge angle for left obstacle
    uSideTextLeftBottomAngle: { value: -0.1 }, // Bottom edge angle for left obstacle
    uSideTextRightTopAngle: { value: 0.25 }, // Top edge angle for right obstacle
    uSideTextRightBottomAngle: { value: 0.1 }, // Bottom edge angle for right obstacle
    // Obstacle rotation in radians (pivots at upper corner)
    uSideTextLeftRotation: { value: -0.2 }, // Rotation for left obstacle (pivot: top-right corner)
    uSideTextRightRotation: { value: 0.2 }, // Rotation for right obstacle (pivot: top-left corner)
    
    // Trapezoid colors and active state
    uTrapezoidColor: { value: new THREE.Color(0x020003) }, // Color for white ripples inside trapezoid
    uTrapezoidBlackColor: { value: new THREE.Color(0x020003) }, // Color for black ripples inside trapezoid
    uTrapezoidActive: { value: 0.0 }, // 0 = inactive, 1 = active
    uTrapezoidRightActive: { value: 0.0 }, // 0 = inactive, 1 = active
    uColorInset: { value: 0.0 }, // Inset for color modification (UV space) - 0 = full coverage

    // Left obstacle corner offsets (as percentage of size)
    // Top corners
    uSideTextLeftTopRightCornerOffsetX: { value: 0.0 }, // Move top-right corner right (as percentage of width)
    uSideTextLeftTopRightCornerOffsetY: { value: 0.0 }, // Move top-right corner up (as percentage of height)
    uSideTextLeftTopLeftCornerOffsetX: { value: 0.0 }, // Move top-left corner right (as percentage of width)
    uSideTextLeftTopLeftCornerOffsetY: { value: 0.0 }, // Move top-left corner up (as percentage of height)
    // Bottom corners
    uSideTextLeftBottomRightCornerOffsetX: { value: 0.0 }, // Move bottom-right corner right (as percentage of width)
    uSideTextLeftBottomRightCornerOffsetY: { value: 0.0 }, // Move bottom-right corner up (as percentage of height)
    uSideTextLeftBottomLeftCornerOffsetX: { value: 0.0 }, // Move bottom-left corner right (as percentage of width)
    uSideTextLeftBottomLeftCornerOffsetY: { value: 0.0 }, // Move bottom-left corner up (as percentage of height)
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
  // Side text obstacle uniforms
  uniform vec2 uSideTextLeftPos;
  uniform vec2 uSideTextRightPos;
  uniform vec2 uSideTextLeftSize; // Width and height in screen UV space
  uniform vec2 uSideTextRightSize; // Width and height in screen UV space
  uniform float uSideTextObstacleStrength;
  // Edge angles in radians (0 = horizontal, positive = rotated counterclockwise)
  uniform float uSideTextLeftTopAngle;
  uniform float uSideTextLeftBottomAngle;
  uniform float uSideTextRightTopAngle;
  uniform float uSideTextRightBottomAngle;
  // Obstacle rotation in radians (pivots at upper corner)
  uniform float uSideTextLeftRotation;
  uniform float uSideTextRightRotation;
  // Trapezoid colors
  uniform vec3 uTrapezoidColor; // Color for white ripples inside trapezoid
  uniform vec3 uTrapezoidBlackColor; // Color for black ripples inside trapezoid
  uniform float uTrapezoidActive; // 0 = inactive, 1 = active
  uniform float uTrapezoidRightActive; // 0 = inactive, 1 = active
  uniform float uColorInset; // Inset for color modification

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
    
    // ===== Side text obstacle effect =====
    // Create deflection/distortion when ripples encounter side texts
    // This makes the spiral ripples "flow around" the text like encountering an obstacle
    float obstacleDistortion0 = 0.0;
    float obstacleDistortion1 = 0.0;
    bool insideLeftObstacle = false;
    bool insideRightObstacle = false;
    float leftObstacleInfluence = 0.0;
    float rightObstacleInfluence = 0.0;
    
    // Left text obstacle - "C" shape with controllable angled edges
    // uSideTextLeftPos is now the RIGHT EDGE position (not center) for early appearance
    // Check if right edge is on-screen (>= 0) to show obstacle as soon as visible edge enters screen
    if (uSideTextLeftPos.x >= 0.0 && uSideTextLeftSize.x > 0.001 && uSideTextLeftSize.y > 0.001) {
      vec2 halfSize = uSideTextLeftSize * 0.5;
      // Convert right edge position to center for calculations
      // Center is at right edge - halfSize.x (to the left)
      vec2 centerPos = vec2(uSideTextLeftPos.x - halfSize.x, uSideTextLeftPos.y);
      vec2 toLeftText = uv - centerPos;
      vec2 halfSizeAspect = vec2(halfSize.x * aspect, halfSize.y);
      vec2 toLeftTextAspect = vec2(toLeftText.x * aspect, toLeftText.y);
      
      // Apply rotation around top-right corner (pivot point)
      // Pivot in aspect-corrected space: (halfSizeAspect.x, halfSizeAspect.y)
      float leftRotation = uSideTextLeftRotation;
      if (abs(leftRotation) > 0.001) {
        vec2 pivotAspect = vec2(halfSizeAspect.x, halfSizeAspect.y);
        // Translate to pivot, rotate, translate back
        vec2 relativeToPivot = toLeftTextAspect - pivotAspect;
        float cosRot = cos(leftRotation);
        float sinRot = sin(leftRotation);
        vec2 rotated = vec2(
          relativeToPivot.x * cosRot - relativeToPivot.y * sinRot,
          relativeToPivot.x * sinRot + relativeToPivot.y * cosRot
        );
        toLeftTextAspect = rotated + pivotAspect;
        // Update toLeftText for non-aspect calculations (used in inside checks)
        toLeftText = vec2(toLeftTextAspect.x / aspect, toLeftTextAspect.y);
      }
      
      // For left obstacle, exclude left edge (near screen edge)
      // Only calculate distance to right, top, and bottom edges
      // Right edge (vertical, at x = halfSize.x)
      float distToRightEdge = toLeftTextAspect.x - halfSizeAspect.x;
      
      // Top edge (angled) - pivots at top-right corner (halfSize.x, halfSize.y)
      // Edge equation: y = halfSize.y + tan(angle) * (x - halfSize.x)
      // Edge is a straight line extending from pivot - no blending to avoid refraction
      float topEdgePivotX = halfSizeAspect.x;
      float topEdgePivotY = halfSizeAspect.y;
      float topAngle = uSideTextLeftTopAngle;
      float topEdgeSlope = tan(topAngle);
      // Calculate Y position of edge at current X (straight line from pivot)
      float topEdgeYAtX = topEdgePivotY + topEdgeSlope * (toLeftTextAspect.x - topEdgePivotX);
      // Signed distance: positive = point is below edge (inside for top edge)
      float distToTopEdge = topEdgeYAtX - toLeftTextAspect.y;
      
      // Bottom edge (angled) - pivots at bottom-right corner (halfSize.x, -halfSize.y)
      // Edge equation: y = -halfSize.y + tan(angle) * (x - halfSize.x)
      // Edge is a straight line extending from pivot - no blending to avoid refraction
      float bottomEdgePivotX = halfSizeAspect.x;
      float bottomEdgePivotY = -halfSizeAspect.y;
      float bottomAngle = uSideTextLeftBottomAngle;
      float bottomEdgeSlope = tan(bottomAngle);
      // Calculate Y position of edge at current X (straight line from pivot)
      float bottomEdgeYAtX = bottomEdgePivotY + bottomEdgeSlope * (toLeftTextAspect.x - bottomEdgePivotX);
      // Signed distance: positive = point is above edge (inside for bottom edge)
      float distToBottomEdge = toLeftTextAspect.y - bottomEdgeYAtX;
      
      // Use original SDF calculation - when angles are 0, this matches original parallel edges
      // For parallel edges: abs(y) - halfSize.y gives distance to closest edge (positive = outside)
      // For angled edges: need to calculate distance properly
      // SDF expects: positive = outside, negative = inside
      float distToVerticalEdges;
      if (abs(uSideTextLeftTopAngle) < 0.001 && abs(uSideTextLeftBottomAngle) < 0.001) {
        // Original parallel edges logic
        distToVerticalEdges = abs(toLeftTextAspect.y) - halfSizeAspect.y;
      } else {
        // Angled edges: calculate distance to closest edge
        // distToTopEdge: positive = below edge (inside), negative = above edge (outside)
        // distToBottomEdge: positive = above edge (inside), negative = below edge (outside)
        // For SDF: we need positive = outside, so we need the minimum of the negative distances
        // Or equivalently: -max(-distToTopEdge, -distToBottomEdge) = min(distToTopEdge, distToBottomEdge)
        // But wait, we need the distance to the closest edge, considering both are boundaries
        // If both are positive (inside both), we're inside, so distance should be negative
        // If one is negative (outside that edge), we're outside, so distance should be positive
        // The distance to the shape is the minimum of the distances to each edge
        // Since distToTopEdge and distToBottomEdge are signed (positive = inside), we need:
        float distInsideTop = distToTopEdge; // positive = inside
        float distInsideBottom = distToBottomEdge; // positive = inside
        // Distance to shape: if inside both, use negative of the minimum (closest to edge)
        // If outside either, use positive distance
        if (distInsideTop > 0.0 && distInsideBottom > 0.0) {
          // Inside both edges - distance is negative (inside the shape)
          distToVerticalEdges = -min(distInsideTop, distInsideBottom);
        } else if (distInsideTop < 0.0 && distInsideBottom < 0.0) {
          // Outside both edges - distance is positive (outside the shape)
          distToVerticalEdges = -max(distInsideTop, distInsideBottom);
        } else {
          // Outside one edge, inside the other - we're outside the shape
          distToVerticalEdges = max(-distInsideTop, -distInsideBottom);
        }
      }
      
      vec2 distToEdgeLeft = vec2(
        distToRightEdge,  // Distance to right edge only (positive means outside)
        distToVerticalEdges  // Distance to closest top/bottom edge
      );
      float distToRect = length(max(distToEdgeLeft, 0.0)) + min(max(distToEdgeLeft.x, distToEdgeLeft.y), 0.0);
      
      // Check if inside the obstacle - nearly full width C-shape
      // Cover 99% of width, only exclude tiny edge (1%) to maintain C-shape opening
      bool insideByX = toLeftText.x < halfSize.x && toLeftText.x > -halfSize.x * 0.99;
      bool insideByY;
      if (abs(uSideTextLeftTopAngle) < 0.001 && abs(uSideTextLeftBottomAngle) < 0.001) {
        // Original parallel edges check - expand slightly
        insideByY = abs(toLeftText.y) < halfSize.y * 1.05;
      } else {
        // Angled edges check - expand with small negative tolerance
        float edgeTolerance = halfSize.y * 0.05;
        insideByY = distToTopEdge > -edgeTolerance && distToBottomEdge > -edgeTolerance;
      }
      insideLeftObstacle = insideByX && insideByY;


      // Create smooth falloff - stronger near text, fades with distance
      float influenceRadius = max(halfSizeAspect.x, halfSizeAspect.y) * 2.5; // Extend influence beyond text
      leftObstacleInfluence = 1.0 - smoothstep(0.0, influenceRadius, distToRect);
      leftObstacleInfluence *= uSideTextObstacleStrength;
      
      if (leftObstacleInfluence > 0.01) {
        // Create deflection: push ripples away from text edges
        // The deflection creates a "flow around" effect
        float angleToLeftText = atan(toLeftTextAspect.y, toLeftTextAspect.x);
        // Calculate normalized distance from text center
        float distFromLeftText = distToRect / max(max(halfSizeAspect.x, halfSizeAspect.y), 0.01);
        // Create radial deflection - stronger closer to text, pushes spirals outward
        float radialDeflection = leftObstacleInfluence * 0.4 * (1.0 / max(distFromLeftText, 0.15));
        // Angular component creates the "flow around" effect
        float angularDeflection = sin(angleToLeftText * 2.0 + t * 0.5) * 0.2;
        obstacleDistortion0 = radialDeflection + angularDeflection * leftObstacleInfluence;
      }
      
    }
    
    // Right text obstacle - "C" shape with controllable angled edges
    // uSideTextRightPos is now the LEFT EDGE position (not center) for early appearance
    // Check if left edge is on-screen (>= 0) to show obstacle as soon as visible edge enters screen
    if (uSideTextRightPos.x >= 0.0 && uSideTextRightSize.x > 0.001 && uSideTextRightSize.y > 0.001) {
      vec2 halfSize = uSideTextRightSize * 0.5;
      // Convert left edge position to center for calculations
      // Center is at left edge + halfSize.x (to the right)
      vec2 centerPos = vec2(uSideTextRightPos.x + halfSize.x, uSideTextRightPos.y);
      vec2 toRightText = uv - centerPos;
      vec2 halfSizeAspect = vec2(halfSize.x * aspect, halfSize.y);
      vec2 toRightTextAspect = vec2(toRightText.x * aspect, toRightText.y);
      
      // Apply rotation around top-left corner (pivot point)
      // Pivot in aspect-corrected space: (-halfSizeAspect.x, halfSizeAspect.y)
      float rightRotation = uSideTextRightRotation;
      if (abs(rightRotation) > 0.001) {
        vec2 pivotAspect = vec2(-halfSizeAspect.x, halfSizeAspect.y);
        // Translate to pivot, rotate, translate back
        vec2 relativeToPivot = toRightTextAspect - pivotAspect;
        float cosRot = cos(rightRotation);
        float sinRot = sin(rightRotation);
        vec2 rotated = vec2(
          relativeToPivot.x * cosRot - relativeToPivot.y * sinRot,
          relativeToPivot.x * sinRot + relativeToPivot.y * cosRot
        );
        toRightTextAspect = rotated + pivotAspect;
        // Update toRightText for non-aspect calculations (used in inside checks)
        toRightText = vec2(toRightTextAspect.x / aspect, toRightTextAspect.y);
      }
      
      // For right obstacle, exclude right edge (near screen edge)
      // Only calculate distance to left, top, and bottom edges
      // Left edge (vertical, at x = -halfSize.x)
      float distToLeftEdge = -toRightTextAspect.x - halfSizeAspect.x;
      
      // Top edge (angled) - pivots at top-left corner (-halfSize.x, halfSize.y)
      // Edge equation: y = halfSize.y + tan(angle) * (x - (-halfSize.x))
      // Edge is a straight line extending from pivot - no blending to avoid refraction
      float topEdgePivotX = -halfSizeAspect.x;
      float topEdgePivotY = halfSizeAspect.y;
      float topAngle = uSideTextRightTopAngle;
      float topEdgeSlope = tan(topAngle);
      // Calculate Y position of edge at current X (straight line from pivot)
      float topEdgeYAtX = topEdgePivotY + topEdgeSlope * (toRightTextAspect.x - topEdgePivotX);
      // Signed distance: positive = point is below edge (inside for top edge)
      float distToTopEdge = topEdgeYAtX - toRightTextAspect.y;
      
      // Bottom edge (angled) - pivots at bottom-left corner (-halfSize.x, -halfSize.y)
      // Edge equation: y = -halfSize.y + tan(angle) * (x - (-halfSize.x))
      // Edge is a straight line extending from pivot - no blending to avoid refraction
      float bottomEdgePivotX = -halfSizeAspect.x;
      float bottomEdgePivotY = -halfSizeAspect.y;
      float bottomAngle = uSideTextRightBottomAngle;
      float bottomEdgeSlope = tan(bottomAngle);
      // Calculate Y position of edge at current X (straight line from pivot)
      float bottomEdgeYAtX = bottomEdgePivotY + bottomEdgeSlope * (toRightTextAspect.x - bottomEdgePivotX);
      // Signed distance: positive = point is above edge (inside for bottom edge)
      float distToBottomEdge = toRightTextAspect.y - bottomEdgeYAtX;
      
      // Use original SDF calculation - when angles are 0, this matches original parallel edges
      // For parallel edges: abs(y) - halfSize.y gives distance to closest edge (positive = outside)
      // For angled edges: need to calculate distance properly
      // SDF expects: positive = outside, negative = inside
      float distToVerticalEdges;
      if (abs(uSideTextRightTopAngle) < 0.001 && abs(uSideTextRightBottomAngle) < 0.001) {
        // Original parallel edges logic
        distToVerticalEdges = abs(toRightTextAspect.y) - halfSizeAspect.y;
      } else {
        // Angled edges: calculate distance to closest edge
        // distToTopEdge: positive = below edge (inside), negative = above edge (outside)
        // distToBottomEdge: positive = above edge (inside), negative = below edge (outside)
        float distInsideTop = distToTopEdge; // positive = inside
        float distInsideBottom = distToBottomEdge; // positive = inside
        // Distance to shape: if inside both, use negative of the minimum (closest to edge)
        // If outside either, use positive distance
        if (distInsideTop > 0.0 && distInsideBottom > 0.0) {
          // Inside both edges - distance is negative (inside the shape)
          distToVerticalEdges = -min(distInsideTop, distInsideBottom);
        } else if (distInsideTop < 0.0 && distInsideBottom < 0.0) {
          // Outside both edges - distance is positive (outside the shape)
          distToVerticalEdges = -max(distInsideTop, distInsideBottom);
        } else {
          // Outside one edge, inside the other - we're outside the shape
          distToVerticalEdges = max(-distInsideTop, -distInsideBottom);
        }
      }
      
      vec2 distToEdgeRight = vec2(
        distToLeftEdge,  // Distance to left edge only (positive means outside)
        distToVerticalEdges  // Distance to closest top/bottom edge
      );
      float distToRect = length(max(distToEdgeRight, 0.0)) + min(max(distToEdgeRight.x, distToEdgeRight.y), 0.0);
      
      // Check if inside the obstacle - nearly full width C-shape
      // Cover 99% of width, only exclude tiny edge (1%) to maintain C-shape opening
      // For angled edges, we need to ensure we're within the X bounds where edges are valid
      // Edges extend from pivot (x = -halfSize.x) to right edge (x = halfSize.x)
      bool insideByX = toRightText.x > -halfSize.x && toRightText.x < halfSize.x * 0.99;
      bool insideByY;
      if (abs(uSideTextRightTopAngle) < 0.001 && abs(uSideTextRightBottomAngle) < 0.001) {
        // Original parallel edges check - expand slightly
        insideByY = abs(toRightText.y) < halfSize.y * 1.05;
      } else {
        // Angled edges check - expand with small negative tolerance
        // Edges are straight lines from pivot, so check distance to those lines
        if (insideByX) {
          float edgeTolerance = halfSize.y * 0.05;
          insideByY = distToTopEdge > -edgeTolerance && distToBottomEdge > -edgeTolerance;
        } else {
          // Outside X bounds - not inside obstacle
          insideByY = false;
        }
      }
      insideRightObstacle = insideByX && insideByY;


      // Create smooth falloff - stronger near text, fades with distance
      float influenceRadius = max(halfSizeAspect.x, halfSizeAspect.y) * 2.5; // Extend influence beyond text
      rightObstacleInfluence = 1.0 - smoothstep(0.0, influenceRadius, distToRect);
      rightObstacleInfluence *= uSideTextObstacleStrength;
      
      if (rightObstacleInfluence > 0.01) {
        // Create deflection: push ripples away from text edges
        // The deflection creates a "flow around" effect
        float angleToRightText = atan(toRightTextAspect.y, toRightTextAspect.x);
        // Calculate normalized distance from text center
        float distFromRightText = distToRect / max(max(halfSizeAspect.x, halfSizeAspect.y), 0.01);
        // Create radial deflection - stronger closer to text, pushes spirals outward
        float radialDeflection = rightObstacleInfluence * 0.4 * (1.0 / max(distFromRightText, 0.15));
        // Angular component creates the "flow around" effect
        float angularDeflection = sin(angleToRightText * 2.0 + t * 0.5) * 0.2;
        obstacleDistortion1 = radialDeflection + angularDeflection * rightObstacleInfluence;
      }
      
    }
    
    // Apply obstacle distortion to spiral calculations
    // This creates the "encountering an obstacle" effect - ripples deflect around the text
    spiral0 += obstacleDistortion0;
    spiral1 += obstacleDistortion1;
    // Recalculate spiral values with distortion
    v0 = sin(spiral0 * uBands);
    v1 = sin(spiral1 * uBands);
    
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
    
    // ===== Apply color modification to visibly distorted area =====
    // Use influence threshold to match the C-shaped distortion boundary
    // Threshold of 0.3 covers strongly distorted area without extending too far
    if (uTrapezoidActive > 0.9 && leftObstacleInfluence > 0.692) {
      // Apply color to visibly distorted area
      // White ripples mask - only bright ripple bands (high band values)
      float whiteRippleMask = smoothstep(0.6, 0.9, band);
      // Black ripples mask - only dark ripple bands (low band values)
      float notWhite = 1.0 - smoothstep(0.6, 0.9, band);
      float isDark = 1.0 - smoothstep(0.1, 0.4, band);
      float blackRippleMask = notWhite * isDark;
      
      // Apply color at full strength in this area
      color = mix(color, uTrapezoidColor, whiteRippleMask * 0.8);
      color = mix(color, uTrapezoidBlackColor, blackRippleMask * 0.8);
    }
    
    // ===== Apply color modification to visibly distorted area (right) =====
    if (uTrapezoidRightActive > 0.9 && rightObstacleInfluence > 0.692) {
      // Apply color to visibly distorted area
      float whiteRippleMask = smoothstep(0.6, 0.9, band);
      float notWhite = 1.0 - smoothstep(0.6, 0.9, band);
      float isDark = 1.0 - smoothstep(0.1, 0.4, band);
      float blackRippleMask = notWhite * isDark;
      
      // Apply color at full strength in this area
      color = mix(color, uTrapezoidColor, whiteRippleMask * 0.8);
      color = mix(color, uTrapezoidBlackColor, blackRippleMask * 0.8);
    }

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
  let planeHeight = 0;
  let planeWidth = 0;

  function calculatePlaneSize() {
    const fov = (perspectiveCamera.fov * Math.PI) / 180;
    const cameraDistFromOrigin = Math.abs(perspectiveCamera.position.z);
    const totalDistance = cameraDistFromOrigin + planeDistance;
    planeHeight = 2 * Math.tan(fov / 2) * totalDistance;
    planeWidth = planeHeight * perspectiveCamera.aspect;
  }

  calculatePlaneSize();

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    mat
  );
  plane.position.set(0, 0, -planeDistance); // far behind doors
  plane.renderOrder = -999; // render first, before everything
  parent.add(plane);

  // ===== Obstacle meshes with blur-fade effect =====
  // Helper to convert screen UV (0-1) to world position on the spiral plane
  function uvToWorldPos(uv: THREE.Vector2): THREE.Vector3 {
    // UV is in screen space (0-1)
    // IMPORTANT: The shader uses gl_FragCoord.xy / uResolution, which gives:
    // X: 0 = left, 1 = right
    // Y: 0 = bottom, 1 = top (flipped from standard UV where 0=top, 1=bottom)
    // Convert to world position on the plane
    // Plane center is at (0, 0, -planeDistance)
    // Plane extends from -planeWidth/2 to +planeWidth/2 in X
    // Plane extends from -planeHeight/2 to +planeHeight/2 in Y
    // World Y: +Y is up, -Y is down, 0 is center
    const worldX = (uv.x - 0.5) * planeWidth;
    // For shader UV: Y=0 (bottom) -> world -planeHeight/2, Y=1 (top) -> world +planeHeight/2
    const worldY = (uv.y - 0.5) * planeHeight;
    return new THREE.Vector3(worldX, worldY, -planeDistance);
  }

  // Blur-fade shader material for obstacles
  const obstacleVertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const obstacleFragmentShader = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    
    void main() {
      // Make trapezoid completely transparent - it's only used as a detector
      // The spiral shader uses the trapezoid corners to find and color ripples
      discard;
    }
  `;

  const obstacleMaterial = new THREE.ShaderMaterial({
    vertexShader: obstacleVertexShader,
    fragmentShader: obstacleFragmentShader,
    transparent: true,
    opacity: 0.0, // Completely transparent - only used as detector
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {}, // No uniforms needed - mesh is invisible
  });

  // Create obstacle meshes
  let leftObstacleMesh: THREE.Mesh | null = null;
  let rightObstacleMesh: THREE.Mesh | null = null;

  // Edge lines for obstacles (using simple lines)
  const leftObstacleLines: THREE.Line[] = [];
  const rightObstacleLines: THREE.Line[] = [];

  // Line material for obstacle edges - use simple line material
  const edgeLineMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000, // Bright red
    linewidth: 10, // Very thick (may not work on all systems)
    depthTest: false,
    depthWrite: false,
  });

  // Helper to create a simple line between two points
  function createThickLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    thickness: number = 0.05
  ): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geometry, edgeLineMaterial);
    return line;
  }

  // Helper to create or update edge lines
  function updateEdgeLines(
    corners: THREE.Vector2[],
    lines: THREE.Line[],
    groupName: string
  ) {
    // Remove old lines (but don't dispose material - it's shared)
    lines.forEach((line: THREE.Line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      // Don't dispose material - it's shared and reused
    });
    lines.length = 0;

    if (corners.length < 2) {
      return;
    }

    // Create lines connecting corners to form the obstacle edges
    // For C-shape: connect corners in order: 0->1, 1->2, 2->3, 3->0
    const linePairs = [
      [0, 1], // Top edge
      [1, 2], // Left edge
      [2, 3], // Bottom edge
      [3, 0], // Right edge
    ];

    linePairs.forEach(([startIdx, endIdx], lineIndex) => {
      const startCorner = corners[startIdx];
      const endCorner = corners[endIdx];

      const startWorld = uvToWorldPos(startCorner);
      const endWorld = uvToWorldPos(endCorner);

      // Position lines much closer to camera to ensure visibility
      const zPos = planeDistance - 10.0; // Much closer to camera
      const start = new THREE.Vector3(startWorld.x, startWorld.y, zPos);
      const end = new THREE.Vector3(endWorld.x, endWorld.y, zPos);

      const lineMesh = createThickLine(start, end, 0.5);
      lineMesh.renderOrder = 10000; // Extremely high render order to be on top
      lineMesh.frustumCulled = false;
      lineMesh.visible = true;
      lineMesh.name = `${groupName}_edge_${lineIndex}`;

      scene.add(lineMesh);
      lines.push(lineMesh);

      // Add a test sphere at the start position to verify rendering works
      if (lineIndex === 0 && groupName === "left") {
        const testSphere = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        testSphere.position.copy(start);
        testSphere.name = "test_sphere";
        scene.add(testSphere);
        console.log("Added test sphere at:", start);
      }

      // Debug log
      console.log(`Created edge line ${groupName}_${lineIndex}:`, {
        start: {
          x: start.x.toFixed(2),
          y: start.y.toFixed(2),
          z: start.z.toFixed(2),
        },
        end: { x: end.x.toFixed(2), y: end.y.toFixed(2), z: end.z.toFixed(2) },
        length: start.distanceTo(end).toFixed(2),
      });
    });

    console.log(`Created ${lines.length} edge lines for ${groupName} obstacle`);
  }

  // Function to calculate 4 corners of C-shape obstacle in UV space
  // Shape is defined purely by corner positions (no angle calculations)
  function calculateObstacleCorners(
    pos: THREE.Vector2, // Edge position (right edge for left, left edge for right)
    size: THREE.Vector2,
    rotation: number,
    isLeft: boolean,
    topRightCornerOffsetX: number = 0.0, // Offset to move right top corner right (as percentage of width)
    topRightCornerOffsetY: number = 0.0, // Offset to move right top corner up (as percentage of height)
    topLeftCornerOffsetX: number = 0.0, // Offset to move left top corner right (as percentage of width)
    topLeftCornerOffsetY: number = 0.0, // Offset to move left top corner up (as percentage of height)
    bottomRightCornerOffsetX: number = 0.0, // Offset to move bottom corner right (as percentage of width)
    bottomRightCornerOffsetY: number = 0.0, // Offset to move bottom corner up (as percentage of height)
    bottomLeftCornerOffsetX: number = 0.0, // Offset to move left bottom corner right (as percentage of width)
    bottomLeftCornerOffsetY: number = 0.0 // Offset to move left bottom corner up (as percentage of height)
  ): THREE.Vector2[] {
    const halfSize = new THREE.Vector2(size.x * 0.5, size.y * 0.5);

    // Calculate center position in UV space
    const centerX = isLeft ? pos.x - halfSize.x : pos.x + halfSize.x;
    const centerPos = new THREE.Vector2(centerX, pos.y);

    // Define corners directly in local space relative to center
    // No angle calculations - corners are defined by their offsets
    const corners: THREE.Vector2[] = [];
    const cosRot = Math.cos(rotation);
    const sinRot = Math.sin(rotation);

    if (isLeft) {
      // Left obstacle: define corners directly (no angle calculations)
      // Start with base positions in local space relative to center
      const topRightBase = new THREE.Vector2(halfSize.x, halfSize.y);
      const topLeftBase = new THREE.Vector2(-halfSize.x, halfSize.y);
      const bottomRightBase = new THREE.Vector2(halfSize.x, -halfSize.y);
      const bottomLeftBase = new THREE.Vector2(-halfSize.x, -halfSize.y);

      // Apply offsets to base positions
      const topRightCorner = new THREE.Vector2(
        topRightBase.x + topRightCornerOffsetX * size.x,
        topRightBase.y + topRightCornerOffsetY * size.y
      );
      const topLeftCorner = new THREE.Vector2(
        topLeftBase.x + topLeftCornerOffsetX * size.x,
        topLeftBase.y + topLeftCornerOffsetY * size.y
      );
      const bottomRightCorner = new THREE.Vector2(
        bottomRightBase.x + bottomRightCornerOffsetX * size.x,
        bottomRightBase.y + bottomRightCornerOffsetY * size.y
      );
      const bottomLeftCorner = new THREE.Vector2(
        bottomLeftBase.x + bottomLeftCornerOffsetX * size.x,
        bottomLeftBase.y + bottomLeftCornerOffsetY * size.y
      );

      // Apply rotation around top-right corner (rotation center)
      const rotationCenter = topRightCorner.clone();

      // Rotate all corners around the rotation center
      const rotatePoint = (
        point: THREE.Vector2,
        center: THREE.Vector2
      ): THREE.Vector2 => {
        const relative = point.clone().sub(center);
        return new THREE.Vector2(
          relative.x * cosRot - relative.y * sinRot,
          relative.x * sinRot + relative.y * cosRot
        ).add(center);
      };

      const topRightRotated = topRightCorner.clone(); // Rotation center, stays fixed
      const topLeftRotated = rotatePoint(topLeftCorner, rotationCenter);
      const bottomRightRotated = rotatePoint(bottomRightCorner, rotationCenter);
      const bottomLeftRotated = rotatePoint(bottomLeftCorner, rotationCenter);

      corners.push(
        topRightRotated,
        topLeftRotated,
        bottomLeftRotated,
        bottomRightRotated
      );
    } else {
      // Right obstacle: define corners directly (no angle calculations)
      // Start with base positions in local space relative to center
      const topLeftBase = new THREE.Vector2(-halfSize.x, halfSize.y);
      const topRightBase = new THREE.Vector2(halfSize.x, halfSize.y);
      const bottomLeftBase = new THREE.Vector2(-halfSize.x, -halfSize.y);
      const bottomRightBase = new THREE.Vector2(halfSize.x, -halfSize.y);

      // Apply offsets to base positions
      const topLeftCorner = new THREE.Vector2(
        topLeftBase.x + topLeftCornerOffsetX * size.x,
        topLeftBase.y + topLeftCornerOffsetY * size.y
      );
      const topRightCorner = new THREE.Vector2(
        topRightBase.x + topRightCornerOffsetX * size.x,
        topRightBase.y + topRightCornerOffsetY * size.y
      );
      const bottomLeftCorner = new THREE.Vector2(
        bottomLeftBase.x + bottomLeftCornerOffsetX * size.x,
        bottomLeftBase.y + bottomLeftCornerOffsetY * size.y
      );
      const bottomRightCorner = new THREE.Vector2(
        bottomRightBase.x + bottomRightCornerOffsetX * size.x,
        bottomRightBase.y + bottomRightCornerOffsetY * size.y
      );

      // Apply rotation around top-left corner (rotation center)
      const rotationCenter = topLeftCorner.clone();

      // Rotate all corners around the rotation center
      const rotatePoint = (
        point: THREE.Vector2,
        center: THREE.Vector2
      ): THREE.Vector2 => {
        const relative = point.clone().sub(center);
        return new THREE.Vector2(
          relative.x * cosRot - relative.y * sinRot,
          relative.x * sinRot + relative.y * cosRot
        ).add(center);
      };

      const topLeftRotated = topLeftCorner.clone(); // Rotation center, stays fixed
      const topRightRotated = rotatePoint(topRightCorner, rotationCenter);
      const bottomLeftRotated = rotatePoint(bottomLeftCorner, rotationCenter);
      const bottomRightRotated = rotatePoint(bottomRightCorner, rotationCenter);

      corners.push(
        topLeftRotated,
        topRightRotated,
        bottomRightRotated,
        bottomLeftRotated
      );
    }

    // Convert from local space to UV space and add center offset
    return corners.map((corner) => {
      // Corner is in local space relative to center, add center position
      return new THREE.Vector2(centerPos.x + corner.x, centerPos.y + corner.y);
    });
  }

  // Function to update obstacle meshes
  function updateObstacleMeshes() {
    const leftPos = uniforms.uSideTextLeftPos.value;
    const leftSize = uniforms.uSideTextLeftSize.value;
    const rightPos = uniforms.uSideTextRightPos.value;
    const rightSize = uniforms.uSideTextRightSize.value;

    // Update trapezoid active state based on visibility
    if (leftPos.x >= 0.0 && leftSize.x > 0.001 && leftSize.y > 0.001) {
      uniforms.uTrapezoidActive.value = 1.0;
    } else {
      uniforms.uTrapezoidActive.value = 0.0;
    }

    // Right obstacle
    if (rightPos.x >= 0.0 && rightSize.x > 0.001 && rightSize.y > 0.001) {
      uniforms.uTrapezoidRightActive.value = 1.0;
    } else {
      uniforms.uTrapezoidRightActive.value = 0.0;
    }

    // Update left obstacle mesh
    if (leftPos.x >= 0.0 && leftSize.x > 0.001 && leftSize.y > 0.001) {
      // Use positions directly - both shader and calculateTextBounds use Y=0 at bottom
      const corners = calculateObstacleCorners(
        leftPos,
        leftSize,
        uniforms.uSideTextLeftRotation.value,
        true,
        uniforms.uSideTextLeftTopRightCornerOffsetX.value,
        uniforms.uSideTextLeftTopRightCornerOffsetY.value,
        uniforms.uSideTextLeftTopLeftCornerOffsetX.value,
        uniforms.uSideTextLeftTopLeftCornerOffsetY.value,
        uniforms.uSideTextLeftBottomRightCornerOffsetX.value,
        uniforms.uSideTextLeftBottomRightCornerOffsetY.value,
        uniforms.uSideTextLeftBottomLeftCornerOffsetX.value,
        uniforms.uSideTextLeftBottomLeftCornerOffsetY.value
      );

      // Create or update mesh
      if (!leftObstacleMesh) {
        const geometry = new THREE.BufferGeometry();
        leftObstacleMesh = new THREE.Mesh(geometry, obstacleMaterial.clone());
        leftObstacleMesh.renderOrder = -998; // Just after spiral background
        parent.add(leftObstacleMesh);
      }

      // Update geometry with new corners
      const positions = new Float32Array([
        ...uvToWorldPos(corners[0]).toArray(),
        ...uvToWorldPos(corners[1]).toArray(),
        ...uvToWorldPos(corners[2]).toArray(),
        ...uvToWorldPos(corners[0]).toArray(),
        ...uvToWorldPos(corners[2]).toArray(),
        ...uvToWorldPos(corners[3]).toArray(),
      ]);

      const uvs = new Float32Array([
        1.0,
        1.0, // top-right
        0.0,
        1.0, // top-left
        0.0,
        0.0, // bottom-left
        1.0,
        1.0, // top-right
        0.0,
        0.0, // bottom-left
        1.0,
        0.0, // bottom-right
      ]);

      leftObstacleMesh.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      leftObstacleMesh.geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(uvs, 2)
      );
      leftObstacleMesh.geometry.computeVertexNormals();
      leftObstacleMesh.visible = true;

      // Update edge lines
      updateEdgeLines(corners, leftObstacleLines, "left");

    } else if (leftObstacleMesh) {
      leftObstacleMesh.visible = false;
      // Hide edge lines
      leftObstacleLines.forEach((line) => {
        line.visible = false;
      });
    }

    // Update right obstacle mesh (still needed for visual mesh, but trapezoid uses mirrored left corners)
    if (rightPos.x >= 0.0 && rightSize.x > 0.001 && rightSize.y > 0.001) {
      // Use positions directly - both shader and calculateTextBounds use Y=0 at bottom
      const corners = calculateObstacleCorners(
        rightPos,
        rightSize,
        uniforms.uSideTextRightRotation.value,
        false,
        0.0, // topRightCornerOffsetX - right obstacle uses different corner order
        0.0, // topRightCornerOffsetY
        0.0, // topLeftCornerOffsetX
        0.0, // topLeftCornerOffsetY
        0.0, // bottomRightCornerOffsetX
        0.0, // bottomRightCornerOffsetY
        0.0, // bottomLeftCornerOffsetX
        0.0 // bottomLeftCornerOffsetY
      );

      // Create or update mesh
      if (!rightObstacleMesh) {
        const geometry = new THREE.BufferGeometry();
        rightObstacleMesh = new THREE.Mesh(geometry, obstacleMaterial.clone());
        rightObstacleMesh.renderOrder = -998; // Just after spiral background
        parent.add(rightObstacleMesh);
      }

      // Update geometry with new corners
      // Right obstacle corner order: topLeft, topRight, bottomRight, bottomLeft
      const positions = new Float32Array([
        ...uvToWorldPos(corners[0]).toArray(), // topLeft
        ...uvToWorldPos(corners[1]).toArray(), // topRight
        ...uvToWorldPos(corners[2]).toArray(), // bottomRight
        ...uvToWorldPos(corners[0]).toArray(), // topLeft
        ...uvToWorldPos(corners[2]).toArray(), // bottomRight
        ...uvToWorldPos(corners[3]).toArray(), // bottomLeft
      ]);

      const uvs = new Float32Array([
        0.0,
        1.0, // top-left
        1.0,
        1.0, // top-right
        1.0,
        0.0, // bottom-right
        0.0,
        1.0, // top-left
        1.0,
        0.0, // bottom-right
        0.0,
        0.0, // bottom-left
      ]);

      rightObstacleMesh.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      rightObstacleMesh.geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(uvs, 2)
      );
      rightObstacleMesh.geometry.computeVertexNormals();
      rightObstacleMesh.visible = true;

      // Update edge lines
      updateEdgeLines(corners, rightObstacleLines, "right");
    } else if (rightObstacleMesh) {
      rightObstacleMesh.visible = false;
      // Hide edge lines
      rightObstacleLines.forEach((line) => {
        line.visible = false;
      });
    } else {
      // If right obstacle doesn't exist but left does, right trapezoid is still active (mirrored from left)
      // If neither exists, both are inactive (handled in left obstacle else clause above)
    }
  }

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

    // Update plane size
    calculatePlaneSize();

    // Update plane geometry dimensions
    plane.geometry.dispose();
    plane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

    updateCenters();
    // Update obstacle meshes when resizing
    updateObstacleMeshes();
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
    // Update obstacle meshes every frame to ensure trapezoid corners stay aligned
    updateObstacleMeshes();

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
    // Clean up edge lines
    leftObstacleLines.forEach((line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    leftObstacleLines.length = 0;

    rightObstacleLines.forEach((line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    rightObstacleLines.length = 0;

    edgeLineMaterial.dispose();
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
    // Clean up obstacle meshes
    if (leftObstacleMesh) {
      parent.remove(leftObstacleMesh);
      leftObstacleMesh.geometry.dispose();
      (leftObstacleMesh.material as THREE.Material).dispose();
    }
    if (rightObstacleMesh) {
      parent.remove(rightObstacleMesh);
      rightObstacleMesh.geometry.dispose();
      (rightObstacleMesh.material as THREE.Material).dispose();
    }
    obstacleMaterial.dispose();

    // Clean up edge lines
    leftObstacleLines.forEach((line: THREE.Line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    leftObstacleLines.length = 0;

    rightObstacleLines.forEach((line: THREE.Line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    rightObstacleLines.length = 0;

    edgeLineMaterial.dispose();

    parent.remove(plane);
    plane.geometry.dispose();
    mat.dispose();
  }

  // initial resize
  resize();

  // Method to update side text positions for obstacle effect
  function updateSideTextPositions(
    leftPos: THREE.Vector2 | null,
    rightPos: THREE.Vector2 | null,
    leftSize: THREE.Vector2 | null = null,
    rightSize: THREE.Vector2 | null = null
  ) {
    if (leftPos && leftSize) {
      uniforms.uSideTextLeftPos.value.copy(leftPos);
      uniforms.uSideTextLeftSize.value.copy(leftSize);
    } else {
      // Hide left text obstacle
      uniforms.uSideTextLeftPos.value.set(-1.0, 0.5);
      uniforms.uSideTextLeftSize.value.set(0.0, 0.0);
    }

    if (rightPos && rightSize) {
      uniforms.uSideTextRightPos.value.copy(rightPos);
      uniforms.uSideTextRightSize.value.copy(rightSize);
    } else {
      // Hide right text obstacle
      uniforms.uSideTextRightPos.value.set(-1.0, 0.5);
      uniforms.uSideTextRightSize.value.set(0.0, 0.0);
    }

    // Update obstacle meshes when positions change
    updateObstacleMeshes();
  }

  // Method to update edge angles immediately (no animation delay)
  function updateEdgeAngles(
    leftTopAngle?: number,
    leftBottomAngle?: number,
    rightTopAngle?: number,
    rightBottomAngle?: number
  ) {
    if (leftTopAngle !== undefined) {
      uniforms.uSideTextLeftTopAngle.value = leftTopAngle;
    }
    if (leftBottomAngle !== undefined) {
      uniforms.uSideTextLeftBottomAngle.value = leftBottomAngle;
    }
    if (rightTopAngle !== undefined) {
      uniforms.uSideTextRightTopAngle.value = rightTopAngle;
    }
    if (rightBottomAngle !== undefined) {
      uniforms.uSideTextRightBottomAngle.value = rightBottomAngle;
    }

    // Update obstacle meshes when angles change
    updateObstacleMeshes();
  }

  // Method to update obstacle rotation immediately (no animation delay)
  function updateObstacleRotation(
    leftRotation?: number,
    rightRotation?: number
  ) {
    if (leftRotation !== undefined) {
      uniforms.uSideTextLeftRotation.value = leftRotation;
    }
    if (rightRotation !== undefined) {
      uniforms.uSideTextRightRotation.value = rightRotation;
    }

    // Update obstacle meshes when rotation changes
    updateObstacleMeshes();
  }

  return {
    mesh: plane,
    update,
    resize,
    dispose,
    material: mat,
    updateSideTextPositions,
    updateEdgeAngles,
    updateObstacleRotation,
    uniforms, // Expose uniforms for direct access if needed
  };
}
