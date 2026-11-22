// Атмосферная живность: лисы, птицы, бабочки, ящерицы, верблюды. Без боя — просто оживляют мир.
import * as THREE from 'three';
import { buildMob, type Rig } from '../render/models';
import { VoxelGrid } from '../render/voxel';
import { Biome, SEA } from '../world/gen';
import type { World } from '../world/world';

type Kind = 'fox' | 'bird' | 'butterfly' | 'lizard' | 'camel';

interface Critter {
  kind: Kind;
  obj: THREE.Object3D;
  rig?: Rig;
  wings?: THREE.Object3D[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  state: 'idle' | 'walk' | 'flee' | 'fly';
  t: number;
  phase: number;
  facing: number;
}

const BIOME_FAUNA: Partial<Record<Biome, Kind[]>> = {
  [Biome.Meadow]: ['butterfly', 'butterfly', 'bird', 'bird'],
  [Biome.Camp]: ['butterfly', 'bird'],
  [Biome.Forest]: ['fox', 'bird', 'butterfly'],
  [Biome.Snow]: ['fox', 'fox', 'bird'],
  [Biome.Desert]: ['lizard', 'lizard', 'camel'],
  [Biome.City]: ['bird', 'bird', 'butterfly'],
  [Biome.Swamp]: ['butterfly', 'bird'],
};

const BUTTERFLY_COLS = [0xffd040, 0xffffff, 0x8ac8ff, 0xff8ad0, 0xff9a3a];
const BIRD_COLS = [0x6a4a3a, 0x3a4a6a, 0xc0503a, 0x8a8a8a];

function wingMesh(color: number, w: number, h: number, scale: number): THREE.Mesh {
  const g = new VoxelGrid();
  g.box(0, 0, 0, w, 1, h, (x, y, z) => ((x + z) % 3 === 0 ? 0x222222 : color));
  const m = new THREE.Mesh(g.toGeometry(scale, [0, 0.5, h / 2]), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  return m;
}

function buildFlyer(kind: 'bird' | 'butterfly'): { obj: THREE.Group; wings: THREE.Object3D[] } {
  const obj = new THREE.Group();
  const s = kind === 'bird' ? 0.06 : 0.04;
  const col = kind === 'bird' ? BIRD_COLS[Math.floor(Math.random() * BIRD_COLS.length)] : BUTTERFLY_COLS[Math.floor(Math.random() * BUTTERFLY_COLS.length)];
  const body = new VoxelGrid();
  if (kind === 'bird') {
    body.box(-1, 0, -2, 3, 3, 5, col).box(-1, 1, 3, 3, 2, 2, col).set(0, 2, 5, 0xe8b040).set(-1, 2, 4, 0x111111).set(1, 2, 4, 0x111111).box(0, 1, -4, 1, 1, 2, col);
  } else body.box(0, 0, -2, 1, 1, 4, 0x2a2a2a);
  const bm = new THREE.Mesh(body.toGeometry(s, [0.5, 0, 0]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  bm.castShadow = true;
  obj.add(bm);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5 * s, (kind === 'bird' ? 2 : 0.5) * s, 0);
    const w = wingMesh(kind === 'bird' ? col : col, kind === 'bird' ? 4 : 4, kind === 'bird' ? 3 : 4, s);
    if (side < 0) w.rotation.y = Math.PI;
    pivot.add(w);
    obj.add(pivot);
    wings.push(pivot);
  }
  return { obj, wings };
}

export class Ambient {
  list: Critter[] = [];
  private spawnT = 0;
  readonly MAX = 12;

  constructor(private scene: THREE.Scene, private world: World) {}

  private spawn(kind: Kind, pos: THREE.Vector3) {
    let obj: THREE.Object3D;
    let rig: Rig | undefined;
    let wings: THREE.Object3D[] | undefined;
    if (kind === 'bird' || kind === 'butterfly') {
      const f = buildFlyer(kind);
      obj = f.obj;
      wings = f.wings;
    } else {
      rig = buildMob(kind);
      rig.setScale(kind === 'camel' ? 1.3 : kind === 'lizard' ? 0.8 : 1);
      obj = rig.group;
    }
    const y = kind === 'butterfly' ? pos.y + 0.8 + Math.random() : pos.y;
    const c: Critter = { kind, obj, rig, wings, pos: new THREE.Vector3(pos.x, y, pos.z), vel: new THREE.Vector3(), target: pos.clone(), state: 'idle', t: Math.random() * 3, phase: Math.random() * 10, facing: Math.random() * 6.28 };
    obj.position.copy(c.pos);
    this.scene.add(obj);
    this.list.push(c);
  }

  update(dt: number, player: THREE.Vector3, biome: Biome, night: boolean) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.5;
      if (this.list.length < this.MAX) {
        const kinds = BIOME_FAUNA[biome];
        if (kinds) {
          const kind = kinds[Math.floor(Math.random() * kinds.length)];
          if (!(night && kind === 'butterfly')) {
            const a = Math.random() * Math.PI * 2,
              d = 12 + Math.random() * 14;
            const x = player.x + Math.cos(a) * d,
              z = player.z + Math.sin(a) * d;
            const h = this.world.heightAt(x, z);
            if (h !== null && h >= SEA && this.world.canStand(h, x, z, 0.3)) this.spawn(kind, new THREE.Vector3(x, h, z));
          }
        }
      }
    }
    const t = performance.now() / 1000;
    this.list = this.list.filter((c) => {
      const dist = Math.hypot(c.pos.x - player.x, c.pos.z - player.z);
      if (dist > 45 || (c.state === 'fly' && c.pos.y > player.y + 18)) {
        this.scene.remove(c.obj);
        return false;
      }
      c.t -= dt;
      c.phase += dt;
      const ground = this.world.heightAt(c.pos.x, c.pos.z) ?? c.pos.y;
      if (c.kind === 'butterfly') {
        // порхание вокруг точки
        if (c.t <= 0) {
          c.t = 1 + Math.random() * 2;
          c.target.set(c.pos.x + (Math.random() - 0.5) * 4, ground + 0.6 + Math.random() * 1.4, c.pos.z + (Math.random() - 0.5) * 4);
        }
        c.vel.lerp(c.target.clone().sub(c.pos).multiplyScalar(0.8), dt * 2);
        c.pos.addScaledVector(c.vel, dt);
        c.pos.y += Math.sin(c.phase * 9) * dt * 0.6;
        const flap = Math.sin(c.phase * 30) * 1.1;
        c.wings![0].rotation.z = flap;
        c.wings![1].rotation.z = -flap;
        if (c.vel.lengthSq() > 0.01) c.facing = Math.atan2(c.vel.x, c.vel.z);
      } else if (c.kind === 'bird') {
        if (c.state !== 'fly' && dist < 5) {
          c.state = 'fly';
          const away = c.pos.clone().sub(player).setY(0).normalize();
          c.vel.set(away.x * 5, 4, away.z * 5);
        }
        if (c.state === 'fly') {
          c.pos.addScaledVector(c.vel, dt);
          c.vel.y += dt * 0.5;
          const flap = Math.sin(c.phase * 24) * 1.0;
          c.wings![0].rotation.z = flap;
          c.wings![1].rotation.z = -flap;
          c.facing = Math.atan2(c.vel.x, c.vel.z);
        } else {
          // клюёт землю и прыгает
          c.pos.y = ground;
          c.wings![0].rotation.z = 0.2;
          c.wings![1].rotation.z = -0.2;
          if (c.t <= 0) {
            c.t = 0.6 + Math.random() * 1.5;
            c.facing += (Math.random() - 0.5) * 2;
            const step = 0.4;
            const nx = c.pos.x + Math.sin(c.facing) * step,
              nz = c.pos.z + Math.cos(c.facing) * step;
            if (this.world.canStand(c.pos.y, nx, nz, 0.1)) {
              c.pos.x = nx;
              c.pos.z = nz;
            }
          }
          c.obj.rotation.x = Math.sin(c.phase * 6) > 0.7 ? 0.5 : 0;
        }
      } else {
        // наземные: бродят и убегают от игрока
        const scared = (c.kind === 'fox' || c.kind === 'lizard') && dist < 6;
        if (scared) c.state = 'flee';
        if (c.state === 'flee') {
          const away = c.pos.clone().sub(player).setY(0).normalize();
          c.target.copy(c.pos).addScaledVector(away, 6);
          if (dist > 12) c.state = 'idle';
        } else if (c.t <= 0) {
          c.t = 2 + Math.random() * 4;
          if (c.state === 'idle') {
            c.state = 'walk';
            c.target.set(c.pos.x + (Math.random() - 0.5) * 10, 0, c.pos.z + (Math.random() - 0.5) * 10);
          } else c.state = 'idle';
        }
        let moving = false;
        if (c.state !== 'idle') {
          const dir = c.target.clone().sub(c.pos).setY(0);
          const len = dir.length();
          if (len > 0.3) {
            const sp = (c.state === 'flee' ? (c.kind === 'lizard' ? 6 : 5.5) : c.kind === 'camel' ? 1.2 : 1.6) * dt;
            dir.divideScalar(len);
            const nx = c.pos.x + dir.x * sp,
              nz = c.pos.z + dir.z * sp;
            const h = this.world.heightAt(nx, nz);
            if (h !== null && h >= SEA && this.world.canStand(c.pos.y, nx, nz, 0.3)) {
              c.pos.x = nx;
              c.pos.z = nz;
              moving = true;
              c.facing = Math.atan2(dir.x, dir.z);
            } else c.state = 'idle';
          } else c.state = 'idle';
        }
        const g2 = this.world.heightAt(c.pos.x, c.pos.z);
        if (g2 !== null) c.pos.y += (g2 - c.pos.y) * Math.min(1, dt * 10);
        c.rig!.animate(dt, { moving, speed: c.state === 'flee' ? 6 : 2, attack: -1, cast: -1, dead: -1, stunned: false });
      }
      c.obj.position.copy(c.pos);
      c.obj.rotation.y = c.facing;
      return true;
    });
    void t;
  }

  dispose() {
    for (const c of this.list) this.scene.remove(c.obj);
    this.list = [];
  }
}
