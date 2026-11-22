// Построение геометрии чанка: видимые грани + запечённое vertex AO + цветовой шум.
import { B, BLOCK_COLORS } from './blocks';
import { CHUNK, HEIGHT, pidx } from './gen';
import { hash3 } from '../core/rng';

export interface MeshArrays {
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  indices: Uint32Array;
}

// Вершины граней (0/1), нормали и касательные оси
const FACES: { n: [number, number, number]; v: [number, number, number][] }[] = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const AO_CURVE = [0.5, 0.68, 0.84, 1];
// sRGB -> линейное пространство (three.js ожидает линейные цвета вершин)
const LIN = new Uint8Array(256).map((_, i) => Math.round(255 * Math.pow(i / 255, 2.2)));

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vc = 0;
  finish(): MeshArrays {
    return {
      positions: new Float32Array(this.pos),
      normals: new Int8Array(this.nor),
      colors: new Uint8Array(this.col),
      indices: new Uint32Array(this.idx),
    };
  }
}

export function meshChunk(blocks: Uint8Array, cx: number, cz: number): { opaque: MeshArrays; water: MeshArrays } {
  const op = new Builder();
  const wa = new Builder();
  const get = (x: number, y: number, z: number) => {
    if (y < 0) return B.Stone;
    if (y >= HEIGHT) return B.Air;
    return blocks[pidx(x, y, z)];
  };
  const solid = (x: number, y: number, z: number) => {
    const b = get(x, y, z);
    return b !== B.Air && b !== B.Water ? 1 : 0;
  };
  const ox = cx * CHUNK,
    oz = cz * CHUNK;

  for (let y = 0; y < HEIGHT; y++)
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const b = blocks[pidx(x, y, z)];
        if (b === B.Air) continue;
        if (b === B.Water) {
          // вода: только грани, граничащие с воздухом
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nb = get(x + F.n[0], y + F.n[1], z + F.n[2]);
            if (nb !== B.Air) continue;
            if (f === 3) continue;
            const base = wa.vc;
            const topWater = get(x, y + 1, z) !== B.Water;
            for (const v of F.v) {
              const vy = v[1] === 1 && topWater ? 0.82 : v[1];
              wa.pos.push(x + v[0], y + vy, z + v[2]);
              wa.nor.push(F.n[0] * 127, F.n[1] * 127, F.n[2] * 127);
              const c = BLOCK_COLORS[B.Water];
              const k = f === 2 ? 1 : 0.85;
              wa.col.push(LIN[(c[0] * k) | 0], LIN[(c[1] * k) | 0], LIN[(c[2] * k) | 0]);
            }
            wa.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            wa.vc += 4;
          }
          continue;
        }
        const baseCol = BLOCK_COLORS[b];
        const jitter = 0.93 + hash3(x + ox, y, z + oz, 1337) * 0.12;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = x + F.n[0],
            ny = y + F.n[1],
            nz = z + F.n[2];
          if (solid(nx, ny, nz)) continue;
          // Цвет грани
          let c = baseCol;
          if (b === B.Grass && f !== 2) c = f === 3 ? BLOCK_COLORS[B.Dirt] : mixGrassSide;
          else if (b === B.DarkGrass && f !== 2) c = f === 3 ? BLOCK_COLORS[B.Dirt] : mixDarkGrassSide;
          else if (b === B.Snow && f !== 2) c = BLOCK_COLORS[B.Stone];
          const ao: number[] = [];
          // касательные оси
          const ax = F.n[0] !== 0 ? 1 : 0; // 1 если нормаль по X
          const ay = F.n[1] !== 0 ? 1 : 0;
          for (let k = 0; k < 4; k++) {
            const v = F.v[k];
            let s1: number, s2: number, cc: number;
            if (ax) {
              const dy = v[1] ? 1 : -1,
                dz = v[2] ? 1 : -1;
              s1 = solid(nx, ny + dy, nz);
              s2 = solid(nx, ny, nz + dz);
              cc = solid(nx, ny + dy, nz + dz);
            } else if (ay) {
              const dx = v[0] ? 1 : -1,
                dz = v[2] ? 1 : -1;
              s1 = solid(nx + dx, ny, nz);
              s2 = solid(nx, ny, nz + dz);
              cc = solid(nx + dx, ny, nz + dz);
            } else {
              const dx = v[0] ? 1 : -1,
                dy = v[1] ? 1 : -1;
              s1 = solid(nx + dx, ny, nz);
              s2 = solid(nx, ny + dy, nz);
              cc = solid(nx + dx, ny + dy, nz);
            }
            ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + cc));
          }
          const base = op.vc;
          for (let k = 0; k < 4; k++) {
            const v = F.v[k];
            op.pos.push(x + v[0], y + v[1], z + v[2]);
            op.nor.push(F.n[0] * 127, F.n[1] * 127, F.n[2] * 127);
            const m = AO_CURVE[ao[k]] * jitter;
            op.col.push(LIN[Math.min(255, (c[0] * m) | 0)], LIN[Math.min(255, (c[1] * m) | 0)], LIN[Math.min(255, (c[2] * m) | 0)]);
          }
          if (ao[0] + ao[2] < ao[1] + ao[3]) op.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          else op.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          op.vc += 4;
        }
      }
  return { opaque: op.finish(), water: wa.finish() };
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mixGrassSide = mix(BLOCK_COLORS[B.Grass], BLOCK_COLORS[B.Dirt], 0.35);
const mixDarkGrassSide = mix(BLOCK_COLORS[B.DarkGrass], BLOCK_COLORS[B.Dirt], 0.35);
