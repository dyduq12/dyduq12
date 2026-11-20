// QR Game - universo (v0.2.1 / Fase 2B). ES Module.
// Liga o index.html aos dados (data/games.js) e aos ETs (js/sprites.js): planetas, ETs, demos, efeitos nos botoes,
// overlays (QR e historia dos mundos), dossies, Raio-X, selos EXPLORADO (localStorage) e pausa de canvases fora da tela.
import { GAMES } from '../data/games.js';
import { ETS, ET_EYE, playRetroSound } from './sprites.js';

const root = document.documentElement;
const safe = fn => { try { return fn(); } catch (err) { console.error('[universe]', err); return null; } };
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sound = t => playRetroSound(t);
const byId = Object.fromEntries(GAMES.map(g => [g.id, g]));
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
const mix = (h, t, k) => { const a = rgb(h), b = rgb(t); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash = (a, b, c = 0) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };

/* ---------- toast, turbo e selos EXPLORADO ---------- */
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
const world = { streak: 0, last: 0, turboUntil: 0 };
const turbo = () => performance.now() < world.turboUntil;
function countPoke() {
  const now = performance.now();
  world.streak = now - world.last < 1500 ? world.streak + 1 : 1;
  world.last = now;
  if (world.streak < 5) return false;
  world.streak = 0;
  world.turboUntil = now + 6000;
  document.body.classList.add('turbo');
  setTimeout(() => { if (!turbo()) document.body.classList.remove('turbo'); }, 6100);
  toast('MODO TURBO!');
  sound('turbo');
  return true;
}
const KEY = 'qrgame.explored.v1';
let explored = new Set();
try { explored = new Set(JSON.parse(localStorage.getItem(KEY) || '[]').filter(id => byId[id])); } catch { /* sem localStorage */ }
function paintSeals() { $$('.seal[data-seal]').forEach(el => el.classList.toggle('on', explored.has(el.dataset.seal))); }
function markExplored(id) {
  if (!byId[id] || explored.has(id)) return;
  explored.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...explored])); } catch { /* ignora */ }
  paintSeals();
  toast('EXPLORADO · ' + byId[id].planet.toUpperCase());
  if (explored.size === GAMES.length) setTimeout(() => toast('CONSTELACAO COMPLETA'), 2400);
}

/* ---------- infraestrutura de cenas (pausa fora da tela) ---------- */
const scenes = [];
const byCanvas = new WeakMap();
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(es => es.forEach(e => { const s = byCanvas.get(e.target); if (s) s.visible = e.isIntersecting; }), { rootMargin: '120px' })
  : null;
const ro = 'ResizeObserver' in window
  ? new ResizeObserver(es => es.forEach(e => { const s = byCanvas.get(e.target); if (s) s.fit(); }))
  : null;
function addScene(canvas, impl) {
  const s = Object.assign({ canvas, g: canvas.getContext('2d'), w: 0, h: 0, dpr: 1, t: 0, visible: !io, drawn: false }, impl);
  s.fit = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    s.w = w; s.h = h; s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    s.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.g.imageSmoothingEnabled = false;
    s.drawn = false;
    if (s.onFit) s.onFit();
  };
  byCanvas.set(canvas, s);
  scenes.push(s);
  if (io) io.observe(canvas);
  if (ro) ro.observe(canvas); else addEventListener('resize', s.fit);
  s.fit();
  return s;
}
let prev = 0;
function frame(ms) {
  const dt = Math.min(0.05, (ms - prev) / 1000 || 0);
  prev = ms;
  if (!document.hidden) {
    for (const s of scenes) {
      if (!s.visible || s.w < 2) continue;
      s.t += dt;
      s.g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      if (calm && s.drawn && !s.alwaysLive) continue;
      try { s.update(dt); s.draw(dt); } catch (err) { s.visible = false; console.error('[universe] cena desativada', err); }
      s.drawn = true;
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- ponteiro global (efeitos dos botoes) ---------- */
const ptr = { x: -9999, y: -9999, active: false, down: false, seen: 0 };
addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; ptr.seen = performance.now(); }, { passive: true });
addEventListener('pointerdown', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; ptr.down = true; ptr.seen = performance.now(); }, { passive: true });
const ptrUp = () => { ptr.down = false; };
addEventListener('pointerup', e => { ptrUp(); if (e.pointerType !== 'mouse') ptr.active = false; });
addEventListener('pointercancel', () => { ptrUp(); ptr.active = false; });
document.addEventListener('pointerleave', () => { ptr.active = false; ptrUp(); });

/* ---------- ETs ---------- */
function drawET(g, et, cx, bottom, s, o = {}) {
  const ox = Math.round(cx - 4 * s), oy = Math.round(bottom - 8 * s + (o.dy || 0));
  g.save();
  g.globalAlpha = o.alpha == null ? 1 : o.alpha;
  const shade = mix(et.color, '#000000', .28);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = et.rows[r][c];
      if (ch === '.') continue;
      g.fillStyle = ch === 'h' ? et.accent : (r >= 6 ? shade : et.color);
      g.fillRect(ox + c * s, oy + r * s, s, s);
    }
  }
  g.fillStyle = ET_EYE;
  for (const [c, r] of et.eyes) {
    if (o.sleep) g.fillRect(ox + c * s, oy + r * s + Math.round(s * .55), s, Math.max(1, Math.round(s * .3)));
    else g.fillRect(ox + c * s, oy + r * s, s, s);
  }
  g.restore();
}
function burst(arr, x, y, color, n = 12, sp = 70) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(sp * .4, sp);
    arr.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * .3, l: rand(.35, .7), c: color });
  }
}
function stepParts(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.l -= dt;
    if (p.l <= 0) { arr.splice(i, 1); continue; }
    p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  }
}
function drawParts(g, arr) {
  for (const p of arr) {
    g.globalAlpha = clamp(p.l * 2, 0, 1);
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
  }
  g.globalAlpha = 1;
}
function sleepZ(g, x, y, s, t) {
  for (let i = 0; i < 3; i++) {
    const k = (t * .7 + i / 3) % 1;
    g.fillStyle = `rgba(244,241,234,${(1 - k).toFixed(2)})`;
    g.font = `700 ${9 + i * 3}px ${MONO}`;
    g.fillText(i === 1 ? 'Z' : 'z', x + s * 4 + k * s * 4, y - s * 9 - k * s * 9);
  }
}

/* ---------- geometria de esfera (veios, fissuras, colonias) ---------- */
function sph(lon, lat, rot, tilt) {
  const cl = Math.cos(lat);
  const x = cl * Math.sin(lon + rot), y = Math.sin(lat), z = cl * Math.cos(lon + rot);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  return [x, y * ct - z * st, y * st + z * ct];
}
function sline(g, pts, rot, tilt, cx, cy, R) {
  let open = false;
  g.beginPath();
  for (const [lo, la] of pts) {
    const p = sph(lo, la, rot, tilt);
    if (p[2] > 0.02) { const x = cx + p[0] * R, y = cy - p[1] * R; if (open) g.lineTo(x, y); else g.moveTo(x, y); open = true; } else open = false;
  }
  g.stroke();
}
function ring(g, cx, cy, rx, ry, rot, front, style, lw, dash) {
  g.save();
  g.translate(cx, cy); g.rotate(rot);
  g.strokeStyle = style; g.lineWidth = lw;
  g.setLineDash(dash || []);
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
  g.restore();
}
function walk(r, n, lon, lat, dl, da) {
  const pts = [];
  for (let k = 0; k < n; k++) { pts.push([lon, lat]); lon += (r() - .5) * dl; lat += (r() - .5) * da; lat = clamp(lat, -1.3, 1.3); }
  return pts;
}
function limb(g, cx, cy, R, a = .6) {
  const sg = g.createRadialGradient(cx - R * .45, cy - R * .5, R * .3, cx, cy, R * 1.15);
  sg.addColorStop(0, 'rgba(9,10,15,0)'); sg.addColorStop(1, `rgba(9,10,15,${a})`);
  g.fillStyle = sg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
}
function discPath(g, cx, cy, R) { g.beginPath(); g.arc(cx, cy, R, 0, TAU); }

