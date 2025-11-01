// src/components/archdoorCanvas.ts
import { gsap } from "gsap";
import {
  BlobState,
  centerYForAnchor,
  createImagePositions,
  drawBlobDebugOverlay,
  drawClickEllipseOverlay,
  getPortalCenterX,
  getPortalRange,
} from "./archCanvasUtils";

export type ArchController = {
  canvas: HTMLCanvasElement;
  start: () => void;
  stop: () => void;
  resize: (w: number, h: number) => void;
  showClickEllipse: () => void;
  hideClickEllipse: () => void;
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

  const imgs: (HTMLImageElement | undefined)[] = new Array(imageUrls.length);
  imageUrls.forEach((src, index) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      imgs[index] = img;
      // If all images are loaded and we haven't started yet, start the animation
      if (
        imgs.length === imageUrls.length &&
        imgs.every((img) => img && img.complete)
      ) {
        drawFrame();
        if (!stopped) step();
      }
    };
  });

  // state (blob + radius)
  const state: BlobState = {
    x: currentWidth * 0.5,
    y: currentHeight * 0.5,
    r: Math.max(80, Math.min(currentWidth, currentHeight) * 0.28) * 2.0,
  };

  let positions = createImagePositions(currentWidth, currentHeight);

  const imagesReady = () =>
    imgs.length === imageUrls.length &&
    imgs.every((img) => img && img.complete);

  const influence = (px: number, py: number) => {
    const distance = Math.hypot(px - state.x, py - state.y);
    const normalized = Math.max(0, Math.min(1, distance / state.r));
    const inverted = 1 - normalized;
    return inverted * inverted * (3 - 2 * inverted);
  };

  function drawFrame() {
    if (!imagesReady()) return;

    ctx.clearRect(0, 0, currentWidth, currentHeight);

    const now = performance.now();
    const time = now * 0.0005;
    const rotationPhase = now * 0.001;
    const centerX = getPortalCenterX(currentWidth);
    const rangeHalf = getPortalRange(currentWidth) * 0.5;

    const animatedXForIndex = (index: number, baseX: number) => {
      if (index === 0) return centerX + Math.sin(time) * rangeHalf;
      if (index === 2)
        return centerX + Math.sin(time + Math.PI * 0.7) * rangeHalf;
      return baseX;
    };

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      currentWidth / 2,
      currentHeight / 2,
      currentWidth / 2,
      currentHeight / 2,
      0,
      0,
      2 * Math.PI
    );
    ctx.clip();

    positions.forEach((position, index) => {
      const img = imgs[index];
      if (!img) return;

      const aspect = img.width / Math.max(img.height, 1);
      const targetWidth = position.width;
      const targetHeight = targetWidth / aspect;
      const animatedX = animatedXForIndex(index, position.x);
      const influenceValue = influence(animatedX, position.y);
      const opacity = 1 - influenceValue;
      if (opacity <= 0) return;

      const blurPx = 20 * influenceValue;
      const scale =
        (1 - 0.06 * influenceValue) * (1 + (1 - influenceValue) * 0.08);
      const rotationAmount = (1 - influenceValue) * 0.15;
      const rotationAngle = Math.sin(rotationPhase + index) * rotationAmount;
      const perspectiveScale = Math.cos(rotationAngle);

      const scaledWidth = targetWidth * scale * perspectiveScale;
      const scaledHeight = targetHeight * scale;
      const centerY = centerYForAnchor(
        position.anchor,
        position.y,
        scaledHeight
      );

      const blurExpansion = blurPx * 2;
      const halfWidth = scaledWidth / 2;
      const halfHeight = scaledHeight / 2;
      if (
        animatedX + halfWidth + blurExpansion < 0 ||
        animatedX - halfWidth - blurExpansion > currentWidth ||
        centerY + halfHeight + blurExpansion < 0 ||
        centerY - halfHeight - blurExpansion > currentHeight
      ) {
        return;
      }

      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
      if (blurPx > 0) {
        ctx.filter = `blur(${blurPx}px)`;
      }
      ctx.translate(animatedX, centerY);
      ctx.rotate(rotationAngle);
      ctx.drawImage(
        img,
        -scaledWidth / 2,
        -scaledHeight / 2,
        scaledWidth,
        scaledHeight
      );
      ctx.restore();
    });

    ctx.restore();

    if (showClickEllipse) {
      drawClickEllipseOverlay(ctx, currentWidth, currentHeight);
    }

    drawBlobDebugOverlay(ctx, state);
  }

  // Random walk animation for blob movement
  let tween: gsap.core.Tween | null = null;
  let stopped = false;
  const rand = (a: number, b: number) => Math.random() * (b - a) + a;

  // Click ellipse state
  let showClickEllipse = false;
  let clickEllipseTimeout: number | null = null;

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
      positions = createImagePositions(w, h);
      state.x *= w / currentWidth;
      state.y *= h / currentHeight;
      state.r = Math.max(80, Math.min(w, h) * 0.28) * 2.0;
      currentWidth = w;
      currentHeight = h;
      drawFrame();
    },
    showClickEllipse: () => {
      showClickEllipse = true;
      drawFrame();
      onUpdate?.();
      // Auto-hide after 500ms
      if (clickEllipseTimeout !== null) {
        clearTimeout(clickEllipseTimeout);
      }
      clickEllipseTimeout = window.setTimeout(() => {
        showClickEllipse = false;
        drawFrame();
        onUpdate?.();
        clickEllipseTimeout = null;
      }, 500);
    },
    hideClickEllipse: () => {
      showClickEllipse = false;
      if (clickEllipseTimeout !== null) {
        clearTimeout(clickEllipseTimeout);
        clickEllipseTimeout = null;
      }
      drawFrame();
      onUpdate?.();
    },
  };
}
