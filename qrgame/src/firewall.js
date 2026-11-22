// QR Game #02 - Firewall Break (fonte legivel; o pack.py minifica e renomeia).
// Estruturas curtas: bolinha [x, y, vx, vy, tipo, ate]; capsula [x, y, tipo]; faisca [x, y, vx, vy, vida].
const { loop, txt, note, save, load, pal, rect, line, clamp } = QRG;
const { min, max, abs, sin, cos, sqrt, atan2, random, log2 } = Math;
const COLUNAS = 32, LINHAS = 46, PASSO = 11, TOPO = 64;
const LARGURA = 360, ALTURA = 640, BARRA_Y = 580, VEL = 240;
const COR_BLOCO = [0, 5, 2, 3, 9, 4, 1];
const COR_CAPSULA = [4, 3, 2, 5, 4, 1];
const ROTULO = ['+3', '+30', '2X', 'W', 'S', 'P'];
const DURACAO = [12, 14, 14, 10];

let ctx, blocos, bolinhas, capsulas, faiscas, pontuacao, onda, fila, modo;
let barraX, angulo, alvo, arrastando, tempo, tremor, bonus, ultimoSom, proximoTiro, buff;
let relogio = 0, acum = 0;
let recorde = +load('best') || 0;

const sortear = n => random() * n | 0;
const largura = () => tempo < buff[1] ? 150 : 90;
const mira = () => clamp(atan2(alvo[0] - barraX, max(45, BARRA_Y - alvo[1])), -1.2, 1.2);

function limpar() {
  bolinhas = [];
  capsulas = [];
  fila = modo = arrastando = bonus = proximoTiro = 0;
  buff = [0, 0, 0, 0];
}

// Onda aleatoria: ~70% dos microblocos, resistencia sobe com a onda, 3 colunas vazias viram tuneis.
function formacao() {
  blocos = new Uint8Array(COLUNAS * LINHAS);
  const tuneis = [sortear(COLUNAS), sortear(COLUNAS), sortear(COLUNAS)];
  for (let i = 0; i < 14 * COLUNAS; i++) {
    if (random() < .7 && !tuneis.includes(i % COLUNAS)) blocos[i] = 1 + sortear(3) + min(3, (onda - 1) / 3 | 0);
  }
}

function reiniciar() {
  limpar();
  pontuacao = tempo = angulo = tremor = ultimoSom = acum = 0;
  onda = 1;
  barraX = 180;
  alvo = [180, 420];
  faiscas = [];
  formacao();
}

function som(freq) {
  if (tempo < ultimoSom) return;
  ultimoSom = tempo + .06;
  note(12 * log2(freq / 440), .07, 'sine', .025);
}

function adicionar(n, tipo = 0) {
  const normais = bolinhas.filter(b => b[4] != 2).length + fila;
  const espaco = tipo == 2
    ? min(30 - (bolinhas.length + fila - normais), 80 - bolinhas.length - fila)
    : min(50 - normais, (relogio < bonus ? 80 : 50) - bolinhas.length - fila);
  if (espaco <= 0 && tipo == 1) {
    for (const b of bolinhas) if (b[4] == 1) b[5] = relogio + 20;
    return;
  }
  for (let j = 0; j < min(n, espaco); j++) {
    const a = tipo ? (random() - .5) * 2 : angulo;
    bolinhas.push([barraX, BARRA_Y - 4, sin(a) * VEL, -cos(a) * VEL, tipo, tipo ? relogio + (tipo == 2 ? 10 : 20) : Infinity]);
  }
}

function fimDeRodada() {
  limpar();
  const proximo = new Uint8Array(COLUNAS * LINHAS);
  for (let i = 0; i < blocos.length; i++) {
    if (!blocos[i]) continue;
    if (TOPO + ((i / COLUNAS | 0) + 2) * PASSO + 10 >= BARRA_Y) { modo = 2; return; }
    proximo[i + 2 * COLUNAS] = blocos[i];
  }
  blocos = proximo;
}

function mover(v) {
  barraX = clamp(v, largura() / 2, LARGURA - largura() / 2);
}