/* ---------- os planetas (cada um com visual proprio) ---------- */
function artKineton() {
  const r = rng(11);
  const veins = Array.from({ length: 10 }, () => walk(r, 16, r() * TAU, -1.2 + r() * .5, .5, .06).map(([lo, la], i) => [lo, la + i * .16]));
  return (g, cx, cy, R, t, a = 1) => {
    g.save(); g.globalAlpha = a;
    ring(g, cx, cy, R * 1.55, R * .4, -.32, false, 'rgba(255,210,63,.28)', 1.5);
    ring(g, cx, cy, R * 1.9, R * .5, -.32, false, 'rgba(244,241,234,.16)', 1);
    const gr = g.createRadialGradient(cx - R * .35, cy - R * .4, R * .08, cx, cy, R);
    gr.addColorStop(0, '#FFB36B'); gr.addColorStop(.32, '#FF4D4D'); gr.addColorStop(.72, '#6B1414'); gr.addColorStop(1, '#1E0707');
    g.fillStyle = gr; discPath(g, cx, cy, R); g.fill();
    g.save(); discPath(g, cx, cy, R); g.clip();
    g.lineCap = 'round';
    veins.forEach((v, i) => {
      const p = .3 + .45 * (.5 + .5 * Math.sin(t * 3 + i * 1.3));
      g.lineWidth = R * .07; g.strokeStyle = `rgba(255,90,54,${(p * .35).toFixed(2)})`; sline(g, v, t * .3, .3, cx, cy, R);
      g.lineWidth = R * .028; g.strokeStyle = `rgba(255,210,63,${p.toFixed(2)})`; sline(g, v, t * .3, .3, cx, cy, R);
    });
    limb(g, cx, cy, R, .7);
    g.restore();
    ring(g, cx, cy, R * 1.55, R * .4, -.32, true, 'rgba(255,210,63,.5)', 1.8);
    ring(g, cx, cy, R * 1.9, R * .5, -.32, true, 'rgba(244,241,234,.3)', 1);
    g.restore();
  };
}
function artTecton() {
  const r = rng(23);
  const cracks = Array.from({ length: 8 }, () => walk(r, 14, r() * TAU, -1 + r() * 2, .55, .5));
  const sparks = [];
  return (g, cx, cy, R, t, a = 1, dt = .016) => {
    g.save(); g.globalAlpha = a;
    const gr = g.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
    gr.addColorStop(0, '#D6693B'); gr.addColorStop(.45, '#8C2B17'); gr.addColorStop(1, '#2A0F0A');
    g.fillStyle = gr; discPath(g, cx, cy, R); g.fill();
    g.save(); discPath(g, cx, cy, R); g.clip();
    g.fillStyle = 'rgba(20,8,5,.2)';
    for (let i = 0; i < 9; i++) { const p = sph(i * 1.9, Math.sin(i * 2.3) * .9, t * .12, .25); if (p[2] > 0) { g.beginPath(); g.arc(cx + p[0] * R, cy - p[1] * R, R * (.1 + (i % 3) * .05) * p[2], 0, TAU); g.fill(); } }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalCompositeOperation = 'lighter';
    cracks.forEach((c, i) => {
      const p = .6 + .4 * Math.sin(t * 2.2 + i * 1.7);
      g.lineWidth = R * .16; g.strokeStyle = `rgba(255,90,54,${(.3 * p).toFixed(2)})`; sline(g, c, t * .12, .25, cx, cy, R);
      g.lineWidth = R * .07; g.strokeStyle = `rgba(255,90,54,${(.75 + .25 * p).toFixed(2)})`; sline(g, c, t * .12, .25, cx, cy, R);
      g.lineWidth = R * .03; g.strokeStyle = `rgba(255,210,63,${(.85 + .15 * p).toFixed(2)})`; sline(g, c, t * .12, .25, cx, cy, R);
    });
    g.globalCompositeOperation = 'source-over';
    limb(g, cx, cy, R, .5);
    g.restore();
    if (Math.random() < dt * 14 && sparks.length < 36) {
      const c = cracks[(Math.random() * cracks.length) | 0], q = c[(Math.random() * c.length) | 0], p = sph(q[0], q[1], t * .12, .25);
      if (p[2] > .1) sparks.push({ x: cx + p[0] * R, y: cy - p[1] * R, vx: p[0] * 40 + rand(-12, 12), vy: -p[1] * 40 - rand(20, 60), l: rand(.5, 1.1) });
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.l -= dt; if (s.l <= 0) { sparks.splice(i, 1); continue; }
      s.vy += 90 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      g.globalAlpha = a * clamp(s.l * 2, 0, 1); g.fillStyle = s.l > .5 ? '#FFD23F' : '#FF5A36'; g.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
    g.restore();
  };
}
function artHadron() {
  return (g, cx, cy, R, t, a = 1) => {
    g.save(); g.globalAlpha = a;
    for (let i = 0; i < 3; i++) {
      const k = (t * .35 + i / 3) % 1, w = 1 + .06 * Math.sin(t * 6 + i);
      g.strokeStyle = `rgba(46,229,157,${(.4 * (1 - k)).toFixed(2)})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(cx, cy, R * (1.08 + k * .9) * w, R * (1.08 + k * .9) / w, 0, 0, TAU); g.stroke();
    }
    const gr = g.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
    gr.addColorStop(0, '#2BAA7A'); gr.addColorStop(.6, '#0E5A3E'); gr.addColorStop(1, '#04160F');
    g.fillStyle = gr; discPath(g, cx, cy, R); g.fill();
    g.save(); discPath(g, cx, cy, R); g.clip();
    const N = 10, bh = R * 2 / N;
    for (let k = 0; k < N; k++) {
      const y0 = cy - R + k * bh, sp = .7 + k * .13, ph = k * 1.3;
      g.fillStyle = k % 2 ? 'rgba(46,229,157,.38)' : 'rgba(4,22,15,.45)';
      g.beginPath();
      for (let x = -R; x <= R; x += R / 8) { const y = y0 + Math.sin(x * .06 / (R / 60) + t * sp + ph) * R * .06; if (x === -R) g.moveTo(cx + x, y); else g.lineTo(cx + x, y); }
      for (let x = R; x >= -R; x -= R / 8) g.lineTo(cx + x, y0 + bh * .7 + Math.sin(x * .06 / (R / 60) + t * sp + ph + .8) * R * .06);
      g.closePath(); g.fill();
    }
    limb(g, cx, cy, R, .65);
    g.restore();
    g.restore();
  };
}
function artUmbra() {
  const r = rng(37);
  const colonies = Array.from({ length: 16 }, () => ({ lon: r() * TAU, lat: -1 + r() * 2, dots: Array.from({ length: 4 + (r() * 5 | 0) }, () => [(r() - .5) * .25, (r() - .5) * .25, r()]), ph: r() * TAU }));
  return (g, cx, cy, R, t, a = 1) => {
    g.save(); g.globalAlpha = a;
    for (let i = 0; i < 3; i++) {
      const k = (t * .42 + i / 3) % 1;
      g.strokeStyle = `rgba(56,189,248,${(.38 * (1 - k)).toFixed(2)})`; g.lineWidth = 1.5; g.setLineDash([4, 5]);
      g.beginPath(); g.arc(cx, cy, R * (1.1 + k * 1.0), 0, TAU); g.stroke();
    }
    g.setLineDash([]);
    const gr = g.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
    gr.addColorStop(0, '#16354A'); gr.addColorStop(.6, '#0A1B28'); gr.addColorStop(1, '#03070C');
    g.fillStyle = gr; discPath(g, cx, cy, R); g.fill();
    g.save(); discPath(g, cx, cy, R); g.clip();
    for (const c of colonies) {
      const p = sph(c.lon, c.lat, t * .16, .3);
      if (p[2] < .05) continue;
      const pulse = .35 + .65 * (.5 + .5 * Math.sin(t * 2.4 + c.ph));
      for (const [dx, dy, q] of c.dots) {
        const x = cx + (p[0] + dx) * R, y = cy - (p[1] + dy) * R, rr = R * (.02 + q * .028) * (.6 + p[2] * .6);
        g.fillStyle = `rgba(56,189,248,${(.9 * pulse * p[2]).toFixed(2)})`; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
        g.fillStyle = `rgba(56,189,248,${(.18 * pulse * p[2]).toFixed(2)})`; g.beginPath(); g.arc(x, y, rr * 3, 0, TAU); g.fill();
      }
    }
    limb(g, cx, cy, R, .8);
    g.restore();
    g.strokeStyle = 'rgba(56,189,248,.35)'; g.lineWidth = 1.5; discPath(g, cx, cy, R); g.stroke();
    g.restore();
  };
}
function artVertice() {
  const r = rng(53);
  const N = 12, jit = Array.from({ length: N }, () => .86 + r() * .14);
  return (g, cx, cy, R, t, a = 1) => {
    g.save(); g.globalAlpha = a;
    const rot = t * .18, pts = [];
    for (let i = 0; i < N; i++) { const an = rot + i / N * TAU, rr = R * jit[i] * (i % 2 ? .92 : 1); pts.push([cx + Math.cos(an) * rr, cy + Math.sin(an) * rr]); }
    for (let i = 0; i < N; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % N], mid = Math.atan2((p0[1] + p1[1]) / 2 - cy, (p0[0] + p1[0]) / 2 - cx);
      const lit = .5 + .5 * Math.cos(mid + .9);
      g.fillStyle = mix('#0A2260', '#9CC3FF', clamp(lit * .85, 0, 1));
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(244,241,234,.25)'; g.lineWidth = 1; g.stroke();
    }
    g.fillStyle = 'rgba(244,241,234,.14)';
    g.beginPath(); g.moveTo(cx - R * .5, cy - R * .5); g.lineTo(cx + R * .12, cy - R * .5); g.lineTo(cx - R * .5, cy + R * .12); g.closePath(); g.fill();
    for (let i = 0; i < 3; i++) {
      const sq = Math.abs(Math.cos(t * .8 + i * 1.05)), rx = R * 1.55, ry = rx * Math.max(.12, sq), rotg = i * Math.PI / 3 + t * .15;
      ring(g, cx, cy, rx, ry, rotg, false, 'rgba(56,189,248,.35)', 1.5);
      ring(g, cx, cy, rx, ry, rotg, true, 'rgba(244,241,234,.6)', 1.5);
      const an = t * 1.6 + i * 2.1, bx = Math.cos(an) * rx, by = Math.sin(an) * ry;
      g.fillStyle = '#38BDF8'; g.fillRect(cx + bx * Math.cos(rotg) - by * Math.sin(rotg) - 2, cy + bx * Math.sin(rotg) + by * Math.cos(rotg) - 2, 4, 4);
    }
    g.restore();
  };
}
function artEntropia() {
  return (g, cx, cy, R, t, a = 1) => {
    g.save(); g.globalAlpha = a;
    const c = Math.max(3, Math.round(R / 9)), fr = Math.floor(t * 12), n = Math.ceil(R * 1.55 / c);
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const x = i * c, y = j * c, d = Math.hypot(x, y) / R, h = hash(i, j, fr);
        if (d < .78) {
          const lit = clamp(.72 - (x * .5 + y * .6) / R * .35 + (hash(i, j, 3) - .5) * .18, 0, 1);
          g.fillStyle = mix('#222733', '#F4F1EA', lit); g.fillRect(cx + x, cy + y, c, c);
        } else if (d < 1.0) {
          if (h > .22) { const o = h > .85 ? (hash(i, j, fr + 9) - .5) * c * 2 : 0; g.fillStyle = mix('#222733', '#F4F1EA', .35 + hash(i, j, 5) * .5); g.fillRect(cx + x + o, cy + y, c, c); }
        } else if (d < 1.55) {
          const p = (1.55 - d) / .55; if (h < .16 * p * p) { g.fillStyle = h < .05 * p ? '#F4F1EA' : '#6B7285'; g.fillRect(cx + x + (hash(j, i, fr) - .5) * c, cy + y, c, Math.max(1, c * (h > .1 ? 1 : .4))); }
        }
      }
    }
    g.restore();
  };
}
function artHorizonte() {
  return (g, cx, cy, R, t, a = 1) => {
    g.save(); g.globalAlpha = a;
    const pulse = 1 + .08 * Math.sin(t * 2);
    const hg = g.createRadialGradient(cx, cy, R * .4, cx, cy, R * 2.3 * pulse);
    hg.addColorStop(0, 'rgba(255,210,63,.55)'); hg.addColorStop(.35, 'rgba(255,180,40,.2)'); hg.addColorStop(1, 'rgba(255,210,63,0)');
    g.fillStyle = hg; g.fillRect(cx - R * 2.4, cy - R * 2.4, R * 4.8, R * 4.8);
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < 14; i++) { const an = t * .2 + i / 14 * TAU, l = R * (1.5 + (i % 3) * .35); g.strokeStyle = 'rgba(255,240,166,.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(an) * R * .9, Math.sin(an) * R * .9); g.lineTo(Math.cos(an) * l, Math.sin(an) * l); g.stroke(); }
    g.restore();
    ring(g, cx, cy, R * 1.45, R * .38, -.25, false, 'rgba(255,210,63,.6)', R * .09);
    const core = g.createRadialGradient(cx, cy, R * .1, cx, cy, R * .62);
    core.addColorStop(0, '#000000'); core.addColorStop(.8, '#050403'); core.addColorStop(1, '#2A1E05');
    g.fillStyle = core; discPath(g, cx, cy, R * .62); g.fill();
    g.strokeStyle = '#FFF0A6'; g.lineWidth = Math.max(1.5, R * .045); g.shadowColor = '#FFD23F'; g.shadowBlur = R * .3; discPath(g, cx, cy, R * .64); g.stroke(); g.shadowBlur = 0;
    ring(g, cx, cy, R * 1.45, R * .38, -.25, true, 'rgba(255,230,120,.95)', R * .09);
    g.restore();
  };
}
function artConvergencia() {
  const r = rng(71);
  const veins = Array.from({ length: 7 }, () => walk(r, 14, r() * TAU, -1.1 + r() * .4, .5, .05).map(([lo, la], i) => [lo, la + i * .17]));
  const fissures = Array.from({ length: 6 }, () => walk(r, 12, r() * TAU, -1 + r() * 2, .6, .55));
  const spores = Array.from({ length: 22 }, () => ({ lon: r() * TAU, lat: -1.1 + r() * 2.2, ph: r() * TAU, q: r() }));
  return (g, cx, cy, R, t, a = 1) => {
    g.save(); g.globalAlpha = a;
    const rot = t * .22, tilt = .28;
    // aneis geometricos (parte de tras)
    const tri = (rr, ang, front) => { g.save(); g.translate(cx, cy); g.scale(1, .3); g.rotate(ang); g.strokeStyle = front ? 'rgba(244,241,234,.5)' : 'rgba(244,241,234,.18)'; g.lineWidth = 1.5; g.setLineDash([6, 6]); g.beginPath(); for (let i = 0; i <= 6; i++) { const an = i / 6 * TAU; const x = Math.cos(an) * rr, y = Math.sin(an) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.restore(); };
    ring(g, cx, cy, R * 1.5, R * .42, -.3, false, 'rgba(56,189,248,.3)', 1.5, [5, 6]);
    tri(R * 1.72, t * .15, false);
    const gr = g.createRadialGradient(cx - R * .35, cy - R * .4, R * .08, cx, cy, R);
    gr.addColorStop(0, '#FFC27A'); gr.addColorStop(.3, '#FF4D4D'); gr.addColorStop(.7, '#5E1612'); gr.addColorStop(1, '#14090A');
    g.fillStyle = gr; discPath(g, cx, cy, R); g.fill();
    g.save(); discPath(g, cx, cy, R); g.clip(); g.lineCap = 'round'; g.lineJoin = 'round';
    veins.forEach((v, i) => { const p = .35 + .4 * (.5 + .5 * Math.sin(t * 2.6 + i)); g.lineWidth = R * .03; g.strokeStyle = `rgba(255,210,63,${p.toFixed(2)})`; sline(g, v, rot, tilt, cx, cy, R); });
    fissures.forEach((f, i) => { const p = .5 + .5 * Math.sin(t * 2 + i * 1.9); g.lineWidth = R * .07; g.strokeStyle = `rgba(255,90,54,${(.22 * p).toFixed(2)})`; sline(g, f, rot, tilt, cx, cy, R); g.lineWidth = R * .02; g.strokeStyle = `rgba(255,90,54,${(.6 + .4 * p).toFixed(2)})`; sline(g, f, rot, tilt, cx, cy, R); });
    for (const s of spores) {
      const p = sph(s.lon, s.lat, rot, tilt); if (p[2] < .05) continue;
      const pulse = .4 + .6 * (.5 + .5 * Math.sin(t * 2.2 + s.ph)), x = cx + p[0] * R, y = cy - p[1] * R, rr = R * (.016 + s.q * .02) * (.6 + p[2] * .5);
      g.fillStyle = `rgba(56,189,248,${(.9 * pulse).toFixed(2)})`; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
      g.fillStyle = `rgba(56,189,248,${(.16 * pulse).toFixed(2)})`; g.beginPath(); g.arc(x, y, rr * 3.2, 0, TAU); g.fill();
    }
    limb(g, cx, cy, R, .7);
    g.restore();
    ring(g, cx, cy, R * 1.5, R * .42, -.3, true, 'rgba(56,189,248,.65)', 1.8, [5, 6]);
    tri(R * 1.72, t * .15, true);
    g.restore();
  };
}
const ART = { '01': artKineton, '02': artTecton, '03': artHadron, '04': artUmbra, '05': artVertice, '06': artEntropia, '07': artHorizonte };

/* ---------- estrelas (fundo fixo, com leve paralaxe) ---------- */
function makeStars(canvas) {
  let stars = [], shoot = null;
  addScene(canvas, {
    onFit() {
      const n = clamp(Math.round(this.w * this.h / 9000), 60, 240);
      stars = Array.from({ length: n }, () => ({ x: Math.random() * this.w, y: Math.random() * this.h, z: Math.random(), p: Math.random() * TAU }));
    },
    update(dt) {
      if (calm) return;
      for (const s of stars) { s.y += (2 + s.z * 9) * dt; if (s.y > this.h) { s.y = 0; s.x = Math.random() * this.w; } }
      if (shoot) { shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.l -= dt; if (shoot.l <= 0) shoot = null; }
      else if (Math.random() < dt * .1) shoot = { x: rand(0, this.w * .8), y: rand(0, this.h * .4), vx: 300, vy: 120, l: .9 };
    },
    draw() {
      const g = this.g, off = (scrollY || 0) * .06;
      g.clearRect(0, 0, this.w, this.h);
      for (const s of stars) {
        const a = .2 + .6 * s.z * (.6 + .4 * Math.sin(this.t * 1.6 + s.p));
        g.fillStyle = (s.p > 5.6) ? `rgba(255,210,63,${a.toFixed(2)})` : (s.p < .5 ? `rgba(56,189,248,${a.toFixed(2)})` : `rgba(244,241,234,${a.toFixed(2)})`);
        const k = s.z > .85 ? 2 : 1, y = ((s.y - off * s.z) % this.h + this.h) % this.h;
        g.fillRect(Math.round(s.x), Math.round(y), k, k);
      }
      if (shoot) for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(244,241,234,${((.8 - i * .1) * clamp(shoot.l * 2, 0, 1)).toFixed(2)})`; g.fillRect(Math.round(shoot.x - i * 5), Math.round(shoot.y - i * 2.1), 2, 2); }
    }
  });
}

