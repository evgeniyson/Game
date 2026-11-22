// Воксельные модели природы и мелочей мира в мелком вокселе (1 воксель = 1/8 блока), с вариантами и LOD.
import * as THREE from 'three';
import { VoxelGrid, jit, mixHex, vhash } from './voxel';
import { D, VARIANTS } from '../world/decoTypes';
import { mulberry32 } from '../core/rng';
import { buildStructure } from './structureModels';

export const DS = 0.125;

type Rnd = () => number;

// ---------------- Деревья ----------------
function leafCanopy(g: VoxelGrid, lobes: [number, number, number, number][], dark: number, light: number, y0: number, y1: number, rnd: Rnd, accent?: { color: number; p: number }) {
  for (const [cx, cy, cz, r] of lobes) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (let y = Math.floor(cy - r * 0.8); y <= Math.ceil(cy + r * 0.85); y++)
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
          const e = ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.82)) ** 2 + ((z - cz) / r) ** 2;
          if (e > 1) continue;
          if (e > 0.72 && vhash(x, y, z, 3) < 0.38) continue; // рваный край
          const t = Math.min(1, Math.max(0, (y - y0) / Math.max(1, y1 - y0)));
          let c = jit(mixHex(dark, light, t * 0.9 + vhash(x, y, z, 5) * 0.15), x, y, z, 0.09);
          if (accent && e > 0.55 && y > cy - 1 && vhash(x, y, z, 9) < accent.p) c = jit(accent.color, x, y, z, 0.08);
          g.set(x, y, z, c);
        }
  }
  void rnd;
}

function bark(base: number) {
  return (x: number, y: number, z: number) => jit(vhash(x, Math.floor(y / 3), z, 1) < 0.25 ? mixHex(base, 0x000000, 0.25) : base, x, y, z, 0.07);
}

function oak(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const th = 13 + v * 2;
  const trunk = bark(0x6e4a2e);
  g.box(-1, 0, -1, 3, th, 3, trunk);
  // корни
  g.box(-2, 0, 0, 1, 2, 1, trunk).box(2, 0, 0, 1, 1, 1, trunk).box(0, 0, -2, 1, 1, 1, trunk).box(0, 0, 2, 1, 2, 1, trunk);
  const lobes: [number, number, number, number][] = [[0, th + 4, 0, 6.5]];
  const nb = 3 + (v === 1 ? 1 : 0);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rnd() * 0.8;
    const len = 4 + rnd() * 2;
    const by = th - 5 + Math.floor(rnd() * 4);
    const ex = Math.cos(a) * len,
      ez = Math.sin(a) * len;
    g.line([0, by, 0], [ex, by + 3, ez], 0.5, trunk);
    lobes.push([ex, by + 5, ez, 4.5 + rnd() * 1.2]);
  }
  leafCanopy(g, lobes, 0x3f7f2c, 0x9ccc5a, th - 3, th + 10, rnd, v === 2 ? { color: rnd() < 0.5 ? 0xffc0d8 : 0xfff2f0, p: 0.18 } : undefined);
  return g;
}

function pine(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const snowy = v === 2;
  const tiers = v === 1 ? 6 : 5;
  g.box(-1, 0, -1, 2, 6, 2, bark(0x5a3e28));
  let y = 4;
  for (let t = 0; t < tiers; t++) {
    const r0 = 6.5 - t * 0.95 + (v === 1 ? 0 : 0.4);
    for (let k = 0; k < 4; k++) {
      const r = r0 - k * 1.3;
      if (r < 0.8) break;
      for (let x = Math.floor(-r); x <= Math.ceil(r); x++)
        for (let z = Math.floor(-r); z <= Math.ceil(r); z++) {
          const ang = Math.atan2(z, x);
          const rr = r * (0.82 + 0.18 * Math.sin(ang * 5 + t * 1.7));
          if (x * x + z * z > rr * rr) continue;
          const top = k === 3 || x * x + z * z > (r - 1.3) ** 2 - 0.5;
          let c = jit(mixHex(0x2f6a3c, 0x4f9a55, t / tiers * 0.6 + vhash(x, y, z, 2) * 0.3), x, y + k, z, 0.08);
          if (snowy && top && vhash(x, y + k, z, 4) < 0.75) c = jit(0xf2f6ff, x, y, z, 0.04);
          g.set(x, y + k, z, c);
        }
    }
    y += 3;
  }
  g.box(0, y, 0, 1, 3, 1, snowy ? 0xf2f6ff : 0x4f9a55);
  void rnd;
  return g;
}

