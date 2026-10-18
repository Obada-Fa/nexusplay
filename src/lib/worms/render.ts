import { W, H, THEMES, mulberry32, type Theme } from "./terrain";
import { WormsEngine, PHYS, type Worm, type Proj, type Fx } from "./engine";
import { WEAPON } from "./weapons";

const TAU = Math.PI * 2;

interface Ambient { x: number; y: number; vx: number; vy: number; s: number; c: string; r: number }

export class WormsRenderer {
  cam = { x: W / 2, y: H / 2, z: 0.5 };
  private clouds = Array.from({ length: 14 }, (_, i) => ({ x: (i / 14) * W * 1.6 - W * 0.3, y: 60 + Math.random() * 360, s: 0.6 + Math.random() * 1.2, puffs: Array.from({ length: 5 }, () => [Math.random() * 90 - 45, Math.random() * 24 - 12, 20 + Math.random() * 26]) }));
  private ambient: Ambient[] = [];
  private ridges = new Map<string, number[][]>();
  private mini: HTMLCanvasElement | null = null;
  private miniVersion = -1;
  private miniAt = 0;
  private last = 0;
  private sprites = new Map<string, HTMLCanvasElement>();
  /** Soft round particle, cached per colour — far cheaper than a gradient per particle. */
  private sprite(color: string, hot = false) {
    const key = color + (hot ? "!" : "");
    let c = this.sprites.get(key);
    if (!c) {
      c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d")!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (hot) { g.addColorStop(0, "#fff8e0"); g.addColorStop(0.25, color); g.addColorStop(1, "rgba(255,60,0,0)"); }
      else { g.addColorStop(0, color); g.addColorStop(0.55, color + "aa"); g.addColorStop(1, color + "00"); }
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      this.sprites.set(key, c);
    }
    return c;
  }
  private vh = 0;

