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

  // positions of three images (match ArchDoor layout)
  // Reduced sizes to prevent overflow
  const positions = [
    {
      x: 0.08 * currentWidth + (0.4 * currentWidth) / 2,
      y: 0.08 * currentHeight,
      w: 0.4 * currentWidth,
      anchor: "tl",
    },
    {
      x: currentWidth - 0.06 * currentWidth - (0.45 * currentWidth) / 2,
      y: 0.4 * currentHeight,
      w: 0.45 * currentWidth,
      anchor: "tc",
    },
    {
      x: 0.1 * currentWidth + (0.38 * currentWidth) / 2,
      y: currentHeight - 0.08 * currentHeight,
      w: 0.38 * currentWidth,
      anchor: "bl",
    },
  ];

  // Calculate influence of blob on a given position (matching ArchDoor.tsx)
  function influence(px: number, py: number): number {
    const d = Math.hypot(px - state.x, py - state.y);
    const outer = state.r * 1.4;
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
      const blurPx = 6 * inf;
      const scale = 1 - 0.06 * inf;

      // Apply scale by adjusting dimensions
      const scaledW = w * scale;
      const scaledH = h * scale;

      // Calculate position based on anchor
      let drawX = 0;
      let drawY = 0;

      if (i === 0) {
        // Image A: top-left anchor
        drawX = p.x - scaledW / 2;
        drawY = p.y;
      } else if (i === 1) {
        // Image B: top-center anchor (centered vertically)
        drawX = p.x - scaledW / 2;
        drawY = p.y - scaledH / 2;
      } else {
        // Image C: bottom-left anchor
        drawX = p.x - scaledW / 2;
        drawY = p.y - scaledH;
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      if (blurPx > 0) {
        ctx.filter = `blur(${blurPx}px)`;
      }
      ctx.drawImage(img, drawX, drawY, scaledW, scaledH);
      ctx.restore();
    }
  }

  // GSAP random walk
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
