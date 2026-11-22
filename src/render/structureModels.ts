// Постройки и предметы «мест»: пустынные руины, зимние избы, места крушений. 1 воксель = 1/8 блока.
import { VoxelGrid, jit, mixHex, vhash } from './voxel';
import { D } from '../world/decoTypes';

type Rnd = () => number;
const STONE = 0xe4d8c0;
const STONE2 = 0xcfc0a2;
const SAND = 0xe2c88c;
const SNOW = 0xf2f6ff;

const stone = (x: number, y: number, z: number) => jit(vhash(x, Math.floor(y / 2), z, 51) < 0.2 ? STONE2 : STONE, x, y, z, 0.06);

/** Колонна с каннелюрами */
function columnShaft(g: VoxelGrid, cx: number, cz: number, y0: number, h: number, broken = false, rnd?: Rnd) {
  for (let y = y0; y < y0 + h; y++) {
    const top = y0 + h - 1;
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        if (x * x + z * z > 10.5) continue;
        if (broken && y > top - 4 && vhash(x, y, z, 52) < (y - (top - 4)) / 4) continue;
        const ang = Math.atan2(z, x);
        const flute = Math.cos(ang * 8) > 0.6 && x * x + z * z > 7;
        g.set(cx + x, y, cz + z, flute ? jit(STONE2, x, y, z, 0.05) : stone(x, y, z));
      }
  }
  void rnd;
}

function plinth(g: VoxelGrid, cx: number, cz: number, y0: number) {
  g.box(cx - 4, y0, cz - 4, 9, 2, 9, stone);
}
function capital(g: VoxelGrid, cx: number, cz: number, y0: number) {
  g.box(cx - 3, y0, cz - 3, 7, 1, 7, stone);
  g.box(cx - 4, y0 + 1, cz - 4, 9, 2, 9, stone);
  g.box(cx - 5, y0 + 2, cz - 2, 1, 1, 5, STONE2).box(cx + 4, y0 + 2, cz - 2, 1, 1, 5, STONE2);
}
function sandPile(g: VoxelGrid, cx: number, cz: number, r: number, h: number) {
  for (let x = -Math.ceil(r); x <= r; x++)
    for (let z = -Math.ceil(r); z <= r; z++) {
      const d = Math.sqrt(x * x + z * z) / r;
      if (d > 1) continue;
      const hh = Math.round((1 - d * d) * h + (vhash(x, 0, z, 53) - 0.5));
      for (let y = 0; y < hh; y++) g.set(cx + x, y, cz + z, jit(SAND, x, y, z, 0.06));
    }
}

function column(v: number): VoxelGrid {
  const g = new VoxelGrid();
  plinth(g, 0, 0, 0);
  const h = v === 1 ? 26 : 36;
  columnShaft(g, 0, 0, 2, h);
  capital(g, 0, 0, 2 + h);
  sandPile(g, 0, 0, 6, 2);
  return g;
}

function columnBroken(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  plinth(g, 0, 0, 0);
  if (v === 2) {
    // поваленный ствол колонны
    columnShaft(g, 0, 0, 2, 4, true);
    for (let i = 0; i < 26; i++)
      for (let a = 0; a < Math.PI * 2; a += 0.25) {
        const y = 3 + Math.sin(a) * 3,
          z = Math.cos(a) * 3;
        if (y < 0.5) continue;
        g.set(6 + i, Math.round(y), Math.round(z), stone(i, Math.round(y), Math.round(z)));
      }
    sandPile(g, 12, 0, 7, 2);
    return g;
  }
  const h = v === 1 ? 14 : 22;
  columnShaft(g, 0, 0, 2, h, true, rnd);
  // обломки барабанов рядом
  g.cyl(6, 0, 3, 3, 4, stone);
  g.box(-7, 0, 2, 3, 2, 3, stone).box(-5, 0, -6, 2, 1, 2, STONE2);
  sandPile(g, 0, 0, 7, 2);
  return g;
}

