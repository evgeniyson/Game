// Трава-«иголки» и мелкий мусор (камешки, веточки, листья) из микро-вокселей вокруг игрока.
// Инстансинг: один draw call на траву, один на мусор. Ветер и примятие игроком — в вершинном шейдере.
import * as THREE from 'three';
import { B } from '../world/blocks';
import { SEA } from '../world/gen';
import type { World } from '../world/world';
import { hash2 } from '../core/rng';
import { U } from './uniforms';
import { settings } from '../core/settings';

const MICRO = 1 / 8;

interface Palette {
  cols: THREE.Color[];
  n: [number, number]; // число травинок в колонке
  h: [number, number]; // высота в микро-вокселях
  flowers?: number; // шанс цветка
}

const C = (...hex: number[]) => hex.map((h) => new THREE.Color(h));

const GRASS_BY_TOP: Partial<Record<number, Palette>> = {
  [B.Grass]: { cols: C(0x8cc160, 0x97c86a, 0x80b658, 0xa2cc74, 0x8abb5e), n: [5, 10], h: [1, 4], flowers: 0.022 },
  [B.DarkGrass]: { cols: C(0x62984c, 0x578a44, 0x6ea456, 0x5c9046), n: [6, 10], h: [2, 5], flowers: 0.01 },
  [B.Snow]: { cols: C(0xf4f6ff, 0xe6ecff, 0xd8e0f8, 0xece4d8), n: [3, 7], h: [2, 7] },
  [B.Moss]: { cols: C(0x7a8a3a, 0x8a9a48, 0x6a7a30), n: [4, 8], h: [3, 7] },
  [B.Mud]: { cols: C(0x6a7a38, 0x7a7040), n: [0, 3], h: [2, 6] },
  [B.Sand]: { cols: C(0xc8a868, 0xb89858, 0xd4b878), n: [0, 1], h: [2, 4] },
  [B.Path]: { cols: C(0x9ab860, 0xa8c070), n: [0, 1], h: [1, 2] },
  [B.Asphalt]: { cols: C(0x86b850, 0x96c460), n: [0, 1], h: [1, 3] },
  [B.Gravel]: { cols: C(0x86b850), n: [0, 1], h: [1, 2] },
};
const FLOWER = C(0xf4d03f, 0xe8564a, 0xffffff, 0xc89aff, 0xff9ad0);

interface DebrisRule {
  p: number;
  cols: THREE.Color[];
}
const DEBRIS_BY_TOP: Partial<Record<number, DebrisRule>> = {
  [B.Grass]: { p: 0.16, cols: C(0x9a9890, 0x7a5a3a, 0x8a8278, 0xb0a070) },
  [B.DarkGrass]: { p: 0.22, cols: C(0x6a4a30, 0x8a6a40, 0x7a7068, 0xb8862f) },
  [B.Sand]: { p: 0.16, cols: C(0x8a6040, 0xa07850, 0x6a4a30, 0xd0b080) },
  [B.Snow]: { p: 0.14, cols: C(0xffffff, 0xe8eeff, 0x8a6a50) },
  [B.Asphalt]: { p: 0.3, cols: C(0x8a8a8a, 0x5a5a5a, 0xa0603a, 0xd8d0b0) },
  [B.Gravel]: { p: 0.4, cols: C(0x9a948a, 0x7a746a) },
  [B.Path]: { p: 0.25, cols: C(0x9a8a70, 0xb0a080, 0x7a6a50) },
  [B.Mud]: { p: 0.2, cols: C(0x4a3a2a, 0x5a4a30) },
  [B.Moss]: { p: 0.15, cols: C(0x5a4a30, 0x7a8a3a) },
};

function windShader(sh: THREE.WebGLProgramParametersWithUniforms, strength: number) {
  sh.uniforms.uTime = U.uTime;
  sh.uniforms.uWind = U.uWind;
  sh.uniforms.uPlayer = U.uPlayer;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;\nuniform vec3 uPlayer;\nvarying float vHgt;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vHgt = position.y;
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float sx = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
        float sy = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
        float k = position.y * position.y * sy;
        float sway = sin(uTime * 1.7 + ip.x * 0.6 + ip.z * 0.4) * 0.6 + sin(uTime * 3.3 + ip.x * 1.7 + ip.z * 1.1) * 0.25;
        vec2 bend = uWind * sway * ${strength.toFixed(3)} * k;
        vec2 away = ip.xz - uPlayer.xz;
        float d = length(away);
        if (d > 0.001 && abs(ip.y - uPlayer.y) < 1.5) bend += away / d * (1.0 - smoothstep(0.2, 1.4, d)) * 0.45 * k;
        transformed.x += bend.x / sx;
        transformed.z += bend.y / sx;
        transformed.y -= length(bend) * 0.3 / sy;
      #endif`,
    );
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vHgt;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.62, 1.08, clamp(vHgt, 0.0, 1.0));');
}

export class GrassField {
  grass: THREE.InstancedMesh;
  debris: THREE.InstancedMesh;
  private center = new THREE.Vector3(1e9, 0, 1e9);
  private lastChunks = -1;
  private cooldown = 0;
  readonly MAX_G = 52000;
  readonly MAX_D = 9000;
  radius = 28;

