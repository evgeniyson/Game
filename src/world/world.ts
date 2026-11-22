// Стриминг чанков вокруг игрока, высоты для коллизий, декорации и добыча ресурсов.
import * as THREE from 'three';
import { CHUNK, SEA, WorldGen, Biome } from './gen';
import { decoGeometries, SMALL_DECO } from '../render/decoModels';
import { HARVEST, D } from './decoTypes';
import type { MeshArrays } from './mesher';

interface ChunkRec {
  cx: number;
  cz: number;
  heights: Uint8Array;
  tops: Uint8Array;
  biomes: Uint8Array;
  decos: Float32Array;
  hidden: Set<number>;
  group: THREE.Group;
  decoMesh: THREE.Mesh | null;
  smallMesh: THREE.Mesh | null;
  blockers: { x: number; z: number; r: number; i: number }[];
}

export interface Harvestable {
  key: string;
  rec: ChunkRec;
  index: number;
  type: D;
  pos: THREE.Vector3;
}

const ckey = (cx: number, cz: number) => cx + ',' + cz;

export class World {
  gen: WorldGen;
  chunks = new Map<string, ChunkRec>();
  private pending = new Set<string>();
  private workers: Worker[] = [];
  private rr = 0;
  private opaqueMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  private decoMat: THREE.MeshLambertMaterial;
  harvested = new Map<string, number>(); // ключ деко -> игровое время возрождения
  radius = 2;
  time = 0;
  onChunkLoaded: (cx: number, cz: number) => void = () => {};

