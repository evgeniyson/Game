// Рендер декораций всех загруженных чанков через InstancedMesh (тип × вариант × LOD).
// Переключение LOD и скрытие срубленных объектов — это просто пересборка матриц, без пересборки геометрии.
import * as THREE from 'three';
import { decoGeometry } from './decoModels';
import { D, SMALL_DECO } from '../world/decoTypes';
import { U } from './uniforms';

export const DECO_STRIDE = 7; // type, x, y, z, rot, scale, variant

export interface DecoSource {
  cx: number;
  cz: number;
  decos: Float32Array;
  hidden: Set<number>;
}

const PLANTS = new Set<number>([D.TreeOak, D.TreePine, D.TreeBirch, D.Bush, D.GrassTuft, D.FlowerRed, D.FlowerYellow, D.Reeds, D.Herb]);

function makeMat(wind: boolean) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (wind)
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.uniforms.uWind = U.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float hk = max(0.0, position.y - 0.6) / 3.0;
          float sw = sin(uTime * 1.3 + ip.x * 0.37 + ip.z * 0.23) * 0.7 + sin(uTime * 2.7 + ip.x) * 0.3;
          transformed.xz += uWind * sw * 0.07 * hk * hk;
        #endif`,
      );
    };
  return m;
}

export class DecoRenderer {
  private meshes = new Map<string, THREE.InstancedMesh>();
  private plantMat = makeMat(true);
  private propMat = makeMat(false);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  dirty = true;

  constructor(private scene: THREE.Scene) {}

  private getMesh(t: number, v: number, lod: 0 | 1, need: number): THREE.InstancedMesh {
    const k = `${t}:${v}:${lod}`;
    let m = this.meshes.get(k);
    if (!m || m.instanceMatrix.count < need) {
      if (m) {
        this.scene.remove(m);
        m.dispose();
      }
      let cap = 16;
      while (cap < need) cap *= 2;
      m = new THREE.InstancedMesh(decoGeometry(t as D, v, lod), PLANTS.has(t) ? this.plantMat : this.propMat, cap);
      m.frustumCulled = false;
      m.castShadow = !SMALL_DECO.has(t);
      m.receiveShadow = true;
      this.scene.add(m);
      this.meshes.set(k, m);
    }
    return m;
  }

  rebuild(chunks: Iterable<DecoSource>, pcx: number, pcz: number) {
    this.dirty = false;
    const buckets = new Map<string, number[]>();
    for (const c of chunks) {
      const lod: 0 | 1 = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) <= 1 ? 0 : 1;
      const n = c.decos.length / DECO_STRIDE;
      for (let i = 0; i < n; i++) {
        if (c.hidden.has(i)) continue;
        const o = i * DECO_STRIDE;
        const t = c.decos[o];
        const k = `${t}:${c.decos[o + 6]}:${lod}`;
        let b = buckets.get(k);
        if (!b) buckets.set(k, (b = []));
        b.push(c.decos[o + 1], c.decos[o + 2], c.decos[o + 3], c.decos[o + 4], c.decos[o + 5]);
      }
    }
    for (const [k, m] of this.meshes) if (!buckets.has(k)) m.count = 0;
    for (const [k, arr] of buckets) {
      const [t, v, lod] = k.split(':').map(Number);
      const n = arr.length / 5;
      const m = this.getMesh(t, v, lod as 0 | 1, n);
      for (let i = 0; i < n; i++) {
        const o = i * 5;
        this.p.set(arr[o], arr[o + 1], arr[o + 2]);
        this.q.setFromAxisAngle(this.up, arr[o + 3]);
        this.s.setScalar(arr[o + 4]);
        this.m4.compose(this.p, this.q, this.s);
        m.setMatrixAt(i, this.m4);
      }
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of this.meshes.values()) {
      this.scene.remove(m);
      m.dispose();
    }
    this.meshes.clear();
  }
}
