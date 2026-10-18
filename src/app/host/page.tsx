"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FORCE_HOST_PARAM, isController } from "@/lib/device";
import { SessionMenu } from "@/components/session-menu";
import { GameIcon } from "@/components/game-icons";
import type { SessionState, RemoteCommand, Player } from "@/types/socket";
import QRCode from "qrcode";
import { getSocket, destroySocket } from "@/lib/socket";
import type { SnakeState, GameInfo, PongState, PaddleDir, DashState, DashObstacle } from "@/types/socket";

import { createSnake, SlitherEngine } from "@/lib/slither/engine";
import { renderSlither } from "@/lib/slither/render";
import { PolarEngine, STAGES, CLASSES, RULES as POLAR_RULES } from "@/lib/polar/engine";
import { renderPolar } from "@/lib/polar/render";
import { preloadBearSprites } from "@/lib/polar/bear-sprite";
import { WormsEngine, RULES as WORMS_RULES, type Key as WormsKey, type WormsSnapshot } from "@/lib/worms/engine";
import { WormsRenderer } from "@/lib/worms/render";
import { WormsAudio } from "@/lib/worms/audio";
import { THEMES as WORMS_THEMES } from "@/lib/worms/terrain";
import { WEAPONS, WEAPON } from "@/lib/worms/weapons";

// ─── Game Registry ──────────────────────────────────────────────────────────
const GAMES: GameInfo[] = [
  {
    id: "snake",
    name: "SlitherPlay",
    icon: "🐍",
    description: "A neon snake showdown. Collect, cut off, boost. 2–4 is the sweet spot. Up to 8 players.",
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
  {
    id: "worms",
    name: "WormBlitz",
    icon: "🪱",
    description: "Turn-based artillery war. Destructible worlds, 15 weapons, up to 4 teams.",
    color: "#f472b6",
  },
];

// Home-screen extras: real gameplay captures live in public/games.
const GAME_META: Record<string, { preview: string; tagline: string; players: string; tags: string[] }> = {
  snake: { preview: "/games/snake.webp", tagline: "Eat. Grow. Cut them off.", players: "1–8", tags: ["Arena", "Real-time"] },
  dash: { preview: "/games/dash.webp", tagline: "One tap between you and the spikes.", players: "1+", tags: ["Rhythm", "One button"] },
  pong: { preview: "/games/pong.webp", tagline: "The original duel, supercharged.", players: "2", tags: ["Versus", "Classic"] },
  polarbash: { preview: "/games/polarbash.webp", tagline: "Last bear on the ice wins.", players: "1–4 + CPU", tags: ["Party", "Knockout"] },
  worms: { preview: "/games/worms.webp", tagline: "Aim. Fire. Blow up the map.", players: "2–4 teams", tags: ["Turn-based", "Artillery"] },
};

// Host keyboard → WormBlitz keyboard team.
const WORMS_KEYMAP: Record<string, WormsKey> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", " ": "fire", Enter: "jump", Backspace: "backflip",
};

// ─── Constants ────────────────────────────────────────────────────────────────
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

type PolarHud = {
  phase: string; stage: number; round: number; clock: number; timer: number; suddenDeath: boolean;
  bears: { slot: number; name: string; color: string; cls: string; wins: number; stamina: number; alive: boolean; cpu: boolean; ready: boolean; power: boolean; knocks: number }[];
  roundWinner: number | null; champion: number | null; feed: { text: string; color: string }[]; canRematch: boolean; humans: number;
};

function polarSnapshot(g: PolarEngine): PolarHud {
  return {
    phase: g.phase, stage: g.stage, round: g.round, clock: Math.ceil(g.clock), timer: Math.ceil(g.timer), suddenDeath: g.suddenDeath,
    bears: g.bears.map(b => ({ slot: b.slot, name: b.name, color: b.color, cls: b.cls, wins: b.wins, stamina: Math.round(b.stamina), alive: b.alive, cpu: !b.playerId, ready: b.ready, power: b.power > 0, knocks: b.knocks })),
    roundWinner: g.roundWinner, champion: g.champion, feed: g.feed.map(f => ({ text: f.text, color: f.color })),
    canRematch: g.phase === "matchover" && g.timer <= 0, humans: g.humans().length,
  };
}

