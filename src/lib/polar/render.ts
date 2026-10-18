import { HALF, RULES, PolarEngine, type Bear } from "./engine";
import { drawBearModel, drawBearShadow, type BearPose } from "./bear";

const TAU = Math.PI * 2;
const K = 0.6;      // camera pitch: world y is squashed to fake a 3/4 view
const DEPTH = 34;   // ice slab thickness in world units

interface View { s: number; cx: number; cy: number }

export function renderPolar(ctx: CanvasRenderingContext2D, g: PolarEngine, W: number, H: number, t: number) {
  const s = Math.min(W / (HALF * 2 * 1.32), (H - 150) / (HALF * 2 * K + DEPTH + 110));
  const shake = g.shake * 9;
  const v: View = { s, cx: W / 2 + (Math.random() - 0.5) * shake, cy: H / 2 + 20 + (Math.random() - 0.5) * shake };
  drawSea(ctx, W, H, t, v);
  const z = (x: number, y: number) => -(g.tiltX * x + g.tiltY * y) * 0.045;
  const P = (x: number, y: number, h = 0) => [v.cx + x * s, v.cy + y * s * K - (h + z(x, y)) * s] as const;

  // Underwater glow of the floe.
  ctx.save();
  ctx.fillStyle = "#7fd4ff22";
  ctx.beginPath(); ctx.ellipse(v.cx, v.cy + 30 * s, HALF * s * 1.25, HALF * s * K * 1.25, 0, 0, TAU); ctx.fill();
  ctx.restore();

  const falling = g.bears.filter(b => !b.alive);
  // Bears that fell off the back edge are hidden behind the slab.
  for (const b of falling) if (b.y < -HALF + 10) drawFalling(ctx, g, b, P, s, t);

  drawFloe(ctx, g, P, s, t);
  drawPrints(ctx, g, P, s, t);

  for (const f of g.fish) {
    const [x, y] = P(f.x, f.y, 6 + Math.sin(f.bob) * 4);
    if (f.life < 2 && Math.floor(t * 8) % 2) continue;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#00000030"; ctx.beginPath(); ctx.ellipse(0, 10 * s, 16 * s, 6 * s, 0, 0, TAU); ctx.fill();
    ctx.shadowColor = "#ffd76a"; ctx.shadowBlur = 18;
    ctx.rotate(Math.sin(f.bob * 0.7) * 0.25);
    ctx.fillStyle = "#ffb43a";
    ctx.beginPath(); ctx.ellipse(0, 0, 15 * s, 8 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12 * s, 0); ctx.lineTo(22 * s, -8 * s); ctx.lineTo(22 * s, 8 * s); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe7a6"; ctx.beginPath(); ctx.ellipse(-3 * s, -2 * s, 8 * s, 3 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1d2433"; ctx.beginPath(); ctx.arc(-9 * s, -2 * s, 1.8 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  if (g.beam.on && g.phase === "playing") drawBeam(ctx, g, P, s, t);

  for (const p of g.fx) if (p.kind === "ring") {
    const [x, y] = P(p.x, p.y);
    const k = 1 - p.life / p.max;
    ctx.strokeStyle = p.color; ctx.globalAlpha = (1 - k) * 0.8; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.ellipse(x, y, (16 + k * 60) * s, (16 + k * 60) * s * K, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const front = [...g.bears.filter(b => b.alive), ...falling.filter(b => b.y >= -HALF + 10)].sort((a, b) => a.y - b.y);
  for (const b of front) {
    if (b.alive) drawBear(ctx, g, b, P, s, t);
    else drawFalling(ctx, g, b, P, s, t);
  }

  for (const p of g.fx) {
    if (p.kind === "ring") continue;
    const [x, y] = P(p.x, p.y, p.z);
    ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6) * (p.kind === "snow" && p.max > 5 ? 0.7 : 1);
    ctx.fillStyle = p.color;
    if (p.kind === "chip") ctx.fillRect(x - p.size * s, y - p.size * s, p.size * 2 * s, p.size * 1.4 * s);
    else { ctx.beginPath(); ctx.arc(x, y, p.size * s, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function drawSea(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, v: View) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  sky.addColorStop(0, "#0a2340"); sky.addColorStop(1, "#11426b");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const sea = ctx.createLinearGradient(0, H * 0.12, 0, H);
  sea.addColorStop(0, "#0f4c7c"); sea.addColorStop(0.5, "#0a3a66"); sea.addColorStop(1, "#06254a");
  ctx.fillStyle = sea; ctx.fillRect(0, H * 0.12, W, H);
  // Distant icebergs on the horizon.
  ctx.fillStyle = "#cfe9fb";
  for (let i = 0; i < 7; i++) {
    const x = ((i * 233 + 80) % (W + 200)) - 100, w = 50 + (i * 37) % 90, h = 14 + (i * 13) % 26, y = H * 0.12;
    ctx.globalAlpha = 0.35 + (i % 3) * 0.12;
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w * 0.4, y - h); ctx.lineTo(x + w * 0.1, y - h * 0.7); ctx.lineTo(x + w * 0.5, y - h * 1.1); ctx.lineTo(x + w, y); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Moving wave glints.
  ctx.strokeStyle = "#8fd6ff26"; ctx.lineWidth = 2;
  for (let row = 0; row < 22; row++) {
    const y = H * 0.14 + row * (H / 22);
    const sc = 0.4 + row / 22;
    ctx.beginPath();
    for (let x = -20; x < W + 20; x += 14) {
      const yy = y + Math.sin(x * 0.018 / sc + t * 1.4 + row) * 4 * sc;
      if (Math.sin(x * 0.007 + row * 2.1 + t * 0.6) > 0.35) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
    }
    ctx.stroke();
  }
  // Floating ice chunks drifting around the floe.
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + t * 0.03 * (i % 2 ? 1 : -1);
    const r = HALF * (1.25 + (i % 3) * 0.12);
    const x = v.cx + Math.cos(a) * r * v.s * 1.15, y = v.cy + Math.sin(a) * r * v.s * K + Math.sin(t + i) * 2;
    const w = (14 + (i * 7) % 16) * v.s;
    ctx.fillStyle = "#9cc9e6"; ctx.beginPath(); ctx.ellipse(x, y + 4 * v.s, w, w * 0.45, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#eef8ff"; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.45, 0, 0, TAU); ctx.fill();
  }
}

type Proj = (x: number, y: number, h?: number) => readonly [number, number];

function drawFloe(ctx: CanvasRenderingContext2D, g: PolarEngine, P: Proj, s: number, t: number) {
  const n = RULES.tiles, T = RULES.tile;
  const alive = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < n && ty < n && g.tiles[ty * n + tx].alive;
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const tile = g.tiles[ty * n + tx];
      if (!tile.alive) continue;
      const x0 = -HALF + tx * T, y0 = -HALF + ty * T, x1 = x0 + T, y1 = y0 + T;
      const jig = tile.crack > 0 ? (Math.random() - 0.5) * 2.5 * s : 0;
      const sink = tile.crack > 0 ? (1.1 - tile.crack) * 6 : 0;
      const q = [P(x0, y0, -sink), P(x1, y0, -sink), P(x1, y1, -sink), P(x0, y1, -sink)].map(([a, b]) => [a + jig, b] as const);
      // Front face, visible when the tile in front of it is gone or it is the edge.
      if (!alive(tx, ty + 1)) {
        const d = DEPTH * s;
        const grd = ctx.createLinearGradient(0, q[3][1], 0, q[3][1] + d);
        grd.addColorStop(0, "#9fd3f0"); grd.addColorStop(0.5, "#5aa7d6"); grd.addColorStop(1, "#2f6f9e");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.moveTo(q[3][0], q[3][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.lineTo(q[2][0], q[2][1] + d); ctx.lineTo(q[3][0], q[3][1] + d); ctx.fill();
        ctx.strokeStyle = "#ffffff40"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(q[3][0], q[3][1] + d * 0.45); ctx.lineTo(q[2][0], q[2][1] + d * 0.5); ctx.stroke();
      }
      // Side faces for holes so melted gaps read as deep.
      for (const [nx, a, b] of [[-1, 0, 3], [1, 1, 2]] as const) {
        if (alive(tx + nx, ty)) continue;
        const d = DEPTH * s;
        ctx.fillStyle = "#4b93c4";
        ctx.beginPath(); ctx.moveTo(q[a][0], q[a][1]); ctx.lineTo(q[b][0], q[b][1]); ctx.lineTo(q[b][0], q[b][1] + d); ctx.lineTo(q[a][0], q[a][1] + d); ctx.fill();
      }
      const light = 0.5 + 0.5 * Math.sin((tx * 3 + ty * 5) * 1.3);
      const top = ctx.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
      top.addColorStop(0, tile.crack > 0 ? "#cfe4f5" : "#f4fbff");
      top.addColorStop(1, tile.crack > 0 ? "#9cc2e0" : light > 0.5 ? "#d7ecfa" : "#cbe5f7");
      ctx.fillStyle = top;
      ctx.beginPath(); q.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#aacde61c"; ctx.lineWidth = 1; ctx.stroke();
      if (tile.crack > 0) {
        ctx.strokeStyle = `rgba(40,90,140,${0.4 + (1.1 - tile.crack) * 0.5})`; ctx.lineWidth = 1.5 * s;
        const [cx, cy] = P(x0 + T / 2, y0 + T / 2, -sink);
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = k * 1.3 + tx;
          ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * T * 0.45 * s, cy + Math.sin(a) * T * 0.45 * s * K);
        }
        ctx.stroke();
      }
    }
  }
  // Snow drifts and sparkle on the surface.
  for (let i = 0; i < 18; i++) {
    const x = ((i * 97) % (HALF * 2)) - HALF + 20, y = ((i * 151) % (HALF * 2)) - HALF + 20;
    if (!g.solid(x, y)) continue;
    const [px, py] = P(x, y);
    const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    ctx.fillStyle = `rgba(255,255,255,${tw * 0.9})`;
    ctx.beginPath(); ctx.arc(px, py, 1.6 * s, 0, TAU); ctx.fill();
  }
}

function drawBeam(ctx: CanvasRenderingContext2D, g: PolarEngine, P: Proj, s: number, t: number) {
  const [x, y] = P(g.beam.x, g.beam.y);
  const grd = ctx.createLinearGradient(x, 0, x, y);
  grd.addColorStop(0, "#d46bff00"); grd.addColorStop(1, "#ff6bd6cc");
  ctx.fillStyle = grd;
  const w = (12 + Math.sin(t * 20) * 2) * s;
  ctx.beginPath(); ctx.moveTo(x - w * 0.4, 0); ctx.lineTo(x + w * 0.4, 0); ctx.lineTo(x + w, y); ctx.lineTo(x - w, y); ctx.fill();
  ctx.save();
  ctx.shadowColor = "#ff5ad1"; ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffb3ec";
  ctx.beginPath(); ctx.ellipse(x, y, 26 * s, 26 * s * K, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, 34 * s, 34 * s * K, 0, g.beam.a, g.beam.a + 4); ctx.stroke();
}

function pose(g: PolarEngine, b: Bear, t: number): BearPose {
  const won = (g.phase === "roundover" && g.roundWinner === b.slot) || (g.phase === "matchover" && g.champion === b.slot);
  return {
    face: b.face, speed: Math.hypot(b.vx, b.vy), gait: b.walk * 1.4,
    dash: Math.min(1, (b.dashT / RULES.dashTime) * 1.5), stun: Math.min(1, b.stun / RULES.hitStun),
    fall: b.alive ? 0 : b.fallT, celebrate: won && b.alive, power: b.power > 0, color: b.color, slot: b.slot, t,
  };
}

function drawFalling(ctx: CanvasRenderingContext2D, g: PolarEngine, b: Bear, P: Proj, s: number, t: number) {
  if (b.fallT > 1.6) return;
  const [x, y] = P(b.x, b.y);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - Math.max(0, b.fallT - 1) / 0.6);
  drawBearModel(ctx, x, y, s, pose(g, b, t));
  ctx.restore();
}

function drawBear(ctx: CanvasRenderingContext2D, g: PolarEngine, b: Bear, P: Proj, s: number, t: number) {
  const [gx, gy] = P(b.x, b.y);
  const bp = pose(g, b, t);
  const air = bp.celebrate ? Math.abs(Math.sin(t * 6.5)) * 14 : 0;
  // Team ring under the shadow so the bear stays readable in a pile-up.
  ctx.strokeStyle = b.color; ctx.lineWidth = 2.5 * s; ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.ellipse(gx, gy, 32 * s, 32 * s * K, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  drawBearShadow(ctx, gx, gy, s, b.face, air);
  if (b.power > 0) {
    ctx.save(); ctx.shadowColor = "#ffd76a"; ctx.shadowBlur = 30;
    ctx.strokeStyle = `rgba(255,215,106,${0.5 + Math.sin(t * 12) * 0.3})`; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.ellipse(gx, gy, 40 * s, 40 * s * K, 0, 0, TAU); ctx.stroke(); ctx.restore();
  }
  drawBearModel(ctx, gx, gy, s, bp);
  const top = gy - ((bp.celebrate ? 87 : 65) * (bp.power ? 1.12 : 1) + air) * s;
  if (b.stun > 0.05) {
    ctx.font = `${13 * s}px system-ui`; ctx.textAlign = "center";
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + i * TAU / 3;
      ctx.fillStyle = i % 2 ? "#ffe66d" : "#fff6c2";
      ctx.fillText("✦", gx + Math.cos(a) * 20 * s, top + 4 * s + Math.sin(a) * 6 * s);
    }
  }
  // Name tag + stamina bar.
  // Players get a full tag; CPU tags stay small and faint so pile-ups remain readable.
  const human = !!b.playerId, fs = human ? 13 : 10;
  ctx.textAlign = "center"; ctx.font = `800 ${Math.max(9, fs * s)}px system-ui`;
  const label = human ? b.name : `${b.name} · CPU`;
  const tw = ctx.measureText(label).width + 12;
  ctx.globalAlpha = human ? 1 : 0.7;
  ctx.fillStyle = "#0b2136cc"; roundRect(ctx, gx - tw / 2, top - (fs + 8) * s, tw, (fs + 5) * s, 9 * s); ctx.fill();
  ctx.fillStyle = b.color; ctx.fillText(label, gx, top - 6.5 * s);
  ctx.globalAlpha = 1;
  if (g.phase !== "lobby") {
    const w = 46 * s, h = 5 * s, by = gy + 24 * s;
    ctx.fillStyle = "#0b2136aa"; roundRect(ctx, gx - w / 2, by, w, h, h / 2); ctx.fill();
    ctx.fillStyle = b.stamina >= RULES.dashCost ? (b.power > 0 ? "#ffd76a" : "#7fe3ff") : "#5b7a95";
    roundRect(ctx, gx - w / 2, by, w * b.stamina / 100, h, h / 2); ctx.fill();
  } else if (b.playerId) {
    ctx.font = `800 ${Math.max(9, 11 * s)}px system-ui`;
    ctx.fillStyle = b.ready ? "#7dffb0" : "#ffffff88";
    ctx.fillText(b.ready ? "READY ✓" : "NOT READY", gx, gy + 36 * s);
  }
}

/** Paw prints pressed into the snow at each foot plant; they fade over a few seconds. */
type Print = { x: number; y: number; a: number; t: number };
const trails = new WeakMap<PolarEngine, { round: number; prints: Print[]; steps: number[] }>();
function drawPrints(ctx: CanvasRenderingContext2D, g: PolarEngine, P: Proj, s: number, t: number) {
  let st = trails.get(g);
  if (!st || st.round !== g.round) { st = { round: g.round, prints: [], steps: [] }; trails.set(g, st); }
  for (const b of g.bears) {
    const step = Math.floor((b.walk * 1.4) / Math.PI);
    if (b.alive && step !== st.steps[b.slot] && Math.hypot(b.vx, b.vy) > 50) {
      const side = step % 2 ? 1 : -1, a = b.face;
      const x = b.x - Math.sin(a) * 9 * side + Math.cos(a) * 8, y = b.y + Math.cos(a) * 9 * side + Math.sin(a) * 8;
      if (g.solid(x, y)) st.prints.push({ x, y, a, t });
    }
    st.steps[b.slot] = step;
  }
  st.prints = st.prints.filter(p => t - p.t < 3.5 && g.solid(p.x, p.y)).slice(-160);
  for (const p of st.prints) {
    const [x, y] = P(p.x, p.y);
    const al = 0.32 * (1 - (t - p.t) / 3.5);
    ctx.fillStyle = `rgba(110,160,205,${al})`;
    ctx.beginPath(); ctx.ellipse(x, y, 5 * s, 3.4 * s * K * 1.4, p.a * K, 0, TAU); ctx.fill();
    for (const k of [-1, 0, 1]) {
      const ta = p.a + k * 0.55;
      ctx.beginPath(); ctx.arc(x + Math.cos(ta) * 6 * s, y + Math.sin(ta) * 6 * s * K, 1.6 * s, 0, TAU); ctx.fill();
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2));
}
