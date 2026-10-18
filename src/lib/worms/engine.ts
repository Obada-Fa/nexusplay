import type { Player } from "../../types/socket";
import { Terrain, THEMES, W, H } from "./terrain";
import { WEAPON, WEAPONS, CRATE_POOL, startingAmmo, isWeapon, type WeaponId } from "./weapons";

// WormBlitz — turn-based artillery. Host-authoritative; world pixels / seconds, y points down.

export const PHYS = {
  g: 520, wind: 190, wormR: 8, walk: 56, jumpVx: 125, jumpVy: 235, flipVx: 55, flipVy: 345,
  maxPow: 930, charge: 1.15, aimSpeed: 1.5, cursor: 560, fallSafe: 400,
};
export const RULES = {
  maxTeams: 4, hp: 100, wormOptions: [2, 3, 4], timeOptions: [30, 45, 60],
  crateChance: 0.5, sdAfter: 14, sdRise: 26, mines: 7, barrels: 5,
};
export const TEAM_COLORS = ["#ff5d5d", "#4db8ff", "#ffd23f", "#5ee07a", "#c77dff", "#ff9f1c"];
const CPU_NAMES = ["The Crumbs", "Wormtroopers", "Dirt Devils", "Squishy Squad"];
const WORM_NAMES = [
  "Boggy", "Spadge", "Clagnut", "Chuckles", "Nobby", "Wiggles", "Grub", "Squirmy", "Noodle", "Dougal", "Pinky", "Sludge",
  "Bertie", "Mungo", "Twitch", "Gumbo", "Bogey", "Stumpy", "Tater", "Fizz", "Rumble", "Crusty", "Dingle", "Wobbles",
];

export type Key = "left" | "right" | "up" | "down" | "fire" | "jump" | "backflip";
export const KEYS: Key[] = ["left", "right", "up", "down", "fire", "jump", "backflip"];
export type Phase = "lobby" | "intro" | "turnstart" | "turn" | "retreat" | "settle" | "resolve" | "crate" | "gameover";
export type TeamKind = "human" | "cpu" | "keyboard";

export interface Body { x: number; y: number; vx: number; vy: number; grounded: boolean; stuck: number }
export interface Worm extends Body {
  id: number; team: number; name: string; face: 1 | -1; hp: number; shown: number; alive: boolean;
  state: "ok" | "dying" | "drowning" | "dead"; aim: number; walkT: number; walkAcc: number; blink: number;
  spin: number; hurtT: number; lastHitBy: number; drownT: number; landT: number; dieT: number; burnT: number; idle: number;
}
export interface Team {
  idx: number; name: string; color: string; playerId: string | null; kind: TeamKind; worms: Worm[];
  ammo: Record<WeaponId, number>; next: number; keys: Set<Key>; weapon: WeaponId; fuse: number;
  kills: number; dealt: number;
}
export type ProjKind = "rocket" | "homing" | "missile" | "grenade" | "cluster" | "clusterlet" | "banana" | "bananette" | "holy" | "dynamite" | "sheep";
export interface Proj {
  id: number; kind: ProjKind; x: number; y: number; vx: number; vy: number; t: number; fuse: number;
  owner: number; team: number; rot: number; resting: boolean; target: { x: number; y: number } | null;
  face: 1 | -1; grounded: boolean; hop: number; trail: number; bounced: number; stuck: number;
}
export interface Mine extends Body { id: number; armT: number; fuse: number; dud: boolean }
export interface Barrel extends Body { id: number; hp: number; fuse: number }
export interface Crate extends Body { id: number; kind: "health" | "weapon"; weapon: WeaponId; chute: boolean; fuse: number }
export interface Grave extends Body { id: number; color: string }
export interface Flame { x: number; y: number; vx: number; vy: number; life: number; grounded: boolean }
export type FxKind = "smoke" | "fire" | "spark" | "chip" | "ring" | "flash" | "text" | "bubble" | "drop" | "puff" | "wool" | "tracer" | "plane" | "glow" | "star";
export interface Fx {
  kind: FxKind; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string;
  rot: number; vr: number; text?: string; x2?: number; y2?: number;
}
export interface Sfx { n: string; v?: number; x?: number }

interface ProjDef { r: number; wind: number; bounce: number | null; R: number; D: number; hitsWorms: boolean }
export const PROJ: Record<ProjKind, ProjDef> = {
  rocket: { r: 3, wind: 1, bounce: null, R: 52, D: 50, hitsWorms: true },
  homing: { r: 3, wind: 1, bounce: null, R: 52, D: 50, hitsWorms: true },
  missile: { r: 3, wind: 0.45, bounce: null, R: 38, D: 30, hitsWorms: true },
  grenade: { r: 4, wind: 0, bounce: 0.45, R: 50, D: 48, hitsWorms: false },
  cluster: { r: 4, wind: 0, bounce: 0.45, R: 30, D: 22, hitsWorms: false },
  clusterlet: { r: 2, wind: 0, bounce: null, R: 28, D: 22, hitsWorms: true },
  banana: { r: 5, wind: 0, bounce: 0.62, R: 72, D: 70, hitsWorms: false },
  bananette: { r: 4, wind: 0, bounce: null, R: 62, D: 50, hitsWorms: true },
  holy: { r: 5, wind: 0, bounce: 0.22, R: 118, D: 100, hitsWorms: false },
  dynamite: { r: 4, wind: 0, bounce: 0.1, R: 92, D: 75, hitsWorms: false },
  sheep: { r: 6, wind: 0, bounce: 0.2, R: 80, D: 75, hitsWorms: false },
};

const DEATH_LINES = ["{n} is pushing up daisies.", "Bye bye, {n}!", "{n} has left the building.", "{n} went out with a bang.", "R.I.P. {n}."];
const DROWN_LINES = ["{n} sleeps with the fishes.", "{n} took a dip in {l}.", "Glug glug — {n} is gone.", "{n} forgot how to swim."];
const BIG_LINES = ["EXCELLENT!", "AMAZING!", "BRILLIANT!", "STUNNING!"];

interface AiPlan { weapon: WeaponId; face: 1 | -1; aim: number; power: number; fuse: number; target: { x: number; y: number } | null; score: number; impact?: { x: number; y: number } }
interface AiState { stage: "think" | "walk" | "arm" | "aim" | "cursor" | "charge" | "shoot" | "done"; t: number; plan: AiPlan | null; walked: boolean; shots: number }

export interface LobbyHuman { player: Player; ready: boolean }

export class WormsEngine {
  phase: Phase = "lobby";
  theme = 0; wormsPer = 4; turnTime = 45; cpus = 1; keyboard = false;
  humans: LobbyHuman[] = [];

  terrain: Terrain | null = null;
  teams: Team[] = [];
  worms: Worm[] = [];
  projs: Proj[] = [];
  mines: Mine[] = [];
  barrels: Barrel[] = [];
  crates: Crate[] = [];
  graves: Grave[] = [];
  flames: Flame[] = [];
  fx: Fx[] = [];
  sfx: Sfx[] = [];
  feed: { text: string; color: string; until: number }[] = [];

  time = 0; phaseT = 0; turnT = 0; settleT = 0; stableT = 0;
  wind = 0; waterY = H - 64; waterTarget = H - 64;
  turnNo = 0; current = -1; activeId = -1; winner: number | null = null;
  power = 0; charging = false; fired = false; shotsLeft = 0; jet = 0; jetOn = false;
  targeting = false; cursor = { x: 0, y: 0 }; target: { x: number; y: number } | null = null;
  turnDamage = 0; turnKills = 0; selfHurt = false; endTurnFlag = false;
  shake = 0; flash = 0; banner = ""; bannerColor = "#fff"; bannerT = 0; slowmo = 0;
  lastProj: Proj | null = null; focusCrate: Crate | null = null; dying: Worm | null = null;
  private uid = 1;
  private ai: AiState = { stage: "done", t: 0, plan: null, walked: false, shots: 0 };

  constructor(private random = Math.random) {}

  get themeInfo() { return THEMES[this.theme]; }
  get active(): Worm | undefined { return this.worms.find(w => w.id === this.activeId); }
  get activeTeam(): Team | undefined { return this.teams[this.current]; }
  get round() { return 1 + Math.floor(this.turnNo / Math.max(1, this.teams.length)); }
  get suddenDeath() { return this.turnNo >= RULES.sdAfter * Math.max(1, this.teams.length) / 2; }

  // ── Lobby ────────────────────────────────────────────────────────────────
  addPlayer(p: Player) {
    if (this.humans.some(h => h.player.id === p.id)) return;
    this.humans.push({ player: p, ready: false });
    this.fitCpus();
  }
  removePlayer(id: string) {
    this.humans = this.humans.filter(h => h.player.id !== id);
    const t = this.teams.find(t => t.playerId === id);
    if (t) { t.playerId = null; t.kind = "cpu"; t.keys.clear(); this.log(`${t.name} is now CPU-controlled.`, t.color); }
    this.fitCpus();
  }
  seatedHumans() { return this.humans.slice(0, RULES.maxTeams - (this.keyboard ? 1 : 0)); }
  teamCount() { return this.seatedHumans().length + (this.keyboard ? 1 : 0) + this.cpus; }
  private fitCpus() {
    if (this.phase !== "lobby") return;
    const fixed = this.seatedHumans().length + (this.keyboard ? 1 : 0);
    this.cpus = Math.max(fixed >= 2 ? 0 : 2 - fixed, Math.min(this.cpus, RULES.maxTeams - fixed));
  }
  setCpus(n: number) { if (this.phase === "lobby") { this.cpus = Math.max(0, n); this.fitCpus(); } }
  setKeyboard(on: boolean) { if (this.phase === "lobby") { this.keyboard = on; this.fitCpus(); } }
  setTheme(i: number) { if (this.phase === "lobby") this.theme = (i + THEMES.length) % THEMES.length; }
  cycleWorms(dir: number) { if (this.phase === "lobby") { const o = RULES.wormOptions; this.wormsPer = o[(o.indexOf(this.wormsPer) + dir + o.length) % o.length]; } }
  cycleTime(dir: number) { if (this.phase === "lobby") { const o = RULES.timeOptions; this.turnTime = o[(o.indexOf(this.turnTime) + dir + o.length) % o.length]; } }
  toggleReady(id: string) {
    const h = this.humans.find(h => h.player.id === id);
    if (!h) return;
    if (this.phase === "lobby") {
      h.ready = !h.ready;
      const seated = this.seatedHumans();
      if (seated.length && seated.every(s => s.ready)) this.startMatch();
    } else if (this.phase === "gameover" && this.phaseT <= 0) this.toLobby();
  }
  toLobby() {
    this.phase = "lobby"; this.teams = []; this.worms = []; this.projs = []; this.mines = []; this.barrels = [];
    this.crates = []; this.graves = []; this.flames = []; this.winner = null; this.terrain = null;
    for (const h of this.humans) h.ready = false;
    this.fitCpus();
  }

