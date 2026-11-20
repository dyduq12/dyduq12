// QR Game - universo (versao 0.1.0)
import { GAMES } from '../data/games.js';
import { ETS, playRetroSound } from './sprites.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
const mix = (h, t, k) => { const a = rgb(h), b = rgb(t); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; };
const sound = t => playRetroSound(t);
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

const COPY = {
  '01': { kind: 'Puzzle de fusão', desc: 'Arraste para mirar e solte para derrubar. Junte esferas iguais até formar a 2048.' },
  '02': { kind: 'Quebra-blocos híbrido', desc: 'Lance rajadas de bolinhas, rebata com a barra e abra túneis numa parede de microblocos.' }
};

/* ---------- estado global (ETs e turbo) ---------- */
const world = { streak: 0, last: 0, turboUntil: 0 };
const turbo = () => performance.now() < world.turboUntil;

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

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

/* ---------- infraestrutura de cenas ---------- */
const scenes = [];
const byCanvas = new WeakMap();
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(es => es.forEach(e => { const s = byCanvas.get(e.target); if (s) s.visible = e.isIntersecting; }), { rootMargin: '120px' })
  : null;
const ro = 'ResizeObserver' in window
  ? new ResizeObserver(es => es.forEach(e => { const s = byCanvas.get(e.target); if (s) s.fit(); }))
  : null;

function addScene(canvas, impl) {
  const s = Object.assign({ canvas, g: canvas.getContext('2d'), w: 0, h: 0, dpr: 1, t: 0, visible: !io }, impl);
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
      s.update(dt);
      s.draw();
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- utilitarios de desenho ---------- */
const darkCache = new Map();
const dark = et => darkCache.get(et) || (darkCache.set(et, mix(et.color, '#000000', .22)), darkCache.get(et));

function drawET(g, et, cx, bottom, s, o = {}) {
  const ox = Math.round(cx - 4 * s), oy = Math.round(bottom - 8 * s + (o.dy || 0));
  g.save();
  g.globalAlpha = o.alpha == null ? 1 : o.alpha;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = et.rows[r][c];
      if (ch === '.') continue;
      g.fillStyle = r >= 6 ? dark(et) : et.color;
      g.fillRect(ox + c * s, oy + r * s, s, s);
      if (ch === 'h') { g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(ox + c * s, oy + r * s, s, s); }
    }
  }
  g.fillStyle = '#151525';
  for (const [c, r] of et.eyes) {
    if (o.sleep) g.fillRect(ox + c * s, oy + r * s + Math.round(s * .55), s, Math.max(1, Math.round(s * .3)));
    else g.fillRect(ox + c * s, oy + r * s, s, s);
  }
  g.restore();
}

function burst(arr, x, y, color, n = 12, sp = 70) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), v = rand(sp * .4, sp);
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