  constructor(private scene: THREE.Scene, private world: World) {
    const bg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    bg.deleteAttribute('uv');
    const gm = new THREE.MeshLambertMaterial({ color: 0xffffff });
    gm.onBeforeCompile = (sh) => windShader(sh, 0.16);
    this.grass = new THREE.InstancedMesh(bg, gm, this.MAX_G);
    this.grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grass.setColorAt(0, new THREE.Color());
    this.grass.count = 0;
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    scene.add(this.grass);

    const dg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    dg.deleteAttribute('uv');
    const dm = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.debris = new THREE.InstancedMesh(dg, dm, this.MAX_D);
    this.debris.setColorAt(0, new THREE.Color());
    this.debris.count = 0;
    this.debris.frustumCulled = false;
    this.debris.receiveShadow = true;
    this.debris.castShadow = true;
    scene.add(this.debris);
  }

  dispose() {
    this.scene.remove(this.grass, this.debris);
    this.grass.geometry.dispose();
    this.debris.geometry.dispose();
  }

  update(dt: number, pos: THREE.Vector3) {
    this.cooldown -= dt;
    const moved = Math.hypot(pos.x - this.center.x, pos.z - this.center.z);
    const chunks = this.world.chunks.size;
    if ((moved > 5 || chunks !== this.lastChunks) && this.cooldown <= 0) {
      this.cooldown = 0.4;
      this.lastChunks = chunks;
      this.center.copy(pos);
      this.rebuild();
    }
  }

  rebuild() {
    const w = this.world;
    const R = settings.quality === 'low' ? 16 : settings.quality === 'medium' ? 22 : this.radius;
    const density = settings.quality === 'low' ? 0.4 : settings.quality === 'medium' ? 0.7 : 1;
    const cx = Math.floor(this.center.x),
      cz = Math.floor(this.center.z);
    const gm = this.grass.instanceMatrix.array as Float32Array;
    const gc = this.grass.instanceColor!.array as Float32Array;
    const dmArr = this.debris.instanceMatrix.array as Float32Array;
    const dc = this.debris.instanceColor!.array as Float32Array;
    let ng = 0,
      nd = 0;
    const put = (arr: Float32Array, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const o = i * 16;
      arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
    };
    const col = (arr: Float32Array, i: number, c: THREE.Color, k: number) => {
      arr[i * 3] = c.r * k;
      arr[i * 3 + 1] = c.g * k;
      arr[i * 3 + 2] = c.b * k;
    };
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        const x = cx + dx,
          z = cz + dz;
        const h = w.heightAt(x, z);
        if (h === null || h < SEA) continue;
        const top = w.topAt(x, z);
        const pal = GRASS_BY_TOP[top];
        if (pal && ng < this.MAX_G - 16) {
          const r0 = hash2(x, z, 991);
          let n = Math.round((pal.n[0] + r0 * (pal.n[1] - pal.n[0])) * density);
          if (pal.n[1] <= 1) n = r0 < 0.12 ? 1 + (r0 < 0.03 ? 1 : 0) : 0;
          for (let i = 0; i < n; i++) {
            const a = hash2(x * 13 + i, z * 7 - i, 31);
            const b = hash2(x * 5 - i, z * 11 + i * 3, 57);
            const mx = Math.floor(a * 8) * MICRO + MICRO * 0.5;
            const mz = Math.floor(b * 8) * MICRO + MICRO * 0.5;
            const hh = pal.h[0] + Math.floor(hash2(x + i * 17, z - i * 5, 77) * (pal.h[1] - pal.h[0] + 1));
            const flower = pal.flowers && hash2(x - i, z + i * 9, 13) < pal.flowers;
            const c = flower ? FLOWER[Math.floor(a * 97) % FLOWER.length] : pal.cols[Math.floor(b * 53) % pal.cols.length];
            put(gm, ng, x + mx, h, z + mz, MICRO * 0.9, hh * MICRO, MICRO * 0.9);
            col(gc, ng, c, 0.9 + hash2(i, x + z, 5) * 0.2);
            ng++;
          }
        }
        const dr = DEBRIS_BY_TOP[top];
        if (dr && nd < this.MAX_D - 2) {
          const r1 = hash2(x, z, 4242);
          if (r1 < dr.p * density) {
            const a = hash2(x, z, 4243),
              b = hash2(z, x, 4244);
            const kind = Math.floor(a * 3);
            const sx = kind === 1 ? MICRO * 3 : MICRO * (1 + Math.floor(b * 2));
            const sz = kind === 2 ? MICRO * 3 : MICRO * (1 + Math.floor(a * 2));
            const sy = kind === 0 ? MICRO : MICRO * 0.5;
            put(dmArr, nd, x + Math.floor(a * 6) * MICRO + MICRO, h - 0.02, z + Math.floor(b * 6) * MICRO + MICRO, sx, sy, sz);
            col(dc, nd, dr.cols[Math.floor(r1 * 1000) % dr.cols.length], 0.9 + b * 0.2);
            nd++;
          }
        }
      }
    this.grass.count = ng;
    this.debris.count = nd;
    this.grass.instanceMatrix.needsUpdate = true;
    this.grass.instanceColor!.needsUpdate = true;
    this.debris.instanceMatrix.needsUpdate = true;
    this.debris.instanceColor!.needsUpdate = true;
  }
}
