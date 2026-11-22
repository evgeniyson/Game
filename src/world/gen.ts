// Процедурная генерация мира: рельеф, биомы, руины, Колоссы, лагерь и декорации.
// Чистый модуль — работает и в воркере, и в тестах.
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32, hash2, hash3 } from '../core/rng';
import { B } from './blocks';
import { D, VARIANTS } from './decoTypes';

export const CHUNK = 32;
export const HEIGHT = 64;
export const SEA = 10;
export const PAD = CHUNK + 2;
export const GROUND = 15; // базовая высота равнин/городов
export const CAMP_RADIUS = 16;

export const enum Biome {
  Meadow = 0,
  City,
  Forest,
  Swamp,
  Desert,
  Snow,
  Camp,
}

export const BIOME_NAMES = ['Цветущие луга', 'Заросший мегаполис', 'Тёмный лес', 'Ржавое болото', 'Пустошь', 'Снежные пики', 'Лагерь выживших'];

export interface ChunkData {
  cx: number;
  cz: number;
  blocks: Uint8Array; // PAD*PAD*HEIGHT
  heights: Uint8Array; // CHUNK*CHUNK, высота, на которой стоит существо (верх твёрдого блока + 1)
  tops: Uint8Array; // CHUNK*CHUNK, id верхнего блока (для миникарты)
  biomes: Uint8Array; // CHUNK*CHUNK
  decos: Float32Array; // stride 7: type,x,y,z,rot,scale,variant
}

export const pidx = (x: number, y: number, z: number) => x + 1 + (z + 1) * PAD + y * PAD * PAD;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Colossus {
  x: number;
  z: number;
  rot: number; // 0..3 — поворот на 90°
}

/** Ящики, бочки, фонари и скамьи в лагере: [тип, x, z, поворот, вариант] */
const CAMP_PROPS: [D, number, number, number, number][] = [
  [D.Crate, -7.5, -11.5, 0.2, 0], [D.Crate, -8.6, -12.3, 0.9, 1], [D.Barrel, 7.8, -11.8, 0, 0], [D.Barrel, 8.7, -10.9, 0, 1],
  [D.LogPile, -13.5, 4.5, Math.PI / 2, 0], [D.Bench, 2.5, 3.5, 0, 0], [D.Bench, -2.5, -3.2, Math.PI, 0],
  [D.Lantern, 2.6, 1.8, 0, 0], [D.Lantern, -2.2, -1.6, 0, 0], [D.LampPost, 2.6, 15.2, 0, 0], [D.LampPost, -2.4, -15.2, Math.PI, 0],
  [D.Crate, 12.4, 5.6, 0.4, 0], [D.Suitcase, 10.6, 9.8, 0.5, 1], [D.Signpost, 3.2, 17.5, 0.1, 0],
];

export interface SitePiece {
  t: D;
  x: number;
  z: number;
  rot: number;
  s: number;
  v: number;
}

export interface Site {
  kind: 'ruins' | 'cabins' | 'crash';
  x: number;
  z: number;
  baseH: number;
  radius: number;
  pieces: SitePiece[];
}

interface Building {
  x0: number;
  z0: number;
  w: number;
  d: number;
  h: number;
  mat: number;
  seed: number;
}

