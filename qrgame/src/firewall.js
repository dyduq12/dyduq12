// QR Game #02 - Firewall Break (fonte legivel; o pack.py minifica e renomeia).
// Usa a placa-mae QRG: canvas, entrada, loop, texto bitmap, som e save.
const COLUNAS = 32, LINHAS = 46, PASSO = 11, TOPO = 64;
const LARGURA = 360, ALTURA = 640, BARRA_Y = 580, VEL = 240;
const COR_BLOCO = [0, 5, 2, 3, 9, 4, 1];
const COR_CAPSULA = [4, 3, 2, 5, 4, 1];
const ROTULO = ['+3', '+30', '2X', 'W', 'S', 'P'];

let blocos, bolinhas, capsulas, faiscas, pontuacao, onda, fila, modo;
let barraX, deX, tempoMov, angulo, alvo, arrastando, tempo, tremor;
let tempoDobro, tempoLarga, tempoEscudo, tempoPerfura, bonus;
let ultimoSom, proximoTiro, restantes;
let relogio = 0, acum = 0;
let recorde = +QRG.load('best') || 0;

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

function limpar() {
  bolinhas = [];
  capsulas = [];
  fila = 0;
  modo = 0;
  arrastando = 0;
  tempoDobro = tempoLarga = tempoEscudo = tempoPerfura = bonus = 0;
  proximoTiro = 0;
}

function formacao() {
  blocos = new Uint8Array(COLUNAS * LINHAS);
  const sorteio = [], forma = (onda - 1) % 5, n = 280 + (Math.random() * 41 | 0);
  for (let r = 0; r < 14; r++) {
    for (let j = 0; j < COLUNAS; j++) {
      const d = Math.abs(j - 15.5);
      const v = [0, r * 1.2 - d, (r + j) % 2 * 8, -(j % 6 < 2) * 9, -Math.abs(r - d * .65)][forma];
      sorteio.push([r * COLUNAS + j, v + Math.random() * 5]);
    }
  }
  sorteio.sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < n; i++) {
    blocos[sorteio[i][0]] = 1 + (Math.random() * 3 | 0) + Math.min(3, (onda - 1) / 3 | 0);
  }
  restantes = n;
}

function reiniciar() {
  limpar();
  pontuacao = 0;
  onda = 1;
  barraX = deX = 180;
  tempoMov = -1;
  tempo = 0;
  angulo = 0;
  alvo = [180, 420];
  ultimoSom = 0;
  tremor = 0;
  faiscas = [];
  acum = 0;
  formacao();
}

function som(freq) {
  if (tempo < ultimoSom) return;
  ultimoSom = tempo + .06;
  QRG.note(12 * Math.log2(freq / 440), .07, 'sine', .025);
}

function largura() {
  return tempo < tempoLarga ? 150 : 90;
}

function adicionar(n, tipo = 0) {
  const normais = bolinhas.filter(b => b.k != 2).length + fila;
  const extras = bolinhas.length + fila - normais;
  const espaco = tipo == 2
    ? Math.min(30 - extras, 80 - bolinhas.length - fila)
    : Math.min(50 - normais, (relogio < bonus ? 80 : 50) - bolinhas.length - fila);
  if (espaco <= 0 && tipo == 1) {
    for (const b of bolinhas) if (b.k == 1) b.ate = relogio + 20;
    return;
  }
  for (let j = 0; j < Math.min(n, espaco); j++) {
    const a = tipo ? (Math.random() - .5) * 2 : angulo;
    bolinhas.push({
      x: barraX, y: BARRA_Y - 4, vx: Math.sin(a) * VEL, vy: -Math.cos(a) * VEL,
      k: tipo, ate: tipo ? relogio + (tipo == 2 ? 10 : 20) : Infinity, m: 0
    });
  }
}

function fimDeRodada() {
  limpar();
  const proximo = new Uint8Array(COLUNAS * LINHAS);
  for (let i = 0; i < blocos.length; i++) {
    if (!blocos[i]) continue;
    const y = TOPO + ((i / COLUNAS | 0) + 2) * PASSO;
    if (y + 10 >= BARRA_Y) { modo = 2; return; }
    proximo[i + 2 * COLUNAS] = blocos[i];
  }
  blocos = proximo;
}

function mover(v) {
  const q = limitar(v, largura() / 2, LARGURA - largura() / 2);
  if (q != barraX) { deX = barraX; barraX = q; tempoMov = relogio; }
}

function faisca(x, y) {
  for (let j = 0; j < 3; j++) {
    const a = Math.random() * 7;
    faiscas.push({ x, y, vx: Math.cos(a) * 65, vy: Math.sin(a) * 65, l: .25 });
  }
  if (faiscas.length > 240) faiscas.splice(0, faiscas.length - 240);
}

