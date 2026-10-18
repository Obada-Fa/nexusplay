import { useId } from "react";

// Hand-drawn app icons for each game. 120×120 squircles, ids scoped per instance.
type IconProps = { size?: number; className?: string };

function Frame({ id, from, to, children, size = 96, className }: IconProps & { id: string; from: string; to: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient>
        <linearGradient id={`${id}gloss`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`${id}clip`}><rect width="120" height="120" rx="30" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}clip)`}>
        <rect width="120" height="120" fill={`url(#${id}bg)`} />
        {children}
        <rect width="120" height="120" fill={`url(#${id}gloss)`} />
      </g>
      <rect x="1" y="1" width="118" height="118" rx="29" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="2" />
    </svg>
  );
}

export function SlitherIcon(p: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame id={id} from="#0b3b3a" to="#140b33" {...p}>
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c6ffe0" /><stop offset=".55" stopColor="#4ff0a8" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      {/* hex arena grid */}
      <g stroke="#7dffc4" strokeOpacity=".09" fill="none" strokeWidth="1.2">
        {[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(c => <path key={`${r}${c}`} d={`M${c * 30 + (r % 2) * 15 - 8} ${r * 34 + 4} l9 -6 l9 6 v10 l-9 6 l-9 -6z`} />))}
      </g>
      {/* glow orbs */}
      {[[24, 26, "#ffd76a"], [96, 30, "#f472b6"], [92, 92, "#38bdf8"], [30, 96, "#ffd76a"], [70, 18, "#a78bfa"]].map(([x, y, c], i) => (
        <g key={i}><circle cx={x} cy={y} r="6" fill={c as string} opacity=".55" filter={`url(#${id}glow)`} /><circle cx={x} cy={y} r="3" fill={c as string} /></g>
      ))}
      {/* snake: S-curve body */}
      <path d="M22 84 C 22 58, 62 70, 62 54 S 40 30, 66 30 S 98 44, 94 62" fill="none" stroke="#4ff0a8" strokeWidth="20" strokeLinecap="round" opacity=".45" filter={`url(#${id}glow)`} />
      <path d="M22 84 C 22 58, 62 70, 62 54 S 40 30, 66 30 S 98 44, 94 62" fill="none" stroke="#06231f" strokeWidth="19" strokeLinecap="round" />
      <path d="M22 84 C 22 58, 62 70, 62 54 S 40 30, 66 30 S 98 44, 94 62" fill="none" stroke={`url(#${id}body)`} strokeWidth="15" strokeLinecap="round" />
      <path d="M22 84 C 22 58, 62 70, 62 54 S 40 30, 66 30 S 98 44, 94 62" fill="none" stroke="#06231f" strokeOpacity=".35" strokeWidth="15" strokeLinecap="round" strokeDasharray="1 7" />
      {/* head */}
      <ellipse cx="95" cy="66" rx="13" ry="11" fill="#4ff0a8" stroke="#06231f" strokeWidth="2" transform="rotate(70 95 66)" />
      <circle cx="90" cy="69" r="4.2" fill="#fff" /><circle cx="100" cy="69" r="4.2" fill="#fff" />
      <circle cx="90.5" cy="70.5" r="2.2" fill="#06231f" /><circle cx="100.5" cy="70.5" r="2.2" fill="#06231f" />
      <path d="M95 77 v6 m0 0 l-3 4 m3 -4 l3 4" stroke="#ff4d6d" strokeWidth="2" strokeLinecap="round" fill="none" />
    </Frame>
  );
}

export function DashIcon(p: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame id={id} from="#ff4d4d" to="#3b0a3f" {...p}>
      <defs>
        <linearGradient id={`${id}cube`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff3b0" /><stop offset=".5" stopColor="#ffb020" /><stop offset="1" stopColor="#ff4d4d" /></linearGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      {/* sunset bands */}
      <circle cx="60" cy="86" r="40" fill="#ffd76a" opacity=".25" />
      <g fill="#3b0a3f" opacity=".35">{[70, 78, 86].map(y => <rect key={y} x="0" y={y} width="120" height="3" />)}</g>
      {/* ground */}
      <rect x="0" y="92" width="120" height="28" fill="#1a0420" />
      <rect x="0" y="92" width="120" height="3" fill="#ff7a45" />
      {/* spikes */}
      <path d="M70 92 l9 -18 l9 18z M88 92 l9 -18 l9 18z" fill="#1a0420" stroke="#ff7a45" strokeWidth="2.5" strokeLinejoin="round" />
      {/* jump arc */}
      <path d="M8 92 Q 40 6 96 46" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />
      {/* speed lines */}
      <g stroke="#fff" strokeLinecap="round" strokeWidth="3">
        <path d="M10 40 h18" opacity=".5" /><path d="M4 52 h22" opacity=".8" /><path d="M14 64 h12" opacity=".4" />
      </g>
      {/* cube */}
      <g transform="translate(52 48) rotate(-24)">
        <rect x="-19" y="-19" width="38" height="38" rx="5" fill="#ffb020" filter={`url(#${id}glow)`} opacity=".8" />
        <rect x="-19" y="-19" width="38" height="38" rx="5" fill={`url(#${id}cube)`} stroke="#1a0420" strokeWidth="3" />
        <rect x="-10" y="-10" width="20" height="20" rx="3" fill="none" stroke="#1a0420" strokeWidth="3" />
        <rect x="-4" y="-4" width="8" height="8" rx="1" fill="#1a0420" />
      </g>
    </Frame>
  );
}

