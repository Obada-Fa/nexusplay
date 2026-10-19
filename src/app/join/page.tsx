"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getSocket, destroySocket } from "@/lib/socket";
import type { Player, SlitherStatus, PolarStatus, WormsStatus, WormsAction, WormsKey } from "@/types/socket";
import { WEAPONS as WORM_WEAPONS, WEAPON as WORM_WEAPON } from "@/lib/worms/weapons";
import { CLASSES as POLAR_CLASSES, STAGES as POLAR_STAGES, RULES as POLAR_RULES } from "@/lib/polar/engine";
import Link from "next/link";
import { SessionMenu } from "@/components/session-menu";
import type { SessionState, RemoteCommand } from "@/types/socket";
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
  useEffect(() => {
    const keys = new Set<string>();
    const update = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " ", "shift"].includes(key)) return;
      event.preventDefault();
      if (event.type === "keydown") keys.add(key); else keys.delete(key);
      const x = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
      const y = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
      if (x || y) getSocket().emit("steer", { roomCode, angle: Math.atan2(y, x) });
      if (key === " " || key === "shift") {
        const boost = keys.has(" ") || keys.has("shift");
        getSocket().emit(boost ? "boost_start" : "boost_end", { roomCode });
        setActionFlash(boost);
      }
    };
    const clear = () => keys.clear();
    window.addEventListener("keydown", update); window.addEventListener("keyup", update); window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", update); window.removeEventListener("keyup", update); window.removeEventListener("blur", clear); };
  }, [roomCode]);
  useEffect(() => {
    const release = () => { getSocket().emit("boost_end", { roomCode }); setActionFlash(false); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      getSocket().emit("boost_end", { roomCode });
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [roomCode]);

  const handleJoystickMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickRef.current || !joystickKnobRef.current) return;
    if (e.type === "pointerdown") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDist = rect.width / 2 - 24;
    const clampedDist = Math.min(distance, maxDist);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;
    joystickKnobRef.current.style.transform = `translate(${knobX}px, ${knobY}px)`;
    if (distance > 8) getSocket().emit("steer", { roomCode, angle });
  }, [roomCode]);

  const handleJoystickEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(0px, 0px)`;
    }
  }, []);

  const handleBoostStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    getSocket().emit("boost_start", { roomCode });
    setActionFlash(true);
  }, [roomCode]);

  const handleBoostEnd = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    getSocket().emit("boost_end", { roomCode });
    setActionFlash(false);
  }, [roomCode]);

  return (
    <div className="w-full flex-1 flex items-end justify-between px-6 pb-8 snake-ctl select-none touch-none landscape:absolute landscape:inset-0 landscape:items-center landscape:px-10 landscape:pb-0 landscape:pointer-events-none">
      {/* Joystick */}
      <div
        className="relative rounded-full border-2 border-white/[0.08] bg-white/[0.03] flex items-center justify-center shrink-0 shadow-[inset_0_0_30px_rgba(0,0,0,0.3)] landscape:pointer-events-auto"
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
        aria-label="Hold to boost"
        onPointerDown={handleBoostStart}
        onPointerUp={handleBoostEnd}
        onPointerCancel={handleBoostEnd}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-24 h-24 shrink-0 rounded-full text-3xl font-black border-2 transition-all duration-75 landscape:pointer-events-auto
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
      className="w-full flex-1 flex items-center justify-center px-6 pb-8 landscape:pb-2 select-none touch-none overscroll-none"
      onPointerDown={handleJump}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={`w-56 h-56 landscape:w-44 landscape:h-44 rounded-full border-2 flex flex-col items-center justify-center gap-2 transition-all duration-75
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
    <div className="w-full flex-1 flex flex-col items-center justify-center gap-3 px-4 pb-8 landscape:pb-2 select-none touch-none">
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
          className={`w-28 h-44 landscape:w-[34vw] landscape:h-[48vh] shrink-0 rounded-3xl text-5xl font-black border-2 transition-all duration-75
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
          className={`w-28 h-44 landscape:w-[34vw] landscape:h-[48vh] shrink-0 rounded-3xl text-5xl font-black border-2 transition-all duration-75
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

// ─── PolarBash Controller (Polar Push) ──────────────────────────────────────
function PolarController({ player, roomCode, status }: { player: Player; roomCode: string; status: PolarStatus | null }) {
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  const act = (action: Parameters<typeof emitPolar>[1]) => emitPolar(roomCode, action);

  useEffect(() => {
    const release = () => getSocket().emit("steer", { roomCode, angle: null });
    window.addEventListener("blur", release);
    return () => { release(); window.removeEventListener("blur", release); };
  }, [roomCode]);

  const move = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!stickRef.current || !knobRef.current) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (e.buttons === 0) return;
    const r = stickRef.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), max = r.width / 2 - 30, a = Math.atan2(dy, dx), k = Math.min(d, max);
    knobRef.current.style.transform = `translate(${Math.cos(a) * k}px, ${Math.sin(a) * k}px)`;
    getSocket().volatile.emit("steer", { roomCode, angle: d > 12 ? a : null });
  }, [roomCode]);
  const end = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
    getSocket().emit("steer", { roomCode, angle: null });
  }, [roomCode]);
  const dash = (e: React.PointerEvent) => {
    e.preventDefault();
    getSocket().emit("boost_start", { roomCode });
    setPressed(true);
    navigator.vibrate?.(25);
  };

  const color = status?.color ?? player.color;
  const header = (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
      <span className="text-white/90 font-bold text-sm">{player.name}</span>
      <span className="text-[13px]">{Array.from({ length: POLAR_RULES.winsNeeded }, (_, i) => <span key={i} style={{ filter: i < (status?.wins ?? 0) ? "none" : "grayscale(1) brightness(.4)" }}>🏆</span>)}</span>
    </div>
  );
  const shell = (children: React.ReactNode) => (
    <div className="polar-phone h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-6 px-4 landscape:py-2 select-none touch-none overscroll-none text-white">{children}</div>
  );

  if (!status) return shell(<>{header}<p className="text-sm text-white/60">Connecting to the ice…</p><div /></>);
  if (!status.seated) return shell(<>{header}<div className="text-center"><p className="text-4xl mb-3">🐻‍❄️</p><h2 className="text-2xl font-black">All 4 bears are taken</h2><p className="text-sm text-white/60 mt-2">Watch the big screen — you&apos;ll get a bear when a spot opens.</p></div><div /></>);

  if (status.phase === "lobby") {
    const stageIdx = POLAR_STAGES.findIndex(st => st.name === status.stage);
    return shell(<>
      {header}
      <div className="w-full flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <button className="w-10 h-10 rounded-full bg-white/10 text-lg" onClick={() => act({ kind: "stage", dir: -1 })}>‹</button>
          <div className="text-center min-w-[150px]"><p className="text-[9px] font-mono tracking-[0.2em] text-sky-200/70">STAGE {stageIdx + 1}/4</p><p className="font-black text-lg">{status.stage}</p></div>
          <button className="w-10 h-10 rounded-full bg-white/10 text-lg" onClick={() => act({ kind: "stage", dir: 1 })}>›</button>
        </div>
        <p className="text-[10px] text-white/40 -mt-2">Player 1 picks the stage</p>
        <div className="polar-classes" style={{ ["--pc" as string]: color }}>
          {POLAR_CLASSES.map(c => (
            <button key={c.id} className={status.cls === c.id ? "on" : ""} disabled={status.ready} onClick={() => act({ kind: "class", value: c.id })}>
              <b>{c.icon} {c.name}</b>
              <span>{c.id === "allround" ? "Balanced push and speed" : c.id === "heavy" ? "Huge push, slow, hard to move" : c.id === "speedy" ? "Fast, quick stamina, light push" : "Shrugs off hits fastest"}</span>
            </button>
          ))}
        </div>
      </div>
      <button onClick={() => act({ kind: "ready" })} className="w-full max-w-[340px] py-5 rounded-2xl font-black text-lg uppercase tracking-wider transition-all" style={status.ready ? { background: "#7dffb0", color: "#04243d" } : { background: color, color: "#04243d" }}>
        {status.ready ? "Ready ✓ (tap to cancel)" : "I'm ready"}
      </button>
    </>);
  }

  if (status.phase === "matchover") {
    return shell(<>
      {header}
      <div className="text-center">
        <p className="text-[10px] font-mono tracking-[0.2em] text-sky-200/70 mb-2">MATCH OVER</p>
        <h1 className="text-4xl font-black" style={{ color: status.isChampion ? "#ffd23f" : "#fff" }}>{status.isChampion ? "You're King of the Ice! 👑" : `${status.champion} wins`}</h1>
        <p className="text-white/60 mt-3">You won {status.wins} round{status.wins === 1 ? "" : "s"}.</p>
      </div>
      <button disabled={!status.canRematch} onClick={() => act({ kind: "ready" })} className="w-full max-w-[340px] py-5 rounded-2xl font-black text-lg uppercase bg-sky-300 text-[#04243d] disabled:opacity-40">Rematch</button>
    </>);
  }

  const canDash = status.alive && status.stamina >= POLAR_RULES.dashCost && status.phase === "playing";
  const banner = status.phase === "intro" ? `Round ${status.round}` : status.phase === "countdown" ? String(status.countdown)
    : status.phase === "roundover" ? (status.roundWinner ? `${status.roundWinner} wins the round` : "Draw!") : !status.alive ? "SPLASH! 💦" : null;
  return shell(<>
    {header}
    <div className="text-center min-h-[70px] landscape:min-h-[40px]">
      {banner ? <h2 className="text-3xl font-black">{banner}</h2> : <p className="text-[10px] font-mono tracking-[0.2em] text-sky-200/70">{status.stage.toUpperCase()} · ROUND {status.round} · {status.clock}s</p>}
      {!status.alive && status.phase === "playing" && <p className="text-sm text-white/60 mt-1">You fell in. Next round starts soon.</p>}
      {status.power && status.alive && <p className="text-sm font-black text-amber-300 mt-1">🐟 POWER FISH! Mega push!</p>}
    </div>
    <div className="polar-ctl w-full max-w-[420px] landscape:max-w-none flex-1 flex items-end landscape:items-center justify-between gap-4 pb-6 landscape:pb-2">
      <div ref={stickRef} onPointerDown={move} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onContextMenu={e => e.preventDefault()}
        className="relative rounded-full border-2 border-white/15 bg-white/[0.05] flex items-center justify-center shrink-0 shadow-[inset_0_0_30px_rgba(0,0,0,0.35)]" style={{ width: 156, height: 156 }}>
        <div ref={knobRef} className="w-16 h-16 rounded-full border-2 border-white/30 pointer-events-none transition-transform duration-75" style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${color})` }} />
      </div>
      <button onPointerDown={dash} onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onContextMenu={e => e.preventDefault()}
        className="relative w-28 h-28 shrink-0 rounded-full font-black text-lg transition-transform duration-75"
        style={{ transform: pressed ? "scale(0.9)" : "none", opacity: canDash ? 1 : 0.5, color: "#04243d",
          background: `conic-gradient(${status.power ? "#ffd76a" : "#7fe3ff"} ${status.stamina * 3.6}deg, #ffffff22 0)` }}>
        <span className="absolute inset-[7px] rounded-full flex items-center justify-center" style={{ background: canDash ? "#e8f8ff" : "#8aa3b8" }}>DASH</span>
      </button>
    </div>
    <p className="text-[9px] tracking-widest text-white/50">MOVE WITH THE STICK · DASH TO RAM · DON&apos;T FALL IN</p>
  </>);
}