// Ajuda sutil perto da barra e rebote com a formula original.
function ajudaBarra(b, d, yAntigo) {
  const w = largura(), dx = barraX - b.x;
  if (b.vy > 0 && b.y > ALTURA * .65 && b.y < BARRA_Y + 6 && Math.abs(dx) < w * 1.4) {
    const fundo = limitar((b.y - ALTURA * .65) / (BARRA_Y - ALTURA * .65), 0, 1);
    const perto = 1 - Math.abs(dx) / (w * 1.4);
    const n = Math.min(24 * d * fundo * perto * Math.min(1, Math.abs(dx) / 12), Math.max(0, 10 - (b.m || 0)));
    const v = Math.hypot(b.vx, b.vy);
    b.vx += Math.sign(dx) * n;
    b.m = (b.m || 0) + n;
    const escala = v / Math.hypot(b.vx, b.vy);
    b.vx *= escala;
    b.vy *= escala;
  }
  const indo = relogio - tempoMov < .09 && (barraX - deX) * (b.x - deX) > 0;
  const alcance = w * .625 + 2 + (indo ? Math.min(6, Math.abs(barraX - deX)) : 0);
  if (b.vy > 0 && yAntigo <= BARRA_Y + 6 && b.y >= BARRA_Y - 2 && b.y <= BARRA_Y + 9 && Math.abs(b.x - barraX) <= alcance) {
    b.y = BARRA_Y - 2;
    const a = limitar((b.x - barraX) / (w * .625), -.9, .9);
    b.vx = a * VEL * .9;
    b.vy = -Math.sqrt(VEL * VEL - b.vx * b.vx);
    b.m = 0;
  }
}

function atualizar(d) {
  tempo += d;
  tremor *= .92;
  barraX = limitar(barraX, largura() / 2, LARGURA - largura() / 2);
  if (modo == 1) {
    bolinhas = bolinhas.filter(b => relogio < b.ate);
    if (fila && tempo > proximoTiro) { fila--; adicionar(1); proximoTiro = tempo + .025; }
    for (const b of bolinhas) {
      const xAntigo = b.x, yAntigo = b.y;
      b.x += b.vx * d;
      b.y += b.vy * d;
      if (b.x < 2 || b.x > 358) { b.x = limitar(b.x, 2, 358); b.vx = -b.vx; }
      if (b.y < TOPO) { b.y = TOPO; b.vy = Math.abs(b.vy); }
      ajudaBarra(b, d, yAntigo);
      if (b.y > 612 && tempo < tempoEscudo) { b.y = 612; b.vy = -Math.abs(b.vy); b.m = 0; }
      const col = (b.x - 4) / PASSO | 0, lin = (b.y - TOPO) / PASSO | 0;
      let bateu = 0;
      for (let r = Math.max(0, lin - 1); r <= Math.min(LINHAS - 1, lin + 1) && !bateu; r++) {
        for (let j = Math.max(0, col - 1); j <= Math.min(COLUNAS - 1, col + 1); j++) {
          const i = r * COLUNAS + j;
          if (!blocos[i]) continue;
          const bx = 4 + j * PASSO, by = TOPO + r * PASSO;
          if (b.x + 2 < bx || b.x - 2 > bx + 10 || b.y + 2 < by || b.y - 2 > by + 10) continue;
          const dano = tempo < tempoDobro ? 2 : 1, morto = blocos[i] <= dano;
          blocos[i] = morto ? 0 : blocos[i] - dano;
          if (morto) {
            restantes--;
            pontuacao++;
            faisca(bx + 5, by + 5);
            tremor = Math.min(3, tremor + .2);
            som(400 + pontuacao % 10 * 40);
            if (capsulas.length < 2 && Math.random() < .06) {
              capsulas.push({ x: bx + 5, y: by + 5, k: Math.random() < .6 ? 0 : 1 + (Math.random() * 5 | 0) });
            }
            if (pontuacao > recorde) { recorde = pontuacao; QRG.save('best', recorde); }
          }
          if (!(morto && tempo < tempoPerfura)) {
            if (xAntigo + 2 <= bx || xAntigo - 2 >= bx + 10) { b.x = xAntigo; b.vx = -b.vx; }
            else { b.y = yAntigo; b.vy = -b.vy; }
          }
          bateu = 1;
          break;
        }
      }
      if (Math.abs(b.vy) < VEL * .3) {
        b.vy = (b.vy < 0 ? -1 : 1) * VEL * .3;
        b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(VEL * VEL - b.vy * b.vy);
      }
    }
    bolinhas = bolinhas.filter(b => b.y < 650 && relogio < b.ate);
    if (restantes == 0) { onda++; formacao(); }
    for (const q of capsulas) {
      const yAntigo = q.y;
      q.y += 125 * d;
      if (yAntigo < BARRA_Y + 7 && q.y >= BARRA_Y - 7 && Math.abs(q.x - barraX) < largura() / 2 + 11) {
        if (q.k == 0) adicionar(3, 1);
        if (q.k == 1) {
          bonus = relogio + 10;
          for (const b of bolinhas) if (b.k == 2) b.ate = bonus;
          adicionar(30, 2);
        }
        if (q.k == 2) tempoDobro = tempo + 12;
        if (q.k == 3) tempoLarga = tempo + 14;
        if (q.k == 4) tempoEscudo = tempo + 14;
        if (q.k == 5) tempoPerfura = tempo + 10;
        q.y = 999;
        som(800);
      }
    }
    capsulas = capsulas.filter(q => q.y < 650);
    if (!bolinhas.length && !fila) fimDeRodada();
  }
  for (const q of faiscas) { q.x += q.vx * d; q.y += q.vy * d; q.l -= d; }
  faiscas = faiscas.filter(q => q.l > 0);
}

