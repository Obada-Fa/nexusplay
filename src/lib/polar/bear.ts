// Procedural 3D polar bear: ~25 ellipsoids in bear-local space, rotated by pose,
// projected with the same 3/4 camera as the floe, depth-sorted and shaded.

const TAU = Math.PI * 2;
// Bears use a lower camera than the floe (~25° vs ~37°) so their front, back and
// sides read clearly at a glance instead of every heading showing mostly the top.
const GROUND_K = 0.6;                    // floe pitch, matches render.ts (shadows)
const K = 0.42, UP = 0.95;               // bear pitch: sin/cos of camera elevation
const VIEW = [0, 0.906, 0.42] as const;  // direction toward the camera in world (x, y, h)

export interface BearPose {
  face: number;        // heading (radians)
  speed: number;       // ground speed, world units/s
  gait: number;        // walk-cycle phase (radians)
  dash: number;        // 0..1 charge strength
  stun: number;        // 0..1 hit reaction
  fall: number;        // 0 = standing, >0 seconds since falling in
  celebrate: boolean;  // round/match winner
  power: boolean;      // ate a power fish
  color: string;       // team colour (saddle + scarf)
  slot: number;
  t: number;           // global time, seconds
}

type V3 = [number, number, number];
interface Part {
  c: V3; r: V3;                    // centre + radii in bear-local (fwd, side, up)
  fill: readonly [string, string, string]; // highlight, mid, shadow
  head?: boolean;                  // follows head yaw/pitch
  face?: boolean;                  // only drawn when its surface faces the camera
  ref?: V3;                        // local point the visible-surface normal is measured from
  outline?: boolean;
  gloss?: boolean;
}

const FUR = ["#fffefa", "#f1ede3", "#bcc6d1"] as const;
const FUR_DARK = ["#f4f1ea", "#dcd8cf", "#9eabb8"] as const;
const PAW = ["#f7f3ea", "#e2ddd2", "#a9b3be"] as const;
const INK = ["#4a5566", "#1c2230", "#0b0f18"] as const;
const EAR_IN = ["#d8c9c2", "#bba9a2", "#8d7c78"] as const;
const MOUTH = ["#c45a6a", "#8e2f45", "#4d1424"] as const;

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const t = k < 0 ? 0 : 255, a = Math.abs(k);
  const ch = (v: number) => Math.round(v + (t - v) * a);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Rotate around the side axis (pitch) about a pivot, then yaw into world. */
function makeXf(face: number, pitch: number, pivot: V3) {
  const cy = Math.cos(face), sy = Math.sin(face), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const rot = (v: V3, pv: boolean): V3 => {
    const [f0, s, u0] = v;
    let f = f0, u = u0;
    if (pv) { f -= pivot[0]; u -= pivot[2]; }
    const f2 = f * cp - u * sp, u2 = f * sp + u * cp;
    f = f2 + (pv ? pivot[0] : 0); u = u2 + (pv ? pivot[2] : 0);
    return [f * cy - s * sy, f * sy + s * cy, u];
  };
  return { point: (v: V3) => rot(v, true), axis: (v: V3) => rot(v, false) };
}