function emitPolar(roomCode: string, action: { kind: "ready" } | { kind: "class"; value: string } | { kind: "stage"; dir: 1 | -1 }) {
  getSocket().emit("polar_action", { roomCode, action });
}

// ─── WormBlitz Controller ───────────────────────────────────────────────────
function HoldButton({ k, roomCode, className, children, style }: { k: WormsKey; roomCode: string; className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const [held, setHeld] = useState(false);
  const send = (down: boolean) => { getSocket().emit("worms_input", { roomCode, action: { kind: "key", key: k, down } }); setHeld(down); };
  return (
    <button className={`${className ?? ""} ${held ? "held" : ""}`} style={style} onContextMenu={e => e.preventDefault()}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); send(true); navigator.vibrate?.(10); }}
      onPointerUp={() => held && send(false)} onPointerCancel={() => held && send(false)} onLostPointerCapture={() => held && send(false)}>
      {children}
    </button>
  );
}

function WormsController({ player, roomCode, status }: { player: Player; roomCode: string; status: WormsStatus | null }) {
  const [sheet, setSheet] = useState(false);
  const act = useCallback((action: WormsAction) => getSocket().emit("worms_input", { roomCode, action }), [roomCode]);
  useEffect(() => {
    const release = () => { for (const key of ["left", "right", "up", "down", "fire", "jump", "backflip"] as WormsKey[]) act({ kind: "key", key, down: false }); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => { release(); window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", release); };
  }, [act]);

  const color = status?.color ?? player.color;
  const shell = (children: React.ReactNode) => (
    <div className="worms-phone h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-5 px-4 select-none touch-none overscroll-none" style={{ ["--tc" as string]: color }}>{children}</div>
  );
  const header = (
    <div className="worms-pill flex items-center gap-2 rounded-full border border-white/10 bg-black/30">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
      <span className="font-bold text-sm">{status?.teamName || player.name}</span>
      {status && status.phase !== "lobby" && status.seated && <span className="text-[11px] font-mono text-white/60">{status.myHp} HP</span>}
    </div>
  );
  const teamBars = status && (
    <div className="w-full max-w-[360px] grid gap-1.5">
      {status.teams.map(t => (
        <div key={t.name} className="grid grid-cols-[90px_1fr_34px] items-center gap-2 text-[11px] font-bold" style={{ opacity: t.alive ? 1 : 0.35 }}>
          <span className="truncate" style={{ color: t.color }}>{t.name}</span>
          <div className="h-2 rounded bg-white/10 overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.min(100, (t.hp / Math.max(1, t.max)) * 100)}%`, background: t.color }} /></div>
          <span className="text-right font-mono">{t.hp}</span>
        </div>
      ))}
    </div>
  );

  if (!status) return shell(<>{header}<p className="text-sm text-white/60">Digging in…</p><div /></>);

  if (status.phase === "lobby") {
    const row = (label: string, value: string, what: "theme" | "worms" | "time" | "cpus") => (
      <div className="worms-row flex items-center justify-between w-full rounded-2xl bg-white/[0.05] border border-white/10">
        <span className="text-[9px] font-mono tracking-[0.2em] text-pink-200/70">{label}</span>
        <div className="flex items-center gap-2">
          {status.isHost && <button className="w-8 h-8 rounded-full bg-white/10" onClick={() => act({ kind: "lobby", what, dir: -1 })}>‹</button>}
          <b className="min-w-[110px] text-center text-sm">{value}</b>
          {status.isHost && <button className="w-8 h-8 rounded-full bg-white/10" onClick={() => act({ kind: "lobby", what, dir: 1 })}>›</button>}
        </div>
      </div>
    );
    if (!status.seated) return shell(<>{header}<div className="text-center"><p className="text-5xl mb-3">🪱</p><h2 className="text-2xl font-black">All 4 teams are full</h2><p className="text-sm text-white/60 mt-2">You&apos;re spectating this battle. Watch the big screen!</p></div><div /></>);
    return shell(<>
      {header}
      <div className="w-full max-w-[360px] flex flex-col items-center gap-2">
        <p className="text-5xl">🪱</p>
        <h1 className="text-3xl font-black" style={{ color: "#ffc4d8" }}>Worm<span style={{ color: "#ffd23f" }}>Blitz</span></h1>
        <p className="text-[11px] text-white/50 mb-2">{status.isHost ? "You're the war chief — set up the battle." : "The first player sets up the battle."}</p>
        {row("MAP", status.theme, "theme")}
        {row("WORMS", `${status.wormsPer} per team`, "worms")}
        {row("TURN", `${status.turnTime} seconds`, "time")}
        {status.isHost && row("CPU", "add / remove bots", "cpus")}
      </div>
      <button onClick={() => act({ kind: "ready" })} className="worms-cta w-full max-w-[340px] rounded-2xl font-black text-lg uppercase tracking-wider" style={status.ready ? { background: "#7dffb0", color: "#062a16" } : { background: color, color: "#140a10" }}>
        {status.ready ? "Ready ✓ (tap to cancel)" : "Ready for war"}
      </button>
    </>);
  }

  if (status.phase === "gameover") {
    return shell(<>
      {header}
      <div className="text-center">
        <p className="text-[10px] font-mono tracking-[0.2em] text-pink-200/70 mb-2">BATTLE OVER</p>
        <h1 className="text-4xl font-black" style={{ color: status.isWinner ? "#ffd23f" : "#fff" }}>{status.isWinner ? "Victory! 🏆" : status.winner ? `${status.winner} win` : "Nobody survived"}</h1>
      </div>
      {teamBars}
      <button disabled={!status.canRematch} onClick={() => act({ kind: "ready" })} className="worms-cta w-full max-w-[340px] rounded-2xl font-black text-lg uppercase disabled:opacity-40" style={{ background: "#ffd23f", color: "#3a1a00" }}>Back to lobby</button>
    </>);
  }

  if (!status.seated) return shell(<>{header}<div className="text-center"><h2 className="text-2xl font-black">Spectating</h2><p className="text-sm text-white/60 mt-2">{status.playing ? `${status.playing} are up.` : "Battle in progress."}</p></div>{teamBars}</>);

  if (!status.myTurn) {
    const myTeamAlive = status.teams.find(t => t.name === status.teamName)?.alive ?? 0;
    return shell(<>
      {header}
      <div className="text-center">
        {myTeamAlive === 0 ? <><p className="text-5xl mb-2">🪦</p><h2 className="text-2xl font-black">Your team is out</h2><p className="text-sm text-white/60 mt-1">Stick around for the finale.</p></>
          : status.phase === "intro" ? <><p className="text-5xl mb-2">🪂</p><h2 className="text-2xl font-black">Worms dropping in…</h2><p className="text-sm text-white/60 mt-1">Find your team on the big screen.</p></>
          : status.playing === status.teamName && (status.phase === "settle" || status.phase === "resolve") ? <><p className="text-5xl mb-2">💥</p><h2 className="text-2xl font-black">Waiting for the dust to settle…</h2><p className="text-sm text-white/60 mt-1">Let&apos;s see what that did.</p></>
          : <><p className="text-[10px] font-mono tracking-[0.2em] text-white/50">NOW PLAYING</p><h2 className="text-3xl font-black mt-1" style={{ color: status.playingColor }}>{status.playing}</h2><p className="text-sm text-white/60 mt-2">Watch the big screen. Plan your revenge.</p></>}
      </div>
      {teamBars}
    </>);
  }

  const w = WORM_WEAPON[status.weapon];
  const ammo = status.ammo[status.weapon];
  const wind = Math.round(status.wind * 100);
  const fireLabel = status.sheep ? "BOOM" : status.targeting ? "MARK" : status.jet > 0 ? "STOP" : w.mode === "charge" || (status.weapon === "homing" && !status.targeting) ? "FIRE" : status.weapon === "skip" ? "SKIP" : "USE";
  return shell(<div className="worms-play">
    <div className="worms-center">
    <div className="w-full max-w-[420px] flex items-center justify-between">
      {header}
      <div className="text-right">
        <div className="text-3xl font-black tabular-nums" style={{ color: status.retreat ? "#ffb020" : status.timer <= 5 ? "#ff6a6a" : "#fff" }}>{status.timer}</div>
        <div className="text-[9px] font-mono tracking-widest text-white/50">{status.retreat ? "RETREAT!" : `WIND ${wind === 0 ? "—" : `${wind < 0 ? "◀" : ""}${Math.abs(wind)}${wind > 0 ? "▶" : ""}`}`}</div>
      </div>
    </div>
    <div className="w-full max-w-[420px] flex flex-col items-center gap-2">
      <p className="text-[10px] font-mono tracking-[0.2em] text-white/50">YOUR WORM</p>
      <h2 className="text-2xl font-black -mt-1" style={{ color }}>{status.wormName}</h2>
      <button disabled={status.retreat || status.charging} onClick={() => setSheet(true)} className="worms-card w-full flex items-center gap-3 rounded-2xl border-2 bg-white/[0.06] disabled:opacity-50" style={{ borderColor: color }}>
        <span className="text-3xl">{w.icon}</span>
        <span className="flex-1 text-left"><b className="block text-base">{w.name}</b><span className="text-[11px] text-white/60">{status.targeting ? "D-pad moves the cursor · MARK to confirm" : status.sheep ? "Tap BOOM to detonate the sheep!" : w.hint}</span></span>
        <span className="font-mono text-sm text-white/70">{ammo < 0 ? "∞" : `×${ammo}`}</span>
      </button>
      {w.fuse && !status.retreat && <div className="worms-fuses">{[1, 2, 3, 4, 5].map(v => <button key={v} className={status.fuse === v ? "on" : ""} onClick={() => act({ kind: "fuse", value: v })}>{v}s</button>)}</div>}
    </div>
    </div>
    <div className="worms-controls w-full max-w-[420px] flex items-end justify-between gap-3 pb-2">
      <div className="worms-pad">
        <div /><HoldButton k="up" roomCode={roomCode}>▲</HoldButton><div />
        <HoldButton k="left" roomCode={roomCode}>◀</HoldButton>
        <HoldButton k="backflip" roomCode={roomCode} className="!text-[11px]">FLIP</HoldButton>
        <HoldButton k="right" roomCode={roomCode}>▶</HoldButton>
        <div /><HoldButton k="down" roomCode={roomCode}>▼</HoldButton><div />
      </div>
      <div className="flex flex-col items-center gap-3">
        <HoldButton k="jump" roomCode={roomCode} className="worms-act w-[88px] h-[52px] !text-sm">JUMP</HoldButton>
        <HoldButton k="fire" roomCode={roomCode} className="worms-fire" style={{ background: `conic-gradient(#ff5a2a ${status.power * 360}deg, #ffd23f 0)`, boxShadow: `0 6px 0 #8a4a00, 0 0 ${10 + status.power * 40}px #ffb020aa` }}>
          <span className="absolute inset-[8px] rounded-full flex items-center justify-center" style={{ background: status.charging ? "#fff2c0" : "#ffe48a" }}>{fireLabel}</span>
        </HoldButton>
      </div>
    </div>
    {sheet && !status.retreat && <div className="worms-sheet" onClick={() => setSheet(false)}>
      <div onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}><b className="text-lg">Arsenal</b><button className="text-white/60 text-sm" onClick={() => setSheet(false)}>Close ✕</button></div>
        <div className="worms-grid">
          {WORM_WEAPONS.map(x => {
            const n = status.ammo[x.id], locked = status.locked.includes(x.id);
            return <button key={x.id} disabled={n === 0 || locked} className={x.id === status.weapon ? "on" : ""} onClick={() => { act({ kind: "weapon", id: x.id }); setSheet(false); }}>
              <b>{x.icon}</b><span>{x.name}</span><em>{locked ? `R${x.delay + 1}` : n < 0 ? "∞" : `×${n}`}</em>
            </button>;
          })}
        </div>
      </div>
    </div>}
  </div>);
}

// ─── Controller Router ──────────────────────────────────────────────────────
function Controller({ player, roomCode, initialGame, initialSide }: { player: Player; roomCode: string; initialGame: string; initialSide: "left" | "right" | null }) {
  const [dead, setDead] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [gameActive, setGameActive] = useState(Boolean(initialGame));
  const [gameName, setGameName] = useState(initialGame);
  const [snakeStatus, setSnakeStatus] = useState<SlitherStatus | null>(null);
  const pongSide = initialSide;
  const [polarStatus, setPolarStatus] = useState<PolarStatus | null>(null);
  const [wormsStatus, setWormsStatus] = useState<WormsStatus | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onGameStarted = ({ gameName: gn }: { gameName: string }) => {
      setGameActive(true);
      setDead(false);
      setFinalScore(0);
      setGameName(gn);

    };

    const onDied = ({ score }: { score: number }) => {
      setFinalScore(score);
      setDead(true);
    };

    const onGameEnded = () => {
      setGameActive(false);
      setDead(false);
      setFinalScore(0);

    };

    const onSnakeStatus = (data: SlitherStatus) => {
      setSnakeStatus(data); setDead(data.dead); setFinalScore(data.score);
    };
    socket.on("slither_status", onSnakeStatus);
    socket.on("polar_status", setPolarStatus);
    socket.on("worms_status", setWormsStatus);
    socket.on("game_started", onGameStarted);
    socket.on("player_died", onDied);

    socket.on("game_ended", onGameEnded);

    return () => {
      socket.off("slither_status", onSnakeStatus);
      socket.off("polar_status", setPolarStatus);
      socket.off("worms_status", setWormsStatus);
      socket.off("game_started", onGameStarted);
      socket.off("player_died", onDied);

      socket.off("game_ended", onGameEnded);
    };
  }, []);

  const handleRespawn = () => {
    getSocket().emit("respawn_request", { roomCode });
    if (gameName !== "SlitherPlay") { setDead(false); setFinalScore(0); }
  };

  const handleBackToGallery = () => {
    getSocket().emit("gallery_back", { roomCode });
  };

  // ── Game over screen (snake only) ──────────────────────────────────────
  if (gameName === "SlitherPlay" && snakeStatus?.phase === "finished") {
    return <div className="h-[100dvh] snake-phone flex flex-col items-center justify-center gap-6 text-center px-6">
      <span className="slither-eyebrow">ROUND COMPLETE</span><h1 className="text-4xl font-black text-emerald-200">Nice run, {player.name}.</h1>
      <div className="snake-phone-stats"><div><span>POINTS</span><strong>{snakeStatus.score}</strong></div><div><span>ELIMINATIONS</span><strong>{snakeStatus.kills}</strong></div></div>
      <p className="text-sm text-white/50">Check the big screen for the winner.<br />The host can start a rematch.</p>
    </div>;
  }
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
            disabled={gameName === "SlitherPlay" && (!snakeStatus || snakeStatus.cooldown > 0)}
            onClick={handleRespawn}
            className="py-4 rounded-2xl font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-[0_0_30px_rgba(139,92,246,0.3)] console-btn-press disabled:opacity-40"
          >
            {gameName === "SlitherPlay" && snakeStatus?.cooldown ? `Respawn in ${snakeStatus.cooldown}…` : "Back into the arena ↗"}
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

  // ── PolarBash ─────────────────────────────────────────────────────────
  if (gameName === "PolarBash") {
    return <PolarController player={player} roomCode={roomCode} status={polarStatus} />;
  }

  if (gameName === "WormBlitz") {
    return <WormsController player={player} roomCode={roomCode} status={wormsStatus} />;
  }

  // Live telemetry is sent only to this player's phone.
  return (
    <div className="snake-phone relative h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between py-6 px-4 landscape:py-3 landscape:justify-start landscape:gap-2 select-none touch-none overscroll-none">
      {header}
      <div className="text-center mt-6 landscape:mt-0">
        <div className="snake-phone-stats"><div><span>POINTS</span><strong>{snakeStatus?.score ?? 0}</strong></div><div><span>TIME LEFT</span><strong>{Math.floor((snakeStatus?.remaining ?? 180) / 60)}:{String((snakeStatus?.remaining ?? 180) % 60).padStart(2, "0")}</strong></div><div><span>KILLS</span><strong>{snakeStatus?.kills ?? 0}</strong></div></div>
        <div className="snake-phone-meter"><i style={{ width: `${snakeStatus?.boost ?? 0}%` }} /></div>
        <p className="text-[10px] text-emerald-100/50">{snakeStatus?.phase === "countdown" ? "Get ready. Look at the big screen!" : (snakeStatus?.boost ?? 0) < 2 ? "Eat orbs to fuel your boost" : "Boost burns length. Your points are safe."}</p>
      </div>
      <JoystickController roomCode={roomCode} />
      <p className="text-[9px] tracking-widest text-white/40 pb-2 landscape:absolute landscape:bottom-1 landscape:left-0 landscape:right-0 landscape:text-center landscape:pb-0">STEER WITH YOUR LEFT THUMB · HOLD ⚡ TO BOOST</p>
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
  const [initialGame, setInitialGame] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [side, setSide] = useState<"left" | "right" | null>(null);
  const revisionRef = useRef(-1);
  const reconnectRef = useRef<{ roomCode: string; playerName: string } | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = [...code.split("").slice(0, 4)];
  while (digits.length < 4) digits.push("");

  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    socket.on("session_state", state => {
      if (revisionRef.current !== state.revision) setSide(null);
      revisionRef.current = state.revision;
      setSession(state);
    });
    socket.on("pong_side", ({ side }) => setSide(side));
    socket.on("connect", () => {
      setConnStatus("connected");
      if (reconnectRef.current) socket.emit("player_join", reconnectRef.current);
    });
    socket.on("connect_error", () => setConnStatus("error"));
    socket.on("disconnect", () => {
      socket.sendBuffer = [];
      setConnStatus("connecting"); setJoining(false);
      setError("Connection lost. Reconnecting…");
    });

    socket.on("join_success", ({ player, roomCode: rc, gameName }) => {
      setInitialGame(gameName ?? "");
      reconnectRef.current = { roomCode: rc, playerName: player.name };
      setError("");
      setJoining(false);
      setJoinedPlayer(player);
      setJoinedRoom(rc);
    });

    socket.on("join_error", ({ message }) => {
      setJoinedPlayer(null); reconnectRef.current = null;
      setJoining(false);
      setError(message);
    });

    socket.on("room_closed", () => {
      reconnectRef.current = null; setSession(null);
      setJoinedPlayer(null);
      setError("The host closed the room.");
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("session_state");
      socket.off("pong_side");
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
    const main = session?.controllerId === joinedPlayer.id;
    const connected = connStatus === "connected";
    const command = (action: RemoteCommand) => { if (connected && main) getSocket().emit("remote_command", { roomCode: joinedRoom, action }); };
    return <div className="remote-shell">
      <div className="remote-toolbar"><span>{!connected ? "Reconnecting…" : main ? "Main remote" : `${session?.controllerName || "First player"} controls the screen`}</span><span>Room {joinedRoom}</span>
        {session?.gameName && <button disabled={!main || !connected} onClick={() => command("menu")}>☰ Menu</button>}
      </div>
      <div className="remote-content" inert={!connected || Boolean(session?.paused) || (!main && !session?.gameName)}>
        <Controller key={`${joinedPlayer.id}:${session?.revision ?? 0}`} player={joinedPlayer} roomCode={joinedRoom} initialGame={session?.gameName ?? initialGame} initialSide={side} />
      </div>
      {session && <SessionMenu state={session} enabled={Boolean(main && connected)} command={command} />}
    </div>;
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
      <Link href="/host" className="absolute top-4 right-4 text-xs text-white/60 z-10">Use as host</Link>
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