/* ---------- abertura: Planeta Convergencia + os 7 ETs dancando ---------- */
function makeHero(canvas) {
  const art = artConvergencia();
  const ps = ETS.map(() => ({ jump: 0, wait: -1 }));
  let parts = [], hits = [];
  const sc = addScene(canvas, {
    update(dt) {
      stepParts(parts, dt);
      ps.forEach(p => { if (p.wait >= 0) { p.wait -= dt; if (p.wait < 0) { p.jump = 1; p.wait = -1; } } if (p.jump > 0) p.jump = Math.max(0, p.jump - dt / .6); });
    },
    draw(dt) {
      const g = this.g, w = this.w, h = this.h, t = this.t, fast = turbo();
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * .25, s = Math.max(3, Math.round(w / 80)), rx = Math.min(R * 1.85, w / 2 - s * 4.5), ry = rx * .3;
      const spin = t * (fast ? .9 : .26) + .6;
      const list = ETS.map((et, i) => { const an = spin + i / 7 * TAU; return { i, et, sa: Math.sin(an), ex: cx + rx * Math.cos(an), ey: cy + ry * Math.sin(an) + R * .08 }; });
      hits = [];
      const put = o => {
        const p = ps[o.i], jh = p.jump > 0 ? Math.sin(Math.PI * (1 - p.jump)) * R * .75 : 0;
        const beat = Math.abs(Math.sin(t * (fast ? 9 : 4.2) + o.i * .9)) * s * 1.5, sway = Math.sin(t * 2.1 + o.i) * s * .45;
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(o.ex + sway, o.ey, s * 3.4 * (1 - jh / (R * 1.8)), s * .9, 0, 0, TAU); g.fill();
        const bottom = o.ey - jh - beat;
        drawET(g, o.et, o.ex + sway, bottom, s, {});
        hits.push({ i: o.i, x: o.ex + sway, y: bottom, s });
      };
      list.filter(o => o.sa < 0).forEach(put);
      art(g, cx, cy, R, t, 1, dt);
      list.filter(o => o.sa >= 0).forEach(put);
      drawParts(g, parts);
      if (fast) { g.fillStyle = '#FFD23F'; g.font = `700 11px ${MONO}`; g.fillText('TURBO', 8, 16); }
    }
  });
  const jumpAll = () => { ps.forEach((p, i) => { p.wait = i * .07; }); sound('jump'); };
  const poke = (x, y) => {
    const b = x == null ? null : hits.find(o => Math.abs(x - o.x) <= o.s * 5 && y >= o.y - o.s * 10 && y <= o.y + o.s * 3);
    if (b) { ps[b.i].jump = 1; ps[b.i].wait = -1; burst(parts, b.x, b.y - b.s * 4, ETS[b.i].color, 14, 85); if (!countPoke()) sound('jump'); }
    else { jumpAll(); countPoke(); hits.forEach(o => burst(parts, o.x, o.y - o.s * 4, ETS[o.i].color, 5, 60)); }
  };
  canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); poke(e.clientX - r.left, e.clientY - r.top); });
  canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(null); } });
  return sc;
}