function birch(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const th = 17;
  g.box(-1, 0, -1, 2, th, 2, (x, y, z) => (vhash(x, y, z, 7) < 0.18 ? 0x2a2a2a : jit(0xeeeae0, x, y, z, 0.04)));
  const lobes: [number, number, number, number][] = [[0, th + 2, 0, 4]];
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    const by = 9 + Math.floor(rnd() * 7);
    const ex = Math.cos(a) * 3.5,
      ez = Math.sin(a) * 3.5;
    g.line([0, by, 0], [ex, by + 2, ez], 0.5, 0xd8d4c8);
    lobes.push([ex, by + 3, ez, 3 + rnd()]);
  }
  if (v === 1) leafCanopy(g, lobes, 0xc8861f, 0xf6d24a, 8, th + 5, rnd);
  else leafCanopy(g, lobes, 0x6aa83e, 0xb4dc6c, 8, th + 5, rnd);
  return g;
}

function deadTree(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const col = v === 1 ? 0x2a2420 : 0x55432f;
  const c = (x: number, y: number, z: number) => jit(col, x, y, z, 0.08);
  const branch = (p: [number, number, number], dir: [number, number, number], len: number, depth: number) => {
    let cur = p;
    for (let i = 0; i < len; i++) {
      const nx: [number, number, number] = [cur[0] + dir[0] + (rnd() - 0.5) * 0.8, cur[1] + dir[1], cur[2] + dir[2] + (rnd() - 0.5) * 0.8];
      g.line(cur, nx, depth > 1 ? 1 : 0.5, c);
      cur = nx;
    }
    if (depth > 0)
      for (let k = 0; k < 2; k++) {
        const a = rnd() * Math.PI * 2;
        branch(cur, [Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.9], Math.floor(len * 0.6) + 1, depth - 1);
      }
    else if (v === 2 && rnd() < 0.6) g.sphere(cur[0], cur[1], cur[2], 1.5, 1.2, 1.5, (x, y, z) => (vhash(x, y, z) < 0.6 ? jit(0xd88a3a, x, y, z, 0.1) : null));
  };
  branch([0, 0, 0], [0, 1, 0], 8, 3);
  g.box(-1, 0, -1, 2, 3, 2, c);
  return g;
}

function bush(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const n = 3 + Math.floor(rnd() * 2);
  const lobes: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) lobes.push([(rnd() - 0.5) * 4, 2.5 + rnd() * 1.5, (rnd() - 0.5) * 4, 2.6 + rnd()]);
  const accent = v === 0 ? { color: 0xd93a3a, p: 0.1 } : v === 1 ? { color: rnd() < 0.5 ? 0xffffff : 0xffa8d0, p: 0.14 } : undefined;
  leafCanopy(g, lobes, v === 2 ? 0x3a6a2a : 0x4a8a34, v === 2 ? 0x6a9a44 : 0x8cc457, 0, 6, rnd, accent);
  return g;
}

function rock(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const rx = v === 2 ? 6 : 4.5 + rnd(),
    ry = v === 2 ? 2.2 : 3.2 + rnd(),
    rz = v === 2 ? 4.5 : 3.8 + rnd();
  const base = v === 1 ? 0x9a8f80 : 0x8e9298;
  for (let x = -7; x <= 7; x++)
    for (let y = 0; y <= 8; y++)
      for (let z = -7; z <= 7; z++) {
        const e = (x / rx) ** 2 + ((y - 0.5) / ry) ** 2 + (z / rz) ** 2;
        if (e > 1 + (vhash(x, y, z, 11) - 0.5) * 0.35) continue;
        let c = mixHex(base, 0x000000, (Math.floor(y / 2) % 2) * 0.08);
        if (y >= ry - 0.5 && vhash(x, y, z, 12) < 0.55) c = mixHex(0x7fb24a, 0x5a8a34, vhash(x, y, z, 13));
        if (v === 2 && Math.abs(x - z * 0.5) < 0.6 && y > 0) continue; // трещина
        g.set(x, y, z, jit(c, x, y, z, 0.1));
      }
  return g;
}

