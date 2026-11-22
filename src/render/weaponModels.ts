// Детальные воксельные модели оружия и снаряжения. Используются на персонаже и для иконок инвентаря.
// Оружие смоделировано вдоль +Y, хват в точке (0,0,0).
import { VoxelGrid, jit, mixHex, vhash } from './voxel';

export const WS = 0.05; // масштаб вокселя оружия

export type Mount = 'hand' | 'bow' | 'arm' | 'back' | 'float' | 'none';

export interface GearModel {
  grid: VoxelGrid;
  mount: Mount;
}

export const RARITY_GLOW = [0x000000, 0x184018, 0x10285a, 0x3a1060, 0x6a3008];

export const RUNE_COLORS: Record<string, number> = {
  runeFire: 0xff5a2a,
  runeIce: 0x8ae8ff,
  runeWind: 0x9aff9a,
  runeLife: 0xff7aa8,
  runeMind: 0xb08aff,
  runeBlood: 0xd0102a,
};

const WOOD = 0x7a5434;
const WOOD_D = 0x5a3a22;
const STEEL = 0xc8d0d8;
const STEEL_D = 0x8a96a2;
const GOLD = 0xd8b04a;

const wrap = (base: number) => (x: number, y: number, z: number) => jit(y % 2 === 0 ? base : mixHex(base, 0x000000, 0.25), x, y, z, 0.05);

function blade(g: VoxelGrid, y0: number, len: number, w: number, col: number, edge: number, tipCurve = 0) {
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const ww = t > 0.75 ? Math.max(1, Math.round(w * (1 - (t - 0.75) / 0.25))) : w;
    const off = Math.round(tipCurve * t * t * 3);
    for (let x = -Math.floor(ww / 2); x < Math.ceil(ww / 2); x++) {
      const isEdge = x === -Math.floor(ww / 2) || x === Math.ceil(ww / 2) - 1;
      g.set(x + off, y0 + i, 0, jit(isEdge ? edge : col, x, y0 + i, 0, 0.04));
    }
  }
}

