import type { BearPose } from "./bear";

const TAU = Math.PI * 2;
const CELL = 256;
let atlas: HTMLImageElement | undefined;
let ready = false;

/** Lazy browser-only load; the procedural bear remains available on load/error. */
export function preloadBearSprites() {
  if (atlas || typeof Image === "undefined") return;
  atlas = new Image();
  atlas.decoding = "async";
  atlas.onload = () => { ready = atlas!.naturalWidth === CELL * 6 && atlas!.naturalHeight === CELL * 5; };
  atlas.src = "/games/polar/bear-atlas-v1.webp";
}

/** World +y faces the camera. Five authored views mirror into eight directions. */
export function bearSpriteFrame(p: BearPose) {
  const face = ((p.face % TAU) + TAU) % TAU;
  const octant = Math.round(face / (Math.PI / 4)) % 8;
  const row = [2, 1, 0, 1, 2, 3, 4, 3][octant];
  const flip = octant >= 3 && octant <= 5;
  // Returning through the neutral pose keeps the two contact poses from snapping
  // directly into each other. Gait comes from distance travelled in the engine.
  const step = Math.floor((((p.gait % TAU) + TAU) % TAU) / (Math.PI / 2));
  const column = p.fall > 0 ? 4 : p.celebrate ? 5 : p.stun > 0.05 ? 4
    : p.dash > 0.01 ? 3 : p.speed > 12 ? [1, 0, 2, 0][step] : 0;
  return { row, column, flip };
}

export function drawBearSprite(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, p: BearPose) {
  preloadBearSprites();
  if (!ready || !atlas) return false;
  const { row, column, flip } = bearSpriteFrame(p);
  const moving = Math.min(1, p.speed / 160);
  const fall = Math.min(1, p.fall / 0.9);
  const hop = p.celebrate ? Math.abs(Math.sin(p.t * 6.5)) * 14 : 0;
  const breath = Math.sin(p.t * 2.4 + p.slot) * (1 - moving) * 0.012;
  const bounce = Math.abs(Math.sin(p.gait)) * moving * (p.dash ? 0.6 : 2);
  const recoil = Math.sin(p.t * 25) * p.stun;
  const size = scale * (p.power ? 1.12 : 1);
  const stretchX = 1 + p.dash * 0.07 + p.stun * 0.035;
  const stretchY = 1 + breath - p.dash * 0.06 - p.stun * 0.05;
  ctx.save();
  if (p.fall > 0) {
    ctx.beginPath();
    ctx.rect(x - 100 * size, y - 150 * size, 200 * size, 153 * size);
    ctx.clip();
  }
  ctx.translate(x + recoil * size, y + (fall * 72 - hop - bounce) * size);
  ctx.rotate(p.fall > 0 ? Math.sin(p.t * 15) * fall * 0.18 : recoil * 0.015);
  ctx.scale((flip ? -1 : 1) * size * stretchX, size * stretchY);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Packed sprites have a shared floor at y=240 and centre at x=128.
  ctx.drawImage(atlas, column * CELL, row * CELL, CELL, CELL, -48, -90, 96, 96);
  ctx.restore();
  return true;
}