function arch(): VoxelGrid {
  const g = new VoxelGrid();
  const W = 13;
  for (const sx of [-W, W]) g.box(sx - 3, 0, -3, 7, 30, 7, stone);
  // полуарка
  for (let a = 0; a <= Math.PI; a += 0.02) {
    for (let r = 10; r <= 15; r++) {
      const x = Math.round(Math.cos(a) * r),
        y = Math.round(30 + Math.sin(a) * r * 0.75);
      for (let z = -3; z <= 3; z++) g.set(x, y, z, stone(x, y, z));
    }
  }
  g.box(-2, 40, -3, 5, 3, 7, jit(STONE2, 0, 40, 0, 0.05)); // замковый камень
  // выщербины
  for (let i = 0; i < 25; i++) g.del(Math.floor((vhash(i, 1, 1) - 0.5) * 30), 30 + Math.floor(vhash(i, 2, 2) * 12), 3);
  sandPile(g, -W, 0, 6, 3);
  sandPile(g, W, 0, 5, 2);
  return g;
}

function colonnade(): VoxelGrid {
  const g = new VoxelGrid();
  const xs = [-30, -10, 10, 30];
  xs.forEach((x, i) => {
    plinth(g, x, 0, 0);
    const broken = i === 3;
    columnShaft(g, x, 0, 2, broken ? 20 : 36, broken);
    if (!broken) capital(g, x, 0, 38);
  });
  // антаблемент с фризом (одного края нет)
  g.box(-35, 41, -4, 56, 4, 9, (x, y, z) => (y === 42 && x % 4 === 0 ? STONE2 : stone(x, y, z)));
  g.box(-35, 45, -3, 50, 2, 7, stone);
  for (let x = -35; x < 21; x++) if (vhash(x, 46, 0, 54) < 0.25) g.del(x, 46, 3);
  // упавший кусок балки
  g.box(22, 0, 4, 12, 4, 7, stone);
  sandPile(g, 25, 2, 8, 3);
  return g;
}

function aqueduct(): VoxelGrid {
  const g = new VoxelGrid();
  const brick = (x: number, y: number, z: number) => jit((Math.floor(y / 2) + Math.floor(x / 4)) % 2 === 0 ? 0xc9a27a : 0xb8906a, x, y, z, 0.06);
  for (const px of [-32, 0, 32]) g.box(px - 4, 0, -5, 9, 30, 10, brick);
  // арочный пролёт и канал сверху
  for (let x = -36; x <= 36; x++) {
    const local = ((x + 32) % 32 + 32) % 32 - 16;
    const open = Math.floor(18 + Math.sqrt(Math.max(0, 144 - local * local)));
    for (let y = Math.min(open, 31); y < 40; y++) for (let z = -5; z <= 5; z++) g.set(x, y, z, brick(x, y, z));
  }
  for (let x = -36; x <= 36; x++) for (let z = -3; z <= 3; z++) g.del(x, 39, z); // канал
  // обрушенный край
  for (let x = 24; x <= 36; x++) for (let y = 20; y < 40; y++) for (let z = -5; z <= 5; z++) if (vhash(x, y, z, 55) < (x - 24) / 12) g.del(x, y, z);
  sandPile(g, 32, 0, 9, 4);
  sandPile(g, -30, 2, 7, 2);
  return g;
}

function rubble(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const cols = v === 2 ? [0x7a5434, 0x8a6a40, 0x5a3e28] : [STONE, STONE2, 0xa59e94];
  for (let i = 0; i < 9; i++) {
    const w = 2 + Math.floor(rnd() * 4),
      h = 1 + Math.floor(rnd() * 3),
      d = 2 + Math.floor(rnd() * 4);
    g.box(Math.floor((rnd() - 0.5) * 14), 0, Math.floor((rnd() - 0.5) * 14), w, h, d, (x, y, z) => jit(cols[i % cols.length], x, y, z, 0.07));
  }
  if (v === 1) sandPile(g, 0, 0, 6, 2);
  return g;
}