/* ---------- planeta individual (mundos ativos) com o ET morador ---------- */
function makeWorldPlanet(canvas, game) {
  const et = ETS[game.et], art = ART[game.id]();
  const st = { ang: rand(0, TAU), dir: Math.random() < .5 ? 1 : -1, jump: 0, phase: 0, hit: null, parts: [], trail: 0 };
  const sc = addScene(canvas, {
    update(dt) {
      const fast = turbo();
      st.ang += st.dir * (calm ? .15 : fast ? 1.9 : .5) * dt;
      st.phase += dt * (fast ? 16 : 8);
      if (st.jump > 0) st.jump = Math.max(0, st.jump - dt / .6);
      if (fast && st.hit) { st.trail += dt; if (st.trail > .04) { st.trail = 0; st.parts.push({ x: st.hit.x + rand(-4, 4), y: st.hit.y - st.hit.s * 3, vx: -st.dir * 25, vy: rand(-12, 12), l: .35, c: et.color }); } }
      stepParts(st.parts, dt);
    },
    draw(dt) {
      const g = this.g, w = this.w, h = this.h, t = this.t;
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2 + h * .02, R = Math.min(w, h) * .25, s = Math.max(3, Math.round(w / 64)), rx = Math.min(R * 1.95, w / 2 - s * 4.5), ry = rx * .28;
      const sa = Math.sin(st.ang), ex = cx + rx * Math.cos(st.ang), ey = cy + ry * sa;
      const putET = () => {
        const jh = st.jump > 0 ? Math.sin(Math.PI * (1 - st.jump)) * R * .7 : 0;
        const dy = -Math.abs(Math.sin(st.phase)) * s * .6;
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(ex, ey, s * 3.4 * (1 - jh / (R * 1.6)), s * .9, 0, 0, TAU); g.fill();
        const bottom = ey - jh;
        drawET(g, et, ex, bottom, s, { dy });
        st.hit = { x: ex, y: bottom, s };
      };
      if (sa < 0) putET();
      art(g, cx, cy, R, t, 1, dt);
      if (sa >= 0) putET();
      drawParts(g, st.parts);
      if (turbo()) { g.fillStyle = '#FFD23F'; g.font = `700 11px ${MONO}`; g.fillText('TURBO', 8, 16); }
    }
  });
  const act = (x, y) => {
    const b = st.hit;
    if (x != null && b && !(Math.abs(x - b.x) <= b.s * 6 && y >= b.y - b.s * 10 && y <= b.y + b.s * 3)) return;
    const px = b ? b.x : sc.w / 2, py = b ? b.y - b.s * 4 : sc.h / 2;
    st.jump = 1; burst(st.parts, px, py, et.color, 14, 85);
    if (!countPoke()) sound('jump');
  };
  canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); act(e.clientX - r.left, e.clientY - r.top); });
  canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  return sc;
}

/* ---------- radar (#03 a #07): ET caminha e dorme DENTRO do circulo ---------- */
function makeRadar(canvas, game) {
  const et = ETS[game.et], art = ART[game.id]();
  const st = { ph: rand(0, TAU), awake: Math.random() < .5, timer: rand(1, 3), wake: 0, jump: 0, parts: [], hit: null, dir: Math.random() < .5 ? 1 : -1 };
  const sc = addScene(canvas, {
    update(dt) {
      st.timer -= dt;
      if (st.timer <= 0) { st.awake = !st.awake; st.timer = st.awake ? rand(4, 6) : rand(5, 8); }
      if (st.wake > 0) st.wake = Math.max(0, st.wake - dt);
      if (st.jump > 0) st.jump = Math.max(0, st.jump - dt / .6);
      if (st.awake || st.wake > 0) st.ph += st.dir * (calm ? .15 : .55) * dt;
      stepParts(st.parts, dt);
    },
    draw(dt) {
      const g = this.g, w = this.w, h = this.h, t = this.t, c = game.palette.primary;
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = w * .16, rx = w * .31, ry = w * .17, s = Math.max(2, Math.round(w / 44));
      g.strokeStyle = rgba(c, .16); g.lineWidth = 1; g.beginPath(); g.moveTo(cx - w * .46, cy); g.lineTo(cx + w * .46, cy); g.moveTo(cx, cy - h * .46); g.lineTo(cx, cy + h * .46); g.stroke();
      const awake = st.awake || st.wake > 0, sa = Math.sin(st.ph);
      const ex = cx + rx * Math.cos(st.ph), ey = cy + ry * sa + R * .55;
      const putET = () => {
        const jh = st.jump > 0 ? Math.sin(Math.PI * (1 - st.jump)) * R * 1.1 : 0;
        const dy = awake ? -Math.abs(Math.sin(t * 8)) * s * .5 : Math.sin(t * 2) * .6;
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(ex, ey, s * 3.2, s * .8, 0, 0, TAU); g.fill();
        drawET(g, et, ex, ey - jh, s, { dy, sleep: !awake, alpha: awake ? 1 : .8 });
        st.hit = { x: ex, y: ey - jh, s };
      };
      if (sa < 0) putET();
      art(g, cx, cy, R, t, .92, dt);
      if (sa >= 0) putET();
      if (!awake && st.hit) sleepZ(g, st.hit.x, st.hit.y, s, t);
      drawParts(g, st.parts);
    }
  });
  const act = (x, y) => {
    const b = st.hit;
    if (x != null && b && !(Math.abs(x - b.x) <= b.s * 7 && y >= b.y - b.s * 11 && y <= b.y + b.s * 4)) return;
    st.wake = 3.5; st.jump = 1; burst(st.parts, b ? b.x : sc.w / 2, b ? b.y - b.s * 4 : sc.h / 2, et.color, 10, 55);
    sound('jump');
  };
  canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); act(e.clientX - r.left, e.clientY - r.top); });
  canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  return sc;
}