function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HostPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  useEffect(() => {
    // iPads slip past the proxy with a Mac user agent; bounce them before a room is created.
    const params = new URLSearchParams(window.location.search);
    if (params.get(FORCE_HOST_PARAM) !== "host" && isController(navigator.userAgent, navigator.maxTouchPoints)) {
      router.replace("/join");
      return;
    }
    const frame = requestAnimationFrame(() => setRoomCode(generateRoomCode()));
    return () => cancelAnimationFrame(frame);
  }, [router]);
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
  const [session, setSession] = useState<SessionState | null>(null);
  const pausedRef = useRef(false);
  const [gameEpoch, setGameEpoch] = useState(0);
  const playersRef = useRef(new Map<string, Player>());
  const executeRef = useRef<(action: "restart" | "lobby") => void>(() => {});
  const command = (action: RemoteCommand) => getSocket().emit("remote_command", { roomCode, action });
  const activeGameRef = useRef<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const snakeLoopRef = useRef<((timestamp: number) => void) | null>(null);
  const pongLoopRef = useRef<(() => void) | null>(null);
  
  const snakesRef = useRef<Map<string, SnakeState>>(new Map());
  const slitherRef = useRef<SlitherEngine | null>(null);
  const accumulatorRef = useRef(0);
  const hudTimeRef = useRef(0);
  const [snakeHud, setSnakeHud] = useState({ phase: "waiting", remaining: 180, countdown: 3, feed: [] as string[] });
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

  const polarRef = useRef<PolarEngine | null>(null);
  const [polarHud, setPolarHud] = useState<PolarHud | null>(null);
  const wormsRef = useRef<WormsEngine | null>(null);
  const wormsAudioRef = useRef<WormsAudio | null>(null);
  const [wormsHud, setWormsHud] = useState<WormsSnapshot | null>(null);

  // Sync ref with state
  useEffect(() => { galleryIndexRef.current = galleryIndex; }, [galleryIndex]);
  useEffect(() => { activeGameRef.current = activeGame; }, [activeGame]);
  // ─── QR Code generation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;
    async function buildJoinUrl() {
      let host = window.location.hostname;
      // Only swap in the LAN IP when the host page was opened on this machine;
      // if it was opened via a LAN/Tailscale address, phones can use that same address.
      if (host === "localhost" || host === "127.0.0.1") {
        try {
          const res = await fetch("/api/local-ip");
          const data = await res.json();
          if (data.ip && data.ip !== "localhost") host = data.ip;
        } catch {
          // Fallback
        }
      }
      const target = new URL("/join", window.location.origin);
      target.hostname = host;
      target.searchParams.set("code", roomCode);
      const url = target.toString();
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
    if (!roomCode) return;
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
      playersRef.current.set(player.id, player);
      const newSnake = createSnake(player);
      snakesRef.current.set(player.id, newSnake);
      slitherRef.current?.spawn(newSnake);
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

      polarRef.current?.addPlayer(player);
      wormsRef.current?.addPlayer(player);
    });

    socket.on("player_left", ({ playerId }) => {
      playersRef.current.delete(playerId);
      pongInputRef.current.delete(playerId);
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
      polarRef.current?.removePlayer(playerId);
      const worms = wormsRef.current;
      if (worms?.teams[worms.current]?.playerId === playerId) { worms.charging = false; worms.power = 0; worms.jetOn = false; wormsAudioRef.current?.stopCharge(); }
      worms?.removePlayer(playerId);
    });

    // ── Gallery navigation ────────────────────────────────────────────────
    socket.on("gallery_navigate", ({ direction }) => {
      if (activeGameRef.current) return;
      setGalleryIndex((prev) => {
        const next = direction === "left"
          ? (prev - 1 + GAMES.length) % GAMES.length
          : (prev + 1) % GAMES.length;
        return next;
      });
    });

    socket.on("gallery_select", () => {
      if (activeGameRef.current) return;
      const idx = galleryIndexRef.current;
      setActiveGame(GAMES[idx].id);
      socket.emit("game_started", { gameIndex: idx, gameName: GAMES[idx].name });
    });

    socket.on("session_state", (state) => {
      pausedRef.current = state.paused;
      if (state.paused) {
        pongInputRef.current.clear();
        for (const snake of snakesRef.current.values()) snake.isBoosting = false;
        for (const id of playersRef.current.keys()) polarRef.current?.steer(id, null);
        const worms = wormsRef.current;
        if (worms) {
          for (const team of worms.teams) team.keys.clear();
          worms.charging = false; worms.power = 0; worms.jetOn = false;
          wormsAudioRef.current?.stopCharge();
        }
      }
      setSession(state);
    });
    socket.on("remote_execute", ({ action }) => executeRef.current(action));

    // ── Gameplay events ───────────────────────────────────────────────────
    socket.on("player_steer", ({ playerId, angle }) => {
      if (activeGameRef.current === "polarbash") {
        polarRef.current?.steer(playerId, angle);
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
        polarRef.current?.dash(playerId);
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
      slitherRef.current?.respawn(playerId);

    });

    socket.on("player_polar_action", ({ playerId, action }) => {
      const game = polarRef.current;
      if (!game) return;
      if (action.kind === "ready") game.toggleReady(playerId);
      else if (action.kind === "class") game.setClass(playerId, action.value);
      else if (game.humans()[0]?.playerId === playerId) game.setStage(game.stage + action.dir);
    });

    socket.on("player_worms_input", ({ playerId, action }) => {
      const g = wormsRef.current;
      if (!g) return;
      const lead = g.humans[0]?.player.id === playerId;
      if (action.kind === "key") g.pressPlayer(playerId, action.key, action.down);
      else if (action.kind === "weapon") g.selectWeapon(playerId, action.id);
      else if (action.kind === "fuse") g.setFuse(playerId, action.value);
      else if (action.kind === "ready") g.toggleReady(playerId);
      else if (lead && action.what === "theme") g.setTheme(g.theme + action.dir);
      else if (lead && action.what === "worms") g.cycleWorms(action.dir);
      else if (lead && action.what === "time") g.cycleTime(action.dir);
      else if (lead && action.what === "cpus") g.setCpus(g.cpus + action.dir);
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

    socket.on("disconnect", () => {
      setStatus("connecting"); setActiveGame(null);
      snakesRef.current.clear(); playersRef.current.clear(); setPlayerCount(0); pausedRef.current = false; setSession(null);
    });

    socket.on("room_closed", () => {
      setStatus("error");
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room_created");
      socket.off("connect_error");
      socket.off("player_joined");
      socket.off("player_left");
      socket.off("gallery_navigate");
      socket.off("gallery_select");
      socket.off("session_state");
      socket.off("remote_execute");
      socket.off("player_steer");
      socket.off("player_boost_start");
      socket.off("player_boost_end");
      socket.off("player_respawn_request");
      socket.off("player_pong_move");
      socket.off("player_polar_action");
      socket.off("player_worms_input");
      socket.off("player_dash_jump");
      socket.off("room_closed");
      destroySocket();
    };
  }, [roomCode]);

  // Fixed 60 Hz simulation; capped catch-up avoids tab-resume jumps.
  const gameLoop = useCallback((timestamp: number) => {
    if (pausedRef.current) { lastTimeRef.current = 0; accumulatorRef.current = 0; animFrameRef.current = requestAnimationFrame(t => snakeLoopRef.current?.(t)); return; }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const game = slitherRef.current;
    if (!canvas || !ctx || !game) return;
    const elapsed = lastTimeRef.current ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.1) : 0;
    lastTimeRef.current = timestamp;
    accumulatorRef.current += elapsed;
    while (accumulatorRef.current >= 1 / 60) {
      game.step(1 / 60);
      accumulatorRef.current -= 1 / 60;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderSlither(ctx, game, canvas.width / dpr, canvas.height / dpr, timestamp / 1000);
    if (timestamp - hudTimeRef.current > 100) {
      hudTimeRef.current = timestamp;
      setSnakeHud({ phase: game.phase, remaining: Math.ceil(game.remaining), countdown: Math.ceil(game.countdown), feed: game.feed.map(f => f.text) });
      setLeaderboard(game.rankings().map(s => ({ id: s.player.id, name: s.player.name, score: s.bank, color: s.player.color })));
      for (const s of game.snakes.values()) getSocket().emit("slither_status", {
        playerId: s.player.id, phase: game.phase, remaining: Math.ceil(game.remaining), score: s.bank,
        length: s.score, kills: s.kills, dead: s.isDead, cooldown: Math.max(0, Math.ceil(s.respawnAt - game.time)),
        boost: Math.max(0, Math.min(100, (s.targetLength - 26) / 60 * 100)),
      });
    }
    animFrameRef.current = requestAnimationFrame((t) => snakeLoopRef.current?.(t));
  }, []);

  useEffect(() => {
    if (activeGame !== "snake") return;
    const game = new SlitherEngine(snakesRef.current);
    game.onDeath = s => getSocket().emit("player_died", { playerId: s.player.id, score: s.bank });
    game.reset(); slitherRef.current = game;
    lastTimeRef.current = 0; accumulatorRef.current = 0;
    animFrameRef.current = requestAnimationFrame(gameLoop);
    const visibility = () => {
      lastTimeRef.current = 0; accumulatorRef.current = 0;
      for (const s of snakesRef.current.values()) s.isBoosting = false;
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelAnimationFrame(animFrameRef.current); document.removeEventListener("visibilitychange", visibility); slitherRef.current = null; };
  }, [activeGame, gameLoop, gameEpoch]);

// ─── Pong Game Loop ────────────────────────────────────────────────────────
const pongGameLoop = useCallback(() => {
  if (pausedRef.current) { animFrameRef.current = requestAnimationFrame(() => pongLoopRef.current?.()); return; }
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
  if (pausedRef.current) { animFrameRef.current = requestAnimationFrame(() => dashLoopRef.current?.()); return; }
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

useEffect(() => { snakeLoopRef.current = gameLoop; }, [gameLoop]);
useEffect(() => { pongLoopRef.current = pongGameLoop; }, [pongGameLoop]);
useEffect(() => { dashLoopRef.current = dashGameLoop; }, [dashGameLoop]);

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
  }, [activeGame, pongGameLoop, roomCode, gameEpoch]);

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
  }, [activeGame, dashGameLoop, gameEpoch]);

  // ─── PolarBash: fixed 60 Hz sim, HUD + phone telemetry at 10 Hz ────────────
  useEffect(() => {
    if (activeGame !== "polarbash") return;
    preloadBearSprites();
    const game = new PolarEngine();
    for (const s of snakesRef.current.values()) game.addPlayer(s.player);
    polarRef.current = game;
    let last = 0, acc = 0, hudAt = 0;
    const frame = (ts: number) => {
      if (pausedRef.current) { last = 0; acc = 0; animFrameRef.current = requestAnimationFrame(frame); return; }
      const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
      if (canvas && ctx && polarRef.current === game) {
        acc += last ? Math.min((ts - last) / 1000, 0.1) : 0;
        last = ts;
        while (acc >= 1 / 60) { game.step(1 / 60); acc -= 1 / 60; }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderPolar(ctx, game, canvas.width / dpr, canvas.height / dpr, ts / 1000);
        if (ts - hudAt > 100) {
          hudAt = ts;
          setPolarHud(polarSnapshot(game));
          const sock = getSocket();
          for (const p of snakesRef.current.values()) sock.emit("polar_status", game.status(p.player.id));
        }
      }
      animFrameRef.current = requestAnimationFrame(frame);
    };
    animFrameRef.current = requestAnimationFrame(frame);
    const visibility = () => { last = 0; acc = 0; };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      document.removeEventListener("visibilitychange", visibility);
      if (polarRef.current === game) polarRef.current = null;
      setPolarHud(null);
    };
  }, [activeGame, gameEpoch]);

  useEffect(() => {
    if (activeGame !== "polarbash") return;
    const onKey = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      const g = polarRef.current;
      if (!g) return;
      if (e.key === "ArrowLeft") g.setStage(g.stage - 1);
      else if (e.key === "ArrowRight") g.setStage(g.stage + 1);
      else if (e.key === "Enter" && g.phase === "lobby") g.startMatch();
      else if (e.key === "Enter" && g.phase === "matchover") g.toLobby();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGame]);

  // ─── WormBlitz: fixed 60 Hz sim, synthesized audio, HUD + phones at 10 Hz ──
  useEffect(() => {
    if (activeGame !== "worms") return;
    const game = new WormsEngine();
    for (const s of snakesRef.current.values()) game.addPlayer(s.player);
    game.setKeyboard(game.humans.length === 0);
    wormsRef.current = game;
    const view = new WormsRenderer();
    const audio = new WormsAudio();
    wormsAudioRef.current = audio;
    let last = 0, acc = 0, hudAt = 0, raf = 0;
    const frame = (ts: number) => {
      if (pausedRef.current) { last = 0; acc = 0; raf = requestAnimationFrame(frame); animFrameRef.current = raf; return; }
      const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
      if (canvas && ctx && wormsRef.current === game) {
        acc += last ? Math.min((ts - last) / 1000, 0.1) : 0;
        last = ts;
        while (acc >= 1 / 60) { game.step(1 / 60); acc -= 1 / 60; }
        const dpr = Math.min(window.devicePixelRatio || 1, 2), vw = canvas.width / dpr, vh = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        view.render(ctx, game, vw, vh, ts / 1000);
        const halfView = vw / 2 / view.cam.z;
        for (const e of game.sfx.splice(0)) {
          if (e.n === "charge") { audio.startCharge(); continue; }
          audio.play(e.n, e.v ?? 1, e.x === undefined ? 0 : Math.max(-0.8, Math.min(0.8, (e.x - view.cam.x) / halfView)));
        }
        if (game.charging) audio.charge(game.power); else audio.stopCharge();
        if (ts - hudAt > 100) {
          hudAt = ts;
          setWormsHud(game.snapshot());
          const sock = getSocket();
          for (const h of game.humans) sock.emit("worms_status", game.status(h.player.id));
        }
      }
      raf = requestAnimationFrame(frame);
      animFrameRef.current = raf;
    };
    raf = requestAnimationFrame(frame);
    animFrameRef.current = raf;
    const unlock = () => audio.unlock();
    const onKey = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      audio.unlock();
      const down = e.type === "keydown", k = e.key;
      if (k in WORMS_KEYMAP || k === "Tab") e.preventDefault();
      if (k === "m" || k === "M") { if (down) audio.toggleMute(); return; }
      if (game.phase === "lobby") {
        if (!down) return;
        if (k === "ArrowLeft") game.setTheme(game.theme - 1);
        else if (k === "ArrowRight") game.setTheme(game.theme + 1);
        else if (k === "ArrowUp") game.cycleWorms(1);
        else if (k === "ArrowDown") game.cycleWorms(-1);
        else if (k === "t" || k === "T") game.cycleTime(1);
        else if (k === "c" || k === "C") game.setCpus(game.cpus + 1 > WORMS_RULES.maxTeams ? 0 : game.cpus + 1);
        else if (k === "k" || k === "K") game.setKeyboard(!game.keyboard);
        else if (k === "Enter") game.startMatch();
        return;
      }
      if (game.phase === "gameover") { if (down && k === "Enter" && game.phaseT <= 0) game.toLobby(); return; }
      const key = WORMS_KEYMAP[k];
      if (key) { if (!e.repeat || !down) game.pressKeyboard(key, down); return; }
      if (!down) return;
      if (k >= "1" && k <= "5") game.setFuse(null, Number(k));
      else if (k === "q" || k === "Q" || k === "e" || k === "E" || k === "Tab") {
        const team = game.teams.find(t => t.kind === "keyboard");
        if (!team) return;
        const dir = k === "q" || k === "Q" || (k === "Tab" && e.shiftKey) ? -1 : 1;
        const usable = WEAPONS.filter(w => team.ammo[w.id] !== 0 && w.delay < game.round);
        const i = usable.findIndex(w => w.id === team.weapon);
        game.selectWeapon(null, usable[(i + dir + usable.length) % usable.length].id);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("pointerdown", unlock);
    const visibility = () => { last = 0; acc = 0; for (const t of game.teams) for (const key of [...t.keys]) game.press(t, key, false); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      audio.close();
      if (wormsRef.current === game) wormsRef.current = null;
      wormsAudioRef.current = null;
      setWormsHud(null);
    };
  }, [activeGame, gameEpoch]);

  // ─── Canvas resize ───────────────────────────────────────────────────────
  useEffect(() => {
    if (activeGame !== "snake" && activeGame !== "pong" && activeGame !== "dash" && activeGame !== "polarbash" && activeGame !== "worms") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = activeGame === "snake" || activeGame === "polarbash" || activeGame === "worms" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [activeGame]);

  const launchGame = (idx: number) => {
    setActiveGame(GAMES[idx].id);
    getSocket().emit("game_started", { gameIndex: idx, gameName: GAMES[idx].name });
  };

  // ─── Keyboard navigation for gallery ──────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeGame) return; // Only navigate gallery when not in a game
      
      if (e.key === "ArrowLeft") {
        setGalleryIndex((prev) => (prev - 1 + GAMES.length) % GAMES.length);
      } else if (e.key === "ArrowRight") {
        setGalleryIndex((prev) => (prev + 1) % GAMES.length);
      } else if (e.key === "Enter") {
        launchGame(galleryIndexRef.current);
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

  const handleGalleryBack = () => command("menu");

  useEffect(() => {
    executeRef.current = action => {
      if (action === "lobby") {
        pausedRef.current = false;
        setActiveGame(null); activeGameRef.current = null;
        pongInputRef.current.clear();
        getSocket().emit("game_ended", { roomCode });
      } else {
        const idx = GAMES.findIndex(g => g.id === activeGameRef.current);
        if (idx < 0) return;
        // Keep room membership separate from game entities across fresh rounds.
        snakesRef.current = new Map([...playersRef.current].map(([id, player]) => [id, createSnake(player)]));
        setGameEpoch(epoch => epoch + 1);
        getSocket().emit("game_started", { gameIndex: idx, gameName: GAMES[idx].name });
      }
    };
  }, [roomCode]);

  useEffect(() => {
    if (status === "ready") getSocket().emit("host_gallery", { galleryIndex });
  }, [galleryIndex, status]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!activeGame) return;
      const action = e.key === "Escape" ? (session?.paused ? (session.confirm ? "cancel" : "resume") : "menu")
        : session?.paused && !session.confirm ? ({ ArrowUp: "up", ArrowDown: "down", Enter: "select" } as const)[e.key as "ArrowUp"] : undefined;
      if (action) { e.preventDefault(); getSocket().emit("remote_command", { roomCode, action }); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [activeGame, session, roomCode]);

  return (
    <main className="h-screen bg-[#06060e] text-white flex flex-col font-sans overflow-hidden">
      {session && <SessionMenu state={session} enabled command={command} />}
      {/* ── Console status bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-[#0a0a18] shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-lg">🎮</span><Link className="text-xs text-white/60" href="/join">Use as controller</Link>
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
        <div className="flex-1 relative bg-black" inert={Boolean(session?.paused)}>
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
          <div className={activeGame === "snake" || activeGame === "polarbash" || activeGame === "worms" ? "absolute bottom-4 left-6 z-30" : "absolute top-6 left-6 right-6 flex items-start justify-between z-20 pointer-events-none"}>
            <div className="pointer-events-auto">
              <button
                onClick={handleGalleryBack}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white/50 hover:text-white hover:border-white/30 hover:bg-black/80 transition-all text-xs font-bold uppercase tracking-wider"
              >
                ☰ Menu
              </button>
            </div>
            <div className={activeGame === "snake" || activeGame === "polarbash" || activeGame === "worms" ? "hidden" : "flex flex-col items-end gap-2"}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/20 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
                {GAMES.find(g => g.id === activeGame)?.name ?? activeGame}
              </span>

            </div>
          </div>

          {/* How to play tooltip (bottom) */}
          <div className={`${activeGame === "snake" || activeGame === "polarbash" || activeGame === "worms" ? "hidden" : ""} absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none`}>
            <div className="bg-black/60 backdrop-blur-md rounded-full border border-white/10 px-5 py-2.5">
              <p className="text-[10px] text-white/25 font-medium">
                {activeGame === "snake" ? "Phone: joystick to steer · ⚡ to boost" :
                 activeGame === "pong" ? "Phone: ▲▼ to move paddle · First to 5 wins" :
                 activeGame === "dash" ? "Phone: tap to jump · Dodge obstacles" :
                 "Phone: joystick to move · ⚡ to dash-ram"}
              </p>
            </div>
          </div>

          {activeGame === "polarbash" && polarHud && (() => {
            const h = polarHud, stage = STAGES[h.stage];
            const winner = h.roundWinner !== null ? h.bears[h.roundWinner] : null;
            const champ = h.champion !== null ? h.bears[h.champion] : null;
            return (
              <>
                <div className="polar-top">
                  <div><span className="polar-eyebrow">NEXUS CLASSIC / POLAR PUSH</span><h1>{stage.name}</h1></div>
                  {h.phase !== "lobby" && <div className={`polar-clock ${h.suddenDeath ? "sudden" : ""}`}>
                    <span>{h.suddenDeath ? "SUDDEN DEATH" : `ROUND ${h.round}`}</span>
                    <strong>{h.suddenDeath ? "MELT!" : `${Math.floor(h.clock / 60)}:${String(h.clock % 60).padStart(2, "0")}`}</strong>
                  </div>}
                  <div className="polar-room"><span>JOIN</span><strong>{roomCode}</strong></div>
                </div>
                <div className="polar-feed">{h.feed.map((f, i) => <div key={`${f.text}-${i}`} style={{ borderColor: f.color }}>{f.text}</div>)}</div>
                <div className="polar-cards">
                  {h.bears.map(b => {
                    const c = CLASSES.find(k => k.id === b.cls)!;
                    return (
                      <div key={b.slot} className={`polar-card ${b.alive || h.phase === "lobby" ? "" : "out"}`} style={{ borderColor: b.color }}>
                        <div className="polar-card-head"><i style={{ background: b.color }} /><b>{b.name}</b><em>{b.cpu ? "CPU" : `P${b.slot + 1}`}</em></div>
                        <div className="polar-card-cls">{c.icon} {c.name}</div>
                        <div className="polar-trophies">{Array.from({ length: POLAR_RULES.winsNeeded }, (_, i) => <span key={i} className={i < b.wins ? "won" : ""}>🏆</span>)}</div>
                        {h.phase !== "lobby" && <div className="polar-stamina"><i style={{ width: `${b.stamina}%`, background: b.power ? "#ffd76a" : b.stamina >= POLAR_RULES.dashCost ? "#7fe3ff" : "#5b7a95" }} /></div>}
                        {!b.alive && h.phase !== "lobby" && <div className="polar-splash">SPLASH!</div>}
                      </div>
                    );
                  })}
                </div>
                {h.phase === "lobby" && <div className="polar-overlay">
                  <div className="polar-modal">
                    <span className="polar-eyebrow">PICK A STAGE · RIDE A BEAR · PUSH THEM IN</span>
                    <div className="polar-stages">
                      {STAGES.map((st, i) => <button key={st.id} className={i === h.stage ? "on" : ""} onClick={() => polarRef.current?.setStage(i)}><b>{st.name}</b><span>{st.blurb}</span></button>)}
                    </div>
                    <p>{h.humans ? `Pick your bear on your phone, then press READY. ${4 - Math.min(4, h.humans)} CPU bear${4 - h.humans === 1 ? "" : "s"} fill the rest.` : `Join room ${roomCode} on your phone — or start with 4 CPU bears.`} First to {POLAR_RULES.winsNeeded} round wins takes the match.</p>
                    <button className="polar-go" onClick={() => polarRef.current?.startMatch()}>{h.humans && h.bears.filter(b => !b.cpu).every(b => b.ready) ? "Starting…" : "Start now ↵"}</button>
                  </div>
                </div>}
                {h.phase === "intro" && <div className="polar-banner"><span>ROUND {h.round}</span><strong>{stage.name}</strong></div>}
                {h.phase === "countdown" && <div className="polar-banner big" key={h.timer}><strong>{h.timer}</strong></div>}
                {h.phase === "playing" && h.clock > POLAR_RULES.roundTime - 1 && <div className="polar-banner big go"><strong>PUSH!</strong></div>}
                {h.phase === "roundover" && <div className="polar-banner"><span>ROUND {h.round}</span><strong style={{ color: winner?.color }}>{winner ? `${winner.name} wins!` : "Draw!"}</strong></div>}
                {h.phase === "matchover" && champ && <div className="polar-overlay">
                  <div className="polar-modal">
                    <span className="polar-eyebrow">KING OF THE ICE</span>
                    <h2 style={{ color: champ.color }}>{champ.name} wins!</h2>
                    <div className="polar-podium">
                      {[...h.bears].sort((a, b) => b.wins - a.wins || b.knocks - a.knocks).map(b => <div key={b.slot}><b style={{ color: b.color }}>{b.name}</b><span>{b.wins} 🏆 · {b.knocks} push{b.knocks === 1 ? "" : "es"}</span></div>)}
                    </div>
                    <button className="polar-go" disabled={!h.canRematch} onClick={() => polarRef.current?.toLobby()}>Rematch ↵</button>
                  </div>
                </div>}
              </>
            );
          })()}

          {activeGame === "worms" && wormsHud && <WormsHudView h={wormsHud} roomCode={roomCode} game={wormsRef} />}

          {activeGame === "snake" && (
            <>
              <div className="slither-top">
                <div><span className="slither-eyebrow">NEXUS ORIGINAL / 01</span><h1>slither<span>play.</span></h1></div>
                <div className="slither-clock"><span>{snakeHud.phase === "finished" ? "ROUND COMPLETE" : "MOST POINTS WINS"}</span><strong>{Math.floor(snakeHud.remaining / 60)}:{String(snakeHud.remaining % 60).padStart(2, "0")}</strong></div>
                <div className="slither-room"><span>JOIN THE ARENA</span><strong>{roomCode}</strong></div>
              </div>
              <div className="slither-scores">
                {leaderboard.map((entry, i) => <div key={entry.id} className="slither-score"><b style={{ color: entry.color }}>{String(i + 1).padStart(2, "0")}</b><i style={{ background: entry.color }} /><span>{entry.name}</span><strong>{entry.score}</strong></div>)}
              </div>
              <div className="slither-feed">{snakeHud.feed.map((text, i) => <div key={`${text}-${i}`}>{text}</div>)}</div>
              <div className="slither-help">EAT TO GROW <span>→</span> CUT OFF RIVALS <span>→</span> HOLD BOOST TO ESCAPE <span>·</span> +100 PER ELIMINATION</div>
              {(snakeHud.phase === "countdown" || snakeHud.phase === "waiting" || snakeHud.phase === "finished") && <div className="slither-overlay">
                <div className="slither-modal">
                  <span className="slither-eyebrow">{snakeHud.phase === "finished" ? "THE GARDEN HAS A CHAMPION" : "SMALL ARENA. BIG RIVALRIES."}</span>
                  <h2>{snakeHud.phase === "countdown" ? snakeHud.countdown : snakeHud.phase === "waiting" ? "Your crew. Your arena." : `${leaderboard[0]?.name ?? "Nobody"} wins!`}</h2>
                  <p>{snakeHud.phase === "finished" ? "Collected points survive every crash. Ready for a rematch?" : snakeHud.phase === "waiting" ? `Join room ${roomCode} on your phone. Best with 2–4 friends, room for 8.` : "Eat glowing orbs. Avoid the edge and other snakes. You can cross your own tail."}</p>
                  {snakeHud.phase === "finished" && <><div className="slither-podium">{leaderboard.slice(0, 3).map((p, i) => <div key={p.id}><b style={{ color: p.color }}>#{i + 1} {p.name}</b><strong>{p.score} pts</strong></div>)}</div><button onClick={() => { slitherRef.current?.reset(); getSocket().emit("game_started", { gameIndex: 0, gameName: "SlitherPlay" }); }}>Play another round ↗</button></>}
                </div>
              </div>}
            </>
          )}
        </div>
      ) : (
        /* ── Gallery: console home screen ──────────────────────────────── */
        <div className="nx-home" style={{ ["--gc" as string]: GAMES[galleryIndex].color }}>
          {/* Ambient backdrop: the selected game's own footage, blurred */}
          <div className="nx-backdrop" aria-hidden>
            {GAMES.map((game, idx) => <img key={game.id} src={GAME_META[game.id].preview} alt="" className={idx === galleryIndex ? "on" : ""} />)}
          </div>

          <div className="nx-stage">
          <section className="nx-hero" key={GAMES[galleryIndex].id}>
            <span className="nx-eyebrow">NEXUS ORIGINAL · {String(galleryIndex + 1).padStart(2, "0")} / {String(GAMES.length).padStart(2, "0")}</span>
            <h2>{GAMES[galleryIndex].name}</h2>
            <p className="nx-tagline">{GAME_META[GAMES[galleryIndex].id].tagline}</p>
            <p className="nx-desc">{GAMES[galleryIndex].description}</p>
            <div className="nx-chips">
              <span>👥 {GAME_META[GAMES[galleryIndex].id].players}</span>
              {GAME_META[GAMES[galleryIndex].id].tags.map(t => <span key={t}>{t}</span>)}
            </div>
            <button className="nx-play" onClick={() => launchGame(galleryIndex)}><svg viewBox="0 0 12 12" width="14" height="14" aria-hidden><path d="M2 1.2v9.6L10.5 6z" fill="currentColor" /></svg>Play <kbd>ENTER</kbd></button>
          </section>
          <figure className="nx-preview" onClick={() => launchGame(galleryIndex)}>
            {GAMES.map((game, idx) => <img key={game.id} src={GAME_META[game.id].preview} alt={idx === galleryIndex ? `${game.name} gameplay` : ""} className={idx === galleryIndex ? "on" : ""} />)}
            <figcaption><i />GAMEPLAY</figcaption>
          </figure>
          </div>

          {/* Game shelf: hover or remote selection expands a card into a live screenshot */}
          <div className="nx-shelf">
            {GAMES.map((game, idx) => (
              <button
                key={game.id}
                className={`nx-card ${idx === galleryIndex ? "on" : ""}`}
                style={{ ["--gc" as string]: game.color }}
                onMouseEnter={() => setGalleryIndex(idx)}
                onFocus={() => setGalleryIndex(idx)}
                onClick={() => idx === galleryIndex ? launchGame(idx) : setGalleryIndex(idx)}
                aria-label={`${game.name}: ${game.description}`}
              >
                <img className="nx-shot" src={GAME_META[game.id].preview} alt="" />
                <span className="nx-card-fade" />
                <GameIcon id={game.id} size={idx === galleryIndex ? 64 : 92} className="nx-icon" />
                <span className="nx-card-name">{game.name}</span>
              </button>
            ))}
          </div>

          <footer className="nx-dock">
            <div className="nx-hint">← → browse · ENTER play · or use your phone as the remote</div>
            <div className="nx-room">
              <div>
                <span>ROOM</span>
                <strong>{roomCode}</strong>
                <button onClick={handleCopy}>{copyFeedback ? "✓ Copied" : "Copy link"}</button>
              </div>
              {qrDataUrl ? <img src={qrDataUrl} alt={`QR ${roomCode}`} /> : <i />}
            </div>
          </footer>
        </div>
      )}
    </main>
  );
}

// ─── WormBlitz HUD ─────────────────────────────────────────────────────────
function WormsHudView({ h, roomCode, game }: { h: WormsSnapshot; roomCode: string; game: React.RefObject<WormsEngine | null> }) {
  const theme = WORMS_THEMES[h.theme];
  const team = h.teams[h.current];
  const g = () => game.current;
  if (h.phase === "lobby") {
    const seated = h.humans.filter(x => x.seated);
    return (
      <div className="worms-overlay">
        <div className="worms-modal">
          <span className="worms-eyebrow">NEXUS ORIGINAL · TURN-BASED ARTILLERY</span>
          <h2 className="worms-logo">Worm<span>Blitz</span></h2>
          <div className="worms-themes">
            {WORMS_THEMES.map((t, i) => (
              <button key={t.id} className={i === h.theme ? "on" : ""} onClick={() => g()?.setTheme(i)} style={{ background: `linear-gradient(180deg, ${t.sky[0]}, ${t.sky[2]} 70%, ${t.water[1]} 70%)` }}>
                <b>{t.name}</b><span>{t.blurb}</span>
              </button>
            ))}
          </div>
          <div className="worms-settings">
            <div><span>WORMS / TEAM</span><div><button onClick={() => g()?.cycleWorms(-1)}>‹</button><b>{h.wormsPer}</b><button onClick={() => g()?.cycleWorms(1)}>›</button></div></div>
            <div><span>TURN TIME</span><div><button onClick={() => g()?.cycleTime(-1)}>‹</button><b>{h.turnTime}s</b><button onClick={() => g()?.cycleTime(1)}>›</button></div></div>
            <div><span>CPU TEAMS</span><div><button onClick={() => g()?.setCpus(h.cpus - 1)}>‹</button><b>{h.cpus}</b><button onClick={() => g()?.setCpus(h.cpus + 1)}>›</button></div></div>
            <div><span>KEYBOARD TEAM</span><div><button className="wide" onClick={() => g()?.setKeyboard(!h.keyboard)}>{h.keyboard ? "ON" : "OFF"}</button></div></div>
          </div>
          <div className="worms-roster">
            {seated.map(p => <div key={p.id} style={{ borderColor: p.color }}><i style={{ background: p.color }} /><b>{p.name}</b><em className={p.ready ? "ok" : ""}>{p.ready ? "READY" : "picking…"}</em></div>)}
            {h.keyboard && <div style={{ borderColor: "#ffffff55" }}><i style={{ background: "#fff" }} /><b>Keyboard</b><em className="ok">HOST</em></div>}
            {Array.from({ length: h.cpus }, (_, i) => <div key={i} style={{ borderColor: "#ffffff22" }}><i style={{ background: "#888" }} /><b>CPU {i + 1}</b><em>BOT</em></div>)}
          </div>
          <p>{seated.length ? "Phones press READY to deploy." : `Join room ${roomCode} on your phone, or play on the keyboard.`} Keyboard: ←→ walk · ↑↓ aim · SPACE fire (hold) · ENTER jump · ⌫ backflip · Q/E weapon · 1–5 fuse · M mute</p>
          <button className="worms-go" disabled={h.teamCount < 2} onClick={() => g()?.startMatch()}>Deploy {h.teamCount} teams ↵</button>
        </div>
      </div>
    );
  }
  const wind = Math.round(h.wind * 100);
  const maxHp = Math.max(...h.teams.map(t => t.max));
  const weapon = WEAPON[h.weapon];
  const ammo = h.ammo[h.weapon];
  return (
    <>
      <div className="worms-top">
        <div><span className="worms-eyebrow">WORMBLITZ · ROUND {h.round}{h.suddenDeath ? " · SUDDEN DEATH" : ""}</span><h1>{theme.name}</h1></div>
        {team && <div className="worms-turn" style={{ ["--tc" as string]: team.color }}>
          <div className={`worms-timer ${h.timer <= 5 && !h.retreat ? "hot" : ""} ${h.retreat ? "retreat" : ""}`}><strong>{h.phase === "turn" || h.phase === "retreat" ? h.timer : "–"}</strong><span>{h.retreat ? "RUN!" : "SEC"}</span></div>
          <div className="worms-who"><b>{team.name}</b><span>{h.wormName}</span></div>
          <div className="worms-wind"><span>WIND</span><div className="worms-wind-bar"><i className={wind < 0 ? "l" : "r"} style={{ width: `${Math.abs(wind) / 2}%` }} /></div><em>{wind === 0 ? "calm" : `${Math.abs(wind)} ${wind < 0 ? "◀" : "▶"}`}</em></div>
        </div>}
        <div className="worms-room"><span>JOIN</span><strong>{roomCode}</strong></div>
      </div>
      <div className="worms-feed">{h.feed.map((f, i) => <div key={`${f.text}-${i}`} style={{ borderColor: f.color }}>{f.text}</div>)}</div>
      <div className="worms-teams">
        {h.teams.map(t => (
          <div key={t.idx} className={`${t.idx === h.current ? "on" : ""} ${t.alive ? "" : "out"}`}>
            <b style={{ color: t.color }}>{t.name}</b>
            <div className="worms-hpbar"><i style={{ width: `${(t.hp / maxHp) * 100}%`, background: t.color }} /></div>
            <em>{t.hp}</em>
          </div>
        ))}
      </div>
      {team && h.phase !== "gameover" && <div className="worms-arsenal" style={{ ["--tc" as string]: team.color }}>
        <div className="worms-current"><span className="icon">{weapon.icon}</span><div><b>{weapon.name}</b><span>{ammo < 0 ? "∞" : `×${ammo}`}{weapon.fuse ? ` · ${h.fuse}s fuse` : ""}{h.weapon === "shotgun" && h.shotsLeft ? " · 1 shot left" : ""}{h.jet > 0 ? ` · fuel ${h.jet.toFixed(1)}` : ""}</span></div></div>
        <div className="worms-tray">
          {WEAPONS.map(w => <i key={w.id} title={w.name} className={`${w.id === h.weapon ? "on" : ""} ${h.ammo[w.id] === 0 || w.delay >= h.round ? "off" : ""}`}>{w.icon}{h.ammo[w.id] > 0 && <sub>{h.ammo[w.id]}</sub>}{w.delay >= h.round && <sub>R{w.delay + 1}</sub>}</i>)}
        </div>
        {team.kind === "keyboard" && <p className="worms-hint">{h.targeting ? "Arrows move the cursor · SPACE to confirm" : weapon.hint}</p>}
      </div>}
      {h.banner && h.phase !== "gameover" && <div className="worms-banner" key={h.banner} style={{ color: h.bannerColor }}><strong>{h.banner}</strong></div>}
      {h.phase === "gameover" && <div className="worms-overlay">
        <div className="worms-modal">
          <span className="worms-eyebrow">BATTLE OVER</span>
          <h2 style={{ color: h.winner !== null ? h.teams[h.winner].color : "#fff" }}>{h.winner !== null ? `${h.teams[h.winner].name} win!` : "Mutual destruction!"}</h2>
          <div className="worms-podium">
            {[...h.teams].sort((a, b) => b.alive - a.alive || b.hp - a.hp || b.kills - a.kills).map(t => <div key={t.idx}><b style={{ color: t.color }}>{t.name}</b><span>{t.alive} alive · {t.kills} kill{t.kills === 1 ? "" : "s"} · {t.dealt} dmg</span></div>)}
          </div>
          <button className="worms-go" disabled={!h.canRematch} onClick={() => g()?.toLobby()}>Back to the war room ↵</button>
        </div>
      </div>}
    </>
  );
}