function cactus(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const rib = (x: number, y: number, z: number) => jit((x + z) % 2 === 0 ? 0x5f9e48 : 0x4c8a3a, x, y, z, 0.06);
  if (v === 1) {
    g.sphere(0, 4, 0, 4.5, 4.5, 4.5, rib);
    g.box(-1, 8, -1, 2, 1, 2, 0xffd040).set(0, 9, 0, 0xff7aa8);
    return g;
  }
  const h = 16 + Math.floor(rnd() * 4);
  g.cyl(0, 0, 0, 2.2, h, rib);
  g.sphere(0, h, 0, 2.2, 1.5, 2.2, rib);
  const arm = (side: number, y: number, len: number) => {
    g.box(side > 0 ? 2 : -2 - 3, y, -1, 4, 3, 3, rib);
    g.cyl(side * 5, y, 0.5, 1.6, len, rib);
  };
  arm(1, 6 + Math.floor(rnd() * 3), 6);
  if (rnd() < 0.7) arm(-1, 9, 5);
  g.set(0, h + 2, 0, 0xff7aa8);
  g.set(1, h + 1, 0, 0xffd040);
  return g;
}

function mushroom(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const capCol = v === 2 ? 0x4ac8ff : 0xd8443a;
  const one = (ox: number, oz: number, s: number) => {
    g.cyl(ox, 0, oz, 1 * s, 4 * s, 0xefe6d0);
    g.sphere(ox, 4 * s + 0.5, oz, 3 * s, 1.6 * s, 3 * s, (x, y, z) => (y < 4 * s ? null : vhash(x, y, z, 21) < 0.16 ? 0xffffff : jit(capCol, x, y, z, 0.07)));
  };
  one(0, 0, 1);
  if (v >= 1) {
    one(4, 1, 0.6);
    one(-3, 3, 0.5);
  }
  void rnd;
  return g;
}

function crystal(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const a = v === 1 ? 0xc89aff : 0x7fe0ff,
    b = v === 1 ? 0xf0d8ff : 0xd8faff;
  const prism = (x: number, z: number, h: number, w: number) => {
    for (let y = 0; y < h; y++) {
      const ww = y > h - 3 ? Math.max(0, w - (y - (h - 3))) : w;
      g.box(x - Math.floor(ww / 2), y, z - Math.floor(ww / 2), Math.max(1, ww), 1, Math.max(1, ww), (xx, yy, zz) => jit(yy % 3 === 0 ? b : a, xx, yy, zz, 0.06));
    }
  };
  prism(0, 0, 13, 3);
  prism(3, 1, 8, 2);
  prism(-3, 2, 7, 2);
  prism(1, -3, 6, 2);
  g.sphere(0, 0, 0, 4, 1, 4, 0x8d9096);
  void rnd;
  return g;
}

function herb(): VoxelGrid {
  const g = new VoxelGrid();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.line([0, 0, 0], [Math.cos(a) * 2, 3, Math.sin(a) * 2], 0.5, 0x4f9a3a);
    g.set(Math.cos(a) * 2, 4, Math.sin(a) * 2, 0xff8ad8);
  }
  g.set(0, 3, 0, 0xffffff);
  return g;
}

function reeds(rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  for (let i = 0; i < 6; i++) {
    const x = Math.floor((rnd() - 0.5) * 6),
      z = Math.floor((rnd() - 0.5) * 6);
    const h = 6 + Math.floor(rnd() * 5);
    g.box(x, 0, z, 1, h, 1, (xx, y, zz) => jit(0x7a9a3a, xx, y, zz, 0.1));
    if (rnd() < 0.6) g.box(x, h, z, 1, 2, 1, 0x6b4a2f);
  }
  return g;
}

