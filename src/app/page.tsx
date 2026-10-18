import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NexusPlay — Home",
};

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-white bg-[#06060e]">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-25 blur-3xl rounded-full"
        style={{ background: "radial-gradient(circle, #7c3aed 0%, #06b6d4 40%, transparent 70%)" }}
        aria-hidden
      />

      {/* Hero */}
      <div className="relative text-center mb-16 animate-fade-up">
        <p className="text-7xl mb-6 drop-shadow-[0_0_30px_rgba(139,92,246,0.5)]">🎮</p>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4">
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            NexusPlay
          </span>
        </h1>
        <p className="text-sm md:text-base text-white/30 max-w-md mx-auto leading-relaxed font-mono tracking-wide">
          TURN ANY PHONE INTO A GAME CONTROLLER
        </p>
        <p className="text-xs text-white/15 mt-3 max-w-sm mx-auto">
          No app. No install. Just open a browser.
        </p>
      </div>

      {/* Cards */}
      <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-xl">

        {/* Host card */}
        <Link
          href="/host"
          className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]
            backdrop-blur-xl p-7 flex flex-col gap-4 transition-all duration-300
            hover:border-violet-500/30 hover:shadow-[0_0_40px_rgba(139,92,246,0.1)]
            animate-fade-up animation-delay-100"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-xl
            shadow-[0_0_20px_rgba(139,92,246,0.3)] group-hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-shadow duration-300">
            🖥️
          </div>
          <div>
            <h2 className="text-lg font-black mb-1 group-hover:text-violet-300 transition-colors duration-200 tracking-tight">
              Open as Host
            </h2>
            <p className="text-xs text-white/25 leading-relaxed">
              Start a room on your PC or TV. Share the 4-digit code and QR for players to join.
            </p>
          </div>
          <p className="mt-auto text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400/60 group-hover:text-violet-300 transition-colors">
            Launch →
          </p>
        </Link>

        {/* Controller card */}
        <Link
          href="/join"
          className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]
            backdrop-blur-xl p-7 flex flex-col gap-4 transition-all duration-300
            hover:border-cyan-500/30 hover:shadow-[0_0_40px_rgba(6,182,212,0.1)]
            animate-fade-up animation-delay-200"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-xl
            shadow-[0_0_20px_rgba(6,182,212,0.3)] group-hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-shadow duration-300">
            📱
          </div>
          <div>
            <h2 className="text-lg font-black mb-1 group-hover:text-cyan-300 transition-colors duration-200 tracking-tight">
              Join as Player
            </h2>
            <p className="text-xs text-white/25 leading-relaxed">
              Enter the 4-digit room code on your phone and get an instant controller.
            </p>
          </div>
          <p className="mt-auto text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/60 group-hover:text-cyan-300 transition-colors">
            Join →
          </p>
        </Link>
      </div>

      {/* Tech badges */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-2 animate-fade-up animation-delay-300">
        {["Next.js", "Socket.io", "TypeScript", "Canvas 2D"].map((tech) => (
          <span
            key={tech}
            className="text-[10px] font-mono text-white/15 border border-white/[0.05] rounded-full px-3 py-1"
          >
            {tech}
          </span>
        ))}
      </div>
    </main>
  );
}
