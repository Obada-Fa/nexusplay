import type { Player, Point, SnakeState } from "../../types/socket";

export const RULES = { radius: 10, spacing: 5, initialLength: 26, maxLength: 240, speed: 112, boostSpeed: 205, duration: 180, shield: 2.5 };
export type Orb = Point & { color: string; value: number; phase: number };
export type Spark = Point & { vx: number; vy: number; life: number; color: string };
export type Phase = "waiting" | "countdown" | "playing" | "finished";
const colors = ["#66f5c1", "#a78bfa", "#ffbd69", "#69caff", "#ff7ca9"];
const distance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export function createSnake(player: Player): SnakeState {
  return { player, segments: [{ x: 0, y: 0 }], angle: 0, targetAngle: 0, targetLength: RULES.initialLength,
    isBoosting: false, score: 0, isDead: false, shield: 0, kills: 0, bank: 0, respawnAt: 0, boostTrail: 0 };
}

/** Host-authoritative simulation. All units are world units/seconds, independent of the canvas. */
export class SlitherEngine {
  width = 1200;
  height = 750;
  time = 0;
  remaining = RULES.duration;
  countdown = 3;
  phase: Phase = "waiting";
  food: Orb[] = [];
  particles: Spark[] = [];
  feed: { text: string; color: string; until: number }[] = [];
  onDeath?: (snake: SnakeState) => void;
  constructor(public snakes: Map<string, SnakeState>, private random = Math.random) {}

  reset() {
    const extra = Math.max(0, this.snakes.size - 4);
    this.width = 1200 + extra * 100;
    this.height = 750 + extra * 62.5;
    this.time = 0; this.remaining = RULES.duration; this.countdown = 3;
    this.phase = this.snakes.size ? "countdown" : "waiting";
    this.food = []; this.particles = []; this.feed = [];
    for (const snake of this.snakes.values()) {
      snake.bank = 0; snake.kills = 0;
      this.spawn(snake);
    }
    this.replenish();
  }

  spawn(snake: SnakeState) {
    // Late arrivals may expand the arena, but never move existing players or shrink a live round.
    const extra = Math.max(0, this.snakes.size - 4);
    this.width = Math.max(this.width, 1200 + extra * 100);
    this.height = Math.max(this.height, 750 + extra * 62.5);
    // Sample clear positions away from heads and bodies, then grant a visible shield.
    let best = { x: this.width / 2, y: this.height / 2 }, clearance = -1;
    for (let n = 0; n < 40; n++) {
      const p = { x: 160 + this.random() * (this.width - 320), y: 140 + this.random() * (this.height - 280) };
      let nearest = Infinity;
      for (const other of this.snakes.values()) {
        if (other === snake || other.isDead) continue;
        for (let i = 0; i < other.segments.length; i += 3) nearest = Math.min(nearest, distance(p, other.segments[i]));
      }
      if (nearest > clearance) { best = p; clearance = nearest; }
      if (clearance > 180 ** 2) break;
    }
    const angle = Math.atan2(this.height / 2 - best.y, this.width / 2 - best.x);
    Object.assign(snake, { angle, targetAngle: angle, targetLength: RULES.initialLength, score: 0,
      isDead: false, isBoosting: false, shield: RULES.shield, boostTrail: 0 });
    snake.segments = Array.from({ length: RULES.initialLength }, (_, i) => ({
      x: best.x - Math.cos(angle) * i * RULES.spacing, y: best.y - Math.sin(angle) * i * RULES.spacing,
    }));
  }

  respawn(id: string) {
    const snake = this.snakes.get(id);
    if (snake?.isDead && this.phase === "playing" && this.time >= snake.respawnAt) this.spawn(snake);
  }

