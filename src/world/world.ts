// Стриминг чанков вокруг игрока, высоты для коллизий, декорации и добыча ресурсов.
import * as THREE from 'three';
import { CHUNK, SEA, WorldGen, Biome } from './gen';
import { HARVEST, COLLIDERS, D } from './decoTypes';
import type { MeshArrays } from './mesher';
import { makeTerrainMaterial, makeWaterMaterial } from '../render/terrainMaterial';
import { DecoRenderer, DECO_STRIDE } from '../render/decoRenderer';

interface ChunkRec {
  cx: number;
  cz: number;
  heights: Uint8Array;
  tops: Uint8Array;
  biomes: Uint8Array;
  decos: Float32Array;
  hidden: Set<number>;
  group: THREE.Group;
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
  decoRenderer: DecoRenderer;
  harvested = new Map<string, number>(); // ключ деко -> игровое время возрождения
  radius = 2;
  time = 0;
  private pcx = 1e9;
  private pcz = 1e9;
  onChunkLoaded: (cx: number, cz: number) => void = () => {};

  constructor(public scene: THREE.Scene, public seed: number) {
    this.gen = new WorldGen(seed);
    this.opaqueMat = makeTerrainMaterial();
    this.waterMat = makeWaterMaterial();
    this.decoRenderer = new DecoRenderer(scene);
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
    for (const c of [...this.chunks.values()]) this.unload(c);
    this.decoRenderer.dispose();
  }

  get loadingCount() {
    return this.pending.size;
  }

  update(px: number, pz: number) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    if (pcx !== this.pcx || pcz !== this.pcz) {
      this.pcx = pcx;
      this.pcz = pcz;
      this.decoRenderer.dirty = true;
    }
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
    for (const c of [...this.chunks.values()]) {
      if (Math.abs(c.cx - pcx) > R + 1 || Math.abs(c.cz - pcz) > R + 1) this.unload(c);
    }
    if (this.decoRenderer.dirty) this.decoRenderer.rebuild(this.chunks.values(), pcx, pcz);
  }

  private unload(c: ChunkRec) {
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.chunks.delete(ckey(c.cx, c.cz));
    this.decoRenderer.dirty = true;
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
    const rec: ChunkRec = { cx: d.cx, cz: d.cz, heights: d.heights, tops: d.tops, biomes: d.biomes, decos: d.decos, hidden: new Set(), group, blockers: [] };
    const n = rec.decos.length / DECO_STRIDE;
    for (let i = 0; i < n; i++) {
      const t = this.harvested.get(`${d.cx},${d.cz},${i}`);
      if (t !== undefined && t > this.time) rec.hidden.add(i);
    }
    this.rebuildBlockers(rec);
    this.chunks.set(k, rec);
    this.scene.add(group);
    this.decoRenderer.dirty = true;
    this.onChunkLoaded(d.cx, d.cz);
  }

  /** Коллизии декораций и построек чанка */
  private rebuildBlockers(rec: ChunkRec) {
    rec.blockers = [];
    const n = rec.decos.length / DECO_STRIDE;
    for (let i = 0; i < n; i++) {
      if (rec.hidden.has(i)) continue;
      const o = i * DECO_STRIDE;
      const t = rec.decos[o] as D;
      const x = rec.decos[o + 1],
        z = rec.decos[o + 3],
        rot = rec.decos[o + 4],
        s = rec.decos[o + 5];
      const col = COLLIDERS[t];
      if (col) {
        const cs = Math.cos(rot),
          sn = Math.sin(rot);
        for (const [dx, dz, r] of col) rec.blockers.push({ x: x + (dx * cs + dz * sn) * s, z: z + (-dx * sn + dz * cs) * s, r: r * s, i });
      } else {
        const hv = HARVEST[t];
        if (hv?.block) rec.blockers.push({ x, z, r: hv.radius * s, i });
      }
    }
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
      const ccx = Math.floor(x / CHUNK),
        ccz = Math.floor(z / CHUNK);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const rec = this.chunks.get(ckey(ccx + ox, ccz + oz));
          if (!rec) continue;
          for (const b of rec.blockers) {
            const dx = b.x - x,
              dz = b.z - z;
            if (dx * dx + dz * dz < (b.r + r) * (b.r + r)) return false;
          }
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
        const n = rec.decos.length / DECO_STRIDE;
        for (let i = 0; i < n; i++) {
          const t = rec.decos[i * DECO_STRIDE] as D;
          const hv = HARVEST[t];
          if (!hv || rec.hidden.has(i)) continue;
          const x = rec.decos[i * DECO_STRIDE + 1],
            z = rec.decos[i * DECO_STRIDE + 3];
          const d = Math.hypot(x - pos.x, z - pos.z) - hv.radius * rec.decos[i * DECO_STRIDE + 5];
          if (d < bd) {
            bd = d;
            best = { key: `${rec.cx},${rec.cz},${i}`, rec, index: i, type: t, pos: new THREE.Vector3(x, rec.decos[i * DECO_STRIDE + 2], z) };
          }
        }
      }
    return best;
  }

  harvest(h: Harvestable) {
    const hv = HARVEST[h.type]!;
    h.rec.hidden.add(h.index);
    this.harvested.set(h.key, this.time + hv.respawn);
    this.rebuildBlockers(h.rec);
    this.decoRenderer.dirty = true;
  }

  /** Периодически возвращаем срубленные деревья и т.п. */
  tickRespawn() {
    for (const [key, t] of this.harvested) {
      if (t > this.time) continue;
      this.harvested.delete(key);
      const [cx, cz, i] = key.split(',').map(Number);
      const rec = this.chunks.get(ckey(cx, cz));
      if (rec && rec.hidden.delete(i)) {
        this.rebuildBlockers(rec);
        this.decoRenderer.dirty = true;
      }
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
