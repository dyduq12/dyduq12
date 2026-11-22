// QR Game #03 - Neon Drift (Planeta Hadron, habitante Gluon). Fonte legivel; o pack.py minifica e renomeia.
// Pista: lista de pecas, cada uma = reta + curva circular em torno de um pino. O rumo fica sempre entre -150 e -30 graus.
const { loop, txt, note, save, load, pal, rect, line, clamp } = QRG;
const { min, max, abs, sin, cos, atan2, hypot, random, PI } = Math;
const GRAU = PI / 180, VOLTA = 2 * PI;
const HW = 34, RAIO = 90, ALCANCE = 120, PASSO = 1 / 120;

let ctx, pecas, nave, rastro, pinoAtivo, pinoSolto, pinoAncorado, ancorado, sentido, raio, angulo;
let pontaX, pontaY, pontaRumo, ultimoSinal, semente, modo, pontuacao, tempoMorto, passos, aviso, acum = 0;
let recorde = +load('best') || 0;

const sorteio = () => (semente = (semente * 1664525 + 1013904223) >>> 0) / 4294967296;
const rumoValido = r => r > -150.1 * GRAU && r < -29.9 * GRAU;
const angulos = (a, b) => abs(atan2(sin(a - b), cos(a - b)));

function pontuar(n) {
  pontuacao += n;
  if (pontuacao > recorde) save('best', recorde = pontuacao);
}

// Cada peca: reta (x0,y0)->(x1,y1) e curva de centro (cx,cy) que termina em (sx,sy) com rumo sRumo.
function gerarPeca() {
  const comp = 130 + sorteio() * 70 | 0;
  const x1 = pontaX + cos(pontaRumo) * comp, y1 = pontaY + sin(pontaRumo) * comp;
  let sinal = -ultimoSinal, curva = (sorteio() < .5 ? 60 : 90) * GRAU;
  if (!rumoValido(pontaRumo + sinal * curva)) curva = 60 * GRAU;
  if (!rumoValido(pontaRumo + sinal * curva)) sinal = -sinal;
  const giro = sinal * curva, ang0 = pontaRumo - sinal * PI / 2;
  const cx = x1 + RAIO * cos(pontaRumo + sinal * PI / 2), cy = y1 + RAIO * sin(pontaRumo + sinal * PI / 2);
  const sx = cx + RAIO * cos(ang0 + giro), sy = cy + RAIO * sin(ang0 + giro);
  pecas.push({ x0: pontaX, y0: pontaY, rumo: pontaRumo, comp: comp, x1: x1, y1: y1, cx: cx, cy: cy, ang0: ang0, giro: giro, sx: sx, sy: sy, sRumo: pontaRumo + giro });
  pontaX = sx;
  pontaY = sy;
  pontaRumo += giro;
  ultimoSinal = sinal;
}

function reiniciar() {
  semente = Date.now() >>> 0;
  pecas = [];
  rastro = [];
  pontaX = pontaY = 0;
  pontaRumo = -PI / 2;
  ultimoSinal = 1;
  nave = { posX: 0, posY: 0, rumo: -PI / 2 };
  pinoAtivo = pontuacao = passos = tempoMorto = aviso = 0;
  pinoSolto = pinoAncorado = -1;
  ancorado = false;
  modo = 0;
  while (pecas.length < 10) gerarPeca();
}

function distanciaDaPista(x, y) {
  let menor = 1e9;
  for (let i = max(0, pinoAtivo - 1); i <= pinoAtivo + 1; i++) {
    const c = pecas[i];
    const u = clamp((x - c.x0) * cos(c.rumo) + (y - c.y0) * sin(c.rumo), 0, c.comp);
    menor = min(menor, hypot(x - c.x0 - u * cos(c.rumo), y - c.y0 - u * sin(c.rumo)));
    const sinal = c.giro < 0 ? -1 : 1;
    const rel = (((atan2(y - c.cy, x - c.cx) - c.ang0) * sinal) % VOLTA + VOLTA) % VOLTA;
    if (rel <= abs(c.giro)) menor = min(menor, abs(hypot(x - c.cx, y - c.cy) - RAIO));
    else menor = min(menor, hypot(x - c.x1, y - c.y1), hypot(x - c.sx, y - c.sy));
  }
  return menor;
}

function ancorar() {
  const pino = pecas[pinoAtivo];
  const produto = cos(nave.rumo) * (pino.cy - nave.posY) - sin(nave.rumo) * (pino.cx - nave.posX);
  sentido = produto < 0 ? -1 : 1;
  raio = max(20, hypot(nave.posX - pino.cx, nave.posY - pino.cy));
  angulo = atan2(nave.posY - pino.cy, nave.posX - pino.cx);
  pinoAncorado = pinoAtivo;
  ancorado = true;
  note(0, .05, 'sine', .05);
}

// Solta o pino mantendo a tangente; alinhado com a saida da curva = Drift Perfeito.
function soltar() {
  ancorado = false;
  pinoSolto = pinoAncorado;
  if (angulos(nave.rumo, pecas[pinoSolto].sRumo) < .25) {
    pontuar(2);
    aviso = 1;
    note(19, .15, 'triangle', .07);
    note(24, .3, 'triangle', .05);
  }
}

