import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  createTextGeometry,
  getGeometryWidth,
  calculateWordWidth,
} from "./textGeometryHelpers";

/**
 * Wraps text to fit within a maximum width
 */
export function wrapTextToFitWidth(
  text: string,
  font: any,
  baseSize: number,
  maxWidth: number
): string {
  const paragraphs = text.split(/\n/);
  const wrappedLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      wrappedLines.push("");
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
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
      testGeometry.dispose();

      if (testWidth <= maxWidth || currentLine === "") {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    wrappedLines.push(...lines);
  }

  return wrappedLines.join("\n");
}

/**
 * Creates justified text geometry with word wrapping and spacing
 */
export function createJustifiedTextGeometry(
  text: string,
  font: any,
  baseSize: number,
  maxWidth: number,
  lineHeight: number,
  firstLineFontSizeOverride?: number
): { geometry: THREE.BufferGeometry; firstLineFontSize: number } {
  const MAX_SPACE_MULTIPLIER = 2.5;
  const lines = text.split("\n");
  const geometries: THREE.BufferGeometry[] = [];
  let currentY = 0;
  let actualFirstLineFontSize = baseSize;
  let firstNonEmptyLineIndex = -1;
  let overrideApplied = false;

  if (!font || isNaN(baseSize) || baseSize <= 0) {
    return {
      geometry: new THREE.BufferGeometry(),
      firstLineFontSize: baseSize > 0 ? baseSize : 0.2,
    };
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) {
      currentY -= lineHeight;
      continue;
    }

    if (firstNonEmptyLineIndex === -1) {
      firstNonEmptyLineIndex = lineIndex;
    }

    const words = line.split(/\s+/).filter((w) => w.trim());
    if (words.length === 0) {
      currentY -= lineHeight;
      continue;
    }

    const isFirstLine = lineIndex === firstNonEmptyLineIndex;

    if (words.length === 1) {
      const fontSizeToUse =
        isFirstLine &&
        firstLineFontSizeOverride !== undefined &&
        firstLineFontSizeOverride > 0
          ? firstLineFontSizeOverride
          : baseSize;
      if (isFirstLine) {
        actualFirstLineFontSize = fontSizeToUse;
        if (firstLineFontSizeOverride !== undefined && firstLineFontSizeOverride > 0) {
          overrideApplied = true;
        }
      }
      const wordGeometry = createTextGeometry(words[0], font, fontSizeToUse);
      if (wordGeometry && getGeometryWidth(wordGeometry) > 0) {
        wordGeometry.translate(0, currentY, 0);
        geometries.push(wordGeometry);
      }
    } else {
      const isLastLine = lineIndex === lines.length - 1;
      const normalSpaceWidth = Math.max(
        calculateWordWidth(" ", font, baseSize),
        baseSize * 0.3
      );
      const maxAllowedSpaceBetweenWords = normalSpaceWidth * MAX_SPACE_MULTIPLIER;
      const wordWidths = words.map((w) => calculateWordWidth(w, font, baseSize));
      const totalWordWidth = wordWidths.reduce((sum, w) => sum + w, 0);
      const validMaxWidth = Math.max(maxWidth, totalWordWidth || baseSize * 10);
      const numSpaces = words.length - 1;
      let remainingSpace = validMaxWidth - (totalWordWidth + numSpaces * normalSpaceWidth);
      let spaceBetweenWords = normalSpaceWidth;
      let finalFontSize = baseSize;

      if (
        isFirstLine &&
        firstLineFontSizeOverride !== undefined &&
        firstLineFontSizeOverride > 0
      ) {
        finalFontSize = firstLineFontSizeOverride;
        actualFirstLineFontSize = finalFontSize;
        overrideApplied = true;

        const overrideTotalWordWidth = words.reduce(
          (sum, w) => sum + calculateWordWidth(w, font, finalFontSize),
          0
        );
        const overrideNormalSpaceWidth = Math.max(
          calculateWordWidth(" ", font, finalFontSize),
          normalSpaceWidth * (finalFontSize / baseSize)
        );
        const overrideMaxAllowedSpaceBetweenWords =
          overrideNormalSpaceWidth * MAX_SPACE_MULTIPLIER;
        const overrideRemainingSpace =
          validMaxWidth - (overrideTotalWordWidth + numSpaces * overrideNormalSpaceWidth);

        if (numSpaces > 0 && overrideRemainingSpace > 0) {
          const maxTotalExtraSpace =
            numSpaces * (overrideMaxAllowedSpaceBetweenWords - overrideNormalSpaceWidth);
          spaceBetweenWords =
            overrideRemainingSpace <= maxTotalExtraSpace
              ? overrideNormalSpaceWidth + overrideRemainingSpace / numSpaces
              : overrideMaxAllowedSpaceBetweenWords;
        } else {
          spaceBetweenWords = overrideNormalSpaceWidth;
        }
      } else if (numSpaces > 0 && remainingSpace > 0) {
        const maxExtraSpacePerGap =
          maxAllowedSpaceBetweenWords - normalSpaceWidth;
        const maxTotalExtraSpace = numSpaces * maxExtraSpacePerGap;

        if (remainingSpace <= maxTotalExtraSpace) {
          const extraSpacePerGap = remainingSpace / numSpaces;
          spaceBetweenWords = normalSpaceWidth + extraSpacePerGap;
          remainingSpace = 0;
        } else {
          spaceBetweenWords = maxAllowedSpaceBetweenWords;
          remainingSpace = remainingSpace - maxTotalExtraSpace;

          if (remainingSpace > 0.001 && !isLastLine) {
            const currentTotalWidth =
              totalWordWidth + numSpaces * maxAllowedSpaceBetweenWords;
            finalFontSize = baseSize * ((currentTotalWidth + remainingSpace) / currentTotalWidth);
          }
        }

        if (isFirstLine && !overrideApplied) {
          actualFirstLineFontSize = finalFontSize;
        }
      } else if (isFirstLine && !overrideApplied) {
        actualFirstLineFontSize = finalFontSize;
      }

      const validFinalFontSize = Math.max(finalFontSize, baseSize);
      const finalWordGeometries: THREE.BufferGeometry[] = [];
      const finalWordWidths: number[] = [];

      for (const word of words) {
        const wordGeom = createTextGeometry(word, font, validFinalFontSize);
        if (wordGeom) {
          const width = getGeometryWidth(wordGeom);
          if (width > 0) {
            finalWordWidths.push(width);
            finalWordGeometries.push(wordGeom);
          } else {
            wordGeom.dispose();
          }
        }
      }

      if (finalWordGeometries.length === 0) {
        currentY -= lineHeight;
        continue;
      }

      const finalTotalWordWidth = finalWordWidths.reduce((sum, w) => sum + w, 0);
      const usedOverride =
        isFirstLine &&
        firstLineFontSizeOverride !== undefined &&
        firstLineFontSizeOverride > 0;

      if (finalFontSize !== baseSize && !isLastLine && !usedOverride && numSpaces > 0) {
        const newRemainingSpace =
          validMaxWidth - (finalTotalWordWidth + numSpaces * normalSpaceWidth);
        if (newRemainingSpace > 0) {
          const maxExtraSpacePerGap =
            maxAllowedSpaceBetweenWords - normalSpaceWidth;
          const maxTotalExtraSpace = numSpaces * maxExtraSpacePerGap;
          if (newRemainingSpace <= maxTotalExtraSpace) {
            spaceBetweenWords = normalSpaceWidth + newRemainingSpace / numSpaces;
          } else {
            spaceBetweenWords = maxAllowedSpaceBetweenWords;
            const finalRemaining =
              validMaxWidth -
              (finalTotalWordWidth + numSpaces * maxAllowedSpaceBetweenWords);
            if (Math.abs(finalRemaining) > 0.001) {
              spaceBetweenWords += finalRemaining / numSpaces;
            }
          }
        }
      }

      let currentX = 0;
      let finalSpaceBetweenWords = spaceBetweenWords;

      if (!isLastLine) {
        const totalWidthWithSpacing =
          finalTotalWordWidth + numSpaces * spaceBetweenWords;
        const finalRemainingSpace = validMaxWidth - totalWidthWithSpacing;
        if (Math.abs(finalRemainingSpace) > 0.001 && numSpaces > 0) {
          finalSpaceBetweenWords += finalRemainingSpace / numSpaces;
        }
      }

      for (let i = 0; i < finalWordGeometries.length; i++) {
        const wordGeom = finalWordGeometries[i].clone();
        wordGeom.translate(currentX, currentY, 0);
        geometries.push(wordGeom);
        currentX += finalWordWidths[i];
        if (i < finalWordGeometries.length - 1) {
          currentX += finalSpaceBetweenWords;
        }
      }

      finalWordGeometries.forEach((geom) => geom.dispose());
    }

    currentY -= lineHeight;
  }

  if (geometries.length === 0) {
    return {
      geometry: new THREE.BufferGeometry(),
      firstLineFontSize: actualFirstLineFontSize,
    };
  }

  const validGeometries = geometries.filter((geom) => {
    const pos = geom.attributes.position;
    if (!pos || pos.count === 0) {
      geom.dispose();
      return false;
    }
    for (let i = 0; i < Math.min(pos.count, 5); i++) {
      if (
        !isNaN(pos.getX(i)) &&
        !isNaN(pos.getY(i)) &&
        !isNaN(pos.getZ(i))
      ) {
        return true;
      }
    }
    geom.dispose();
    return false;
  });

  if (validGeometries.length === 0) {
    return {
      geometry: new THREE.BufferGeometry(),
      firstLineFontSize: actualFirstLineFontSize,
    };
  }

  if (validGeometries.length === 1) {
    try {
      validGeometries[0].computeBoundingBox();
    } catch (error) {
      console.warn("Failed to compute bounding box:", error);
    }
    return {
      geometry: validGeometries[0],
      firstLineFontSize: actualFirstLineFontSize,
    };
  }

  let mergedGeometry: THREE.BufferGeometry;
  try {
    mergedGeometry = mergeGeometries(validGeometries);
  } catch (error) {
    console.warn("Failed to merge geometries:", error);
    validGeometries.forEach((geom) => geom.dispose());
    return {
      geometry: new THREE.BufferGeometry(),
      firstLineFontSize: actualFirstLineFontSize,
    };
  }

  validGeometries.forEach((geom) => geom.dispose());

  try {
    mergedGeometry.computeBoundingBox();
  } catch (error) {
    console.warn("Failed to compute bounding box:", error);
  }

  return {
    geometry: mergedGeometry,
    firstLineFontSize: actualFirstLineFontSize,
  };
}