/* ---------- legenda cinetica sincronizada com a demo ---------- */
function stepper(id) {
  const ol = $(`.steps[data-steps="${id}"]`), lis = ol ? $$('li', ol) : [];
  let cur = -2;
  return i => { if (!ol || i === cur) return; cur = i; ol.dataset.sync = '1'; lis.forEach((li, k) => li.classList.toggle('on', k === i)); };
}

/* ---------- mini-demo 2048 Drop: ARRASTE > MIRE > SOLTE > FUNDA IGUAIS ---------- */
function make2048(canvas, setStep) {
  const WW = 300, WH = 240, FL = 226, X0 = 14, X1 = 286, TOP = 38;
  const CO = ['#f67', '#fd6', '#5de', '#6d9', '#F4F1EA', '#f95', '#FFD23F'];
  const rad = l => 7 + 3.2 * l;
  const DUR = [1.5, 1.0, .35, 1.5];
  let balls = [], parts = [], rings = [], acc = 0, score = 0, fade = 0;
  let ph = 0, pt = 0, lvl = 0, tx = 150, fx0 = 60, fxp = 60, merged = 0, pressed = false;
  const resting = () => balls.filter(b => !b.dead && Math.abs(b.vy) < 25 && b.y > 120);
  function begin() {
    const rs = resting().filter(b => b.l < 4);
    if (rs.length && Math.random() < .85) { const m = rs[(Math.random() * rs.length) | 0]; lvl = m.l; tx = clamp(m.x + rand(-3, 3), X0 + rad(lvl) + 2, X1 - rad(lvl) - 2); }
    else { lvl = Math.random() < .6 ? 0 : 1; tx = rand(X0 + rad(lvl) + 4, X1 - rad(lvl) - 4); }
    fx0 = tx < 150 ? X1 - 30 : X0 + 30; fxp = fx0; merged = 0; pressed = true; ph = 0; pt = 0; setStep(0);
  }
  function step(d) {
    if (fade > 0) { fade -= d; if (fade <= 0) { balls = []; score = 0; begin(); } stepParts(parts, d); return; }
    pt += d;
    if (ph === 0) { const k = Math.min(1, pt / DUR[0]), e = k * k * (3 - 2 * k); fxp = fx0 + (tx - fx0) * e; if (pt >= DUR[0]) { ph = 1; pt = 0; setStep(1); } }
    else if (ph === 1) { fxp = tx + Math.sin(pt * 14) * 2.2; if (pt >= DUR[1]) { ph = 2; pt = 0; setStep(2); pressed = false; balls.push({ x: tx, y: 24, vx: 0, vy: 0, l: lvl, age: 0 }); } }
    else if (ph === 2) { if (pt >= DUR[2]) { ph = 3; pt = 0; setStep(3); } }
    else if (pt >= (merged ? DUR[3] * .55 : DUR[3] * 1.4)) begin();
    for (const b of balls) {
      const r = rad(b.l);
      b.age += d; b.vy += 900 * d; b.x += b.vx * d; b.y += b.vy * d;
      if (b.x < X0 + r) { b.x = X0 + r; b.vx *= -.28; } else if (b.x > X1 - r) { b.x = X1 - r; b.vx *= -.28; }
      if (b.y > FL - r) { b.y = FL - r; b.vy = b.vy > 30 ? -b.vy * .28 : 0; b.vx *= .985; }
    }
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], c = balls[j];
          if (a.dead || c.dead) continue;
          const dx = c.x - a.x, dy = c.y - a.y, R = rad(a.l) + rad(c.l), q = Math.hypot(dx, dy);
          if (q >= R) continue;
          if (a.l === c.l && a.l < 5) {
            a.dead = c.dead = true;
            const l = a.l + 1, x = (a.x + c.x) / 2, y = (a.y + c.y) / 2;
            balls.push({ x, y, vx: 0, vy: -30, l, age: 0 });
            score += 2 << l; merged = 1;
            rings.push({ x, y, r: rad(l), l: .35, c: CO[l] });
            burst(parts, x, y, CO[l], 8, 60);
            continue;
          }
          const nx = dx / (q || 1), ny = dy / (q || 1), ov = (R - q) / 2, rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
          if (rv < 0) { const f = rv * (rv < -30 ? .64 : .5); a.vx += f * nx; a.vy += f * ny; c.vx -= f * nx; c.vy -= f * ny; }
        }
      }
    }
    balls = balls.filter(b => !b.dead);
    stepParts(parts, d);
    rings = rings.filter(r => (r.l -= d) > 0);
    if (balls.length > 13 || balls.some(b => b.age > 1.6 && b.y - rad(b.l) < TOP)) fade = 1;
  }
  begin();
  return addScene(canvas, {
    update(dt) { if (calm) dt *= .5; acc += dt; while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; } },
    draw() {
      const g = this.g, k = Math.min(this.w / WW, this.h / WH), ox = (this.w - WW * k) / 2, oy = (this.h - WH * k) / 2, d = this.dpr;
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, this.w, this.h);
      g.setTransform(d * k, 0, 0, d * k, d * ox, d * oy);
      g.lineWidth = 2; g.strokeStyle = '#4b657b';
      g.beginPath(); g.moveTo(X0 - 2, 30); g.lineTo(X0 - 2, FL + 1); g.lineTo(X1 + 2, FL + 1); g.lineTo(X1 + 2, 30); g.stroke();
      g.lineWidth = 1; g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,77,77,.5)';
      g.beginPath(); g.moveTo(X0, TOP); g.lineTo(X1, TOP); g.stroke(); g.setLineDash([]);
      g.globalAlpha = fade > 0 ? clamp(fade, 0, 1) : 1;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const sphere = (b, x, y, l) => {
        const r = rad(l);
        g.fillStyle = CO[l]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.strokeStyle = '#0b0d17'; g.lineWidth = 1.5; g.stroke();
        g.font = `700 ${Math.round(r * .9)}px ${MONO}`;
        g.lineWidth = 2; g.strokeStyle = '#132030'; g.strokeText(String(2 << l), x, y + 1);
        g.fillStyle = l === 4 || l === 1 ? '#0b0d17' : '#fff'; g.fillText(String(2 << l), x, y + 1);
      };
      for (const b of balls) sphere(b, b.x, b.y, b.l);
      if (ph < 2 && fade <= 0) {
        const hy = 24;
        g.globalAlpha = ph === 1 ? .95 : .7; sphere(null, fxp, hy, lvl); g.globalAlpha = 1;
        if (ph === 1) { g.setLineDash([3, 4]); g.strokeStyle = 'rgba(244,241,234,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(fxp, hy + rad(lvl)); g.lineTo(fxp, FL); g.stroke(); g.setLineDash([]); }
        g.strokeStyle = 'rgba(255,210,63,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(fxp, hy - 2, pressed ? 6 : 9, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
      for (const r of rings) { g.strokeStyle = r.c; g.globalAlpha = clamp(r.l * 3, 0, 1); g.lineWidth = 2; g.beginPath(); g.arc(r.x, r.y, r.r + (1 - r.l / .35) * 14, 0, TAU); g.stroke(); }
      g.globalAlpha = 1;
      drawParts(g, parts);
      g.textBaseline = 'alphabetic'; g.fillStyle = '#8a93bd'; g.font = `700 10px ${MONO}`;
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 8, 14);
      g.textAlign = 'right'; g.fillText('AUTO-PLAY', WW - 8, 14);
    }
  });
}