function sandMound(v: number): VoxelGrid {
  const g = new VoxelGrid();
  for (let x = -14; x <= 14; x++)
    for (let z = -10; z <= 10; z++) {
      const d = (x / 14) ** 2 + (z / 10) ** 2;
      if (d > 1) continue;
      const h = Math.round((1 - d) * 6 + Math.sin(x * 0.7) * 0.6);
      for (let y = 0; y < h; y++) {
        const ripple = Math.sin(x * 0.9 + z * 0.3) > 0.6 && y === h - 1;
        g.set(x, y, z, jit(ripple ? 0xd4b478 : v === 1 && vhash(x, y, z) < 0.15 ? 0xa08060 : 0xe8c890, x, y, z, 0.05));
      }
    }
  return g;
}

/** Бревенчатая изба с крыльцом и навесом (v=1 — под снегом) */
function cabin(v: number): VoxelGrid {
  const g = new VoxelGrid();
  const snowy = v === 1;
  const W = 24,
    Dp = 16,
    H = 22; // половина ширины/глубины, высота стен
  const log = (x: number, y: number, z: number) => {
    const row = Math.floor(y / 3);
    const edge = y % 3 === 0;
    return jit(edge ? 0x4a3020 : row % 2 ? 0x7a5434 : 0x6e4a2e, x, y, z, 0.07);
  };
  // фундамент
  g.box(-W - 1, 0, -Dp - 1, W * 2 + 3, 2, Dp * 2 + 3, (x, y, z) => jit(0x8d9096, x, y, z, 0.1));
  // стены из брёвен с выступающими торцами
  for (let y = 2; y < H; y++) {
    for (let x = -W; x <= W; x++) {
      g.set(x, y, -Dp, log(x, y, -Dp));
      g.set(x, y, Dp, log(x, y, Dp));
    }
    for (let z = -Dp; z <= Dp; z++) {
      g.set(-W, y, z, log(-W, y, z));
      g.set(W, y, z, log(W, y, z));
    }
    if (y % 3 === 1)
      for (const [x, z] of [[-W - 1, -Dp], [W + 1, -Dp], [-W - 1, Dp], [W + 1, Dp], [-W, -Dp - 1], [W, -Dp - 1], [-W, Dp + 1], [W, Dp + 1]]) g.set(x, y, z, 0x8a6440);
  }
  // дверь и окна на фасаде (+z)
  for (let y = 2; y < 15; y++) for (let x = -3; x <= 3; x++) g.set(x, y, Dp, Math.abs(x) === 3 || y === 14 ? 0x3a2414 : jit(0x5a3a22, x, y, Dp, 0.05));
  g.set(2, 8, Dp + 1, 0xd8b04a);
  const windowAt = (cx: number, z: number, nz: number) => {
    for (let y = 8; y < 15; y++)
      for (let x = cx - 4; x <= cx + 4; x++) {
        const frame = Math.abs(x - cx) === 4 || y === 8 || y === 14 || x === cx || y === 11;
        g.set(x, y, z, frame ? 0x3a2414 : 0xffd890);
      }
    for (let x = cx - 5; x <= cx + 5; x++) g.set(x, 7, z + nz, snowy ? SNOW : 0x5a3a22); // подоконник
  };
  windowAt(-14, Dp, 1);
  windowAt(14, Dp, 1);
  windowAt(-14, -Dp, -1);
  windowAt(14, -Dp, -1);
  // двускатная крыша с выносом
  for (let k = 0; k <= Dp + 4; k++) {
    const y = H + Math.floor((Dp + 4 - k) * 0.75);
    for (let x = -W - 3; x <= W + 3; x++)
      for (const z of [k, -k]) {
        const c = snowy && vhash(x, y, z, 56) < 0.92 ? jit(SNOW, x, y, z, 0.03) : jit(x % 4 === 0 ? 0x3a2a20 : 0x4a3428, x, y, z, 0.06);
        g.set(x, y, z, c);
        if (snowy) g.set(x, y + 1, z, jit(SNOW, x, y, z, 0.03));
      }
  }
  // фронтоны
  for (let y = H; y < H + 15; y++) {
    const half = Dp - Math.floor((y - H) / 0.75);
    for (let z = -half; z <= half; z++) {
      g.set(-W, y, z, log(-W, y, z));
      g.set(W, y, z, log(W, y, z));
    }
  }
  // труба
  g.box(W - 9, H + 6, -6, 5, 16, 5, (x, y, z) => jit(0x8d9096, x, y, z, 0.12));
  if (snowy) g.box(W - 9, H + 22, -6, 5, 1, 5, SNOW);
  // крыльцо с навесом
  g.box(-10, 2, Dp + 1, 21, 1, 8, (x, y, z) => jit(0x9a7048, x, y, z, 0.06));
  for (const x of [-10, 10]) g.box(x, 3, Dp + 8, 1, 12, 1, 0x6e4a2e);
  g.box(-12, 15, Dp + 1, 25, 1, 9, (x, y, z) => (snowy ? jit(SNOW, x, y, z, 0.03) : jit(0x4a3428, x, y, z, 0.06)));
  if (snowy) g.box(-12, 16, Dp + 1, 25, 1, 9, SNOW);
  return g;
}

