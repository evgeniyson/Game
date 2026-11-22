// Простые синтезированные звуки на WebAudio — без внешних файлов.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let soundOn = true;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setSound(on: boolean) {
  soundOn = on;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, slide = 0, delay = 0) {
  if (!ctx || !master || !soundOn) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.3, freq = 1200, delay = 0) {
  if (!ctx || !master || !soundOn) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

const last: Record<string, number> = {};

export function sfx(name: string) {
  if (!ctx || !soundOn) return;
  const now = performance.now();
  if (last[name] && now - last[name] < 45) return;
  last[name] = now;
  switch (name) {
    case 'hit': noise(0.08, 0.25, 900); tone(160, 0.07, 'square', 0.08, 0.6); break;
    case 'crit': noise(0.12, 0.35, 1800); tone(300, 0.12, 'sawtooth', 0.12, 0.4); break;
    case 'swing': noise(0.06, 0.12, 2500); break;
    case 'hurt': tone(220, 0.15, 'sawtooth', 0.12, 0.5); break;
    case 'bash': noise(0.15, 0.4, 600); tone(110, 0.2, 'square', 0.2, 0.5); break;
    case 'dash': noise(0.25, 0.2, 700); break;
    case 'shield': tone(520, 0.25, 'triangle', 0.15, 1.5); tone(780, 0.3, 'triangle', 0.1, 1.2, 0.05); break;
    case 'quake': noise(0.6, 0.5, 300); tone(60, 0.5, 'sawtooth', 0.25, 0.5); break;
    case 'bow': tone(900, 0.06, 'triangle', 0.1, 0.4); noise(0.05, 0.1, 3000); break;
    case 'trap': tone(300, 0.08, 'square', 0.15, 2); noise(0.1, 0.25, 1500); break;
    case 'fire': noise(0.25, 0.2, 1200); tone(200, 0.2, 'sawtooth', 0.08, 2); break;
    case 'boom': noise(0.45, 0.5, 500); tone(80, 0.35, 'sine', 0.3, 0.4); break;
    case 'ice': tone(1200, 0.3, 'triangle', 0.12, 0.5); noise(0.3, 0.2, 4000); break;
    case 'blink': tone(400, 0.2, 'sine', 0.15, 3); break;
    case 'zap': noise(0.3, 0.3, 5000); tone(1500, 0.2, 'sawtooth', 0.1, 0.3); break;
    case 'drink': tone(500, 0.08, 'sine', 0.12, 1.5); tone(700, 0.1, 'sine', 0.1, 1.5, 0.09); break;
    case 'eat': noise(0.08, 0.2, 800); noise(0.08, 0.2, 800, 0.12); break;
    case 'heal': tone(600, 0.3, 'sine', 0.12, 1.5); break;
    case 'pickup': tone(880, 0.06, 'square', 0.08); tone(1320, 0.08, 'square', 0.08, 1, 0.06); break;
    case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, 1, i * 0.1)); break;
    case 'harvest': noise(0.07, 0.3, 700); tone(140, 0.06, 'square', 0.1); break;
    case 'craft': tone(660, 0.1, 'square', 0.1); tone(990, 0.15, 'square', 0.1, 1, 0.1); break;
    case 'death': tone(300, 0.6, 'sawtooth', 0.2, 0.3); break;
    case 'click': tone(1000, 0.03, 'square', 0.06); break;
    case 'error': tone(150, 0.12, 'square', 0.1); break;
    case 'boss': tone(110, 0.8, 'sawtooth', 0.2, 0.7); tone(82, 0.9, 'sawtooth', 0.15, 0.7, 0.2); break;
    case 'quest': [784, 988, 1175].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, 1, i * 0.08)); break;
  }
}