  addOrb(p: Point, color: string, value: number) {
    if (this.food.length >= 650) return;
    this.food.push({ x: Math.max(20, Math.min(this.width - 20, p.x)), y: Math.max(20, Math.min(this.height - 20, p.y)), color, value, phase: this.random() * Math.PI * 2 });
  }
  replenish() {
    const target = 180 + Math.max(0, this.snakes.size - 4) * 25;
    while (this.food.length < target) {
      const gold = this.random() < 0.07;
      this.addOrb({ x: 35 + this.random() * (this.width - 70), y: 35 + this.random() * (this.height - 70) }, gold ? "#ffe39a" : colors[Math.floor(this.random() * colors.length)], gold ? 5 : 1);
    }
  }
  burst(p: Point, color: string, count: number) {
    for (let i = 0; i < count && this.particles.length < 300; i++) {
      const a = this.random() * Math.PI * 2, speed = 20 + this.random() * 100;
      this.particles.push({ ...p, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.7, color });
    }
  }
  rankings() {
    return [...this.snakes.values()].sort((a, b) => b.bank - a.bank || b.kills - a.kills || b.score - a.score);
  }
  step(dt: number) {
    this.time += dt;
    this.particles = this.particles.filter(p => {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life > 0;
    });
    this.feed = this.feed.filter(f => f.until > this.time);
    if (this.phase === "waiting") {
      if (this.snakes.size) this.reset();
      return;
    }
    if (this.phase === "finished") return;
    if (!this.snakes.size) { this.phase = "waiting"; return; }
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = "playing";
      return;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining <= 0) { this.phase = "finished"; return; }
    const alive = [...this.snakes.values()].filter(s => !s.isDead);
    for (const s of alive) {
      s.shield = Math.max(0, s.shield - dt);
      const diff = Math.atan2(Math.sin(s.targetAngle - s.angle), Math.cos(s.targetAngle - s.angle));
      s.angle += Math.max(-3.8 * dt, Math.min(3.8 * dt, diff));
      const boost = s.isBoosting && s.targetLength > RULES.initialLength + 1;
      if (boost) {
        s.targetLength = Math.max(RULES.initialLength, s.targetLength - 6 * dt);
        s.boostTrail += dt;
        if (s.boostTrail > 0.16) {
          s.boostTrail = 0;
          this.addOrb(s.segments[s.segments.length - 1], s.player.color, 1);
        }
      }
      const speed = boost ? RULES.boostSpeed : RULES.speed;
      const head = s.segments[0];
      head.x += Math.cos(s.angle) * speed * dt;
      head.y += Math.sin(s.angle) * speed * dt;
      const length = Math.floor(s.targetLength);
      while (s.segments.length < length) s.segments.push({ ...s.segments[s.segments.length - 1] });
      s.segments.length = length;
      for (let i = 1; i < length; i++) {
        const p = s.segments[i], prev = s.segments[i - 1];
        const d = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (d > RULES.spacing) {
          p.x = prev.x + (p.x - prev.x) / d * RULES.spacing;
          p.y = prev.y + (p.y - prev.y) / d * RULES.spacing;
        }
      }
      s.score = Math.max(0, Math.floor((s.targetLength - RULES.initialLength) * 5));
    }
    // Spatial buckets keep collision work bounded even with eight long snakes.
    const grid = new Map<string, { snake: SnakeState; point: Point; index: number }[]>();
    const cell = 32;
    for (const s of alive) {
      if (s.shield > 0) continue;
      s.segments.forEach((point, index) => {
        const key = `${Math.floor(point.x / cell)},${Math.floor(point.y / cell)}`;
        const bucket = grid.get(key) ?? [];
        bucket.push({ snake: s, point, index }); grid.set(key, bucket);
      });
    }
    // Resolve all deaths together so head-on hits and kills don't depend on join order.
    const deaths = new Map<SnakeState, SnakeState | null>();
    for (const s of alive) {
      const h = s.segments[0];
      if (h.x < RULES.radius || h.y < RULES.radius || h.x > this.width - RULES.radius || h.y > this.height - RULES.radius) {
        if (s.shield > 0) {
          h.x = Math.max(11, Math.min(this.width - 11, h.x)); h.y = Math.max(11, Math.min(this.height - 11, h.y));
          s.targetAngle = Math.atan2(this.height / 2 - h.y, this.width / 2 - h.x);
        } else deaths.set(s, null);
      }
      if (s.shield > 0) continue;
      const cx = Math.floor(h.x / cell), cy = Math.floor(h.y / cell);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        for (const hit of grid.get(`${x},${y}`) ?? []) {
          if (hit.snake === s || distance(h, hit.point) >= 18 ** 2) continue;
          deaths.set(s, hit.snake);
          if (hit.index < 3) deaths.set(hit.snake, s);
        }
      }
    }
    for (const [s, killer] of deaths) {
      s.isDead = true; s.isBoosting = false; s.respawnAt = this.time + 1.5;
      if (killer && !deaths.has(killer)) { killer.kills++; killer.bank += 100; }
      s.segments.forEach((p, i) => { if (i % 3 === 0) this.addOrb(p, s.player.color, 3); });
      this.burst(s.segments[0], s.player.color, 28);
      this.feed.unshift({ text: killer ? `${killer.player.name} cut off ${s.player.name}` : `${s.player.name} hit the edge`, color: s.player.color, until: this.time + 4 });
      this.feed = this.feed.slice(0, 3);
      this.onDeath?.(s);
    }
    for (const s of alive) {
      if (s.isDead) continue;
      for (let i = this.food.length - 1; i >= 0; i--) {
        const orb = this.food[i];
        if (distance(s.segments[0], orb) > 20 ** 2) continue;
        s.targetLength = Math.min(RULES.maxLength, s.targetLength + orb.value);
        s.bank += orb.value * 5;
        this.burst(orb, orb.color, orb.value > 1 ? 5 : 2);
        this.food.splice(i, 1);
      }
    }
    this.replenish();
  }
}
