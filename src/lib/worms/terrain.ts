// Destructible bitmap terrain. The mask is the physics truth; the canvas is its painted twin.

export const W = 2560;
export const H = 1280;

type RGB = [number, number, number];

export interface Theme {
  id: string; name: string; blurb: string;
  sky: [string, string, string];       // top, middle, horizon
  far: [string, string];               // distant mountain layers
  top: RGB; topDeep: RGB; edge: RGB;   // surface crust
  soilA: RGB; soilB: RGB; speck: RGB;  // body of the land
  scorch: string;
  water: [string, string, string];     // surface, body, deep
  liquid: string;                      // what you drown in
  ambient: "pollen" | "snow" | "embers" | "sprinkles";
  sun: string;
}

export const THEMES: Theme[] = [
  {
    id: "meadow", name: "Green Acres", blurb: "Rolling hills, tall trees, a lazy ocean.",
    sky: ["#3f86d6", "#86c3f0", "#d9f0ff"], far: ["#7fa7cf", "#5e86ad"],
    top: [140, 220, 86], topDeep: [84, 165, 58], edge: [46, 104, 34],
    soilA: [146, 98, 60], soilB: [110, 70, 42], speck: [176, 140, 98],
    scorch: "rgba(40,24,14,0.85)", water: ["#5fb3f0", "#2a6fb8", "#123c72"], liquid: "the sea", ambient: "pollen", sun: "#fff6c8",
  },
  {
    id: "arctic", name: "Frostbite Ridge", blurb: "Slippery ice shelves over freezing water.",
    sky: ["#203a6b", "#5f86c4", "#cfe2f7"], far: ["#9fb9da", "#7d9bc3"],
    top: [250, 253, 255], topDeep: [204, 226, 247], edge: [140, 180, 222],
    soilA: [116, 168, 214], soilB: [78, 128, 186], speck: [196, 228, 250],
    scorch: "rgba(30,50,80,0.8)", water: ["#9fe0ff", "#3b86c4", "#16406e"], liquid: "the icy water", ambient: "snow", sun: "#eaf6ff",
  },
  {
    id: "inferno", name: "Brimstone Pit", blurb: "Obsidian crags above a lake of lava.",
    sky: ["#1a0610", "#4a1220", "#a8381c"], far: ["#3a1418", "#260c10"],
    top: [255, 138, 52], topDeep: [190, 70, 30], edge: [96, 26, 18],
    soilA: [64, 34, 38], soilB: [38, 20, 26], speck: [120, 60, 50],
    scorch: "rgba(10,4,4,0.9)", water: ["#ffcf4a", "#ff6a1a", "#b02008"], liquid: "the lava", ambient: "embers", sun: "#ff9a4a",
  },
  {
    id: "candy", name: "Sugar Rush", blurb: "Chocolate cliffs frosted with pink icing.",
    sky: ["#7a4fd0", "#e48cd8", "#ffd6ec"], far: ["#f0a8d8", "#c97fc4"],
    top: [255, 182, 222], topDeep: [244, 128, 186], edge: [170, 60, 120],
    soilA: [128, 74, 50], soilB: [94, 52, 34], speck: [255, 240, 120],
    scorch: "rgba(40,16,8,0.85)", water: ["#ffb3e0", "#d264b0", "#7a2a74"], liquid: "the syrup", ambient: "sprinkles", sun: "#fff0fa",
  },
];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Noise {
  private p = new Uint8Array(512);
  private v = new Float32Array(256);
  constructor(rnd: () => number) {
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    for (let i = 0; i < 256; i++) this.v[i] = rnd();
  }
  private h(x: number, y: number) { return this.v[this.p[(this.p[x & 255] + y) & 255]]; }
  n2(x: number, y: number) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = this.h(xi, yi), b = this.h(xi + 1, yi), c = this.h(xi, yi + 1), d = this.h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  fbm(x: number, y: number, oct = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += this.n2(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  }
}

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Terrain {
  mask = new Uint8Array(W * H);
  canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  version = 0; // bumps on every carve so caches can refresh
  theme: Theme;
  seed: number;

  constructor(theme: Theme, seed: number, paint = true) {
    this.theme = theme; this.seed = seed;
    const rnd = mulberry32(seed);
    this.shape(rnd);
    if (paint && typeof document !== "undefined") {
      this.canvas = document.createElement("canvas");
      this.canvas.width = W; this.canvas.height = H;
      this.ctx = this.canvas.getContext("2d");
      this.paint(mulberry32(seed ^ 0x9e3779b9));
      this.decorate(mulberry32(seed ^ 0x51ed270b));
    }
  }

  // ── Generation ────────────────────────────────────────────────────────────
  private shape(rnd: () => number) {
    const n = new Noise(rnd);
    const islands = rnd() < 0.5;
    const off = rnd() * 1000;
    const surface = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let h = 0.55 * n.fbm(off + x * 0.0016, 3.1, 3) + 0.3 * n.fbm(off + x * 0.006, 7.7, 3) + 0.15 * n.fbm(off + x * 0.03, 1.3, 2);
      h = (h - 0.3) / 0.5;
      const edge = smooth(0.0, 0.1, u) * smooth(1.0, 0.9, u);
      if (islands) {
        // carve 2–3 sea gaps between land masses
        const g = Math.sin(u * Math.PI * (2.2 + n.n2(off, 9) * 1.4) + off) * 0.5 + 0.5;
        h *= 0.35 + 0.9 * smooth(0.12, 0.45, g);
      }
      surface[x] = H - (90 + Math.max(0, h) * H * 0.62) * (0.15 + 0.85 * edge);
    }
    const m = this.mask;
    for (let x = 0; x < W; x++) {
      const s = surface[x];
      for (let y = Math.max(0, Math.floor(s)); y < H; y++) {
        const depth = y - s;
        const c = n.fbm(x * 0.006 + 50, y * 0.009 + 50, 3);
        const cave = depth > 40 && c > 0.64 - Math.min(0.06, depth / 4000);
        if (!cave) m[y * W + x] = 1;
      }
    }
    // Floating islands give vertical play.
    const floats = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < floats; i++) {
      const cx = W * (0.15 + rnd() * 0.7), cy = 220 + rnd() * 320, rx = 90 + rnd() * 150, ry = 26 + rnd() * 30;
      for (let y = Math.floor(cy - ry * 2); y < cy + ry * 2.2; y++) for (let x = Math.floor(cx - rx * 1.3); x < cx + rx * 1.3; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const dx = (x - cx) / rx, dy = (y - cy) / (y < cy ? ry * 0.6 : ry * 1.8);
        const wob = n.n2(x * 0.03, y * 0.03) * 0.5;
        if (dx * dx + dy * dy < 1 - wob * 0.6) m[y * W + x] = 1;
      }
    }
  }

  private paint(rnd: () => number) {
    const ctx = this.ctx!, t = this.theme, m = this.mask;
    const img = ctx.createImageData(W, H), d = img.data;
    const n = new Noise(rnd);
    for (let x = 0; x < W; x++) {
      let depth = 0;
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (!m[i]) { depth = 0; continue; }
        depth++;
        let c: RGB;
        const k = i * 4;
        if (depth < 5) c = t.top;
        else if (depth < 11) c = mix(t.top, t.topDeep, (depth - 5) / 6);
        else if (depth < 14) c = t.edge;
        else {
          const g = n.fbm(x * 0.012, y * 0.02, 3);
          const strata = Math.sin(y * 0.09 + n.n2(x * 0.01, y * 0.005) * 6) * 0.5 + 0.5;
          c = mix(t.soilA, t.soilB, Math.min(1, g * 0.9 + strata * 0.35));
          const grain = (rnd() - 0.5) * 18;
          c = [c[0] + grain, c[1] + grain, c[2] + grain];
          if (rnd() < 0.004) c = t.speck;
          const shade = 1 - Math.min(0.25, depth / 2200);
          c = [c[0] * shade, c[1] * shade, c[2] * shade];
        }
        // Underside rim darkening for overhangs.
        if (y + 3 < H && (!m[i + W] || !m[i + W * 2] || !m[i + W * 3]) && depth > 4) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6];
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
    }
    // Side rims too (1-px darker outline left/right of air).
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (m[i] && (!m[i - 1] || !m[i + 1])) { const k = i * 4; d[k] *= 0.75; d[k + 1] *= 0.75; d[k + 2] *= 0.75; }
    }
    ctx.putImageData(img, 0, 0);
    // Grass tufts / icicles / drips on the surface.
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (let x = 0; x < W; x += 3) {
      for (let y = 1; y < H; y++) {
        if (m[y * W + x] && !m[(y - 1) * W + x]) {
          const hgt = 3 + rnd() * 7;
          if (t.id === "meadow" || t.id === "candy") {
            ctx.strokeStyle = rgb(mix(t.top, [255, 255, 255], rnd() * 0.25));
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + (rnd() - 0.5) * 4, y - hgt * 0.5, x + (rnd() - 0.5) * 5, y - hgt); ctx.stroke();
          } else if (t.id === "inferno" && rnd() < 0.08) {
            ctx.fillStyle = "rgba(255,200,80,0.9)"; ctx.fillRect(x, y, 1.5, 1.5);
          }
        }
        // underside drips
        if (m[y * W + x] && y + 1 < H && !m[(y + 1) * W + x] && rnd() < 0.06) {
          const len = 3 + rnd() * (t.id === "arctic" ? 14 : 6);
          ctx.fillStyle = t.id === "arctic" ? "rgba(225,245,255,0.9)" : t.id === "candy" ? rgb(t.top) : t.id === "inferno" ? "rgba(255,120,40,0.8)" : rgb(t.soilB);
          ctx.beginPath(); ctx.moveTo(x - 1.5, y); ctx.lineTo(x + 1.5, y); ctx.lineTo(x, y + len); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  private stamp(points: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, x1); x++) if (points(x, y)) this.mask[y * W + x] = 1;
  }
  private disc(cx: number, cy: number, r: number, fill: string | CanvasGradient) {
    this.stamp((x, y) => (x - cx) ** 2 + (y - cy) ** 2 < r * r, cx - r, cy - r, cx + r + 1, cy + r + 1);
    const c = this.ctx!; c.fillStyle = fill; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  }
  private box(x: number, y: number, w: number, h: number, fill: string) {
    this.stamp(() => true, x, y, x + w, y + h);
    const c = this.ctx!; c.fillStyle = fill; c.fillRect(x, y, w, h);
  }
  private tri(x: number, y: number, w: number, h: number, fill: string) {
    this.stamp((px, py) => { const f = (y - py) / h; return f >= 0 && f <= 1 && Math.abs(px - x) < (w / 2) * (1 - f); }, x - w / 2, y - h, x + w / 2 + 1, y + 1);
    const c = this.ctx!; c.fillStyle = fill; c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x + w / 2, y); c.lineTo(x, y - h); c.closePath(); c.fill();
  }

  surfaceY(x: number) { for (let y = 0; y < H; y++) if (this.mask[y * W + Math.floor(x)]) return y; return H; }

  private decorate(rnd: () => number) {
    const c = this.ctx!, t = this.theme;
    const count = 14 + Math.floor(rnd() * 8);
    for (let i = 0; i < count; i++) {
      const x = 80 + rnd() * (W - 160), y = this.surfaceY(x);
      if (y > H - 120 || Math.abs(this.surfaceY(x - 14) - this.surfaceY(x + 14)) > 12) continue;
      const s = 0.7 + rnd() * 0.7, base = y + 4;
      c.save();
      if (t.id === "meadow") {
        if (rnd() < 0.7) {
          this.box(x - 4 * s, base - 46 * s, 8 * s, 48 * s, "#6b4426");
          const g = c.createRadialGradient(x - 10 * s, base - 70 * s, 4, x, base - 60 * s, 40 * s);
          g.addColorStop(0, "#8be06a"); g.addColorStop(1, "#2f7d2c");
          this.disc(x, base - 62 * s, 24 * s, g); this.disc(x - 18 * s, base - 50 * s, 16 * s, g); this.disc(x + 18 * s, base - 52 * s, 17 * s, g); this.disc(x + 4 * s, base - 82 * s, 15 * s, g);
        } else { this.disc(x, base - 6 * s, 12 * s, "#8e8e8a"); this.disc(x + 8 * s, base - 4 * s, 8 * s, "#a8a8a2"); }
      } else if (t.id === "arctic") {
        if (rnd() < 0.5) {
          this.disc(x, base - 14 * s, 15 * s, "#f4fbff"); this.disc(x, base - 38 * s, 11 * s, "#ffffff");
          c.fillStyle = "#222"; c.fillRect(x - 4 * s, base - 41 * s, 2 * s, 2 * s); c.fillRect(x + 2 * s, base - 41 * s, 2 * s, 2 * s);
          c.fillStyle = "#ff8a2a"; c.beginPath(); c.moveTo(x, base - 38 * s); c.lineTo(x + 9 * s, base - 37 * s); c.lineTo(x, base - 35 * s); c.fill();
        } else for (let k = -1; k <= 1; k++) this.tri(x + k * 12 * s, base, 12 * s, (34 + k * k * -12 + rnd() * 18) * s, k ? "#bfe6ff" : "#e8f7ff");
      } else if (t.id === "inferno") {
        for (let k = -1; k <= 1; k++) this.tri(x + k * 10 * s, base, 14 * s, (40 - Math.abs(k) * 14 + rnd() * 20) * s, k ? "#2a1418" : "#3d1a1e");
        c.fillStyle = "rgba(255,110,30,0.7)"; c.fillRect(x - 1, base - 30 * s, 2, 26 * s);
      } else {
        if (rnd() < 0.6) {
          this.box(x - 2.5 * s, base - 50 * s, 5 * s, 52 * s, "#fff5ea");
          const cols = ["#ff5fa2", "#ffd84a", "#6ad0ff", "#9cf07a"];
          this.disc(x, base - 62 * s, 18 * s, cols[Math.floor(rnd() * 4)]);
          c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = 3 * s; c.beginPath();
          for (let a = 0; a < 12; a += 0.2) c.lineTo(x + Math.cos(a) * a * 1.4 * s, base - 62 * s + Math.sin(a) * a * 1.4 * s);
          c.stroke();
        } else { this.disc(x, base - 8 * s, 13 * s, ["#ff6f91", "#7ce0c3", "#ffcf5a"][Math.floor(rnd() * 3)]); }
      }
      c.restore();
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  solid(x: number, y: number) {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return false;
    return this.mask[yi * W + xi] === 1;
  }
  circleFree(x: number, y: number, r: number) {
    if (this.solid(x, y)) return false;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (this.solid(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      if (this.solid(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5)) return false;
    }
    return true;
  }
  /** Outward surface normal around a point, from the balance of nearby solid pixels. */
  normalAt(x: number, y: number, r = 5) {
    let nx = 0, ny = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      if (this.solid(x + dx, y + dy)) { nx -= dx; ny -= dy; }
    }
    const l = Math.hypot(nx, ny);
    return l < 1e-6 ? { x: 0, y: -1 } : { x: nx / l, y: ny / l };
  }
  /** First solid pixel along a segment, or null. */
  raycast(x0: number, y0: number, dx: number, dy: number, maxLen: number) {
    for (let d = 0; d < maxLen; d += 1.5) { const x = x0 + dx * d, y = y0 + dy * d; if (this.solid(x, y)) return { x, y, d }; }
    return null;
  }

  // ── Destruction ───────────────────────────────────────────────────────────
  carve(cx: number, cy: number, r: number) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    let removed = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const i = y * W + x; if (this.mask[i]) { this.mask[i] = 0; removed++; } }
    }
    const c = this.ctx;
    if (c && removed) {
      c.save();
      c.globalCompositeOperation = "source-atop";
      const g = c.createRadialGradient(cx, cy, r * 0.8, cx, cy, r + 9);
      g.addColorStop(0, this.theme.scorch); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r + 9, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = "destination-out";
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    if (removed) this.version++;
    return removed;
  }

}

function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function rgb(c: RGB) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
