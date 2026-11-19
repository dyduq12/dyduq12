// Sprites pixel art 8x8 dos 7 ETs (recuperados da versao "Slimes Cosmicos").
// Legenda: '#' pixel do corpo, 'h' brilho (corpo + overlay branco translucido), '.' vazio.
// eyes: [coluna, linha] dos dois olhos escuros 1x1. A matriz ja esta espelhada.
export const ET_SIZE = 8;
export const ET_PALETTE = ['#bd71ff', '#65e58e', '#55d9ed', '#ff974a', '#639cff', '#df70f9', '#ffd35c'];
export const ETS = [
  {id:0,name:'Gotinha Roxa',color:'#bd71ff',rows:['........','...##...','..####..','.h#####.','########','########','.######.','..####..'],eyes:[[2,4],[5,4]]},
  {id:1,name:'Slime Verde',color:'#65e58e',rows:['........','........','..####..','.h#####.','########','########','########','.##..##.'],eyes:[[2,4],[5,4]]},
  {id:2,name:'Cogumelo Ciano',color:'#55d9ed',rows:['..####..','.h#####.','hh######','hh######','...##...','..####..','..####..','...##...'],eyes:[[2,3],[5,3]]},
  {id:3,name:'Chama Laranja',color:'#ff974a',rows:['...##...','...##...','..####..','h.####.#','########','########','.######.','..####..'],eyes:[[2,4],[5,4]]},
  {id:4,name:'Cristal Azul',color:'#639cff',rows:['...##...','..####..','.h#####.','hh######','########','.######.','..####..','...##...'],eyes:[[2,4],[5,4]]},
  {id:5,name:'Caveira Neon',color:'#df70f9',rows:['..####..','.h#####.','hh######','hh######','##.##.##','.######.','..####..','..#..#..'],eyes:[[2,4],[5,4]]},
  {id:6,name:'Estrela Dourada',color:'#ffd35c',rows:['...##...','h..##..#','hh######','.h#####.','########','.######.','#..##..#','...##...'],eyes:[[2,4],[5,4]]}
];

let ac;
function audio() {
  if (!ac) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(a, { f = 440, to = f, d = .1, type = 'square', v = .05, at = 0 }) {
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + d + .02);
}
const SOUNDS = {
  jump: [{ f: 220, to: 660, d: .14 }],
  turbo: [{ f: 330, type: 'sawtooth', d: .06 }, { f: 440, type: 'sawtooth', d: .06, at: .06 }, { f: 660, type: 'sawtooth', d: .06, at: .12 }, { f: 990, to: 1320, type: 'sawtooth', d: .18, at: .18 }],
  ui: [{ f: 520, type: 'triangle', d: .05 }, { f: 780, type: 'triangle', d: .08, at: .05 }],
  scan: [{ f: 300, to: 1400, type: 'sine', d: .22, v: .04 }, { f: 1400, to: 300, type: 'sine', d: .22, v: .04, at: .22 }]
};
// type: 'jump' | 'turbo' | 'ui' | 'scan'. Deve ser chamada apos um gesto do usuario.
export function playRetroSound(type) {
  try {
    const a = audio(), s = SOUNDS[type];
    if (!a || !s) return false;
    s.forEach(n => tone(a, n));
    return true;
  } catch {
    return false;
  }
}