function atualizar(d) {
  tempo += d;
  tremor *= .92;
  mover(barraX);
  if (modo == 1) {
    bolinhas = bolinhas.filter(b => relogio < b[5]);
    if (fila && tempo > proximoTiro) { fila--; adicionar(1); proximoTiro = tempo + .025; }
    for (const b of bolinhas) {
      const [xAntigo, yAntigo] = b, w = largura();
      b[0] += b[2] * d;
      b[1] += b[3] * d;
      if (b[0] < 2 || b[0] > 358) { b[0] = clamp(b[0], 2, 358); b[2] = -b[2]; }
      if (b[1] < TOPO) { b[1] = TOPO; b[3] = abs(b[3]); }
      // Rebote na barra: o angulo depende de onde a bolinha bate.
      if (b[3] > 0 && yAntigo <= BARRA_Y + 6 && b[1] >= BARRA_Y - 2 && b[1] <= BARRA_Y + 9 && abs(b[0] - barraX) <= w * .625 + 2) {
        b[1] = BARRA_Y - 2;
        b[2] = clamp((b[0] - barraX) / (w * .625), -.9, .9) * VEL * .9;
        b[3] = -sqrt(VEL * VEL - b[2] * b[2]);
      }
      if (b[1] > 612 && tempo < buff[2]) { b[1] = 612; b[3] = -abs(b[3]); }
      const col = (b[0] - 4) / PASSO | 0, lin = (b[1] - TOPO) / PASSO | 0;
      achou: for (let r = max(0, lin - 1); r <= min(LINHAS - 1, lin + 1); r++) {
        for (let j = max(0, col - 1); j <= min(COLUNAS - 1, col + 1); j++) {
          const i = r * COLUNAS + j;
          if (!blocos[i]) continue;
          const bx = 4 + j * PASSO, by = TOPO + r * PASSO;
          if (b[0] + 2 < bx || b[0] - 2 > bx + 10 || b[1] + 2 < by || b[1] - 2 > by + 10) continue;
          const dano = tempo < buff[0] ? 2 : 1, morto = blocos[i] <= dano;
          blocos[i] = morto ? 0 : blocos[i] - dano;
          if (morto) {
            for (let s = 0; s < 3; s++) {
              const a = random() * 7;
              faiscas.push([bx + 5, by + 5, cos(a) * 65, sin(a) * 65, .25]);
            }
            faiscas.splice(0, faiscas.length - 240);
            tremor = min(3, tremor + .2);
            som(400 + (pontuacao += 1) % 10 * 40);
            if (capsulas.length < 2 && random() < .06) capsulas.push([bx + 5, by + 5, random() < .6 ? 0 : 1 + sortear(5)]);
            if (pontuacao > recorde) save('best', recorde = pontuacao);
          }
          if (!(morto && tempo < buff[3])) {
            if (xAntigo + 2 <= bx || xAntigo - 2 >= bx + 10) { b[0] = xAntigo; b[2] = -b[2]; }
            else { b[1] = yAntigo; b[3] = -b[3]; }
          }
          break achou;
        }
      }
      if (abs(b[3]) < VEL * .3) {
        b[3] = (b[3] < 0 ? -1 : 1) * VEL * .3;
        b[2] = (b[2] < 0 ? -1 : 1) * sqrt(VEL * VEL - b[3] * b[3]);
      }
    }
    bolinhas = bolinhas.filter(b => b[1] < 650 && relogio < b[5]);
    if (!blocos.some(v => v)) { onda++; formacao(); }
    for (const q of capsulas) {
      const yAntigo = q[1], k = q[2];
      q[1] += 125 * d;
      if (yAntigo < BARRA_Y + 7 && q[1] >= BARRA_Y - 7 && abs(q[0] - barraX) < largura() / 2 + 11) {
        if (k > 1) buff[k - 2] = tempo + DURACAO[k - 2];
        else {
          if (k) { bonus = relogio + 10; for (const b of bolinhas) if (b[4] == 2) b[5] = bonus; }
          adicionar(k ? 30 : 3, k ? 2 : 1);
        }
        q[1] = 999;
        som(800);
      }
    }
    capsulas = capsulas.filter(q => q[1] < 650);
    if (!bolinhas.length && !fila) fimDeRodada();
  }
  for (const q of faiscas) { q[0] += q[2] * d; q[1] += q[3] * d; q[4] -= d; }
  faiscas = faiscas.filter(q => q[4] > 0);
}

