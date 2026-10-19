import type { BearPose } from "./bear";

const TAU = Math.PI * 2;
const CELL = 256;
const ATLAS_W = CELL * 6, ATLAS_H = CELL * 5;

/**
 * Puppet anchors per atlas cell, in cell pixels (y down): head centre + radius, then
 * the eyes that can blink (omitted where the pose hides them or holds an expression).
 * scripts/rig-polar-bear.mjs bakes the scarf and leg weight maps from the same table.
 */
// prettier-ignore
export const BEAR_RIG: readonly (readonly number[])[] = [
  // front: idle, trot A, trot B, charge, hit, victory
  [108, 98, 34, 96, 95, 122, 95], [115, 98, 34, 105, 95, 129, 95], [128, 96, 34, 118, 93, 141, 94],
  [168, 172, 32], [158, 104, 34], [138, 58, 30],
  // front/right
  [163, 102, 36, 164, 95, 186, 93], [167, 102, 36, 170, 95, 192, 94], [172, 102, 36, 177, 94, 197, 92],
  [198, 168, 30], [158, 102, 36], [145, 56, 30],
  // right
  [195, 102, 36, 205, 94], [198, 102, 36, 209, 94], [200, 102, 36, 214, 94],
  [218, 172, 30], [175, 102, 36], [160, 62, 30],
  // back/right
  [186, 100, 34], [186, 100, 34], [174, 100, 34], [210, 165, 28], [174, 102, 36], [138, 50, 28],
  // back
  [137, 98, 34], [139, 98, 34], [138, 98, 34], [180, 140, 26], [132, 98, 34], [129, 48, 28],
];

let atlas: HTMLImageElement | undefined;
let rigImage: HTMLImageElement | undefined;
let ready = false, rigReady = false;

/** Lazy browser-only load; the procedural bear remains available on load/error. */
export function preloadBearSprites() {
  if (atlas || typeof Image === "undefined") return;
  atlas = new Image();
  atlas.decoding = "async";
  atlas.onload = () => { ready = atlas!.naturalWidth === ATLAS_W && atlas!.naturalHeight === ATLAS_H; };
  atlas.src = "/games/polar/bear-atlas-v1.webp";
  rigImage = new Image();
  rigImage.decoding = "async";
  rigImage.onload = () => { rigReady = rigImage!.naturalWidth === ATLAS_W && rigImage!.naturalHeight === ATLAS_H; };
  rigImage.src = "/games/polar/bear-rig-v1.png";
}

/** World +y faces the camera. Five authored views mirror into eight directions. */
export function bearSpriteFrame(p: BearPose) {
  const face = ((p.face % TAU) + TAU) % TAU;
  const octant = Math.round(face / (Math.PI / 4)) % 8;
  const row = [2, 1, 0, 1, 2, 3, 4, 3][octant];
  const flip = octant >= 3 && octant <= 5;
  // Returning through the neutral pose keeps the two contact poses from snapping
  // directly into each other. Gait comes from distance travelled in the engine.
  const step = Math.floor((((p.gait % TAU) + TAU) % TAU) / (Math.PI / 2));
  const column = p.fall > 0 ? 4 : p.celebrate ? 5 : p.stun > 0.05 ? 4
    : p.dash > 0.01 ? 3 : p.speed > 12 ? [1, 0, 2, 0][step] : 0;
  return { row, column, flip };
}

// ── Scarf colour ───────────────────────────────────────────────────────────

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, mx ? d / mx : 0, mx];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