/* ---------- estrelas do hero ---------- */
function makeStars(canvas) {
  let stars = [], shoot = null;
  addScene(canvas, {
    onFit() {
      const n = clamp(Math.round(this.w * this.h / 8000), 50, 220);
      stars = Array.from({ length: n }, () => ({ x: Math.random() * this.w, y: Math.random() * this.h, z: Math.random(), p: Math.random() * 6.28 }));
    },
    update(dt) {
      if (calm) return;
      for (const s of stars) { s.y += (3 + s.z * 12) * dt; if (s.y > this.h) { s.y = 0; s.x = Math.random() * this.w; } }
      if (shoot) { shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.l -= dt; if (shoot.l <= 0) shoot = null; }
      else if (Math.random() < dt * .12) shoot = { x: rand(0, this.w * .8), y: rand(0, this.h * .4), vx: 260, vy: 110, l: .9 };
    },
    draw() {
      const g = this.g;
      g.clearRect(0, 0, this.w, this.h);
      for (const s of stars) {
        const a = .22 + .6 * s.z * (.6 + .4 * Math.sin(this.t * 1.6 + s.p));
        g.fillStyle = `rgba(190,205,255,${a.toFixed(2)})`;
        const k = s.z > .85 ? 2 : 1;
        g.fillRect(Math.round(s.x), Math.round(s.y), k, k);
      }
      if (shoot) {
        for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(230,240,255,${(.8 - i * .11) * clamp(shoot.l * 2, 0, 1)})`; g.fillRect(Math.round(shoot.x - i * 5), Math.round(shoot.y - i * 2.1), 2, 2); }
      }
    }
  });
}

/* ---------- emblema pixelado do hero ---------- */
function makeEmblem(canvas) {
  const N = 21;
  let idx = 0, bump = 0, flick = 0, parts = [];
  const mods = Array.from({ length: N * N }, () => Math.random() < .5);
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
  const inCenter = (x, y) => x >= 6 && x <= 14 && y >= 6 && y <= 14;
  const sc = addScene(canvas, {
    update(dt) {
      bump = Math.max(0, bump - dt * 3);
      flick += dt;
      if (flick > .16 && !calm) { flick = 0; for (let i = 0; i < 4; i++) { const k = (Math.random() * mods.length) | 0; mods[k] = !mods[k]; } }
      stepParts(parts, dt);
    },
    draw() {
      const g = this.g, w = this.w, h = this.h, cell = Math.max(4, Math.floor(Math.min(w, h) / (N + 2))), ox = Math.round((w - N * cell) / 2), oy = Math.round((h - N * cell) / 2);
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#0f1226';
      g.fillRect(ox - cell, oy - cell, (N + 2) * cell, (N + 2) * cell);
      g.strokeStyle = bump > 0 ? '#ffffff' : '#4be3ff';
      g.lineWidth = 2;
      g.strokeRect(ox - cell + 1, oy - cell + 1, (N + 2) * cell - 2, (N + 2) * cell - 2);
      g.fillStyle = '#c9d4ff';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (inFinder(x, y) || inCenter(x, y)) continue;
        if (mods[y * N + x]) g.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
      for (const [fx, fy] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
        g.fillStyle = '#c9d4ff'; g.fillRect(ox + fx * cell, oy + fy * cell, 7 * cell, 7 * cell);
        g.fillStyle = '#0f1226'; g.fillRect(ox + (fx + 1) * cell, oy + (fy + 1) * cell, 5 * cell, 5 * cell);
        g.fillStyle = '#8f5cff'; g.fillRect(ox + (fx + 2) * cell, oy + (fy + 2) * cell, 3 * cell, 3 * cell);
      }
      const et = ETS[idx], s = Math.max(2, Math.floor(cell * 9 / 8));
      const blink = this.t % 3.4 < .12;
      drawET(g, et, w / 2, h / 2 + 4 * s, s, { dy: Math.sin(this.t * 3) * 1.5 - bump * s * 2, sleep: blink });
      drawParts(g, parts);
    }
  });
  const hit = () => {
    idx = (idx + 1) % ETS.length; bump = 1;
    burst(parts, sc.w / 2, sc.h / 2, ETS[idx].color, 14, 80);
    sound('ui');
  };
  canvas.addEventListener('pointerdown', hit);
  canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(); } });
}

/* ---------- planeta + ET ---------- */
function makePlanet(canvas, game) {
  const et = ETS[game.et], soon = game.status !== 'active';
  const c1 = game.palette.primary, c2 = game.palette.secondary;
  const st = { ang: soon ? 1.1 : rand(0, 6.28), dir: Math.random() < .5 ? 1 : -1, jump: 0, wake: 0, phase: 0, trail: 0, hit: null, parts: [] };
  const sc = addScene(canvas, {
    update(dt) {
      const fast = turbo() && !soon;
      if (!soon) st.ang += st.dir * (calm ? .15 : fast ? 1.9 : .55) * dt;
      else if (st.wake > 0) st.ang += st.dir * .8 * dt;
      st.phase += dt * (fast ? 16 : 8);
      if (st.jump > 0) st.jump = Math.max(0, st.jump - dt / .6);
      if (st.wake > 0) st.wake = Math.max(0, st.wake - dt);
      if (fast && st.hit) {
        st.trail += dt;
        if (st.trail > .04) { st.trail = 0; st.parts.push({ x: st.hit.x + rand(-4, 4), y: st.hit.y - st.hit.s * 3, vx: -st.dir * 25, vy: rand(-12, 12), l: .35, c: et.color }); }
      }
      stepParts(st.parts, dt);
    },
    draw() {
      const g = this.g, w = this.w, h = this.h, t = this.t;
      const cx = w / 2, cy = h / 2 + h * .02, R = Math.min(w, h) * .26, rx = R * 1.7, ry = rx * .3, s = Math.max(2, Math.round(w / 64));
      const sa = Math.sin(st.ang), ex = cx + rx * Math.cos(st.ang), ey = cy + ry * sa;
      const awake = !soon || st.wake > 0;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!soon) {
        const hg = g.createRadialGradient(cx, cy, R * .8, cx, cy, R * 2.1);
        hg.addColorStop(0, rgba(c1, .34)); hg.addColorStop(1, rgba(c1, 0));
        g.fillStyle = hg; g.fillRect(0, 0, w, h);
      }
      const ring = (a0, a1) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, a0, a1); g.stroke(); };
      const putET = () => {
        const p = 1 - st.jump, jh = st.jump > 0 ? Math.sin(Math.PI * p) * R * .7 : 0;
        const dy = awake ? -Math.abs(Math.sin(st.phase)) * s * .6 : Math.sin(t * 2) * .6;
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath(); g.ellipse(ex, ey, s * 3.4 * (1 - jh / (R * 1.6)), s * .9, 0, 0, 7); g.fill();
        const bottom = ey - jh;
        drawET(g, et, ex, bottom, s, { dy, sleep: !awake, alpha: soon && !awake ? .78 : 1 });
        st.hit = { x: ex, y: bottom, s };
      };
      g.lineWidth = 1.5; g.setLineDash([3, 5]); g.strokeStyle = rgba(c2, soon ? .32 : .62);
      ring(Math.PI, Math.PI * 2);
      g.setLineDash([]);
      if (sa < 0) putET();
      if (!soon) {
        const pg = g.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
        pg.addColorStop(0, mix(c1, '#ffffff', .45)); pg.addColorStop(.55, c1); pg.addColorStop(1, mix(c1, '#000000', .62));
        g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
        g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
        g.translate(cx, cy); g.rotate(-.35);
        g.fillStyle = rgba(c2, .28);
        for (const [y, hh] of [[-.62, .16], [-.12, .22], [.38, .14]]) g.fillRect(-R * 1.2, y * R, R * 2.4, hh * R);
        g.rotate(.35);
        g.fillStyle = 'rgba(0,0,0,.16)';
        for (const [x, y, r] of [[-.35, .25, .16], [.3, -.3, .12], [.42, .38, .1]]) { g.beginPath(); g.arc(x * R, y * R, r * R, 0, 7); g.fill(); }
        g.translate(-cx, -cy);
        const sg = g.createRadialGradient(cx - R * .5, cy - R * .5, R * .25, cx, cy, R * 1.25);
        sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.55)');
        g.fillStyle = sg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
        g.restore();
      } else {
        g.fillStyle = rgba(c1, .07); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
        g.strokeStyle = rgba(c1, .5); g.lineWidth = 1.5; g.setLineDash([2, 4]);
        g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
        g.strokeStyle = rgba(c1, .22); g.lineWidth = 1;
        g.beginPath(); g.arc(cx, cy, R * .6, 0, 7); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
        const a = t * 1.3;
        g.fillStyle = rgba(c1, .22);
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a - .55, a); g.closePath(); g.fill();
        g.strokeStyle = rgba(c1, .7); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
        for (let i = 0; i < 3; i++) { const q = i * 2.1 + game.et, bx = cx + Math.cos(q) * R * .55, by = cy + Math.sin(q * 1.3) * R * .5; g.fillStyle = rgba(c2, .25 + .35 * Math.max(0, Math.sin(t * 2 + i * 2))); g.fillRect(Math.round(bx), Math.round(by), 3, 3); }
      }
      g.strokeStyle = rgba(c2, soon ? .32 : .62); g.lineWidth = 1.5; g.setLineDash([3, 5]);
      ring(0, Math.PI);
      g.setLineDash([]);
      if (sa >= 0) putET();
      if (!awake && st.hit) {
        for (let i = 0; i < 3; i++) {
          const k = (t * .7 + i / 3) % 1, a = 1 - k;
          g.fillStyle = `rgba(207,216,255,${a.toFixed(2)})`;
          g.font = `700 ${9 + i * 3}px ${MONO}`;
          g.fillText(i === 1 ? 'Z' : 'z', st.hit.x + s * 4 + k * s * 4, st.hit.y - s * 9 - k * s * 9);
        }
      }
      drawParts(g, st.parts);
      if (turbo() && !soon) { g.fillStyle = '#4be3ff'; g.font = `700 11px ${MONO}`; g.fillText('TURBO', 8, 16); }
    }
  });
  const act = (x, y) => {
    const b = st.hit;
    if (x != null && b && !(Math.abs(x - b.x) <= b.s * 6 && y >= b.y - b.s * 10 && y <= b.y + b.s * 3)) return;
    const px = b ? b.x : sc.w / 2, py = b ? b.y - b.s * 4 : sc.h / 2;
    if (soon) { if (st.wake > 0) return; st.wake = 2.8; st.jump = 1; burst(st.parts, px, py, et.color, 8, 50); sound('jump'); return; }
    st.jump = 1; burst(st.parts, px, py, et.color, 14, 85);
    if (!countPoke()) sound('jump');
  };
  canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); act(e.clientX - r.left, e.clientY - r.top); });
  canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
}

/* ---------- mini-demo 2048 ---------- */
function make2048(canvas) {
  const WW = 300, WH = 240, FL = 226, X0 = 14, X1 = 286, TOP = 38;
  const CO = ['#f67', '#fd6', '#5de', '#6d9', '#b8f', '#f95', '#ffffff'];
  const rad = l => 7 + 3.2 * l;
  let balls = [], parts = [], rings = [], acc = 0, spawn = .3, score = 0, fade = 0;
  const pick = () => { const r = Math.random(); return r < .5 ? 0 : r < .85 ? 1 : 2; };
  function drop() {
    const l = pick();
    let x = rand(X0 + rad(l) + 2, X1 - rad(l) - 2);
    const m = balls.filter(b => b.l === l && Math.abs(b.vy) < 60);
    if (m.length && Math.random() < .75) x = clamp(m[(Math.random() * m.length) | 0].x + rand(-5, 5), X0 + rad(l) + 2, X1 - rad(l) - 2);
    balls.push({ x, y: 22, vx: 0, vy: 0, l, age: 0 });
  }
  function step(d) {
    if (fade > 0) { fade -= d; if (fade <= 0) { balls = []; score = 0; spawn = .4; } stepParts(parts, d); return; }
    spawn -= d;
    if (spawn <= 0) { drop(); spawn = rand(.5, .85); }
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
          if (a.l === c.l && a.l < 6) {
            a.dead = c.dead = true;
            const l = a.l + 1, x = (a.x + c.x) / 2, y = (a.y + c.y) / 2;
            balls.push({ x, y, vx: 0, vy: -30, l, age: 0 });
            score += 2 << l;
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
    if (balls.length > 20 || balls.some(b => b.age > 1.5 && b.y - rad(b.l) < TOP)) fade = 1;
  }
  addScene(canvas, {
    update(dt) { if (calm) dt *= .5; acc += dt; while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; } },
    draw() {
      const g = this.g, k = Math.min(this.w / WW, this.h / WH), ox = (this.w - WW * k) / 2, oy = (this.h - WH * k) / 2, d = this.dpr;
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, this.w, this.h);
      g.setTransform(d * k, 0, 0, d * k, d * ox, d * oy);
      g.lineWidth = 2; g.strokeStyle = '#4b657b';
      g.beginPath(); g.moveTo(X0 - 2, 30); g.lineTo(X0 - 2, FL + 1); g.lineTo(X1 + 2, FL + 1); g.lineTo(X1 + 2, 30); g.stroke();
      g.lineWidth = 1; g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,102,119,.5)';
      g.beginPath(); g.moveTo(X0, TOP); g.lineTo(X1, TOP); g.stroke(); g.setLineDash([]);
      g.globalAlpha = fade > 0 ? clamp(fade, 0, 1) : 1;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const b of balls) {
        const r = rad(b.l);
        g.fillStyle = CO[b.l]; g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.fill();
        g.strokeStyle = '#0b0d17'; g.lineWidth = 1.5; g.stroke();
        g.font = `700 ${Math.round(r * .9)}px ${MONO}`;
        g.lineWidth = 2; g.strokeStyle = '#132030'; g.strokeText(String(2 << b.l), b.x, b.y + 1);
        g.fillStyle = '#fff'; g.fillText(String(2 << b.l), b.x, b.y + 1);
      }
      g.globalAlpha = 1;
      for (const r of rings) { g.strokeStyle = r.c; g.globalAlpha = clamp(r.l * 3, 0, 1); g.lineWidth = 2; g.beginPath(); g.arc(r.x, r.y, r.r + (1 - r.l / .35) * 14, 0, 7); g.stroke(); }
      g.globalAlpha = 1;
      drawParts(g, parts);
      g.textBaseline = 'alphabetic'; g.fillStyle = '#8a93bd'; g.font = `700 10px ${MONO}`;
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 8, 14);
      g.textAlign = 'right'; g.fillText('AUTO-PLAY', WW - 8, 14);
    }
  });
}

/* ---------- mini-demo Firewall ---------- */
function makeFirewall(canvas) {
  const WW = 300, WH = 240, COLS = 20, ROWS = 6, BW = 12, BH = 7, GP = 1, X0 = (WW - COLS * (BW + GP) + GP) / 2, Y0 = 26, PY = 222, PW = 48, SP = 150;
  const HC = ['', '#1ac', '#cc4', '#f76'];
  let grid, left, balls, parts = [], caps = [], px = WW / 2, score = 0, acc = 0, regen = 0;
  const fill = () => { grid = Array.from({ length: ROWS * COLS }, () => (Math.random() < .92 ? 1 + ((Math.random() * 3) | 0) : 0)); left = grid.filter(Boolean).length; };
  const serve = b => { const a = rand(-.5, .5); b.x = px; b.y = PY - 5; b.vx = Math.sin(a) * SP; b.vy = -Math.cos(a) * SP; b.trail = []; return b; };
  fill();
  balls = [serve({})];
  function step(d) {
    let tgt = null;
    for (const b of balls) if (b.vy > 0 && (!tgt || b.y > tgt.y)) tgt = b;
    if (!tgt || tgt.y > 110) px = clamp(px + clamp((tgt ? tgt.x : WW / 2) - px, -190 * d, 190 * d), PW / 2, WW - PW / 2);
    for (const b of balls) {
      b.trail.push(b.x, b.y); if (b.trail.length > 12) b.trail.splice(0, 2);
      b.x += b.vx * d; b.y += b.vy * d;
      if (b.x < 3) { b.x = 3; b.vx = Math.abs(b.vx); }
      if (b.x > WW - 3) { b.x = WW - 3; b.vx = -Math.abs(b.vx); }
      if (b.y < 14) { b.y = 14; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && b.y + 3 >= PY && b.y - 3 <= PY + 5 && Math.abs(b.x - px) <= PW / 2 + 3) {
        const a = clamp((b.x - px) / (PW / 2), -.9, .9);
        b.vx = a * SP * .9; b.vy = -Math.sqrt(SP * SP - b.vx * b.vx); b.y = PY - 3;
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
          if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.abs(b.vx) * (dx < 0 ? -1 : 1); else b.vy = Math.abs(b.vy) * (dy < 0 ? -1 : 1);
          grid[i] = hp - 1;
          if (!grid[i]) { left--; score++; burst(parts, bx + BW / 2, by + BH / 2, HC[hp], 5, 45); if (Math.random() < .07 && caps.length < 2) caps.push({ x: bx + BW / 2, y: by }); }
          break scan;
        }
      }
      if (b.y > WH + 6) serve(b);
    }
    for (let i = caps.length - 1; i >= 0; i--) {
      const q = caps[i]; q.y += 70 * d;
      if (q.y + 4 >= PY && Math.abs(q.x - px) <= PW / 2 + 4 && q.y < PY + 8) { if (balls.length < 4) balls.push(serve({})); caps.splice(i, 1); }
      else if (q.y > WH) caps.splice(i, 1);
    }
    if (left < 12) { regen += d; if (regen > .6) { fill(); regen = 0; } }
    stepParts(parts, d);
  }
  addScene(canvas, {
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
      for (const b of balls) {
        for (let i = 0; i < b.trail.length; i += 2) { g.fillStyle = `rgba(221,238,255,${(i / b.trail.length * .35).toFixed(2)})`; g.fillRect(b.trail[i] - 1, b.trail[i + 1] - 1, 2, 2); }
        g.fillStyle = '#ddeeff'; g.beginPath(); g.arc(b.x, b.y, 2.8, 0, 7); g.fill();
      }
      for (const q of caps) { g.fillStyle = '#6f8'; g.fillRect(q.x - 6, q.y - 3, 12, 7); g.fillStyle = '#112'; g.font = `700 8px ${MONO}`; g.textAlign = 'center'; g.fillText('+3', q.x, q.y + 3); }
      g.fillStyle = '#66eeff'; g.fillRect(px - PW / 2, PY, PW, 5);
      drawParts(g, parts);
      g.fillStyle = '#8a93bd'; g.font = `700 10px ${MONO}`;
      g.textAlign = 'left'; g.fillText('BLOCOS ' + score, 8, 14);
      g.textAlign = 'right'; g.fillText('AUTO-PLAY', WW - 8, 14);
    }
  });
}

/* ---------- vitrine ---------- */
function planetCard(game, i) {
  const copy = COPY[game.id] || { kind: 'Jogo', desc: '' };
  const el = document.createElement('article');
  el.className = 'planet reveal' + (i % 2 ? ' rev' : '');
  el.dataset.id = game.id;
  el.style.setProperty('--c1', game.palette.primary);
  el.style.setProperty('--c2', game.palette.secondary);
  el.innerHTML = `
    <div class="planet-visual">
      <canvas class="planet-canvas" tabindex="0" role="img" aria-label="Planeta ${esc(game.code)} com o ET ${esc(ETS[game.et].name)}. Toque no ET para ele pular."></canvas>
      <div class="seal-slot" data-seal="locked" title="O selo EXPLORADO chega na próxima versão" aria-hidden="true">EXPLO<br>RADO</div>
    </div>
    <div class="planet-body">
      <div class="badges"><span class="code">${esc(game.code)}</span><span class="badge ok">DISPONÍVEL</span><span class="badge kind">${esc(copy.kind)}</span></div>
      <h3>${esc(game.name)}</h3>
      <p class="desc">${esc(copy.desc)}</p>
      <div class="demo-wrap"><canvas class="demo-canvas" role="img" aria-label="Mini-demo animada: ${esc(game.name)} jogando sozinho"></canvas><span class="demo-tag">DEMO</span></div>
      <div class="actions">
        <a class="btn primary" href="${esc(game.url)}" target="_blank" rel="noopener">Jogar agora</a>
        <button class="btn ghost" type="button" aria-expanded="false" aria-controls="qr-${esc(game.id)}">Ver QR Code</button>
      </div>
      <div class="drawer" id="qr-${esc(game.id)}"><div class="qr-frame"><img width="220" height="220" alt="QR Code do jogo ${esc(game.name)}" decoding="async"></div><p class="qr-hint">Aponte a câmera do celular para jogar.</p></div>
    </div>`;
  return el;
}

function soonCard(game) {
  const el = document.createElement('article');
  el.className = 'soon-card reveal';
  el.dataset.id = game.id;
  el.style.setProperty('--c1', game.palette.primary);
  el.innerHTML = `<canvas tabindex="0" role="img" aria-label="Planeta ${esc(game.code)} em construção. O ET ${esc(ETS[game.et].name)} está dormindo. Toque para acordar."></canvas>
    <span class="code">${esc(game.code)}</span><h4>${esc(game.name)}</h4><span class="tag-soon">${esc((game.label || 'Em breve').toUpperCase())}</span>`;
  return el;
}

function renderShowcase() {
  const vit = $('#vitrine');
  const active = GAMES.filter(g => g.status === 'active'), soon = GAMES.filter(g => g.status !== 'active');
  active.forEach((game, i) => {
    const card = planetCard(game, i);
    vit.appendChild(card);
    makePlanet($('.planet-canvas', card), game);
    if (game.demoType === '2048') make2048($('.demo-canvas', card));
    else if (game.demoType === 'firewall') makeFirewall($('.demo-canvas', card));
    const btn = $('button.ghost', card), drawer = $('.drawer', card), img = $('img', card);
    btn.addEventListener('click', () => {
      const open = !drawer.classList.contains('open');
      if (open && !img.getAttribute('src')) img.src = game.qr;
      drawer.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Fechar QR Code' : 'Ver QR Code';
      sound('ui');
    });
  });
  if (soon.length) {
    const head = document.createElement('p');
    head.className = 'radar-head';
    head.textContent = '// SINAIS NO RADAR';
    const cons = document.createElement('div');
    cons.className = 'constellation';
    soon.forEach(game => { const c = soonCard(game); cons.appendChild(c); makePlanet($('canvas', c), game); });
    vit.append(head, cons);
  }
}

/* ---------- bastidores / raio-x ---------- */
function setupBackstage() {
  const row = $('#et-row');
  ETS.forEach(et => {
    const c = document.createElement('canvas');
    c.width = 36; c.height = 36; c.title = et.name;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    drawET(g, et, 18, 32, 4);
    row.appendChild(c);
  });
  const g2048 = GAMES.find(g => g.demoType === '2048');
  const payload = g2048 && g2048.url ? g2048.url.split('#')[1] || '' : '';
  const size = payload.length, photo = 2000000;
  if (size) {
    $('#xr-code').textContent = (size / 1000).toFixed(1).replace('.', ',') + ' KB';
    $('#xr-count').textContent = size.toLocaleString('pt-BR');
    $('#xr-ratio').textContent = '≈ ' + Math.round(photo / size).toLocaleString('pt-BR') + '× menor';
    $('#xr-bar').style.width = `max(3px, ${(size / photo * 100).toFixed(3)}%)`;
    $('#xr-text').textContent = payload;
  }
  const btn = $('#xr-btn'), box = $('#xray');
  btn.addEventListener('click', () => {
    const open = !box.classList.contains('open');
    box.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Esconder o texto' : 'Revelar o texto comprimido';
    if (open) sound('scan');
  });
}

/* ---------- interface geral ---------- */
function setupUI() {
  const go = el => el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  $('#scroll-btn').addEventListener('click', e => { e.preventDefault(); sound('ui'); go($('#planetas')); });
  $('#to-top').addEventListener('click', () => { sound('ui'); go($('#topo')); });
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { threshold: .12 });
    items.forEach(el => rio.observe(el));
  } else items.forEach(el => el.classList.add('in'));
}

function boot() {
  const active = GAMES.filter(g => g.status === 'active').length;
  $('#stat-active').textContent = `${active} / ${GAMES.length}`;
  makeStars($('#stars'));
  makeEmblem($('#emblem'));
  renderShowcase();
  setupBackstage();
  setupUI();
  requestAnimationFrame(frame);
}
boot();
