// Построитель воксельных моделей (персонажи, мобы, декорации) -> BufferGeometry с AO.
import * as THREE from 'three';

const FACES: { n: [number, number, number]; v: [number, number, number][] }[] = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const AO = [0.62, 0.76, 0.88, 1];

const key = (x: number, y: number, z: number) => ((x + 512) | ((y + 512) << 10) | ((z + 512) << 20)) >>> 0;

export class VoxelGrid {
  map = new Map<number, number>();
  set(x: number, y: number, z: number, color: number) {
    this.map.set(key(Math.round(x), Math.round(y), Math.round(z)), color);
    return this;
  }
  del(x: number, y: number, z: number) {
    this.map.delete(key(x, y, z));
  }
  has(x: number, y: number, z: number) {
    return this.map.has(key(x, y, z));
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number | ((x: number, y: number, z: number) => number | null)) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++)
        for (let k = 0; k < d; k++) {
          const c = typeof color === 'function' ? color(x + i, y + j, z + k) : color;
          if (c !== null) this.set(x + i, y + j, z + k, c);
        }
    return this;
  }
  sphere(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number | ((x: number, y: number, z: number) => number | null)) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (e <= 1) {
            const c = typeof color === 'function' ? color(x, y, z) : color;
            if (c !== null) this.set(x, y, z, c);
          }
        }
    return this;
  }

  /** Отрезок толщиной r (r < 1 — в один воксель) */
  line(a: [number, number, number], b: [number, number, number], r: number, color: number | ((x: number, y: number, z: number) => number | null)) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a[0] + (b[0] - a[0]) * t,
        y = a[1] + (b[1] - a[1]) * t,
        z = a[2] + (b[2] - a[2]) * t;
      if (r < 1) {
        const c = typeof color === 'function' ? color(Math.round(x), Math.round(y), Math.round(z)) : color;
        if (c !== null) this.set(x, y, z, c);
      } else this.sphere(x, y, z, r, r, r, color);
    }
    return this;
  }

  /** Вертикальный цилиндр */
  cyl(cx: number, y0: number, cz: number, r: number, h: number, color: number | ((x: number, y: number, z: number) => number | null)) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
          if ((x - cx) ** 2 + (z - cz) ** 2 > r * r) continue;
          const c = typeof color === 'function' ? color(x, y, z) : color;
          if (c !== null) this.set(x, y, z, c);
        }
    return this;
  }

  get size() {
    return this.map.size;
  }

  forEach(fn: (x: number, y: number, z: number, c: number) => void) {
    for (const [k, c] of this.map) fn((k & 1023) - 512, ((k >>> 10) & 1023) - 512, ((k >>> 20) & 1023) - 512, c);
  }

  /** Мельче в k раз: каждый воксель -> k³, со скруглёнными внешними углами и микро-шумом цвета */
  refine(k = 2): VoxelGrid {
    const out = new VoxelGrid();
    this.forEach((x, y, z, c) => {
      for (let sx = 0; sx < k; sx++)
        for (let sy = 0; sy < k; sy++)
          for (let sz = 0; sz < k; sz++) {
            const dx = sx === 0 ? -1 : sx === k - 1 ? 1 : 0;
            const dy = sy === 0 ? -1 : sy === k - 1 ? 1 : 0;
            const dz = sz === 0 ? -1 : sz === k - 1 ? 1 : 0;
            if (dx && dy && dz && !this.has(x + dx, y, z) && !this.has(x, y + dy, z) && !this.has(x, y, z + dz)) continue;
            const X = x * k + sx,
              Y = y * k + sy,
              Z = z * k + sz;
            out.set(X, Y, Z, jit(c, X, Y, Z, 0.05));
          }
    });
    return out;
  }

  /** Грубая версия модели для дальнего LOD */
  downsample(k: number): VoxelGrid {
    const g = new VoxelGrid();
    const cnt = new Map<number, number>();
    this.forEach((x, y, z, c) => {
      const nx = Math.floor(x / k),
        ny = Math.floor(y / k),
        nz = Math.floor(z / k);
      const kk = key(nx, ny, nz);
      cnt.set(kk, (cnt.get(kk) ?? 0) + 1);
      if (!g.map.has(kk)) g.map.set(kk, c);
    });
    // убираем почти пустые ячейки, чтобы силуэт не «раздувался»
    const need = Math.max(1, Math.floor((k * k * k) / 4));
    for (const [kk, n] of cnt) if (n < need) g.map.delete(kk);
    return g;
  }

  /** origin — точка в воксельных координатах, которая станет (0,0,0) */
  toGeometry(scale: number, origin: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    let vc = 0;
    const solid = (x: number, y: number, z: number) => (this.map.has(key(x, y, z)) ? 1 : 0);
    const tmp = new THREE.Color();
    for (const [k, color] of this.map) {
      const x = (k & 1023) - 512;
      const y = ((k >>> 10) & 1023) - 512;
      const z = ((k >>> 20) & 1023) - 512;
      tmp.setHex(color);
      for (const F of FACES) {
        const nx = x + F.n[0],
          ny = y + F.n[1],
          nz = z + F.n[2];
        if (solid(nx, ny, nz)) continue;
        const ao: number[] = [];
        for (const v of F.v) {
          let s1: number, s2: number, c: number;
          if (F.n[0]) {
            const dy = v[1] ? 1 : -1,
              dz = v[2] ? 1 : -1;
            s1 = solid(nx, ny + dy, nz);
            s2 = solid(nx, ny, nz + dz);
            c = solid(nx, ny + dy, nz + dz);
          } else if (F.n[1]) {
            const dx = v[0] ? 1 : -1,
              dz = v[2] ? 1 : -1;
            s1 = solid(nx + dx, ny, nz);
            s2 = solid(nx, ny, nz + dz);
            c = solid(nx + dx, ny, nz + dz);
          } else {
            const dx = v[0] ? 1 : -1,
              dy = v[1] ? 1 : -1;
            s1 = solid(nx + dx, ny, nz);
            s2 = solid(nx, ny + dy, nz);
            c = solid(nx + dx, ny + dy, nz);
          }
          ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + c));
        }
        for (let i = 0; i < 4; i++) {
          const v = F.v[i];
          pos.push((x + v[0] - origin[0]) * scale, (y + v[1] - origin[1]) * scale, (z + v[2] - origin[2]) * scale);
          nor.push(F.n[0], F.n[1], F.n[2]);
          const m = AO[ao[i]];
          col.push(tmp.r * m, tmp.g * m, tmp.b * m);
        }
        if (ao[0] + ao[2] < ao[1] + ao[3]) idx.push(vc + 1, vc + 2, vc + 3, vc + 1, vc + 3, vc);
        else idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
        vc += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Цвет с лёгким шумом — для «живых» поверхностей */
export function jit(hex: number, x: number, y: number, z: number, amt = 0.08): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  const k = 1 + ((h - Math.floor(h)) * 2 - 1) * amt;
  const r = Math.min(255, ((hex >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * k) | 0;
  const b = Math.min(255, (hex & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

/** Смешивание двух цветов */
export function mixHex(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
}

/** Детерминированный шум 0..1 по координатам */
export function vhash(x: number, y: number, z: number, s = 0): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}