/* ---------- mini-demo Firewall Break: DISPARE > REBATE > ABRA TUNEIS ---------- */
function makeFirewall(canvas, setStep) {
  const WW = 300, WH = 240, COLS = 20, ROWS = 7, BW = 12, BH = 7, GP = 1, X0 = (WW - COLS * (BW + GP) + GP) / 2, Y0 = 26, PY = 222, PW = 48, SP = 150;
  const HC = ['', '#1ac', '#cc4', '#f76'];
  const DUR = [1.5, 2.4, 2.6];
  let grid, left, balls = [], shots = [], parts = [], px = WW / 2, score = 0, acc = 0, regen = 0, ph = 0, pt = 0, tcol = 10, aim = 0;
  const fill = () => { grid = Array.from({ length: ROWS * COLS }, () => (Math.random() < .93 ? 1 + ((Math.random() * 3) | 0) : 0)); left = grid.filter(Boolean).length; };
  const mk = (ang, pierce) => ({ x: px, y: PY - 5, vx: Math.sin(ang) * SP, vy: -Math.cos(ang) * SP, trail: [], pierce: !!pierce });
  function volley(pierce) {
    if (pierce) { const cxT = X0 + tcol * (BW + GP) + BW / 2, a = Math.atan2(cxT - px, PY - Y0); for (let i = 0; i < 3; i++) shots.push({ at: i * .16, ang: a, pierce: true }); }
    else for (let i = 0; i < 5; i++) shots.push({ at: i * .14, ang: -.5 + i * .25, pierce: false });
  }
  function enter(p) {
    ph = p; pt = 0; setStep(p);
    if (p === 0) { px = WW / 2; aim = -.5; volley(false); }
    if (p === 2) { tcol = 2 + ((Math.random() * (COLS - 4)) | 0); volley(true); }
  }
  fill(); enter(0);
  function step(d) {
    pt += d;
    if (ph === 0 && pt >= DUR[0]) enter(1); else if (ph === 1 && pt >= DUR[1]) enter(2); else if (ph === 2 && pt >= DUR[2]) enter(0);
    if (ph === 0) aim = -.5 + Math.min(1, pt / DUR[0]) * 1;
    shots.forEach(s => { s.at -= d; });
    while (shots.length && shots[0].at <= 0) { const s = shots.shift(); balls.push(mk(s.ang, s.pierce)); }
    let tgt = null;
    for (const b of balls) if (b.vy > 0 && (!tgt || b.y > tgt.y)) tgt = b;
    let want = WW / 2;
    if (ph === 2 && !tgt) want = X0 + tcol * (BW + GP) + BW / 2;
    if (tgt) want = tgt.x;
    if (!tgt || tgt.y > 110) px = clamp(px + clamp(want - px, -190 * d, 190 * d), PW / 2, WW - PW / 2);
    for (let bi = balls.length - 1; bi >= 0; bi--) {
      const b = balls[bi];
      b.trail.push(b.x, b.y); if (b.trail.length > 12) b.trail.splice(0, 2);
      b.x += b.vx * d; b.y += b.vy * d;
      if (b.x < 3) { b.x = 3; b.vx = Math.abs(b.vx); }
      if (b.x > WW - 3) { b.x = WW - 3; b.vx = -Math.abs(b.vx); }
      if (b.y < 14) { b.y = 14; b.vy = Math.abs(b.vy); if (b.pierce) b.pierce = false; }
      if (b.vy > 0 && b.y + 3 >= PY && b.y - 3 <= PY + 5 && Math.abs(b.x - px) <= PW / 2 + 3) {
        const a = clamp((b.x - px) / (PW / 2), -.9, .9);
        b.vx = a * SP * .9; b.vy = -Math.sqrt(SP * SP - b.vx * b.vx); b.y = PY - 3; b.pierce = false;
      }
      const c0 = Math.floor((b.x - X0) / (BW + GP)), r0 = Math.floor((b.y - Y0) / (BH + GP));
      scan: for (let r = r0 - 1; r <= r0 + 1; r++) {
        for (let c = c0 - 1; c <= c0 + 1; c++) {
          if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
          const i = r * COLS + c, hp = grid[i];
          if (!hp) continue;
          const bx = X0 + c * (BW + GP), by = Y0 + r * (BH + GP);
          const dx = b.x - clamp(b.x, bx, bx + BW), dy = b.y - clamp(b.y, by, by + BH);
          if (dx * dx + dy * dy > 9) continue;
          if (b.pierce) grid[i] = 0;
          else {
            if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.abs(b.vx) * (dx < 0 ? -1 : 1); else b.vy = Math.abs(b.vy) * (dy < 0 ? -1 : 1);
            grid[i] = hp - 1;
          }
          if (!grid[i]) { left--; score++; burst(parts, bx + BW / 2, by + BH / 2, HC[hp], 5, 45); }
          break scan;
        }
      }
      if (b.y > WH + 6) balls.splice(bi, 1);
    }
    if (left < 14) { regen += d; if (regen > .6) { fill(); regen = 0; } }
    stepParts(parts, d);
  }
  return addScene(canvas, {
    update(dt) { if (calm) dt *= .5; acc += dt; while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; } },
    draw() {
      const g = this.g, k = Math.min(this.w / WW, this.h / WH), ox = (this.w - WW * k) / 2, oy = (this.h - WH * k) / 2, d = this.dpr;
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, this.w, this.h);
      g.setTransform(d * k, 0, 0, d * k, d * ox, d * oy);
      for (let i = 0; i < grid.length; i++) {
        if (!grid[i]) continue;
        g.fillStyle = HC[grid[i]];
        g.fillRect(X0 + (i % COLS) * (BW + GP), Y0 + Math.floor(i / COLS) * (BH + GP), BW, BH);
      }
      if (ph === 2) { const x = X0 + tcol * (BW + GP); g.strokeStyle = 'rgba(255,210,63,.6)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.strokeRect(x - 1, Y0 - 3, BW + 2, ROWS * (BH + GP) + 3); g.setLineDash([]); }
      if (ph === 0) { g.strokeStyle = 'rgba(244,241,234,.5)'; g.lineWidth = 1; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(px, PY); g.lineTo(px + Math.sin(aim) * 110, PY - Math.cos(aim) * 110); g.stroke(); g.setLineDash([]); }
      for (const b of balls) {
        for (let i = 0; i < b.trail.length; i += 2) { g.fillStyle = `rgba(221,238,255,${(i / b.trail.length * .35).toFixed(2)})`; g.fillRect(b.trail[i] - 1, b.trail[i + 1] - 1, 2, 2); }
        g.fillStyle = b.pierce ? '#FFD23F' : '#ddeeff'; g.beginPath(); g.arc(b.x, b.y, b.pierce ? 3.4 : 2.8, 0, TAU); g.fill();
      }
      g.fillStyle = '#66eeff'; g.fillRect(px - PW / 2, PY, PW, 5);
      drawParts(g, parts);
      g.fillStyle = '#8a93bd'; g.font = `700 10px ${MONO}`;
      g.textAlign = 'left'; g.fillText('BLOCOS ' + score, 8, 14);
      g.textAlign = 'right'; g.fillText('AUTO-PLAY', WW - 8, 14);
    }
  });
}