/** Team colour as the hue plus saturation/value multipliers applied to the cyan scarf. */
export function scarfTint(color: string): [number, number, number] {
  const n = parseInt(color.slice(1, 7), 16);
  const [h, s, v] = rgbToHsv((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  return [h, Math.min(1, s * 1.25) / 0.97, 0.4 + v * 0.6];
}

/** Moves a scarf pixel (0..1 rgb) onto the team hue, keeping its folds and highlights. */
export function recolorScarf(rgb: [number, number, number], weight: number, tint: [number, number, number]): [number, number, number] {
  if (weight <= 0) return rgb;
  const [, s, v] = rgbToHsv(...rgb);
  const out = hsvToRgb(tint[0], Math.min(1, s * tint[1]), Math.min(1, v * tint[2]));
  return [0, 1, 2].map(i => rgb[i] + (out[i] - rgb[i]) * weight) as [number, number, number];
}

// ── Puppet renderer ────────────────────────────────────────────────────────
// Each authored pose is bent per frame on the GPU: head look/tilt/nod around the neck,
// blinking eyelids, walking legs, waving arms and a scarf that ripples and streams,
// so motion is continuous instead of stepping through 30 stills.

const VERT = `attribute vec2 a; varying vec2 vP;
void main() { vP = vec2(a.x + 1.0, 1.0 - a.y) * 128.0; gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `precision highp float;
uniform sampler2D uAtlas, uRig;
uniform vec2 uCell, uSize;
uniform vec3 uHead, uTeam;
uniform vec4 uEyes;
uniform vec2 uEyeOn, uLook;
uniform float uBlink, uTilt, uGait, uLegAmp, uSide, uT, uFlutter, uStream, uArms;
varying vec2 vP;

vec4 atlas(vec2 q) { return texture2D(uAtlas, (uCell + clamp(q, 1.0, 255.0)) / uSize); }
vec3 rig(vec2 q) { return texture2D(uRig, (uCell + clamp(q, 1.0, 255.0)) / uSize).rgb; }
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-6)), d / (q.x + 1e-6), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec4 lid(vec4 col, vec2 q, vec2 e) {
  vec2 l = (q - e) / vec2(7.0, 6.5);
  float inside = 1.0 - smoothstep(0.8, 1.05, length(l));
  float edge = -1.1 + 2.3 * uBlink;
  float cover = inside * (1.0 - smoothstep(edge - 0.15, edge + 0.15, l.y));
  col = mix(col, atlas(vec2(q.x, e.y + 9.5)), cover);
  float lash = inside * (1.0 - smoothstep(0.0, 0.22, abs(l.y - edge))) * smoothstep(0.05, 0.2, uBlink);
  col.rgb = mix(col.rgb, vec3(0.16, 0.13, 0.14) * col.a, lash * 0.85);
  return col;
}