function fimDeJogo() {
  modo = 2;
  ancorado = false;
  note(-28, .5, 'sawtooth', .12);
}

function atualizar(dt) {
  if (modo == 2) tempoMorto += dt;
  if (modo != 1) return;
  aviso = max(0, aviso - dt);
  const v = 180 + min(pontuacao, 60) * 2.5;
  if (ancorado) {
    const pino = pecas[pinoAncorado];
    angulo += sentido * v / raio * dt;
    nave.posX = pino.cx + raio * cos(angulo);
    nave.posY = pino.cy + raio * sin(angulo);
    nave.rumo = angulo + sentido * PI / 2;
    if (!QRG.p.down) soltar();
  } else {
    nave.posX += cos(nave.rumo) * v * dt;
    nave.posY += sin(nave.rumo) * v * dt;
    const pino = pecas[pinoAtivo];
    if (QRG.p.down && pinoAtivo != pinoSolto && hypot(nave.posX - pino.cx, nave.posY - pino.cy) <= ALCANCE) ancorar();
  }
  const saida = pecas[pinoAtivo];
  if ((nave.posX - saida.sx) * cos(saida.sRumo) + (nave.posY - saida.sy) * sin(saida.sRumo) > 0) {
    pinoAtivo++;
    pontuar(1);
    note(pontuacao % 8 * 2, .05, 'sine', .04);
    while (pecas.length < pinoAtivo + 10) gerarPeca();
  }
  if (++passos % 3 == 0) {
    rastro.push([nave.posX, nave.posY]);
    if (rastro.length > 24) rastro.shift();
  }
  if (distanciaDaPista(nave.posX, nave.posY) > HW) fimDeJogo();
}

function desenhar(w, h) {
  rect(0, 0, w, h, 0);
  ctx.save();
  ctx.translate(w / 2 - nave.posX, h * .68 - nave.posY);
  const inicio = max(0, pinoAtivo - 2), fim = pinoAtivo + 7;
  ctx.strokeStyle = pal[5];
  ctx.beginPath();
  for (let i = inicio; i <= fim; i++) {
    const c = pecas[i], nx = -sin(c.rumo) * HW, ny = cos(c.rumo) * HW;
    ctx.moveTo(c.x0 + nx, c.y0 + ny);
    ctx.lineTo(c.x1 + nx, c.y1 + ny);
    ctx.moveTo(c.x0 - nx, c.y0 - ny);
    ctx.lineTo(c.x1 - nx, c.y1 - ny);
    for (const r of [RAIO - HW, RAIO + HW]) {
      ctx.moveTo(c.cx + r * cos(c.ang0), c.cy + r * sin(c.ang0));
      ctx.arc(c.cx, c.cy, r, c.ang0, c.ang0 + c.giro, c.giro < 0);
    }
  }
  ctx.globalAlpha = .25;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = inicio; i <= fim; i++) rect(pecas[i].cx - 3, pecas[i].cy - 3, 6, 6, i == pinoAtivo ? 2 : 6);

  const alvo = pecas[pinoAtivo];
  if (modo == 1 && !ancorado) {
    ctx.globalAlpha = .3;
    ctx.strokeStyle = pal[2];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(alvo.cx, alvo.cy, ALCANCE, 0, VOLTA);
    ctx.stroke();
  }
  rastro.forEach((q, i) => {
    const s = rastro[i + 1] || [nave.posX, nave.posY];
    ctx.globalAlpha = (i + 1) / (rastro.length + 1);
    line(q[0], q[1], s[0], s[1], 4, 3);
  });
  if (ancorado) {
    const pino = pecas[pinoAncorado];
    ctx.globalAlpha = .3;
    line(nave.posX, nave.posY, pino.cx, pino.cy, 4, 7);
    ctx.globalAlpha = 1;
    line(nave.posX, nave.posY, pino.cx, pino.cy, 4, 2);
  }
  ctx.globalAlpha = 1;
  ctx.translate(nave.posX, nave.posY);
  ctx.rotate(nave.rumo);
  ctx.fillStyle = pal[modo == 2 ? 3 : 1];
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, 5);
  ctx.lineTo(-6, -5);
  ctx.fill();
  ctx.restore();

  txt(pontuacao, 12, 12, 4, 1);
  txt('@trophy ' + recorde, w - 12, 14, 2, 2, 'r');
  if (aviso > 0) txt('PERFEITO +2', w / 2, h * .3, 3, 4, 'c');
  if (modo == 0) {
    txt('SEGURE PARA DRIFT', w / 2, h * .86, 2, 2, 'c');
    txt('TOQUE PARA INICIAR', w / 2, h * .91, 1, 6, 'c');
  }
  if (modo == 2) {
    txt('GAME OVER', w / 2, h * .3, 5, 3, 'c');
    txt('@retry', w / 2, h * .45, 6, 1, 'c');
  }
}

reiniciar();
loop(dt => {
  const toque = QRG.p;
  ctx = QRG.x;
  if (modo == 0 && toque.justPressed) modo = 1;
  else if (modo == 2 && toque.justPressed && tempoMorto > .35) { reiniciar(); modo = 1; }
  acum += dt;
  while (acum >= PASSO) { atualizar(PASSO); acum -= PASSO; }
  desenhar(QRG.w, QRG.h);
});