function fence(v: number): VoxelGrid {
  const g = new VoxelGrid();
  const wood = (x: number, y: number, z: number) => jit(0x8a6440, x, y, z, 0.08);
  for (const x of [-12, 0, 12]) {
    g.box(x, 0, 0, 2, 10, 2, wood);
    if (v === 1) g.box(x, 10, 0, 2, 1, 2, SNOW);
  }
  for (const y of [4, 8]) {
    g.box(-12, y, 0, 26, 1, 1, wood);
    if (v === 1) g.box(-12, y + 1, 0, 26, 1, 1, (x, yy, z) => (vhash(x, yy, z) < 0.7 ? SNOW : null));
  }
  return g;
}

function lampPost(): VoxelGrid {
  const g = new VoxelGrid();
  for (let y = 0; y < 36; y++) {
    const lean = Math.floor(y / 12);
    g.box(lean, y, 0, 2, 1, 2, (x, yy, z) => jit(0x4a4f58, x, yy, z, 0.05));
  }
  g.line([3, 35, 0], [9, 37, 0], 0.5, 0x4a4f58);
  g.box(8, 33, -1, 3, 3, 3, (x, y) => (y === 33 ? 0xfff0b0 : 0x2a2f38));
  return g;
}

function logPile(v: number): VoxelGrid {
  const g = new VoxelGrid();
  const rows: [number, number][] = [[0, 3], [1, 2], [2, 1]];
  for (const [row, n] of rows)
    for (let i = 0; i < n; i++) {
      const cz = (i - (n - 1) / 2) * 5,
        cy = 2 + row * 4.2;
      for (let x = -9; x <= 9; x++)
        for (let a = 0; a < Math.PI * 2; a += 0.35) {
          const y = Math.round(cy + Math.sin(a) * 2),
            z = Math.round(cz + Math.cos(a) * 2);
          const end = Math.abs(x) === 9;
          g.set(x, y, z, end ? 0xc8a070 : jit(0x6e4a2e, x, y, z, 0.07));
        }
      if (v === 1) for (let x = -9; x <= 9; x++) g.set(x, Math.round(cy + 3), Math.round(cz), SNOW);
    }
  return g;
}

function bench(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-8, 4, -2, 16, 1, 4, (x, y, z) => jit(0x9a7048, x, y, z, 0.06));
  g.box(-8, 5, -3, 16, 4, 1, (x, y, z) => (y % 2 ? jit(0x9a7048, x, y, z, 0.06) : null));
  for (const x of [-7, 6]) g.box(x, 0, -2, 1, 4, 4, 0x4a4f58);
  return g;
}