// ---------------- Оружие ----------------
function pipeClub(): GearModel {
  const g = new VoxelGrid();
  g.box(-1, -4, -1, 2, 6, 2, wrap(0x2a2a2a));
  g.box(-1, 2, -1, 2, 16, 2, (x, y, z) => jit(vhash(x, y, z) < 0.2 ? 0xa0603a : 0x9aa0a8, x, y, z, 0.06));
  g.box(-2, 17, -2, 4, 3, 4, (x, y, z) => jit(0x7a8088, x, y, z, 0.06));
  g.box(-2, 20, -1, 4, 2, 2, 0x6a7078);
  return { grid: g, mount: 'hand' };
}
function rebarSword(): GearModel {
  const g = new VoxelGrid();
  g.box(0, -4, 0, 1, 5, 1, wrap(0x6b4a2f));
  g.set(0, -5, 0, GOLD);
  g.box(-3, 1, 0, 7, 1, 1, (x, y, z) => jit(x % 2 ? 0x8a6a4a : 0x7a5a3a, x, y, z, 0.05));
  g.box(-3, 2, 0, 1, 1, 1, 0x8a6a4a).box(3, 2, 0, 1, 1, 1, 0x8a6a4a);
  blade(g, 2, 17, 3, 0xb8c0c8, 0xe8eef4);
  for (let y = 3; y < 15; y += 2) g.set(0, y, 1, 0x8a6a4a); // ребристая арматура
  return { grid: g, mount: 'hand' };
}
function signHammer(): GearModel {
  const g = new VoxelGrid();
  g.box(0, -5, 0, 1, 22, 1, wrap(WOOD));
  g.box(-1, -5, -1, 3, 2, 3, STEEL_D);
  g.box(-5, 15, -3, 11, 7, 7, (x, y, z) => jit(vhash(x, y, z) < 0.15 ? 0x6a6e72 : 0x9ea2a8, x, y, z, 0.1));
  g.box(-5, 14, -3, 11, 1, 7, STEEL_D).box(-5, 22, -3, 11, 1, 7, STEEL_D);
  g.box(-6, 17, 0, 1, 3, 1, 0xa0603a).box(6, 18, 1, 1, 2, 1, 0xa0603a);
  return { grid: g, mount: 'hand' };
}
function bloodBlade(): GearModel {
  const g = new VoxelGrid();
  g.box(0, -4, 0, 1, 5, 1, wrap(0x3a1a1a));
  g.set(0, -5, 0, 0xd0102a);
  g.box(-3, 1, 0, 7, 1, 1, 0x2a2a30).set(-3, 2, 0, 0x2a2a30).set(3, 2, 0, 0x2a2a30);
  g.set(0, 1, 1, 0xff2a3a);
  blade(g, 2, 18, 3, 0x3a3a44, 0x7a7a88, 0.8);
  for (let y = 4; y < 16; y += 3) g.set(Math.round(0.8 * ((y - 2) / 18) ** 2 * 3), y, 1, 0xff2a3a);
  return { grid: g, mount: 'hand' };
}
function rustyKnife(): GearModel {
  const g = new VoxelGrid();
  g.box(0, -3, 0, 1, 4, 1, wrap(WOOD_D));
  g.box(-1, 1, 0, 3, 1, 1, 0x6a6e72);
  blade(g, 2, 9, 2, 0xa0907a, 0xc8b8a0);
  return { grid: g, mount: 'hand' };
}
function bow(kind: 'short' | 'comp'): GearModel {
  const g = new VoxelGrid();
  const col = kind === 'short' ? 0x8a5a30 : 0x4a2f1e;
  const H = kind === 'short' ? 12 : 13;
  for (let y = -H; y <= H; y++) {
    const t = Math.abs(y) / H;
    let z = Math.round(Math.cos(t * 1.25) * 3);
    if (kind === 'comp' && t > 0.85) z = Math.round(z + (t - 0.85) * 18); // загнутые концы
    g.set(0, y, z, jit(Math.abs(y) < 3 ? 0x3a2414 : col, 0, y, z, 0.05));
    if (Math.abs(y) < 9) g.set(0, y, z + (y % 2 === 0 ? 1 : 0), jit(col, 0, y, z, 0.05));
  }
  if (kind === 'comp') {
    g.set(0, H, 3, 0xf2e8d0).set(0, -H, 3, 0xf2e8d0);
    g.set(0, 4, 4, GOLD).set(0, -4, 4, GOLD);
  }
  for (let y = -H + 1; y < H; y++) g.set(0, y, kind === 'comp' ? 1 : 0, 0xf2efe6); // тетива
  return { grid: g, mount: 'bow' };
}
function crossbow(): GearModel {
  const g = new VoxelGrid();
  g.box(-1, -6, -1, 2, 18, 2, (x, y, z) => jit(y < -2 ? 0x4a2f1e : WOOD, x, y, z, 0.05)); // ложе
  for (let x = -9; x <= 9; x++) {
    const y = 11 - Math.round((x * x) / 16);
    g.set(x, y, 0, jit(STEEL_D, x, y, 0, 0.05));
    g.set(x, y, 1, jit(STEEL_D, x, y, 1, 0.05));
  }
  g.line([-9, 6, 0], [0, 4, 0], 0.4, 0xf2efe6).line([9, 6, 0], [0, 4, 0], 0.4, 0xf2efe6);
  g.box(0, 4, 2, 1, 12, 1, 0xd8c8a0).set(0, 16, 2, STEEL);
  g.box(-1, 0, 1, 2, 2, 2, STEEL_D);
  return { grid: g, mount: 'hand' };
}
function branchStaff(): GearModel {
  const g = new VoxelGrid();
  let x = 0,
    z = 0;
  for (let y = -6; y < 24; y++) {
    if (y % 6 === 0) x += y % 12 === 0 ? 1 : -1;
    g.set(x, y, z, jit(y % 4 === 0 ? 0x6a4a2a : WOOD, x, y, z, 0.07));
    if (y > 18) g.set(x + 1, y, z, jit(WOOD, x, y, z, 0.07));
  }
  g.line([0, 20, 0], [-3, 25, 1], 0.4, WOOD).line([1, 21, 0], [4, 25, -1], 0.4, WOOD);
  for (const [lx, ly, lz] of [[-3, 26, 1], [4, 26, -1], [-4, 24, 0], [5, 24, 0], [0, 26, 0]]) g.set(lx, ly, lz, 0x7cc94a);
  g.box(0, 24, 0, 2, 2, 2, 0xb8f4a0);
  return { grid: g, mount: 'hand' };
}
function crystalStaff(): GearModel {
  const g = new VoxelGrid();
  g.box(0, -7, 0, 1, 28, 1, (x, y, z) => jit(y % 7 === 0 ? GOLD : 0x8a6a4a, x, y, z, 0.05));
  for (const [cx, cz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) g.line([0, 20, 0], [cx, 24, cz], 0.4, GOLD);
  for (let y = 22; y < 29; y++) {
    const w = y < 25 ? y - 21 : 29 - y;
    for (let xx = -Math.floor(w / 2); xx <= Math.floor(w / 2); xx++)
      for (let zz = -Math.floor(w / 2); zz <= Math.floor(w / 2); zz++) g.set(xx, y, zz, jit(y % 2 ? 0x7fe0ff : 0xc8faff, xx, y, zz, 0.05));
  }
  return { grid: g, mount: 'hand' };
}
function stormStaff(): GearModel {
  const g = new VoxelGrid();
  g.box(0, -7, 0, 1, 26, 1, (x, y, z) => jit(y % 5 === 0 ? 0x8a8aa0 : 0x2a2a3a, x, y, z, 0.05));
  g.line([0, 18, 0], [-4, 25, 0], 0.4, 0x3a3a50).line([0, 18, 0], [4, 25, 0], 0.4, 0x3a3a50);
  g.sphere(0, 24, 0, 2.6, 2.6, 2.6, (x, y, z) => (vhash(x, y, z, 3) < 0.3 ? 0xffffff : jit(0x8a6aff, x, y, z, 0.1)));
  g.set(-4, 26, 0, 0xc8e8ff).set(4, 26, 0, 0xc8e8ff).set(-2, 28, 1, 0xffffff).set(2, 27, -1, 0xffffff);
  return { grid: g, mount: 'hand' };
}

// ---------------- Вторая рука ----------------
function stopSign(): GearModel {
  const g = new VoxelGrid();
  for (let x = -7; x <= 7; x++)
    for (let y = -7; y <= 7; y++) {
      if (Math.abs(x) + Math.abs(y) > 10) continue;
      const border = Math.abs(x) + Math.abs(y) >= 9 || Math.abs(x) === 7 || Math.abs(y) === 7;
      const band = Math.abs(y) <= 1 && Math.abs(x) <= 5 && (x + 10) % 3 !== 0;
      g.set(x, y, 0, jit(border ? 0xf2efe6 : band ? 0xffffff : vhash(x, y, 0) < 0.08 ? 0x8a4a2a : 0xc0392b, x, y, 0, 0.04));
    }
  g.box(-1, -3, -1, 2, 6, 1, 0x6a6e72);
  return { grid: g, mount: 'arm' };
}
function towerShield(): GearModel {
  const g = new VoxelGrid();
  g.box(-7, -10, 0, 14, 21, 1, (x, y, z) => {
    if (Math.abs(x) === 7 || y === -10 || y === 10) return 0x6a7078;
    if ((x + 7) % 5 === 0 && (y + 10) % 5 === 0) return 0xe0e4e8;
    return jit(Math.floor((y + 10) / 7) % 2 ? 0x9aa4ae : 0x8a949e, x, y, z, 0.05);
  });
  g.box(-2, -2, 1, 4, 4, 1, GOLD);
  g.box(-1, -4, -1, 2, 8, 1, 0x4a4f58);
  return { grid: g, mount: 'arm' };
}
function quiver(): GearModel {
  const g = new VoxelGrid();
  g.cyl(0, 0, 0, 2.2, 14, (x, y, z) => jit(y % 4 === 0 ? 0x5a3a22 : 0x8a5a34, x, y, z, 0.05));
  const fl = [0xe84a3a, 0xf2efe6, 0xe84a3a, 0x4a8a3a];
  [[-1, 0], [1, 0], [0, 1], [0, -1]].forEach(([x, z], i) => {
    g.box(x, 14, z, 1, 3, 1, 0xd8c8a0);
    g.box(x, 17, z, 1, 2, 1, fl[i]);
  });
  return { grid: g, mount: 'back' };
}
function runeFocus(): GearModel {
  const g = new VoxelGrid();
  g.sphere(0, 0, 0, 2.6, 2.6, 2.6, (x, y, z) => jit(vhash(x, y, z) < 0.25 ? 0xe8d8ff : 0x9a6ae8, x, y, z, 0.08));
  for (let a = 0; a < Math.PI * 2; a += 0.3) g.set(Math.cos(a) * 5, 0, Math.sin(a) * 5, Math.floor(a * 3) % 2 ? GOLD : 0xffe8a0);
  return { grid: g, mount: 'float' };
}

// ---------------- Броня и амулеты (иконки) ----------------
function hood(col: number): VoxelGrid {
  const g = new VoxelGrid();
  g.sphere(0, 6, 0, 6, 6, 6, (x, y, z) => (z > 2 && y < 8 && Math.abs(x) < 4 ? null : jit(col, x, y, z, 0.06)));
  g.box(-1, 9, -7, 3, 3, 2, col);
  return g;
}
function helmet(plume: boolean): VoxelGrid {
  const g = new VoxelGrid();
  g.sphere(0, 4, 0, 6, 6, 6, (x, y, z) => (y < 1 ? null : z > 3 && y < 5 && Math.abs(x) < 4 ? null : jit(STEEL_D, x, y, z, 0.06)));
  g.box(-6, 4, 4, 12, 1, 2, 0x5a6470);
  if (plume) g.box(-1, 10, -5, 2, 3, 10, 0xc0392b);
  return g;
}
function circlet(): VoxelGrid {
  const g = new VoxelGrid();
  for (let a = 0; a < Math.PI * 2; a += 0.12) g.set(Math.cos(a) * 6, 0, Math.sin(a) * 6, GOLD).set(Math.cos(a) * 6, 1, Math.sin(a) * 6, 0xc89a3a);
  g.box(-1, 0, 6, 2, 3, 1, 0x5fe0ff);
  return g;
}
function mask(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-6, 0, 0, 12, 8, 2, (x, y) => ((y === 4 || y === 5) && (Math.abs(x + 2.5) < 1.5 || Math.abs(x - 2.5) < 1.5) ? 0x111111 : jit(0xb02a2a, x, y, 0, 0.06)));
  g.box(-6, 0, 0, 12, 2, 2, 0x2a2a2a);
  g.line([-5, 7, 1], [-8, 13, 1], 0.5, 0xf2e8d0).line([5, 7, 1], [8, 13, 1], 0.5, 0xf2e8d0);
  return g;
}
function chestPiece(col: number, trim: number, plate = false): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-6, 0, -3, 12, 12, 6, (x, y, z) => jit(plate && (y + x) % 4 === 0 ? mixHex(col, 0xffffff, 0.2) : y === 11 || Math.abs(x) === 6 ? trim : col, x, y, z, 0.05));
  g.box(-9, 7, -3, 3, 5, 6, col).box(6, 7, -3, 3, 5, 6, col);
  g.box(-1, 1, 3, 2, 1, 1, GOLD);
  return g;
}
function pants(col: number, knee: number): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-5, 10, -3, 10, 3, 6, col);
  g.box(-5, 0, -3, 4, 10, 6, (x, y, z) => (y === 5 ? knee : jit(col, x, y, z, 0.05)));
  g.box(1, 0, -3, 4, 10, 6, (x, y, z) => (y === 5 ? knee : jit(col, x, y, z, 0.05)));
  return g;
}
function boot(col: number, sole: number, accent: number): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-2, 0, -3, 5, 2, 9, sole);
  g.box(-2, 2, -3, 5, 4, 8, (x, y, z) => jit(col, x, y, z, 0.05));
  g.box(-2, 6, -3, 5, 5, 5, (x, y, z) => jit(col, x, y, z, 0.05));
  g.box(-2, 10, -3, 5, 1, 5, accent);
  return g;
}
function pendant(gem: number, cord = 0x6a4a2a): VoxelGrid {
  const g = new VoxelGrid();
  for (let a = 0.3; a < Math.PI - 0.3; a += 0.12) g.set(Math.cos(a) * 6, Math.sin(a) * 6 + 2, 0, cord);
  g.box(-2, -2, 0, 4, 4, 2, gem);
  g.box(-1, -3, 0, 2, 1, 2, gem);
  return g;
}

