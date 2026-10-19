"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { drawBearModel, drawBearShadow, type BearPose } from "@/lib/polar/bear";
import { BEAR_COLORS } from "@/lib/polar/engine";
import styles from "./preview.module.css";

const motions = ["Idle", "Trot", "Charge", "Hit", "Victory", "Fall"] as const;

export default function BearPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [motion, setMotion] = useState<(typeof motions)[number]>("Trot");
  const [direction, setDirection] = useState(45);
  const [rotate, setRotate] = useState(false);
  const [team, setTeam] = useState<number | "all">(1);
  useEffect(() => {
    let frame = 0, start = 0;
    const draw = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 1000;
      const element = canvas.current, ctx = element?.getContext("2d");
      if (!element || !ctx) return;
      const w = element.clientWidth, h = element.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (element.width !== Math.round(w * dpr) || element.height !== Math.round(h * dpr)) {
        element.width = Math.round(w * dpr); element.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const slots = team === "all" ? [0, 1, 2, 3] : [team];
      const scale = Math.min(w / (135 * (slots.length > 1 ? 2.6 : 1)), h / 125);
      const y = h * 0.82;
      slots.forEach((slot, i) => {
        const x = w * (i + 0.5) / slots.length;
        // Offset clocks per bear so a squad never moves in lockstep.
        const tt = t + slot * 0.37;
        const p: BearPose = { face: rotate ? t * 0.5 : direction * Math.PI / 180, speed: motion === "Trot" ? 150 : motion === "Charge" ? 480 : 0,
          gait: tt * 7, dash: motion === "Charge" ? 1 : 0, stun: motion === "Hit" ? 0.85 : 0,
          fall: motion === "Fall" ? tt % 2 : 0, celebrate: motion === "Victory", power: false, color: BEAR_COLORS[slot], slot, t: tt };
        ctx.strokeStyle = `${BEAR_COLORS[slot]}66`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y, 39 * scale, 12 * scale, 0, 0, Math.PI * 2); ctx.stroke();
        drawBearShadow(ctx, x, y, scale, p.face, p.celebrate ? Math.abs(Math.sin(tt * 6.5)) * 14 : 0);
        drawBearModel(ctx, x, y, scale, p);
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [motion, direction, rotate, team]);

  return <main className={styles.page}>
    <div className={styles.header}>
      <div><p>POLARBASH</p><h1>Meet your bear.</h1></div>
      <Link href="/host">Play the game ↗</Link>
    </div>
    <canvas ref={canvas} role="img" aria-label={`Full-body polar bear performing ${motion.toLowerCase()}`} className={styles.canvas} />
    <div className={styles.motions} aria-label="Animation">
      {motions.map(name => <button key={name} aria-pressed={motion === name} onClick={() => setMotion(name)}>{name}</button>)}
    </div>
    <div className={styles.controls}>
      <label>Direction <input aria-label="Bear direction" type="range" min="0" max="315" step="45" value={direction} disabled={rotate} onChange={e => setDirection(Number(e.target.value))} /></label>
      <div className={styles.teams} aria-label="Scarf colour">
        {BEAR_COLORS.map((color, slot) => <button key={color} aria-label={`Player ${slot + 1} scarf`} aria-pressed={team === slot} style={{ background: color }} onClick={() => setTeam(slot)} />)}
        <button aria-pressed={team === "all"} className={styles.all} onClick={() => setTeam("all")}>All four</button>
      </div>
      <label><input type="checkbox" checked={rotate} onChange={e => setRotate(e.target.checked)} />Auto rotate</label>
    </div>
    <p className={styles.note}>The same character and animations used in the arena.</p>
  </main>;
}
