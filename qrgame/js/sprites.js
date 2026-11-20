// Sprites pixel art 8x8 dos 7 ETs (v0.2.0). Cada ET mora num planeta (campo planet) e num jogo (campo game).
// Legenda: '#' pixel do corpo, 'h' brilho (corpo + overlay branco translucido), '.' vazio.
// eyes: [coluna, linha] dos dois olhos 1x1 (cor ET_EYE). accent: cor de destaque do ET. A matriz ja esta espelhada.
export const ET_SIZE = 8;
export const ET_EYE = '#10131C';
export const ET_PALETTE = ['#FF4D4D', '#FF5A36', '#2EE59D', '#38BDF8', '#3B82F6', '#F4F1EA', '#FFD23F'];
export const ETS = [
  {id:0,name:'Redox',planet:'Kineton',game:'#01',color:'#FF4D4D',accent:'#FFD23F',rows:['........','...##...','..####..','.h#####.','########','########','.######.','..####..'],eyes:[[2,4],[5,4]]},
  {id:1,name:'Krakel',planet:'Tecton-IV',game:'#02',color:'#FF5A36',accent:'#FFD23F',rows:['...##...','...##...','..####..','h.####.#','########','########','.######.','..####..'],eyes:[[2,4],[5,4]]},
  {id:2,name:'Glúon',planet:'Hadrôn',game:'#03',color:'#2EE59D',accent:'#A6F7D3',rows:['........','........','..####..','.h#####.','########','########','########','.##..##.'],eyes:[[2,4],[5,4]]},
  {id:3,name:'Sporak',planet:'Umbra-V',game:'#04',color:'#38BDF8',accent:'#9BE3FF',rows:['..####..','.h#####.','hh######','hh######','...##...','..####..','..####..','...##...'],eyes:[[2,3],[5,3]]},
  {id:4,name:'Arest',planet:'Vértice-7',game:'#05',color:'#3B82F6',accent:'#9CC3FF',rows:['...##...','..####..','.h#####.','hh######','########','.######.','..####..','...##...'],eyes:[[2,4],[5,4]]},
  {id:5,name:'Nulox',planet:'Entropia',game:'#06',color:'#F4F1EA',accent:'#FFFFFF',rows:['..####..','.h#####.','hh######','hh######','##.##.##','.######.','..####..','..#..#..'],eyes:[[2,4],[5,4]]},
  {id:6,name:'Vesper',planet:'Horizonte-07',game:'#07',color:'#FFD23F',accent:'#FFF0A6',rows:['...##...','h..##..#','hh######','.h#####.','########','.######.','#..##..#','...##...'],eyes:[[2,4],[5,4]]}
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
