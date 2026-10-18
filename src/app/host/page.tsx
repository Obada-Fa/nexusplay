"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { getSocket, destroySocket } from "@/lib/socket";
import type { SnakeState, Point, FoodOrb, GameInfo, PongState, PaddleDir, DashState, DashObstacle, PolarBashState, PolarBear } from "@/types/socket";

// ─── Game Registry ──────────────────────────────────────────────────────────
const GAMES: GameInfo[] = [
  {
    id: "snake",
    name: "SlitherPlay",
    icon: "🐍",
    description: "Eat orbs, grow longer, don't crash. Classic snake multiplayer.",
    color: "#8b5cf6",
  },
  {
    id: "dash",
    name: "DashZone",
    icon: "🔷",
    description: "Tap to jump. Dodge obstacles. One-button rhythm runner.",
    color: "#ef4444",
  },
  {
    id: "pong",
    name: "PongArena",
    icon: "🏓",
    description: "Two-player paddle battle. First to 5 wins.",
    color: "#f59e0b",
  },
  {
    id: "polarbash",
    name: "PolarBash",
    icon: "🐻‍❄️",
    description: "Ram polar bears off shrinking ice. Last bear standing wins.",
    color: "#38bdf8",
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_SPEED = 1.25;
const BOOST_SPEED = 5.0;
const TURN_SPEED = 0.12;
const SNAKE_RADIUS = 12;
const SEGMENT_SPACING = 6;
const FOOD_RADIUS = 5;
const INITIAL_LENGTH = 8;
const FOOD_VALUE = 5;
const MAX_FOOD = 150;
const ARENA_BG = "#0d0d1a";

// ─── Pong Constants ──────────────────────────────────────────────────────────
const PADDLE_WIDTH = 14;
const PADDLE_HEIGHT = 90;
const BALL_SIZE = 8;
const PADDLE_SPEED = 5;
const BALL_SPEED_X = 4;
const WIN_SCORE = 5;
const PONG_MARGIN = 30;

// ─── DashZone Constants ─────────────────────────────────────────────────────
const DASH_CUBE_SIZE = 32;
const DASH_GRAVITY = 0.75;
const DASH_JUMP_VEL = -13;
const DASH_SCROLL = 7;
const DASH_OBSTACLE_MIN_GAP = 220;
const DASH_OBSTACLE_MAX_GAP = 420;
const DASH_GROUND_PCT = 0.25;
const DASH_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

// ─── PolarBash Constants ────────────────────────────────────────────────────
const POLAR_BEAR_RADIUS = 26;
const POLAR_ARENA_FRAC = 0.42;
const POLAR_ACCEL = 0.18;
const POLAR_MAX_SPEED = 1.8;
const POLAR_FRICTION = 0.94;
const POLAR_DASH_SPEED = 6;
const POLAR_DASH_DURATION = 14;
const POLAR_DASH_COOLDOWN = 80;
const POLAR_SHRINK_DELAY = 720;
const POLAR_SHRINK_RATE = 0.06;
const POLAR_PUSH_FORCE = 1.6;
const POLAR_BEAR_COLORS = ["#38bdf8", "#f472b6", "#a3e635", "#fb923c"];
const POLAR_RX_SCALE = 1.35;
const POLAR_RY_SCALE = 0.82;
const POLAR_ICE_DEPTH = 22;

function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function angleDiff(a: number, b: number): number {
  const diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  return diff < -Math.PI ? diff + 2 * Math.PI : diff;
}

function distSq(p1: Point, p2: Point): number {
  return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

function polarResetRound(state: PolarBashState) {
  state.roundActive = true;
  state.winner = null;
  state.shrinkTimer = 0;
  state.arenaRadius = state.maxArenaRadius;
  state.particles = [];
  const n = state.bears.length;
  const rx = state.arenaRadius * POLAR_RX_SCALE;
  const ry = state.arenaRadius * POLAR_RY_SCALE;
  state.bears.forEach((bear, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    bear.x = state.arenaCx + Math.cos(a) * rx * 0.55;
    bear.y = state.arenaCy + Math.sin(a) * ry * 0.55;
    bear.vx = 0;
    bear.vy = 0;
    bear.angle = a + Math.PI;
    bear.targetAngle = bear.angle;
    bear.isAlive = true;
    bear.isDashing = false;
    bear.dashCooldown = 0;
    bear.dashTimer = 0;
  });
}

function polarStepPhysics(state: PolarBashState, inputs: Map<string, number>) {
  if (!state.roundActive) return;

  state.shrinkTimer++;
  if (state.shrinkTimer > POLAR_SHRINK_DELAY && state.arenaRadius > 60) {
    state.arenaRadius -= POLAR_SHRINK_RATE;
  }

  for (const bear of state.bears) {
    if (!bear.isAlive) continue;

    if (bear.playerId && inputs.has(bear.playerId)) {
      bear.targetAngle = inputs.get(bear.playerId)!;
    } else {
      const dx = state.arenaCx - bear.x;
      const dy = state.arenaCy - bear.y;
      const erx = state.arenaRadius * POLAR_RX_SCALE * 0.7;
      const ery = state.arenaRadius * POLAR_RY_SCALE * 0.7;
      const ellipseDist = (dx * dx) / (erx * erx) + (dy * dy) / (ery * ery);
      if (ellipseDist > 1) {
        bear.targetAngle = Math.atan2(dy, dx);
      } else {
        let nearest: PolarBear | null = null;
        let bestD = Infinity;
        for (const o of state.bears) {
          if (o === bear || !o.isAlive) continue;
          const d = (o.x - bear.x) ** 2 + (o.y - bear.y) ** 2;
          if (d < bestD) { bestD = d; nearest = o; }
        }
        if (nearest) {
          bear.targetAngle = Math.atan2(nearest.y - bear.y, nearest.x - bear.x);
        }
      }
      if (bear.dashCooldown <= 0 && !bear.isDashing && Math.random() < 0.01) {
        bear.isDashing = true;
        bear.dashTimer = POLAR_DASH_DURATION;
        bear.dashCooldown = POLAR_DASH_COOLDOWN;
        bear.vx = Math.cos(bear.angle) * POLAR_DASH_SPEED;
        bear.vy = Math.sin(bear.angle) * POLAR_DASH_SPEED;
      }
    }

    let diff = bear.targetAngle - bear.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bear.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.12);

    if (bear.isDashing) {
      bear.dashTimer--;
      if (bear.dashTimer <= 0) bear.isDashing = false;
    } else {
      bear.vx += Math.cos(bear.angle) * POLAR_ACCEL;
      bear.vy += Math.sin(bear.angle) * POLAR_ACCEL;
      const speed = Math.sqrt(bear.vx * bear.vx + bear.vy * bear.vy);
      if (speed > POLAR_MAX_SPEED) {
        bear.vx = (bear.vx / speed) * POLAR_MAX_SPEED;
        bear.vy = (bear.vy / speed) * POLAR_MAX_SPEED;
      }
      bear.vx *= POLAR_FRICTION;
      bear.vy *= POLAR_FRICTION;
    }
    if (bear.dashCooldown > 0) bear.dashCooldown--;
  }

  for (const bear of state.bears) {
    if (!bear.isAlive) continue;
    bear.x += bear.vx;
    bear.y += bear.vy;
  }

  for (let i = 0; i < state.bears.length; i++) {
    const a = state.bears[i];
    if (!a.isAlive) continue;
    for (let j = i + 1; j < state.bears.length; j++) {
      const b = state.bears[j];
      if (!b.isAlive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.radius + b.radius;
      if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        const aForce = a.isDashing ? POLAR_PUSH_FORCE * 2.5 : POLAR_PUSH_FORCE;
        const bForce = b.isDashing ? POLAR_PUSH_FORCE * 2.5 : POLAR_PUSH_FORCE;
        a.vx -= nx * bForce;
        a.vy -= ny * bForce;
        b.vx += nx * aForce;
        b.vy += ny * aForce;
        for (let k = 0; k < 5; k++) {
          state.particles.push({
            x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
            vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
            life: 1, color: "#ffffff", size: Math.random() * 3 + 2,
          });
        }
      }
    }
  }

  for (const bear of state.bears) {
    if (!bear.isAlive) continue;
    const dx = bear.x - state.arenaCx;
    const dy = bear.y - state.arenaCy;
    const erx = state.arenaRadius * POLAR_RX_SCALE - bear.radius * 0.4;
    const ery = state.arenaRadius * POLAR_RY_SCALE - bear.radius * 0.4;
    const ellipseDist = (dx * dx) / (erx * erx) + (dy * dy) / (ery * ery);
    if (ellipseDist > 1) {
      bear.isAlive = false;
      bear.falls++;
      for (let k = 0; k < 15; k++) {
        state.particles.push({
          x: bear.x, y: bear.y,
          vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
          life: 1, color: bear.color, size: Math.random() * 4 + 2,
        });
      }
    }
  }

  const alive = state.bears.filter(b => b.isAlive);
  if (alive.length <= 1) {
    state.roundActive = false;
    state.winner = alive.length === 1 ? alive[0].name : null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HostPage() {
  const [roomCode] = useState<string>(generateRoomCode);
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [joinUrl, setJoinUrl] = useState<string>("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; score: number; color: string }[]>([]);

  // Gallery state
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const galleryIndexRef = useRef(0);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const activeGameRef = useRef<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const snakeLoopRef = useRef<((timestamp: number) => void) | null>(null);
  const pongLoopRef = useRef<(() => void) | null>(null);
  
  const snakesRef = useRef<Map<string, SnakeState>>(new Map());
  const foodRef = useRef<FoodOrb[]>([]);
  const lastTimeRef = useRef<number>(0);

  const pongInputRef = useRef<Map<string, PaddleDir>>(new Map());
  const pongInitializedRef = useRef(false);
  const pongStateRef = useRef<PongState>({
    leftPaddleY: 0, rightPaddleY: 0,
    ballX: 0, ballY: 0,
    ballVx: BALL_SPEED_X, ballVy: 0,
    leftScore: 0, rightScore: 0,
    leftPlayerId: null, rightPlayerId: null,
    leftPlayerName: "Player 1", rightPlayerName: "AI",
  });

  const dashStateRef = useRef<DashState>({
    cubeY: 0, cubeVy: 0, cubeOnGround: true,
    obstacles: [], score: 0, running: false,
    particles: [], groundY: 0, cubeSize: DASH_CUBE_SIZE, hueShift: 0,
  });
  const dashInitializedRef = useRef(false);
  const dashLoopRef = useRef<(() => void) | null>(null);

  const polarStateRef = useRef<PolarBashState>({
    bears: [],
    arenaCx: 0, arenaCy: 0,
    arenaRadius: 0, maxArenaRadius: 0,
    shrinkTimer: 0,
    roundActive: false,
    winner: null,
    initialized: false,
    particles: [],
    snowParticles: [],
  });
  const polarLoopRef = useRef<(() => void) | null>(null);
  const polarInputRef = useRef<Map<string, number>>(new Map());

  // Sync ref with state
  useEffect(() => { galleryIndexRef.current = galleryIndex; }, [galleryIndex]);
  useEffect(() => { activeGameRef.current = activeGame; }, [activeGame]);
  // ─── QR Code generation ──────────────────────────────────────────────────
  useEffect(() => {
    async function buildJoinUrl() {
      let host = window.location.hostname;
      try {
        const res = await fetch("/api/local-ip");
        const data = await res.json();
        if (data.ip && data.ip !== "localhost") host = data.ip;
      } catch {
        // Fallback
      }
      const url = `http://${host}:${window.location.port || 3000}/join?code=${roomCode}`;
      setJoinUrl(url);
      QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
        color: { dark: "#ffffff", light: "#1a1a2e" },
      }).then(setQrDataUrl);
    }
    buildJoinUrl();
  }, [roomCode]);

  // ─── Socket setup ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    socket.connect();

    socket.on("connect", () => {
      socket.emit("host_create_room", { roomCode });
    });

    socket.on("room_created", () => {
      setStatus("ready");
    });

    socket.on("connect_error", () => {
      setStatus("error");
    });

    socket.on("player_joined", ({ player }) => {
      const canvas = canvasRef.current;
      const w = canvas?.width ?? 800;
      const h = canvas?.height ?? 500;

      const newSnake: SnakeState = {
        player,
        segments: [{ x: Math.random() * (w - 100) + 50, y: Math.random() * (h - 100) + 50 }],
        angle: Math.random() * Math.PI * 2,
        targetAngle: Math.random() * Math.PI * 2,
        targetLength: INITIAL_LENGTH,
        isBoosting: false,
        score: 0,
        isDead: false,
      };
      
      snakesRef.current.set(player.id, newSnake);
      setPlayerCount(snakesRef.current.size);

      if (activeGameRef.current === "pong") {
        const state = pongStateRef.current;
        if (!state.leftPlayerId) {
          state.leftPlayerId = player.id;
          state.leftPlayerName = player.name;
          socket.emit("assign_pong_side", { roomCode, playerId: player.id, side: "left" });
        } else if (!state.rightPlayerId) {
          state.rightPlayerId = player.id;
          state.rightPlayerName = player.name;
          socket.emit("assign_pong_side", { roomCode, playerId: player.id, side: "right" });
        }
      }

      if (activeGameRef.current === "polarbash") {
        const ps = polarStateRef.current;
        const aiBear = ps.bears.find(b => b.playerId === null);
        if (aiBear) {
          aiBear.playerId = player.id;
          aiBear.name = player.name;
        }
      }
    });

    socket.on("player_left", ({ playerId }) => {
      snakesRef.current.delete(playerId);
      setPlayerCount(snakesRef.current.size);
      const state = pongStateRef.current;
      if (state.leftPlayerId === playerId) {
        state.leftPlayerId = null;
        state.leftPlayerName = "Player 1";
      }
      if (state.rightPlayerId === playerId) {
        state.rightPlayerId = null;
        state.rightPlayerName = "AI";
      }
      const ps = polarStateRef.current;
      const bear = ps.bears.find(b => b.playerId === playerId);
      if (bear) {
        bear.playerId = null;
        bear.name = `AI ${bear.slot + 1}`;
      }
      polarInputRef.current.delete(playerId);
    });

    // ── Gallery navigation ────────────────────────────────────────────────
    socket.on("gallery_navigate", ({ direction }) => {
      setGalleryIndex((prev) => {
        const next = direction === "left"
          ? (prev - 1 + GAMES.length) % GAMES.length
          : (prev + 1) % GAMES.length;
        return next;
      });
    });

    socket.on("gallery_select", () => {
      const idx = galleryIndexRef.current;
      setActiveGame(GAMES[idx].id);
      socket.emit("game_started", { gameIndex: idx, gameName: GAMES[idx].name });
    });

    socket.on("gallery_back", () => {
      setActiveGame(null);
      // Clear snakes when leaving game
      snakesRef.current.clear();
      foodRef.current = [];
      pongInputRef.current.clear();
      pongInitializedRef.current = false;
      const state = pongStateRef.current;
      state.leftScore = 0;
      state.rightScore = 0;
      state.leftPlayerId = null;
      state.rightPlayerId = null;
      state.leftPlayerName = "Player 1";
      state.rightPlayerName = "AI";
      const ds = dashStateRef.current;
      ds.running = false;
      ds.obstacles = [];
      ds.particles = [];
      ds.score = 0;
      dashInitializedRef.current = false;
      const pol = polarStateRef.current;
      pol.bears = [];
      pol.particles = [];
      pol.snowParticles = [];
      pol.roundActive = false;
      pol.winner = null;
      pol.initialized = false;
      polarInputRef.current.clear();
      socket.emit("game_ended", { roomCode });
    });

    // ── Gameplay events ───────────────────────────────────────────────────
    socket.on("player_steer", ({ playerId, angle }) => {
      if (activeGameRef.current === "polarbash") {
        if (angle !== null) polarInputRef.current.set(playerId, angle);
        return;
      }
      const snake = snakesRef.current.get(playerId);
      if (snake && !snake.isDead) {
        if (angle !== null) {
          snake.targetAngle = angle;
        }
      }
    });

    socket.on("player_boost_start", ({ playerId }) => {
      if (activeGameRef.current === "polarbash") {
        const ps = polarStateRef.current;
        if (!ps.roundActive) {
          // Restart round after winner
          polarResetRound(ps);
          return;
        }
        const bear = ps.bears.find(b => b.playerId === playerId && b.isAlive);
        if (bear && bear.dashCooldown <= 0 && !bear.isDashing) {
          bear.isDashing = true;
          bear.dashTimer = POLAR_DASH_DURATION;
          bear.dashCooldown = POLAR_DASH_COOLDOWN;
          bear.vx = Math.cos(bear.angle) * POLAR_DASH_SPEED;
          bear.vy = Math.sin(bear.angle) * POLAR_DASH_SPEED;
        }
        return;
      }
      const snake = snakesRef.current.get(playerId);
      if (snake && !snake.isDead) snake.isBoosting = true;
    });

    socket.on("player_boost_end", ({ playerId }) => {
      const snake = snakesRef.current.get(playerId);
      if (snake && !snake.isDead) snake.isBoosting = false;
    });

    socket.on("player_respawn_request", ({ playerId }) => {
      if (activeGameRef.current === "dash") {
        const state = dashStateRef.current;
        state.running = true;
        state.score = 0;
        state.obstacles = [];
        state.particles = [];
        state.cubeY = 0;
        state.cubeVy = 0;
        state.cubeOnGround = true;
        state.hueShift = 0;
        dashInitializedRef.current = false;
        return;
      }
      if (activeGameRef.current === "polarbash") {
        polarResetRound(polarStateRef.current);
        return;
      }
      const snake = snakesRef.current.get(playerId);
      if (snake && snake.isDead) {
        const canvas = canvasRef.current;
        const w = canvas?.width ?? 800;
        const h = canvas?.height ?? 500;
        snake.isDead = false;
        snake.segments = [{ x: Math.random() * (w - 100) + 50, y: Math.random() * (h - 100) + 50 }];
        snake.targetLength = INITIAL_LENGTH;
        snake.score = 0;
        snake.isBoosting = false;
      }
    });

    socket.on("player_pong_move", ({ playerId, direction }) => {
      pongInputRef.current.set(playerId, direction);
    });

    socket.on("player_dash_jump", () => {
      const state = dashStateRef.current;
      if (!state.running) {
        // Restart on tap after death
        state.running = true;
        state.score = 0;
        state.obstacles = [];
        state.particles = [];
        state.cubeY = 0;
        state.cubeVy = 0;
        state.cubeOnGround = true;
        state.hueShift = 0;
        dashInitializedRef.current = false;
        return;
      }
      if (state.cubeOnGround) {
        state.cubeVy = DASH_JUMP_VEL;
        state.cubeOnGround = false;
        for (let i = 0; i < 6; i++) {
          state.particles.push({
            x: DASH_CUBE_SIZE, y: state.groundY - state.cubeY,
            vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 1,
            life: 1, color: "#ffffff", size: Math.random() * 3 + 2,
          });
        }
      }
    });

    socket.on("room_closed", () => {
      setStatus("error");
    });

    return () => {
      socket.off("connect");
      socket.off("room_created");
      socket.off("connect_error");
      socket.off("player_joined");
      socket.off("player_left");
      socket.off("gallery_navigate");
      socket.off("gallery_select");
      socket.off("gallery_back");
      socket.off("player_steer");
      socket.off("player_boost_start");
      socket.off("player_boost_end");
      socket.off("player_respawn_request");
      socket.off("player_pong_move");
      socket.off("player_dash_jump");
      socket.off("room_closed");
      destroySocket();
    };
  }, [roomCode]);

  // ─── Game Engine Loop ────────────────────────────────────────────────────
  const gameLoop = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    lastTimeRef.current = timestamp;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // 1. Spawner Logic
    if (foodRef.current.length < MAX_FOOD) {
      if (Math.random() < 0.1) {
        foodRef.current.push({
          id: generateId(),
          x: Math.random() * (W - 20) + 10,
          y: Math.random() * (H - 20) + 10,
          color: `hsl(${Math.random() * 360}, 80%, 60%)`,
          value: FOOD_VALUE,
        });
      }
    }

    // 2. Physics & State Updates
    const snakes = Array.from(snakesRef.current.values()).filter(s => !s.isDead);
    
    snakes.forEach((snake) => {
      const head = snake.segments[0];

      const diff = angleDiff(snake.angle, snake.targetAngle);
      if (Math.abs(diff) <= TURN_SPEED) {
        snake.angle = snake.targetAngle;
      } else {
        snake.angle += Math.sign(diff) * TURN_SPEED;
      }

      let speed = BASE_SPEED;
      if (snake.isBoosting && snake.targetLength > INITIAL_LENGTH + 2) {
        speed = BOOST_SPEED;
        snake.targetLength -= 0.2;
        snake.score = Math.floor(snake.targetLength - INITIAL_LENGTH);
      } else {
        snake.isBoosting = false;
      }

      const newHead = {
        x: head.x + Math.cos(snake.angle) * speed,
        y: head.y + Math.sin(snake.angle) * speed,
      };

      if (snake.segments.length === 1) {
        snake.segments.unshift(newHead);
      } else {
        if (distSq(newHead, snake.segments[1]) >= SEGMENT_SPACING * SEGMENT_SPACING) {
          snake.segments.unshift(newHead);
        } else {
          snake.segments[0] = newHead;
        }
      }

      while (snake.segments.length > Math.floor(snake.targetLength)) {
        snake.segments.pop();
      }

      if (newHead.x < 0 || newHead.x > W || newHead.y < 0 || newHead.y > H) {
        killSnake(snake.player.id, snake);
        return;
      }

      for (let i = foodRef.current.length - 1; i >= 0; i--) {
        const food = foodRef.current[i];
        if (distSq(newHead, food) < (SNAKE_RADIUS + FOOD_RADIUS) ** 2) {
          snake.targetLength += food.value;
          snake.score = Math.floor(snake.targetLength - INITIAL_LENGTH);
          foodRef.current.splice(i, 1);
        }
      }

      for (const other of snakes) {
        if (other.player.id === snake.player.id) continue;
        
        for (let i = 2; i < other.segments.length; i++) {
          const seg = other.segments[i];
          if (distSq(newHead, seg) < (SNAKE_RADIUS * 1.8) ** 2) {
            killSnake(snake.player.id, snake);
            break;
          }
        }
        if (snake.isDead) break;
      }
    });

    function killSnake(id: string, snake: SnakeState) {
      snake.isDead = true;
      
      getSocket().emit("player_died", { playerId: id, score: snake.score });

      snake.segments.forEach((seg, index) => {
        if (index % 3 === 0) {
          foodRef.current.push({
            id: generateId(),
            x: seg.x + (Math.random() * 20 - 10),
            y: seg.y + (Math.random() * 20 - 10),
            color: snake.player.color,
            value: Math.max(1, Math.floor(snake.targetLength / 40)),
          });
        }
      });
    }

    // 3. Rendering
    ctx.fillStyle = ARENA_BG;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    foodRef.current.forEach(food => {
      ctx.shadowColor = food.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(food.x, food.y, FOOD_RADIUS + (food.value > 5 ? 4 : 0), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    snakes.forEach(snake => {
      for (let i = snake.segments.length - 1; i >= 0; i--) {
        const seg = snake.segments[i];
        
        ctx.fillStyle = snake.player.color;
        const sizeRatio = 1 - (i / snake.segments.length) * 0.4;
        const currentRadius = SNAKE_RADIUS * sizeRatio;
        
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, currentRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      const head = snake.segments[0];
      if (!head) return;

      const eyeOffset = SNAKE_RADIUS * 0.6;
      const leftEye = {
        x: head.x + Math.cos(snake.angle - 0.6) * eyeOffset,
        y: head.y + Math.sin(snake.angle - 0.6) * eyeOffset,
      };
      const rightEye = {
        x: head.x + Math.cos(snake.angle + 0.6) * eyeOffset,
        y: head.y + Math.sin(snake.angle + 0.6) * eyeOffset,
      };

      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(leftEye.x, leftEye.y, SNAKE_RADIUS * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rightEye.x, rightEye.y, SNAKE_RADIUS * 0.35, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#000000";
      ctx.beginPath(); ctx.arc(leftEye.x + Math.cos(snake.angle)*(SNAKE_RADIUS*0.15), leftEye.y + Math.sin(snake.angle)*(SNAKE_RADIUS*0.15), SNAKE_RADIUS * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rightEye.x + Math.cos(snake.angle)*(SNAKE_RADIUS*0.15), rightEye.y + Math.sin(snake.angle)*(SNAKE_RADIUS*0.15), SNAKE_RADIUS * 0.15, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(snake.player.name, head.x, head.y - SNAKE_RADIUS - 10);
    });

    if (Math.random() < 0.05) {
      const topSnakes = Array.from(snakesRef.current.values())
        .filter(s => !s.isDead)
        .sort((a, b) => b.score - a.score)
        .map(s => ({ id: s.player.id, name: s.player.name, score: s.score, color: s.player.color }));
      setLeaderboard(topSnakes);
    }

    animFrameRef.current = requestAnimationFrame((t) => snakeLoopRef.current?.(t));
  }, []);

  useEffect(() => {
    if (activeGame === "snake") {
      animFrameRef.current = requestAnimationFrame(gameLoop);
      return () => cancelAnimationFrame(animFrameRef.current);
    }
  }, [activeGame, gameLoop]);

// ─── Pong Game Loop ────────────────────────────────────────────────────────
const pongGameLoop = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  if (W < 100 || H < 100) {
    animFrameRef.current = requestAnimationFrame(() => pongLoopRef.current?.());
    return;
  }

  const state = pongStateRef.current;

  if (!pongInitializedRef.current) {
    state.leftPaddleY = H / 2 - PADDLE_HEIGHT / 2;
    state.rightPaddleY = H / 2 - PADDLE_HEIGHT / 2;
    state.ballX = W / 2;
    state.ballY = H / 2;
    pongInitializedRef.current = true;
  }

  const leftPaddleX = PONG_MARGIN;
  const rightPaddleX = W - PONG_MARGIN - PADDLE_WIDTH;

  // 1. Process inputs
  const inputs = pongInputRef.current;
  for (const [pid, dir] of inputs) {
    if (pid === state.leftPlayerId) {
      if (dir === "up") state.leftPaddleY = Math.max(0, state.leftPaddleY - PADDLE_SPEED);
      else if (dir === "down") state.leftPaddleY = Math.min(H - PADDLE_HEIGHT, state.leftPaddleY + PADDLE_SPEED);
    } else if (pid === state.rightPlayerId) {
      if (dir === "up") state.rightPaddleY = Math.max(0, state.rightPaddleY - PADDLE_SPEED);
      else if (dir === "down") state.rightPaddleY = Math.min(H - PADDLE_HEIGHT, state.rightPaddleY + PADDLE_SPEED);
    }
  }

  // AI for unassigned sides
  if (!state.rightPlayerId) {
    const aiTarget = state.ballY - PADDLE_HEIGHT / 2;
    const diff = aiTarget - state.rightPaddleY;
    if (Math.abs(diff) > PADDLE_SPEED) {
      state.rightPaddleY += Math.sign(diff) * PADDLE_SPEED;
    } else {
      state.rightPaddleY = aiTarget;
    }
    state.rightPaddleY = Math.max(0, Math.min(H - PADDLE_HEIGHT, state.rightPaddleY));
  }
  if (!state.leftPlayerId) {
    const aiTarget = state.ballY - PADDLE_HEIGHT / 2;
    const diff = aiTarget - state.leftPaddleY;
    if (Math.abs(diff) > PADDLE_SPEED) {
      state.leftPaddleY += Math.sign(diff) * PADDLE_SPEED;
    } else {
      state.leftPaddleY = aiTarget;
    }
    state.leftPaddleY = Math.max(0, Math.min(H - PADDLE_HEIGHT, state.leftPaddleY));
  }

  // 2. Move ball
  state.ballX += state.ballVx;
  state.ballY += state.ballVy;

  if (state.ballY - BALL_SIZE <= 0) {
    state.ballY = BALL_SIZE;
    state.ballVy = Math.abs(state.ballVy);
  }
  if (state.ballY + BALL_SIZE >= H) {
    state.ballY = H - BALL_SIZE;
    state.ballVy = -Math.abs(state.ballVy);
  }

  // Left paddle bounce
  if (
    state.ballX - BALL_SIZE <= leftPaddleX + PADDLE_WIDTH &&
    state.ballX + BALL_SIZE >= leftPaddleX &&
    state.ballY >= state.leftPaddleY &&
    state.ballY <= state.leftPaddleY + PADDLE_HEIGHT &&
    state.ballVx < 0
  ) {
    state.ballX = leftPaddleX + PADDLE_WIDTH + BALL_SIZE;
    state.ballVx = -state.ballVx * 1.05;
    const hitPos = (state.ballY - state.leftPaddleY) / PADDLE_HEIGHT - 0.5;
    state.ballVy += hitPos * 2;
  }

  // Right paddle bounce
  if (
    state.ballX + BALL_SIZE >= rightPaddleX &&
    state.ballX - BALL_SIZE <= rightPaddleX + PADDLE_WIDTH &&
    state.ballY >= state.rightPaddleY &&
    state.ballY <= state.rightPaddleY + PADDLE_HEIGHT &&
    state.ballVx > 0
  ) {
    state.ballX = rightPaddleX - BALL_SIZE;
    state.ballVx = -state.ballVx * 1.05;
    const hitPos = (state.ballY - state.rightPaddleY) / PADDLE_HEIGHT - 0.5;
    state.ballVy += hitPos * 2;
  }

  // Clamp speeds
  const maxVy = 6;
  const maxVx = 8;
  state.ballVy = Math.max(-maxVy, Math.min(maxVy, state.ballVy));
  state.ballVx = Math.max(-maxVx, Math.min(maxVx, state.ballVx));

  // Scoring
  if (state.ballX < -50) {
    state.rightScore++;
    state.ballX = W / 2;
    state.ballY = H / 2;
    state.ballVx = BALL_SPEED_X * (Math.random() > 0.5 ? 1 : -1);
    state.ballVy = (Math.random() - 0.5) * 3;
  }
  if (state.ballX > W + 50) {
    state.leftScore++;
    state.ballX = W / 2;
    state.ballY = H / 2;
    state.ballVx = BALL_SPEED_X * (Math.random() > 0.5 ? 1 : -1);
    state.ballVy = (Math.random() - 0.5) * 3;
  }

  // 3. Render
  ctx.fillStyle = "#0d0d1a";
  ctx.fillRect(0, 0, W, H);

  // Center line
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Scores
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = "bold 64px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(state.leftScore), W / 2 - 60, 80);
  ctx.fillText(String(state.rightScore), W / 2 + 60, 80);

  // Player labels
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.leftPlayerName, leftPaddleX + PADDLE_WIDTH / 2, 20);
  ctx.fillText(state.rightPlayerName, rightPaddleX + PADDLE_WIDTH / 2, 20);

  // Paddles
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(leftPaddleX, state.leftPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(rightPaddleX, state.rightPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
  ctx.fill();

  // Ball
  ctx.shadowColor = "#8b5cf6";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#c084fc";
  ctx.beginPath();
  ctx.arc(state.ballX, state.ballY, BALL_SIZE, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Win screen
  if (state.leftScore >= WIN_SCORE || state.rightScore >= WIN_SCORE) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px Inter, sans-serif";
    ctx.textAlign = "center";
    const winner = state.leftScore >= WIN_SCORE ? state.leftPlayerName : state.rightPlayerName;
    ctx.fillText(`${winner} Wins!`, W / 2, H / 2);
    ctx.font = "24px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("Press BACK to return to gallery", W / 2, H / 2 + 60);
    animFrameRef.current = requestAnimationFrame(() => pongLoopRef.current?.());
    return;
  }

  animFrameRef.current = requestAnimationFrame(() => pongLoopRef.current?.());
}, []);

// ─── DashZone Game Loop ────────────────────────────────────────────────────
const dashGameLoop = useCallback(() => {
  // game-loop mutation pattern — intentional
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  if (W < 100 || H < 100) {
    animFrameRef.current = requestAnimationFrame(() => dashLoopRef.current?.());
    return;
  }

  const state = dashStateRef.current;

  if (!dashInitializedRef.current) {
    state.groundY = H * (1 - DASH_GROUND_PCT);
    state.cubeY = state.groundY - DASH_CUBE_SIZE / 2;
    state.cubeVy = 0;
    state.cubeOnGround = true;
    state.obstacles = [];
    state.score = 0;
    state.running = true;
    state.particles = [];
    state.cubeSize = DASH_CUBE_SIZE;
    state.hueShift = 0;
    dashInitializedRef.current = true;
  }

  const groundY = state.groundY;
  const cubeX = 80;
  const cubeCY = state.cubeY;

  // Physics
  if (!state.cubeOnGround) {
    state.cubeVy += DASH_GRAVITY;
    state.cubeY += state.cubeVy;
  }
  if (state.cubeY >= groundY - DASH_CUBE_SIZE / 2) {
    state.cubeY = groundY - DASH_CUBE_SIZE / 2;
    state.cubeVy = 0;
    state.cubeOnGround = true;
  }

  // Scroll obstacles — map new array to avoid lint false-positive on game-loop mutation
  state.obstacles = state.obstacles.map(obs => ({ ...obs, x: obs.x - DASH_SCROLL }));

  // Remove off-screen obstacles
  state.obstacles = state.obstacles.filter(obs => obs.x > -80);

  // Spawn obstacles
  const lastObs = state.obstacles.length > 0 ? state.obstacles[state.obstacles.length - 1] : null;
  const spawnX = lastObs ? lastObs.x + lastObs.width : W + 50;
  if (spawnX < W + 200) {
    const gap = DASH_OBSTACLE_MIN_GAP + Math.random() * (DASH_OBSTACLE_MAX_GAP - DASH_OBSTACLE_MIN_GAP);
    const count = Math.random() < 0.3 ? 3 : Math.random() < 0.5 ? 2 : 1;
    let cx = spawnX + gap;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let type: DashObstacle["type"];
      let w: number, h: number;
      if (r < 0.45) {
        type = "spike";
        w = 28 + Math.random() * 12;
        h = 30 + Math.random() * 30;
      } else if (r < 0.8) {
        type = "block";
        w = 24 + Math.random() * 20;
        h = 30 + Math.random() * 40;
      } else {
        type = "tall";
        w = 14 + Math.random() * 10;
        h = 50 + Math.random() * 40;
      }
      state.obstacles.push({ x: cx, type, width: w, height: h });
      cx += w + 40 + Math.random() * 40;
    }
  }

  // Collision detection
  if (state.running) {
    const cubeLeft = cubeX - DASH_CUBE_SIZE / 2 + 4;
    const cubeRight = cubeX + DASH_CUBE_SIZE / 2 - 4;
    const cubeTop = cubeCY - DASH_CUBE_SIZE / 2 + 4;
    const cubeBottom = cubeCY + DASH_CUBE_SIZE / 2 - 4;

    for (const obs of state.obstacles) {
      const obsLeft = obs.x;
      const obsRight = obs.x + obs.width;
      const obsTop = groundY - obs.height;
      const obsBottom = groundY;

      if (cubeRight > obsLeft && cubeLeft < obsRight && cubeBottom > obsTop && cubeTop < obsBottom) {
        state.running = false;
        // Death particles
        for (let i = 0; i < 20; i++) {
          state.particles.push({
            x: cubeX, y: cubeCY,
            vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.7) * 8,
            life: 1, color: DASH_COLORS[Math.floor(Math.random() * DASH_COLORS.length)],
            size: Math.random() * 5 + 3,
          });
        }
        break;
      }
    }
  }

  if (state.running) {
    state.score += 0.05;
    state.hueShift = (state.hueShift + 0.3) % 360;
  }

  // Update particles
  state.particles = state.particles.map(p => ({
    ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 0.025,
  })).filter(p => p.life > 0);

  // Render
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Ground
  ctx.fillStyle = `hsl(${state.hueShift % 360}, 70%, 15%)`;
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = `hsl(${state.hueShift % 360}, 80%, 40%)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();

  // Obstacles
  for (const obs of state.obstacles) {
    const obsColor = `hsl(${(state.hueShift + 30) % 360}, 80%, 55%)`;
    const obsDark = `hsl(${(state.hueShift + 30) % 360}, 70%, 35%)`;
    ctx.fillStyle = obsDark;
    ctx.strokeStyle = obsColor;
    ctx.lineWidth = 2;

    if (obs.type === "spike") {
      ctx.beginPath();
      ctx.moveTo(obs.x, groundY);
      ctx.lineTo(obs.x + obs.width / 2, groundY - obs.height);
      ctx.lineTo(obs.x + obs.width, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const y = groundY - obs.height;
      ctx.beginPath();
      ctx.roundRect(obs.x, y, obs.width, obs.height, 4);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Particles
  for (const p of state.particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Cube
  if (state.running || state.particles.length > 0) {
    const rot = (state.score * 3) % 360;
    ctx.save();
    ctx.translate(cubeX, cubeCY);
    ctx.rotate((rot * Math.PI) / 180);
    const gradient = ctx.createLinearGradient(-DASH_CUBE_SIZE / 2, -DASH_CUBE_SIZE / 2, DASH_CUBE_SIZE / 2, DASH_CUBE_SIZE / 2);
    gradient.addColorStop(0, "#f87171");
    gradient.addColorStop(0.5, "#ef4444");
    gradient.addColorStop(1, "#b91c1c");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(-DASH_CUBE_SIZE / 2, -DASH_CUBE_SIZE / 2, DASH_CUBE_SIZE, DASH_CUBE_SIZE, 6);
    ctx.fill();
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Score
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.font = "bold 72px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(Math.floor(state.score)), W / 2, 100);

  // Death overlay
  if (!state.running) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 56px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CRASHED!", W / 2, H / 2 - 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Inter, sans-serif";
    ctx.fillText(`Score: ${Math.floor(state.score)}`, W / 2, H / 2 + 40);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "18px Inter, sans-serif";
    ctx.fillText("Tap on phone to retry · Press BACK to gallery", W / 2, H / 2 + 80);
  }

  animFrameRef.current = requestAnimationFrame(() => dashLoopRef.current?.());
}, []);

// ─── PolarBash Game Loop ───────────────────────────────────────────────────
const polarGameLoop = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  if (W < 100 || H < 100) {
    animFrameRef.current = requestAnimationFrame(() => polarLoopRef.current?.());
    return;
  }

  const state = polarStateRef.current;

  // Initialize bears on first frame
  if (!state.initialized) {
    state.arenaCx = W / 2;
    state.arenaCy = H / 2;
    state.maxArenaRadius = Math.min(W, H) * POLAR_ARENA_FRAC;
    state.arenaRadius = state.maxArenaRadius;
    const players = Array.from(snakesRef.current.values()).map(s => s.player);
    state.bears = [];
    const count = 4;
    for (let i = 0; i < count; i++) {
      const player = players[i];
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      const irx = state.arenaRadius * POLAR_RX_SCALE * 0.55;
      const iry = state.arenaRadius * POLAR_RY_SCALE * 0.55;
      state.bears.push({
        slot: i,
        playerId: player ? player.id : null,
        name: player ? player.name : `AI ${i + 1}`,
        color: POLAR_BEAR_COLORS[i],
        x: state.arenaCx + Math.cos(a) * irx,
        y: state.arenaCy + Math.sin(a) * iry,
        vx: 0, vy: 0,
        angle: a + Math.PI,
        targetAngle: a + Math.PI,
        isAlive: true,
        isDashing: false,
        dashCooldown: 0,
        dashTimer: 0,
        radius: POLAR_BEAR_RADIUS,
        falls: 0,
      });
    }
    state.roundActive = true;
    state.winner = null;
    state.shrinkTimer = 0;
    state.particles = [];
    state.snowParticles = [];
    state.initialized = true;
  }

  // Spawn ambient snow
  if (Math.random() < 0.4) {
    state.snowParticles.push({
      x: Math.random() * W, y: -10,
      vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 1.5 + 0.8,
      life: 1, color: "#ffffff", size: Math.random() * 2 + 1,
    });
  }
  state.snowParticles = state.snowParticles.map(p => ({
    ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.003,
  })).filter(p => p.life > 0 && p.y < H + 20);

  // Round logic
  if (state.roundActive) {
    polarStepPhysics(state, polarInputRef.current);

    // Update particles
    state.particles = state.particles.map(p => ({
      ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.2, life: p.life - 0.03,
    })).filter(p => p.life > 0);
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const cx = state.arenaCx;
  const cy = state.arenaCy;
  const rx = state.arenaRadius * POLAR_RX_SCALE;
  const ry = state.arenaRadius * POLAR_RY_SCALE;
  const depth = POLAR_ICE_DEPTH;

  // Ocean background with depth gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, H);
  oceanGrad.addColorStop(0, "#041e2e");
  oceanGrad.addColorStop(0.5, "#062a3a");
  oceanGrad.addColorStop(1, "#0a3d52");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, W, H);

  // Ocean wave lines
  ctx.strokeStyle = "rgba(125,211,252,0.04)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const waveY = cy + ry + 30 + i * 25;
    ctx.beginPath();
    for (let x = 0; x < W; x += 4) {
      const y = waveY + Math.sin((x + state.shrinkTimer * 0.5 + i * 40) * 0.02) * 6;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Snow particles (behind ice)
  for (const p of state.snowParticles) {
    ctx.globalAlpha = p.life * 0.4;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Ice platform shadow on water
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + depth + 8, rx + 6, ry + 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ice side face (3D depth)
  ctx.fillStyle = "#0e7490";
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.lineTo(cx - rx, cy + depth);
  ctx.ellipse(cx, cy + depth, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  // Ice side face highlight
  const sideGrad = ctx.createLinearGradient(cx - rx, cy, cx - rx, cy + depth);
  sideGrad.addColorStop(0, "rgba(186,230,253,0.3)");
  sideGrad.addColorStop(1, "rgba(14,116,144,0.1)");
  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.lineTo(cx - rx, cy + depth);
  ctx.ellipse(cx, cy + depth, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  // Ice top face
  const iceGrad = ctx.createRadialGradient(cx - rx * 0.2, cy - ry * 0.3, rx * 0.15, cx, cy, rx);
  iceGrad.addColorStop(0, "#f0f9ff");
  iceGrad.addColorStop(0.4, "#e0f2fe");
  iceGrad.addColorStop(0.75, "#bae6fd");
  iceGrad.addColorStop(1, "#7dd3fc");
  ctx.fillStyle = iceGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ice cracks
  ctx.strokeStyle = "rgba(14,116,144,0.15)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const len = 0.5 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rx * 0.15, cy + Math.sin(a) * ry * 0.15);
    ctx.lineTo(cx + Math.cos(a) * rx * len, cy + Math.sin(a) * ry * len);
    ctx.stroke();
  }

  // Ice specular highlight
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.25, cy - ry * 0.3, rx * 0.35, ry * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Ice rim
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner rim glow
  ctx.strokeStyle = "rgba(186,230,253,0.2)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 4, ry - 3, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Impact particles (behind bears)
  for (const p of state.particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Sort bears by Y for depth ordering (back to front)
  const sortedBears = [...state.bears].filter(b => b.isAlive).sort((a, b) => a.y - b.y);

  // Draw bears with 3D shading
  for (const bear of sortedBears) {
    const r = bear.radius;
    // Perspective scale: bears further back are slightly smaller
    const yNorm = (bear.y - (cy - ry)) / (ry * 2);
    const scale = 0.82 + yNorm * 0.35;
    const sr = r * scale;

    ctx.save();
    ctx.translate(bear.x, bear.y);

    // Drop shadow on ice
    ctx.fillStyle = "rgba(0,20,40,0.18)";
    ctx.beginPath();
    ctx.ellipse(3 * scale, 6 * scale, sr * 1.1, sr * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotate for facing direction
    ctx.rotate(bear.angle);

    // Body (main volume) — large rounded shape
    const bodyGrad = ctx.createRadialGradient(-sr * 0.2, -sr * 0.3, sr * 0.1, sr * 0.1, sr * 0.2, sr * 1.1);
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(0.5, "#f1f5f9");
    bodyGrad.addColorStop(1, "#cbd5e1");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, sr * 1.05, sr * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body outline (subtle)
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, sr * 1.05, sr * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Belly highlight
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(-sr * 0.1, -sr * 0.15, sr * 0.55, sr * 0.4, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Head (front bump)
    const headGrad = ctx.createRadialGradient(sr * 0.5, -sr * 0.15, sr * 0.05, sr * 0.55, 0, sr * 0.55);
    headGrad.addColorStop(0, "#ffffff");
    headGrad.addColorStop(1, "#e2e8f0");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(sr * 0.55, 0, sr * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    const earR = sr * 0.22;
    ctx.fillStyle = "#f1f5f9";
    ctx.beginPath();
    ctx.arc(sr * 0.35, -sr * 0.52, earR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sr * 0.35, sr * 0.52, earR, 0, Math.PI * 2);
    ctx.fill();
    // Inner ears (player color)
    ctx.fillStyle = bear.color;
    ctx.beginPath();
    ctx.arc(sr * 0.35, -sr * 0.52, earR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sr * 0.35, sr * 0.52, earR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = "#fafafa";
    ctx.beginPath();
    ctx.ellipse(sr * 0.82, 0, sr * 0.28, sr * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.ellipse(sr * 0.98, 0, sr * 0.09, sr * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(sr * 0.62, -sr * 0.22, sr * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sr * 0.62, sr * 0.22, sr * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // Eye shine
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sr * 0.64, -sr * 0.24, sr * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sr * 0.64, sr * 0.20, sr * 0.03, 0, Math.PI * 2);
    ctx.fill();

    // Front paws
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.ellipse(sr * 0.7, -sr * 0.6, sr * 0.18, sr * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(sr * 0.7, sr * 0.6, sr * 0.18, sr * 0.12, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Dash glow ring
    if (bear.isDashing) {
      ctx.strokeStyle = bear.color;
      ctx.lineWidth = 3 * scale;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(0, 0, sr * 1.25, sr * 1.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Motion lines behind
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2 * scale;
      for (let l = 0; l < 3; l++) {
        const ly = (l - 1) * sr * 0.4;
        ctx.beginPath();
        ctx.moveTo(-sr * 1.1, ly);
        ctx.lineTo(-sr * 1.6 - Math.random() * sr * 0.3, ly);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Name label (above bear, not rotated)
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `bold ${Math.round(11 * scale)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(bear.name, bear.x, bear.y - sr - 10 * scale);
    // Color indicator
    ctx.fillStyle = bear.color;
    ctx.beginPath();
    ctx.arc(bear.x, bear.y - sr - 18 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dead bears (sinking in water)
  for (const bear of state.bears) {
    if (bear.isAlive) continue;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = bear.color;
    ctx.beginPath();
    ctx.arc(bear.x, bear.y + 10, bear.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Winner overlay
  if (!state.roundActive && state.winner) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 52px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${state.winner} WINS!`, W / 2, H / 2 - 10);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "20px Inter, sans-serif";
    ctx.fillText("Tap ⚡ on phone to play again · BACK to gallery", W / 2, H / 2 + 40);
  }

  animFrameRef.current = requestAnimationFrame(() => polarLoopRef.current?.());
}, []);

useEffect(() => { snakeLoopRef.current = gameLoop; }, [gameLoop]);
useEffect(() => { pongLoopRef.current = pongGameLoop; }, [pongGameLoop]);
useEffect(() => { dashLoopRef.current = dashGameLoop; }, [dashGameLoop]);
useEffect(() => { polarLoopRef.current = polarGameLoop; }, [polarGameLoop]);

useEffect(() => {
  if (activeGame === "pong") {
    const players = Array.from(snakesRef.current.values()).map(s => s.player);
    const state = pongStateRef.current;
    state.leftScore = 0;
    state.rightScore = 0;
    state.ballX = 0;
    state.ballY = 0;
    state.ballVx = BALL_SPEED_X * (Math.random() > 0.5 ? 1 : -1);
    state.ballVy = (Math.random() - 0.5) * 3;
    state.leftPaddleY = 0;
    state.rightPaddleY = 0;
    state.leftPlayerId = players.length >= 1 ? players[0].id : null;
    state.leftPlayerName = players.length >= 1 ? players[0].name : "Player 1";
    state.rightPlayerId = players.length >= 2 ? players[1].id : null;
    state.rightPlayerName = players.length >= 2 ? players[1].name : "AI";
    pongInputRef.current.clear();
    pongInitializedRef.current = false;

    // Notify players of their sides
    const sock = getSocket();
    if (state.leftPlayerId) {
      sock.emit("assign_pong_side", { roomCode, playerId: state.leftPlayerId, side: "left" });
    }
    if (state.rightPlayerId) {
      sock.emit("assign_pong_side", { roomCode, playerId: state.rightPlayerId, side: "right" });
    }

    animFrameRef.current = requestAnimationFrame(pongGameLoop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }
  }, [activeGame, pongGameLoop, roomCode]);

  useEffect(() => {
    if (activeGame === "dash") {
      const state = dashStateRef.current;
      state.score = 0;
      state.obstacles = [];
      state.particles = [];
      state.running = true;
      state.cubeY = 0;
      state.cubeVy = 0;
      state.cubeOnGround = true;
      state.hueShift = 0;
      dashInitializedRef.current = false;
      animFrameRef.current = requestAnimationFrame(dashGameLoop);
      return () => cancelAnimationFrame(animFrameRef.current);
    }
  }, [activeGame, dashGameLoop]);

  useEffect(() => {
    if (activeGame === "polarbash") {
      const ps = polarStateRef.current;
      ps.bears = [];
      ps.particles = [];
      ps.snowParticles = [];
      ps.roundActive = false;
      ps.winner = null;
      ps.initialized = false;
      polarInputRef.current.clear();
      animFrameRef.current = requestAnimationFrame(polarGameLoop);
      return () => cancelAnimationFrame(animFrameRef.current);
    }
  }, [activeGame, polarGameLoop]);

  // ─── Canvas resize ───────────────────────────────────────────────────────
  useEffect(() => {
    if (activeGame !== "snake" && activeGame !== "pong" && activeGame !== "dash" && activeGame !== "polarbash") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [activeGame]);

  // ─── Keyboard navigation for gallery ──────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeGame) return; // Only navigate gallery when not in a game
      
      if (e.key === "ArrowLeft") {
        setGalleryIndex((prev) => (prev - 1 + GAMES.length) % GAMES.length);
      } else if (e.key === "ArrowRight") {
        setGalleryIndex((prev) => (prev + 1) % GAMES.length);
      } else if (e.key === "Enter") {
        const idx = galleryIndexRef.current;
        setActiveGame(GAMES[idx].id);
        getSocket().emit("game_started", { gameIndex: idx, gameName: GAMES[idx].name });
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeGame]);

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleGalleryBack = () => {
    setActiveGame(null);
    snakesRef.current.clear();
    foodRef.current = [];
    pongInputRef.current.clear();
    pongInitializedRef.current = false;
    const state = pongStateRef.current;
    state.leftScore = 0;
    state.rightScore = 0;
    state.leftPlayerId = null;
    state.rightPlayerId = null;
    state.leftPlayerName = "Player 1";
    state.rightPlayerName = "AI";
    const ds = dashStateRef.current;
    ds.running = false;
    ds.obstacles = [];
    ds.particles = [];
    ds.score = 0;
    dashInitializedRef.current = false;
    const pol = polarStateRef.current;
    pol.bears = [];
    pol.particles = [];
    pol.snowParticles = [];
    pol.roundActive = false;
    pol.winner = null;
    pol.initialized = false;
    polarInputRef.current.clear();
    setPlayerCount(0);
    getSocket().emit("game_ended", { roomCode });
  };

  return (
    <main className="h-screen bg-[#06060e] text-white flex flex-col font-sans overflow-hidden">
      {/* ── Console status bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-[#0a0a18] shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-lg">🎮</span>
          <span className="text-sm font-bold tracking-wide bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent uppercase">
            NexusPlay
          </span>
          <span className="text-[10px] bg-violet-600/20 text-violet-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-violet-500/20">
            Host
          </span>
          {!activeGame && (
            <span className="text-xs text-white/20 font-mono tracking-widest ml-4">
              ROOM {roomCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-white/30 font-mono">
            {playerCount} PLAYER{playerCount !== 1 ? "S" : ""}
          </span>
          <span
            className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              status === "ready"
                ? "text-emerald-400"
                : status === "error"
                ? "text-red-400"
                : "text-amber-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full led-pulse ${
                status === "ready" ? "bg-emerald-400 text-emerald-400" :
                status === "error" ? "bg-red-400 text-red-400" : "bg-amber-400 text-amber-400"
              }`}
              style={{ color: status === "ready" ? "#34d399" : status === "error" ? "#f87171" : "#fbbf24" }}
            />
            {status === "ready" ? "ONLINE" : status === "error" ? "OFFLINE" : "SYNC"}
          </span>
        </div>
      </header>

      {/* ── Game active: full canvas ──────────────────────────────────── */}
      {activeGame ? (
        <div className="flex-1 relative bg-black">
          {/* CRT frame */}
          <div className="absolute inset-4 z-10 pointer-events-none rounded-2xl ring-1 ring-white/[0.06] shadow-[inset_0_0_100px_rgba(0,0,0,0.4)]" />

          <div className="absolute inset-0 p-4">
            <canvas
              ref={canvasRef}
              id="game-arena"
              className="w-full h-full rounded-2xl"
              style={{ background: "#0a0a14" }}
            />
          </div>

          {/* Game HUD overlay */}
          <div className="absolute top-6 left-6 right-6 flex items-start justify-between z-20 pointer-events-none">
            <div className="pointer-events-auto">
              <button
                onClick={handleGalleryBack}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white/50 hover:text-white hover:border-white/30 hover:bg-black/80 transition-all text-xs font-bold uppercase tracking-wider"
              >
                ← Home
              </button>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/20 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
                {GAMES.find(g => g.id === activeGame)?.name ?? activeGame}
              </span>
              {activeGame === "snake" && leaderboard.length > 0 && (
                <div className="bg-black/50 backdrop-blur-md rounded-xl border border-white/5 p-3 min-w-[140px]">
                  <h3 className="text-[9px] uppercase tracking-widest text-white/30 mb-2 font-bold">Rank</h3>
                  <ul className="flex flex-col gap-1.5">
                    {leaderboard.slice(0, 3).map((entry, idx) => (
                      <li key={entry.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/30 font-mono w-3">{idx + 1}</span>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="text-white/70 truncate max-w-[80px]">{entry.name}</span>
                        </div>
                        <span className="text-white/40 font-mono">{entry.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* How to play tooltip (bottom) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md rounded-full border border-white/10 px-5 py-2.5">
              <p className="text-[10px] text-white/25 font-medium">
                {activeGame === "snake" ? "Phone: joystick to steer · ⚡ to boost" :
                 activeGame === "pong" ? "Phone: ▲▼ to move paddle · First to 5 wins" :
                 activeGame === "dash" ? "Phone: tap to jump · Dodge obstacles" :
                 "Phone: joystick to move · ⚡ to dash-ram"}
              </p>
            </div>
          </div>

          {/* Empty arena notice */}
          {activeGame === "snake" && playerCount === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center bg-black/40 backdrop-blur-sm rounded-2xl px-8 py-6 border border-white/5">
                <p className="text-5xl mb-3 opacity-20">🐍</p>
                <p className="text-white/15 text-sm font-medium">Waiting for players…</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Gallery: console home screen ──────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-10">
          {/* Title */}
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              SELECT GAME
            </h2>
            <p className="text-white/20 text-xs mt-2 font-mono tracking-wider">
              ← → BROWSE &nbsp; ENTER START &nbsp; PHONE REMOTE
            </p>
          </div>

          {/* Game grid */}
          <div className="flex items-center gap-6">
            {GAMES.map((game, idx) => {
              const isSelected = idx === galleryIndex;
              return (
                <div
                  key={game.id}
                  className={`relative flex flex-col items-center gap-3 transition-all duration-400 ${
                    isSelected ? "scale-110" : "scale-90 opacity-50 hover:opacity-70"
                  }`}
                >
                  {/* Tile */}
                  <button
                    onClick={() => { setGalleryIndex(idx); }}
                    className={`relative w-44 h-52 rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all duration-300 cursor-pointer
                      ${isSelected
                        ? "border-white/20 bg-white/[0.06] console-glow-violet tile-selected"
                        : "border-white/[0.04] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                      }`}
                    style={isSelected ? { borderColor: game.color + "40", boxShadow: `0 0 40px ${game.color}20, 0 0 80px ${game.color}08` } : {}}
                  >
                    <span className="text-5xl drop-shadow-lg">{game.icon}</span>
                    <h3
                      className="text-base font-black tracking-tight"
                      style={isSelected ? { color: game.color } : { color: "rgba(255,255,255,0.6)" }}
                    >
                      {game.name}
                    </h3>
                    {isSelected && (
                      <p className="text-[10px] text-white/30 text-center px-4 leading-relaxed">
                        {game.description}
                      </p>
                    )}
                  </button>

                  {/* Select indicator */}
                  {isSelected && (
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full console-pulse" style={{ backgroundColor: game.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                        Press ENTER to start
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Dots */}
          <div className="flex items-center gap-2">
            {GAMES.map((game, idx) => (
              <div
                key={game.id}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  idx === galleryIndex ? "bg-violet-400 w-6" : "bg-white/10"
                }`}
              />
            ))}
          </div>

          {/* Room info floating panel */}
          <div className="flex items-center gap-4 bg-white/[0.03] backdrop-blur-md rounded-2xl border border-white/[0.06] px-6 py-4">
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-widest text-white/25 mb-1">Room</p>
              <span className="text-2xl font-black tracking-widest bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                {roomCode}
              </span>
            </div>
            <div className="w-px h-10 bg-white/[0.06]" />
            {qrDataUrl ? (
              <div className="rounded-lg overflow-hidden border border-white/[0.06] bg-white p-0.5">
                <img src={qrDataUrl} alt={`QR ${roomCode}`} className="w-24 h-24" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-lg bg-white/[0.03] animate-pulse" />
            )}
            <div className="w-px h-10 bg-white/[0.06]" />
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCopy}
                className="text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/20 hover:border-violet-400/40 transition-all"
              >
                {copyFeedback ? "✓ Copied" : "Copy Link"}
              </button>
              <p className="text-[9px] text-white/20 font-mono max-w-[200px] truncate">
                {joinUrl || "..."}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