export function buildGear(id: string): GearModel | null {
  switch (id) {
    case 'pipeClub': return pipeClub();
    case 'rebarSword': return rebarSword();
    case 'signHammer': return signHammer();
    case 'bloodBlade': return bloodBlade();
    case 'rustyKnife': return rustyKnife();
    case 'shortBow': return bow('short');
    case 'compositeBow': return bow('comp');
    case 'hunterCrossbow': return crossbow();
    case 'branchStaff': return branchStaff();
    case 'crystalStaff': return crystalStaff();
    case 'stormStaff': return stormStaff();
    case 'stopSign': return stopSign();
    case 'towerShield': return towerShield();
    case 'quiver': return quiver();
    case 'runeFocus': return runeFocus();
    case 'leatherHood': return { grid: hood(0x8a5a34), mount: 'none' };
    case 'steelHelm': return { grid: helmet(false), mount: 'none' };
    case 'sageCirclet': return { grid: circlet(), mount: 'none' };
    case 'berserkerMask': return { grid: mask(), mount: 'none' };
    case 'leatherJacket': return { grid: chestPiece(0x8a5a34, 0x5a3a22), mount: 'none' };
    case 'heavyPlate': return { grid: chestPiece(0x9aa4ae, 0x6a7078, true), mount: 'none' };
    case 'mageRobe': return { grid: chestPiece(0xf2efe6, 0x4a7bd1), mount: 'none' };
    case 'leatherPants': return { grid: pants(0x7a5434, 0x5a3a22), mount: 'none' };
    case 'steelGreaves': return { grid: pants(0x8a949e, 0xc8d0d8), mount: 'none' };
    case 'oldSneakers': return { grid: boot(0xf2efe6, 0xc0392b, 0x3a6ab8), mount: 'none' };
    case 'travelBoots': return { grid: boot(0x8a5a34, 0x3a2414, GOLD), mount: 'none' };
    case 'ironBoots': return { grid: boot(0x8a949e, 0x4a4f58, 0xc8d0d8), mount: 'none' };
    case 'phaseStone': return { grid: new VoxelGrid().sphere(0, 0, 0, 4, 3, 3, (x, y, z) => jit((x + y + z) % 3 === 0 ? 0xe8d8ff : 0x8a5ad8, x, y, z, 0.08)), mount: 'none' };
    case 'steadfastAmulet': return { grid: pendant(0x9ea2a8), mount: 'none' };
    case 'healingTotem': {
      const g = new VoxelGrid().box(-2, 0, -2, 4, 10, 4, (x, y, z) => jit(y % 3 === 0 ? 0x5a3a22 : WOOD, x, y, z, 0.06));
      g.box(-1, 6, 2, 1, 1, 1, 0x111111).box(1, 6, 2, 1, 1, 1, 0x111111).box(-3, 10, -1, 6, 2, 2, 0x6cc23c);
      return { grid: g, mount: 'none' };
    }
    case 'snareNet': {
      const g = new VoxelGrid();
      for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (x % 2 === 0 || z % 2 === 0) g.set(x, Math.round(Math.cos(x * 0.3) * 1.5), z, 0xd8c8a0);
      return { grid: g, mount: 'none' };
    }
    case 'stormEye': return { grid: new VoxelGrid().sphere(0, 0, 0, 4, 4, 4, (x, y, z) => (z > 2 && x * x + y * y < 4 ? (x * x + y * y < 1.5 ? 0x111111 : 0x5fe0ff) : jit(0xf2efe6, x, y, z, 0.05))), mount: 'none' };
    case 'wolfFang': {
      const g = pendant(0xf2e8d0, 0x5a3a22);
      g.box(-5, 0, 0, 1, 3, 1, 0xf2e8d0).box(4, 0, 0, 1, 3, 1, 0xf2e8d0);
      return { grid: g, mount: 'none' };
    }
    case 'luckyCharm': return { grid: pendant(0x5fbf3a), mount: 'none' };
    default: return null;
  }
}

/** Цвет камней вставленных рун и позиция на модели */
export function addRuneGems(g: VoxelGrid, runes: string[]) {
  runes.forEach((r, i) => g.set(1, 1 + i * 2, 1, RUNE_COLORS[r] ?? 0xffffff));
}
