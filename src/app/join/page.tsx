"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getSocket, destroySocket } from "@/lib/socket";
import type { Player } from "@/types/socket";
import { Suspense } from "react";

// ─── Remote Control (Gallery browsing) ───────────────────────────────────────
function RemoteControl({ player, roomCode }: { player: Player; roomCode: string }) {
  const [flashDir, setFlashDir] = useState<string | null>(null);

  const handleLeft = useCallback(() => {
    getSocket().emit("gallery_navigate", { roomCode, direction: "left" });
    setFlashDir("left");
    setTimeout(() => setFlashDir(null), 120);
  }, [roomCode]);

  const handleRight = useCallback(() => {
    getSocket().emit("gallery_navigate", { roomCode, direction: "right" });
    setFlashDir("right");
    setTimeout(() => setFlashDir(null), 120);
  }, [roomCode]);

  const handleSelect = useCallback(() => {
    getSocket().emit("gallery_select", { roomCode });
    setFlashDir("select");
    setTimeout(() => setFlashDir(null), 120);
  }, [roomCode]);

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-8 px-4 select-none touch-none overscroll-none bg-[#06060e]">
      {/* Player badge */}
      <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: player.color, boxShadow: `0 0 10px ${player.color}` }}
        />
        <span className="text-white/80 font-bold text-sm">{player.name}</span>
        <span className="text-white/15 text-[10px] font-mono ml-1 tracking-wider">R{roomCode}</span>
      </div>

      {/* Main D-Pad */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <p className="text-white/15 text-[10px] font-mono uppercase tracking-[0.2em]">Game Remote</p>

        <div className="relative flex flex-col items-center gap-3">
          {/* UP - decorative */}
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center text-white/10 text-lg">
            ▲
          </div>

          <div className="flex items-center gap-3">
            {/* LEFT */}
            <button
              onClick={handleLeft}
              className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-2xl transition-all duration-100 console-btn-press
                ${flashDir === "left"
                  ? "bg-violet-500/40 border-violet-400/60 text-white shadow-[0_0_30px_rgba(139,92,246,0.5)] scale-90"
                  : "bg-white/[0.04] border-white/[0.06] text-white/40 hover:bg-white/[0.08] hover:text-white/70"
                }`}
            >
              ←
            </button>

            {/* CENTER SELECT */}
            <button
              onClick={handleSelect}
              className={`w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-100 console-btn-press
                ${flashDir === "select"
                  ? "bg-violet-500 border-violet-300 text-white shadow-[0_0_40px_rgba(139,92,246,0.7)] scale-90"
                  : "bg-gradient-to-b from-violet-600 to-violet-800 border-violet-500/40 text-white/90 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                }`}
            >
              <span className="text-[11px] font-black uppercase tracking-wider">Start</span>
            </button>

            {/* RIGHT */}
            <button
              onClick={handleRight}
              className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-2xl transition-all duration-100 console-btn-press
                ${flashDir === "right"
                  ? "bg-violet-500/40 border-violet-400/60 text-white shadow-[0_0_30px_rgba(139,92,246,0.5)] scale-90"
                  : "bg-white/[0.04] border-white/[0.06] text-white/40 hover:bg-white/[0.08] hover:text-white/70"
                }`}
            >
              →
            </button>
          </div>

          {/* DOWN - decorative */}
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center text-white/10 text-lg">
            ▼
          </div>
        </div>

        <p className="text-white/10 text-[9px] font-mono tracking-wider">← → BROWSE · START TO PLAY</p>
      </div>

      <div />
    </div>
  );
}

// ─── Joystick Controller (Snake) ────────────────────────────────────────────
function JoystickController({ roomCode }: { roomCode: string }) {
  const [actionFlash, setActionFlash] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);

  const handleJoystickMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickRef.current || !joystickKnobRef.current) return;
    if (e.type === "pointerdown") {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDist = rect.width / 2;
    const clampedDist = Math.min(distance, maxDist);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;
    joystickKnobRef.current.style.transform = `translate(${knobX}px, ${knobY}px)`;
    getSocket().emit("steer", { roomCode, angle });
  }, [roomCode]);

  const handleJoystickEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(0px, 0px)`;
    }
  }, []);

  const handleBoostStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    getSocket().emit("boost_start", { roomCode });
    setActionFlash(true);
  }, [roomCode]);

  const handleBoostEnd = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    getSocket().emit("boost_end", { roomCode });
    setActionFlash(false);
  }, [roomCode]);

  return (
    <div className="w-full flex-1 flex items-end justify-between px-6 pb-8 select-none touch-none">
      {/* Joystick */}
      <div
        className="relative rounded-full border-2 border-white/[0.08] bg-white/[0.03] flex items-center justify-center shrink-0 shadow-[inset_0_0_30px_rgba(0,0,0,0.3)]"
        style={{ width: "140px", height: "140px" }}
        ref={joystickRef}
        onPointerDown={handleJoystickMove}
        onPointerMove={(e) => { if (e.buttons > 0) handleJoystickMove(e); }}
        onPointerUp={handleJoystickEnd}
        onPointerCancel={handleJoystickEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={joystickKnobRef}
          className="w-12 h-12 rounded-full bg-gradient-to-b from-white/30 to-white/10 border-2 border-white/20 shadow-lg pointer-events-none transition-transform duration-75"
        />
      </div>

      {/* Boost button */}
      <button
        onPointerDown={handleBoostStart}
        onPointerUp={handleBoostEnd}
        onPointerLeave={handleBoostEnd}
        onPointerCancel={handleBoostEnd}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-24 h-24 shrink-0 rounded-full text-3xl font-black border-2 transition-all duration-75
          ${actionFlash
            ? "bg-amber-400 border-amber-200 text-black scale-90 shadow-[0_0_40px_rgba(251,191,36,0.8)]"
            : "bg-gradient-to-b from-violet-600 to-violet-800 border-violet-500/30 text-white/90 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
          }`}
      >
        ⚡
      </button>
    </div>
  );
}

// ─── DashZone Controller (Tap to jump) ──────────────────────────────────────
function DashController({ roomCode }: { roomCode: string }) {
  const [flashing, setFlashing] = useState(false);

  const handleJump = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    getSocket().emit("dash_jump", { roomCode });
    setFlashing(true);
    setTimeout(() => setFlashing(false), 80);
  }, [roomCode]);

  return (
    <div
      className="w-full flex-1 flex items-center justify-center px-6 pb-8 select-none touch-none overscroll-none"
      onPointerDown={handleJump}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={`w-56 h-56 rounded-full border-2 flex flex-col items-center justify-center gap-2 transition-all duration-75
        ${flashing
          ? "bg-red-500/40 border-red-400/80 scale-90 shadow-[0_0_60px_rgba(239,68,68,0.6)]"
          : "bg-gradient-to-b from-red-600/60 to-red-800/60 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.25)]"
        }`}
      >
        <span className="text-4xl font-black text-white drop-shadow-lg">TAP</span>
        <span className="text-[10px] text-white/25 font-mono uppercase tracking-[0.2em]">to jump</span>
      </div>
    </div>
  );
}

// ─── Paddle Controller (Pong) ───────────────────────────────────────────────
function PaddleController({ roomCode, side }: { roomCode: string; side: "left" | "right" | null }) {
  const [heldDir, setHeldDir] = useState<"up" | "down" | null>(null);

  const emitMove = useCallback((direction: "up" | "down" | "stop") => {
    getSocket().emit("pong_move", { roomCode, direction });
  }, [roomCode]);

  const handleUpStart = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    emitMove("up");
    setHeldDir("up");
  }, [emitMove]);

  const handleDownStart = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    emitMove("down");
    setHeldDir("down");
  }, [emitMove]);

  const handleStop = useCallback((e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch {}
    emitMove("stop");
    setHeldDir(null);
  }, [emitMove]);

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center gap-3 px-4 pb-8 select-none touch-none">
      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/20">
        {side ? `P${side === "left" ? "1" : "2"} · ${side.toUpperCase()}` : "WAITING"}
      </span>
      <div className="flex items-center gap-5">
        <button
          onPointerDown={handleUpStart}
          onPointerUp={handleStop}
          onPointerLeave={handleStop}
          onPointerCancel={handleStop}
          onContextMenu={(e) => e.preventDefault()}
          className={`w-28 h-44 shrink-0 rounded-3xl text-5xl font-black border-2 transition-all duration-75
            ${heldDir === "up"
              ? "bg-violet-400/60 border-violet-300/60 scale-95 shadow-[0_0_40px_rgba(139,92,246,0.7)]"
              : "bg-gradient-to-b from-violet-600/50 to-violet-800/50 border-violet-500/20 text-white/80 shadow-[0_0_20px_rgba(139,92,246,0.2)]"
            }`}
        >
          ▲
        </button>
        <button
          onPointerDown={handleDownStart}
          onPointerUp={handleStop}
          onPointerLeave={handleStop}
          onPointerCancel={handleStop}
          onContextMenu={(e) => e.preventDefault()}
          className={`w-28 h-44 shrink-0 rounded-3xl text-5xl font-black border-2 transition-all duration-75
            ${heldDir === "down"
              ? "bg-violet-400/60 border-violet-300/60 scale-95 shadow-[0_0_40px_rgba(139,92,246,0.7)]"
              : "bg-gradient-to-b from-violet-600/50 to-violet-800/50 border-violet-500/20 text-white/80 shadow-[0_0_20px_rgba(139,92,246,0.2)]"
            }`}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

// ─── Controller Router ──────────────────────────────────────────────────────
function Controller({ player, roomCode }: { player: Player; roomCode: string }) {
  const [dead, setDead] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [gameName, setGameName] = useState("");
  const [pongSide, setPongSide] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onGameStarted = ({ gameName: gn }: { gameName: string }) => {
      setGameActive(true);
      setDead(false);
      setFinalScore(0);
      setGameName(gn);
      setPongSide(null);
    };

    const onDied = ({ score }: { score: number }) => {
      setFinalScore(score);
      setDead(true);
    };

    const onPongSide = ({ side }: { side: "left" | "right" }) => {
      setPongSide(side);
    };

    const onGameEnded = () => {
      setGameActive(false);
      setDead(false);
      setFinalScore(0);
      setPongSide(null);
    };

    socket.on("game_started", onGameStarted);
    socket.on("player_died", onDied);
    socket.on("pong_side", onPongSide);
    socket.on("game_ended", onGameEnded);

    return () => {
      socket.off("game_started", onGameStarted);
      socket.off("player_died", onDied);
      socket.off("pong_side", onPongSide);
      socket.off("game_ended", onGameEnded);
    };
  }, []);

  const handleRespawn = () => {
    getSocket().emit("respawn_request", { roomCode });
    setDead(false);
    setFinalScore(0);
  };

  const handleBackToGallery = () => {
    getSocket().emit("gallery_back", { roomCode });
    setGameActive(false);
    setDead(false);
    setFinalScore(0);
    setPongSide(null);
  };

  // ── Game over screen (snake only) ──────────────────────────────────────
  if (dead) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center py-10 px-6 bg-[#06060e] text-white gap-8">
        <div className="text-center">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-400/60 mb-4">Game Over</p>
          <h1 className="text-5xl font-black text-red-400 mb-2">DEFEATED</h1>
          <p className="text-2xl text-white/50">
            Score <span className="font-bold text-white">{finalScore}</span>
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-[240px]">
          <button
            onClick={handleRespawn}
            className="py-4 rounded-2xl font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-[0_0_30px_rgba(139,92,246,0.3)] console-btn-press"
          >
            Play Again
          </button>
          <button
            onClick={handleBackToGallery}
            className="py-3 rounded-2xl font-medium text-xs uppercase tracking-wider bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/70 hover:border-white/20 console-btn-press"
          >
            ← Lobby
          </button>
        </div>
      </div>
    );
  }

  // ── Gallery remote ────────────────────────────────────────────────────
  if (!gameActive) {
    return <RemoteControl player={player} roomCode={roomCode} />;
  }

  // ── Shared header for all game controllers ────────────────────────────
  const header = (
    <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2">
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: player.color, boxShadow: `0 0 10px ${player.color}` }}
      />
      <span className="text-white/80 font-bold text-sm">{player.name}</span>
      <span className="text-white/15 text-[10px] font-mono ml-1 tracking-wider">R{roomCode}</span>
    </div>
  );

  // ── Pong ──────────────────────────────────────────────────────────────
  if (gameName === "PongArena") {
    return (
      <div className="h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-6 px-4 select-none touch-none overscroll-none bg-[#06060e]">
        {header}
        <PaddleController roomCode={roomCode} side={pongSide} />
        <div />
      </div>
    );
  }

  // ── DashZone ──────────────────────────────────────────────────────────
  if (gameName === "DashZone") {
    return (
      <div className="h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-6 px-4 select-none touch-none overscroll-none bg-[#06060e]">
        {header}
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/15">Tap to Jump</p>
        <DashController roomCode={roomCode} />
        <div />
      </div>
    );
  }

  // ── PolarBash (joystick + dash button, same as snake) ─────────────────
  if (gameName === "PolarBash") {
    return (
      <div className="h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-6 px-4 select-none touch-none overscroll-none bg-[#06060e]">
        {header}
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/15">Ram them off the ice</p>
        <JoystickController roomCode={roomCode} />
      </div>
    );
  }

  // ── Snake (default) ──────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-6 px-4 select-none touch-none overscroll-none bg-[#06060e]">
      {header}
      <JoystickController roomCode={roomCode} />
    </div>
  );
}

// ─── Join Form ──────────────────────────────────────────────────────────────
type ConnStatus = "connecting" | "connected" | "error";

function JoinForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>(() => {
    if (typeof window !== "undefined") {
      const s = getSocket();
      if (s.connected) return "connected";
    }
    return "connecting";
  });
  const [joinedPlayer, setJoinedPlayer] = useState<Player | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<string>("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = [...code.split("").slice(0, 4)];
  while (digits.length < 4) digits.push("");

  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    socket.on("connect", () => setConnStatus("connected"));
    socket.on("connect_error", () => setConnStatus("error"));
    socket.on("disconnect", () => setConnStatus("connecting"));

    socket.on("join_success", ({ player, roomCode: rc }) => {
      setJoining(false);
      setJoinedPlayer(player);
      setJoinedRoom(rc);
    });

    socket.on("join_error", ({ message }) => {
      setJoining(false);
      setError(message);
    });

    socket.on("room_closed", () => {
      setJoinedPlayer(null);
      setError("The host closed the room.");
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("join_success");
      socket.off("join_error");
      socket.off("room_closed");
      destroySocket();
    };
  }, []);

  const handleDigitChange = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const arr = digits.slice();
    arr[i] = val;
    setCode(arr.join(""));
    setError("");
    if (val && i < 3) inputRefs.current[i + 1]?.focus();
  };

  const handleDigitKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputRefs.current[i - 1]?.focus();
  };

  const handleJoin = () => {
    if (connStatus !== "connected") {
      setError("Not connected to the game server.");
      return;
    }
    if (code.length !== 4) { setError("Enter all 4 digits."); return; }
    setError("");
    setJoining(true);
    getSocket().emit("player_join", {
      roomCode: code,
      playerName: name.trim() || "Player",
    });
  };

  if (joinedPlayer) {
    return <Controller player={joinedPlayer} roomCode={joinedRoom} />;
  }

  const statusConfig: Record<ConnStatus, { dot: string; label: string; ring: string }> = {
    connecting: { dot: "bg-amber-400 text-amber-400 led-pulse", label: "Connecting", ring: "border-amber-500/20 text-amber-400" },
    connected:  { dot: "bg-emerald-400 text-emerald-400 led-pulse", label: "Online", ring: "border-emerald-500/20 text-emerald-400" },
    error:      { dot: "bg-red-400 text-red-400", label: "Offline", ring: "border-red-500/20 text-red-400" },
  };
  const { dot, label, ring } = statusConfig[connStatus];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#06060e]">
      <div className="mb-8 text-center">
        <p className="text-5xl mb-4 drop-shadow-[0_0_20px_rgba(139,92,246,0.3)]">🎮</p>
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
          NexusPlay
        </h1>
        <p className="text-white/20 text-xs mt-2 font-mono tracking-wider uppercase">Join Room</p>
      </div>

      <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border mb-6 ${ring}`}>
        <span className={`w-2 h-2 rounded-full ${dot}`} style={{ color: connStatus === "connected" ? "#34d399" : connStatus === "error" ? "#f87171" : "#fbbf24" }} />
        {label}
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-7">
        <div className="mb-5">
          <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 mb-3">
            Name
          </label>
          <input
            type="text"
            maxLength={16}
            placeholder="Player"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm
              placeholder-white/10 focus:outline-none focus:border-violet-500/40 transition-all duration-200"
          />
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 mb-3">
            Room Code
          </label>
          <div className="flex gap-3 justify-center">
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="\d"
                maxLength={1}
                value={digits[i]}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => {
                  handleDigitKeyDown(i, e);
                  if (e.key === "Enter") handleJoin();
                }}
                onFocus={(e) => e.target.select()}
                className={`w-16 h-16 rounded-xl text-center text-2xl font-black border-2 bg-white/[0.03] text-white
                  focus:outline-none transition-all duration-200 font-mono
                  ${digits[i]
                    ? "border-violet-500/60 bg-violet-500/[0.08] shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                    : "border-white/[0.06] focus:border-violet-500/30"
                  }`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="text-red-400/80 text-xs text-center mb-4 bg-red-500/[0.06] rounded-xl px-3 py-2.5 border border-red-500/[0.12]">
            {error}
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={joining || code.length !== 4 || connStatus === "error"}
          className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider transition-all duration-200
            bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500
            text-white shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]
            disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none console-btn-press"
        >
          {joining ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Joining
            </span>
          ) : "Join Game →"}
        </button>
      </div>

      <p className="mt-6 text-[10px] text-white/10 font-mono text-center">
        Ask the host for the 4-digit code on screen
      </p>
    </main>
  );
}

// ─── Page wrapper ────────────────────────────────────────────────────────────
export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#06060e]">
          <div className="w-8 h-8 border-2 border-violet-500/20 border-t-violet-400 rounded-full animate-spin" />
        </div>
      }
    >
      <JoinForm />
    </Suspense>
  );
}