function signpost(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(0, 0, 0, 2, 22, 2, 0x6e4a2e);
  g.box(-8, 17, 2, 14, 3, 1, (x, y, z) => (x === -8 ? null : jit(0xb8864f, x, y, z, 0.05)));
  g.box(-2, 12, 2, 12, 3, 1, (x, y, z) => jit(0xa87a46, x, y, z, 0.05));
  g.set(-6, 18, 3, 0x3a2414).set(-3, 18, 3, 0x3a2414).set(2, 13, 3, 0x3a2414).set(5, 13, 3, 0x3a2414);
  return g;
}

/** Старый винтовой биплан, зарывшийся носом в землю (собственный дизайн) */
function planeWreck(): VoxelGrid {
  const g = new VoxelGrid();
  const cream = 0xf0e6d0,
    red = 0xe07a3a;
  const hull = (x: number, y: number, z: number) => jit(Math.floor((z + 40) / 6) % 3 === 0 ? red : cream, x, y, z, 0.05);
  // фюзеляж: сужается к хвосту, нос опущен
  for (let z = -22; z <= 22; z++) {
    const t = (z + 22) / 44; // 0 нос .. 1 хвост
    const r = 5 - t * 3;
    const cy = 4 + t * 4;
    for (let x = -Math.ceil(r); x <= r; x++)
      for (let y = -Math.ceil(r); y <= r; y++) {
        if (x * x + y * y > r * r) continue;
        if (z > -6 && z < 2 && y > r - 2.5 && Math.abs(x) < r - 1) continue; // кабина
        g.set(x, Math.round(cy + y), -z, hull(x, y, z));
      }
  }
  // хвостовое оперение
  g.box(-1, 10, -24, 2, 8, 5, hull).box(-8, 8, -23, 17, 1, 4, hull);
  // нижнее крыло (левое цело, правое отломано и лежит рядом)
  g.box(-28, 1, -2, 24, 2, 8, (x, y, z) => jit(Math.floor(x / 5) % 2 === 0 ? red : cream, x, y, z, 0.05));
  for (let i = 0; i < 22; i++) for (let z = 0; z < 8; z++) g.set(14 + i, Math.round(i * 0.15), 10 + z - Math.floor(i * 0.3), jit(i % 10 < 5 ? cream : red, i, 0, z, 0.05));
  // верхнее крыло на стойках, перекошено
  for (const x of [-16, -6]) g.line([x, 3, 2], [x + 1, 12, 2], 0.5, 0x6e4a2e);
  g.box(-24, 12, -1, 22, 1, 7, (x, y, z) => jit(Math.floor(x / 5) % 2 === 0 ? cream : red, x, y, z, 0.05));
  // гнутый пропеллер
  g.line([0, 3, 23], [0, 9, 24], 0.5, 0x6e4a2e).line([0, 3, 23], [-5, 0, 25], 0.5, 0x6e4a2e);
  // колесо и грунт, вздыбленный у носа
  g.cyl(4, 0, -8, 2, 1, 0x222222);
  for (let x = -9; x <= 9; x++) for (let z = 18; z <= 28; z++) {
    const d = Math.hypot(x, z - 23) / 9;
    if (d > 1) continue;
    for (let y = 0; y < Math.round((1 - d) * 4); y++) g.set(x, y, z, jit(0x9b7653, x, y, z, 0.12));
  }
  return g;
}

function truckWreck(): VoxelGrid {
  const g = new VoxelGrid();
  const rust = (x: number, y: number, z: number) => jit(vhash(x, y, z, 61) < 0.3 ? 0x8a4a2a : 0x6a8a9a, x, y, z, 0.07);
  g.box(-9, 2, 6, 18, 14, 12, rust); // кабина
  g.box(-8, 10, 17, 16, 5, 1, 0x2a3440);
  g.box(-9, 2, -18, 18, 3, 24, (x, y, z) => jit(0x7a5434, x, y, z, 0.08)); // кузов
  g.box(-9, 5, -18, 1, 5, 24, rust).box(8, 5, -18, 1, 5, 24, rust);
  for (const [x, z] of [[-10, 10], [9, 10], [-10, -12], [9, -12]]) g.cyl(x, 0, z, 2.5, 1, 0x222222);
  for (let x = -8; x <= 8; x++) for (let z = -17; z <= 5; z++) if (vhash(x, 5, z, 62) < 0.4) g.set(x, 5, z, jit(0x6cc23c, x, 5, z, 0.12));
  return g;
}

