/**
 * Column Text Positioning Logic
 * 
 * This file contains the logic for keeping column texts (red and blue columns)
 * properly positioned and constrained within their respective columns.
 * 
 * Extract this logic and integrate it into your useDoorSceneSetup.ts file
 * after reverting to your prior checkpoint.
 */

// ============================================================================
// 1. COLUMN TEXT CONSTANTS (add at top of component/hook)
// ============================================================================

const leftColumnText =
  "Design Works Architecture, jewelry, and industrial works created through precise 3D modeling, prepared for visualization, 3D printing, and CNC fabrication.";
const rightColumnText =
  "Development\n\nPython and JavaScript–based solutions integrating machine learning, image processing, and modern development frameworks including React, React Native, and Next.js.";

// Store font for text wrapping in updateSizing
let columnTextFont: any = null;

// Column text elements for left and right columns
const columnTexts: THREE.Mesh[] = [];

// ============================================================================
// 2. FONT LOADING (integrate into your font loading function)
// ============================================================================

// Inside your font loader callback:
// columnTextFont = font; // Store font for text wrapping

// ============================================================================
// 3. TEXT WRAP FUNCTION (add inside your component/hook)
// ============================================================================

function wrapTextToFitWidth(
  text: string,
  font: any,
  baseSize: number,
  maxWidth: number
): string {
  // Split text into words (preserve existing line breaks)
  const paragraphs = text.split(/\n/);
  const wrappedLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      wrappedLines.push(""); // Preserve empty lines
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      // Test if adding this word would exceed the width
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testGeometry = new TextGeometry(testLine, {
        font: font,
        size: baseSize,
        depth: 0.02,
        curveSegments: 12,
        bevelEnabled: false,
      });
      testGeometry.computeBoundingBox();
      const testWidth =
        testGeometry.boundingBox!.max.x - testGeometry.boundingBox!.min.x;

      // Dispose temporary geometry
      testGeometry.dispose();

      if (testWidth <= maxWidth || currentLine === "") {
        // Fits or it's the first word (must add it even if too long)
        currentLine = testLine;
      } else {
        // Doesn't fit, start new line
        lines.push(currentLine);
        currentLine = word;
      }
    }

    // Add remaining line
    if (currentLine) {
      lines.push(currentLine);
    }

    wrappedLines.push(...lines);
  }

  return wrappedLines.join("\n");
}

// ============================================================================
// 4. COLUMN TEXT CREATION (integrate into your font loading callback)
// ============================================================================

// Inside your font loader callback, after loading the font:
// Create column text meshes
const leftTextMesh = createWavyText({
  text: leftColumnText,
  font: font,
  position: { x: 0, y: -2, z: -8 }, // Will be positioned in updateSizing
  size: 1.08, // Smaller size for body text (will be adjusted in updateSizing)
  color: "#ffffff",
  spiralUniforms: {
    uTime: spiralUniforms.uTime as { value: number },
    uResolution: spiralUniforms.uResolution as {
      value: THREE.Vector2;
    },
    uCenter0: spiralUniforms.uCenter0 as {
      value: THREE.Vector2;
    },
    uCenter1: spiralUniforms.uCenter1 as {
      value: THREE.Vector2;
    },
    uSpeed: spiralUniforms.uSpeed as { value: number },
    uBands: spiralUniforms.uBands as { value: number },
  },
});

const rightTextMesh = createWavyText({
  text: rightColumnText,
  font: font,
  position: { x: 0, y: -2, z: -8 }, // Will be positioned in updateSizing
  size: 0.08, // Smaller size for body text (will be adjusted in updateSizing)
  color: "#ffffff",
  spiralUniforms: {
    uTime: spiralUniforms.uTime as { value: number },
    uResolution: spiralUniforms.uResolution as {
      value: THREE.Vector2;
    },
    uCenter0: spiralUniforms.uCenter0 as {
      value: THREE.Vector2;
    },
    uCenter1: spiralUniforms.uCenter1 as {
      value: THREE.Vector2;
    },
    uSpeed: spiralUniforms.uSpeed as { value: number },
    uBands: spiralUniforms.uBands as { value: number },
  },
});

// Set initial scale to 0 to prevent rendering in center before updateSizing
leftTextMesh.scale.setScalar(0);
rightTextMesh.scale.setScalar(0);

// Store original text for wrapping
leftTextMesh.userData.originalText = leftColumnText;
rightTextMesh.userData.originalText = rightColumnText;

sceneRoot.add(leftTextMesh, rightTextMesh);
columnTexts.push(leftTextMesh, rightTextMesh);

