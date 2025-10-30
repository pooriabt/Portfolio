// src/components/archdoorCanvas.ts
import { gsap } from "gsap";

export type ArchController = {
  canvas: HTMLCanvasElement;
  start: () => void;
  stop: () => void;
  resize: (w: number, h: number) => void;
};

export function createArchDoorCanvas(
  imageUrls: string[],
  width = 1024,
  height = 2048,
  onUpdate?: () => void
): ArchController {
  // create main canvas
  let currentWidth = width;
  let currentHeight = height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Load images synchronously (already loaded in React)
  const imgs: HTMLImageElement[] = [];
  imageUrls.forEach((src, index) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      imgs[index] = img;
      // If all images are loaded and we haven't started yet, start the animation
      if (
        imgs.length === imageUrls.length &&
        imgs.every((img) => img.complete)
      ) {
        drawFrame();
        if (!stopped) step();
      }
    };
  });

  // state (blob + radius)
  const state = {
    x: currentWidth * 0.5,
    y: currentHeight * 0.5,
    r: Math.max(80, Math.min(currentWidth, currentHeight) * 0.28) * 2.0,
  };

  // Image positions on canvas
  const positions = [
    {
      x: 0.7 * currentWidth,
      y: 0.045 * currentHeight, // Moved down by half: from 0.01 to 0.045 (down by 0.035)
      w: currentWidth * 0.5,
      anchor: "tl",
    },
    {
      x: currentWidth / 2,
      y: 0.46 * currentHeight, // Moved down by half: from 0.42 to 0.46 (down by 0.04)
      w: currentWidth,
      anchor: "tc",
    },
    {
      x: 0.75 * currentWidth,
      y: 1.03 * currentHeight, // Moved DOWN: y > 1.0 extends below canvas bottom, positioning ring lower in portal
      w: currentWidth * 0.75,
      anchor: "bl",
    },
  ];

  // Calculate influence of blob on a given position
  function influence(px: number, py: number): number {
    const d = Math.hypot(px - state.x, py - state.y);
    const outer = state.r * 1;
    const t = Math.max(0, Math.min(1, d / outer));
    const s = 1 - t;
    return s * s * (3 - 2 * s); // smoothstep
  }

  function drawFrame() {
    // Line 84: Early return if less than 3 images loaded or any image is not fully loaded yet
    if (imgs.length < 3 || !imgs.every((img) => img.complete)) return;

    // Line 86: Clear the entire canvas by removing all previous drawings from coordinates (0,0) to (currentWidth, currentHeight)
    ctx.clearRect(0, 0, currentWidth, currentHeight);

    // Calculate horizontal animation for imgB (ring) and imgC (arch-tools) based on portal width
    // Portal width range: center ± radius = (0.5 ± 0.15) * currentWidth = 0.35 to 0.65 of canvas width
    const portalCenterX = currentWidth * 0.5;
    const portalRadiusX = currentWidth * 0.15;
    const portalMinX = portalCenterX - portalRadiusX;
    const portalMaxX = portalCenterX + portalRadiusX;
    const portalRange = portalMaxX - portalMinX;

    // Create looping horizontal movement using sine wave
    // Different speeds/offsets for imgB and imgC to create varied motion
    const time = Date.now() * 0.0005; // Slow animation (0.0005 speed factor)
    const imgCOffset = Math.sin(time) * portalRange * 0.5; // imgC (arch-tools) moves within half portal width
    const imgBOffset = Math.sin(time + Math.PI * 0.7) * portalRange * 0.5; // imgB (ring) offset by ~70% phase

    // draw images with blur and opacity based on distance from blob
    // Line 89: Loop through all loaded images (should be 3: perse, ring, arch-tools)
    for (let i = 0; i < imgs.length; i++) {
      // Line 90: Get the current image element from the imgs array
      const img = imgs[i];
      // Line 91: Get the pre-defined position configuration for this image (from positions array)
      const p = positions[i];

      // Apply horizontal animation to imgB (index 2, ring) and imgC (index 0, arch-tools)
      // imgA (index 1, perse) remains at original position
      let animatedX = p.x;
      if (i === 0) {
        // imgC (arch-tools.png)
        animatedX = portalCenterX + imgCOffset;
      } else if (i === 2) {
        // imgB (ring.png)
        animatedX = portalCenterX + imgBOffset;
      }
      // imgA (index 1, perse.png) uses original p.x - no animation
      // Line 92: Calculate the aspect ratio (width/height) of the image to maintain proportions
      const aspect = img.width / img.height;
      // Line 93: Get the target width for this image from the position configuration
      const w = p.w;
      // Line 94: Calculate the target height based on width and aspect ratio to maintain image proportions
      const h = w / aspect;

      // Line 96: Calculate the influence value (0-1) where 0 = far from blob, 1 = at blob center
      // Higher influence means more blur/distortion when blob is near this image position
      // Use animatedX position for influence calculation for imgA and imgB
      const inf = influence(animatedX, p.y);
      // Line 97: Calculate opacity: inverse of influence (1 - inf), clamped between 0 and 1
      // When blob is close (inf=1), opacity=0 (fully transparent), when far (inf=0), opacity=1 (fully opaque)
      const opacity = Math.max(0, Math.min(1, 1 - inf));
      // Line 98: Calculate blur amount in pixels: multiply influence by 20
      // When blob is at position (inf=1), blur=20px; when far (inf=0), blur=0px
      const blurPx = 20 * inf;
      // Line 99: Base scale reduces slightly when blob is near: 1.0 becomes 0.94 at max influence
      // Images shrink by 6% when blob is directly on them
      const baseScale = 1 - 0.06 * inf;
      // Line 100: Scale up when far from blob: adds up to 8% size increase when blob is far away
      // This creates a "breathing" effect - images enlarge when blob moves away
      const scaleUpWhenFar = 1 + (1 - inf) * 0.08;
      // Line 101: Final scale combines baseScale (shrinks when close) and scaleUpWhenFar (grows when far)
      const scale = baseScale * scaleUpWhenFar;
      // Line 102: Rotation amount is maximum 0.15 radians (about 8.6 degrees) when blob is far
      // Rotation decreases to 0 when blob is close (creating a "settling" effect)
      const rotationAmount = (1 - inf) * 0.15;
      // Line 103: Calculate rotation angle using sine wave based on current time and image index
      // Date.now() * 0.001 converts to seconds, +i adds phase offset per image, then scaled by rotationAmount
      // This creates a gentle oscillating rotation that varies per image
      const rotationAngle = Math.sin(Date.now() * 0.001 + i) * rotationAmount;
      // Line 104: Calculate perspective scale factor from rotation angle using cosine
      // When rotated 90° (cos=0), width appears 0 (edge-on view), creating 3D perspective effect
      const perspectiveScale = Math.cos(rotationAngle);

      // Line 106: Final width = base width × scale × perspective effect
      // Perspective scale makes rotated images appear narrower (width contracts with rotation)
      const scaledW = w * scale * perspectiveScale;
      // Line 107: Final height = base height × scale (height not affected by perspective rotation in this 2D context)
      const scaledH = h * scale;
      // Line 108: Use animated X position (for imgA and imgB) or original position (for imgC)
      let centerX = animatedX;
      // Line 109-110: Calculate center Y based on image index and anchor point:
      // Index 0 (top image): centerY = position.y + half height (anchored at top, so shift down)
      // Index 1 (middle image): centerY = position.y (anchored at center, no shift)
      // Index 2 (bottom image): centerY = position.y - half height (anchored at bottom, so shift up)
      let centerY =
        i === 0 ? p.y + scaledH / 2 : i === 1 ? p.y : p.y - scaledH / 2;

      // Line 112: Save current canvas context state (transforms, alpha, filters, etc.) to restore later
      ctx.save();
      // Line 113: Set global alpha (opacity) for all subsequent drawing operations
      ctx.globalAlpha = opacity;
      // Line 114-116: Apply blur filter only if blur amount is greater than 0 pixels
      if (blurPx > 0) {
        ctx.filter = `blur(${blurPx}px)`;
      }

      // Line 118: Move the canvas coordinate system origin to (centerX, centerY) for rotation around center
      ctx.translate(centerX, centerY);
      // Line 119: Rotate the canvas coordinate system by rotationAngle radians around the current origin
      ctx.rotate(rotationAngle);
      // Line 120: Draw the image centered at origin, offset by negative half-width/height
      // Since we translated to center and rotated, drawing at (-scaledW/2, -scaledH/2) centers the image
      // Image will be drawn with calculated scaled dimensions and current rotation applied
      ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      // Line 121: Restore the canvas context to the state saved at line 112 (undoes translate, rotate, alpha, filter)
      ctx.restore();
    }
  }

  // Random walk animation for blob movement
  let tween: gsap.core.Tween | null = null;
  let stopped = false;
  const rand = (a: number, b: number) => Math.random() * (b - a) + a;

  function area() {
    return {
      minX: currentWidth * 0.08,
      maxX: currentWidth * 0.92,
      minY: currentHeight * 0.08,
      maxY: currentHeight * 0.92,
    };
  }

  function step() {
    if (stopped) return;
    const a = area();
    const target = { x: rand(a.minX, a.maxX), y: rand(a.minY, a.maxY) };
    tween?.kill();
    tween = gsap.to(state, {
      x: target.x,
      y: target.y,
      duration: rand(0.9, 1.4),
      ease: "sine.inOut",
      onUpdate() {
        drawFrame();
        onUpdate?.();
      },
      onComplete() {
        if (!stopped) step();
      },
    });
  }

  return {
    canvas,
    start: () => {
      stopped = false;
      step();
    },
    stop: () => {
      stopped = true;
      tween?.kill();
      tween = null;
    },
    resize: (w: number, h: number) => {
      canvas.width = w;
      canvas.height = h;
      positions[0] = { x: 0.7 * w, y: 0.045 * h, w: w * 0.5, anchor: "tl" };
      positions[1] = { x: w / 2, y: 0.46 * h, w: w, anchor: "tc" };
      positions[2] = { x: 0.75 * w, y: 0.9 * h, w: w * 0.75, anchor: "bl" };
      state.x *= w / currentWidth;
      state.y *= h / currentHeight;
      state.r = Math.max(80, Math.min(w, h) * 0.28) * 2.0;
      currentWidth = w;
      currentHeight = h;
      drawFrame();
    },
  };
}