  render(ctx: CanvasRenderingContext2D, g: WormsEngine, vw: number, vh: number, time: number) {
    const dt = this.last ? Math.min(0.05, time - this.last) : 0;
    this.last = time;
    this.vh = vh;
    const theme = g.terrain?.theme ?? THEMES[g.theme];
    this.updateCamera(g, vw, vh, dt);
    const { x: cx, y: cy, z } = this.cam;
    const sh = g.shake * 10;
    const ox = vw / 2 - cx * z + (Math.random() - 0.5) * sh, oy = vh / 2 - cy * z + (Math.random() - 0.5) * sh;

    this.drawSky(ctx, theme, vw, vh, time);
    this.drawRidges(ctx, theme, vw, vh, z);
    this.drawClouds(ctx, g, theme, vw, dt, z);

    ctx.save();
    const base = ctx.getTransform();
    ctx.setTransform(base.a * z, 0, 0, base.d * z, base.a * ox, base.d * oy);

    this.drawWater(ctx, g, theme, time, 0, vw);
    if (g.terrain?.canvas) {
      ctx.imageSmoothingEnabled = z < 1;
      ctx.drawImage(g.terrain.canvas, 0, 0);
      ctx.imageSmoothingEnabled = true;
    }
    this.drawObjects(ctx, g, time);
    for (const f of g.flames) this.drawFlame(ctx, f.x, f.y, time);
    for (const w of g.worms) if (w.state !== "dead") this.drawWorm(ctx, g, w, time);
    for (const p of g.projs) this.drawProj(ctx, p, time);
    this.drawFx(ctx, g.fx, time, false);
    this.drawWater(ctx, g, theme, time, 1, vw);
    this.drawWater(ctx, g, theme, time, 2, vw);
    this.drawFx(ctx, g.fx, time, true);
    this.drawAim(ctx, g, time);
    ctx.restore();

    this.drawLabels(ctx, g, ox, oy, z, time);
    this.drawAmbient(ctx, g, theme, vw, vh, dt);
    if (g.terrain) this.drawMinimap(ctx, g, vw, vh, time);
    // Screen-space finishing: explosion flash, sudden-death tint, vignette.
    if (g.flash > 0) { ctx.fillStyle = `rgba(255,240,210,${g.flash * 0.5})`; ctx.fillRect(0, 0, vw, vh); }
    const v = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, g.suddenDeath && g.phase !== "lobby" ? "rgba(90,0,0,0.45)" : "rgba(0,0,0,0.42)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, vw, vh);
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  private focus(g: WormsEngine): { x: number; y: number; k: number; wide: boolean } {
    if (g.phase === "lobby" || g.phase === "intro" || !g.terrain) return { x: W / 2, y: H * 0.55, k: 1.5, wide: true };
    if (g.dying && g.dying.state === "dying") return { x: g.dying.x, y: g.dying.y, k: 4, wide: false };
    if (g.projs.length) {
      const live = g.projs.filter(p => p.t >= 0);
      if (live.length) {
        const p = live.includes(g.lastProj!) ? g.lastProj! : live[live.length - 1];
        return { x: p.x + p.vx * 0.15, y: p.y + p.vy * 0.1, k: 6, wide: false };
      }
    }
    if (g.focusCrate) return { x: g.focusCrate.x, y: Math.max(200, g.focusCrate.y), k: 3, wide: false };
    if (g.targeting && g.phase === "turn") return { x: g.cursor.x, y: g.cursor.y, k: 5, wide: false };
    if (g.phase === "settle" || g.phase === "resolve") {
      let fast: Worm | null = null, sp = 40;
      for (const w of g.worms) if (w.state !== "dead" && !w.grounded && Math.hypot(w.vx, w.vy) > sp) { sp = Math.hypot(w.vx, w.vy); fast = w; }
      if (fast) return { x: fast.x, y: fast.y, k: 5, wide: false };
    }
    if (g.phase === "gameover" && g.winner !== null) {
      const w = g.teams[g.winner].worms.find(w => w.state === "ok");
      if (w) return { x: w.x, y: w.y - 40, k: 2, wide: false };
    }
    const a = g.active;
    return a ? { x: a.x, y: a.y - 30, k: 4, wide: false } : { x: W / 2, y: H / 2, k: 2, wide: true };
  }
  private updateCamera(g: WormsEngine, vw: number, vh: number, dt: number) {
    const f = this.focus(g);
    const fit = Math.min(vw / W, vh / (H * 0.8));
    const zt = f.wide ? fit : Math.max(fit, Math.min(2.2, vw / 950));
    const c = this.cam, a = 1 - Math.exp(-dt * f.k), az = 1 - Math.exp(-dt * 2);
    if (!dt) { c.x = f.x; c.y = f.y; c.z = zt; }
    c.x += (f.x - c.x) * a; c.y += (f.y - c.y) * a; c.z += (zt - c.z) * az;
    const hw = vw / 2 / c.z, hh = vh / 2 / c.z;
    c.x = hw * 2 >= W + 400 ? W / 2 : Math.max(-200 + hw, Math.min(W + 200 - hw, c.x));
    c.y = Math.min(H + 30 - hh, Math.max(-260 + hh, c.y));
  }

  // ── Backdrop ──────────────────────────────────────────────────────────────
  private drawSky(ctx: CanvasRenderingContext2D, t: Theme, vw: number, vh: number, time: number) {
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, t.sky[0]); sky.addColorStop(0.55, t.sky[1]); sky.addColorStop(1, t.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, vh);
    const sx = vw * 0.78 - (this.cam.x / W) * vw * 0.08, sy = vh * 0.2;
    const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, vh * 0.45);
    sun.addColorStop(0, t.sun); sun.addColorStop(0.08, t.sun + "cc"); sun.addColorStop(0.2, t.sun + "44"); sun.addColorStop(1, t.sun + "00");
    ctx.fillStyle = sun; ctx.fillRect(0, 0, vw, vh);
    if (t.id === "arctic" || t.id === "inferno") {
      // aurora ribbons / heat shimmer bands
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let x = 0; x <= vw; x += 20) ctx.lineTo(x, vh * (0.12 + k * 0.07) + Math.sin(x * 0.006 + time * 0.4 + k * 2) * 26);
        ctx.strokeStyle = t.id === "arctic" ? `rgba(120,255,200,${0.08 - k * 0.02})` : `rgba(255,120,40,${0.06 - k * 0.015})`;
        ctx.lineWidth = 40 - k * 10; ctx.stroke();
      }
      ctx.restore();
    }
  }
  private ridge(t: Theme, layer: number) {
    const key = `${t.id}:${layer}`;
    let pts = this.ridges.get(key);
    if (!pts) {
      const r = mulberry32(t.id.length * 977 + layer * 131);
      pts = [];
      let y = 0, v = 0;
      for (let x = -W; x <= W * 2; x += 30) { v = v * 0.86 + (r() - 0.5) * 18; y = Math.max(-260, Math.min(80, y + v)); pts.push([x, y + Math.sin(x * 0.002 + layer) * 90]); }
      this.ridges.set(key, pts);
    }
    return pts;
  }
  private drawRidges(ctx: CanvasRenderingContext2D, t: Theme, vw: number, vh: number, z: number) {
    for (let layer = 0; layer < 2; layer++) {
      const f = 0.2 + layer * 0.2, s = z * (0.6 + layer * 0.15);
      const pts = this.ridge(t, layer);
      const base = H * (0.6 + layer * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, vh);
      for (const [x, y] of pts) {
        const px = vw / 2 + (x - this.cam.x * f - W / 2 * (1 - f)) * s, py = vh / 2 + (base + y - this.cam.y * f - H / 2 * (1 - f)) * s;
        if (px < -40 || px > vw + 40) continue;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(vw, vh); ctx.closePath();
      const gr = ctx.createLinearGradient(0, vh * 0.3, 0, vh);
      gr.addColorStop(0, t.far[layer]); gr.addColorStop(1, t.sky[2]);
      ctx.globalAlpha = 0.75 + layer * 0.15;
      ctx.fillStyle = gr; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  private drawClouds(ctx: CanvasRenderingContext2D, g: WormsEngine, t: Theme, vw: number, dt: number, z: number) {
    const f = 0.12;
    ctx.fillStyle = t.id === "inferno" ? "rgba(60,20,24,0.55)" : t.id === "candy" ? "rgba(255,240,250,0.75)" : "rgba(255,255,255,0.78)";
    for (const c of this.clouds) {
      c.x += (8 + g.wind * 70) * c.s * dt;
      if (c.x > W * 1.4) c.x -= W * 1.8; if (c.x < -W * 0.4) c.x += W * 1.8;
      const px = vw / 2 + (c.x - this.cam.x * f - W / 2 * (1 - f)) * z * 0.7, py = this.vh / 2 + (c.y - this.cam.y * f - H / 2 * (1 - f)) * z * 0.7;
      ctx.beginPath();
      for (const [dx, dy, r] of c.puffs) { ctx.moveTo(px + dx * c.s * z, py + dy * c.s * z); ctx.arc(px + dx * c.s * z, py + dy * c.s * z, r * c.s * z, 0, TAU); }
      ctx.fill();
    }
  }

  private drawWater(ctx: CanvasRenderingContext2D, g: WormsEngine, t: Theme, time: number, layer: number, vw: number) {
    const c = this.cam, x0 = c.x - vw / 2 / c.z - 40, x1 = c.x + vw / 2 / c.z + 40;
    const y0 = g.waterY - 14 + layer * 9, amp = 4 + layer, spd = 1 + layer * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, H + 400);
    for (let x = Math.floor(x0 / 10) * 10; x <= x1; x += 10) ctx.lineTo(x, y0 + Math.sin(x * 0.018 + time * spd + layer * 1.7) * amp + Math.sin(x * 0.047 - time * 1.3) * 1.5);
    ctx.lineTo(x1, H + 400); ctx.closePath();
    const gr = ctx.createLinearGradient(0, y0 - 6, 0, y0 + 260);
    gr.addColorStop(0, t.water[0]); gr.addColorStop(0.25, t.water[1]); gr.addColorStop(1, t.water[2]);
    ctx.globalAlpha = layer === 0 ? 1 : layer === 1 ? 0.6 : 0.8;
    ctx.fillStyle = gr; ctx.fill();
    if (layer > 0) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = t.id === "inferno" ? "#fff2a0" : "#ffffff";
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (t.id === "inferno" && layer === 2) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createLinearGradient(0, y0 - 80, 0, y0);
      glow.addColorStop(0, "rgba(255,90,20,0)"); glow.addColorStop(1, "rgba(255,90,20,0.25)");
      ctx.fillStyle = glow; ctx.fillRect(x0, y0 - 80, x1 - x0, 80);
      ctx.restore();
    }
  }

  // ── Entities ──────────────────────────────────────────────────────────────
  private drawObjects(ctx: CanvasRenderingContext2D, g: WormsEngine, time: number) {
    for (const gr of g.graves) {
      ctx.save(); ctx.translate(gr.x, gr.y + 6);
      ctx.fillStyle = "#8b8f98"; ctx.strokeStyle = "#3a3d44"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-6, -10); ctx.arc(0, -10, 6, Math.PI, 0); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = gr.color; ctx.fillRect(-6, -2, 12, 2);
      ctx.fillStyle = "#3a3d44"; ctx.fillRect(-0.7, -14, 1.4, 8); ctx.fillRect(-3, -11.5, 6, 1.4);
      ctx.restore();
    }
    for (const b of g.barrels) {
      ctx.save(); ctx.translate(b.x, b.y);
      const gr = ctx.createLinearGradient(-8, 0, 8, 0);
      gr.addColorStop(0, "#7a1010"); gr.addColorStop(0.4, "#e04040"); gr.addColorStop(1, "#6a0c0c");
      ctx.fillStyle = gr; ctx.strokeStyle = "#2a0606"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(-7, -9, 14, 18, 2.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#2a0606"; ctx.fillRect(-7, -4, 14, 1.2); ctx.fillRect(-7, 3, 14, 1.2);
      ctx.fillStyle = "#ffd23f"; ctx.font = "bold 7px system-ui"; ctx.textAlign = "center"; ctx.fillText("☢", 0, 2.5);
      if (b.fuse >= 0) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,160,40,0.6)"; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    for (const m of g.mines) {
      ctx.save(); ctx.translate(m.x, m.y);
      ctx.fillStyle = "#3a3f46"; ctx.strokeStyle = "#111"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 1, 6, 3.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#5a616a"; ctx.beginPath(); ctx.ellipse(0, -0.5, 4, 2, 0, 0, TAU); ctx.fill();
      const on = m.fuse > 0 ? Math.sin(time * 40) > 0 : m.armT > 0 ? false : Math.sin(time * 3 + m.id) > 0.6;
      ctx.fillStyle = on ? "#ff2a2a" : "#5a1010";
      ctx.beginPath(); ctx.arc(0, -2, 1.4, 0, TAU); ctx.fill();
      if (on) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,40,40,0.5)"; ctx.beginPath(); ctx.arc(0, -2, m.fuse > 0 ? 7 : 4, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    for (const c of g.crates) {
      ctx.save(); ctx.translate(c.x, c.y);
      if (c.chute) {
        const sw = Math.sin(time * 1.7 + c.id) * 0.15;
        ctx.rotate(sw);
        ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-20, -34); ctx.moveTo(8, -8); ctx.lineTo(20, -34); ctx.moveTo(0, -9); ctx.lineTo(0, -38); ctx.stroke();
        const cg = ctx.createLinearGradient(-24, -50, 24, -30);
        cg.addColorStop(0, "#ff5d5d"); cg.addColorStop(0.5, "#ffffff"); cg.addColorStop(1, "#ff5d5d");
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.moveTo(-24, -33); ctx.quadraticCurveTo(0, -62, 24, -33); ctx.quadraticCurveTo(12, -38, 0, -34); ctx.quadraticCurveTo(-12, -38, -24, -33); ctx.fill();
      }
      ctx.fillStyle = c.kind === "health" ? "#f4f4f4" : "#a8743e"; ctx.strokeStyle = c.kind === "health" ? "#999" : "#5a3a18"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(-8, -8, 16, 16, 2); ctx.fill(); ctx.stroke();
      if (c.kind === "health") { ctx.fillStyle = "#e02a2a"; ctx.fillRect(-1.8, -5.5, 3.6, 11); ctx.fillRect(-5.5, -1.8, 11, 3.6); }
      else { ctx.strokeStyle = "#5a3a18"; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke(); ctx.fillStyle = "#ffd23f"; ctx.font = "bold 8px system-ui"; ctx.textAlign = "center"; ctx.fillText("?", 0, 3); }
      ctx.restore();
    }
  }

  private drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const f = 0.8 + Math.sin(time * 30 + x) * 0.2;
    const g = ctx.createRadialGradient(x, y - 3, 0, x, y - 3, 8 * f);
    g.addColorStop(0, "rgba(255,240,180,0.95)"); g.addColorStop(0.4, "rgba(255,150,40,0.7)"); g.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 3, 8 * f, 0, TAU); ctx.fill();
    ctx.restore();
  }

  private drawWorm(ctx: CanvasRenderingContext2D, g: WormsEngine, w: Worm, time: number) {
    const team = g.teams[w.team];
    const isActive = w.id === g.activeId && ["turnstart", "turn", "retreat"].includes(g.phase);
    const air = !w.grounded && w.state === "ok";
    const walking = isActive && w.grounded && (team.keys.has("left") || team.keys.has("right")) && !g.targeting && !g.charging;
    const f = w.face;
    ctx.save();
    let jx = 0;
    if (w.state === "dying") jx = Math.sin(time * 60) * 1.2;
    ctx.translate(w.x + jx, w.y);
    if (air && Math.hypot(w.vx, w.vy) > 160 && !(isActive && g.jetOn)) ctx.rotate(w.spin);
    const bob = walking ? Math.abs(Math.sin(w.walkT * 14)) * -1.6 : Math.sin(time * 2.2 + w.id) * 0.4;
    const sq = w.landT > 0 ? 1 - w.landT * 0.8 : walking ? 1 + Math.sin(w.walkT * 28) * 0.05 : 1;
    ctx.translate(0, 8); ctx.scale(f * (2 - sq), sq); ctx.translate(0, -8 + bob);

    // Jet pack on the back.
    if (isActive && g.jetOn) {
      ctx.fillStyle = "#6a7480"; ctx.strokeStyle = "#2a2f36"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.roundRect(-11, -6, 5, 11, 1.5); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const fl = 6 + Math.random() * 6;
      const jg = ctx.createLinearGradient(0, 5, 0, 5 + fl);
      jg.addColorStop(0, "rgba(255,240,160,0.95)"); jg.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = jg; ctx.beginPath(); ctx.moveTo(-10.5, 5); ctx.lineTo(-6.5, 5); ctx.lineTo(-8.5, 5 + fl); ctx.fill();
      ctx.restore();
    }
    // Body: overlapping discs, outline pass then fill pass → one clean silhouette.
    const discs: [number, number, number][] = [[-6.5, 6, 3.6], [-3, 4.5, 5.2], [0.5, 1, 6.2], [1.5, -4.5, 6.4]];
    ctx.fillStyle = "#7a2848";
    for (const [x, y, r] of discs) { ctx.beginPath(); ctx.arc(x, y, r + 1.1, 0, TAU); ctx.fill(); }
    const skin = ctx.createLinearGradient(-6, -10, 6, 10);
    const hurt = w.hurtT > 0 && Math.sin(time * 40) > 0;
    skin.addColorStop(0, hurt ? "#ffd0d0" : "#ffc4d8"); skin.addColorStop(0.5, hurt ? "#ff9090" : "#f590b4"); skin.addColorStop(1, "#d8648e");
    ctx.fillStyle = skin;
    for (const [x, y, r] of discs) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "rgba(255,230,238,0.65)";
    ctx.beginPath(); ctx.ellipse(3.6, 2.5, 2.2, 4, -0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.ellipse(-0.5, -8, 2.4, 1.3, -0.4, 0, TAU); ctx.fill();
    // Headband with fluttering tails.
    ctx.fillStyle = team.color;
    ctx.beginPath(); ctx.ellipse(1.5, -7.5, 6.6, 1.9, -0.12, 0, TAU); ctx.fill();
    const flap = Math.sin(time * 9 + w.id) * 1.6 + (air ? 2 : 0);
    ctx.beginPath(); ctx.moveTo(-4.5, -7); ctx.quadraticCurveTo(-8, -9 + flap, -11.5, -6.5 + flap); ctx.lineTo(-10.5, -4.8 + flap); ctx.quadraticCurveTo(-7.5, -6 + flap * 0.5, -4.5, -5.6); ctx.fill();
    // Eyes look along the aim (active) or toward the action.
    const lookA = isActive ? w.aim : Math.sin(time * 0.7 + w.id) * 0.3;
    const lx = Math.cos(lookA) * 0.9, ly = Math.sin(lookA) * 0.9;
    const blink = w.blink < 0 || w.state === "dying";
    for (const ex of [3.2, 6.6]) {
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#7a2848"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(ex, -4, 2.3, blink ? 0.4 : 2.9, 0, 0, TAU); ctx.fill(); ctx.stroke();
      if (!blink) { ctx.fillStyle = "#1a0d14"; ctx.beginPath(); ctx.arc(ex + lx + 0.4, -3.7 + ly, 1.25, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(ex + lx, -4.6 + ly, 0.6, 0.6); }
    }
    // Mouth
    ctx.strokeStyle = "#7a2848"; ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (w.hurtT > 0 || air) { ctx.fillStyle = "#5a1030"; ctx.ellipse(6, 1, 1.3, 1.6, 0, 0, TAU); ctx.fill(); }
    else { ctx.arc(5.5, -0.5, 2, 0.2, Math.PI - 0.6); ctx.stroke(); }

    if (isActive && w.state === "ok" && (g.phase === "turn") && !walking && !g.jetOn && w.grounded) this.drawWeapon(ctx, g, w, time);
    if (w.state === "dying") {
      ctx.fillStyle = "#555"; ctx.fillRect(9, 2, 6, 6); ctx.fillStyle = "#c22"; ctx.fillRect(11, -2 - Math.max(0, w.dieT - 0.4) * 6, 2, 4);
    }
    ctx.restore();
  }

  private drawWeapon(ctx: CanvasRenderingContext2D, g: WormsEngine, w: Worm, time: number) {
    const id = g.teams[w.team].weapon;
    ctx.save();
    ctx.translate(4, 2);
    ctx.rotate(w.aim);
    switch (id) {
      case "bazooka": case "homing":
        ctx.fillStyle = id === "homing" ? "#6a6f80" : "#5b6b2e"; ctx.strokeStyle = "#1e2410"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.roundRect(-8, -2.6, 20, 5.2, 1.2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#333"; ctx.fillRect(11, -3.2, 2.5, 6.4); ctx.fillRect(-1, 2, 2, 3);
        if (id === "homing") { ctx.fillStyle = "#e03030"; ctx.fillRect(4, -2.6, 2, 5.2); }
        break;
      case "shotgun":
        ctx.fillStyle = "#6a4020"; ctx.fillRect(-4, -1, 7, 3.5);
        ctx.fillStyle = "#2a2a2e"; ctx.fillRect(2, -1.6, 13, 2.2); ctx.fillRect(2, 0.8, 11, 1.4);
        break;
      case "bat":
        ctx.fillStyle = "#c8955a"; ctx.strokeStyle = "#6a4020"; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(15, -2.6); ctx.arc(15, 0, 2.6, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-1, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case "grenade": case "cluster": case "holy": case "banana": {
        ctx.translate(7, 0);
        if (id === "banana") { ctx.strokeStyle = "#ffe14a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -3, 4.5, 0.3, 2.6); ctx.stroke(); break; }
        ctx.fillStyle = id === "holy" ? "#ffd23f" : id === "cluster" ? "#c04040" : "#3e6a2a";
        ctx.beginPath(); ctx.arc(0, 0, id === "holy" ? 4.2 : 3.6, 0, TAU); ctx.fill();
        ctx.fillStyle = id === "holy" ? "#fff6c0" : "#888"; ctx.fillRect(-0.8, -6, 1.6, 2.5);
        if (id === "holy") { ctx.fillRect(-0.6, -9, 1.2, 4); ctx.fillRect(-2, -7.8, 4, 1.1); }
        break;
      }
      case "airstrike": ctx.rotate(-w.aim); ctx.fillStyle = "#3a3f46"; ctx.fillRect(4, -6, 5, 8); ctx.strokeStyle = "#888"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(10, -13); ctx.stroke(); ctx.fillStyle = Math.sin(time * 10) > 0 ? "#ff3030" : "#601010"; ctx.fillRect(5, -4, 1.5, 1.5); break;
      case "teleport": ctx.rotate(-w.aim); ctx.fillStyle = "#4db8ff"; ctx.beginPath(); ctx.roundRect(4, -5, 5, 8, 1.5); ctx.fill(); ctx.fillStyle = `rgba(160,230,255,${0.5 + Math.sin(time * 8) * 0.5})`; ctx.beginPath(); ctx.arc(6.5, -7, 1.8, 0, TAU); ctx.fill(); break;
      case "dynamite": ctx.rotate(-w.aim); ctx.fillStyle = "#d02020"; ctx.fillRect(5, -6, 3.5, 10); ctx.strokeStyle = "#222"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(6.7, -6); ctx.lineTo(8, -9); ctx.stroke(); break;
      case "mine": ctx.rotate(-w.aim); ctx.fillStyle = "#3a3f46"; ctx.beginPath(); ctx.ellipse(8, 2, 4, 2.4, 0, 0, TAU); ctx.fill(); break;
      case "sheep": ctx.rotate(-w.aim); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9, -1, 3.6, 0, TAU); ctx.fill(); ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(12, -1.5, 1.6, 0, TAU); ctx.fill(); break;
      case "jetpack": ctx.rotate(-w.aim); ctx.fillStyle = "#6a7480"; ctx.fillRect(-11, -6, 5, 11); break;
      case "skip": ctx.rotate(-w.aim); ctx.strokeStyle = "#ddd"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(7, 4); ctx.lineTo(7, -12); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(7, -12); ctx.lineTo(14, -10 + Math.sin(time * 6)); ctx.lineTo(7, -7); ctx.fill(); break;
    }
    ctx.restore();
  }

  private drawProj(ctx: CanvasRenderingContext2D, p: Proj, time: number) {
    if (p.t < 0) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    switch (p.kind) {
      case "rocket": case "homing": case "missile": {
        const long = p.kind === "missile" ? 9 : 11;
        ctx.fillStyle = p.kind === "missile" ? "#4a4f58" : "#8a8f6a"; ctx.strokeStyle = "#222"; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(long / 2 + 3, 0); ctx.lineTo(long / 2, -2.4); ctx.lineTo(-long / 2, -2.4); ctx.lineTo(-long / 2, 2.4); ctx.lineTo(long / 2, 2.4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = p.kind === "homing" ? "#e03030" : "#c04030"; ctx.beginPath(); ctx.moveTo(long / 2 + 3, 0); ctx.lineTo(long / 2, -2.4); ctx.lineTo(long / 2, 2.4); ctx.fill();
        ctx.fillStyle = "#555"; ctx.beginPath(); ctx.moveTo(-long / 2, -2.4); ctx.lineTo(-long / 2 - 3, -4.5); ctx.lineTo(-long / 2 + 2, -2.4); ctx.moveTo(-long / 2, 2.4); ctx.lineTo(-long / 2 - 3, 4.5); ctx.lineTo(-long / 2 + 2, 2.4); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        const fl = 5 + Math.random() * 5;
        const g = ctx.createLinearGradient(-long / 2, 0, -long / 2 - fl, 0);
        g.addColorStop(0, "rgba(255,240,170,1)"); g.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-long / 2, -2); ctx.lineTo(-long / 2 - fl, 0); ctx.lineTo(-long / 2, 2); ctx.fill();
        break;
      }
      case "grenade": case "cluster": case "clusterlet": case "holy": {
        const r = p.kind === "clusterlet" ? 2.2 : p.kind === "holy" ? 5 : 4;
        const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, 0, 0, 0, r);
        const col = p.kind === "holy" ? ["#fff6c0", "#e0a810"] : p.kind === "grenade" ? ["#8ac060", "#2e5420"] : ["#ff8a7a", "#8a1a1a"];
        g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
        ctx.fillStyle = g; ctx.strokeStyle = "#111"; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
        if (p.kind !== "clusterlet") { ctx.fillStyle = p.kind === "holy" ? "#fff" : "#999"; ctx.fillRect(-1, -r - 2, 2, 2.5); }
        if (p.kind === "holy") { ctx.fillStyle = "#fff"; ctx.fillRect(-0.6, -r - 6, 1.2, 4.5); ctx.fillRect(-2, -r - 4.6, 4, 1.1); }
        if (p.kind === "grenade" || p.kind === "cluster") {
          ctx.rotate(-p.rot);
          ctx.fillStyle = "#fff"; ctx.font = "bold 7px system-ui"; ctx.textAlign = "center";
          ctx.fillText(String(Math.max(1, Math.ceil(p.fuse - p.t))), 0, -10);
        }
        break;
      }
      case "banana": case "bananette": {
        const s = p.kind === "banana" ? 1 : 0.75;
        ctx.scale(s, s);
        ctx.strokeStyle = "#5a4010"; ctx.lineWidth = 4.6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(0, -3, 5.5, 0.4, 2.7); ctx.stroke();
        ctx.strokeStyle = "#ffe14a"; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.arc(0, -3, 5.5, 0.4, 2.7); ctx.stroke();
        break;
      }
      case "dynamite": {
        ctx.fillStyle = "#d02020"; ctx.strokeStyle = "#500"; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.roundRect(-2.4, -6, 4.8, 12, 1); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#f0e0c0"; ctx.fillRect(-2.4, -1.5, 4.8, 3);
        ctx.strokeStyle = "#333"; ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(2, -8, 1, -9.5); ctx.stroke();
        ctx.rotate(-p.rot);
        ctx.fillStyle = "#fff"; ctx.font = "bold 7px system-ui"; ctx.textAlign = "center";
        ctx.fillText(String(Math.max(1, Math.ceil(p.fuse - p.t))), 0, -14);
        break;
      }
      case "sheep": {
        ctx.rotate(-p.rot);
        ctx.scale(p.face, 1);
        const step = Math.sin(time * 22);
        ctx.strokeStyle = "#222"; ctx.lineWidth = 1.4;
        for (const lx of [-4, -1.5, 2, 4.5]) { ctx.beginPath(); ctx.moveTo(lx, 3); ctx.lineTo(lx + step * (lx > 0 ? 1.5 : -1.5), 7.5); ctx.stroke(); }
        ctx.fillStyle = "#fbfbf6";
        for (const [x, y, r] of [[-4, -1, 4], [0, -2.5, 4.5], [3.5, -0.5, 4], [-1, 1.5, 4], [-5.5, 1.5, 3]] as const) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
        ctx.fillStyle = "#222"; ctx.beginPath(); ctx.ellipse(7.5, -2, 3, 2.4, 0.2, 0, TAU); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(8.6, -2.8, 0.9, 0, TAU); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  private drawFx(ctx: CanvasRenderingContext2D, fx: Fx[], time: number, additive: boolean) {
    ctx.save();
    for (const f of fx) {
      const k = Math.max(0, f.life / f.max);
      const add = f.kind === "fire" || f.kind === "spark" || f.kind === "flash" || f.kind === "glow" || f.kind === "star" || f.kind === "tracer";
      if (add !== additive) continue;
      ctx.globalCompositeOperation = add ? "lighter" : "source-over";
      switch (f.kind) {
        case "smoke": case "puff": {
          const r = f.size * (1.4 + (1 - k) * (f.kind === "smoke" ? 3 : 1.5));
          ctx.globalAlpha = Math.min(1, k * 1.6) * (f.kind === "smoke" ? 0.55 : 0.8);
          ctx.drawImage(this.sprite(f.color.slice(0, 7)), f.x - r, f.y - r, r * 2, r * 2);
          break;
        }
        case "fire": {
          ctx.globalAlpha = Math.min(1, k * 1.4);
          const r = f.size * (0.8 + k * 1.1);
          ctx.drawImage(this.sprite(f.color.slice(0, 7), k > 0.5), f.x - r, f.y - r, r * 2, r * 2);
          break;
        }
        case "spark":
          ctx.globalAlpha = k; ctx.strokeStyle = f.color; ctx.lineWidth = f.size;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.03, f.y - f.vy * 0.03); ctx.stroke();
          break;
        case "chip":
          ctx.globalAlpha = Math.min(1, k * 3); ctx.fillStyle = f.color;
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillRect(-f.size / 2, -f.size / 2, f.size, f.size * 0.7); ctx.restore();
          break;
        case "ring":
          ctx.globalAlpha = k * 0.7; ctx.strokeStyle = f.color; ctx.lineWidth = 3 * k + 0.5;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (1 - k) + 3, 0, TAU); ctx.stroke();
          break;
        case "flash": case "glow": {
          ctx.globalAlpha = f.kind === "flash" ? k : k * 0.6;
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * (f.kind === "glow" ? 1.3 - k * 0.3 : 1));
          g.addColorStop(0, f.color); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.size * 1.3, 0, TAU); ctx.fill();
          break;
        }
        case "text": {
          const pop = Math.min(1, (1 - k) * 8), s = 0.6 + pop * 0.4 + (pop < 1 ? 0.3 * Math.sin(pop * Math.PI) : 0);
          ctx.globalAlpha = Math.min(1, k * 2.5);
          ctx.save(); ctx.translate(f.x, f.y); ctx.scale(s, s);
          ctx.font = `900 ${f.size}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.lineWidth = f.size * 0.22; ctx.strokeStyle = "#140a10"; ctx.lineJoin = "round"; ctx.strokeText(f.text ?? "", 0, 0);
          ctx.fillStyle = f.color; ctx.fillText(f.text ?? "", 0, 0);
          ctx.restore();
          break;
        }
        case "bubble":
          ctx.globalAlpha = 0.7; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, TAU); ctx.stroke();
          break;
        case "drop":
          ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, TAU); ctx.fill();
          break;
        case "tracer":
          ctx.globalAlpha = k; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2 ?? f.x, f.y2 ?? f.y); ctx.stroke();
          break;
        case "star": {
          ctx.globalAlpha = k; ctx.fillStyle = f.color;
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) { const r = i % 2 ? f.size * 0.3 : f.size; ctx.lineTo(Math.cos((i / 8) * TAU) * r, Math.sin((i / 8) * TAU) * r); }
          ctx.fill(); ctx.restore();
          break;
        }
        case "plane": {
          ctx.globalAlpha = 1;
          const dir = Math.sign(f.vx) || 1;
          ctx.save(); ctx.translate(f.x, f.y); ctx.scale(dir * 1.6, 1.6);
          ctx.fillStyle = "#4a5260";
          ctx.beginPath(); ctx.moveTo(26, 0); ctx.quadraticCurveTo(20, -5, 0, -4); ctx.lineTo(-22, -3); ctx.lineTo(-28, -12); ctx.lineTo(-32, -12); ctx.lineTo(-29, 1); ctx.lineTo(0, 4); ctx.quadraticCurveTo(20, 5, 26, 0); ctx.fill();
          ctx.fillStyle = "#3a404c"; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-10, 14); ctx.lineTo(-14, 14); ctx.lineTo(-6, 0); ctx.fill();
          ctx.fillStyle = f.color; ctx.fillRect(-18, -2, 8, 3);
          ctx.fillStyle = "#9fd8ff"; ctx.beginPath(); ctx.ellipse(14, -3, 5, 2, 0, 0, TAU); ctx.fill();
          ctx.restore();
          void time;
          break;
        }
      }
    }
    ctx.restore();
  }

  private drawAim(ctx: CanvasRenderingContext2D, g: WormsEngine, time: number) {
    const w = g.active, t = g.activeTeam;
    if (!w || !t || w.state !== "ok") return;
    // Bouncing turn arrow.
    if (g.phase === "turnstart" || (g.phase === "turn" && g.turnT > g.turnTime - 2.5)) {
      const by = w.y - 46 + Math.sin(time * 8) * 5;
      ctx.fillStyle = t.color; ctx.strokeStyle = "#140a10"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(w.x - 7, by - 10); ctx.lineTo(w.x + 7, by - 10); ctx.lineTo(w.x + 7, by - 2); ctx.lineTo(w.x + 12, by - 2); ctx.lineTo(w.x, by + 9); ctx.lineTo(w.x - 12, by - 2); ctx.lineTo(w.x - 7, by - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (g.phase !== "turn") return;
    const def = WEAPON[t.weapon];
    if (g.targeting) {
      const c = g.cursor;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(time * 1.5);
      ctx.strokeStyle = t.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(20, 0); ctx.stroke(); }
      ctx.restore();
      if (t.weapon === "airstrike") {
        ctx.fillStyle = t.color; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(c.x + w.face * 30, c.y - 30); ctx.lineTo(c.x + w.face * 14, c.y - 38); ctx.lineTo(c.x + w.face * 14, c.y - 22); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (t.weapon === "teleport") { ctx.globalAlpha = 0.35; ctx.fillStyle = "#ffc4d8"; ctx.beginPath(); ctx.arc(c.x, c.y, PHYS.wormR, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      return;
    }
    if (g.target && t.weapon === "homing") {
      ctx.save(); ctx.translate(g.target.x, g.target.y); ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "#ff4040"; ctx.lineWidth = 2.5; const s = 8 + Math.sin(time * 10) * 2;
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke(); ctx.restore();
    }
    if (!def.aims || g.jetOn) return;
    const a = w.face === 1 ? w.aim : Math.PI - w.aim, dx = Math.cos(a), dy = Math.sin(a);
    if (g.charging) {
      const n = Math.floor(g.power * 18);
      for (let i = 0; i < n; i++) {
        const d = 14 + i * 3.6, r = 1.2 + i * 0.42;
        ctx.fillStyle = `hsl(${55 - i * 3.2}, 100%, ${60 - i}%)`;
        ctx.beginPath(); ctx.arc(w.x + dx * d, w.y - 2 + dy * d, r, 0, TAU); ctx.fill();
      }
    }
    const hx = w.x + dx * 52, hy = w.y - 2 + dy * 52;
    ctx.strokeStyle = t.color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - 9, hy); ctx.lineTo(hx - 3, hy); ctx.moveTo(hx + 3, hy); ctx.lineTo(hx + 9, hy); ctx.moveTo(hx, hy - 9); ctx.lineTo(hx, hy - 3); ctx.moveTo(hx, hy + 3); ctx.lineTo(hx, hy + 9); ctx.stroke();
  }

  private drawLabels(ctx: CanvasRenderingContext2D, g: WormsEngine, ox: number, oy: number, z: number, time: number) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const w of g.worms) {
      if (w.state === "dead" || w.state === "drowning") continue;
      const team = g.teams[w.team];
      const sx = ox + w.x * z, sy = oy + (w.y - 18) * z;
      const active = w.id === g.activeId && ["turnstart", "turn", "retreat"].includes(g.phase);
      const hp = String(Math.max(0, Math.ceil(w.shown)));
      ctx.font = "800 12px system-ui, sans-serif";
      const hw = ctx.measureText(hp).width + 10;
      ctx.fillStyle = "rgba(10,8,16,0.82)"; ctx.strokeStyle = team.color; ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(sx - hw / 2, sy - 9, hw, 16, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = team.color; ctx.fillText(hp, sx, sy);
      ctx.font = `700 ${active ? 12 : 11}px system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,8,16,0.85)"; ctx.lineJoin = "round";
      ctx.strokeText(w.name, sx, sy - 16); ctx.fillStyle = active ? "#ffffff" : team.color; ctx.fillText(w.name, sx, sy - 16);
      if (w.state === "dying") { ctx.font = "900 14px system-ui"; ctx.fillStyle = Math.sin(time * 20) > 0 ? "#ff4040" : "#fff"; ctx.fillText("!!", sx, sy - 32); }
    }
    ctx.restore();
  }

  private drawAmbient(ctx: CanvasRenderingContext2D, g: WormsEngine, t: Theme, vw: number, vh: number, dt: number) {
    const target = t.ambient === "pollen" ? 40 : 110;
    while (this.ambient.length < target) {
      const c = t.ambient === "snow" ? "#ffffff" : t.ambient === "embers" ? "#ffa040" : t.ambient === "pollen" ? "#fff7b0" : ["#ff5fa2", "#ffd84a", "#6ad0ff", "#9cf07a"][Math.floor(Math.random() * 4)];
      this.ambient.push({ x: Math.random() * vw, y: Math.random() * vh, vx: 0, vy: 0, s: 0.6 + Math.random() * 1.8, c, r: Math.random() * TAU });
    }
    if (this.ambient.length > target) this.ambient.length = target;
    ctx.save();
    if (t.ambient === "embers") ctx.globalCompositeOperation = "lighter";
    for (const p of this.ambient) {
      const fall = t.ambient === "embers" ? -24 : t.ambient === "pollen" ? 4 : 30;
      p.x += (g.wind * 90 + Math.sin(p.r + p.y * 0.01) * 10) * p.s * dt; p.y += fall * p.s * dt; p.r += dt;
      if (p.x > vw + 10) p.x -= vw + 20; if (p.x < -10) p.x += vw + 20;
      if (p.y > vh + 10) p.y -= vh + 20; if (p.y < -10) p.y += vh + 20;
      ctx.globalAlpha = t.ambient === "pollen" ? 0.5 : 0.75;
      ctx.fillStyle = p.c;
      if (t.ambient === "sprinkles") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-2.5, -0.8, 5, 1.6); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (t.ambient === "snow" ? 1.3 : 0.9), 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, g: WormsEngine, vw: number, vh: number, time: number) {
    const mw = Math.min(240, vw * 0.18), mh = mw * (H / W), mx = vw - mw - 22, my = 92;
    if (!this.mini) { this.mini = document.createElement("canvas"); }
    if (g.terrain!.version !== this.miniVersion && time - this.miniAt > 0.25) {
      this.mini.width = Math.ceil(mw); this.mini.height = Math.ceil(mh);
      const m = this.mini.getContext("2d")!;
      m.clearRect(0, 0, mw, mh); m.drawImage(g.terrain!.canvas!, 0, 0, mw, mh);
      this.miniVersion = g.terrain!.version; this.miniAt = time;
    }
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(6,8,18,0.55)"; ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(mx - 4, my - 4, mw + 8, mh + 8, 8); ctx.fill(); ctx.stroke();
    ctx.drawImage(this.mini, mx, my, mw, mh);
    const sx = mw / W;
    ctx.fillStyle = g.themeInfo.water[1]; ctx.globalAlpha = 0.8; ctx.fillRect(mx, my + g.waterY * sx, mw, mh - g.waterY * sx); ctx.globalAlpha = 1;
    for (const w of g.worms) {
      if (w.state !== "ok") continue;
      const active = w.id === g.activeId;
      ctx.fillStyle = g.teams[w.team].color;
      ctx.beginPath(); ctx.arc(mx + w.x * sx, my + w.y * sx, active ? 3 + Math.sin(time * 8) : 2.2, 0, TAU); ctx.fill();
    }
    for (const c of g.crates) { ctx.fillStyle = "#ffe28a"; ctx.fillRect(mx + c.x * sx - 1.5, my + c.y * sx - 1.5, 3, 3); }
    const c = this.cam;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.strokeRect(mx + (c.x - vw / 2 / c.z) * sx, my + (c.y - vh / 2 / c.z) * sx, (vw / c.z) * sx, (vh / c.z) * sx);
    ctx.restore();
  }
}