  startMatch() {
    if (this.phase !== "lobby") return;
    this.fitCpus();
    const theme = THEMES[this.theme];
    this.terrain = new Terrain(theme, Math.floor(this.random() * 1e9));
    this.waterY = this.waterTarget = H - 64;
    this.teams = []; this.worms = []; this.projs = []; this.mines = []; this.barrels = []; this.crates = []; this.graves = []; this.flames = []; this.fx = [];
    const used = new Set<string>();
    // Player colours come from the room palette, so pick CPU colours that are clearly different from them.
    const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const far = (c: string) => [...used].every(u => { const a = rgb(c), b = rgb(u); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 110; });
    const freeColor = () => TEAM_COLORS.find(c => !used.has(c) && far(c)) ?? TEAM_COLORS.find(c => !used.has(c))!;
    const add = (name: string, color: string, kind: TeamKind, playerId: string | null) => {
      const idx = this.teams.length;
      this.teams.push({ idx, name, color, playerId, kind, worms: [], ammo: startingAmmo(), next: 0, keys: new Set(), weapon: "bazooka", fuse: 3, kills: 0, dealt: 0 });
      used.add(color);
    };
    for (const h of this.seatedHumans()) add(h.player.name, used.has(h.player.color) ? freeColor() : h.player.color, "human", h.player.id);
    if (this.keyboard) add("Keyboard", freeColor(), "keyboard", null);
    for (let i = 0; i < this.cpus; i++) add(CPU_NAMES[i % CPU_NAMES.length], freeColor(), "cpu", null);

    const names = [...WORM_NAMES].sort(() => this.random() - 0.5);
    const spots = this.spawnPoints(this.teams.length * this.wormsPer + RULES.mines + RULES.barrels, 70);
    let s = 0;
    for (let k = 0; k < this.wormsPer; k++) for (const t of this.teams) {
      const p = spots[s++] ?? { x: W / 2, y: 100 };
      const w: Worm = {
        id: this.uid++, team: t.idx, name: names[(s - 1) % names.length], x: p.x, y: p.y - 60 - this.random() * 50, vx: 0, vy: 0,
        grounded: false, stuck: 0, face: p.x < W / 2 ? 1 : -1, hp: RULES.hp, shown: RULES.hp, alive: true, state: "ok",
        aim: -0.35, walkT: 0, walkAcc: 0, blink: this.random() * 4, spin: 0, hurtT: 0, lastHitBy: -1, drownT: 0, landT: 0, dieT: 0, burnT: 0, idle: 0,
      };
      t.worms.push(w); this.worms.push(w);
    }
    for (let i = 0; i < RULES.mines; i++) { const p = spots[s++]; if (p) this.mines.push({ id: this.uid++, x: p.x, y: p.y, vx: 0, vy: 0, grounded: false, stuck: 0, armT: 0, fuse: -1, dud: this.random() < 0.12 }); }
    for (let i = 0; i < RULES.barrels; i++) { const p = spots[s++]; if (p) this.barrels.push({ id: this.uid++, x: p.x, y: p.y - 2, vx: 0, vy: 0, grounded: false, stuck: 0, hp: 25, fuse: -1 }); }

    this.turnNo = 0; this.current = Math.floor(this.random() * this.teams.length) - 1; this.winner = null;
    this.phase = "intro"; this.phaseT = 3.2;
    this.setBanner("LET'S GET READY TO RUMBLE!", "#ffd23f", 2.6);
    this.sfx.push({ n: "start" });
  }

  /** Random reachable surface points, spaced apart and above the waterline. */
  private spawnPoints(n: number, gap: number) {
    const t = this.terrain!, out: { x: number; y: number }[] = [];
    for (let tries = 0; tries < 6000 && out.length < n; tries++) {
      const x = 40 + this.random() * (W - 80);
      const cands: number[] = [];
      for (let y = 1; y < this.waterY - 30; y++) if (t.solid(x, y) && !t.solid(x, y - 1)) cands.push(y);
      if (!cands.length) continue;
      const sy = cands[Math.floor(this.random() * cands.length)];
      const y = sy - PHYS.wormR - 1;
      if (!t.circleFree(x, y, PHYS.wormR) || !t.circleFree(x, y - 20, PHYS.wormR)) continue;
      const g = tries > 4000 ? gap * 0.5 : gap;
      if (out.some(p => Math.hypot(p.x - x, p.y - y) < g)) continue;
      out.push({ x, y });
    }
    return out.sort(() => this.random() - 0.5);
  }

  // ── Input (phones, keyboard and AI all come through here) ─────────────────
  teamOf(playerId: string) { return this.teams.find(t => t.playerId === playerId); }
  pressPlayer(playerId: string, key: Key, down: boolean) { const t = this.teamOf(playerId); if (t && t.kind === "human") this.press(t, key, down); }
  pressKeyboard(key: Key, down: boolean) { const t = this.teams.find(t => t.kind === "keyboard"); if (t) this.press(t, key, down); }

  press(team: Team, key: Key, down: boolean) {
    if (down) team.keys.add(key); else team.keys.delete(key);
    if (team.idx !== this.current || (this.phase !== "turn" && this.phase !== "retreat")) return;
    const w = this.active;
    if (!w || w.state !== "ok") return;
    if (key === "fire") { if (down) this.firePress(team, w); else this.fireRelease(team, w); }
    else if (down && (key === "jump" || key === "backflip") && w.grounded && !this.charging && !this.targeting && !this.jetOn) {
      const back = key === "backflip";
      w.vx = (back ? -PHYS.flipVx : PHYS.jumpVx) * w.face; w.vy = -(back ? PHYS.flipVy : PHYS.jumpVy);
      w.grounded = false; w.spin = back ? -w.face * 0.001 : 0;
      this.sfx.push({ n: back ? "flip" : "jump" });
    } else if (down && (key === "left" || key === "right") && !this.targeting) {
      const f = key === "left" ? -1 : 1;
      if (w.face !== f && w.grounded && !this.charging) w.face = f;
    }
  }

  selectWeapon(playerId: string | null, id: string) {
    const team = playerId ? this.teamOf(playerId) : this.teams.find(t => t.kind === "keyboard");
    if (team && isWeapon(id)) this.chooseWeapon(team, id);
  }
  chooseWeapon(team: Team, id: WeaponId) {
    if (team.idx !== this.current || !["turn", "turnstart"].includes(this.phase) || this.fired || this.charging || this.jetOn) return;
    if (team.ammo[id] === 0 || WEAPON[id].delay >= this.round) return;
    team.weapon = id;
    this.target = null;
    this.targeting = WEAPON[id].mode === "target";
    const w = this.active;
    if (w && this.targeting) this.cursor = { x: Math.max(20, Math.min(W - 20, w.x + w.face * 220)), y: Math.max(40, w.y - 80) };
    this.sfx.push({ n: "select" });
  }
  setFuse(playerId: string | null, v: number) {
    const team = playerId ? this.teamOf(playerId) : this.teams.find(t => t.kind === "keyboard");
    if (team && Number.isInteger(v) && v >= 1 && v <= 5) team.fuse = v;
  }

  private firePress(team: Team, w: Worm) {
    const sheep = this.projs.find(p => p.kind === "sheep" && p.team === team.idx);
    if (sheep) { this.detonate(sheep); return; }
    if (this.phase !== "turn") return;
    if (this.jetOn) { this.jetOn = false; this.sfx.push({ n: "jetoff" }); return; }
    if (this.fired && this.shotsLeft <= 0) return;
    const id = team.weapon, def = WEAPON[id];
    if (team.ammo[id] === 0 || def.delay >= this.round) return;
    if (this.targeting && !this.target) {
      if (id === "teleport") return this.teleport(team, w);
      this.target = { ...this.cursor };
      this.targeting = false;
      if (id === "airstrike") return this.airstrike(team, w);
      this.sfx.push({ n: "lock" });
      return;
    }
    if (def.mode === "charge" || id === "homing") { this.charging = true; this.power = 0; this.sfx.push({ n: "charge" }); return; }
    this.fireInstant(team, w, id);
  }
  private fireRelease(team: Team, w: Worm) { if (this.charging) this.launch(team, w); }

  private aimDir(w: Worm) { const a = w.face === 1 ? w.aim : Math.PI - w.aim; return { x: Math.cos(a), y: Math.sin(a), a }; }

  private consume(team: Team, id: WeaponId) {
    if (team.ammo[id] > 0) team.ammo[id]--;
    const def = WEAPON[id];
    if (!def.endsTurn) return;
    this.fired = true;
    this.charging = false;
    if (def.retreat > 0) { this.phase = "retreat"; this.phaseT = def.retreat; }
    else this.toSettle();
  }

