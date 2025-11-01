export type ImageAnchor = "tl" | "tc" | "bl";

export type ImagePosition = {
  x: number;
  y: number;
  width: number;
  anchor: ImageAnchor;
};

export type BlobState = {
  x: number;
  y: number;
  r: number;
};

export function createImagePositions(
  width: number,
  height: number
): ImagePosition[] {
  return [
    { x: 0.7 * width, y: 0.045 * height, width: width * 0.5, anchor: "tl" },
    { x: width / 2, y: 0.46 * height, width: width, anchor: "tc" },
    { x: 0.75 * width, y: 1.03 * height, width: width * 0.75, anchor: "bl" },
  ];
}

export function centerYForAnchor(
  anchor: ImageAnchor,
  baseY: number,
  height: number
): number {
  switch (anchor) {
    case "tl":
      return baseY + height / 2;
    case "tc":
      return baseY;
    case "bl":
      return baseY - height / 2;
    default:
      return baseY;
  }
}

export const getPortalCenterX = (width: number) => width * 0.5;
export const getPortalRange = (width: number) => width * 0.3;

export function drawClickEllipseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  ctx.save();
  ctx.strokeStyle = "#ff8800";
  ctx.lineWidth = 15;
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function drawBlobDebugOverlay(
  ctx: CanvasRenderingContext2D,
  state: BlobState
) {
  ctx.save();
  ctx.strokeStyle = "#ffff00";
  ctx.lineWidth = 6;
  ctx.setLineDash([5, 5]);
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  ctx.arc(state.x, state.y, state.r, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = "#ff0000";
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(state.x, state.y, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