export class WorldGen {
  readonly seed: number;
  private nCont: NoiseFunction2D;
  private nHill: NoiseFunction2D;
  private nDet: NoiseFunction2D;
  private nTemp: NoiseFunction2D;
  private nMoist: NoiseFunction2D;
  private nRuin: NoiseFunction2D;
  private nRidge: NoiseFunction2D;
  private colossusCache = new Map<string, Colossus | null>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.nCont = createNoise2D(mulberry32(this.seed + 1));
    this.nHill = createNoise2D(mulberry32(this.seed + 2));
    this.nDet = createNoise2D(mulberry32(this.seed + 3));
    this.nTemp = createNoise2D(mulberry32(this.seed + 4));
    this.nMoist = createNoise2D(mulberry32(this.seed + 5));
    this.nRuin = createNoise2D(mulberry32(this.seed + 6));
    this.nRidge = createNoise2D(mulberry32(this.seed + 7));
  }

  // ---------- Колоссы ----------
  static readonly REGION = 360;

  colossusInRegion(rx: number, rz: number): Colossus | null {
    const key = rx + ',' + rz;
    if (this.colossusCache.has(key)) return this.colossusCache.get(key)!;
    let c: Colossus | null = null;
    if (rx === 0 && rz === 0) {
      c = { x: 70, z: -58, rot: 0 }; // первый Колосс недалеко от лагеря
    } else if (hash2(rx, rz, this.seed ^ 0xc0105) < 0.75) {
      const R = WorldGen.REGION;
      c = {
        x: Math.floor(rx * R + 60 + hash2(rx, rz, this.seed + 11) * (R - 120)),
        z: Math.floor(rz * R + 60 + hash2(rx, rz, this.seed + 12) * (R - 120)),
        rot: Math.floor(hash2(rx, rz, this.seed + 13) * 2),
      };
    }
    this.colossusCache.set(key, c);
    return c;
  }

  colossiNear(x: number, z: number): Colossus[] {
    const R = WorldGen.REGION;
    const rx = Math.floor(x / R);
    const rz = Math.floor(z / R);
    const out: Colossus[] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const c = this.colossusInRegion(rx + i, rz + j);
        if (c) out.push(c);
      }
    return out;
  }

  // ---------- Рельеф и биомы ----------
  private fbm(n: NoiseFunction2D, x: number, z: number, oct: number): number {
    let a = 1,
      f = 1,
      s = 0,
      t = 0;
    for (let i = 0; i < oct; i++) {
      s += n(x * f, z * f) * a;
      t += a;
      a *= 0.5;
      f *= 2;
    }
    return s / t;
  }

  /** Высота и биом с учётом выравнивания площадок под «места» */
  sample(x: number, z: number): { h: number; biome: Biome; city: number } {
    const b = this.sampleBase(x, z);
    for (const st of this.sitesNear(x, z)) {
      const d = Math.hypot(x - st.x, z - st.z);
      const f = 1 - smooth(st.radius, st.radius + 10, d);
      if (f > 0) b.h = Math.floor(lerp(b.h, st.baseH, f) + 0.5);
    }
    return b;
  }

  /** Возвращает [высоту поверхности (верхний твёрдый блок), биом] без учёта построек */
  sampleBase(x: number, z: number): { h: number; biome: Biome; city: number } {
    const d = Math.hypot(x, z);
    const far = smooth(40, 70, d);
    const temp = this.fbm(this.nTemp, x / 520, z / 520, 2);
    const moist = this.fbm(this.nMoist, x / 430, z / 430, 2);
    const ruin = this.fbm(this.nRuin, x / 300, z / 300, 2) + (1 - smooth(60, 160, Math.abs(d - 130))) * 0.18;
    const cont = this.fbm(this.nCont, x / 260, z / 260, 3);
    const hill = this.fbm(this.nHill, x / 70, z / 70, 3);
    const det = this.nDet(x / 18, z / 18);

    let h = GROUND + 1 + cont * 6 + hill * 4.5 + det * 1.2;

    const mountain = smooth(-0.28, -0.55, temp) * far;
    const ridge = 1 - Math.abs(this.fbm(this.nRidge, x / 90, z / 90, 3));
    h += mountain * (ridge * ridge * 26 + 4);

    const desert = smooth(0.3, 0.5, temp) * smooth(0.05, -0.15, moist) * far * (1 - mountain);
    h = lerp(h, GROUND + 1 + Math.abs(this.nHill(x / 40, z / 40)) * 3, desert * 0.7);

    const swamp = smooth(0.28, 0.48, moist) * far * (1 - mountain) * (1 - desert);
    h = lerp(h, SEA + 0.3 + det * 0.9, swamp);

    const city = smooth(0.16, 0.3, ruin) * far * (1 - mountain) * (1 - swamp * 0.8);
    h = lerp(h, GROUND, city * 0.92);

    // Площадки вокруг Колоссов
    for (const c of this.colossiNear(x, z)) {
      const cd = Math.hypot(x - c.x, z - c.z);
      const f = 1 - smooth(24, 46, cd);
      if (f > 0) h = lerp(h, GROUND, f);
    }

    // Лагерь
    const campF = 1 - smooth(CAMP_RADIUS + 2, 44, d);
    h = lerp(h, GROUND, campF);

    let biome: Biome;
    if (d < CAMP_RADIUS + 2) biome = Biome.Camp;
    else if (mountain > 0.5) biome = Biome.Snow;
    else if (city > 0.55) biome = Biome.City;
    else if (swamp > 0.5) biome = Biome.Swamp;
    else if (desert > 0.5) biome = Biome.Desert;
    else if (moist > -0.02 && far > 0.5) biome = Biome.Forest;
    else biome = Biome.Meadow;

    return { h: Math.max(1, Math.min(HEIGHT - 8, Math.floor(h))), biome, city };
  }

  // ---------- «Места»: руины, избы, крушения ----------
  static readonly SITE = 96;
  private siteCache = new Map<string, Site | null>();

  siteInCell(gx: number, gz: number): Site | null {
    const key = gx + ',' + gz;
    if (this.siteCache.has(key)) return this.siteCache.get(key)!;
    const site = this.makeSite(gx, gz);
    this.siteCache.set(key, site);
    return site;
  }

  sitesNear(x: number, z: number): Site[] {
    const S = WorldGen.SITE;
    const gx = Math.floor(x / S),
      gz = Math.floor(z / S);
    const out: Site[] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const st = this.siteInCell(gx + i, gz + j);
        if (st && Math.abs(st.x - x) < st.radius + 12 && Math.abs(st.z - z) < st.radius + 12) out.push(st);
      }
    return out;
  }

  private makeSite(gx: number, gz: number): Site | null {
    const S = WorldGen.SITE;
    const r = mulberry32(Math.floor(hash2(gx, gz, this.seed ^ 0x517e) * 1e9));
    const x = Math.floor(gx * S + 24 + r() * (S - 48)) + 0.5;
    const z = Math.floor(gz * S + 24 + r() * (S - 48)) + 0.5;
    if (Math.hypot(x, z) < 80) return null;
    for (const c of this.colossiNear(x, z)) if (Math.hypot(c.x - x, c.z - z) < 62) return null;
    const base = this.sampleBase(x, z);
    if (base.h <= SEA + 1 || base.city > 0.3) return null;
    const roll = r();
    let kind: Site['kind'] | null = null;
    if (base.biome === Biome.Desert) kind = roll < 0.75 ? 'ruins' : roll < 0.9 ? 'crash' : null;
    else if (base.biome === Biome.Snow) kind = roll < 0.7 ? 'cabins' : null;
    else if (base.biome === Biome.Forest) kind = roll < 0.35 ? 'cabins' : roll < 0.5 ? 'crash' : null;
    else if (base.biome === Biome.Meadow) kind = roll < 0.3 ? 'crash' : null;
    if (!kind) return null;
    const rot = Math.floor(r() * 4) * (Math.PI / 2);
    const pieces: SitePiece[] = [];
    const add = (t: D, px: number, pz: number, prot = 0, sc = 1, v = Math.floor(r() * VARIANTS[t])) => pieces.push({ t, x: px, z: pz, rot: prot, s: sc, v });
    const ring = (n: number, r0: number, r1: number, fn: (px: number, pz: number, a: number) => void) => {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2,
          d = r0 + r() * (r1 - r0);
        fn(Math.cos(a) * d, Math.sin(a) * d, a);
      }
    };
    let radius = 12;
    if (kind === 'ruins') {
      radius = 17;
      add(D.Colonnade, 0, 0, 0, 1, 0);
      ring(5, 6, 12, (px, pz) => add(r() < 0.45 ? D.Column : D.ColumnBroken, px, pz, r() * Math.PI * 2));
      add(D.Arch, 10 * (r() < 0.5 ? 1 : -1), 6 * (r() < 0.5 ? 1 : -1), Math.PI / 2, 1, 0);
      if (r() < 0.7) add(D.Aqueduct, 0, -13, 0, 1, 0);
      ring(6, 4, 15, (px, pz) => add(D.Rubble, px, pz, r() * 6.28));
      ring(3, 8, 16, (px, pz) => add(D.SandMound, px, pz, r() * 6.28));
      ring(2, 10, 16, (px, pz) => add(D.DeadTree, px, pz, r() * 6.28, 1.2, Math.floor(r() * 2)));
    } else if (kind === 'cabins') {
      radius = 14;
      const snowy = base.biome === Biome.Snow ? 1 : 0;
      add(D.Cabin, 0, -1, 0, 1, snowy);
      if (r() < 0.5) add(D.Cabin, -12, -2, Math.PI / 2, 1, snowy);
      for (const fx of [-7.5, -4.5, 4.5, 7.5]) add(D.Fence, fx, 7.5, 0, 1, snowy);
      for (const fx of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) add(D.Fence, fx, -7.5, 0, 1, snowy);
      for (const fz of [-6, -3, 0, 3, 6]) {
        add(D.Fence, 9, fz, Math.PI / 2, 1, snowy);
        if (pieces.every((p) => p.t !== D.Cabin || p.x > -5)) add(D.Fence, -9, fz, Math.PI / 2, 1, snowy);
      }
      add(D.LampPost, 2.8, 8.5, 0, 1, 0);
      add(D.LogPile, 6, 2.5, Math.PI / 2, 1, snowy);
      add(D.Bench, -5.5, 4.5, 0, 1, 0);
      add(D.Signpost, -2.6, 9.5, 0.3, 1, 0);
      add(D.Lantern, 1.6, 3.6, 0, 1, 0);
      ring(7, 11, 15, (px, pz) => add(D.TreePine, px, pz, r() * 6.28, 0.9 + r() * 0.5, snowy ? 2 : Math.floor(r() * 2)));
    } else {
      radius = 10;
      const plane = r() < 0.7;
      add(plane ? D.PlaneWreck : D.TruckWreck, 0, 0, r() * 0.6 - 0.3, 1, 0);
      ring(4, 3.5, 7, (px, pz) => add(D.Crate, px, pz, r() * 6.28));
      ring(2, 4, 7, (px, pz) => add(D.Barrel, px, pz, r() * 6.28));
      ring(3, 3, 8, (px, pz) => add(D.Suitcase, px, pz, r() * 6.28));
      ring(2, 5, 9, (px, pz) => add(D.Rubble, px, pz, r() * 6.28, 1, 2));
      const ca = r() * Math.PI * 2;
      add(D.Chest, Math.cos(ca) * 5, Math.sin(ca) * 5, ca + Math.PI / 2, 1, 0);
    }
    // поворот всего места
    const cs = Math.cos(rot),
      sn = Math.sin(rot);
    for (const p of pieces) {
      const lx = p.x,
        lz = p.z;
      p.x = x + lx * cs + lz * sn;
      p.z = z - lx * sn + lz * cs;
      p.rot += rot;
    }
    return { kind, x, z, baseH: base.h, radius, pieces };
  }

  // ---------- Постройки ----------
  static readonly CELL = 40;

  buildingInCell(gx: number, gz: number): Building | null {
    const C = WorldGen.CELL;
    const cxw = gx * C + C / 2;
    const czw = gz * C + C / 2;
    const s = this.sample(cxw, czw);
    if (s.city < 0.6 || s.biome !== Biome.City) return null;
    const r = mulberry32(Math.floor(hash2(gx, gz, this.seed ^ 0xb11d) * 1e9));
    if (r() < 0.12) return null; // парк
    const w = 8 + Math.floor(r() * 9);
    const d = 8 + Math.floor(r() * 9);
    const x0 = gx * C + 7 + Math.floor(r() * (C - 14 - w));
    const z0 = gz * C + 7 + Math.floor(r() * (C - 14 - d));
    const h = 8 + Math.floor(r() * r() * 22);
    const mats = [B.Concrete, B.ConcretePink, B.ConcreteBeige, B.Brick, B.Concrete];
    return { x0, z0, w, d, h, mat: mats[Math.floor(r() * mats.length)], seed: Math.floor(r() * 1e9) };
  }

  isRoad(x: number, z: number): boolean {
    const C = WorldGen.CELL;
    const mx = ((x % C) + C) % C;
    const mz = ((z % C) + C) % C;
    return mx < 4 || mz < 4;
  }

  // ---------- Генерация чанка ----------
  generate(cx: number, cz: number): ChunkData {
    const blocks = new Uint8Array(PAD * PAD * HEIGHT);
    const heights = new Uint8Array(CHUNK * CHUNK);
    const tops = new Uint8Array(CHUNK * CHUNK);
    const biomes = new Uint8Array(CHUNK * CHUNK);
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const seed = this.seed;

    // 1. рельеф
    for (let lz = -1; lz <= CHUNK; lz++)
      for (let lx = -1; lx <= CHUNK; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const s = this.sample(wx, wz);
        const h = s.h;
        if (lx >= 0 && lz >= 0 && lx < CHUNK && lz < CHUNK) biomes[lx + lz * CHUNK] = s.biome;
        let surf: number = B.Grass;
        let sub: number = B.Dirt;
        switch (s.biome) {
          case Biome.Forest:
            surf = B.DarkGrass;
            break;
          case Biome.Swamp:
            surf = hash2(wx, wz, seed) < 0.5 ? B.Mud : B.Moss;
            sub = B.Mud;
            break;
          case Biome.Desert:
            surf = B.Sand;
            sub = B.Sand;
            break;
          case Biome.Snow:
            surf = h > 18 ? (hash2(wx, wz, seed) < 0.93 ? B.Snow : B.Stone) : hash2(wx, wz, seed) < 0.75 ? B.Snow : B.DarkGrass;
            sub = B.Stone;
            break;
          case Biome.City:
            if (this.isRoad(wx, wz)) {
              const C = WorldGen.CELL;
              const mx = ((wx % C) + C) % C;
              const mz = ((wz % C) + C) % C;
              const crack = hash2(wx, wz, seed + 9);
              if (crack < 0.12) surf = B.Grass;
              else if (crack < 0.2) surf = B.Gravel;
              else if ((mx === 2 && mz >= 4 && (wz & 3) < 2) || (mz === 2 && mx >= 4 && (wx & 3) < 2)) surf = B.RoadLine;
              else surf = B.Asphalt;
              sub = B.Gravel;
            }
            break;
          case Biome.Camp: {
            const d = Math.hypot(wx, wz);
            if (d < 6 || Math.abs(wx) < 2 || Math.abs(wz) < 2) surf = B.Path;
            break;
          }
        }
        if (h <= SEA && s.biome !== Biome.Swamp) {
          surf = B.Sand;
          sub = B.Sand;
        }
        for (let y = 0; y <= h; y++) {
          let b: number;
          if (y === h) b = surf;
          else if (y > h - 4) b = sub;
          else b = B.Stone;
          blocks[pidx(lx, y, lz)] = b;
        }
        for (let y = h + 1; y < SEA; y++) blocks[pidx(lx, y, lz)] = B.Water;
      }

    // 2. постройки
    const C = WorldGen.CELL;
    const gx0 = Math.floor((ox - 1) / C);
    const gx1 = Math.floor((ox + CHUNK) / C);
    const gz0 = Math.floor((oz - 1) / C);
    const gz1 = Math.floor((oz + CHUNK) / C);
    for (let gz = gz0; gz <= gz1; gz++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const b = this.buildingInCell(gx, gz);
        if (b) this.stampBuilding(blocks, ox, oz, b);
      }

    // 3. Колоссы
    for (const c of this.colossiNear(ox + 16, oz + 16)) {
      if (Math.abs(c.x - (ox + 16)) < 60 && Math.abs(c.z - (oz + 16)) < 60) this.stampColossus(blocks, ox, oz, c);
    }

    // 4. лагерь
    if (Math.abs(ox + 16) < 60 && Math.abs(oz + 16) < 60) this.stampCamp(blocks, ox, oz);

    // 5. высоты
    for (let lz = 0; lz < CHUNK; lz++)
      for (let lx = 0; lx < CHUNK; lx++) {
        let y = HEIGHT - 1;
        while (y > 0) {
          const b = blocks[pidx(lx, y, lz)];
          if (b !== B.Air && b !== B.Water) break;
          y--;
        }
        heights[lx + lz * CHUNK] = y + 1;
        const top = blocks[pidx(lx, y + 1, lz)] === B.Water ? B.Water : blocks[pidx(lx, y, lz)];
        tops[lx + lz * CHUNK] = top;
      }

    // 6. декорации
    const decos = this.placeDecos(ox, oz, blocks, heights, biomes);

    return { cx, cz, blocks, heights, tops, biomes, decos };
  }

  private setB(blocks: Uint8Array, ox: number, oz: number, wx: number, wy: number, wz: number, b: number) {
    const lx = wx - ox;
    const lz = wz - oz;
    if (lx < -1 || lz < -1 || lx > CHUNK || lz > CHUNK || wy < 0 || wy >= HEIGHT) return;
    blocks[pidx(lx, wy, lz)] = b;
  }
  private getB(blocks: Uint8Array, ox: number, oz: number, wx: number, wy: number, wz: number): number {
    const lx = wx - ox;
    const lz = wz - oz;
    if (lx < -1 || lz < -1 || lx > CHUNK || lz > CHUNK || wy < 0 || wy >= HEIGHT) return 0;
    return blocks[pidx(lx, wy, lz)];
  }

  private stampBuilding(blocks: Uint8Array, ox: number, oz: number, b: Building) {
    const x1 = b.x0 + b.w - 1;
    const z1 = b.z0 + b.d - 1;
    if (x1 < ox - 1 || b.x0 > ox + CHUNK || z1 < oz - 1 || b.z0 > oz + CHUNK) return;
    const base = GROUND + 1;
    // Угол обрушения
    const collapseX = hash2(b.seed, 1, 7) < 0.5 ? b.x0 : x1;
    const collapseZ = hash2(b.seed, 2, 7) < 0.5 ? b.z0 : z1;
    const collapse = hash2(b.seed, 3, 7) * 10;
    for (let z = b.z0; z <= z1; z++)
      for (let x = b.x0; x <= x1; x++) {
        if (x < ox - 1 || x > ox + CHUNK || z < oz - 1 || z > oz + CHUNK) continue;
        const edge = x === b.x0 || x === x1 || z === b.z0 || z === z1;
        const cd = Math.hypot(x - collapseX, z - collapseZ);
        const loss = Math.max(0, collapse - cd * 0.9) + hash2(x, z, b.seed) * 2;
        const top = Math.max(base + 2, Math.floor(base + b.h - loss));
        const along = x === b.x0 || x === x1 ? z : x;
        const vine = hash2(along, x === b.x0 || x === x1 ? x : z + 999, b.seed) < 0.28;
        const vineTop = base + Math.floor(hash2(along, 5, b.seed) * b.h);
        for (let y = GROUND - 3; y < top; y++) {
          const ly = y - base;
          let blk = 0;
          if (edge) {
            const corner = (x === b.x0 || x === x1) && (z === b.z0 || z === z1);
            const isWin = !corner && ly > 0 && ly % 4 !== 0 && ly % 4 !== 3 && along % 3 !== 0;
            blk = isWin ? B.Window : b.mat;
            if (vine && y <= vineTop && !isWin) blk = B.Vine;
            if (vine && y <= vineTop && isWin && hash3(x, y, z, b.seed) < 0.5) blk = B.Leaves;
          } else if (ly >= 0 && ly % 4 === 0) blk = B.Concrete;
          else if (ly < 0) blk = B.Concrete;
          if (blk) this.setB(blocks, ox, oz, x, y, z, blk);
        }
        // Крыша-сад
        const roofR = hash2(x, z, b.seed + 5);
        if (roofR < 0.55) this.setB(blocks, ox, oz, x, top, z, roofR < 0.2 ? B.Leaves : B.Moss);
        if (roofR < 0.12) this.setB(blocks, ox, oz, x, top + 1, z, B.Leaves);
      }
  }

  /** Поваленная статуя-колосс из окислившейся меди, поросшая мхом */
  private stampColossus(blocks: Uint8Array, ox: number, oz: number, c: Colossus) {
    const base = GROUND + 1;
    const seed = this.seed + c.x * 31 + c.z;
    const rot = (lx: number, lz: number): [number, number] => (c.rot === 0 ? [c.x + lx, c.z + lz] : [c.x - lz, c.z + lx]);
    const put = (lx: number, ly: number, lz: number, b: number) => {
      const [wx, wz] = rot(lx, lz);
      this.setB(blocks, ox, oz, wx, base + ly, wz, b);
    };
    const copper = (lx: number, ly: number, lz: number) => {
      const r = hash3(lx, ly, lz, seed);
      if (r < 0.12) return B.CopperDark;
      if (ly > 9 && r > 0.85) return B.CopperLight;
      return B.Copper;
    };
    // Быстрая отсечка по габаритам
    const [ax, az] = rot(-17, -12);
    const [bx, bz] = rot(28, 14);
    if (Math.max(ax, bx) < ox - 1 || Math.min(ax, bx) > ox + CHUNK || Math.max(az, bz) < oz - 1 || Math.min(az, bz) > oz + CHUNK) return;

    // Голова: эллипсоид, лицом к +z (к камере)
    const hx = 0,
      hy = 7,
      hz = 0,
      rx = 6.5,
      ry = 7.5,
      rz = 5.5;
    for (let ly = -3; ly <= 16; ly++)
      for (let lz = -7; lz <= 9; lz++)
        for (let lx = -8; lx <= 8; lx++) {
          const e = ((lx - hx) / rx) ** 2 + ((ly - hy) / ry) ** 2 + ((lz - hz) / rz) ** 2;
          if (e <= 1) {
            let b = copper(lx, ly, lz);
            // Глаза (закрытые, тёмные впадины)
            if (lz >= 3 && ly >= 8 && ly <= 9 && Math.abs(Math.abs(lx) - 2.5) <= 1.2) b = B.CopperDark;
            // Брови
            if (lz >= 3 && ly === 11 && Math.abs(Math.abs(lx) - 2.5) <= 1.5) b = B.CopperLight;
            // Губы
            if (lz >= 4 && ly === 3 && Math.abs(lx) <= 1.5) b = B.CopperDark;
            put(lx, ly, lz, b);
          }
        }
    // Нос
    for (let ly = 5; ly <= 8; ly++) for (let lz = 5; lz <= 6 + (8 - ly) * 0.4; lz++) put(0, ly, Math.floor(lz), B.Copper);
    put(-1, 5, 6, B.Copper);
    put(1, 5, 6, B.Copper);
    // Корона: обод и лучи в плоскости XY
    for (let a = -1.25; a <= 1.25; a += 0.04) {
      const sx = Math.sin(a),
        sy = Math.cos(a);
      for (let r = 6.5; r <= 8.2; r += 0.5)
        for (let lz = -2; lz <= 2; lz++) {
          const px = Math.round(hx + sx * r * 1.0);
          const py = Math.round(hy + sy * r * 1.08);
          const win = r > 7.5 && lz === 2 && Math.floor(a * 12) % 2 === 0;
          put(px, py, lz, win ? B.Window : copper(px, py, lz));
        }
    }
    const spikes = 7;
    for (let i = 0; i < spikes; i++) {
      const a = -1.15 + (i * 2.3) / (spikes - 1);
      const sx = Math.sin(a),
        sy = Math.cos(a);
      for (let r = 8; r <= 17; r += 0.4) {
        const t = (r - 8) / 9;
        const th = 1.6 * (1 - t) + 0.3;
        for (let o = -th; o <= th; o += 0.5)
          for (let lz = -Math.round(th * 0.6); lz <= Math.round(th * 0.6); lz++) {
            const px = Math.round(hx + sx * r + sy * o);
            const py = Math.round(hy + sy * r * 1.05 - sx * o);
            if (py < -1) continue;
            put(px, py, lz, copper(px, py, lz));
          }
      }
    }
    // Плечо и складки одеяния, уходящие вправо
    for (let lx = 7; lx <= 27; lx++)
      for (let ly = -2; ly <= 9; ly++)
        for (let lz = -10; lz <= 6; lz++) {
          const t = (lx - 7) / 20;
          const cy = 1.5 - t * 1.5;
          const rr = 7.5 - t * 2.5;
          const e = ((ly - cy) / rr) ** 2 + ((lz + 2) / (rr * 1.15)) ** 2;
          if (e <= 1) {
            let b = copper(lx, ly, lz);
            if (lx % 4 === 0 && hash3(lx, ly, lz, seed + 1) < 0.7) b = B.CopperDark;
            put(lx, ly, lz, b);
          }
        }
    // Мох и кусты на верхних поверхностях
    for (let lz = -12; lz <= 12; lz++)
      for (let lx = -17; lx <= 28; lx++) {
        const r = hash2(lx, lz, seed + 77);
        if (r > 0.42) continue;
        const [wx, wz] = rot(lx, lz);
        const llx = wx - ox,
          llz = wz - oz;
        if (llx < -1 || llz < -1 || llx > CHUNK || llz > CHUNK) continue;
        let y = HEIGHT - 2;
        while (y > base && !this.isCopper(blocks[pidx(llx, y, llz)])) y--;
        if (y <= base + 1) continue;
        blocks[pidx(llx, y, llz)] = r < 0.25 ? B.Moss : B.Leaves;
        if (r < 0.08) blocks[pidx(llx, y + 1, llz)] = B.Leaves;
      }
    // Водопад из-под носа и пруд
    for (let ly = 0; ly <= 5; ly++) put(0, ly, 7, B.Water);
    for (let lz = 6; lz <= 12; lz++)
      for (let lx = -4; lx <= 4; lx++) {
        if (Math.hypot(lx, (lz - 9) * 1.2) > 4.2) continue;
        put(lx, -1, lz, B.Water);
        put(lx, -2, lz, B.Sand);
        put(lx, 0, lz, 0);
      }
  }

  private isCopper(b: number) {
    return b === B.Copper || b === B.CopperDark || b === B.CopperLight || b === B.Window;
  }

  private stampCamp(blocks: Uint8Array, ox: number, oz: number) {
    const base = GROUND + 1;
    // Частокол с воротами по сторонам света
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const wx = Math.round(Math.cos(a) * CAMP_RADIUS);
      const wz = Math.round(Math.sin(a) * CAMP_RADIUS);
      if (Math.abs(wx) <= 2 || Math.abs(wz) <= 2) continue;
      const hh = 2 + (hash2(wx, wz, 3) < 0.5 ? 1 : 0);
      for (let y = 0; y < hh; y++) this.setB(blocks, ox, oz, wx, base + y, wz, B.Log);
    }
    // Палатки
    const tents: [number, number][] = [
      [-9, -7],
      [9, 7],
      [-8, 8],
    ];
    for (const [tx, tz] of tents) {
      for (let y = 0; y < 3; y++)
        for (let dx = -2 + y; dx <= 2 - y; dx++)
          for (let dz = -2; dz <= 2; dz++) this.setB(blocks, ox, oz, tx + dx, base + y, tz + dz, y === 0 && Math.abs(dx) < 2 && dz === 2 ? 0 : B.Roof);
    }
    void this.getB;
  }

  private placeDecos(ox: number, oz: number, blocks: Uint8Array, heights: Uint8Array, biomes: Uint8Array): Float32Array {
    const out: number[] = [];
    const seed = this.seed ^ 0xdec0;
    const add = (t: D, x: number, y: number, z: number, s = 1, v = -1) =>
      out.push(t, x, y, z, hash2(x * 7, z * 3, seed) * Math.PI * 2, s, v >= 0 ? v : Math.floor(hash2(x * 3, z * 5, seed + 7) * VARIANTS[t]));
    const dist0 = Math.hypot(ox + 16, oz + 16);
    const sites = this.sitesNear(ox + 16, oz + 16).filter((st) => Math.abs(st.x - (ox + 16)) < st.radius + 20 && Math.abs(st.z - (oz + 16)) < st.radius + 20);
    // реквизит лагеря
    if (Math.abs(ox + 16) < 48 && Math.abs(oz + 16) < 48)
      for (const [t, px, pz, rot, v] of CAMP_PROPS) {
        const lx = Math.floor(px) - ox,
          lz = Math.floor(pz) - oz;
        if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK) continue;
        out.push(t, px, heights[lx + lz * CHUNK], pz, rot, 1, v);
      }
    // куски «мест», чья опорная точка в этом чанке
    for (const st of sites)
      for (const p of st.pieces) {
        const lx = Math.floor(p.x) - ox,
          lz = Math.floor(p.z) - oz;
        if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK) continue;
        out.push(p.t, p.x, heights[lx + lz * CHUNK], p.z, p.rot, p.s, p.v);
      }
    for (let lz = 0; lz < CHUNK; lz++)
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = lx + lz * CHUNK;
        const h = heights[i];
        const top = blocks[pidx(lx, h - 1, lz)];
        if (blocks[pidx(lx, h, lz)] === B.Water) continue;
        const wx = ox + lx,
          wz = oz + lz;
        const r = hash2(wx, wz, seed);
        const r2 = hash2(wz, wx, seed + 1);
        const x = wx + 0.5,
          z = wz + 0.5;
        const biome = biomes[i] as Biome;
        if (sites.some((st) => Math.hypot(st.x - x, st.z - z) < st.radius * 0.8)) continue;
        const natural = top === B.Grass || top === B.DarkGrass || top === B.Sand || top === B.Snow || top === B.Mud || top === B.Moss;
        const far = Math.hypot(wx, wz);
        if (top === B.Asphalt && biome === Biome.City) {
          if (r < 0.004) add(D.Car, x, h, z);
          else if (r < 0.006) add(D.Van, x, h, z);
          else if (r < 0.009) add(D.ScrapPile, x, h, z);
          continue;
        }
        if (!natural) continue;
        if (far > 80 && r2 < 0.0012) {
          add(D.Crystal, x, h, z);
          continue;
        }
        switch (biome) {
          case Biome.Camp:
            if (r < 0.04 && far > 7) add(D.GrassTuft, x, h, z);
            else if (r < 0.06 && far > 7) add(D.FlowerYellow, x, h, z);
            break;
          case Biome.Meadow:
            if (r < 0.012) add(D.TreeOak, x, h, z, 0.8 + r2 * 0.5);
            else if (r < 0.016) add(D.TreeBirch, x, h, z, 0.8 + r2 * 0.4);
            else if (r < 0.026) add(D.Bush, x, h, z);
            else if (r < 0.03) add(D.Rock, x, h, z, 0.7 + r2 * 0.6);
            else if (r < 0.034) add(D.Herb, x, h, z);
            else if (r < 0.036 && dist0 > 60) add(D.Car, x, h, z);
            else if (r < 0.05) add(D.FlowerRed, x, h, z);
            else if (r < 0.065) add(D.FlowerYellow, x, h, z);
            else if (r < 0.1) add(D.GrassTuft, x, h, z);
            break;
          case Biome.Forest:
            if (r < 0.022) add(D.TreeOak, x, h, z, 0.9 + r2 * 0.5);
            else if (r < 0.038) add(D.TreePine, x, h, z, 0.9 + r2 * 0.5, Math.floor(r2 * 2));
            else if (r < 0.042) add(D.TreeBirch, x, h, z, 0.9 + r2 * 0.3);
            else if (r < 0.055) add(D.Bush, x, h, z);
            else if (r < 0.064) add(D.Mushroom, x, h, z);
            else if (r < 0.068) add(D.Herb, x, h, z);
            else if (r < 0.072) add(D.Rock, x, h, z);
            else if (r < 0.1) add(D.GrassTuft, x, h, z);
            break;
          case Biome.City:
            if (r < 0.008) add(D.TreeOak, x, h, z, 0.8 + r2 * 0.4);
            else if (r < 0.03) add(D.Bush, x, h, z);
            else if (r < 0.034) add(D.ScrapPile, x, h, z);
            else if (r < 0.037) add(D.TrashBin, x, h, z);
            else if (r < 0.05) add(D.FlowerYellow, x, h, z);
            else if (r < 0.1) add(D.GrassTuft, x, h, z);
            break;
          case Biome.Swamp:
            if (r < 0.012) add(D.DeadTree, x, h, z, 0.8 + r2 * 0.5);
            else if (r < 0.016) add(D.TreeOak, x, h, z, 0.7);
            else if (r < 0.07) add(D.Reeds, x, h, z);
            else if (r < 0.085) add(D.Mushroom, x, h, z, 1.2);
            else if (r < 0.093) add(D.Herb, x, h, z);
            break;
          case Biome.Desert:
            if (r < 0.006) add(D.Cactus, x, h, z, 0.8 + r2 * 0.5);
            else if (r < 0.011) add(D.Rock, x, h, z, 0.8 + r2);
            else if (r < 0.014) add(D.ScrapPile, x, h, z);
            else if (r < 0.016) add(D.DeadTree, x, h, z);
            else if (r < 0.0175) add(D.Van, x, h, z);
            break;
          case Biome.Snow:
            if (r < 0.026) add(D.TreePine, x, h, z, 0.8 + r2 * 0.6, h > 24 || r2 < 0.6 ? 2 : Math.floor(r2 * 2));
            else if (r < 0.042) add(D.Rock, x, h, z, 0.8 + r2);
            else if (r < 0.046) add(D.Crystal, x, h, z);
            break;
        }
      }
    return new Float32Array(out);
  }
}