  private launch(team: Team, w: Worm) {
    this.charging = false;
    const id = team.weapon, d = this.aimDir(w), sp = PHYS.maxPow * Math.max(0.07, Math.min(1, this.power));
    const kind: ProjKind = id === "bazooka" ? "rocket" : id === "homing" ? "homing" : id === "grenade" ? "grenade" : id === "cluster" ? "cluster" : id === "banana" ? "banana" : "holy";
    const fuse = id === "holy" ? 3 : id === "bazooka" || id === "homing" ? 12 : team.fuse;
    const p = this.spawnProj(kind, w.x + d.x * 13, w.y - 2 + d.y * 13, d.x * sp, d.y * sp, fuse, w, team);
    if (id === "homing") p.target = this.target;
    this.sfx.push({ n: kind === "rocket" || kind === "homing" ? "launch" : "throw", v: this.power });
    this.power = 0;
    this.consume(team, id);
  }

  private spawnProj(kind: ProjKind, x: number, y: number, vx: number, vy: number, fuse: number, w: Worm | null, team: Team | null): Proj {
    const p: Proj = { id: this.uid++, kind, x, y, vx, vy, t: 0, fuse, owner: w?.id ?? -1, team: team?.idx ?? -1, rot: 0, resting: false, target: null, face: w?.face ?? 1, grounded: false, hop: 1, trail: 0, bounced: 0, stuck: 0 };
    this.projs.push(p); this.lastProj = p;
    return p;
  }

  private fireInstant(team: Team, w: Worm, id: WeaponId) {
    const d = this.aimDir(w);
    switch (id) {
      case "dynamite": this.spawnProj("dynamite", w.x + w.face * 7, w.y - 2, w.face * 40, -70, 5, w, team); this.sfx.push({ n: "fuse" }); break;
      case "mine": this.mines.push({ id: this.uid++, x: w.x + w.face * 10, y: w.y - 4, vx: w.face * 70, vy: -90, grounded: false, stuck: 0, armT: 1.2, fuse: -1, dud: false }); this.sfx.push({ n: "throw", v: 0.2 }); break;
      case "sheep": this.spawnProj("sheep", w.x + w.face * 10, w.y - 4, w.face * 90, -170, 9, w, team); this.sfx.push({ n: "baa" }); break;
      case "shotgun": {
        this.shotgun(team, w, d);
        if (!this.fired) { this.fired = true; this.shotsLeft = 1; if (team.ammo.shotgun > 0) team.ammo.shotgun--; return; }
        this.shotsLeft = 0;
        this.phase = "retreat"; this.phaseT = WEAPON.shotgun.retreat;
        return;
      }
      case "bat": this.bat(team, w, d); break;
      case "jetpack": this.jetOn = true; this.jet = 5; w.grounded = false; w.vy -= 60; this.sfx.push({ n: "jet" }); break;
      case "skip": this.log(`${team.name} skipped their go.`, team.color); break;
    }
    this.consume(team, id);
  }

  private shotgun(team: Team, w: Worm, d: { x: number; y: number }) {
    const t = this.terrain!, sx = w.x + d.x * 10, sy = w.y - 2 + d.y * 10;
    let ex = sx + d.x * 1100, ey = sy + d.y * 1100, hitWorm: Worm | null = null;
    for (let s = 0; s < 1100; s += 2) {
      const x = sx + d.x * s, y = sy + d.y * s;
      hitWorm = this.worms.find(o => o !== w && o.state === "ok" && Math.hypot(o.x - x, o.y - y) < PHYS.wormR + 1) ?? null;
      if (hitWorm || t.solid(x, y)) { ex = x; ey = y; break; }
      const b = this.barrels.find(b => Math.hypot(b.x - x, b.y - y) < 10);
      if (b) { b.hp = 0; b.fuse = 0.05; ex = x; ey = y; break; }
    }
    this.addFx({ kind: "tracer", x: sx, y: sy, x2: ex, y2: ey, life: 0.18, max: 0.18, size: 2, color: "#fff6c0" });
    this.addFx({ kind: "flash", x: sx, y: sy, life: 0.08, max: 0.08, size: 26, color: "#ffe9a0" });
    this.sfx.push({ n: "shotgun" });
    this.shake = Math.max(this.shake, 0.25);
    if (hitWorm) {
      this.hurt(hitWorm, 25, team.idx);
      this.knock(hitWorm, d.x * 230, d.y * 230 - 120);
      this.sparks(ex, ey, 10, "#ffe08a");
      this.terrain!.carve(ex, ey, 8);
    } else this.explode(ex, ey, 15, 10, team.idx, { quiet: true });
  }

  private bat(team: Team, w: Worm, d: { x: number; y: number }) {
    const hx = w.x + d.x * 12, hy = w.y + d.y * 12;
    let hit = false;
    for (const o of this.worms) {
      if (o === w || o.state !== "ok" || Math.hypot(o.x - hx, o.y - hy) > 22) continue;
      hit = true;
      this.hurt(o, 30, team.idx);
      this.knock(o, d.x * 780, d.y * 780 - 140);
      this.addFx({ kind: "text", x: o.x, y: o.y - 30, vy: -40, life: 1.2, max: 1.2, size: 26, color: "#ffd23f", text: "WHACK!" });
    }
    this.addFx({ kind: "ring", x: hx, y: hy, life: 0.25, max: 0.25, size: 22, color: "#ffffff" });
    this.sfx.push({ n: hit ? "bat" : "swing" });
    if (hit) { this.shake = 0.5; this.slowmo = 0.5; }
  }

