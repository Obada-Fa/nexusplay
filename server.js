// server.js — NexusPlay Socket.io Game Server
// Run with: node server.js

import { createServer } from "http";
import { Server } from "socket.io";
import { networkInterfaces } from "os";

const PORT = Number(process.env.SOCKET_PORT || 3001);
const HOST = "0.0.0.0"; // Listen on all interfaces so LAN devices can connect

function getLanIp() {
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

// ─── In-memory room registry ─────────────────────────────────────────────────
// rooms[roomCode] = {
//   hostSocketId: string,
//   players: Map<socketId, { id, color, name }>,
//   currentGame: { gameIndex: number; gameName: string } | null,
// }
const rooms = new Map();

// ─── Player colour palette ────────────────────────────────────────────────────
const PLAYER_COLORS = [
  "#FF6B6B", // coral red
  "#4ECDC4", // teal
  "#FFE66D", // yellow
  "#A8DADC", // sky blue
  "#C77DFF", // violet
  "#FF9F1C", // orange
  "#06D6A0", // emerald
  "#F72585", // pink
];

// ─── HTTP + Socket.io bootstrap ───────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    // Allow ALL origins in local dev — phones on the LAN will have a
    // different origin (e.g. http://192.168.x.x:3000) that would otherwise
    // be blocked by a strict allowlist.
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ─── Connection handler ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);
  socket.use(([event, payload], next) => {
    if (event !== "game_ended" && (!payload || typeof payload !== "object")) return;
    next();
  });

  // ── HOST: Creates a room ──────────────────────────────────────────────────
  socket.on("host_create_room", ({ roomCode }) => {
    if (typeof roomCode !== "string" || !/^\d{4}$/.test(roomCode)) return;
    if (rooms.has(roomCode)) {
      if (rooms.get(roomCode).hostSocketId === socket.id) return;
      socket.emit("room_closed", { message: "Room code already in use. Reload to create a new room." });
      return;
    }

    rooms.set(roomCode, {
      hostSocketId: socket.id,
      players: new Map(),
      currentGame: null,
    });

    socket.join(roomCode);
    socket.data.isHost = true;
    socket.data.roomCode = roomCode;
    console.log(`[R] Room created: ${roomCode} by host ${socket.id}`);

    socket.emit("room_created", { roomCode });
  });

  // ── PLAYER: Joins a room ──────────────────────────────────────────────────
  socket.on("player_join", ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit("join_error", { message: `Room "${roomCode}" not found. Check the code and try again.` });
      return;
    }

    if (socket.data.roomCode) {
      const existing = room.players.get(socket.id);
      if (existing) socket.emit("join_success", { player: existing, roomCode });
      else socket.emit("join_error", { message: "Already connected to a room. Reload to switch rooms." });
      return;
    }
    if (room.players.size >= 8) {
      socket.emit("join_error", { message: "This room is full (8 players). Wait for a spot to open." });
      return;
    }
    const playerIndex = room.players.size;
    const player = {
      id: socket.id,
      name: typeof playerName === "string" && playerName.trim() ? playerName.trim().slice(0, 16) : `Player ${playerIndex + 1}`,
      color: PLAYER_COLORS.find(color => ![...room.players.values()].some(p => p.color === color)),
      joinedAt: Date.now(),
    };

    room.players.set(socket.id, player);
    socket.join(roomCode);

    // Tag the socket so we can find its room on disconnect
    socket.data.roomCode = roomCode;
    socket.data.isHost = false;

    console.log(`[P] ${player.name} (${socket.id}) joined room ${roomCode}`);

    // Confirm to the controller
    socket.emit("join_success", { player, roomCode, gameName: room.currentGame?.gameName ?? "" });

    // If a game is already active, tell the new player
    if (room.currentGame) {
      socket.emit("game_started", room.currentGame);
    }

    // Notify the host
    io.to(room.hostSocketId).emit("player_joined", {
      player,
      totalPlayers: room.players.size,
    });
  });

  // ── CONTROLLER: Gallery navigation ───────────────────────────────────────
  socket.on("gallery_navigate", ({ roomCode, direction }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("gallery_navigate", {
      playerId: socket.id,
      direction,
    });
  });

  socket.on("gallery_select", ({ roomCode }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("gallery_select", {
      playerId: socket.id,
    });
  });

  socket.on("gallery_back", ({ roomCode }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id)) return;
    room.currentGame = null;
    io.to(room.hostSocketId).emit("gallery_back", {
      playerId: socket.id,
    });
  });

  // ── CONTROLLER: Sends movement angle ──────────────────────────────────────
  socket.on("steer", ({ roomCode, angle }) => {
    if (angle !== null && (typeof angle !== "number" || !Number.isFinite(angle))) return;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("player_steer", {
      playerId: socket.id,
      angle,
    });
  });

  // ── CONTROLLER: Boost ─────────────────────────────────────────────────────
  socket.on("boost_start", ({ roomCode }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("player_boost_start", {
      playerId: socket.id,
    });
  });

  socket.on("boost_end", ({ roomCode }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("player_boost_end", {
      playerId: socket.id,
    });
  });

  // ── CONTROLLER: Pong paddle movement ────────────────────────────────────
  socket.on("pong_move", ({ roomCode, direction }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("player_pong_move", {
      playerId: socket.id,
      direction,
    });
  });

  // ── CONTROLLER: Request respawn after death ───────────────────────────────
  socket.on("respawn_request", ({ roomCode }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("player_respawn_request", {
      playerId: socket.id,
    });
  });

  // ── CONTROLLER: DashZone jump ────────────────────────────────────────────
  socket.on("dash_jump", ({ roomCode }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    io.to(room.hostSocketId).emit("player_dash_jump", {
      playerId: socket.id,
    });
  });

  // ── HOST: Tell controller they died ───────────────────────────────────────
  socket.on("player_died", ({ playerId, score }) => {
    // Only the host should send this
    if (!socket.data.isHost || !rooms.get(socket.data.roomCode)?.players.has(playerId)) return;
    io.to(playerId).emit("player_died", { score });
  });

  // ── HOST: Game started (relay to controllers) ─────────────────────────────
  socket.on("game_started", ({ gameIndex, gameName }) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    room.currentGame = { gameIndex, gameName };
    io.to(roomCode).except(socket.id).emit("game_started", { gameIndex, gameName });
  });

  // ── HOST: Game ended (relay to controllers) ───────────────────────────────
  socket.on("game_ended", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    room.currentGame = null;
    io.to(roomCode).emit("game_ended");
  });

  // ── HOST: Assign pong side to a player ───────────────────────────────────
  socket.on("assign_pong_side", ({ playerId, side }) => {
    if (!socket.data.isHost || !rooms.get(socket.data.roomCode)?.players.has(playerId)) return;
    io.to(playerId).emit("pong_side", { side });
  });

  socket.on("slither_status", (payload) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostSocketId !== socket.id || !room.players.has(payload.playerId)) return;
    io.to(payload.playerId).volatile.emit("slither_status", payload);
  });

  socket.on("polar_status", (payload) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostSocketId !== socket.id || !room.players.has(payload.playerId)) return;
    io.to(payload.playerId).volatile.emit("polar_status", payload);
  });

  // ── CONTROLLER: PolarBash lobby actions (ready, bear class, stage) ──────
  socket.on("polar_action", ({ roomCode, action }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode) return;
    const valid = action && (action.kind === "ready"
      || (action.kind === "class" && typeof action.value === "string")
      || (action.kind === "stage" && (action.dir === 1 || action.dir === -1)));
    if (!valid) return;
    io.to(room.hostSocketId).emit("player_polar_action", { playerId: socket.id, action });
  });

  socket.on("worms_status", (payload) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostSocketId !== socket.id || !room.players.has(payload.playerId)) return;
    io.to(payload.playerId).volatile.emit("worms_status", payload);
  });

  // ── CONTROLLER: WormBlitz input (held keys, weapon/fuse picks, lobby) ───
  const WORMS_KEYS = ["left", "right", "up", "down", "fire", "jump", "backflip"];
  socket.on("worms_input", ({ roomCode, action }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id) || socket.data.roomCode !== roomCode || !action) return;
    const valid = (action.kind === "key" && WORMS_KEYS.includes(action.key) && typeof action.down === "boolean")
      || (action.kind === "weapon" && typeof action.id === "string" && action.id.length < 20)
      || (action.kind === "fuse" && Number.isInteger(action.value) && action.value >= 1 && action.value <= 5)
      || action.kind === "ready"
      || (action.kind === "lobby" && ["theme", "worms", "time", "cpus"].includes(action.what) && (action.dir === 1 || action.dir === -1));
    if (!valid) return;
    io.to(room.hostSocketId).emit("player_worms_input", { playerId: socket.id, action });
  });

  // ── Disconnect handler ────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    console.log(`[-] Socket disconnected: ${socket.id} (${reason})`);

    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    if (socket.data.isHost || room.hostSocketId === socket.id) {
      // Host left — tear down the room and notify all players
      console.log(`[R] Host left room ${roomCode} — dissolving room.`);
      io.to(roomCode).emit("room_closed", { message: "The host disconnected. Room closed." });
      for (const id of room.players.keys()) {
        const playerSocket = io.sockets.sockets.get(id);
        if (playerSocket) { playerSocket.leave(roomCode); delete playerSocket.data.roomCode; delete playerSocket.data.isHost; }
      }
      rooms.delete(roomCode);
      return;
    }

    // Player left
    const player = room.players.get(socket.id);
    if (player) {
      room.players.delete(socket.id);
      console.log(`[P] ${player.name} left room ${roomCode}`);

      io.to(room.hostSocketId).emit("player_left", {
        playerId: socket.id,
        totalPlayers: room.players.size,
      });
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, HOST, () => {
  const lan = getLanIp();
  console.log(`\n🎮 NexusPlay Socket.io server`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${lan}:${PORT}  ← phones connect here`);
  console.log(`   Health:  http://localhost:${PORT}/health\n`);
});