// Entrada: QRG.p ja vem em pixels da tela; converte para o campo 360x640.
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
    if (!modo) {
      angulo = limitar(Math.atan2(alvo[0] - barraX, Math.max(45, BARRA_Y - alvo[1])), -1.2, 1.2);
      fila = 10;
      modo = 1;
      som(300);
    }
  }
}

function linha(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function desenhar(ctx, w, h, k, ox, oy) {
  const cor = QRG.pal;
  ctx.fillStyle = cor[0];
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, LARGURA, ALTURA);
  ctx.clip();
  ctx.translate((Math.random() - .5) * tremor, (Math.random() - .5) * tremor);

  QRG.txt('*' + onda + '  ' + pontuacao, 7, 16, 2, 1);
  QRG.txt('10/' + (bolinhas.length + fila), 7, 37, 2, 1);
  QRG.txt('@trophy ' + recorde, 210, 18, 2, 2);
  if (modo == 1) QRG.txt('@play@play', 320, 19, 2, 6);

  for (let i = 0; i < blocos.length; i++) {
    if (!blocos[i]) continue;
    ctx.fillStyle = cor[COR_BLOCO[Math.min(blocos[i], 6)]];
    ctx.fillRect(4 + i % COLUNAS * PASSO, TOPO + (i / COLUNAS | 0) * PASSO, 10, 10);
  }

  for (let k2 = 0; k2 < 3; k2++) {
    ctx.fillStyle = cor[k2 == 2 ? 3 : k2 == 1 ? 4 : tempo < tempoDobro ? 2 : 1];
    ctx.beginPath();
    for (const b of bolinhas) {
      if (b.k == k2) { ctx.moveTo(b.x + 1.8, b.y); ctx.arc(b.x, b.y, 1.8, 0, 7); }
    }
    ctx.fill();
  }

  ctx.fillStyle = cor[5];
  ctx.fillRect(barraX - largura() / 2, BARRA_Y, largura(), 6);
  if (tempo < tempoEscudo) { ctx.strokeStyle = cor[4]; linha(ctx, 0, 614, LARGURA, 614); }

  for (const q of capsulas) {
    ctx.fillStyle = cor[COR_CAPSULA[q.k]];
    ctx.fillRect(q.x - 11, q.y - 7, 22, 14);
    const rotulo = ROTULO[q.k], longo = rotulo.length > 2;
    QRG.txt(rotulo, q.x, q.y - (longo ? 2 : 5), longo ? 1 : 2, 0, 'c');
  }

  ctx.fillStyle = cor[5];
  for (const q of faiscas) {
    ctx.globalAlpha = Math.max(0, q.l * 4);
    ctx.fillRect(q.x, q.y, 2, 2);
  }
  ctx.globalAlpha = 1;

  if (!modo) {
    ctx.globalAlpha = .5;
    ctx.strokeStyle = cor[1];
    ctx.setLineDash([3, 5]);
    const a = arrastando ? limitar(Math.atan2(alvo[0] - barraX, Math.max(45, BARRA_Y - alvo[1])), -1.2, 1.2) : 0;
    linha(ctx, barraX, BARRA_Y, barraX + Math.sin(a) * 120, BARRA_Y - Math.cos(a) * 120);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  const ativos = (tempo < tempoDobro ? '2X ' : '') + (tempo < tempoLarga ? 'W ' : '') + (tempo < tempoEscudo ? 'S ' : '') + (tempo < tempoPerfura ? 'P' : '');
  QRG.txt(ativos, 150, 37, 2, 2);

  if (modo == 2) {
    ctx.globalAlpha = .8;
    ctx.fillStyle = cor[0];
    ctx.fillRect(0, TOPO, LARGURA, 576);
    ctx.globalAlpha = 1;
    QRG.txt('@retry', 180, 315, 10, 1, 'c');
  }
  ctx.restore();
}

reiniciar();
QRG.loop(dt => {
  relogio += dt;
  acum += dt;
  const w = QRG.w, h = QRG.h;
  const k = Math.min(w / LARGURA, h * .95 / ALTURA);
  const ox = (w - LARGURA * k) / 2, oy = (h - ALTURA * k) / 2;
  entrada(k, ox, oy);
  while (acum >= 1 / 120) { atualizar(1 / 120); acum -= 1 / 120; }
  desenhar(QRG.x, w, h, k, ox, oy);
});
