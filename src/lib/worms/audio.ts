// Procedural sound effects — no assets, everything synthesized with WebAudio.

export class WormsAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture at least once (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; }
  close() { this.stopCharge(); void this.ctx?.close(); this.ctx = null; }

  private get ok() { return !!this.ctx && this.ctx.state === "running" && !this.muted; }
  private env(g: GainNode, t: number, a: number, peak: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, pan = 0) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    p.pan.value = pan;
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(p).connect(this.master!); o.start(t); o.stop(t + dur + 0.05);
  }
  private burst(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = "lowpass", delay = 0, pan = 0, q = 1) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner();
    s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    p.pan.value = pan;
    this.env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(p).connect(this.master!); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  startCharge() {
    if (!this.ok || this.chargeOsc) return;
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = "sawtooth"; o.frequency.value = 160; g.gain.value = 0.05;
    o.connect(g).connect(this.master!); o.start();
    this.chargeOsc = o; this.chargeGain = g;
  }
  charge(p: number) { if (this.chargeOsc) this.chargeOsc.frequency.setTargetAtTime(160 + p * 700, this.ctx!.currentTime, 0.03); }
  stopCharge() {
    if (!this.chargeOsc) return;
    try { this.chargeGain!.gain.setTargetAtTime(0.0001, this.ctx!.currentTime, 0.02); this.chargeOsc.stop(this.ctx!.currentTime + 0.1); } catch { /* already stopped */ }
    this.chargeOsc = null; this.chargeGain = null;
  }

  play(n: string, v = 1, pan = 0) {
    switch (n) {
      case "boom": {
        const s = Math.max(0.2, Math.min(1.6, v));
        this.burst(0.5 + s * 0.9, 0.9 * Math.min(1, s + 0.3), 2400, 60, "lowpass", 0, pan);
        this.tone("sine", 110, 30, 0.4 + s * 0.6, 0.7 * Math.min(1, s + 0.2), 0, pan);
        this.burst(0.12, 0.5, 6000, 1500, "highpass", 0, pan);
        break;
      }
      case "launch": this.burst(0.6, 0.35, 900, 3000, "bandpass", 0, pan, 0.8); this.tone("sawtooth", 90, 220, 0.25, 0.12); break;
      case "throw": this.burst(0.18, 0.25, 600, 2200, "bandpass", 0, pan, 1.5); break;
      case "bounce": this.tone("triangle", 260 + Math.random() * 60, 120, 0.08, 0.25 * v + 0.05, 0, pan); break;
      case "shotgun": this.burst(0.35, 0.9, 5000, 200, "lowpass"); this.tone("square", 140, 40, 0.15, 0.25); this.burst(0.08, 0.3, 300, 300, "bandpass", 0.28, 0, 4); break;
      case "bat": this.tone("square", 600, 120, 0.12, 0.35); this.burst(0.1, 0.6, 3000, 600, "bandpass", 0, 0, 2); break;
      case "swing": this.burst(0.2, 0.25, 800, 2500, "bandpass", 0, 0, 2); break;
      case "jump": this.tone("square", 300, 620, 0.12, 0.12); break;
      case "flip": this.tone("square", 520, 220, 0.18, 0.12); this.tone("square", 260, 640, 0.14, 0.08, 0.1); break;
      case "ouch": this.tone("sawtooth", 520, 240, 0.22, 0.15); break;
      case "uhoh": this.tone("triangle", 420, 400, 0.18, 0.25); this.tone("triangle", 300, 290, 0.3, 0.25, 0.2); break;
      case "splash": this.burst(0.7 * Math.max(0.5, v), 0.6, 3000, 300, "lowpass"); this.tone("sine", 600, 150, 0.2, 0.15); break;
      case "tick": this.tone("square", 1400, 1400, 0.04, 0.12); break;
      case "turn": [523, 659, 784].forEach((f, i) => this.tone("triangle", f, f, 0.16, 0.18, i * 0.08)); break;
      case "go": this.tone("square", 880, 880, 0.08, 0.1); break;
      case "start": [392, 523, 659, 784, 1046].forEach((f, i) => this.tone("square", f, f, 0.18, 0.1, i * 0.1)); break;
      case "victory": [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone("square", f, f, i === 6 ? 0.7 : 0.16, 0.12, i * 0.14)); break;
      case "sudden": [440, 415, 392, 370].forEach((f, i) => this.tone("sawtooth", f, f * 0.98, 0.3, 0.14, i * 0.28)); break;
      case "select": this.tone("triangle", 900, 1200, 0.05, 0.12); break;
      case "lock": this.tone("square", 700, 1400, 0.1, 0.12); this.tone("square", 1400, 1400, 0.08, 0.1, 0.1); break;
      case "nope": this.tone("square", 200, 140, 0.18, 0.15); break;
      case "beep": this.tone("square", 1800, 1800, 0.05, 0.12, 0, pan); break;
      case "fizz": this.burst(0.6, 0.3, 4000, 800, "highpass"); break;
      case "fuse": this.burst(0.5, 0.15, 5000, 5000, "highpass"); break;
      case "pickup": [880, 1175, 1568].forEach((f, i) => this.tone("triangle", f, f, 0.1, 0.18, i * 0.06)); break;
      case "crate": this.tone("sine", 700, 500, 0.4, 0.12); break;
      case "teleport": this.tone("sine", 300, 2400, 0.35, 0.18); this.tone("sine", 2400, 300, 0.35, 0.12, 0.2); break;
      case "jet": this.burst(0.8, 0.3, 400, 1200, "bandpass", 0, 0, 0.7); break;
      case "jetoff": this.tone("sine", 300, 100, 0.2, 0.1); break;
      case "plane": this.burst(2.2, 0.35, 300, 900, "bandpass", 0, 0, 2); this.tone("sawtooth", 70, 90, 2, 0.06); break;
      case "hop": this.tone("triangle", 400, 700, 0.06, 0.06); break;
      case "baa": {
        if (!this.ok) break;
        const c = this.ctx!, t = c.currentTime, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = "sawtooth"; o.frequency.value = 420; lfo.frequency.value = 22; lg.gain.value = 30;
        lfo.connect(lg).connect(o.frequency); f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 3;
        this.env(g, t, 0.03, 0.3, 0.6);
        o.connect(f).connect(g).connect(this.master!); o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
        break;
      }
      case "holy": [523, 659, 784].forEach(f => this.tone("sine", f, f, 1.4, 0.12)); [1046, 1318].forEach(f => this.tone("triangle", f, f, 1.1, 0.06, 0.25)); break;
      case "count": this.tone("square", 1000 + Math.random() * 200, 900, 0.03, 0.05); break;
      case "charge": this.startCharge(); break;
    }
  }
}
