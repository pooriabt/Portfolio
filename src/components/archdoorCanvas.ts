// src/components/archdoorCanvas.ts
import { gsap } from "gsap";

export type ArchController = {
  canvas: HTMLCanvasElement;
  start: () => void;
  stop: () => void;
  resize: (w: number, h: number) => void;
};
// dasd
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

  // ============================================================================
  // #4 LOCATION: Where each PNG file is positioned in the door texture
  // ============================================================================
  // x, y = center position of each image (in canvas coordinates)
  // Change these values to move PNG files around on the door texture
  // positions[0] = top-left image, positions[1] = middle-right, positions[2] = bottom-left
  const positions = [
    {
      x: 0.7 * currentWidth,
      y: 0.01 * currentHeight,
      w: currentWidth * 0.5, // PNG width as fraction of canvas width (0.4 = 40% of canvas)
      anchor: "tl",
    },
    {
      x: currentWidth / 2,
      y: 0.42 * currentHeight,
      w: currentWidth,
      anchor: "tc",
    },
    {
      x: 0.75 * currentWidth,
      y: currentHeight,
      w: currentWidth * 0.75,
      anchor: "bl",
    },
  ];

  // Calculate influence of blob on a given position (matching ArchDoor.tsx)
  function influence(px: number, py: number): number {
    const d = Math.hypot(px - state.x, py - state.y);
    const outer = state.r * 1;
    const t = Math.max(0, Math.min(1, d / outer));
    const s = 1 - t; // inside -> 1
    return s * s * (3 - 2 * s); // smoothstep
  }

  function drawFrame() {
    if (imgs.length < 3 || !imgs.every((img) => img.complete)) return;

    ctx.clearRect(0, 0, currentWidth, currentHeight);

    // draw images with blur and opacity based on distance from blob
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const p = positions[i];
      const aspect = img.width / img.height;
      const w = p.w;
      const h = w / aspect;

      // Calculate influence for this image's center
      const inf = influence(p.x, p.y);

      // Apply opacity and blur based on influence (matching ArchDoor.tsx logic)
      const opacity = Math.max(0, Math.min(1, 1 - inf));

      // ============================================================================
      // #5 BLUR INTENSITY: How to change amount of blur intensity
      // ============================================================================
      // Change the multiplier (6) to adjust blur intensity
      // Higher number = more blur, Lower number = less blur
      const blurPx = 20 * inf; // <-- Change 6 to adjust blur intensity (e.g., 3 = less blur, 12 = more blur)

      // ============================================================================
      // #2 SCALE: Where to scale each PNG file (dynamic scaling based on blur distance)
      // ============================================================================
      // baseScale: scales DOWN when blob is nearby (blur effect)
      // scaleUpWhenFar: scales UP when blob is far away (clear, no blur)
      // Change 0.06 to adjust how much images shrink when blob is near
      // Change 0.08 to adjust how much images grow when blob is far
      const baseScale = 1 - 0.06 * inf; // <-- Change 0.06 to adjust shrinking near blob
      const scaleUpWhenFar = 1 + (1 - inf) * 0.08; // <-- Change 0.08 to adjust growth when far (0.08 = 8% bigger)
      const scale = baseScale * scaleUpWhenFar;

      // ============================================================================
      // #6 ROTATION AXIS: How to change rotation axis of each PNG file
      // ============================================================================
      // Currently rotating around Y-axis (vertical axis - like tilting forward/back)
      // Change 0.15 to adjust rotation amount (more = more tilt)
      // To change axis: modify ctx.rotate() line below
      // - Remove ctx.rotate() = no rotation
      // - Use rotationAngle = horizontal rotation
      // - For different axes, apply different context transforms
      const rotationAmount = (1 - inf) * 0.15; // <-- Change 0.15 to adjust rotation amount (radians)
      const rotationAngle = Math.sin(Date.now() * 0.001 + i) * rotationAmount;

      // Perspective scale for 3D effect
      const perspectiveScale = Math.cos(rotationAngle);

      // Apply scale by adjusting dimensions with perspective
      const scaledW = w * scale * perspectiveScale;
      const scaledH = h * scale;

      // Calculate position based on anchor for rotation center
      let centerX = p.x;
      let centerY = 0;

      if (i === 0) {
        // Image A: top-left anchor - y is at top
        centerY = p.y + scaledH / 2;
      } else if (i === 1) {
        // Image B: top-center anchor (centered vertically)
        centerY = p.y;
      } else {
        // Image C: bottom-left anchor - y is at bottom
        centerY = p.y - scaledH / 2;
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      if (blurPx > 0) {
        ctx.filter = `blur(${blurPx}px)`;
      }

      // Apply rotation with perspective for 3D effect (left side comes out, right goes in)
      ctx.translate(centerX, centerY);
      // #6 ROTATION AXIS: This line controls rotation
      // ctx.rotate(rotationAngle) = Y-axis rotation (current, tilting forward/back)
      // To disable rotation: comment out this line
      // To change to X-axis: use ctx.rotateX() or adjust calculations above
      ctx.rotate(rotationAngle); // <-- This rotates around Z-axis (like a card spinning)
      ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      ctx.restore();
    }
  }

  // ============================================================================
  // #3 BLUR CIRCLE MOVEMENT: Where to determine how blur circles move on PNG files
  // ============================================================================
  // GSAP random walk animation controls the blob movement
  let tween: gsap.core.Tween | null = null;
  let stopped = false;
  const rand = (a: number, b: number) => Math.random() * (b - a) + a;

  // Define the movement area for blur circles
  function area() {
    return {
      // Change 0.08 and 0.92 to adjust movement boundaries
      // 0.08 = 8% margin from edges, 0.92 = 92% of width (keeps blob away from edges)
      minX: currentWidth * 0.08, // <-- Left boundary
      maxX: currentWidth * 0.92, // <-- Right boundary
      minY: currentHeight * 0.08, // <-- Top boundary
      maxY: currentHeight * 0.92, // <-- Bottom boundary
    };
  }

  // Controls how blob moves smoothly across the texture
  function step() {
    if (stopped) return;
    const a = area();
    const target = { x: rand(a.minX, a.maxX), y: rand(a.minY, a.maxY) };
    tween?.kill();
    tween = gsap.to(state, {
      x: target.x,
      y: target.y,
      // Change rand(0.9, 1.4) to adjust movement speed
      // Lower values = faster movement, Higher values = slower movement
      duration: rand(0.9, 1.4), // <-- Change these to adjust movement duration (seconds)
      ease: "sine.inOut", // <-- Change easing: "linear", "power2", "bounce", etc.
      onUpdate() {
        drawFrame();
        onUpdate?.();
      },
      onComplete() {
        if (!stopped) step();
      },
    });
  }

  // Return controller immediately
  return {
    canvas,
    start: () => {
      stopped = false;
      drawFrame();
      if (!stopped) step();
    },
    stop: () => {
      stopped = true;
      tween?.kill();
      tween = null;
    },
    resize: (w: number, h: number) => {
      const sx = w / currentWidth;
      const sy = h / currentHeight;
      canvas.width = w;
      canvas.height = h;

      // Recalculate positions for new dimensions
      positions[0] = {
        x: 0.08 * w + (0.4 * w) / 2,
        y: 0.08 * h,
        w: 0.4 * w,
        anchor: "tl",
      };
      positions[1] = {
        x: w - 0.06 * w - (0.45 * w) / 2,
        y: 0.4 * h,
        w: 0.45 * w,
        anchor: "tc",
      };
      positions[2] = {
        x: 0.1 * w + (0.38 * w) / 2,
        y: h - 0.08 * h,
        w: 0.38 * w,
        anchor: "bl",
      };

      state.x *= sx;
      state.y *= sy;
      state.r = Math.max(80, Math.min(w, h) * 0.28) * 2.0;
      currentWidth = w;
      currentHeight = h;
      drawFrame();
    },
  };
}