// Entrada: QRG.p vem em pixels da tela; converte para o campo 360x640.
function entrada(k, ox, oy) {
  const p = QRG.p, qx = (p.x - ox) / k, qy = (p.y - oy) / k;
  if (p.justPressed) {
    if (modo == 2) reiniciar();
    else if (modo == 1 && qx > 310 && qy < 60) fimDeRodada();
    else { arrastando = 1; mover(qx); alvo = [barraX, 420]; }
  } else if (arrastando && p.down) {
    if (modo) mover(qx); else alvo = [qx, qy];
  }
  if (p.justReleased && arrastando) {
    arrastando = 0;
    if (!modo) { angulo = mira(); fila = 10; modo = 1; som(300); }
  }
}

function desenhar(w, h, k, ox, oy) {
  rect(0, 0, w, h, 0);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, LARGURA, ALTURA);
  ctx.clip();
  ctx.translate((random() - .5) * tremor, (random() - .5) * tremor);

  txt('*' + onda + '  ' + pontuacao, 7, 16, 2, 1);
  txt('10/' + (bolinhas.length + fila), 7, 37, 2, 1);
  txt('@trophy ' + recorde, 210, 18, 2, 2);
  txt(ROTULO.slice(2).filter((_, i) => tempo < buff[i]).join(' '), 150, 37, 2, 2);
  if (modo == 1) txt('@play@play', 320, 19, 2, 6);

  blocos.forEach((v, i) => v && rect(4 + i % COLUNAS * PASSO, TOPO + (i / COLUNAS | 0) * PASSO, 10, 10, COR_BLOCO[min(v, 6)]));

  for (let tipo = 0; tipo < 3; tipo++) {
    ctx.fillStyle = pal[[tempo < buff[0] ? 2 : 1, 4, 3][tipo]];
    ctx.beginPath();
    for (const b of bolinhas) {
      if (b[4] == tipo) { ctx.moveTo(b[0] + 1.8, b[1]); ctx.arc(b[0], b[1], 1.8, 0, 7); }
    }
    ctx.fill();
  }

  rect(barraX - largura() / 2, BARRA_Y, largura(), 6, 5);
  if (tempo < buff[2]) line(0, 614, LARGURA, 614, 4);

  for (const q of capsulas) {
    const rotulo = ROTULO[q[2]], longo = rotulo.length > 2;
    rect(q[0] - 11, q[1] - 7, 22, 14, COR_CAPSULA[q[2]]);
    txt(rotulo, q[0], q[1] - (longo ? 2 : 5), longo ? 1 : 2, 0, 'c');
  }

  for (const q of faiscas) {
    ctx.globalAlpha = max(0, q[4] * 4);
    rect(q[0], q[1], 2, 2, 5);
  }
  ctx.globalAlpha = 1;

  if (!modo) {
    const a = arrastando ? mira() : 0;
    ctx.globalAlpha = .5;
    ctx.setLineDash([3, 5]);
    line(barraX, BARRA_Y, barraX + sin(a) * 120, BARRA_Y - cos(a) * 120, 1);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (modo == 2) {
    ctx.globalAlpha = .8;
    rect(0, TOPO, LARGURA, 576, 0);
    ctx.globalAlpha = 1;
    txt('@retry', 180, 315, 10, 1, 'c');
  }
  ctx.restore();
}

reiniciar();
loop(dt => {
  relogio += dt;
  acum += dt;
  ctx = QRG.x;
  const w = QRG.w, h = QRG.h;
  const k = min(w / LARGURA, h * .95 / ALTURA);
  const ox = (w - LARGURA * k) / 2, oy = (h - ALTURA * k) / 2;
  entrada(k, ox, oy);
  while (acum >= 1 / 120) { atualizar(1 / 120); acum -= 1 / 120; }
  desenhar(w, h, k, ox, oy);
});