function tuft(v: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  for (let i = 0; i < 7; i++) {
    const x = Math.floor((rnd() - 0.5) * 5),
      z = Math.floor((rnd() - 0.5) * 5);
    g.box(x, 0, z, 1, 2 + Math.floor(rnd() * 3), 1, (xx, y, zz) => jit(v ? 0x9ab84a : 0x7cc94a, xx, y, zz, 0.12));
  }
  return g;
}

function flower(color: number, rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  for (let i = 0; i < 3; i++) {
    const x = Math.floor((rnd() - 0.5) * 5),
      z = Math.floor((rnd() - 0.5) * 5);
    const h = 3 + Math.floor(rnd() * 2);
    g.box(x, 0, z, 1, h, 1, 0x5aa83a);
    g.set(x, h, z, 0xffe066);
    g.set(x + 1, h, z, color).set(x - 1, h, z, color);
    g.set(x, h, z + 1, color);
    g.set(x, h, z - 1, color);
  }
  return g;
}

function car(v: number): VoxelGrid {
  const g = new VoxelGrid();
  const body = v === 1 ? 0xe0884a : 0x6fcfb6;
  const rust = 0x9a5a34;
  const paint = (x: number, y: number, z: number) => jit(vhash(x, y, z, 31) < 0.12 ? rust : body, x, y, z, 0.05);
  g.box(-8, 2, -16, 16, 6, 32, paint); // кузов
  g.box(-8, 2, 15, 16, 2, 2, 0x8a8a8a).box(-8, 2, -17, 16, 2, 2, 0x8a8a8a); // бамперы
  g.box(-7, 8, -7, 14, 5, 15, (x, y, z) => (y >= 9 && (Math.abs(x) >= 6 || z === -7 || z === 7) && y <= 11 ? 0x3b4b5c : paint(x, y, z))); // салон с окнами
  for (const [x, z] of [[-9, -11], [8, -11], [-9, 9], [8, 9]]) {
    g.box(x, 0, z, 1, 5, 5, (xx, y, zz) => (y === 2 && zz === z + 2 ? 0xbababa : 0x222222));
  }
  g.box(-6, 4, 16, 3, 2, 1, 0xffe8a0).box(3, 4, 16, 3, 2, 1, 0xffe8a0);
  g.box(-6, 4, -17, 3, 2, 1, 0xd03030).box(3, 4, -17, 3, 2, 1, 0xd03030);
  // мох, трава и лианы
  for (let x = -7; x <= 6; x++) for (let z = -7; z <= 7; z++) if (vhash(x, 13, z, 33) < 0.55) g.set(x, 13, z, jit(vhash(x, 0, z, 34) < 0.5 ? 0x6cc23c : 0x8fcf4f, x, 13, z, 0.1));
  for (let x = -7; x <= 6; x++) for (let z = -15; z <= -8; z++) if (vhash(x, 8, z, 35) < 0.35) g.set(x, 8, z, 0x7cc94a);
  for (let y = 2; y < 8; y++) if (vhash(-8, y, 3, 36) < 0.7) g.set(-9, y, 3 + (y % 2), 0x5fb33b);
  return g;
}