function crate(v: number): VoxelGrid {
  const g = new VoxelGrid();
  const s = v === 1 ? 10 : 8;
  g.box(-s / 2, 0, -s / 2, s, s, s, (x, y, z) => {
    const edge = [x === -s / 2 || x === s / 2 - 1, y === 0 || y === s - 1, z === -s / 2 || z === s / 2 - 1].filter(Boolean).length >= 2;
    return jit(edge ? 0x6e4a2e : (y % 3 === 0 ? 0xa87a46 : 0xb8864f), x, y, z, 0.06);
  });
  if (v === 1) g.box(-2, 3, s / 2, 4, 3, 1, 0x3a2414);
  return g;
}

function barrel(v: number): VoxelGrid {
  const g = new VoxelGrid();
  const base = v === 1 ? 0xa0402a : 0x5a7a8a;
  g.cyl(0, 0, 0, 3.6, 10, (x, y, z) => jit(y === 1 || y === 8 ? 0x3a3a3a : vhash(x, y, z, 63) < 0.15 ? 0x8a4a2a : base, x, y, z, 0.06));
  return g;
}

function suitcase(v: number): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-4, 0, -3, 8, 2, 6, (x, y, z) => jit(z === 0 ? 0x5a3a22 : 0x8a5a34, x, y, z, 0.06));
  g.box(-1, 2, 2, 2, 1, 1, 0x3a2414);
  if (v === 1) {
    g.box(-4, 2, -4, 8, 6, 1, (x, y, z) => jit(0x8a5a34, x, y, z, 0.06));
    g.box(-3, 2, -2, 3, 1, 3, 0xf2efe6).box(1, 2, -1, 2, 1, 2, 0xe8e0d0);
  }
  return g;
}

function chest(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-5, 0, -3, 10, 5, 7, (x, y, z) => jit(y === 4 ? 0x6e4a2e : 0x9a6a3a, x, y, z, 0.06));
  g.box(-5, 5, -3, 10, 2, 7, (x, y, z) => jit(0x8a5a30, x, y, z, 0.06));
  for (const x of [-5, -1, 4]) g.box(x, 0, -3, 1, 7, 7, (xx, y, z) => (z === -3 || z === 3 || y === 6 ? 0xd8b04a : null));
  g.box(-1, 3, 4, 2, 2, 1, 0xffe080);
  return g;
}

function lantern(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-1, 0, -1, 3, 1, 3, 0x2a2f38).box(-1, 1, -1, 3, 3, 3, 0xffe08a).box(-1, 4, -1, 3, 1, 3, 0x2a2f38).set(0, 5, 0, 0x2a2f38);
  return g;
}

export function buildStructure(t: D, v: number, rnd: Rnd): VoxelGrid {
  switch (t) {
    case D.Column: return column(v);
    case D.ColumnBroken: return columnBroken(v, rnd);
    case D.Arch: return arch();
    case D.Colonnade: return colonnade();
    case D.Aqueduct: return aqueduct();
    case D.Rubble: return rubble(v, rnd);
    case D.SandMound: return sandMound(v);
    case D.Cabin: return cabin(v);
    case D.Fence: return fence(v);
    case D.LampPost: return lampPost();
    case D.LogPile: return logPile(v);
    case D.Bench: return bench();
    case D.Signpost: return signpost();
    case D.PlaneWreck: return planeWreck();
    case D.TruckWreck: return truckWreck();
    case D.Crate: return crate(v);
    case D.Barrel: return barrel(v);
    case D.Suitcase: return suitcase(v);
    case D.Chest: return chest();
    case D.Lantern: return lantern();
    default: {
      const g = new VoxelGrid();
      g.box(0, 0, 0, 2, 2, 2, 0xff00ff);
      return g;
    }
  }
}

void mixHex;
