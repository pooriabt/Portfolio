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
      y: 0.01 * currentHeight,
      w: currentWidth * 0.5,
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

  // Calculate influence of blob on a given position
  function influence(px: number, py: number): number {
    const d = Math.hypot(px - state.x, py - state.y);
    const outer = state.r * 1;
    const t = Math.max(0, Math.min(1, d / outer));
    const s = 1 - t;
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

      const inf = influence(p.x, p.y);
      const opacity = Math.max(0, Math.min(1, 1 - inf));
      const blurPx = 20 * inf;
      const baseScale = 1 - 0.06 * inf;
      const scaleUpWhenFar = 1 + (1 - inf) * 0.08;
      const scale = baseScale * scaleUpWhenFar;
      const rotationAmount = (1 - inf) * 0.15;
      const rotationAngle = Math.sin(Date.now() * 0.001 + i) * rotationAmount;
      const perspectiveScale = Math.cos(rotationAngle);

      const scaledW = w * scale * perspectiveScale;
      const scaledH = h * scale;
      let centerX = p.x;
      let centerY =
        i === 0 ? p.y + scaledH / 2 : i === 1 ? p.y : p.y - scaledH / 2;

      ctx.save();
      ctx.globalAlpha = opacity;
      if (blurPx > 0) {
        ctx.filter = `blur(${blurPx}px)`;
      }

      ctx.translate(centerX, centerY);
      ctx.rotate(rotationAngle);
      ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
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
      positions[0] = { x: 0.7 * w, y: 0.01 * h, w: w * 0.5, anchor: "tl" };
      positions[1] = { x: w / 2, y: 0.42 * h, w: w, anchor: "tc" };
      positions[2] = { x: 0.75 * w, y: h, w: w * 0.75, anchor: "bl" };
      state.x *= w / currentWidth;
      state.y *= h / currentHeight;
      state.r = Math.max(80, Math.min(w, h) * 0.28) * 2.0;
      currentWidth = w;
      currentHeight = h;
      drawFrame();
    },
  };
}