  constructor(public scene: THREE.Scene, public seed: number) {
    this.gen = new WorldGen(seed);
    this.opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    this.decoMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', seed });
      w.onmessage = (e) => this.onChunk(e.data);
      this.workers.push(w);
    }
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const c of this.chunks.values()) this.unload(c);
  }

  get loadingCount() {
    return this.pending.size;
  }

  update(px: number, pz: number) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    const R = this.radius;
    const want: [number, number, number][] = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx,
          cz = pcz + dz;
        const k = ckey(cx, cz);
        if (!this.chunks.has(k) && !this.pending.has(k)) want.push([cx, cz, dx * dx + dz * dz]);
      }
    want.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of want) {
      if (this.pending.size >= this.workers.length * 2) break;
      const k = ckey(cx, cz);
      this.pending.add(k);
      this.workers[this.rr++ % this.workers.length].postMessage({ type: 'gen', cx, cz });
    }
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) > R + 1 || Math.abs(c.cz - pcz) > R + 1) this.unload(c);
    }
  }

  private unload(c: ChunkRec) {
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.chunks.delete(ckey(c.cx, c.cz));
  }

  private toGeo(m: MeshArrays): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3, true));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    g.computeBoundingSphere();
    return g;
  }

  private onChunk(d: any) {
    const k = ckey(d.cx, d.cz);
    this.pending.delete(k);
    if (this.chunks.has(k)) return;
    const group = new THREE.Group();
    group.position.set(d.cx * CHUNK, 0, d.cz * CHUNK);
    const opaque = new THREE.Mesh(this.toGeo(d.opaque), this.opaqueMat);
    opaque.castShadow = true;
    opaque.receiveShadow = true;
    group.add(opaque);
    if (d.water.indices.length) {
      const water = new THREE.Mesh(this.toGeo(d.water), this.waterMat);
      water.receiveShadow = true;
      water.renderOrder = 1;
      group.add(water);
    }
    const rec: ChunkRec = {
      cx: d.cx, cz: d.cz, heights: d.heights, tops: d.tops, biomes: d.biomes, decos: d.decos,
      hidden: new Set(), group, decoMesh: null, smallMesh: null, blockers: [],
    };
    const n = rec.decos.length / 6;
    for (let i = 0; i < n; i++) {
      const key = `${d.cx},${d.cz},${i}`;
      const t = this.harvested.get(key);
      if (t !== undefined && t > this.time) rec.hidden.add(i);
    }
    this.rebuildDecos(rec);
    this.chunks.set(k, rec);
    this.scene.add(group);
    this.onChunkLoaded(d.cx, d.cz);
  }

  /** Сливает все декорации чанка в 2 меша (с тенью и без) */
  private rebuildDecos(rec: ChunkRec) {
    const geos = decoGeometries();
    if (rec.decoMesh) {
      rec.group.remove(rec.decoMesh);
      rec.decoMesh.geometry.dispose();
    }
    if (rec.smallMesh) {
      rec.group.remove(rec.smallMesh);
      rec.smallMesh.geometry.dispose();
    }
    rec.blockers = [];
    const big: { p: number[]; n: number[]; c: number[]; i: number[] } = { p: [], n: [], c: [], i: [] };
    const small: { p: number[]; n: number[]; c: number[]; i: number[] } = { p: [], n: [], c: [], i: [] };
    const ox = rec.cx * CHUNK,
      oz = rec.cz * CHUNK;
    const cnt = rec.decos.length / 6;
    for (let k = 0; k < cnt; k++) {
      const t = rec.decos[k * 6] as D;
      const x = rec.decos[k * 6 + 1] - ox,
        y = rec.decos[k * 6 + 2],
        z = rec.decos[k * 6 + 3] - oz;
      const rot = rec.decos[k * 6 + 4],
        s = rec.decos[k * 6 + 5];
      const hv = HARVEST[t];
      if (rec.hidden.has(k)) continue;
      if (hv?.block) rec.blockers.push({ x: x + ox, z: z + oz, r: hv.radius * s, i: k });
      const g = geos[t];
      const dst = SMALL_DECO.has(t) ? small : big;
      const pos = g.attributes.position.array as Float32Array;
      const nor = g.attributes.normal.array as Float32Array;
      const col = g.attributes.color.array as Float32Array;
      const idx = g.index!.array;
      const base = dst.p.length / 3;
      const cs = Math.cos(rot),
        sn = Math.sin(rot);
      for (let v = 0; v < pos.length; v += 3) {
        const px = pos[v] * s,
          py = pos[v + 1] * s,
          pz = pos[v + 2] * s;
        dst.p.push(x + px * cs + pz * sn, y + py, z - px * sn + pz * cs);
        const nx = nor[v],
          nz = nor[v + 2];
        dst.n.push(nx * cs + nz * sn, nor[v + 1], -nx * sn + nz * cs);
        dst.c.push(col[v], col[v + 1], col[v + 2]);
      }
      for (let i = 0; i < idx.length; i++) dst.i.push(idx[i] + base);
    }
    const mk = (b: typeof big, shadow: boolean) => {
      if (!b.i.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      g.setIndex(b.i);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.decoMat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      rec.group.add(m);
      return m;
    };
    rec.decoMesh = mk(big, true);
    rec.smallMesh = mk(small, false);
  }

  private recAt(x: number, z: number): ChunkRec | undefined {
    return this.chunks.get(ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  }

  isLoaded(x: number, z: number): boolean {
    return !!this.recAt(x, z);
  }

  /** Высота, на которой стоит существо в данной точке (или null, если чанк не загружен) */
  heightAt(x: number, z: number): number | null {
    const r = this.recAt(x, z);
    if (!r) return null;
    const lx = Math.floor(x) - r.cx * CHUNK;
    const lz = Math.floor(z) - r.cz * CHUNK;
    return r.heights[lx + lz * CHUNK];
  }

  biomeAt(x: number, z: number): Biome {
    const r = this.recAt(x, z);
    if (!r) return this.gen.sample(x, z).biome;
    const lx = Math.floor(x) - r.cx * CHUNK;
    const lz = Math.floor(z) - r.cz * CHUNK;
    return r.biomes[lx + lz * CHUNK] as Biome;
  }

  topAt(x: number, z: number): number {
    const r = this.recAt(x, z);
    if (!r) return 0;
    const lx = Math.floor(x) - r.cx * CHUNK;
    const lz = Math.floor(z) - r.cz * CHUNK;
    return r.tops[lx + lz * CHUNK];
  }

  /** Можно ли сделать шаг с высоты fromY в точку (x,z) с радиусом r */
  canStand(fromY: number, x: number, z: number, r = 0.3, ignoreDecos = false): boolean {
    const pts = [
      [x, z],
      [x + r, z],
      [x - r, z],
      [x, z + r],
      [x, z - r],
    ];
    for (const [px, pz] of pts) {
      const h = this.heightAt(px, pz);
      if (h === null) return false;
      if (h - fromY > 1.25) return false;
      if (h < SEA - 1) return false;
    }
    if (!ignoreDecos) {
      const rec = this.recAt(x, z);
      if (rec)
        for (const b of rec.blockers) {
          const dx = b.x - x,
            dz = b.z - z;
          if (dx * dx + dz * dz < (b.r + r) * (b.r + r)) return false;
        }
    }
    return true;
  }

  isWater(x: number, z: number): boolean {
    const h = this.heightAt(x, z);
    return h !== null && h < SEA;
  }

  findHarvestable(pos: THREE.Vector3, radius: number): Harvestable | null {
    let best: Harvestable | null = null;
    let bd = radius;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const rec = this.chunks.get(ckey(Math.floor(pos.x / CHUNK) + dx, Math.floor(pos.z / CHUNK) + dz));
        if (!rec) continue;
        const n = rec.decos.length / 6;
        for (let i = 0; i < n; i++) {
          const t = rec.decos[i * 6] as D;
          const hv = HARVEST[t];
          if (!hv || rec.hidden.has(i)) continue;
          const x = rec.decos[i * 6 + 1],
            z = rec.decos[i * 6 + 3];
          const d = Math.hypot(x - pos.x, z - pos.z) - hv.radius * rec.decos[i * 6 + 5];
          if (d < bd) {
            bd = d;
            best = { key: `${rec.cx},${rec.cz},${i}`, rec, index: i, type: t, pos: new THREE.Vector3(x, rec.decos[i * 6 + 2], z) };
          }
        }
      }
    return best;
  }

  harvest(h: Harvestable) {
    const hv = HARVEST[h.type]!;
    h.rec.hidden.add(h.index);
    this.harvested.set(h.key, this.time + hv.respawn);
    this.rebuildDecos(h.rec);
  }

  /** Периодически возвращаем срубленные деревья и т.п. */
  tickRespawn() {
    for (const [key, t] of this.harvested) {
      if (t > this.time) continue;
      this.harvested.delete(key);
      const [cx, cz, i] = key.split(',').map(Number);
      const rec = this.chunks.get(ckey(cx, cz));
      if (rec && rec.hidden.delete(i)) this.rebuildDecos(rec);
    }
  }

  /** Данные для миникарты: цвет верхнего блока */
  forEachLoaded(fn: (rec: { cx: number; cz: number; tops: Uint8Array; heights: Uint8Array }) => void) {
    for (const c of this.chunks.values()) fn(c);
  }

  /** Ищет проходимую точку рядом (для спавна) */
  findSpawnPoint(x: number, z: number, tries = 10, rnd = Math.random): THREE.Vector3 | null {
    for (let i = 0; i < tries; i++) {
      const px = x + (rnd() - 0.5) * 6,
        pz = z + (rnd() - 0.5) * 6;
      const h = this.heightAt(px, pz);
      if (h === null || h < SEA) continue;
      if (!this.canStand(h, px, pz, 0.5)) continue;
      return new THREE.Vector3(px, h, pz);
    }
    return null;
  }
}