// ============================================================================
// 5. TEXT POSITIONING LOGIC (add inside updateSizing function)
// ============================================================================

// Add this block inside your updateSizing() function, after column fills are positioned

if (columnTexts.length >= 2) {
  const leftTextMesh = columnTexts[0];
  const rightTextMesh = columnTexts[1];

  // Layout: [Left Outer][Left Portal][Middle][Right Portal][Right Outer]
  // Left text goes in Left Outer Column (red)
  // Right text goes in Right Outer Column (blue)

  // Position text beside portals (at portal Y level)
  const textZ = -8;

  // Calculate frustum for text position (at textZ depth) - MUST match text position calculation
  const textDistance = Math.abs(camera.position.z - textZ);
  const textVfov = (camera.fov * Math.PI) / 180;
  const frustumHeightAtText = 2 * textDistance * Math.tan(textVfov / 2);
  const frustumWidthAtText = frustumHeightAtText * camera.aspect;

  // Convert column boundaries from CSS to world space using text frustum
  const toWorldText = (css: number) =>
    (css / viewportWidthCss - 0.5) * frustumWidthAtText;

  // Get visible frustum boundaries in world space at text depth
  const frustumLeftEdgeWorldText = -frustumWidthAtText / 2;
  const frustumRightEdgeWorldText = frustumWidthAtText / 2;

  // Get column boundaries in world space at text depth, clamped to visible frustum
  // NOTE: These variables should already be calculated earlier in updateSizing:
  // - leftOuterLeftCss, leftOuterRightCss
  // - rightOuterLeftCss, rightOuterRightCss
  const leftOuterLeftWorldText = Math.max(
    toWorldText(leftOuterLeftCss),
    frustumLeftEdgeWorldText
  );
  const leftOuterRightWorldText = Math.min(
    toWorldText(leftOuterRightCss),
    frustumRightEdgeWorldText
  );
  const rightOuterLeftWorldText = Math.max(
    toWorldText(rightOuterLeftCss),
    frustumLeftEdgeWorldText
  );
  const rightOuterRightWorldText = Math.min(
    toWorldText(rightOuterRightCss),
    frustumRightEdgeWorldText
  );

  // Calculate actual column widths in world space at text depth
  const leftOuterWidthWorldText =
    leftOuterRightWorldText - leftOuterLeftWorldText;
  const rightOuterWidthWorldText =
    rightOuterRightWorldText - rightOuterLeftWorldText;

  const textY = -portalHeightWorld / 2 - 0.3; // Slightly below portal bottom

  // Determine text size based on screen width
  let columnTextSize: number;
  if (viewportWidthCss >= 900) {
    columnTextSize = 0.2;
  } else if (viewportWidthCss > 700 && viewportWidthCss < 900) {
    columnTextSize = 0.175;
  } else {
    columnTextSize = 0.0;
  }

  // Padding from column edges (10% on each side = 20% total padding)
  // Add extra margin for shader distortion effects
  const paddingRatio = 0.1;
  const distortionMargin = 0.05; // Extra margin for wavy text distortion
  const effectivePaddingRatio = paddingRatio + distortionMargin;

  // Calculate available width for text wrapping
  const leftMaxAllowedWidthForWrap =
    leftOuterWidthWorldText * (1 - 2 * effectivePaddingRatio);
  const rightMaxAllowedWidthForWrap =
    rightOuterWidthWorldText * (1 - 2 * effectivePaddingRatio);

  // Wrap text if font is loaded
  if (columnTextFont) {
    // Get original text
    const leftOriginalText =
      leftTextMesh.userData.originalText || leftColumnText;
    const rightOriginalText =
      rightTextMesh.userData.originalText || rightColumnText;

    // Wrap text based on available width
    const leftWrappedText = wrapTextToFitWidth(
      leftOriginalText,
      columnTextFont,
      columnTextSize,
      leftMaxAllowedWidthForWrap
    );
    const rightWrappedText = wrapTextToFitWidth(
      rightOriginalText,
      columnTextFont,
      columnTextSize,
      rightMaxAllowedWidthForWrap
    );

    // Store current text to check if we need to recreate geometry
    const leftCurrentText = leftTextMesh.userData.currentWrappedText;
    const rightCurrentText = rightTextMesh.userData.currentWrappedText;

    // Recreate geometry if text changed
    if (leftCurrentText !== leftWrappedText) {
      leftTextMesh.geometry.dispose();
      const newGeometry = new TextGeometry(leftWrappedText, {
        font: columnTextFont,
        size: columnTextSize,
        depth: 0.02,
        curveSegments: 12,
        bevelEnabled: false,
      });
      newGeometry.computeBoundingBox();
      const centerOffset =
        newGeometry.boundingBox!.max.x - newGeometry.boundingBox!.min.x;
      newGeometry.translate(-centerOffset / 2, 0, 0);
      leftTextMesh.geometry = newGeometry;
      leftTextMesh.userData.currentWrappedText = leftWrappedText;
    }

    if (rightCurrentText !== rightWrappedText) {
      rightTextMesh.geometry.dispose();
      const newGeometry = new TextGeometry(rightWrappedText, {
        font: columnTextFont,
        size: columnTextSize,
        depth: 0.02,
        curveSegments: 12,
        bevelEnabled: false,
      });
      newGeometry.computeBoundingBox();
      const centerOffset =
        newGeometry.boundingBox!.max.x - newGeometry.boundingBox!.min.x;
      newGeometry.translate(-centerOffset / 2, 0, 0);
      rightTextMesh.geometry = newGeometry;
      rightTextMesh.userData.currentWrappedText = rightWrappedText;
    }
  }

  // Get text geometry bounding boxes
  if (!leftTextMesh.geometry.boundingBox) {
    leftTextMesh.geometry.computeBoundingBox();
  }
  if (!rightTextMesh.geometry.boundingBox) {
    rightTextMesh.geometry.computeBoundingBox();
  }

  const leftTextBaseWidth =
    leftTextMesh.geometry.boundingBox!.max.x -
    leftTextMesh.geometry.boundingBox!.min.x;
  const rightTextBaseWidth =
    rightTextMesh.geometry.boundingBox!.max.x -
    rightTextMesh.geometry.boundingBox!.min.x;

  const leftMaxAllowedWidth =
    leftOuterWidthWorldText * (1 - 2 * effectivePaddingRatio);
  const rightMaxAllowedWidth =
    rightOuterWidthWorldText * (1 - 2 * effectivePaddingRatio);

  // Calculate scale: ensure text fits within column boundaries
  // Geometry is already created at columnTextSize, so base width is already correct
  // Only scale down if text still doesn't fit after wrapping
  const leftTextScale = Math.min(
    1.0, // Geometry is already at columnTextSize, no scaling needed
    leftMaxAllowedWidth / Math.max(leftTextBaseWidth, 1e-6) // Width constraint - scale down if needed
  );
  const rightTextScale = Math.min(
    1.0, // Geometry is already at columnTextSize, no scaling needed
    rightMaxAllowedWidth / Math.max(rightTextBaseWidth, 1e-6) // Width constraint - scale down if needed
  );

  // Calculate actual text width after scaling (base width only)
  const leftTextActualWidth = leftTextBaseWidth * leftTextScale;
  const rightTextActualWidth = rightTextBaseWidth * rightTextScale;

  // Position texts with proper alignment within columns

  // Calculate safe text boundaries within each column
  // Left text must stay strictly within left outer column: [leftOuterLeftWorldText, leftOuterRightWorldText]
  const leftTextMinX = Math.max(
    leftOuterLeftWorldText +
      effectivePaddingRatio * leftOuterWidthWorldText,
    frustumLeftEdgeWorldText
  );
  const leftTextMaxX = Math.min(
    leftOuterRightWorldText -
      effectivePaddingRatio * leftOuterWidthWorldText,
    frustumRightEdgeWorldText
  );

  // Right text must stay strictly within right outer column: [rightOuterLeftWorldText, rightOuterRightWorldText]
  const rightTextMinX = Math.max(
    rightOuterLeftWorldText +
      effectivePaddingRatio * rightOuterWidthWorldText,
    frustumLeftEdgeWorldText
  );
  const rightTextMaxX = Math.min(
    rightOuterRightWorldText -
      effectivePaddingRatio * rightOuterWidthWorldText,
    frustumRightEdgeWorldText
  );

  // Ensure text fits within available space
  const leftTextAvailableWidth = leftTextMaxX - leftTextMinX;
  const rightTextAvailableWidth = rightTextMaxX - rightTextMinX;

  // If text doesn't fit, reduce scale further
  let finalLeftTextScale = leftTextScale;
  let finalRightTextScale = rightTextScale;

  if (leftTextActualWidth > leftTextAvailableWidth) {
    finalLeftTextScale = leftTextAvailableWidth / leftTextBaseWidth;
  }
  if (rightTextActualWidth > rightTextAvailableWidth) {
    finalRightTextScale = rightTextAvailableWidth / rightTextBaseWidth;
  }

  // Recalculate actual widths with final scale
  const finalLeftTextWidth = leftTextBaseWidth * finalLeftTextScale;
  const finalRightTextWidth = rightTextBaseWidth * finalRightTextScale;

  // Position left text: left-aligned within left outer column
  let leftTextX = leftTextMinX + finalLeftTextWidth / 2;
  // Ensure right edge doesn't exceed column boundary
  const leftTextRightEdge = leftTextX + finalLeftTextWidth / 2;
  if (leftTextRightEdge > leftTextMaxX) {
    leftTextX = leftTextMaxX - finalLeftTextWidth / 2;
  }
  // Ensure left edge doesn't go below minimum
  const leftTextLeftEdge = leftTextX - finalLeftTextWidth / 2;
  if (leftTextLeftEdge < leftTextMinX) {
    leftTextX = leftTextMinX + finalLeftTextWidth / 2;
  }

  // Position right text: right-aligned within right outer column
  let rightTextX = rightTextMaxX - finalRightTextWidth / 2;
  // Ensure left edge doesn't exceed column boundary
  const rightTextLeftEdge = rightTextX - finalRightTextWidth / 2;
  if (rightTextLeftEdge < rightTextMinX) {
    rightTextX = rightTextMinX + finalRightTextWidth / 2;
  }
  // Ensure right edge doesn't go above maximum
  const rightTextRightEdge = rightTextX + finalRightTextWidth / 2;
  if (rightTextRightEdge > rightTextMaxX) {
    rightTextX = rightTextMaxX - finalRightTextWidth / 2;
  }

  // Update left column text - left-aligned within red column
  leftTextMesh.position.set(leftTextX, textY, textZ);
  leftTextMesh.scale.setScalar(finalLeftTextScale);

  // Update right column text - right-aligned within blue column
  rightTextMesh.position.set(rightTextX, textY, textZ);
  rightTextMesh.scale.setScalar(finalRightTextScale);
}