/* ---------- botoes elementais: raios (2048 Drop) e chamas (Firewall Break) ---------- */
function makeFx(canvas) {
  const kind = canvas.dataset.fx, btn = $('.btn-play', canvas.parentElement);
  if (!btn) return null;
  let arcs = [], arcT = 0, I = 1, parts = [], warmed = false;
  const per = (r, u) => {
    const P = 2 * (r.bw + r.bh);
    let d = (((u % 1) + 1) % 1) * P;
    if (d < r.bw) return [r.bx + d, r.by, 0, -1];
    d -= r.bw; if (d < r.bh) return [r.bx + r.bw, r.by + d, 1, 0];
    d -= r.bh; if (d < r.bw) return [r.bx + r.bw - d, r.by + r.bh, 0, 1];
    d -= r.bw; return [r.bx, r.by + r.bh - d, -1, 0];
  };
  const state = () => {
    const cr = canvas.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const r = { bx: br.left - cr.left, by: br.top - cr.top, bw: br.width, bh: br.height };
    const px = ptr.x - cr.left, py = ptr.y - cr.top;
    const alive = ptr.active && performance.now() - ptr.seen < 4000;
    const dist = alive ? Math.hypot(clamp(px, r.bx, r.bx + r.bw) - px, clamp(py, r.by, r.by + r.bh) - py) : 9999;
    const over = alive && px >= r.bx - 4 && px <= r.bx + r.bw + 4 && py >= r.by - 4 && py <= r.by + r.bh + 4;
    return Object.assign(r, { px, py, alive, dist, over, press: ptr.down && over });
  };
  const nearestU = (r, px, py) => { let best = 0, bd = 1e9; for (let i = 0; i < 48; i++) { const p = per(r, i / 48), d = Math.hypot(p[0] - px, p[1] - py); if (d < bd) { bd = d; best = i / 48; } } return best; };
  const bolt = (a, b, amp, n) => {
    const pts = [a], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let k = 1; k < n; k++) { const f = k / n, j = (Math.random() - .5) * 2 * amp * Math.sin(Math.PI * f); pts.push([a[0] + dx * f + nx * j, a[1] + dy * f + ny * j]); }
    pts.push(b); return pts;
  };
  function makeArcs(S) {
    const out = [], n = Math.round(3 + 3 * I), near = S.alive && S.dist < 160;
    for (let a = 0; a < n; a++) {
      if (near && a < Math.ceil(n / 2)) {
        const u = nearestU(S, S.px, S.py) + (Math.random() - .5) * .16, s = per(S, u);
        const tx = clamp(S.px, 2, S.cw - 2), ty = clamp(S.py, 2, S.ch - 2);
        out.push(bolt([s[0], s[1]], [s[0] + (tx - s[0]) * rand(.55, 1), s[1] + (ty - s[1]) * rand(.55, 1)], 10 + 6 * I, 9));
      } else {
        const u0 = Math.random(), len = rand(.05, .15), pts = [];
        const bend = S.alive ? Math.max(0, 1 - S.dist / 220) * 16 : 0;
        for (let k = 0; k <= 7; k++) {
          const p = per(S, u0 + len * k / 7), j = (Math.random() - .5) * 2 * (4 + 5 * I) * (k % 7 === 0 ? .2 : 1);
          let x = p[0] + p[2] * Math.abs(j) + (-p[3]) * j * .3, y = p[1] + p[3] * Math.abs(j) + p[2] * j * .3;
          if (bend) { const dx = S.px - x, dy = S.py - y, l = Math.hypot(dx, dy) || 1; x += dx / l * bend; y += dy / l * bend; }
          pts.push([x, y]);
        }
        out.push(pts);
      }
    }
    return out;
  }
  function stepFire(S, d) {
    const rate = 85 * I;
    const n = Math.floor(rate * d + Math.random());
    for (let i = 0; i < n && parts.length < 240; i++) {
      const ember = Math.random() < .12, x = S.bx + 3 + Math.random() * (S.bw - 6), lean = S.alive ? clamp((S.px - x) / 300, -.4, .4) : 0;
      parts.push({ x, y: S.by + 3, vx: rand(-10, 10) + lean * 60, vy: -rand(38, 78) * (.8 + .3 * I) * (ember ? 1.5 : 1), l: 1, life: rand(.5, .95) * (.85 + .15 * I), s: ember ? rand(1.5, 2.6) : rand(4, 8) * (.8 + .2 * I), e: ember, ph: rand(0, TAU) });
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.l -= d / p.life;
      if (p.l <= 0) { parts.splice(i, 1); continue; }
      p.x += (p.vx + (p.e ? Math.sin(p.ph + p.l * 9) * 14 : 0)) * d; p.y += p.vy * d;
    }
  }
  const sc = addScene(canvas, {
    update(dt) {
      const S = state();
      const goal = S.press ? 2.7 : S.over ? 2 : (S.alive && S.dist < 110) ? 1.5 : 1;
      I += (goal - I) * Math.min(1, dt * 8);
      if (kind === 'fire') {
        if (calm && !warmed) { warmed = true; for (let i = 0; i < 40; i++) stepFire(S, .03); }
        else stepFire(S, dt);
      } else {
        arcT -= dt;
        if (arcT <= 0 || (calm && !warmed)) { warmed = true; S.cw = this.w; S.ch = this.h; arcs = makeArcs(S); arcT = rand(.05, .09); }
      }
    },
    draw() {
      const g = this.g, S = state();
      S.cw = this.w; S.ch = this.h;
      g.clearRect(0, 0, this.w, this.h);
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      if (kind === 'fire') {
        const gl = g.createLinearGradient(0, S.by - 26, 0, S.by + 4);
        gl.addColorStop(0, 'rgba(255,90,54,0)'); gl.addColorStop(1, `rgba(255,90,54,${(.16 * I).toFixed(2)})`);
        g.fillStyle = gl; g.fillRect(S.bx, S.by - 26, S.bw, 30);
        for (const p of parts) {
          const l = p.l, col = p.e ? '255,210,63' : (l > .66 ? '255,210,63' : l > .33 ? '255,90,54' : '255,77,77');
          g.fillStyle = `rgba(${col},${(Math.min(1, l * 1.2) * (p.e ? 1 : .55)).toFixed(2)})`;
          g.beginPath(); g.arc(p.x, p.y, Math.max(.6, p.s * (p.e ? 1 : .35 + l * .65)), 0, TAU); g.fill();
        }
      } else {
        const fl = .75 + Math.random() * .25;
        for (const pts of arcs) {
          const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
          g.strokeStyle = `rgba(56,189,248,${(.16 * fl).toFixed(2)})`; g.lineWidth = 7; path();
          g.strokeStyle = `rgba(255,210,63,${(.55 * fl).toFixed(2)})`; g.lineWidth = 2.6; path();
          g.strokeStyle = `rgba(244,241,234,${fl.toFixed(2)})`; g.lineWidth = 1.1; path();
        }
        if (S.over || S.press) { g.strokeStyle = `rgba(255,210,63,${(.25 + .1 * Math.random()).toFixed(2)})`; g.lineWidth = 2; g.strokeRect(S.bx - 2, S.by - 2, S.bw + 4, S.bh + 4); }
      }
      g.restore();
    }
  });
  btn.addEventListener('pointerdown', () => { sound('ui'); if (kind === 'lightning') { const S = state(); S.cw = sc.w; S.ch = sc.h; arcs = makeArcs(S); } });
  return sc;
}

/* ---------- overlays, dossies, Raio-X e hidratacao dos dados ---------- */
function setupUI() {
  // links e QR a partir de data/games.js
  $$('.world[data-game]').forEach(el => {
    const g = byId[el.dataset.game];
    if (!g) return;
    const a = $('[data-play]', el), b = $('[data-qr]', el);
    if (a && g.url) a.href = g.url;
    if (b && g.qr) b.dataset.qr = g.qr;
  });
  // ETs na secao Bastidores
  const row = $('#et-row');
  ETS.forEach(et => {
    const c = document.createElement('canvas');
    c.width = c.height = 32; c.title = et.name;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    drawET(g, et, 16, 30, 3.5);
    row.appendChild(c);
  });
  // overlay do QR Code (tela cheia)
  const qr = $('#qr-modal'), qimg = $('#qr-img'), qtitle = $('#qr-title');
  let qLast = null;
  const qrOpen = b => {
    qLast = b; qimg.src = b.dataset.qr; qimg.alt = 'QR Code do jogo ' + b.dataset.title; qtitle.textContent = b.dataset.title;
    qr.hidden = false; document.body.classList.add('lock');
    requestAnimationFrame(() => qr.classList.add('open'));
    sound('scan'); $('#qr-close').focus();
  };
  const qrClose = () => { qr.classList.remove('open'); document.body.classList.remove('lock'); setTimeout(() => { qr.hidden = true; }, 250); if (qLast) qLast.focus(); };
  $$('[data-qr]').forEach(b => b.addEventListener('click', () => qrOpen(b)));
  $('#qr-close').addEventListener('click', qrClose);
  qr.addEventListener('click', e => { if (e.target === qr) qrClose(); });
  // overlay da historia do planeta
  const lore = $('#lore');
  let lLast = null;
  const spr = (cv, et, px) => {
    const g = cv.getContext('2d'); cv.width = cv.height = 8 * px; g.imageSmoothingEnabled = false; g.clearRect(0, 0, 8 * px, 8 * px);
    drawET(g, et, 4 * px, 8 * px, px);
  };
  const loreOpen = b => {
    const game = byId[b.dataset.lore], et = ETS[game.et];
    lLast = b;
    lore.style.setProperty('--lc', et.color);
    $('#lore-planet').textContent = game.planet;
    $('#lore-meta').textContent = 'Habitante: ' + et.name + ' · ' + game.code + ' ' + game.name;
    $('#lore-story').textContent = game.lore.story;
    $('#lore-origin-title').textContent = 'Origem do nome · ' + et.name;
    $('#lore-origin').textContent = game.lore.origin;
    spr($('#lore-et'), et, 12);
    lore.hidden = false; document.body.classList.add('lock');
    requestAnimationFrame(() => lore.classList.add('open'));
    lore.scrollTop = 0; sound('ui'); $('#lore-close').focus();
    markExplored(game.id);
  };
  const loreClose = () => { lore.classList.remove('open'); document.body.classList.remove('lock'); setTimeout(() => { lore.hidden = true; }, 250); if (lLast) lLast.focus(); };
  $$('[data-lore]').forEach(b => b.addEventListener('click', () => loreOpen(b)));
  $('#lore-close').addEventListener('click', loreClose);
  lore.addEventListener('click', e => { if (e.target === lore) loreClose(); });
  addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!lore.hidden) loreClose(); else if (!qr.hidden) qrClose(); });
  // historias dos pilares e dossies dos jogos
  $$('.more').forEach(b => b.addEventListener('click', () => {
    const o = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(o));
    b.closest('.fact').classList.toggle('open', o);
    b.textContent = o ? '– Esconder história' : '+ Ver história completa';
    sound('ui');
  }));
  $$('.btn-dos').forEach(b => b.addEventListener('click', () => {
    const o = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(o));
    $('#' + b.getAttribute('aria-controls')).classList.toggle('open', o);
    sound('ui');
  }));
  // Raio-X: texto Base85 real do 2048 Drop, contagem e botao copiar
  const g1 = byId['01'], payload = g1 && g1.url ? g1.url.split('#')[1] || '' : '';
  if (payload) {
    $('#xray-code').textContent = payload;
    $('#xray-count').textContent = payload.length.toLocaleString('pt-BR');
    const cp = $('#xray-copy');
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(payload); }
      catch { const t = document.createElement('textarea'); t.value = payload; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* sem clipboard */ } t.remove(); }
      cp.textContent = '[Copiado!]'; sound('ui');
      setTimeout(() => { cp.textContent = '[Copiar código bruto]'; }, 1800);
    });
  }
  // revelar ao rolar (a classe rv so entra quando o JS esta pronto para revelar)
  root.classList.add('rv');
  const items = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { threshold: .12 });
    items.forEach(el => rio.observe(el));
  } else items.forEach(el => el.classList.add('in'));
}

