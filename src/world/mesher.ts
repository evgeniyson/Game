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
              // пена у берега: вершина касается твёрдого блока на уровне воды
              let foam = 0;
              if (f === 2) {
                const vx = x + v[0],
                  vz = z + v[2];
                for (let ddx = -1; ddx <= 0; ddx++) for (let ddz = -1; ddz <= 0; ddz++) if (solid(vx + ddx, y, vz + ddz) || solid(vx + ddx, y + 1, vz + ddz)) foam = 1;
              }
              const r = c[0] * k + (235 - c[0] * k) * foam * 0.6,
                g = c[1] * k + (245 - c[1] * k) * foam * 0.6,
                bb = c[2] * k + (250 - c[2] * k) * foam * 0.6;
              wa.col.push(LIN[r | 0], LIN[g | 0], LIN[bb | 0]);
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
          // Боковые грани травы/снега/мха: неровная «бахрома» верхнего слоя из микро-вокселей
          const capCol = f !== 2 && f !== 3 && !solid(x, y + 1, z) ? CAP[b] : undefined;
          if (capCol) {
            const aom = ao.map((a) => AO_CURVE[a] * jitter);
            const lips: number[] = [];
            for (let i = 0; i < 8; i++) lips.push((1 + Math.floor(hash3((x + ox) * 8 + i, y, (z + oz) * 8 + f, 77) * 3)) / 8);
            const maxLip = Math.max(...lips);
            subQuad(op, x, y, z, F, 0, 1, 0, 1 - maxLip, capCol[1], aom);
            let i0 = 0;
            while (i0 < 8) {
              let i1 = i0 + 1;
              while (i1 < 8 && lips[i1] === lips[i0]) i1++;
              const u0 = i0 / 8,
                u1 = i1 / 8;
              subQuad(op, x, y, z, F, u0, u1, 1 - lips[i0], 1, capCol[0], aom);
              if (lips[i0] < maxLip) subQuad(op, x, y, z, F, u0, u1, 1 - maxLip, 1 - lips[i0], capCol[1], aom);
              i0 = i1;
            }
            continue;
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
const shade = (a: [number, number, number], k: number): [number, number, number] => [a[0] * k, a[1] * k, a[2] * k];

/** [цвет верхнего слоя, цвет под ним] для боковых граней */
const CAP: Partial<Record<number, [[number, number, number], [number, number, number]]>> = {
  [B.Grass]: [shade(BLOCK_COLORS[B.Grass], 0.92), BLOCK_COLORS[B.Dirt]],
  [B.DarkGrass]: [shade(BLOCK_COLORS[B.DarkGrass], 0.92), BLOCK_COLORS[B.Dirt]],
  [B.Snow]: [shade(BLOCK_COLORS[B.Snow], 0.95), BLOCK_COLORS[B.Stone]],
  [B.Moss]: [shade(BLOCK_COLORS[B.Moss], 0.9), BLOCK_COLORS[B.Mud]],
};

/** Часть боковой грани: u — по горизонтали, v — по вертикали (0..1). AO интерполируется билинейно. */
function subQuad(op: Builder, x: number, y: number, z: number, F: (typeof FACES)[number], u0: number, u1: number, v0: number, v1: number, c: [number, number, number], aom: number[]) {
  const horiz = F.n[0] !== 0 ? 2 : 0; // ось вдоль грани
  const base = op.vc;
  // билинейная интерполяция AO по углам грани
  const aoAt = (hu: number, vv: number) => {
    let acc = 0,
      wsum = 0;
    for (let k = 0; k < 4; k++) {
      const v = F.v[k];
      const w = (v[horiz] ? hu : 1 - hu) * (v[1] ? vv : 1 - vv);
      acc += aom[k] * w;
      wsum += w;
    }
    return acc / Math.max(1e-6, wsum);
  };
  for (let k = 0; k < 4; k++) {
    const v = F.v[k];
    const hu = v[horiz] ? u1 : u0;
    const vv = v[1] ? v1 : v0;
    const px = horiz === 0 ? hu : v[0];
    const pz = horiz === 2 ? hu : v[2];
    op.pos.push(x + px, y + vv, z + pz);
    op.nor.push(F.n[0] * 127, F.n[1] * 127, F.n[2] * 127);
    const m = aoAt(hu, vv);
    op.col.push(LIN[Math.min(255, (c[0] * m) | 0)], LIN[Math.min(255, (c[1] * m) | 0)], LIN[Math.min(255, (c[2] * m) | 0)]);
  }
  op.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  op.vc += 4;
}
const mixGrassSide = mix(BLOCK_COLORS[B.Grass], BLOCK_COLORS[B.Dirt], 0.35);
const mixDarkGrassSide = mix(BLOCK_COLORS[B.DarkGrass], BLOCK_COLORS[B.Dirt], 0.35);
