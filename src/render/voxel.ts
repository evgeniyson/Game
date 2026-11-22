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
  const r = (h - Math.floor(h)) * 2 - 1;
  const c = new THREE.Color(hex);
  const k = 1 + r * amt;
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return c.getHex();
}