/* ---------- palco de escala: 1 jogo = 2.645 bytes vs 772 jogos = 1 foto ---------- */
function setupScale() {
  const cv = $('#scale-canvas'), stage = $('#scale-stage'), out = $('#scale-readout'), btn = $('#scale-replay');
  if (!cv || !stage) return;
  const N = 28, TOTAL = 772, GAME = 2645, HOLD = 1.4, DUR = 5.8, SHOW = 4.5, CYCLE = HOLD + DUR + SHOW;
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const st = { el: calm ? HOLD + DUR + .6 : 0, active: false, e: 0, fin: 0, n: -1 };
  const sync = () => {
    st.e = ease(clamp((st.el - HOLD) / DUR, 0, 1));
    st.fin = clamp((st.el - HOLD - DUR) / .6, 0, 1);
  };
  sync();
  const code = [[0, .62], [.1, .4], [.1, .7], [.2, .5], [.2, .34], [.1, .58], [.1, .72], [.2, .44], [0, .3]];
  const readout = n => {
    if (!out || n === st.n) return;
    st.n = n;
    const bytes = (n * GAME).toLocaleString('pt-BR');
    out.innerHTML = n === 1 ? 'Escala atual: <b>2.645 bytes</b> (1 quadrado)'
      : n === TOTAL ? 'Escala atual: <b>' + bytes + ' bytes</b> (772 quadrados = 1 foto)'
        : 'Escala atual: <b>' + bytes + ' bytes</b> (' + n.toLocaleString('pt-BR') + ' quadrados)';
  };
  const restart = () => { if (calm) return; st.el = 0; st.active = true; sync(); };
  addScene(cv, {
    update(dt) {
      if (!st.active || calm) return;
      st.el += dt;
      if (st.el >= CYCLE) st.el -= CYCLE;
      sync();
    },
    draw() {
      const g = this.g, w = this.w, h = this.h, e = st.e;
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#06070B'; g.fillRect(0, 0, w, h);
      const sF = Math.min(w, h) * .86 / N, s0 = sF * 14;
      const s = s0 * Math.pow(sF / s0, e);
      const cw = .5 + (N / 2 - .5) * e;
      const n = clamp(Math.round(1 + (TOTAL - 1) * e), 1, TOTAL);
      readout(n);
      const sq = s * .86, fs = clamp(w / 60, 8.5, 12);
      const px = wx => w / 2 + (wx - cw) * s, py = wy => h / 2 + (wy - cw) * s;
      for (let i = TOTAL - 1; i >= 0; i--) {
        const c = i % N, r = (i / N) | 0;
        const x = px(c + .5) - sq / 2, y = py(r + .5) - sq / 2;
        if (x + sq < 0 || x > w || y + sq < 0 || y > h) continue;
        if (i === 0) {
          g.globalAlpha = 1; g.fillStyle = '#FFD23F'; g.fillRect(x, y, sq, sq);
          if (sq > 70) {
            const a = clamp((sq - 70) / 90, 0, 1);
            g.fillStyle = `rgba(9,10,15,${(.55 * a).toFixed(2)})`;
            code.forEach(([ind, len], j) => g.fillRect(x + sq * (.1 + ind), y + sq * (.1 + j * .075), sq * len * .8, sq * .035));
            g.globalAlpha = a; g.fillStyle = '#090A0F'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.font = `800 ${Math.max(8, Math.round(sq * .12))}px ${MONO}`;
            g.fillText('2.645 BYTES', x + sq / 2, y + sq * .86);
            g.globalAlpha = 1;
          }
          continue;
        }
        g.globalAlpha = i < n ? 1 : .22;
        g.fillStyle = '#181D2C'; g.fillRect(x, y, sq, sq);
        if (sq > 5) { g.strokeStyle = '#2A3248'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, sq - 1, sq - 1); }
      }
      g.globalAlpha = 1;
      // moldura tracejada em volta dos 772 quadrados (27 linhas cheias + 16 na ultima)
      const P = .1;
      const fr = [[-P, -P], [N + P, -P], [N + P, 27 + P], [16 + P, 27 + P], [16 + P, N + P], [-P, N + P]];
      g.save();
      g.setLineDash([6, 5]); g.lineWidth = 1.2; g.strokeStyle = 'rgba(142, 150, 168, 0.35)';
      g.beginPath();
      fr.forEach(([wx, wy], i) => i ? g.lineTo(px(wx), py(wy)) : g.moveTo(px(wx), py(wy)));
      g.closePath(); g.stroke();
      g.restore();
      g.textBaseline = 'alphabetic';
      // legenda inicial: 1 jogo inteiro = 2.645 bytes
      const a0 = 1 - clamp(e / .12, 0, 1);
      if (a0 > 0) {
        g.globalAlpha = a0; g.fillStyle = '#FFD23F'; g.textAlign = 'center'; g.font = `700 ${Math.round(fs + 2)}px ${MONO}`;
        g.fillText('1 JOGO INTEIRO = 2.645 BYTES', w / 2, h - 12);
        g.globalAlpha = 1;
      }
      // rotulo da foto (abaixo da moldura, a direita)
      const a1 = clamp((e - .5) / .4, 0, 1);
      if (a1 > 0) {
        g.globalAlpha = a1; g.fillStyle = '#8E96A8'; g.textAlign = 'right'; g.font = `700 ${fs}px ${MONO}`;
        g.fillText('1 FOTO DE CELULAR · 772 QUADRADOS (2.041.940 BYTES)', clamp(px(N + P), 8, w - 4), clamp(py(N + P) + fs + 5, fs + 2, h - 4));
        g.globalAlpha = 1;
      }
      // marca d'agua sobre os quadrados escuros
      if (st.fin > 0) {
        g.globalAlpha = st.fin; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `700 ${Math.round(clamp(w / 48, 10, 15))}px ${MONO}`;
        g.lineWidth = 3; g.strokeStyle = 'rgba(6,7,11,.65)'; g.fillStyle = 'rgba(244,241,234,.3)';
        const mx = px(14), my = py(14);
        g.strokeText('ÁREA DE 1 FOTO COMUM (771 QUADRADOS)', mx, my);
        g.fillText('ÁREA DE 1 FOTO COMUM (771 QUADRADOS)', mx, my);
        g.globalAlpha = 1; g.textBaseline = 'alphabetic';
      }
      // rotulo amarelo apontando para o 1o quadrado
      const a2 = clamp((e - .85) / .15, 0, 1);
      if (a2 > 0) {
        const cx0 = px(.5), top0 = py(.5) - sq / 2;
        const lx = clamp(px(-P), 4, w - 4), ly = Math.max(py(-P) - 8, fs + 2);
        g.globalAlpha = a2; g.fillStyle = '#FFD23F'; g.strokeStyle = '#FFD23F';
        g.textAlign = 'left'; g.font = `700 ${fs}px ${MONO}`;
        g.fillText('1 JOGO (2.645 B)', lx, ly);
        g.lineWidth = 1.2; g.setLineDash([]);
        if (top0 - (ly + 3) > 3) { g.beginPath(); g.moveTo(cx0, ly + 3); g.lineTo(cx0, top0 - 2); g.stroke(); }
        g.strokeRect(cx0 - sq / 2 - 2.5, top0 - 2.5, sq + 5, sq + 5);
        g.globalAlpha = 1;
      }
    }
  });
  if (btn) btn.addEventListener('click', () => { sound('ui'); restart(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(en => { st.active = en.intersectionRatio >= .3; }), { threshold: [0, .3] }).observe(stage);
  } else st.active = true;
}

function boot() {
  safe(() => setupUI());
  safe(() => setupScale());
  safe(() => paintSeals());
  safe(() => makeStars($('#stars')));
  safe(() => makeHero($('#hero-canvas')));
  $$('.world[data-game]').forEach(el => safe(() => {
    const g = byId[el.dataset.game];
    if (!g) return;
    makeWorldPlanet($('.planet-canvas', el), g);
    const set = stepper(g.id), demo = $('.demo-canvas', el);
    if (g.demoType === '2048') make2048(demo, set);
    else if (g.demoType === 'firewall') makeFirewall(demo, set);
  }));
  $$('.blip[data-game]').forEach(el => safe(() => { const g = byId[el.dataset.game]; if (g) makeRadar($('canvas', el), g); }));
  $$('.btn-fx[data-fx]').forEach(c => safe(() => makeFx(c)));
  requestAnimationFrame(frame);
}
boot();