void main() {
  vec2 p = vP, q = p;
  vec3 r0 = rig(p);
  vec2 hc = uHead.xy; float hr = uHead.z;

  // Legs: signed weight (front/back or left/right) swings in side views, lifts head-on.
  float sw = sin(uGait) * (r0.b - 0.5) * 2.0 * uLegAmp;
  q.x -= sw * uSide;
  q.y += max(0.0, sw) * (1.0 - uSide) * 1.3;

  // Victory arms wave about the shoulders, opposite in phase.
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    vec2 sh = hc + vec2(side * hr * 1.1, hr * 1.35);
    float wa = smoothstep(hr * 0.75, hr * 1.25, side * (p.x - hc.x)) * smoothstep(sh.y + 12.0, sh.y - 10.0, p.y)
      * smoothstep(hr * 1.05, hr * 1.5, length(p - hc));
    q = mix(q, sh + rot(q - sh, -side * uArms * sin(uT * 9.0 + side * 1.4)), wa * step(0.001, uArms));
  }

  // Head turns, nods and tilts around the neck; the falloff bends the neck fur.
  float wh = 1.0 - smoothstep(hr * 0.8, hr * 1.45, length(p - hc));
  vec2 pivot = hc + vec2(0.0, hr * 0.85);
  q = mix(q, pivot + rot(q - pivot, -uTilt) - uLook, wh);

  // Scarf tails ripple outward from the knot and stream back with speed.
  float k = length(p - pivot);
  float w1 = sin(uT * (6.0 + uFlutter * 9.0) - k * 0.12);
  float w2 = sin(uT * (10.0 + uFlutter * 7.0) - k * 0.21 + 1.3);
  q += r0.g * vec2(uStream * (0.6 + 0.4 * w1) + w2 * 1.6 * (0.3 + uFlutter), (w1 * 3.4 + w2 * 1.3) * (0.3 + uFlutter));

  vec4 col = atlas(q);
  if (uEyeOn.x > 0.5) col = lid(col, q, uEyes.xy);
  if (uEyeOn.y > 0.5) col = lid(col, q, uEyes.zw);

  float w = rig(q).r;
  if (w > 0.004 && col.a > 0.004) {
    vec3 c = col.rgb / col.a, h = rgb2hsv(c);
    vec3 t = hsv2rgb(vec3(uTeam.x, min(1.0, h.y * uTeam.y), min(1.0, h.z * uTeam.z)));
    col.rgb = mix(c, t, w) * col.a;
  }
  gl_FragColor = col;
}`;

interface Puppet {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  u: Record<string, WebGLUniformLocation | null>;
}
let puppet: Puppet | null | undefined;

function createPuppet(): Puppet | null {
  if (typeof document === "undefined" || !atlas || !rigImage) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CELL;
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const texture = (unit: number, image: HTMLImageElement, premultiply: boolean) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, premultiply ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  };
  texture(0, atlas, true);
  texture(1, rigImage, false);
  const u: Puppet["u"] = {};
  for (const name of ["uAtlas", "uRig", "uCell", "uSize", "uHead", "uTeam", "uEyes", "uEyeOn", "uLook", "uBlink", "uTilt",
    "uGait", "uLegAmp", "uSide", "uT", "uFlutter", "uStream", "uArms"]) u[name] = gl.getUniformLocation(prog, name);
  gl.uniform1i(u.uAtlas, 0); gl.uniform1i(u.uRig, 1);
  gl.uniform2f(u.uSize, ATLAS_W, ATLAS_H);
  gl.viewport(0, 0, CELL, CELL);
  gl.clearColor(0, 0, 0, 0);
  canvas.addEventListener("webglcontextlost", () => { puppet = null; });
  return { gl, canvas, u };
}

/** Deterministic blink: a few per window, now and then a double blink. */
function blinkAmount(t: number, slot: number) {
  const period = 3.3, k = t + slot * 1.37, n = Math.floor(k / period);
  const hash = (Math.sin(n * 91.7 + slot * 13.1) * 43758.5453) % 1;
  const at = Math.abs(hash) * (period - 0.6);
  const local = k - n * period - at;
  const one = (x: number) => (x > 0 && x < 0.17 ? Math.sin((x / 0.17) * Math.PI) : 0);
  return Math.max(one(local), Math.abs(hash) > 0.7 ? one(local - 0.26) : 0);
}

interface Motion { look: [number, number]; tilt: number; blink: number; gait: number; legAmp: number; side: number; flutter: number; stream: number; arms: number }

function drawPuppet(row: number, column: number, p: BearPose, m: Motion) {
  if (puppet === undefined && ready && rigReady) puppet = createPuppet();
  if (!puppet) return null;
  const { gl, u } = puppet;
  const rig = BEAR_RIG[row * 6 + column];
  const tint = scarfTint(p.color);
  gl.uniform2f(u.uCell, column * CELL, row * CELL);
  gl.uniform3f(u.uHead, rig[0], rig[1], rig[2]);
  gl.uniform4f(u.uEyes, rig[3] ?? 0, rig[4] ?? 0, rig[5] ?? 0, rig[6] ?? 0);
  gl.uniform2f(u.uEyeOn, rig.length > 3 ? 1 : 0, rig.length > 5 ? 1 : 0);
  gl.uniform3f(u.uTeam, tint[0], tint[1], tint[2]);
  gl.uniform2f(u.uLook, m.look[0], m.look[1]);
  gl.uniform1f(u.uBlink, m.blink);
  gl.uniform1f(u.uTilt, m.tilt);
  gl.uniform1f(u.uGait, m.gait);
  gl.uniform1f(u.uLegAmp, m.legAmp);
  gl.uniform1f(u.uSide, m.side);
  gl.uniform1f(u.uT, p.t);
  gl.uniform1f(u.uFlutter, m.flutter);
  gl.uniform1f(u.uStream, m.stream);
  gl.uniform1f(u.uArms, m.arms);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return puppet.canvas;
}

/** Without WebGL: the authored poses with the scarf recoloured on the CPU, cached per team. */
const tinted = new Map<string, HTMLCanvasElement | null>();
function tintedAtlas(color: string) {
  if (!rigReady || !atlas || !rigImage || typeof document === "undefined") return atlas;
  if (!tinted.has(color)) {
    let out: HTMLCanvasElement | null = null;
    try {
      const read = (img: HTMLImageElement) => {
        const c = document.createElement("canvas"); c.width = ATLAS_W; c.height = ATLAS_H;
        const x = c.getContext("2d", { willReadFrequently: true })!; x.drawImage(img, 0, 0);
        return { c, x, d: x.getImageData(0, 0, ATLAS_W, ATLAS_H) };
      };
      const base = read(atlas), mask = read(rigImage).d.data, px = base.d.data, tint = scarfTint(color);
      for (let i = 0; i < px.length; i += 4) {
        if (!mask[i] || !px[i + 3]) continue;
        const rgb = recolorScarf([px[i] / 255, px[i + 1] / 255, px[i + 2] / 255], mask[i] / 255, tint);
        px[i] = rgb[0] * 255; px[i + 1] = rgb[1] * 255; px[i + 2] = rgb[2] * 255;
      }
      base.x.putImageData(base.d, 0, 0);
      out = base.c;
    } catch { out = null; }
    tinted.set(color, out);
  }
  return tinted.get(color) ?? atlas;
}

/** Snapping to a new heading or pose gets a quick squash so the cut reads as a turn. */
const lastFrame = new Map<number, { key: string; at: number }>();
function popAmount(slot: number, key: string, t: number, trotting: boolean) {
  const prev = lastFrame.get(slot);
  if (!prev || t < prev.at) { lastFrame.set(slot, { key, at: -1 }); return 0; }
  if (prev.key !== key) {
    const [pr, pc] = prev.key.split(":"), [r, c] = key.split(":");
    const gaitStep = trotting && pr === r && Number(pc) <= 2 && Number(c) <= 2;
    lastFrame.set(slot, { key, at: gaitStep ? prev.at : t });
  }
  return Math.max(0, 1 - (t - lastFrame.get(slot)!.at) / 0.16);
}

export function drawBearSprite(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, p: BearPose) {
  preloadBearSprites();
  if (!ready || !atlas) return false;
  const { row, column, flip } = bearSpriteFrame(p);
  const t = p.t, slot = p.slot;
  const moving = Math.min(1, p.speed / 160) * (1 - p.dash);
  const busy = p.celebrate || p.stun > 0.05 || p.fall > 0;
  const idle = Math.max(0, 1 - p.speed / 40) * (busy ? 0 : 1);
  const fall = Math.min(1, p.fall / 0.9);
  const side = [0, 0.65, 1, 0.65, 0][row];
  const dir = flip ? -1 : 1;

  // Idle: wandering gaze, a quick glance now and then, a sniff and a paw shuffle.
  const nX = Math.sin(t * 0.63 + slot * 2.1) + Math.sin(t * 1.37 + slot) * 0.5;
  const nY = Math.sin(t * 0.47 + slot * 3.3) + Math.sin(t * 1.9 + slot) * 0.4;
  const pulse = (rate: number, offset: number, width: number) => {
    const ph = (((t * rate + offset) % 1) + 1) % 1;
    return ph < width ? Math.sin((ph / width) * Math.PI) : 0;
  };
  const glance = pulse(0.14, slot * 0.29, 0.16) * (slot % 2 ? 1 : -1);
  const sniff = pulse(0.21, slot * 0.47 + 0.5, 0.08);
  const shuffle = pulse(0.17, slot * 0.61 + 0.3, 0.1) * idle;
  const hop = p.celebrate ? Math.abs(Math.sin(t * 6.5)) : 0;
  const look: [number, number] = [
    (nX * 6 + glance * 9) * idle + p.dash * 6 * side + Math.sin(t * 31) * 4 * p.stun + (p.celebrate ? Math.sin(t * 3.25) * 4 : 0),
    (nY * 2.6 + sniff * 6) * idle + Math.cos(p.gait * 2) * 3.6 * moving + p.dash * 3 + (p.celebrate ? -hop * 3 : 0),
  ];
  const tilt = (nY * 0.12 + glance * 0.1) * idle + Math.sin(p.gait) * 0.07 * moving + Math.sin(t * 17) * 0.16 * p.stun
    + (p.celebrate ? Math.sin(t * 6.5) * 0.14 : 0);
  const motion: Motion = {
    look, tilt,
    blink: busy || p.dash > 0.01 ? 0 : blinkAmount(t, slot),
    gait: p.dash > 0.01 ? t * 24 : moving > 0.05 ? p.gait : Math.PI / 2,
    legAmp: moving * 9 + p.dash * 5 + shuffle * 7,
    side,
    flutter: Math.min(1.5, 0.4 + moving * 0.75 + p.dash * 0.8 + (p.celebrate ? 0.5 : 0) + fall * 0.6 + glance * glance * 0.3),
    stream: (moving * 5 + p.dash * 8) * side,
    arms: p.celebrate ? 0.2 : 0,
  };
  const pop = popAmount(slot, `${row}:${column}:${flip}`, t, p.speed > 12 && p.dash <= 0.01 && !busy);

  // Whole-body squash, stretch, sway and lean layered on top of the puppet.
  const breath = Math.sin(t * 2.4 + slot) * (1 - moving) * (busy ? 0.3 : 1) * 0.028;
  const contact = (1 - Math.abs(Math.sin(p.gait))) ** 3 * moving;
  const bounce = Math.abs(Math.sin(p.gait)) * moving * 2.4;
  const landing = p.celebrate ? (1 - hop) ** 4 : 0;
  const recoil = Math.sin(t * 25) * p.stun;
  const jitter = Math.sin(t * 47 + slot) * 0.8 * p.dash;
  const size = scale * (p.power ? 1.12 : 1) * (1 + (p.power ? Math.sin(t * 9) * 0.015 : 0));
  const stretchX = 1 + p.dash * 0.07 + p.stun * 0.035 - breath * 0.4 + landing * 0.08 - pop * 0.12 + contact * 0.02;
  const stretchY = 1 + breath - p.dash * 0.06 - p.stun * 0.05 + hop * 0.04 - landing * 0.1 + pop * 0.05 - contact * 0.03;
  const sway = (Math.sin(t * 0.9 + slot) * 0.016 + glance * 0.015) * idle + Math.sin(p.gait) * 0.025 * moving
    + (p.celebrate ? Math.sin(t * 3.25) * 0.05 : 0) + 0.06 * p.dash * side * dir;

  const source = drawPuppet(row, column, p, motion);
  ctx.save();
  if (p.fall > 0) {
    ctx.beginPath();
    ctx.rect(x - 100 * size, y - 150 * size, 200 * size, 153 * size);
    ctx.clip();
  }
  ctx.translate(x + (recoil + jitter) * size, y + (fall * 72 - hop * 14 - bounce) * size);
  ctx.rotate(p.fall > 0 ? Math.sin(t * 15) * fall * 0.18 : recoil * 0.015 + sway);
  ctx.scale(dir * size * stretchX, size * stretchY);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Packed sprites have a shared floor at y=240 and centre at x=128.
  if (source) ctx.drawImage(source, 0, 0, CELL, CELL, -48, -90, 96, 96);
  else ctx.drawImage(tintedAtlas(p.color)!, column * CELL, row * CELL, CELL, CELL, -48, -90, 96, 96);
  ctx.restore();
  return true;
}