// ============================================================================
// 7. ANIMATION UPDATE (add inside animate function)
// ============================================================================

// Inside your animate() function, add:
// Update column text uniforms to sync with spiral
// columnTexts.forEach((textMesh) => {
//   if (textMesh.material instanceof THREE.ShaderMaterial) {
//     const uniforms = textMesh.material.uniforms;
//     if (uniforms.uTime) uniforms.uTime.value = elapsed;
//     if (spiral?.material?.uniforms) {
//       const spiralUniforms = spiral.material.uniforms;
//       if (uniforms.uCenter0 && spiralUniforms.uCenter0) {
//         (uniforms.uCenter0.value as THREE.Vector2).copy(
//           spiralUniforms.uCenter0.value as THREE.Vector2
//         );
//       }
//       if (uniforms.uCenter1 && spiralUniforms.uCenter1) {
//         (uniforms.uCenter1.value as THREE.Vector2).copy(
//           spiralUniforms.uCenter1.value as THREE.Vector2
//         );
//       }
//       if (uniforms.uResolution && spiralUniforms.uResolution) {
//         (uniforms.uResolution.value as THREE.Vector2).copy(
//           spiralUniforms.uResolution.value as THREE.Vector2
//         );
//       }
//       if (uniforms.uSpeed && spiralUniforms.uSpeed) {
//         uniforms.uSpeed.value = spiralUniforms.uSpeed.value;
//       }
//       if (uniforms.uBands && spiralUniforms.uBands) {
//         uniforms.uBands.value = spiralUniforms.uBands.value;
//       }
//     }
//   }
// });

