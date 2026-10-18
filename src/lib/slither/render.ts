import { RULES, SlitherEngine } from "./engine";

const TAU = Math.PI * 2;
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
const backgrounds = new WeakMap<SlitherEngine, { width: number; canvas: HTMLCanvasElement }>();
function background(game: SlitherEngine) {
  const cached = backgrounds.get(game);
  if (cached?.width === game.width) return cached.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = game.width; canvas.height = game.height;
  const c = canvas.getContext("2d")!;
  const g = c.createRadialGradient(game.width / 2, game.height / 2, 30, game.width / 2, game.height / 2, game.width * 0.65);
  g.addColorStop(0, "#102c32"); g.addColorStop(0.6, "#0b1c26"); g.addColorStop(1, "#07121c");
  c.fillStyle = g; c.fillRect(0, 0, game.width, game.height);
  c.strokeStyle = "#8cdbd30b"; c.lineWidth = 1;
  const r = 26;
  for (let col = 0; col < game.width / (r * 1.5) + 1; col++) {
    for (let row = -1; row < game.height / (r * Math.sqrt(3)) + 1; row++) {
      const x = col * r * 1.5, y = (row + (col % 2) / 2) * r * Math.sqrt(3);
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = i * Math.PI / 3;
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.stroke();
    }
  }
  backgrounds.set(game, { width: game.width, canvas });
  return canvas;
}

export function renderSlither(ctx: CanvasRenderingContext2D, game: SlitherEngine, width: number, height: number, time: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#060f18"; ctx.fillRect(0, 0, width, height);
  const scale = Math.min((width - 60) / game.width, (height - 174) / game.height);
  if (scale <= 0) return;
  const x0 = (width - game.width * scale) / 2, y0 = 100 + (height - 174 - game.height * scale) / 2;
  ctx.save(); ctx.translate(x0, y0); ctx.scale(scale, scale);
  ctx.drawImage(background(game), 0, 0);
  ctx.strokeStyle = "#65f5c165"; ctx.lineWidth = 2;
  ctx.shadowColor = "#65f5c1"; ctx.shadowBlur = 12;
  ctx.strokeRect(0, 0, game.width, game.height); ctx.shadowBlur = 0;
  // Corner brackets make the lethal arena boundary unambiguous.
  ctx.strokeStyle = "#9dffe0"; ctx.lineWidth = 4;
  for (const [x, y, dx, dy] of [[0, 0, 1, 1], [game.width, 0, -1, 1], [0, game.height, 1, -1], [game.width, game.height, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * 22); ctx.lineTo(x, y); ctx.lineTo(x + dx * 22, y); ctx.stroke();
  }
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, game.width, game.height); ctx.clip();
  for (const f of game.food) {
    const radius = f.value >= 5 ? 5.5 : f.value > 1 ? 4.3 : 3;
    const pulse = 1 + Math.sin(time * 2 + f.phase) * 0.12;
    circle(ctx, f.x, f.y, radius * 2.7 * pulse, `${f.color}10`);
    circle(ctx, f.x, f.y, radius * 1.5, `${f.color}25`);
    circle(ctx, f.x, f.y, radius * pulse, f.color);
    circle(ctx, f.x - radius * 0.25, f.y - radius * 0.3, radius * 0.3, "#ffffffc0");
    if (f.value >= 5) {
      ctx.strokeStyle = "#ffe39a50"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, 9, time + f.phase, time + f.phase + 4); ctx.stroke();
    }
  }
  const leader = game.rankings()[0];
  for (const s of game.snakes.values()) {
    if (s.isDead) continue;
    const boosting = s.isBoosting && s.targetLength > RULES.initialLength + 1;
    ctx.globalAlpha = s.shield > 0 ? 0.65 + Math.sin(time * 9) * 0.2 : 1;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    s.segments.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y + 4); else ctx.lineTo(p.x, p.y + 4); });
    ctx.lineWidth = 23; ctx.strokeStyle = "#00000065"; ctx.stroke();
    if (boosting) {
      ctx.strokeStyle = `${s.player.color}30`; ctx.lineWidth = 32; ctx.stroke();
    }
    for (let i = s.segments.length - 1; i >= 0; i--) {
      const p = s.segments[i];
      const taper = Math.min(1, 0.38 + (s.segments.length - i) / 12);
      const r = RULES.radius * taper;
      circle(ctx, p.x, p.y, r, s.player.color);
      circle(ctx, p.x, p.y + r * 0.24, r * 0.76, i % 8 < 4 ? "#00000020" : "#ffffff18");
      circle(ctx, p.x - r * 0.22, p.y - r * 0.34, r * 0.40, "#ffffff24");
    }
    const head = s.segments[0];
    ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(s.angle);
    for (const y of [-5.5, 5.5]) {
      circle(ctx, 4, y, 4.4, "#fff"); circle(ctx, 5.7, y, 2.35, "#142238");
      circle(ctx, 6.3, y - 0.7, 0.7, "#fff");
    }
    ctx.restore();
    if (s.shield > 0) {
      ctx.setLineDash([4, 5]); ctx.strokeStyle = `${s.player.color}bb`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(head.x, head.y, 23, time, time + TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "center";
    ctx.font = "600 12px system-ui"; ctx.fillStyle = "#e6f5f3";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
    ctx.fillText(`${leader === s && s.bank > 0 ? "♛ " : ""}${s.player.name}`, head.x, head.y - 29);
    ctx.shadowBlur = 0;
  }
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.7);
    circle(ctx, p.x, p.y, 2.5 * p.life / 0.7, p.color);
  }
  ctx.globalAlpha = 1; ctx.restore(); ctx.restore();
  ctx.textAlign = "left"; ctx.font = "10px monospace"; ctx.fillStyle = "#588181";
  ctx.fillText("SECTOR 01 / THE GLOW GARDEN", x0, y0 + game.height * scale + 21);
  ctx.textAlign = "right";
  ctx.fillText(`${game.snakes.size > 4 ? "EXPANDED" : "COMPACT"} ARENA  ·  ${game.snakes.size}/8 CONNECTED`, x0 + game.width * scale, y0 + game.height * scale + 21);
}
