import type { Player } from "../../types/socket";

// Polar Push (Crash Bash) replica. Host-authoritative; world units/seconds, floe centred on (0,0).
export const STAGES = [
  { id: "polar", name: "Polar Panic", blurb: "Classic floe. Knock everyone into the sea.", tilt: false, melt: false },
  { id: "tilt", name: "Tilt Panic", blurb: "The ice tips toward wherever the bears gather.", tilt: true, melt: false },
  { id: "melt", name: "Melt Panic", blurb: "A melting beam eats the floe tile by tile.", tilt: false, melt: true },
  { id: "manic", name: "Manic Panic", blurb: "Tilting AND melting. Pure chaos.", tilt: true, melt: true },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

// Character choice changes push strength and recovery time, as in the original.
export const CLASSES = [
  { id: "allround", name: "All-Rounder", icon: "⭐", speed: 1, push: 1, mass: 1, recover: 1, regen: 1 },
  { id: "heavy", name: "Heavyweight", icon: "🪨", speed: 0.85, push: 1.3, mass: 1.45, recover: 0.8, regen: 0.85 },
  { id: "speedy", name: "Speedster", icon: "💨", speed: 1.2, push: 0.8, mass: 0.8, recover: 1.1, regen: 1.25 },
  { id: "tricky", name: "Trickster", icon: "🌀", speed: 1.08, push: 0.95, mass: 0.95, recover: 1.6, regen: 1.1 },
] as const;
export type ClassId = (typeof CLASSES)[number]["id"];

export const RULES = {
  tiles: 10, tile: 60, radius: 27, accel: 560, drag: 3.1, slideDrag: 2.4,
  dashSpeed: 480, dashTime: 0.26, dashCost: 42, regen: 46, hitStun: 0.42,
  winsNeeded: 3, roundTime: 75, fishEvery: 7, fishLife: 7, powerTime: 6, maxBears: 4,
};
export const HALF = (RULES.tiles * RULES.tile) / 2;
export const BEAR_COLORS = ["#ff5d5d", "#4db8ff", "#ffd23f", "#5ee07a"];
const AI_NAMES = ["Frosty", "Blizzard", "Nanook", "Kodiak"];

export type Phase = "lobby" | "intro" | "countdown" | "playing" | "roundover" | "matchover";

export interface Bear {
  slot: number; playerId: string | null; name: string; color: string; cls: ClassId;
  x: number; y: number; vx: number; vy: number; face: number; input: number | null;
  alive: boolean; fallT: number; fallVx: number; fallVy: number;
  dashT: number; stamina: number; stun: number; power: number; wins: number;
  ready: boolean; knocks: number; lastHitBy: number; lastHitT: number; walk: number;
  ai: { target: number; think: number; aim: number; jitter: number };
}
export interface Tile { alive: boolean; crack: number } // crack > 0 → seconds until it sinks
export interface Fish { x: number; y: number; life: number; bob: number }
export interface Fx { x: number; y: number; vx: number; vy: number; vz: number; z: number; life: number; max: number; color: string; size: number; kind: "snow" | "splash" | "spark" | "ring" | "chip" }

const cls = (id: ClassId) => CLASSES.find(c => c.id === id)!;

export class PolarEngine {
  phase: Phase = "lobby";
  stage = 0;
  round = 0;
  timer = 0;          // phase timer (counts down)
  clock = RULES.roundTime;
  time = 0;
  bears: Bear[] = [];
  tiles: Tile[] = [];
  fish: Fish[] = [];
  fx: Fx[] = [];
  tiltX = 0; tiltY = 0;   // −1..1, positive = floe dips toward +x / +y
  beam = { x: 0, y: 0, a: 0, on: false };
  meltT = 0; suddenDeath = false; fishT = 0;
  roundWinner: number | null = null;
  champion: number | null = null;
  shake = 0;
  feed: { text: string; color: string; until: number }[] = [];
  onFall?: (bear: Bear) => void;

  constructor(private random = Math.random) {
    for (let i = 0; i < RULES.maxBears; i++) this.bears.push(this.makeBear(i, null));
    this.resetTiles();
    this.layout();
  }

  get stageInfo() { return STAGES[this.stage]; }
  bySlotPlayer(id: string) { return this.bears.find(b => b.playerId === id); }

  private makeBear(slot: number, player: Player | null): Bear {
    return {
      slot, playerId: player?.id ?? null, name: player?.name ?? AI_NAMES[slot], color: BEAR_COLORS[slot],
      cls: CLASSES[slot % CLASSES.length].id, x: 0, y: 0, vx: 0, vy: 0, face: 0, input: null,
      alive: true, fallT: 0, fallVx: 0, fallVy: 0, dashT: 0, stamina: 100, stun: 0, power: 0, wins: 0,
      ready: false, knocks: 0, lastHitBy: -1, lastHitT: -9, walk: 0,
      ai: { target: -1, think: 0, aim: 0, jitter: this.random() },
    };
  }

  /** Seats a human in the first CPU slot. Returns false when all four bears are taken (spectator). */
  addPlayer(player: Player) {
    if (this.bySlotPlayer(player.id)) return true;
    const bear = this.bears.find(b => !b.playerId);
    if (!bear) return false;
    bear.playerId = player.id; bear.name = player.name; bear.ready = false; bear.input = null;
    return true;
  }
  removePlayer(id: string) {
    const bear = this.bySlotPlayer(id);
    if (!bear) return;
    bear.playerId = null; bear.name = AI_NAMES[bear.slot]; bear.input = null; bear.ready = false;
  }
  humans() { return this.bears.filter(b => b.playerId); }

  setStage(i: number) { if (this.phase === "lobby") this.stage = (i + STAGES.length) % STAGES.length; }
  setClass(id: string, c: string) {
    const bear = this.bySlotPlayer(id);
    if (bear && this.phase === "lobby" && CLASSES.some(k => k.id === c)) bear.cls = c as ClassId;
  }
  toggleReady(id: string) {
    const bear = this.bySlotPlayer(id);
    if (!bear) return;
    if (this.phase === "lobby") { bear.ready = !bear.ready; this.maybeStart(); }
    else if (this.phase === "matchover" && this.timer <= 0) this.toLobby();
  }
  private maybeStart() {
    const h = this.humans();
    if (h.length && h.every(b => b.ready)) this.startMatch();
  }
  startMatch() {
    this.round = 0; this.champion = null;
    for (const b of this.bears) { b.wins = 0; b.knocks = 0; }
    this.startRound();
  }
  toLobby() {
    this.phase = "lobby"; this.champion = null; this.roundWinner = null;
    for (const b of this.bears) b.ready = false;
    this.resetTiles(); this.layout(); this.fish = [];
  }

  steer(id: string, angle: number | null) { const b = this.bySlotPlayer(id); if (b) b.input = angle; }
  dash(id: string) {
    const b = this.bySlotPlayer(id);
    if (!b) return;
    if (this.phase === "lobby") return this.toggleReady(id);
    if (this.phase === "matchover") return this.toggleReady(id);
    this.tryDash(b);
  }

  private resetTiles() {
    this.tiles = Array.from({ length: RULES.tiles * RULES.tiles }, () => ({ alive: true, crack: 0 }));
  }
  private layout() {
    // Bears start near the four corners facing the middle, like the original.
    const d = HALF * 0.55;
    const spots = [[-d, -d], [d, -d], [-d, d], [d, d]];
    this.bears.forEach((b, i) => {
      Object.assign(b, { x: spots[i][0], y: spots[i][1], vx: 0, vy: 0, alive: true, fallT: 0, dashT: 0,
        stamina: 100, stun: 0, power: 0, lastHitBy: -1, input: b.playerId ? b.input : null });
      b.face = Math.atan2(-b.y, -b.x);
    });
  }

  private startRound() {
    this.round++; this.resetTiles(); this.layout();
    this.fish = []; this.fishT = RULES.fishEvery * 0.6;
    this.tiltX = this.tiltY = 0; this.meltT = 0; this.suddenDeath = false;
    this.beam = { x: -HALF, y: -HALF, a: 0, on: false };
    this.clock = RULES.roundTime; this.roundWinner = null;
    this.phase = "intro"; this.timer = 1.6;
  }

  tileAt(x: number, y: number) {
    const tx = Math.floor((x + HALF) / RULES.tile), ty = Math.floor((y + HALF) / RULES.tile);
    if (tx < 0 || ty < 0 || tx >= RULES.tiles || ty >= RULES.tiles) return null;
    return this.tiles[ty * RULES.tiles + tx];
  }
  solid(x: number, y: number) { const t = this.tileAt(x, y); return !!t && t.alive; }

  private tryDash(b: Bear) {
    if (this.phase !== "playing" || !b.alive || b.dashT > 0 || b.stun > 0.15 || b.stamina < RULES.dashCost) return;
    const c = cls(b.cls);
    if (b.input !== null) b.face = b.input;
    b.stamina -= RULES.dashCost;
    b.dashT = RULES.dashTime;
    const s = RULES.dashSpeed * (0.85 + c.speed * 0.15) * (b.power > 0 ? 1.15 : 1);
    b.vx = Math.cos(b.face) * s; b.vy = Math.sin(b.face) * s;
    this.puff(b.x - Math.cos(b.face) * 20, b.y - Math.sin(b.face) * 20, 7, "#e8f6ff", 60);
  }

  private puff(x: number, y: number, n: number, color: string, speed: number, kind: Fx["kind"] = "snow") {
    for (let i = 0; i < n && this.fx.length < 500; i++) {
      const a = this.random() * Math.PI * 2, s = speed * (0.3 + this.random());
      this.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 40 + this.random() * 90, z: 2, life: 0.6, max: 0.6, color, size: 2 + this.random() * 3, kind });
    }
  }
  private log(text: string, color: string) {
    this.feed.unshift({ text, color, until: this.time + 4 }); this.feed = this.feed.slice(0, 4);
  }

  step(dt: number) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.feed = this.feed.filter(f => f.until > this.time);
    this.stepFx(dt);
    switch (this.phase) {
      case "lobby": this.stepLobby(dt); return;
      case "intro": if ((this.timer -= dt) <= 0) { this.phase = "countdown"; this.timer = 3; } return;
      case "countdown": if ((this.timer -= dt) <= 0) this.phase = "playing"; return;
      case "roundover":
        this.stepBears(dt, false);
        if ((this.timer -= dt) <= 0) {
          const champ = this.bears.find(b => b.wins >= RULES.winsNeeded);
          if (champ) { this.champion = champ.slot; this.phase = "matchover"; this.timer = 2; }
          else this.startRound();
        }
        return;
      case "matchover": this.timer -= dt; this.stepBears(dt, false); return;
      case "playing": this.stepPlay(dt);
    }
  }

  private stepLobby(dt: number) {
    // Idle CPU bears wander so the lobby floe feels alive; nobody can fall.
    for (const b of this.bears) {
      if (!b.playerId) {
        b.ai.think -= dt;
        if (b.ai.think <= 0) { b.ai.think = 1 + this.random() * 2; b.ai.aim = this.random() * Math.PI * 2; }
        const home = Math.hypot(b.x, b.y) > HALF * 0.6;
        b.input = home ? Math.atan2(-b.y, -b.x) : b.ai.aim;
      }
    }
    this.stepBears(dt, false);
    for (const b of this.bears) {
      b.x = Math.max(-HALF + 30, Math.min(HALF - 30, b.x)); b.y = Math.max(-HALF + 30, Math.min(HALF - 30, b.y));
    }
  }

  private stepPlay(dt: number) {
    const st = this.stageInfo;
    this.clock = Math.max(0, this.clock - dt);
    if (this.clock <= 0 && !this.suddenDeath) {
      this.suddenDeath = true; this.log("SUDDEN DEATH — the floe is melting!", "#ff8a65");
    }
    for (const b of this.bears) if (!b.playerId && b.alive) this.think(b, dt);
    if (st.tilt) this.stepTilt(dt);
    if (st.melt || this.suddenDeath) this.stepMelt(dt, this.suddenDeath && !st.melt ? 2.2 : 1);
    this.stepTiles(dt);
    this.stepFish(dt);
    this.stepBears(dt, true);

    const alive = this.bears.filter(b => b.alive);
    if (alive.length <= 1) {
      const w = alive[0];
      this.roundWinner = w ? w.slot : null;
      if (w) { w.wins++; this.log(`${w.name} wins round ${this.round}!`, w.color); }
      this.phase = "roundover"; this.timer = 3;
    }
  }

  /** Tilt eases toward the bears' centre of mass; heavier classes tip it more. */
  private stepTilt(dt: number) {
    let mx = 0, my = 0, m = 0;
    for (const b of this.bears) if (b.alive) { const w = cls(b.cls).mass; mx += b.x * w; my += b.y * w; m += w; }
    const tx = m ? Math.max(-1, Math.min(1, (mx / m) / (HALF * 0.8))) : 0;
    const ty = m ? Math.max(-1, Math.min(1, (my / m) / (HALF * 0.8))) : 0;
    const k = 1 - Math.exp(-1.6 * dt);
    this.tiltX += (tx - this.tiltX) * k; this.tiltY += (ty - this.tiltY) * k;
  }

  /** The beam sweeps the floe edge spiralling inward, cracking tiles it touches. */
  private stepMelt(dt: number, rate: number) {
    this.meltT += dt * rate;
    if (this.meltT < 6 && !this.suddenDeath) { this.beam.on = false; return; }
    this.beam.on = true;
    const n = RULES.tiles;
    // Outer ring index grows over time; beam walks the perimeter of the current ring.
    const ring = Math.min(Math.floor((this.meltT - 6) / 11), Math.floor(n / 2) - 2);
    const lo = ring, hi = n - 1 - ring, side = hi - lo;
    const per = side * 4;
    const prog = (((this.meltT - 6) % 11) / 11) * per;
    const seg = Math.floor(prog / side), off = prog % side;
    let tx = lo, ty = lo;
    if (seg === 0) { tx = lo + off; ty = lo; } else if (seg === 1) { tx = hi; ty = lo + off; }
    else if (seg === 2) { tx = hi - off; ty = hi; } else { tx = lo; ty = hi - off; }
    const T = RULES.tile;
    const bx = -HALF + (tx + 0.5) * T, by = -HALF + (ty + 0.5) * T;
    const k = 1 - Math.exp(-10 * dt);
    this.beam.x += (bx - this.beam.x) * k; this.beam.y += (by - this.beam.y) * k;
    this.beam.a += dt * 6;
    const cx = Math.floor((this.beam.x + HALF) / T), cy = Math.floor((this.beam.y + HALF) / T);
    const t = this.tiles[cy * n + cx];
    if (t && t.alive && t.crack === 0) t.crack = 1.1;
  }

  private stepTiles(dt: number) {
    const n = RULES.tiles, T = RULES.tile;
    this.tiles.forEach((t, i) => {
      if (!t.alive || t.crack <= 0) return;
      t.crack -= dt;
      if (t.crack <= 0) {
        t.alive = false; t.crack = 0;
        const x = -HALF + ((i % n) + 0.5) * T, y = -HALF + (Math.floor(i / n) + 0.5) * T;
        this.puff(x, y, 6, "#bfe8ff", 70, "chip");
        this.ring(x, y, "#9fdcff");
      }
    });
  }
  private ring(x: number, y: number, color: string) {
    this.fx.push({ x, y, vx: 0, vy: 0, vz: 0, z: 0, life: 0.9, max: 0.9, color, size: 10, kind: "ring" });
  }

  private stepFish(dt: number) {
    this.fishT -= dt;
    if (this.fishT <= 0 && this.fish.length < 2) {
      this.fishT = RULES.fishEvery * (0.7 + this.random() * 0.6);
      for (let n = 0; n < 20; n++) {
        const x = (this.random() - 0.5) * HALF * 1.5, y = (this.random() - 0.5) * HALF * 1.5;
        if (this.solid(x, y) && this.bears.every(b => !b.alive || Math.hypot(b.x - x, b.y - y) > 90)) {
          this.fish.push({ x, y, life: RULES.fishLife, bob: this.random() * 6 }); break;
        }
      }
    }
    this.fish = this.fish.filter(f => {
      f.life -= dt; f.bob += dt * 4;
      if (f.life <= 0 || !this.solid(f.x, f.y)) return false;
      const eater = this.bears.find(b => b.alive && Math.hypot(b.x - f.x, b.y - f.y) < RULES.radius + 16);
      if (!eater) return true;
      eater.power = RULES.powerTime; eater.stamina = 100;
      this.puff(f.x, f.y, 12, "#ffd76a", 120, "spark");
      this.log(`${eater.name} ate a power fish!`, eater.color);
      return false;
    });
  }

  /** CPU: line up on the far side of a victim relative to the floe centre, then charge. */
  private think(b: Bear, dt: number) {
    const others = this.bears.filter(o => o !== b && o.alive);
    if (!others.length) { b.input = null; return; }
    b.ai.think -= dt;
    if (b.ai.think <= 0 || !this.bears[b.ai.target]?.alive || b.ai.target === b.slot) {
      b.ai.think = 0.6 + this.random() * 0.8;
      // Prefer opponents who are close to us and close to the water.
      let best = others[0], score = -Infinity;
      for (const o of others) {
        const edge = this.edgeDistance(o.x, o.y);
        const s = -Math.hypot(o.x - b.x, o.y - b.y) * 0.6 - edge * 1.2 + (o.playerId ? 40 : 0) + this.random() * 60;
        if (s > score) { score = s; best = o; }
      }
      b.ai.target = best.slot;
    }
    const t = this.bears[b.ai.target];
    // Danger: steer back to safe ice first.
    const myEdge = this.edgeDistance(b.x, b.y);
    const [sx, sy] = this.safest(b.x, b.y);
    if (myEdge < 70 || b.stun > 0) { b.input = Math.atan2(sy - b.y, sx - b.x); return; }
    // Approach from the "inside" so the push sends the target outward.
    const out = Math.atan2(t.y - sy, t.x - sx);
    const px = t.x - Math.cos(out) * 70, py = t.y - Math.sin(out) * 70;
    const dPos = Math.hypot(px - b.x, py - b.y);
    const toT = Math.atan2(t.y - b.y, t.x - b.x);
    b.input = dPos > 40 ? Math.atan2(py - b.y, px - b.x) : toT;
    const dist = Math.hypot(t.x - b.x, t.y - b.y);
    const aimErr = Math.abs(Math.atan2(Math.sin(toT - b.face), Math.cos(toT - b.face)));
    if (dist < 130 && aimErr < 0.25 && b.stamina > RULES.dashCost + 20 && this.random() < dt * (0.35 + b.ai.jitter * 0.6)) {
      b.input = toT; this.tryDash(b);
    }
  }
  private edgeDistance(x: number, y: number) {
    // Approximate distance to water by sampling rings around the point.
    for (let r = 20; r <= 200; r += 20) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (!this.solid(x + Math.cos(a) * r, y + Math.sin(a) * r)) return r;
      }
    }
    return 200;
  }
  private safest(x: number, y: number): [number, number] {
    let best: [number, number] = [0, 0], d = Infinity;
    const n = RULES.tiles, T = RULES.tile;
    // Centre of mass of intact tiles that are not cracking.
    let cx = 0, cy = 0, c = 0;
    this.tiles.forEach((t, i) => { if (t.alive && !t.crack) { cx += (i % n) - n / 2 + 0.5; cy += Math.floor(i / n) - n / 2 + 0.5; c++; } });
    if (c) best = [(cx / c) * T, (cy / c) * T];
    if (!this.solid(best[0], best[1])) {
      this.tiles.forEach((t, i) => {
        if (!t.alive || t.crack) return;
        const tx = -HALF + ((i % n) + 0.5) * T, ty = -HALF + (Math.floor(i / n) + 0.5) * T;
        const dd = (tx - x) ** 2 + (ty - y) ** 2;
        if (dd < d) { d = dd; best = [tx, ty]; }
      });
    }
    return best;
  }

  private stepBears(dt: number, live: boolean) {
    const st = this.stageInfo;
    for (const b of this.bears) {
      if (!b.alive) {
        b.fallT += dt; b.x += b.fallVx * dt; b.y += b.fallVy * dt; b.fallVx *= 0.9; b.fallVy *= 0.9;
        continue;
      }
      const c = cls(b.cls);
      b.stamina = Math.min(100, b.stamina + RULES.regen * c.regen * dt * (b.power > 0 ? 1.6 : 1));
      b.power = Math.max(0, b.power - dt);
      b.stun = Math.max(0, b.stun - dt * c.recover);
      b.dashT = Math.max(0, b.dashT - dt);
      const control = b.stun > 0 ? 0.15 : 1;
      if (b.input !== null && b.dashT <= 0) {
        // Turn quickly but not instantly, which makes lining up a charge a skill.
        const diff = Math.atan2(Math.sin(b.input - b.face), Math.cos(b.input - b.face));
        b.face += Math.max(-10 * dt, Math.min(10 * dt, diff));
        const a = RULES.accel * c.speed * control * (b.power > 0 ? 1.1 : 1);
        b.vx += Math.cos(b.input) * a * dt; b.vy += Math.sin(b.input) * a * dt;
      }
      if (live && st.tilt) {
        const g = 140; b.vx += this.tiltX * g * dt; b.vy += this.tiltY * g * dt;
      }
      // Ice is slippery: low drag while sliding from a hit or dash, higher drag while walking.
      const drag = b.dashT > 0 ? 0.4 : b.stun > 0 ? RULES.slideDrag : b.input === null ? RULES.slideDrag * 1.4 : RULES.drag;
      const f = Math.exp(-drag * dt);
      b.vx *= f; b.vy *= f;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const sp = Math.hypot(b.vx, b.vy);
      b.walk += sp * dt * 0.06;
      if (b.dashT > 0 && this.random() < 0.6) this.fx.push({ x: b.x - Math.cos(b.face) * 22, y: b.y - Math.sin(b.face) * 22, vx: -b.vx * 0.1, vy: -b.vy * 0.1, vz: 30, z: 2, life: 0.45, max: 0.45, color: "#ffffff", size: 3 + this.random() * 3, kind: "snow" });
    }
    this.collide();
    if (!live) return;
    for (const b of this.bears) {
      if (!b.alive || this.solid(b.x, b.y)) continue;
      b.alive = false; b.fallT = 0; b.fallVx = b.vx * 0.5; b.fallVy = b.vy * 0.5;
      b.dashT = 0; b.input = b.playerId ? b.input : null;
      const killer = b.lastHitBy >= 0 && this.time - b.lastHitT < 2.5 ? this.bears[b.lastHitBy] : null;
      if (killer && killer !== b) killer.knocks++;
      this.log(killer && killer !== b ? `${killer.name} pushed ${b.name} into the sea!` : `${b.name} fell in!`, b.color);
      this.splash(b.x, b.y);
      this.onFall?.(b);
    }
  }

  private splash(x: number, y: number) {
    this.shake = Math.max(this.shake, 0.6);
    this.ring(x, y, "#ffffff");
    for (let i = 0; i < 26 && this.fx.length < 500; i++) {
      const a = this.random() * Math.PI * 2, s = 30 + this.random() * 110;
      this.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 160 + this.random() * 220, z: 0, life: 1, max: 1, color: this.random() < 0.5 ? "#ffffff" : "#8fd6ff", size: 2 + this.random() * 4, kind: "splash" });
    }
  }

  /** Mass-weighted impulse; a charging bear adds a big shove and stuns its victim. */
  private collide() {
    const R = RULES.radius;
    for (let i = 0; i < this.bears.length; i++) for (let j = i + 1; j < this.bears.length; j++) {
      const a = this.bears[i], b = this.bears[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= R * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      const ca = cls(a.cls), cb = cls(b.cls);
      const ma = ca.mass * (a.power > 0 ? 2 : 1), mb = cb.mass * (b.power > 0 ? 2 : 1);
      const over = R * 2 - d;
      a.x -= nx * over * (mb / (ma + mb)); a.y -= ny * over * (mb / (ma + mb));
      b.x += nx * over * (ma / (ma + mb)); b.y += ny * over * (ma / (ma + mb));
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      const aHit = a.dashT > 0 && (a.vx * nx + a.vy * ny) > 0;
      const bHit = b.dashT > 0 && (b.vx * -nx + b.vy * -ny) > 0;
      // Charges are mostly the shove below; plain bumps stay springy.
      const e = aHit || bHit ? 0.15 : 0.7;
      const jImp = ((1 + e) * rel) / (1 / ma + 1 / mb);
      a.vx -= (jImp / ma) * nx; a.vy -= (jImp / ma) * ny;
      b.vx += (jImp / mb) * nx; b.vy += (jImp / mb) * ny;
      const shove = (atk: Bear, vic: Bear, sign: number, k: typeof ca, mv: number) => {
        const p = 150 * k.push * (atk.power > 0 ? 1.6 : 1) / mv;
        vic.vx += nx * sign * p; vic.vy += ny * sign * p;
        vic.stun = RULES.hitStun * (atk.power > 0 ? 1.4 : 1); vic.dashT = 0;
        vic.lastHitBy = atk.slot; vic.lastHitT = this.time;
        atk.vx *= 0.35; atk.vy *= 0.35; atk.dashT = 0;
      };
      if (aHit) shove(a, b, 1, ca, mb);
      if (bHit) shove(b, a, -1, cb, ma);
      if (!aHit && !bHit) {
        if (rel > 60) { b.lastHitBy = a.slot; b.lastHitT = this.time; a.lastHitBy = b.slot; a.lastHitT = this.time; }
      }
      if (aHit || bHit) {
        this.shake = Math.max(this.shake, aHit && bHit ? 0.5 : 0.3);
        this.puff(a.x + nx * R, a.y + ny * R, 10, "#ffffff", 140, "spark");
      }
    }
  }

  private stepFx(dt: number) {
    // Light snowfall over the whole scene.
    if (this.random() < dt * 30) this.fx.push({ x: (this.random() - 0.5) * HALF * 4, y: (this.random() - 0.5) * HALF * 3, vx: -10 + this.random() * 20, vy: 10, vz: -25, z: 260, life: 10, max: 10, color: "#ffffff", size: 1 + this.random() * 2, kind: "snow" });
    this.fx = this.fx.filter(p => {
      p.life -= dt;
      if (p.kind === "ring") return p.life > 0;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind !== "snow" || p.max < 5) { p.vz -= 520 * dt; p.vx *= 0.97; p.vy *= 0.97; }
      if (p.z < 0) { if (p.kind === "snow" && p.max > 5) return false; p.z = 0; p.vz = 0; p.vx *= 0.6; p.vy *= 0.6; }
      return p.life > 0;
    });
  }

  /** Per-player phone telemetry. */
  status(id: string) {
    const b = this.bySlotPlayer(id);
    return {
      playerId: id, phase: this.phase, stage: this.stageInfo.name, round: this.round, clock: Math.ceil(this.clock),
      seated: !!b, slot: b?.slot ?? -1, color: b?.color ?? "#888", cls: b?.cls ?? "allround",
      alive: b?.alive ?? false, stamina: Math.round(b?.stamina ?? 0), power: (b?.power ?? 0) > 0,
      wins: b?.wins ?? 0, ready: b?.ready ?? false, countdown: Math.ceil(this.timer),
      roundWinner: this.roundWinner !== null ? this.bears[this.roundWinner].name : null,
      champion: this.champion !== null ? this.bears[this.champion].name : null,
      isChampion: this.champion !== null && this.bears[this.champion].playerId === id,
      canRematch: this.phase === "matchover" && this.timer <= 0,
    };
  }
}