// ============================================================================
// 8. CLEANUP (add inside dispose function)
// ============================================================================

// Inside your dispose() function, add cleanup for columnTexts:
// columnTexts.forEach((textMesh) => {
//   if (textMesh.geometry) textMesh.geometry.dispose();
//   if (textMesh.material instanceof THREE.Material) textMesh.material.dispose();
// });
// columnTexts.length = 0;

// ============================================================================
// 9. IMPORTANT NOTES
// ============================================================================

// Required variables that must exist in your updateSizing function:
// - viewportWidthCss: number (viewport width in CSS pixels)
// - leftOuterLeftCss: number (left edge of red column in CSS pixels)
// - leftOuterRightCss: number (right edge of red column in CSS pixels)
// - rightOuterLeftCss: number (left edge of blue column in CSS pixels)
// - rightOuterRightCss: number (right edge of blue column in CSS pixels)
// - portalHeightWorld: number (portal height in world units)
// - camera: THREE.PerspectiveCamera (camera object)
// - sceneRoot: THREE.Object3D (root scene object)
// - spiralUniforms: object with spiral shader uniforms (uTime, uResolution, etc.)
// - createWavyText: function that creates wavy text meshes
// - elapsed: number (time elapsed in animate loop)

// Required imports:
// import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
// import * as THREE from "three";