export function drawBearModel(ctx: CanvasRenderingContext2D, sx: number, sy: number, scale: number, p: BearPose) {
  const { t } = p;
  const m = scale * 1.05 * (p.power ? 1.12 : 1);
  const stride = Math.min(1, p.speed / 160) * (1 - p.dash);
  const idle = Math.max(0, 1 - p.speed / 40) * (p.celebrate ? 0 : 1);
  const fallK = Math.min(1, p.fall / 0.9);

  // ── Whole-body motion ───────────────────────────────────────────────────
  const breathe = Math.sin(t * 2.4 + p.slot) * 0.7 * (1 - stride);
  const bob = Math.abs(Math.sin(p.gait)) * 2.2 * stride + breathe;
  const hop = p.celebrate ? Math.abs(Math.sin(t * 6.5)) * 14 : 0;
  const roll = Math.sin(p.gait) * 1.4 * stride;
  let pitch = -0.1 * p.dash + (p.celebrate ? 0.25 + Math.max(0, Math.sin(t * 6.5)) * 0.35 : 0) - fallK * 0.8;
  if (p.stun > 0) pitch += Math.sin(t * 22) * 0.06 * p.stun;
  const sink = -fallK * 62;
  const lift = bob + hop + sink;
  // Squash on impact, stretch while charging.
  const sqF = 1 + p.dash * 0.12 + p.stun * 0.1, sqU = 1 - p.dash * 0.08 - p.stun * 0.14;

  // Head: looks around when idle, wobbles when dizzy, dips into a charge.
  const lookYaw = Math.sin(t * 0.55 + p.slot * 1.9) * 0.55 * idle + (p.stun > 0 ? Math.sin(t * 16) * 0.35 * p.stun : 0);
  const headPitch = -0.18 * p.dash + Math.sin(p.gait * 2) * 0.05 * stride + (p.celebrate ? -0.25 : 0) + fallK * 0.5;

  const body = makeXf(p.face, pitch, [-14, 0, 8]);
  const headXf = makeXf(p.face, pitch, [-14, 0, 8]);
  const hp: V3 = [19, 0, 26];
  const headLocal = (v: V3): V3 => {
    // Head yaw/pitch about the neck, applied in body-local space.
    const cy = Math.cos(lookYaw), sy = Math.sin(lookYaw), cp = Math.cos(headPitch), sp = Math.sin(headPitch);
    let f = v[0] - hp[0], s = v[1], u = v[2] - hp[2];
    const f1 = f * cp - u * sp; u = f * sp + u * cp; f = f1;
    const f2 = f * cy - s * sy; s = f * sy + s * cy; f = f2;
    return [f + hp[0], s, u + hp[2]];
  };
  const headAxis = (v: V3): V3 => {
    const cy = Math.cos(lookYaw), sy = Math.sin(lookYaw), cp = Math.cos(headPitch), sp = Math.sin(headPitch);
    let [f, s, u] = v;
    const f1 = f * cp - u * sp; u = f * sp + u * cp; f = f1;
    const f2 = f * cy - s * sy; s = f * sy + s * cy;
    return [f2, s, u];
  };

  // ── Legs: diagonal trot; gallop pose while charging; flail when falling ─
  const legs: Part[] = [];
  const LEGS: [number, number, number][] = [[13, 9, 0], [13, -9, Math.PI], [-14, 10, Math.PI], [-14, -10, 0]];
  LEGS.forEach(([lf, ls, ph], i) => {
    const front = lf > 0;
    const phase = p.gait + ph;
    let swing = Math.sin(phase) * 10 * stride;
    let up = Math.max(0, Math.cos(phase)) * 6 * stride;
    if (p.dash > 0) { swing += (front ? 11 : -11) * p.dash; up += (front ? 5 : 3) * p.dash; }
    if (p.celebrate && front) { up += 10 + Math.sin(t * 13 + i) * 5; swing += 6; }
    if (p.fall > 0) { swing = Math.sin(t * 28 + i * 1.7) * 11; up = 6 + Math.cos(t * 24 + i) * 5; }
    if (idle > 0.5 && !front) swing -= 1.5;
    legs.push({ c: [lf + swing * 0.45, ls, 10 + up * 0.6], r: [6.6, 6, 9.6], fill: FUR, outline: true });
    legs.push({ c: [lf + swing + 1.5, ls * 1.04, 3.2 + up], r: [7.8, 6.2, 3.8], fill: PAW, outline: true });
    if (front) for (const cs of [-2.6, 0, 2.6]) {
      legs.push({ c: [lf + swing + 8.6, ls * 1.04 + cs, 2.6 + up], r: [1.1, 0.9, 1.1], fill: INK, face: true });
    }
  });

  const blink = Math.sin(t * 2.3 + p.slot * 2) > 0.975 && p.fall === 0;
  const eyeU = p.stun > 0.2 ? 0.45 : blink ? 0.22 : p.fall > 0 ? 1.35 : p.dash > 0 ? 0.7 : 1;
  const twitch = Math.sin(t * 11 + p.slot) > 0.96 ? 1.5 : 0;
  const mouthOpen = Math.max(p.dash, p.celebrate ? 0.8 : 0, p.fall > 0 ? 1 : 0, p.stun * 0.6);
  const team = [shade(p.color, 0.35), p.color, shade(p.color, -0.45)] as const;
  const trim = [shade(p.color, -0.1), shade(p.color, -0.35), shade(p.color, -0.65)] as const;
  const gold = ["#fff2b0", "#f2c14e", "#9c6b12"] as const;

  const parts: Part[] = [
    ...legs,
    { c: [-2, roll, 19], r: [23 * sqF, 16, 15 * sqU], fill: FUR, outline: true },
    { c: [-15, roll, 20], r: [13, 15, 14 * sqU], fill: FUR, outline: true },
    { c: [10, roll * 0.6, 21.5], r: [13 * sqF, 14, 14 * sqU], fill: FUR, outline: true },
    { c: [-29, 0, 24 + Math.sin(t * 9) * 0.8], r: [4.6, 4.6, 4.6], fill: FUR_DARK, outline: true },
    { c: [19, 0, 25], r: [8.5, 9.5, 9.5], fill: FUR, outline: true },
    // Saddle blanket draped over the back: trim, blanket, side flaps, gold knob.
    { c: [-2, roll, 31], r: [14, 17.4, 1.7], fill: trim },
    { c: [-2, roll, 32], r: [12.4, 15.6, 1.9], fill: team },
    { c: [-2, 15.8 + roll, 25], r: [9.5, 1.4, 7], fill: team, face: true, ref: [-2, 0, 25] },
    { c: [-2, -15.8 + roll, 25], r: [9.5, 1.4, 7], fill: team, face: true, ref: [-2, 0, 25] },
    { c: [-2, 16.3 + roll, 19], r: [9.8, 1.2, 1.4], fill: gold, face: true, ref: [-2, 0, 19] },
    { c: [-2, -16.3 + roll, 19], r: [9.8, 1.2, 1.4], fill: gold, face: true, ref: [-2, 0, 19] },
    { c: [7, roll, 34], r: [2.1, 2.1, 2.8], fill: gold, gloss: true },
    // Scarf ring around the neck.
    { c: [17, 0, 27], r: [5.2, 11.2, 6], fill: team, gloss: true },
    // Head group.
    { c: [27, 0, 31], r: [12.2, 11.6, 11], fill: FUR, head: true, outline: true },
    { c: [25, 7.5, 28], r: [6, 4.5, 5.5], fill: FUR, head: true },
    { c: [25, -7.5, 28], r: [6, 4.5, 5.5], fill: FUR, head: true },
    { c: [37.5, 0, 27.5], r: [7.8, 6.2, 5.6], fill: FUR_DARK, head: true, outline: true },
    { c: [44.2, 0, 29.6], r: [2.6, 3.4, 2.5], fill: INK, head: true, gloss: true, face: true },
    { c: [37, 4.6, 34.2], r: [2.1, 2.1, 2.5 * eyeU], fill: INK, head: true, face: true, gloss: eyeU > 0.5 },
    { c: [37, -4.6, 34.2], r: [2.1, 2.1, 2.5 * eyeU], fill: INK, head: true, face: true, gloss: eyeU > 0.5 },
    { c: [22.5, 8, 41 + twitch], r: [4, 4, 3.6], fill: FUR, head: true, outline: true },
    { c: [22.5, -8, 41], r: [4, 4, 3.6], fill: FUR, head: true, outline: true },
    { c: [23.9, 8.2, 41.3 + twitch], r: [2.1, 2.2, 2.1], fill: EAR_IN, head: true, face: true },
    { c: [23.9, -8.2, 41.3], r: [2.1, 2.2, 2.1], fill: EAR_IN, head: true, face: true },
    ...(mouthOpen > 0.1 ? [{ c: [41, 0, 23.6], r: [3.6, 3.8, 0.4 + mouthOpen * 2], fill: MOUTH, head: true, face: true } as Part] : []),
  ];

  // ── Transform + project ─────────────────────────────────────────────────
  const proj = (w: V3): [number, number] => [sx + w[0] * m, sy + w[1] * m * K - w[2] * m * UP];
  const headCentre = headXf.point(headLocal([27, 0, 31 + lift]));
  type Drawn = { x: number; y: number; r1: number; r2: number; ang: number; depth: number; part: Part };
  const drawn: Drawn[] = [];
  for (const part of parts) {
    const local: V3 = [part.c[0], part.c[1], part.c[2] + lift];
    const w = part.head ? headXf.point(headLocal(local)) : body.point(local);
    if (part.face) {
      const ref = part.ref ? body.point([part.ref[0], part.ref[1], part.ref[2] + lift])
        : part.head ? headCentre : body.point([part.c[0] - 3, part.c[1], part.c[2] + lift]);
      const n = [w[0] - ref[0], w[1] - ref[1], w[2] - ref[2]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      if ((n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2]) / len < -0.05) continue;
    }
    // Exact orthographic outline of an ellipsoid: sum of projected axis outer products.
    let a = 0, b = 0, c = 0;
    for (let k = 0; k < 3; k++) {
      const ax: V3 = [0, 0, 0]; ax[k] = part.r[k];
      const wa = part.head ? headXf.axis(headAxis(ax)) : body.axis(ax);
      const px = wa[0] * m, py = wa[1] * m * K - wa[2] * m * UP;
      a += px * px; b += px * py; c += py * py;
    }
    const mid = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    const [x, y] = proj(w);
    drawn.push({ x, y, r1: Math.sqrt(mid + d), r2: Math.sqrt(Math.max(mid - d, 0.01)), ang: 0.5 * Math.atan2(2 * b, a - c),
      depth: w[1] * VIEW[1] + w[2] * VIEW[2] + (part.face ? 0.6 : 0), part });
  }
  drawn.sort((p1, p2) => p1.depth - p2.depth);

  ctx.save();
  if (p.fall > 0) {
    // Clip at the waterline so the bear visibly sinks into the sea.
    ctx.beginPath(); ctx.rect(sx - 200, sy - 400, 400, 400 + 3 * m); ctx.clip();
  }
  // Scarf tail streams from the neck on the bear's left; flaps harder with speed.
  const drawScarf = () => {
    const flap = 0.25 + Math.min(1, p.speed / 200) * 0.75 + p.dash * 0.5;
    ctx.strokeStyle = p.color; ctx.lineWidth = 3.4 * m; ctx.lineJoin = "round";
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const f = 15 - k * 4.2 * (0.6 + flap * 0.5);
      const wave = Math.sin(t * (6 + flap * 10) - k * 0.9) * k * 0.9 * flap;
      const w = body.point([f, -12 - k * 0.9 + wave, 29 + lift - k * Math.max(0.5, 1.6 - flap * 0.9)]);
      const [x, y] = proj(w);
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  const sideAxis = body.axis([0, -1, 0]);
  const scarfFront = sideAxis[1] * VIEW[1] + sideAxis[2] * VIEW[2] > 0;
  if (!scarfFront) drawScarf();
  // Soft silhouette outline pass behind everything.
  ctx.fillStyle = "rgba(34,58,86,0.55)";
  for (const d of drawn) if (d.part.outline) {
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r1 + 1.6, d.r2 + 1.6, d.ang, 0, TAU); ctx.fill();
  }
  for (const d of drawn) {
    const R = Math.max(d.r1, d.r2);
    const grd = ctx.createRadialGradient(d.x - R * 0.3, d.y - R * 0.42, R * 0.08, d.x, d.y, R * 1.2);
    grd.addColorStop(0, d.part.fill[0]); grd.addColorStop(0.55, d.part.fill[1]); grd.addColorStop(1, d.part.fill[2]);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r1, d.r2, d.ang, 0, TAU); ctx.fill();
    if (d.part.gloss) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath(); ctx.ellipse(d.x - d.r1 * 0.3, d.y - d.r2 * 0.4, Math.max(0.6, d.r1 * 0.28), Math.max(0.5, d.r2 * 0.22), d.ang, 0, TAU); ctx.fill();
    }
  }

  if (scarfFront) drawScarf();

  // Fur tufts: a few short strokes on the back give texture without noise.
  ctx.strokeStyle = "rgba(150,165,182,0.45)"; ctx.lineWidth = Math.max(0.8, m * 0.9); ctx.lineCap = "round";
  for (const [f, sd, u] of [[-21, 4, 31], [-18, -5, 32], [-24, -1, 29], [13, 6, 33], [15, -5, 33]] as const) {
    const [x, y] = proj(body.point([f, sd + roll, u + lift]));
    const dir = p.face + Math.PI;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(dir) * 3 * m, y + Math.sin(dir) * 3 * m * K + 1.2 * m); ctx.stroke();
  }

  ctx.restore();
}

/** Contact shadow shaped by heading; shrinks while airborne. */
export function drawBearShadow(ctx: CanvasRenderingContext2D, sx: number, sy: number, scale: number, face: number, air: number) {
  const m = scale * 1.05, k = Math.max(0.55, 1 - air / 30);
  const ax = [Math.cos(face) * 34 * k * m, Math.sin(face) * 34 * k * m * GROUND_K];
  const sd = [-Math.sin(face) * 20 * k * m, Math.cos(face) * 20 * k * m * GROUND_K];
  const a = ax[0] ** 2 + sd[0] ** 2, b = ax[0] * ax[1] + sd[0] * sd[1], c = ax[1] ** 2 + sd[1] ** 2;
  const mid = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.sqrt(mid + d));
  grd.addColorStop(0, "rgba(20,50,85,0.42)"); grd.addColorStop(1, "rgba(20,50,85,0)");
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.ellipse(sx + 3 * m, sy + 2 * m, Math.sqrt(mid + d), Math.sqrt(Math.max(mid - d, 1)), 0.5 * Math.atan2(2 * b, a - c), 0, TAU); ctx.fill();
}
