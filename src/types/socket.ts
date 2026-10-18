// src/types/socket.ts — Shared event & data types for NexusPlay

export interface Player {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
}

// ─── Client → Server events ───────────────────────────────────────────────────
export interface SlitherStatus {
  playerId: string; phase: string; remaining: number; score: number; length: number; kills: number; dead: boolean; cooldown: number; boost: number;
}

export interface ClientToServerEvents {
  worms_status: (payload: WormsStatus) => void;
  worms_input: (payload: { roomCode: string; action: WormsAction }) => void;
  slither_status: (payload: SlitherStatus) => void;
  polar_status: (payload: PolarStatus) => void;
  polar_action: (payload: { roomCode: string; action: PolarAction }) => void;
  host_create_room: (payload: { roomCode: string }) => void;
  player_join: (payload: { roomCode: string; playerName: string }) => void;
  
  // Gallery navigation (phone → server → host)
  gallery_navigate: (payload: { roomCode: string; direction: "left" | "right" }) => void;
  gallery_select: (payload: { roomCode: string }) => void;
  gallery_back: (payload: { roomCode: string }) => void;
  
  // New continuous steering event (angle in radians)
  steer: (payload: { roomCode: string; angle: number | null }) => void;
  
  // Boosting events
  boost_start: (payload: { roomCode: string }) => void;
  boost_end: (payload: { roomCode: string }) => void;
  
  // Let player tell host they want to respawn if dead
  respawn_request: (payload: { roomCode: string }) => void;
  
  // Host -> Server: Tell a specific player they died
  player_died: (payload: { playerId: string; score: number }) => void;
  
  // Host -> Server: Game started (relayed to controllers)
  game_started: (payload: { gameIndex: number; gameName: string }) => void;

  // Pong paddle movement (controller → host)
  pong_move: (payload: { roomCode: string; direction: "up" | "down" | "stop" }) => void;

  // Host tells server which side a player controls in pong
  assign_pong_side: (payload: { roomCode: string; playerId: string; side: "left" | "right" }) => void;

  // Host tells server the game ended (back to gallery)
  game_ended: (payload: { roomCode: string }) => void;

  // DashZone jump (controller → host)
  dash_jump: (payload: { roomCode: string }) => void;
}

// ─── Server → Client events ───────────────────────────────────────────────────
export interface ServerToClientEvents {
  worms_status: (payload: WormsStatus) => void;
  player_worms_input: (payload: { playerId: string; action: WormsAction }) => void;
  slither_status: (payload: SlitherStatus) => void;
  polar_status: (payload: PolarStatus) => void;
  player_polar_action: (payload: { playerId: string; action: PolarAction }) => void;
  room_created: (payload: { roomCode: string }) => void;
  join_success: (payload: { player: Player; roomCode: string; gameName?: string }) => void;
  join_error: (payload: { message: string }) => void;
  player_joined: (payload: { player: Player; totalPlayers: number }) => void;
  player_left: (payload: { playerId: string; totalPlayers: number }) => void;
  room_closed: (payload: { message: string }) => void;

  // Gallery events (server → host)
  gallery_navigate: (payload: { playerId: string; direction: "left" | "right" }) => void;
  gallery_select: (payload: { playerId: string }) => void;
  gallery_back: (payload: { playerId: string }) => void;

  // Gallery state broadcast (host → all controllers)
  gallery_update: (payload: { currentIndex: number; games: GameInfo[] }) => void;
  game_started: (payload: { gameIndex: number; gameName: string }) => void;

  // Real-time gameplay events relayed to the host
  player_steer: (payload: { playerId: string; angle: number | null }) => void;
  player_boost_start: (payload: { playerId: string }) => void;
  player_boost_end: (payload: { playerId: string }) => void;
  player_respawn_request: (payload: { playerId: string }) => void;
  
  // Events sent FROM Host TO Controllers
  player_died: (payload: { score: number }) => void; // Tell phone they died

  // Pong paddle movement relayed (server → host)
  player_pong_move: (payload: { playerId: string; direction: "up" | "down" | "stop" }) => void;

  // Pong side assignment (server → player)
  pong_side: (payload: { side: "left" | "right" }) => void;

  // Game ended (server → all players)
  game_ended: () => void;

  // DashZone jump relayed (server → host)
  player_dash_jump: (payload: { playerId: string }) => void;
}

export interface GameInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

// ─── Game State Types (Used by Host) ─────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface SnakeState {
  player: Player;
  segments: Point[]; // Head is segments[0]
  angle: number;     // Current movement direction (radians)
  targetAngle: number; // Angle being steered towards
  targetLength: number;
  isBoosting: boolean;
  score: number;
  isDead: boolean;
  shield: number;
  kills: number;
  bank: number;
  respawnAt: number;
  boostTrail: number;
}

export interface FoodOrb {
  id: string;
  x: number;
  y: number;
  color: string;
  value: number;
}

export type PaddleDir = "up" | "down" | "stop";

export interface PongState {
  leftPaddleY: number;
  rightPaddleY: number;
  ballX: number;
  ballY: number;
  ballVx: number;
  ballVy: number;
  leftScore: number;
  rightScore: number;
  leftPlayerId: string | null;
  rightPlayerId: string | null;
  leftPlayerName: string;
  rightPlayerName: string;
}

export interface DashObstacle {
  x: number;
  type: "block" | "spike" | "tall";
  width: number;
  height: number;
}

export interface DashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface DashState {
  cubeY: number;
  cubeVy: number;
  cubeOnGround: boolean;
  obstacles: DashObstacle[];
  score: number;
  running: boolean;
  particles: DashParticle[];
  groundY: number;
  cubeSize: number;
  hueShift: number;
}

// ─── PolarBash (Crash Bash "Polar Push" replica) ────────────────────────────

export interface PolarStatus {
  playerId: string; phase: string; stage: string; round: number; clock: number;
  seated: boolean; slot: number; color: string; cls: string;
  alive: boolean; stamina: number; power: boolean; wins: number; ready: boolean; countdown: number;
  roundWinner: string | null; champion: string | null; isChampion: boolean; canRematch: boolean;
}

export type PolarAction = { kind: "ready" } | { kind: "class"; value: string } | { kind: "stage"; dir: 1 | -1 };

// ─── WormBlitz (turn-based artillery) ───────────────────────────────────────

export type WormsStatus = import("@/lib/worms/engine").WormsStatusData;
export type WormsKey = "left" | "right" | "up" | "down" | "fire" | "jump" | "backflip";
export type WormsAction =
  | { kind: "key"; key: WormsKey; down: boolean }
  | { kind: "weapon"; id: string }
  | { kind: "fuse"; value: number }
  | { kind: "ready" }
  | { kind: "lobby"; what: "theme" | "worms" | "time" | "cpus"; dir: 1 | -1 };