  private airstrike(team: Team, w: Worm) {
    const tx = this.target!.x, ty = this.target!.y, dir = w.face, vx = 270 * dir, vy0 = 120, y0 = -40;
    const tf = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * PHYS.g * (ty - y0))) / PHYS.g;
    for (let i = 0; i < 5; i++) {
      const p = this.spawnProj("missile", tx - vx * tf + (i - 2) * 34 - this.wind * PHYS.wind * 0.45 * 0.5 * tf * tf, y0 - i * 6, vx, vy0, 12, w, team);
      p.t = -i * 0.06;
    }
    this.addFx({ kind: "plane", x: tx - dir * 1400, y: 60, vx: dir * 1500, life: 2, max: 2, size: 1, color: team.color });
    this.sfx.push({ n: "plane" });
    this.consume(team, "airstrike");
  }

  private teleport(team: Team, w: Worm) {
    const c = this.cursor, t = this.terrain!;
    if (!t.circleFree(c.x, c.y, PHYS.wormR + 1) || c.y > this.waterY - 12 || c.y < 10) { this.sfx.push({ n: "nope" }); return; }
    this.sparkle(w.x, w.y, team.color);
    w.x = c.x; w.y = c.y; w.vx = w.vy = 0; w.grounded = false;
    this.sparkle(w.x, w.y, team.color);
    this.targeting = false;
    this.sfx.push({ n: "teleport" });
    this.consume(team, "teleport");
  }

  private detonate(p: Proj) { if (this.projs.includes(p)) { this.projs = this.projs.filter(q => q !== p); this.blowProj(p); } }

  // ── Simulation ─────────────────────────────────────────────────────────────
  step(dt: number) {
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.feed = this.feed.filter(f => f.until > this.time);
    this.stepFx(dt);
    if (this.phase === "lobby" || !this.terrain) return;

    if (this.waterY > this.waterTarget) this.waterY = Math.max(this.waterTarget, this.waterY - 40 * dt);
    this.stepWorms(dt);
    this.stepProjs(dt);
    this.stepObjects(dt);
    this.stepFlames(dt);

    switch (this.phase) {
      case "intro":
        if ((this.phaseT -= dt) <= 0 && (this.stable() || this.phaseT < -4)) this.nextTurn();
        break;
      case "turnstart":
        if ((this.phaseT -= dt) <= 0) { this.phase = "turn"; this.turnT = this.turnTime; this.sfx.push({ n: "go" }); }
        break;
      case "turn":
        this.control(dt);
        this.stepAi(dt);
        this.turnT -= dt;
        if (this.turnT <= 5 && Math.ceil(this.turnT) !== Math.ceil(this.turnT + dt) && this.turnT > 0) this.sfx.push({ n: "tick" });
        if (this.endTurnFlag || this.turnT <= 0) { if (this.turnT <= 0) this.log("Time's up!", "#ffffff"); this.toSettle(); }
        break;
      case "retreat":
        this.control(dt);
        this.stepAi(dt);
        if ((this.phaseT -= dt) <= 0 || this.endTurnFlag) this.toSettle();
        break;
      case "settle":
        this.settleT += dt;
        this.stableT = this.stable() ? this.stableT + dt : 0;
        if (this.stableT > 0.45 || this.settleT > 14) { this.phase = "resolve"; this.phaseT = 0.35; this.dying = null; }
        break;
      case "resolve": this.stepResolve(dt); break;
      case "crate":
        this.phaseT -= dt;
        if ((this.crates.every(c => c.grounded) && this.waterY <= this.waterTarget + 0.5 && this.worms.every(w => w.state !== "drowning") && this.phaseT < 1.6) || this.phaseT < -5) {
          this.focusCrate = null;
          if (!this.checkWin()) this.beginTurn();
        }
        break;
      case "gameover":
        this.phaseT -= dt;
        if (this.winner !== null && this.random() < dt * 3) {
          const t = this.teams[this.winner], w = t.worms.find(w => w.state === "ok");
          if (w) this.sparkle(w.x + (this.random() - 0.5) * 60, w.y - 40 - this.random() * 40, t.color);
        }
        break;
    }
  }

  private toSettle() {
    this.phase = "settle"; this.settleT = 0; this.stableT = 0; this.charging = false; this.jetOn = false; this.targeting = false;
    this.endTurnFlag = false;
    for (const t of this.teams) t.keys.clear();
  }

  private stable() {
    if (this.projs.length || this.flames.length || this.waterY > this.waterTarget + 0.5) return false;
    for (const w of this.worms) if (w.state === "drowning" || (w.state === "ok" && !w.grounded)) return false;
    for (const m of this.mines) if (m.fuse > 0 || !m.grounded) return false;
    for (const b of this.barrels) if (b.fuse >= 0 || !b.grounded) return false;
    for (const c of this.crates) if (!c.grounded || c.fuse >= 0) return false;
    return true;
  }

  private stepResolve(dt: number) {
    if ((this.phaseT -= dt) > 0) return;
    let counting = false;
    for (const w of this.worms) if (w.shown > w.hp) { w.shown = Math.max(w.hp, w.shown - 55 * dt); counting = true; }
    if (counting) { if (this.random() < dt * 8) this.sfx.push({ n: "count" }); return; }
    const dying = this.worms.find(w => w.state === "ok" && w.hp <= 0);
    if (dying) {
      if (this.dying !== dying) { this.dying = dying; dying.state = "dying"; dying.dieT = 1.1; this.phaseT = 1.25; this.sfx.push({ n: "uhoh" }); return; }
      return;
    }
    if (this.worms.some(w => w.state === "dying")) return;
    // Commentary for the turn that just finished.
    const t = this.activeTeam;
    if (t && this.turnKills >= 2) this.setBanner(this.turnKills >= 3 ? "MULTI KILL!" : "DOUBLE KILL!", t.color, 1.6);
    else if (t && this.turnDamage >= 70) this.setBanner(BIG_LINES[Math.floor(this.random() * BIG_LINES.length)], t.color, 1.4);
    else if (t && this.selfHurt && this.turnDamage === 0) this.setBanner("OOPS!", "#ff8a8a", 1.2);
    this.turnDamage = 0; this.turnKills = 0; this.selfHurt = false;

    if (!this.checkWin()) this.nextTurn();
  }

  private checkWin() {
    const alive = this.teams.filter(t => t.worms.some(w => w.state === "ok" && w.hp > 0));
    if (alive.length > 1) return false;
    this.winner = alive[0]?.idx ?? null;
    this.phase = "gameover"; this.phaseT = 3;
    this.setBanner(this.winner === null ? "DRAW!" : `${this.teams[this.winner].name} WIN!`, this.winner === null ? "#fff" : this.teams[this.winner].color, 999);
    this.sfx.push({ n: "victory" });
    return true;
  }

  private nextTurn() {
    this.turnNo++;
    if (this.turnNo > 1) {
      if (this.suddenDeath) {
        if (this.turnNo === Math.ceil(RULES.sdAfter * this.teams.length / 2)) { this.setBanner("SUDDEN DEATH!", "#ff6a4a", 2); this.sfx.push({ n: "sudden" }); }
        this.waterTarget = Math.max(260, this.waterTarget - RULES.sdRise);
      }
      if (this.random() < RULES.crateChance && this.crates.length < 4) {
        const x = 80 + this.random() * (W - 160);
        if (this.terrain!.surfaceY(x) < this.waterTarget - 30) {
          const health = this.random() < 0.45;
          const c: Crate = { id: this.uid++, x, y: -30, vx: 0, vy: 0, grounded: false, stuck: 0, kind: health ? "health" : "weapon", weapon: CRATE_POOL[Math.floor(this.random() * CRATE_POOL.length)], chute: true, fuse: -1 };
          this.crates.push(c); this.focusCrate = c;
          this.log(health ? "A health crate is dropping in!" : "Weapon crate incoming!", "#ffe28a");
          this.sfx.push({ n: "crate" });
        }
      }
      if (this.focusCrate || this.waterY > this.waterTarget + 0.5) { this.phase = "crate"; this.phaseT = 2.5; return; }
    }
    this.beginTurn();
  }

  private beginTurn() {
    const n = this.teams.length;
    for (let k = 1; k <= n; k++) {
      const t = this.teams[(this.current + k + n) % n];
      const alive = t.worms.filter(w => w.state === "ok");
      if (!alive.length) continue;
      this.current = t.idx;
      let w: Worm | undefined;
      for (let j = 0; j < t.worms.length; j++) { const c = t.worms[(t.next + j) % t.worms.length]; if (c.state === "ok") { w = c; t.next = (t.next + j + 1) % t.worms.length; break; } }
      this.activeId = w!.id;
      break;
    }
    const t = this.activeTeam!;
    this.wind = Math.max(-1, Math.min(1, (this.random() + this.random() - 1) * 1.15));
    this.fired = false; this.shotsLeft = 0; this.charging = false; this.power = 0; this.jetOn = false; this.target = null;
    this.endTurnFlag = false; this.turnDamage = 0; this.turnKills = 0; this.selfHurt = false; this.lastProj = null;
    if (t.ammo[t.weapon] === 0 || WEAPON[t.weapon].delay >= this.round) t.weapon = "bazooka";
    this.targeting = WEAPON[t.weapon].mode === "target";
    const w = this.active!;
    if (this.targeting) this.cursor = { x: Math.max(20, Math.min(W - 20, w.x + w.face * 220)), y: Math.max(40, w.y - 80) };
    t.keys.clear();
    this.phase = "turnstart"; this.phaseT = 1.5;
    this.setBanner(`${t.name} — ${w.name}`, t.color, 1.5);
    this.sfx.push({ n: "turn" });
    this.ai = { stage: t.kind === "cpu" ? "think" : "done", t: 0.9 + this.random() * 0.6, plan: null, walked: false, shots: 0 };
  }

  private control(dt: number) {
    const t = this.activeTeam, w = this.active;
    if (!t || !w || w.state !== "ok") return;
    const k = t.keys;
    if (this.targeting && this.phase === "turn") {
      const dx = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0), dy = (k.has("down") ? 1 : 0) - (k.has("up") ? 1 : 0);
      this.cursor.x = Math.max(10, Math.min(W - 10, this.cursor.x + dx * PHYS.cursor * dt));
      this.cursor.y = Math.max(10, Math.min(this.waterY, this.cursor.y + dy * PHYS.cursor * dt));
      return;
    }
    if (this.jetOn) {
      const up = k.has("up"), side = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0);
      if (up || side) this.jet -= dt;
      if (up) w.vy -= 980 * dt;
      if (side) { w.vx += side * 420 * dt; w.face = side > 0 ? 1 : -1; }
      w.vx *= 1 - dt * 0.9; w.vy = Math.max(-260, w.vy);
      w.grounded = false;
      if ((up || side) && this.random() < 0.8) this.addFx({ kind: "fire", x: w.x - w.face * 5, y: w.y + 8, vx: (this.random() - 0.5) * 30, vy: 120 + this.random() * 60, life: 0.35, max: 0.35, size: 4, color: "#ffb347" });
      if (this.jet <= 0) { this.jetOn = false; this.sfx.push({ n: "jetoff" }); }
    } else if (w.grounded && !this.charging) {
      const dir = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0);
      if (dir) { w.face = dir > 0 ? 1 : -1; this.walk(w, dir, dt); w.walkT += dt; } else w.walkAcc = 0;
    }
    const def = WEAPON[t.weapon];
    if (this.phase === "turn" && def.aims) {
      const ad = (k.has("down") ? 1 : 0) - (k.has("up") ? 1 : 0);
      if (ad && !(this.jetOn && k.has("up"))) w.aim = Math.max(-1.52, Math.min(1.52, w.aim + ad * PHYS.aimSpeed * dt));
    }
    if (this.charging) { this.power += dt / PHYS.charge; if (this.power >= 1) { this.power = 1; this.launch(t, w); } }
  }

  private walk(w: Worm, dir: number, dt: number) {
    const t = this.terrain!, R = PHYS.wormR;
    w.walkAcc += PHYS.walk * dt;
    while (w.walkAcc >= 1) {
      w.walkAcc -= 1;
      let moved = false;
      for (let up = 0; up <= 7; up++) if (t.circleFree(w.x + dir, w.y - up, R)) { w.x += dir; w.y -= up; moved = true; break; }
      if (!moved) { w.walkAcc = 0; return; }
      let down = 0;
      while (down < 9 && t.circleFree(w.x, w.y + 1, R)) { w.y++; down++; }
      if (down >= 9) { w.grounded = false; w.vx = dir * 40; w.vy = 0; return; }
    }
  }

  /** Shared rigid-circle integrator for worms, mines, barrels, crates and graves. */
  private body(b: Body, r: number, dt: number, bounce: number, maxFall = 2000): number {
    const t = this.terrain!;
    let impact = 0;
    if (b.grounded) {
      if (!t.circleFree(b.x, b.y + 1, r)) return 0;
      b.grounded = false;
    }
    b.vy = Math.min(maxFall, b.vy + PHYS.g * dt);
    const n = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 1.5) + 1, h = dt / n;
    for (let i = 0; i < n; i++) {
      const nx = b.x + b.vx * h, ny = b.y + b.vy * h;
      if (t.circleFree(nx, ny, r)) { b.x = nx; b.y = ny; continue; }
      const nr = t.normalAt(nx, ny, r + 2), vn = b.vx * nr.x + b.vy * nr.y;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        b.vx -= (1 + bounce) * vn * nr.x; b.vy -= (1 + bounce) * vn * nr.y;
        b.vx *= 0.78; b.vy *= 0.78;
      }
      if (nr.y < -0.5 && Math.hypot(b.vx, b.vy) < 95) {
        b.vx = 0; b.vy = 0; b.grounded = true;
        for (let k = 0; k < 4 && t.circleFree(b.x, b.y + 1, r); k++) b.y++;
      }
      if (!t.circleFree(b.x, b.y, r)) { b.x += nr.x; b.y += nr.y; }
      break;
    }
    if (!b.grounded && Math.hypot(b.vx, b.vy) < 25) { b.stuck += dt; if (b.stuck > 0.8) { b.grounded = true; b.vx = b.vy = 0; } } else b.stuck = 0;
    for (let k = 0; k < 12 && !t.circleFree(b.x, b.y, r); k++) b.y -= 1;
    return impact;
  }

  private stepWorms(dt: number) {
    for (const w of this.worms) {
      w.blink -= dt; if (w.blink < -0.12) w.blink = 2 + this.random() * 4;
      w.hurtT = Math.max(0, w.hurtT - dt); w.landT = Math.max(0, w.landT - dt); w.burnT = Math.max(0, w.burnT - dt);
      if (w.state === "dead") continue;
      if (w.state === "drowning") {
        w.drownT += dt; w.y += 28 * dt; w.x += Math.sin(w.drownT * 5) * 8 * dt;
        if (this.random() < dt * 10) this.addFx({ kind: "bubble", x: w.x + (this.random() - 0.5) * 8, y: w.y - 6, vx: 0, vy: -40, life: 1, max: 1, size: 2 + this.random() * 2, color: "#ffffff" });
        if (w.drownT > 2) { w.state = "dead"; w.alive = false; }
        continue;
      }
      if (w.state === "dying") {
        w.dieT -= dt;
        if (w.dieT <= 0) {
          w.state = "dead"; w.alive = false; w.hp = 0; w.shown = 0;
          this.graves.push({ id: this.uid++, x: w.x, y: w.y - 4, vx: 0, vy: -60, grounded: false, stuck: 0, color: this.teams[w.team].color });
          this.log(pick(DEATH_LINES, this.random).replace("{n}", w.name), this.teams[w.team].color);
          this.explode(w.x, w.y, 30, 20, -1);
          this.phase = "settle"; this.settleT = 0; this.stableT = 0;
        }
        continue;
      }
      const isActive = w.id === this.activeId && (this.phase === "turn" || this.phase === "retreat");
      if (isActive && this.jetOn) {
        w.vy += PHYS.g * dt;
        const nx = w.x + w.vx * dt, ny = w.y + w.vy * dt;
        if (this.terrain!.circleFree(nx, ny, PHYS.wormR)) { w.x = nx; w.y = ny; }
        else { const nr = this.terrain!.normalAt(nx, ny, PHYS.wormR + 2); const vn = w.vx * nr.x + w.vy * nr.y; if (vn < 0) { w.vx -= vn * nr.x * 1.2; w.vy -= vn * nr.y * 1.2; } w.vx *= 0.7; }
      } else if (!w.grounded || this.terrain!.circleFree(w.x, w.y + 1, PHYS.wormR)) {
        const wasAir = !w.grounded;
        const imp = this.body(w, PHYS.wormR, dt, 0.32);
        if (w.vx || w.vy) w.spin += (w.vx * dt) / 7;
        if (imp > PHYS.fallSafe && w.grounded) {
          const dmg = Math.round((imp - PHYS.fallSafe) / 7);
          if (dmg > 0) { this.hurt(w, dmg, w.lastHitBy); this.sfx.push({ n: "ouch" }); }
        }
        if (wasAir && w.grounded) { w.landT = 0.25; w.spin = 0; if (imp > 120) this.puff(w.x, w.y + 8, 5, "#ffffffaa"); }
      }
      if (w.y > this.waterY + 4) {
        if (w.hp > 0) this.credit(w);
        w.state = "drowning"; w.drownT = 0; w.vx = w.vy = 0; w.hp = 0;
        this.splash(w.x, this.waterY, 1);
        this.log(pick(DROWN_LINES, this.random).replace("{n}", w.name).replace("{l}", this.themeInfo.liquid), this.teams[w.team].color);
        if (w.id === this.activeId && (this.phase === "turn" || this.phase === "retreat")) this.endTurnFlag = true;
      }
      // Crates are collected by whoever's turn it is.
      if (w.id === this.activeId && (this.phase === "turn" || this.phase === "retreat")) {
        for (const c of this.crates) if (Math.hypot(c.x - w.x, c.y - w.y) < 18) this.collect(w, c);
        this.crates = this.crates.filter(c => c.fuse !== -2);
      }
    }
  }

  private collect(w: Worm, c: Crate) {
    const t = this.teams[w.team];
    c.fuse = -2;
    if (c.kind === "health") {
      w.hp += 25; w.shown = w.hp;
      this.addFx({ kind: "text", x: w.x, y: w.y - 28, vy: -30, life: 1.4, max: 1.4, size: 20, color: "#7dff9a", text: "+25" });
      this.log(`${w.name} patched up (+25).`, t.color);
    } else {
      if (t.ammo[c.weapon] >= 0) t.ammo[c.weapon]++;
      this.addFx({ kind: "text", x: w.x, y: w.y - 28, vy: -30, life: 1.4, max: 1.4, size: 18, color: "#ffe28a", text: `${WEAPON[c.weapon].icon} ${WEAPON[c.weapon].name}` });
      this.log(`${t.name} got a ${WEAPON[c.weapon].name}!`, t.color);
    }
    this.sparkle(c.x, c.y, "#ffffff");
    this.sfx.push({ n: "pickup" });
  }

  private credit(w: Worm) {
    if (w.lastHitBy >= 0 && w.lastHitBy !== w.team) { this.teams[w.lastHitBy].kills++; if (w.lastHitBy === this.current) this.turnKills++; }
  }

  private stepProjs(dt: number) {
    const t = this.terrain!;
    const list = this.projs;
    this.projs = []; // children spawned by explosions land here alongside survivors
    for (const p of list) {
      if (p.t < 0) { p.t += dt; this.projs.push(p); continue; }
      const ev = p.kind === "sheep" ? this.stepSheep(p, dt) : integrate(p, dt, this.wind, t, this.waterY, this.worms);
      p.rot = p.kind === "rocket" || p.kind === "homing" || p.kind === "missile" ? Math.atan2(p.vy, p.vx) : p.rot + (p.resting ? 0 : p.vx * dt * 0.06);
      if (p.bounced) { if (p.bounced > 40) this.sfx.push({ n: "bounce", v: Math.min(1, p.bounced / 400) }); p.bounced = 0; }
      if (p.kind === "rocket" || p.kind === "homing" || p.kind === "missile") {
        p.trail -= dt;
        if (p.trail <= 0) {
          p.trail = 0.018;
          this.addFx({ kind: "smoke", x: p.x - Math.cos(p.rot) * 8, y: p.y - Math.sin(p.rot) * 8, vx: (this.random() - 0.5) * 12, vy: -10, life: 0.9, max: 0.9, size: 3 + this.random() * 2, color: "#d8d8d8" });
          this.addFx({ kind: "fire", x: p.x - Math.cos(p.rot) * 7, y: p.y - Math.sin(p.rot) * 7, life: 0.12, max: 0.12, size: 3, color: "#ffcf5a" });
        }
      } else if (p.kind === "dynamite" && this.random() < 0.7) {
        this.addFx({ kind: "spark", x: p.x + Math.cos(p.rot - 1.57) * 7, y: p.y + Math.sin(p.rot - 1.57) * 7, vx: (this.random() - 0.5) * 60, vy: -40 - this.random() * 50, life: 0.25, max: 0.25, size: 1.5, color: "#ffdd77" });
      }
      if (ev === "explode") { this.blowProj(p); continue; }
      if (ev === "water") { this.splash(p.x, this.waterY, p.kind === "holy" || p.kind === "banana" ? 0.8 : 0.5); if (p.kind === "sheep") this.sfx.push({ n: "baa" }); continue; }
      if (ev === "out") continue;
      this.projs.push(p);
    }
  }

  private stepSheep(p: Proj, dt: number) {
    const t = this.terrain!;
    p.t += dt;
    if (p.t >= p.fuse) return "explode";
    if (p.grounded) {
      if (t.circleFree(p.x, p.y + 1, 6)) { p.grounded = false; }
      else {
        p.hop -= dt;
        let moved = false;
        for (let up = 0; up <= 6; up++) if (t.circleFree(p.x + p.face * 80 * dt, p.y - up, 6)) { p.x += p.face * 80 * dt; p.y -= up; moved = true; break; }
        if (!moved || p.hop <= 0) { p.vx = p.face * (moved ? 60 : 90); p.vy = moved ? -150 : -270; p.grounded = false; p.hop = 0.8 + this.random() * 1.4; this.sfx.push({ n: "hop" }); }
        else { let d = 0; while (d < 8 && t.circleFree(p.x, p.y + 1, 6)) { p.y++; d++; } }
        if (this.random() < dt * 6) this.addFx({ kind: "puff", x: p.x - p.face * 6, y: p.y + 5, vx: -p.face * 10, vy: -10, life: 0.4, max: 0.4, size: 2.5, color: "#ffffffaa" });
      }
    }
    if (!p.grounded) {
      const before = Math.sign(p.vx);
      this.body(p, 6, dt, 0.15);
      if (before && Math.sign(p.vx) === -before) p.face = (before > 0 ? -1 : 1);
    }
    if (p.y > this.waterY) return "water";
    if (p.y > H + 50) return "out";
    if (this.worms.some(w => w.state === "ok" && w.id !== p.owner && Math.hypot(w.x - p.x, w.y - p.y) < 14) && p.t > 0.4) return "explode";
    return null;
  }

  private blowProj(p: Proj) {
    const d = PROJ[p.kind];
    if (p.kind === "holy") { this.addFx({ kind: "text", x: p.x, y: p.y - 60, vy: -20, life: 1.6, max: 1.6, size: 30, color: "#ffe680", text: "HALLELUJAH!" }); this.sfx.push({ n: "holy" }); }
    this.explode(p.x, p.y, d.R, d.D, p.team);
    if (p.kind === "cluster" || p.kind === "banana") {
      const child: ProjKind = p.kind === "cluster" ? "clusterlet" : "bananette";
      for (let i = 0; i < 5; i++) {
        const c = this.spawnProj(child, p.x, p.y - 6, (this.random() - 0.5) * (p.kind === "banana" ? 380 : 300), -220 - this.random() * 220, 12, null, null);
        c.team = p.team; c.owner = -1; c.t = 0.0001;
      }
    }
  }

  private stepObjects(dt: number) {
    for (const m of this.mines) {
      this.body(m, 4, dt, 0.3);
      m.armT = Math.max(0, m.armT - dt);
      if (m.fuse < 0 && m.armT <= 0 && this.phase !== "intro" && this.worms.some(w => w.state === "ok" && Math.hypot(w.x - m.x, w.y - m.y) < 32)) { m.fuse = 1.3; this.sfx.push({ n: "beep" }); }
      if (m.fuse > 0) {
        const before = m.fuse; m.fuse -= dt;
        if (Math.floor(before * 6) !== Math.floor(m.fuse * 6)) this.sfx.push({ n: "beep" });
        if (m.fuse <= 0) {
          if (m.dud) { m.fuse = -3; this.puff(m.x, m.y, 8, "#777777cc"); this.addFx({ kind: "text", x: m.x, y: m.y - 16, vy: -25, life: 1.2, max: 1.2, size: 16, color: "#cccccc", text: "dud" }); this.sfx.push({ n: "fizz" }); }
          else { m.fuse = -9; this.explode(m.x, m.y, 48, 45, -1); }
        }
      }
      if (m.y > this.waterY) m.fuse = -9;
    }
    this.mines = this.mines.filter(m => m.fuse !== -9);
    for (const b of this.barrels) {
      this.body(b, 9, dt, 0.2);
      if (b.fuse >= 0 && (b.fuse -= dt) < 0) {
        b.fuse = -9;
        this.explode(b.x, b.y, 62, 42, -1);
        for (let i = 0; i < 16; i++) this.flames.push({ x: b.x, y: b.y - 4, vx: (this.random() - 0.5) * 320, vy: -150 - this.random() * 260, life: 2.5 + this.random() * 2, grounded: false });
      }
      if (b.y > this.waterY + 6) b.fuse = -9;
    }
    this.barrels = this.barrels.filter(b => b.fuse !== -9);
    for (const c of this.crates) {
      if (c.chute && !c.grounded) c.vx = Math.sin(this.time * 1.7 + c.id) * 18;
      this.body(c, 9, dt, 0.15, c.chute ? 70 : 2000);
      if (c.grounded) c.chute = false;
      if (c.fuse >= 0 && (c.fuse -= dt) < 0) { c.fuse = -9; this.explode(c.x, c.y, 42, 30, -1); }
      if (c.y > this.waterY + 6) c.fuse = -9;
    }
    this.crates = this.crates.filter(c => c.fuse !== -9);
    for (const g of this.graves) this.body(g, 6, dt, 0.25);
    this.graves = this.graves.filter(g => g.y < this.waterY + 20);
  }

  private stepFlames(dt: number) {
    const t = this.terrain!;
    for (const f of this.flames) {
      f.life -= dt;
      if (!f.grounded) {
        f.vy += PHYS.g * dt; f.vx += this.wind * 60 * dt;
        const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt;
        if (t.solid(nx, ny)) { f.grounded = true; f.vx = f.vy = 0; } else { f.x = nx; f.y = ny; }
      } else if (!t.solid(f.x, f.y + 2)) f.grounded = false;
      if (f.y > this.waterY) { f.life = 0; this.addFx({ kind: "smoke", x: f.x, y: this.waterY, vx: 0, vy: -30, life: 0.8, max: 0.8, size: 4, color: "#ffffff" }); }
      if (this.random() < dt * 14) this.addFx({ kind: "fire", x: f.x + (this.random() - 0.5) * 4, y: f.y - 2, vx: (this.random() - 0.5) * 20, vy: -50 - this.random() * 40, life: 0.45, max: 0.45, size: 3 + this.random() * 3, color: "#ff9a3a" });
      if (this.random() < dt * 3) this.addFx({ kind: "smoke", x: f.x, y: f.y - 8, vx: this.wind * 20, vy: -25, life: 1.4, max: 1.4, size: 4, color: "#55443a" });
      for (const w of this.worms) if (w.state === "ok" && w.burnT <= 0 && Math.hypot(w.x - f.x, w.y - f.y) < 10) { w.burnT = 0.45; this.hurt(w, 3, -1); }
    }
    this.flames = this.flames.filter(f => f.life > 0);
  }

  // ── Damage & effects ──────────────────────────────────────────────────────
  hurt(w: Worm, dmg: number, by: number) {
    if (w.state !== "ok" || dmg <= 0) return;
    dmg = Math.round(dmg);
    const before = w.hp;
    w.hp = Math.max(0, w.hp - dmg);
    w.hurtT = 0.6;
    if (by >= 0) w.lastHitBy = by;
    const team = this.teams[w.team];
    this.addFx({ kind: "text", x: w.x + (this.random() - 0.5) * 10, y: w.y - 26, vy: -34, life: 1.5, max: 1.5, size: 18, color: team.color, text: String(dmg) });
    if (by === this.current && by !== w.team) { this.turnDamage += dmg; this.teams[by].dealt += dmg; }
    if (w.team === this.current) this.selfHurt = true;
    if (before > 0 && w.hp <= 0) this.credit(w);
    if (w.id === this.activeId && (this.phase === "turn" || this.phase === "retreat")) this.endTurnFlag = true;
  }

  private knock(b: Body, vx: number, vy: number) { b.vx += vx; b.vy += vy; b.grounded = false; b.stuck = 0; }

  explode(x: number, y: number, R: number, D: number, by: number, opts: { quiet?: boolean } = {}) {
    const t = this.terrain!;
    t.carve(x, y, R);
    for (const w of this.worms) {
      if (w.state !== "ok") continue;
      const dist = Math.hypot(w.x - x, w.y - y), d = Math.max(0, dist - PHYS.wormR);
      if (d >= R) continue;
      const f = 1 - d / R;
      this.hurt(w, D * f, by);
      const nx = dist > 0.01 ? (w.x - x) / dist : 0, ny = dist > 0.01 ? (w.y - y) / dist : -1;
      const kb = D * f * 9.5;
      this.knock(w, nx * kb, ny * kb - kb * 0.35);
    }
    const pushBody = (b: Body, r: number) => {
      const dist = Math.hypot(b.x - x, b.y - y);
      if (dist > R + r) return false;
      const f = 1 - Math.max(0, dist - r) / R, nx = dist > 0.01 ? (b.x - x) / dist : 0, ny = dist > 0.01 ? (b.y - y) / dist : -1;
      this.knock(b, nx * D * f * 8, ny * D * f * 8 - D * f * 3);
      return true;
    };
    for (const m of this.mines) if (pushBody(m, 4) && m.fuse < 0 && m.fuse > -3) { m.fuse = 0.08 + this.random() * 0.25; m.dud = false; }
    // fuse -1 = idle; anything else is already burning, collected or gone.
    for (const b of this.barrels) if (pushBody(b, 9) && b.fuse === -1) { b.hp -= D; if (b.hp <= 0) b.fuse = 0.1 + this.random() * 0.15; }
    for (const c of this.crates) if (pushBody(c, 9) && c.fuse === -1) c.fuse = 0.12;
    for (const g of this.graves) pushBody(g, 6);
    for (const p of this.projs) if ((p.kind === "grenade" || p.kind === "dynamite" || p.kind === "holy" || p.kind === "cluster" || p.kind === "banana") && Math.hypot(p.x - x, p.y - y) < R) { p.resting = false; p.vx += (p.x - x) * 4; p.vy += (p.y - y) * 4 - 120; }

    // Visuals
    this.addFx({ kind: "flash", x, y, life: 0.16, max: 0.16, size: R * 2.4, color: "#fff4d0" });
    this.addFx({ kind: "glow", x, y, life: 0.5, max: 0.5, size: R * 1.8, color: "#ff9a3a" });
    this.addFx({ kind: "ring", x, y, life: 0.35, max: 0.35, size: R * 1.5, color: "#ffffff" });
    const n = Math.min(26, 8 + R / 4);
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2, s = (0.3 + this.random()) * R * 4;
      this.addFx({ kind: "fire", x: x + Math.cos(a) * R * 0.3, y: y + Math.sin(a) * R * 0.3, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s * 0.5 - 40, life: 0.4 + this.random() * 0.35, max: 0.75, size: R * (0.15 + this.random() * 0.2), color: i % 3 ? "#ffb347" : "#ff6a2a" });
    }
    for (let i = 0; i < n * 0.7; i++) {
      const a = this.random() * Math.PI * 2, s = this.random() * R * 1.5;
      this.addFx({ kind: "smoke", x: x + Math.cos(a) * R * 0.5, y: y + Math.sin(a) * R * 0.5, vx: Math.cos(a) * s * 0.4 + this.wind * 30, vy: Math.sin(a) * s * 0.4 - 30, life: 1.4 + this.random(), max: 2.4, size: R * (0.18 + this.random() * 0.2), color: "#3c3530" });
    }
    const soil = t.theme.soilA, soilCss = `rgb(${soil[0]},${soil[1]},${soil[2]})`, topCss = `rgb(${t.theme.top[0]},${t.theme.top[1]},${t.theme.top[2]})`;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * this.random(), s = 150 + this.random() * R * 6;
      this.addFx({ kind: "chip", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.2 + this.random(), max: 2.2, size: 2 + this.random() * 3, color: i % 4 ? soilCss : topCss, vr: (this.random() - 0.5) * 20 });
    }
    this.sparks(x, y, Math.floor(n * 0.6), "#ffe9a0");
    this.shake = Math.min(1.4, this.shake + R / 70);
    this.flash = Math.min(0.6, this.flash + R / 300);
    if (!opts.quiet || R > 20) this.sfx.push({ n: "boom", v: R / 80, x });
    if (y > this.waterY - R) this.splash(x, this.waterY, R / 90);
  }

  private sparks(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2, s = 120 + this.random() * 380;
      this.addFx({ kind: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + this.random() * 0.4, max: 0.7, size: 1.5, color });
    }
  }
  private puff(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) this.addFx({ kind: "puff", x, y, vx: (this.random() - 0.5) * 80, vy: -this.random() * 40, life: 0.5, max: 0.5, size: 3 + this.random() * 3, color });
  }
  private sparkle(x: number, y: number, color: string) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.addFx({ kind: "star", x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.7, max: 0.7, size: 4, color, vr: 6 });
    }
  }
  private splash(x: number, y: number, s: number) {
    for (let i = 0; i < 18 * s + 6; i++) this.addFx({ kind: "drop", x: x + (this.random() - 0.5) * 20, y, vx: (this.random() - 0.5) * 220 * s, vy: -120 - this.random() * 360 * s, life: 0.9, max: 0.9, size: 2 + this.random() * 2.5, color: this.themeInfo.water[0] });
    this.addFx({ kind: "ring", x, y, life: 0.6, max: 0.6, size: 40 * s + 20, color: this.themeInfo.water[0] });
    this.sfx.push({ n: "splash", v: s });
  }
  addFx(f: Partial<Fx> & { kind: FxKind; x: number; y: number }) {
    if (this.fx.length > 1400) return;
    this.fx.push({ vx: 0, vy: 0, life: 1, max: 1, size: 3, color: "#fff", rot: 0, vr: 0, ...f });
  }
  private stepFx(dt: number) {
    const t = this.terrain;
    for (const f of this.fx) {
      f.life -= dt; f.rot += f.vr * dt;
      switch (f.kind) {
        case "chip": case "drop": case "spark": case "star":
          f.vy += PHYS.g * (f.kind === "star" ? 0.1 : 1) * dt; f.x += f.vx * dt; f.y += f.vy * dt;
          if (f.kind === "chip" && t && t.solid(f.x, f.y)) { f.vy *= -0.3; f.vx *= 0.5; f.y -= 2; if (Math.abs(f.vy) < 20) f.life = Math.min(f.life, 0.3); }
          if (f.kind === "drop" && f.vy > 0 && f.y > this.waterY) f.life = 0;
          break;
        case "smoke": case "puff": f.x += f.vx * dt; f.y += f.vy * dt; f.vx += this.wind * 25 * dt; f.vy -= 8 * dt; f.vx *= 1 - dt; break;
        case "fire": f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 1 - dt * 3; f.vy = f.vy * (1 - dt * 3) - 60 * dt; break;
        case "text": f.y += f.vy * dt; f.vy *= 1 - dt * 1.5; break;
        case "bubble": f.y += f.vy * dt; f.x += Math.sin(f.life * 12) * 0.4; if (f.y < this.waterY) f.life = 0; break;
        case "plane": f.x += f.vx * dt; break;
        default: break;
      }
    }
    this.fx = this.fx.filter(f => f.life > 0);
  }

  setBanner(text: string, color: string, t: number) { this.banner = text; this.bannerColor = color; this.bannerT = t; }
  private log(text: string, color: string) { this.feed.unshift({ text, color, until: this.time + 5 }); this.feed = this.feed.slice(0, 5); }

  // ── CPU brain ─────────────────────────────────────────────────────────────
  private stepAi(dt: number) {
    const team = this.activeTeam, w = this.active, ai = this.ai;
    if (!team || team.kind !== "cpu" || !w || w.state !== "ok") return;
    const k = team.keys;
    if (this.phase === "retreat") {
      // Run away from close-range blasts.
      const hit = ai.plan?.impact;
      if (hit && Math.abs(hit.x - w.x) < 120 && w.grounded) { k.delete(hit.x > w.x ? "right" : "left"); k.add(hit.x > w.x ? "left" : "right"); }
      return;
    }
    ai.t -= dt;
    switch (ai.stage) {
      case "think":
        if (ai.t > 0) return;
        ai.plan = this.plan(team, w);
        if (ai.plan.score < 12 && !ai.walked) {
          const foe = this.nearestEnemy(w);
          ai.walked = true;
          if (foe) { k.add(foe.x < w.x ? "left" : "right"); ai.stage = "walk"; ai.t = 1.6 + this.random() * 1.6; return; }
        }
        ai.stage = "arm"; ai.t = 0.45;
        return;
      case "walk":
        if (ai.t > 0 && this.turnT > 12) {
          if (this.random() < dt * 0.6 && w.grounded) { this.press(team, "jump", true); this.press(team, "jump", false); }
          return;
        }
        k.delete("left"); k.delete("right");
        if (!w.grounded) return;
        ai.plan = this.plan(team, w);
        ai.stage = "arm"; ai.t = 0.45;
        return;
      case "arm": {
        if (ai.t > 0) return;
        const p = ai.plan!;
        if (p.score <= 0) p.weapon = "skip";
        this.chooseWeapon(team, p.weapon);
        team.fuse = p.fuse;
        w.face = p.face;
        ai.stage = this.targeting ? "cursor" : WEAPON[p.weapon].aims ? "aim" : "shoot"; ai.t = 0.35;
        return;
      }
      case "cursor": {
        const p = ai.plan!, tg = p.target!;
        const dx = tg.x - this.cursor.x, dy = tg.y - this.cursor.y, dist = Math.hypot(dx, dy), s = PHYS.cursor * dt * 0.8;
        if (dist > s) { this.cursor.x += (dx / dist) * s; this.cursor.y += (dy / dist) * s; return; }
        this.cursor = { ...tg };
        this.press(team, "fire", true); this.press(team, "fire", false);
        ai.stage = p.weapon === "homing" ? "aim" : "done"; ai.t = 0.4;
        return;
      }
      case "aim": {
        const p = ai.plan!, s = PHYS.aimSpeed * dt;
        if (Math.abs(w.aim - p.aim) > s) { w.aim += Math.sign(p.aim - w.aim) * s; return; }
        w.aim = p.aim;
        if (ai.t > 0) return;
        ai.stage = WEAPON[p.weapon].mode === "charge" || p.weapon === "homing" ? "charge" : "shoot"; ai.t = 0.25;
        if (ai.stage === "charge") this.press(team, "fire", true);
        return;
      }
      case "charge":
        if (this.power >= ai.plan!.power || !this.charging) { if (this.charging) this.press(team, "fire", false); ai.stage = "done"; }
        return;
      case "shoot": {
        if (ai.t > 0) return;
        const p = ai.plan!;
        this.press(team, "fire", true); this.press(team, "fire", false);
        ai.shots++;
        if (p.weapon === "shotgun" && ai.shots < 2) { ai.t = 0.9; ai.plan = this.plan(team, w, ["shotgun"]); return; }
        if (p.weapon === "jetpack" || p.weapon === "sheep") { ai.stage = "done"; return; }
        ai.stage = "done";
        return;
      }
      case "done":
        if (this.jetOn) this.press(team, "fire", true);
        if (this.projs.some(p => p.kind === "sheep" && p.team === team.idx)) {
          const sheep = this.projs.find(p => p.kind === "sheep" && p.team === team.idx)!;
          if (this.worms.some(o => o.team !== team.idx && o.state === "ok" && Math.hypot(o.x - sheep.x, o.y - sheep.y) < 40)) this.press(team, "fire", true);
        }
        return;
    }
  }

  private nearestEnemy(w: Worm) {
    let best: Worm | null = null, bd = Infinity;
    for (const o of this.worms) if (o.team !== w.team && o.state === "ok") { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  /** Scores a blast at (x,y): damage to enemies minus (heavily weighted) damage to friends. */
  private blastScore(x: number, y: number, R: number, D: number, team: number) {
    let s = 0;
    for (const o of this.worms) {
      if (o.state !== "ok") continue;
      const d = Math.max(0, Math.hypot(o.x - x, o.y - y) - PHYS.wormR);
      if (d >= R) continue;
      const dmg = D * (1 - d / R), kill = dmg >= o.hp, wet = o.y > this.waterY - 140 ? 8 : 0;
      if (o.team === team) s -= dmg * 1.8 + (kill ? 70 : 0); else s += dmg + (kill ? 45 : 0) + wet;
    }
    for (const b of this.barrels) if (Math.hypot(b.x - x, b.y - y) < R + 9) for (const o of this.worms) if (o.state === "ok" && Math.hypot(o.x - b.x, o.y - b.y) < 70) s += o.team === team ? -25 : 15;
    return s;
  }

  plan(team: Team, w: Worm, only?: WeaponId[]): AiPlan {
    const t = this.terrain!, round = this.round;
    const have = (id: WeaponId) => team.ammo[id] !== 0 && WEAPON[id].delay < round && (!only || only.includes(id));
    let best: AiPlan = { weapon: "skip", face: w.face, aim: 0, power: 0, fuse: 3, target: null, score: 0 };
    const consider = (p: AiPlan) => { if (p.score > best.score) best = p; };
    const enemies = this.worms.filter(o => o.team !== team.idx && o.state === "ok");
    const sx = w.x, sy = w.y - 2;
    let closest: { d: number; plan: AiPlan | null } = { d: Infinity, plan: null };
    const costs: Partial<Record<WeaponId, number>> = { cluster: 6, banana: 16, holy: 22, airstrike: 12, homing: 8, bat: 4 };

    // Ballistic weapons: sweep angle × power through the real integrator.
    const ballistic: [WeaponId, ProjKind, number][] = [["bazooka", "rocket", 12], ["grenade", "grenade", 3], ["cluster", "cluster", 3], ["banana", "banana", 3], ["holy", "holy", 3]];
    for (const [id, kind, fuse] of ballistic) {
      if (!have(id)) continue;
      const def = PROJ[kind];
      for (const face of [1, -1] as const) for (let aim = -1.4; aim <= 0.7; aim += 0.1) for (let pow = 0.2; pow <= 1.001; pow += 0.075) {
        const a = face === 1 ? aim : Math.PI - aim, dx = Math.cos(a), dy = Math.sin(a), sp = PHYS.maxPow * pow;
        const p: Proj = { id: 0, kind, x: sx + dx * 13, y: sy + dy * 13, vx: dx * sp, vy: dy * sp, t: 0, fuse, owner: w.id, team: team.idx, rot: 0, resting: false, target: null, face, grounded: false, hop: 0, trail: 0, bounced: 0, stuck: 0 };
        let ev: string | null = null;
        for (let i = 0; i < 240 && !ev; i++) ev = integrate(p, 1 / 30, this.wind, t, this.waterY, this.worms);
        if (ev !== "explode") continue;
        let score = this.blastScore(p.x, p.y, def.R, def.D, team.idx);
        if (kind === "cluster" || kind === "banana") score += this.blastScore(p.x, p.y - 10, kind === "banana" ? 90 : 60, kind === "banana" ? 40 : 18, team.idx) * 1.2;
        score -= costs[id] ?? 0;
        consider({ weapon: id, face, aim, power: pow, fuse, target: null, score: score + this.random() * 2, impact: { x: p.x, y: p.y } });
        if (id === "bazooka" || id === "grenade") {
          const selfD = Math.hypot(p.x - w.x, p.y - w.y);
          if (selfD > def.R + 10) for (const e of enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < closest.d) closest = { d, plan: { weapon: id, face, aim, power: pow, fuse, target: null, score: 1, impact: { x: p.x, y: p.y } } };
          }
        }
      }
    }
    // Direct-fire and targeted options per enemy.
    for (const e of enemies) {
      const dx = e.x - sx, dy = e.y - sy, dist = Math.hypot(dx, dy);
      const face = dx >= 0 ? 1 : -1, ang = Math.atan2(dy, Math.abs(dx));
      if (have("shotgun") && dist < 650 && Math.abs(ang) < 1.5) {
        const hit = t.raycast(sx + (dx / dist) * 10, sy + (dy / dist) * 10, dx / dist, dy / dist, dist - 6);
        if (!hit) consider({ weapon: "shotgun", face: face as 1 | -1, aim: ang, power: 0, fuse: 3, target: null, score: 25 + (25 >= e.hp ? 40 : 0) + (e.y > this.waterY - 140 ? 10 : 0) });
      }
      if (have("bat") && dist < 22) consider({ weapon: "bat", face: face as 1 | -1, aim: -0.6, power: 0, fuse: 3, target: null, score: 30 + (30 >= e.hp ? 45 : 18) - 4 });
      if (have("airstrike") && !t.raycast(e.x, e.y - 12, 0, -1, e.y)) {
        const s = this.blastScore(e.x, e.y, 38, 30, team.idx) * 2.2 - costs.airstrike!;
        consider({ weapon: "airstrike", face: (w.x < e.x ? 1 : -1), aim: 0, power: 0, fuse: 3, target: { x: e.x, y: e.y }, score: s });
      }
      if (have("homing") && dist > 150) {
        const s = this.blastScore(e.x, e.y, 52, 50, team.idx) * 0.8 - costs.homing!;
        consider({ weapon: "homing", face: face as 1 | -1, aim: -1.1, power: 0.55, fuse: 3, target: { x: e.x, y: e.y }, score: s });
      }
    }
    if (best.score <= 0 && closest.plan) best = closest.plan;
    // A little human error.
    if (best.weapon !== "skip" && WEAPON[best.weapon].mode === "charge") { best.aim += (this.random() - 0.5) * 0.04; best.power = Math.max(0.12, Math.min(1, best.power + (this.random() - 0.5) * 0.03)); }
    return best;
  }

  // ── Read models for HUD / phones ──────────────────────────────────────────
  snapshot() {
    const t = this.activeTeam, w = this.active;
    return {
      phase: this.phase, theme: this.theme, wormsPer: this.wormsPer, turnTime: this.turnTime, cpus: this.cpus, keyboard: this.keyboard,
      humans: this.humans.map((h, i) => ({ id: h.player.id, name: h.player.name, color: h.player.color, ready: h.ready, seated: i < RULES.maxTeams - (this.keyboard ? 1 : 0) })),
      teamCount: this.teamCount(),
      teams: this.teams.map(t => ({ idx: t.idx, name: t.name, color: t.color, kind: t.kind, hp: t.worms.reduce((s, w) => s + (w.state === "ok" ? Math.max(0, Math.ceil(w.shown)) : 0), 0), max: this.wormsPer * RULES.hp, alive: t.worms.filter(w => w.state === "ok").length, kills: t.kills, dealt: t.dealt })),
      current: this.current, wormName: w?.name ?? "", weapon: t?.weapon ?? "bazooka", fuse: t?.fuse ?? 3,
      ammo: t ? { ...t.ammo } : startingAmmo(), round: this.round,
      timer: Math.max(0, Math.ceil(this.phase === "retreat" ? this.phaseT : this.turnT)), retreat: this.phase === "retreat",
      wind: this.wind, power: this.power, charging: this.charging, targeting: this.targeting, shotsLeft: this.shotsLeft, jet: this.jetOn ? this.jet : 0,
      banner: this.bannerT > 0 ? this.banner : "", bannerColor: this.bannerColor, feed: this.feed.map(f => ({ text: f.text, color: f.color })),
      winner: this.winner, suddenDeath: this.suddenDeath && this.phase !== "lobby", canRematch: this.phase === "gameover" && this.phaseT <= 0,
    };
  }

  status(playerId: string) {
    const s = this.snapshot();
    const h = s.humans.find(h => h.id === playerId);
    const team = this.teamOf(playerId);
    const mine = team && team.idx === this.current && ["turnstart", "turn", "retreat"].includes(this.phase);
    return {
      playerId, phase: this.phase, seated: this.phase === "lobby" ? !!h?.seated : !!team, ready: !!h?.ready,
      theme: THEMES[this.theme].name, wormsPer: this.wormsPer, turnTime: this.turnTime, isHost: this.humans[0]?.player.id === playerId,
      teamName: team?.name ?? h?.name ?? "", color: team?.color ?? h?.color ?? "#fff",
      myTurn: !!mine, playing: this.teams[this.current]?.name ?? "", playingColor: this.teams[this.current]?.color ?? "#fff",
      wormName: mine ? s.wormName : "", weapon: team?.weapon ?? "bazooka", fuse: team?.fuse ?? 3,
      ammo: team ? { ...team.ammo } : startingAmmo(), locked: WEAPONS.filter(w => w.delay >= this.round).map(w => w.id),
      timer: s.timer, retreat: s.retreat, wind: Math.round(this.wind * 100) / 100, power: Math.round(this.power * 100) / 100, charging: this.charging,
      targeting: !!mine && this.targeting, shotsLeft: this.shotsLeft, jet: mine && this.jetOn ? Math.ceil(this.jet * 20) / 20 : 0,
      sheep: !!team && this.projs.some(p => p.kind === "sheep" && p.team === team.idx),
      teams: s.teams.map(t => ({ name: t.name, color: t.color, hp: t.hp, max: t.max, alive: t.alive })),
      myHp: team ? s.teams[team.idx].hp : 0,
      winner: this.winner !== null ? this.teams[this.winner].name : null, isWinner: !!team && this.winner === team.idx,
      canRematch: s.canRematch,
    };
  }
}