export function PongIcon(p: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame id={id} from="#2a1600" to="#0d0a1f" {...p}>
      <defs>
        <radialGradient id={`${id}ball`}><stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor="#ffe08a" /><stop offset="1" stopColor="#f59e0b" /></radialGradient>
        <linearGradient id={`${id}trail`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f59e0b" stopOpacity="0" /><stop offset="1" stopColor="#ffd76a" stopOpacity=".9" /></linearGradient>
        <filter id={`${id}glow`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      {/* court */}
      <rect x="10" y="14" width="100" height="92" rx="6" fill="none" stroke="#f59e0b" strokeOpacity=".25" strokeWidth="2" />
      <path d="M60 14 V106" stroke="#fff" strokeOpacity=".35" strokeWidth="2.5" strokeDasharray="5 6" />
      <circle cx="60" cy="60" r="14" fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="2" />
      {/* paddles */}
      <rect x="15" y="30" width="10" height="38" rx="5" fill="#8b5cf6" filter={`url(#${id}glow)`} />
      <rect x="15" y="30" width="10" height="38" rx="5" fill="#c4b5fd" />
      <rect x="95" y="58" width="10" height="38" rx="5" fill="#06b6d4" filter={`url(#${id}glow)`} />
      <rect x="95" y="58" width="10" height="38" rx="5" fill="#a5f3fc" />
      {/* zig-zag ball trail */}
      <path d="M27 50 L56 82 L86 44" fill="none" stroke={`url(#${id}trail)`} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
      <circle cx="86" cy="44" r="13" fill="#ffb020" filter={`url(#${id}glow)`} />
      <circle cx="86" cy="44" r="9" fill={`url(#${id}ball)`} />
      {/* impact sparks */}
      <g stroke="#ffe08a" strokeWidth="2.5" strokeLinecap="round">
        <path d="M30 42 l-4 -6" /><path d="M32 50 h-1" /><path d="M31 57 l-3 5" />
      </g>
    </Frame>
  );
}

export function PolarIcon(p: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame id={id} from="#38bdf8" to="#0a2a5c" {...p}>
      <defs>
        <linearGradient id={`${id}ice`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#bfe8ff" /></linearGradient>
        <radialGradient id={`${id}fur`} cx=".4" cy=".35"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d6ecf7" /></radialGradient>
      </defs>
      {/* snow */}
      {[[14, 16], [34, 10], [100, 14], [86, 26], [108, 40], [20, 38]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2.4} fill="#fff" opacity=".8" />)}
      {/* water */}
      <rect x="0" y="86" width="120" height="34" fill="#0a3d7a" />
      <path d="M0 92 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#7fe3ff" strokeWidth="2.5" strokeOpacity=".7" />
      {/* cracking ice floe */}
      <path d="M8 90 L18 72 H102 L112 90 Z" fill={`url(#${id}ice)`} stroke="#7fc8ee" strokeWidth="2" />
      <path d="M60 72 l-6 8 l7 4 l-5 6" fill="none" stroke="#3a8cc4" strokeWidth="2" strokeLinejoin="round" />
      {/* splash drops */}
      <g fill="#bfeeff"><circle cx="8" cy="80" r="3" /><circle cx="14" cy="70" r="2" /><circle cx="112" cy="78" r="3" /><circle cx="106" cy="68" r="2" /></g>
      {/* bear head, charging */}
      <g transform="translate(60 50) rotate(-8)">
        <circle cx="-22" cy="-24" r="9" fill="#fff" stroke="#0a2a5c" strokeWidth="2.5" /><circle cx="-22" cy="-24" r="4" fill="#ffb3c7" />
        <circle cx="22" cy="-24" r="9" fill="#fff" stroke="#0a2a5c" strokeWidth="2.5" /><circle cx="22" cy="-24" r="4" fill="#ffb3c7" />
        <ellipse cx="0" cy="0" rx="32" ry="29" fill={`url(#${id}fur)`} stroke="#0a2a5c" strokeWidth="2.5" />
        {/* angry brows + eyes */}
        <path d="M-17 -12 l11 5 M17 -12 l-11 5" stroke="#0a2a5c" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="-11" cy="-2" r="3.5" fill="#0a2a5c" /><circle cx="11" cy="-2" r="3.5" fill="#0a2a5c" />
        <ellipse cx="0" cy="13" rx="14" ry="10" fill="#eef7fc" stroke="#0a2a5c" strokeWidth="2" />
        <path d="M-5 8 h10 l-5 5z" fill="#0a2a5c" strokeLinejoin="round" stroke="#0a2a5c" strokeWidth="2" />
        <path d="M-6 17 q6 4 12 0" fill="none" stroke="#0a2a5c" strokeWidth="2" strokeLinecap="round" />
        {/* blue team scarf */}
        <path d="M-26 20 q26 14 52 0 l2 7 q-28 15 -56 0z" fill="#ff5a5f" stroke="#0a2a5c" strokeWidth="2" />
      </g>
      {/* motion streaks */}
      <g stroke="#fff" strokeLinecap="round" strokeWidth="3" opacity=".75"><path d="M100 40 h12" /><path d="M104 50 h10" /><path d="M8 50 h8" /></g>
    </Frame>
  );
}