function van(): VoxelGrid {
  const g = new VoxelGrid();
  const paint = (x: number, y: number, z: number) => jit(vhash(x, y, z, 41) < 0.08 ? 0xa06a40 : 0xf0eee6, x, y, z, 0.04);
  g.box(-9, 2, -18, 18, 14, 30, paint);
  g.box(-9, 2, 12, 18, 8, 6, paint);
  g.box(-8, 10, 12, 16, 5, 4, (x, y, z) => (z >= 14 && y <= 13 ? 0x3b4b5c : 0xf0eee6));
  g.box(-9, 7, -18, 18, 1, 30, 0x4a9ae0);
  for (const [x, z] of [[-10, -14], [9, -14], [-10, 8], [9, 8]]) g.box(x, 0, z, 1, 5, 5, (xx, y, zz) => (y === 2 && zz === z + 2 ? 0xbababa : 0x222222));
  g.box(-7, 4, 18, 3, 2, 1, 0xffe8a0).box(4, 4, 18, 3, 2, 1, 0xffe8a0);
  for (let x = -8; x <= 8; x++) for (let z = -17; z <= 10; z++) if (vhash(x, 16, z, 43) < 0.6) g.set(x, 16, z, jit(0x6cc23c, x, 16, z, 0.12));
  for (let y = 2; y < 16; y++) for (let z = -17; z < 10; z += 5) if (vhash(z, y, 0, 44) < 0.6) g.set(-10, y, z + (y % 3), 0x5fb33b);
  return g;
}

function trashBin(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-4, 0, -4, 8, 9, 8, (x, y, z) => (y === 5 && z === 3 && x >= -1 && x <= 0 ? 0xd7f0d0 : jit(y % 4 === 0 ? 0x3f7a3d : 0x4c8c4a, x, y, z, 0.06)));
  g.box(-5, 9, -5, 10, 1, 10, 0x3a6a38);
  g.box(-1, 10, -2, 2, 1, 4, 0x2a4a28);
  return g;
}

function scrap(rnd: Rnd): VoxelGrid {
  const g = new VoxelGrid();
  const cols = [0xa0603a, 0x7d7f84, 0x5a5d63, 0xb8b0a0, 0x8a4a2a];
  for (let i = 0; i < 8; i++) {
    const w = 2 + Math.floor(rnd() * 4),
      h = 1 + Math.floor(rnd() * 3),
      d = 2 + Math.floor(rnd() * 4);
    g.box(Math.floor((rnd() - 0.5) * 8), Math.floor(rnd() * 3), Math.floor((rnd() - 0.5) * 8), w, h, d, (x, y, z) => jit(cols[i % cols.length], x, y, z, 0.1));
  }
  // шина
  for (let a = 0; a < Math.PI * 2; a += 0.3) g.set(4 + Math.cos(a) * 3, 0, -3 + Math.sin(a) * 3, 0x222222);
  return g;
}

// ---------------- Сборка ----------------
export function buildDeco(t: D, v: number): VoxelGrid {
  const rnd = mulberry32(t * 1000 + v * 17 + 5);
  switch (t) {
    case D.TreeOak: return oak(v, rnd);
    case D.TreePine: return pine(v, rnd);
    case D.TreeBirch: return birch(v, rnd);
    case D.Bush: return bush(v, rnd);
    case D.Rock: return rock(v, rnd);
    case D.GrassTuft: return tuft(v, rnd);
    case D.FlowerRed: return flower(0xe8564a, rnd);
    case D.FlowerYellow: return flower(0xf4d03f, rnd);
    case D.Car: return car(v);
    case D.Van: return van();
    case D.TrashBin: return trashBin();
    case D.DeadTree: return deadTree(v, rnd);
    case D.Cactus: return cactus(v, rnd);
    case D.Mushroom: return mushroom(v, rnd);
    case D.Crystal: return crystal(v, rnd);
    case D.Herb: return herb();
    case D.ScrapPile: return scrap(rnd);
    case D.Reeds: return reeds(rnd);
    default: return buildStructure(t, v, rnd);
  }
}

const cache = new Map<string, THREE.BufferGeometry>();

/** Геометрия декорации: lod 0 — детальная, 1 — грубая (для дальних чанков) */
export function decoGeometry(t: D, v: number, lod: 0 | 1): THREE.BufferGeometry {
  const k = `${t}:${v}:${lod}`;
  let g = cache.get(k);
  if (!g) {
    const grid = buildDeco(t, Math.min(v, VARIANTS[t] - 1));
    g = lod === 0 ? grid.toGeometry(DS) : grid.downsample(2).toGeometry(DS * 2);
    cache.set(k, g);
  }
  return g;
}

export { SMALL_DECO } from '../world/decoTypes';