// ── Pure projectile integrator (shared by live sim and CPU lookahead) ─────────
export function integrate(p: Proj, dt: number, wind: number, t: Terrain, waterY: number, worms: Worm[] | null): "explode" | "water" | "out" | null {
  const d = PROJ[p.kind];
  p.t += dt;
  if (p.kind !== "rocket" && p.kind !== "homing" && p.kind !== "missile" && p.kind !== "clusterlet" && p.kind !== "bananette" && p.t >= p.fuse) return "explode";
  if (p.t >= p.fuse && (p.kind === "rocket" || p.kind === "homing" || p.kind === "missile")) return "explode";
  if (p.resting) {
    if (t.solid(p.x, p.y + d.r + 1)) return null;
    p.resting = false;
  }
  const homing = p.kind === "homing" && p.target && p.t > 0.55 && p.t < 5;
  if (homing) {
    const want = Math.atan2(p.target!.y - p.y, p.target!.x - p.x), cur = Math.atan2(p.vy, p.vx);
    let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const na = cur + Math.max(-4.2 * dt, Math.min(4.2 * dt, da)), sp = Math.min(560, Math.hypot(p.vx, p.vy) + 400 * dt);
    p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
  }
  const n = Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 2) + 1, h = dt / n;
  for (let i = 0; i < n; i++) {
    if (!homing) { p.vy += PHYS.g * h; p.vx += wind * PHYS.wind * d.wind * h; }
    const nx = p.x + p.vx * h, ny = p.y + p.vy * h;
    if (worms && d.hitsWorms) {
      for (const w of worms) {
        if (w.state !== "ok" || (w.id === p.owner && p.t < 0.25)) continue;
        if ((w.x - nx) ** 2 + (w.y - ny) ** 2 < (PHYS.wormR + d.r) ** 2) { p.x = nx; p.y = ny; return "explode"; }
      }
    }
    if (t.solid(nx, ny)) {
      if (d.bounce === null) { p.x = nx; p.y = ny; return "explode"; }
      const nr = t.normalAt(nx, ny, 4), vn = p.vx * nr.x + p.vy * nr.y;
      if (vn < 0) {
        p.bounced = Math.max(p.bounced, -vn);
        p.vx -= (1 + d.bounce) * vn * nr.x; p.vy -= (1 + d.bounce) * vn * nr.y;
        const tx = -nr.y, ty = nr.x, vt = p.vx * tx + p.vy * ty;
        p.vx -= vt * tx * 0.18; p.vy -= vt * ty * 0.18;
      }
      for (let k = 0; k < 6 && t.solid(p.x, p.y); k++) { p.x += nr.x; p.y += nr.y; }
      if (Math.hypot(p.vx, p.vy) < 28 && nr.y < -0.4) { p.vx = 0; p.vy = 0; p.resting = true; return null; }
      continue;
    }
    p.x = nx; p.y = ny;
    if (p.y > waterY) return "water";
    if (p.x < -400 || p.x > W + 400 || p.y > H + 60) return "out";
  }
  return null;
}

export type WormsSnapshot = ReturnType<WormsEngine["snapshot"]>;
export type WormsStatusData = ReturnType<WormsEngine["status"]>;

function pick<T>(arr: T[], r: () => number) { return arr[Math.floor(r() * arr.length)]; }