export function WormsIcon(p: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame id={id} from="#ff7ab6" to="#3a0f3a" {...p}>
      <defs>
        <radialGradient id={`${id}boom`}><stop offset="0" stopColor="#fffbe0" /><stop offset=".35" stopColor="#ffd23f" /><stop offset=".7" stopColor="#ff7a1a" /><stop offset="1" stopColor="#ff3d3d" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}worm`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd0e3" /><stop offset="1" stopColor="#f472b6" /></linearGradient>
      </defs>
      {/* explosion burst */}
      <circle cx="88" cy="30" r="34" fill={`url(#${id}boom)`} />
      <path d="M88 4 l5 16 l14 -8 l-6 15 l16 3 l-15 7 l10 12 l-15 -3 l-1 16 l-9 -13 l-10 12 l1 -16 l-15 2 l11 -11 l-13 -9 l16 -2 l-4 -16 l12 10z" fill="#ffd23f" stroke="#ff7a1a" strokeWidth="2" strokeLinejoin="round" opacity=".95" />
      {/* debris */}
      <g fill="#6b3a1e"><rect x="56" y="14" width="6" height="6" rx="1" transform="rotate(20 59 17)" /><rect x="110" y="52" width="5" height="5" rx="1" /><rect x="64" y="50" width="4" height="4" rx="1" /></g>
      {/* destructible island */}
      <path d="M0 98 Q14 82 30 88 Q44 76 60 86 Q66 80 72 88 L80 98 Q90 92 120 96 V120 H0Z" fill="#7a4a24" />
      <path d="M0 98 Q14 82 30 88 Q44 76 60 86 Q66 80 72 88 L80 98 Q90 92 120 96" fill="none" stroke="#5ee06a" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="74" cy="96" r="9" fill="#3a0f3a" />
      {/* worm */}
      <path d="M18 92 q-6 -10 4 -18 q10 -6 10 -22" fill="none" stroke="#3a0f3a" strokeWidth="19" strokeLinecap="round" />
      <path d="M18 92 q-6 -10 4 -18 q10 -6 10 -22" fill="none" stroke={`url(#${id}worm)`} strokeWidth="14" strokeLinecap="round" />
      <path d="M17 82 l8 -3 M24 70 l8 -1" stroke="#c94b8a" strokeWidth="2" strokeLinecap="round" />
      {/* head + headband */}
      <circle cx="33" cy="46" r="13" fill={`url(#${id}worm)`} stroke="#3a0f3a" strokeWidth="2.5" />
      <path d="M20 41 q13 -6 26 0 v5 q-13 -6 -26 0z" fill="#ff3d3d" stroke="#3a0f3a" strokeWidth="1.5" />
      <path d="M20 43 l-7 -5 M20 45 l-8 2" stroke="#ff3d3d" strokeWidth="3" strokeLinecap="round" />
      <circle cx="35" cy="50" r="3.6" fill="#fff" /><circle cx="42" cy="50" r="3.6" fill="#fff" />
      <circle cx="36" cy="50.5" r="1.8" fill="#3a0f3a" /><circle cx="43" cy="50.5" r="1.8" fill="#3a0f3a" />
      <path d="M36 56 q4 3 8 0" fill="none" stroke="#3a0f3a" strokeWidth="1.8" strokeLinecap="round" />
      {/* bazooka */}
      <g transform="translate(40 64) rotate(-32)">
        <rect x="-6" y="-6" width="40" height="12" rx="3" fill="#4d7c3a" stroke="#1f2d14" strokeWidth="2" />
        <rect x="30" y="-8" width="8" height="16" rx="2" fill="#2f4a22" stroke="#1f2d14" strokeWidth="2" />
        <rect x="6" y="6" width="5" height="8" rx="1" fill="#2f4a22" />
      </g>
      {/* rocket */}
      <g transform="translate(70 34) rotate(-32)">
        <path d="M-10 -4 h14 l6 4 l-6 4 h-14z" fill="#e8e8f0" stroke="#3a0f3a" strokeWidth="1.5" />
        <path d="M-10 -4 l-5 -3 v14 l5 -3" fill="#ff3d3d" />
      </g>
      <path d="M50 52 q6 -4 10 -8" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" fill="none" />
    </Frame>
  );
}

const ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  snake: SlitherIcon, dash: DashIcon, pong: PongIcon, polarbash: PolarIcon, worms: WormsIcon,
};

export function GameIcon({ id, ...p }: IconProps & { id: string }) {
  const Icon = ICONS[id];
  return Icon ? <Icon {...p} /> : null;
}
