// Воксельные модели персонажей, мобов и объектов лагеря + процедурная анимация.
import * as THREE from 'three';
import { VoxelGrid, jit, mixHex, vhash } from './voxel';
import { buildGear, addRuneGems, RARITY_GLOW, WS } from './weaponModels';

export const CS = 0.085; // масштаб вокселя персонажа

export interface AnimState {
  moving: boolean;
  speed: number;
  attack: number; // 0..1 прогресс удара, <0 — нет
  cast: number; // 0..1 прогресс каста, <0 — нет
  dead: number; // 0..1 прогресс смерти, <0 — жив
  stunned: boolean;
}

export type RigKind = 'biped' | 'quad' | 'blob' | 'crab' | 'static';

/** Пока true — модели мобов/станций строятся вдвое мельче со скруглёнными углами */
let REFINE = false;

export class Rig {
  group = new THREE.Group(); // позиция и поворот в мире
  root = new THREE.Group(); // покачивание/наклон
  head?: THREE.Object3D;
  torso?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  legs: THREE.Object3D[] = [];
  tail?: THREE.Object3D;
  material: THREE.MeshLambertMaterial;
  height = 1.8;
  private phase = 0;
  private flash = 0;
  kind: RigKind;
  baseScale = 1;
  baseEmissive = new THREE.Color(0, 0, 0);

  constructor(kind: RigKind, material?: THREE.MeshLambertMaterial) {
    this.kind = kind;
    this.material = material ?? new THREE.MeshLambertMaterial({ vertexColors: true });
    this.group.add(this.root);
  }

  mesh(g: VoxelGrid, origin: [number, number, number], scale = CS): THREE.Mesh {
    if (REFINE) {
      g = g.refine(2);
      scale /= 2;
      origin = [origin[0] * 2, origin[1] * 2, origin[2] * 2];
    }
    const m = new THREE.Mesh(g.toGeometry(scale, origin), this.material);
    m.castShadow = true;
    m.receiveShadow = false;
    return m;
  }

  part(g: VoxelGrid, origin: [number, number, number], pos: [number, number, number], parent: THREE.Object3D = this.root, scale = CS): THREE.Group {
    const p = new THREE.Group();
    p.position.set(pos[0], pos[1], pos[2]);
    p.add(this.mesh(g, origin, scale));
    parent.add(p);
    return p;
  }

  hit() {
    this.flash = 1;
  }

  setScale(s: number) {
    this.baseScale = s;
    this.group.scale.setScalar(s);
  }

  animate(dt: number, st: AnimState) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      const b = this.baseEmissive;
      this.material.emissive.setRGB(b.r + this.flash * 0.9, b.g + this.flash * 0.3, b.b + this.flash * 0.2);
    }
    if (st.dead >= 0) {
      const t = Math.min(1, st.dead * 2.5);
      this.root.rotation.z = t * (Math.PI / 2) * 0.95;
      this.root.position.y = -t * 0.2;
      if (st.dead > 0.6) this.group.scale.setScalar(this.baseScale * Math.max(0.01, 1 - (st.dead - 0.6) * 2.5));
      return;
    }
    this.root.rotation.z = 0;
    const sp = st.stunned ? 0 : st.moving ? st.speed : 0;
    this.phase += dt * (st.moving && !st.stunned ? 6 + sp * 1.4 : 0);
    const swing = st.moving && !st.stunned ? Math.sin(this.phase) : 0;
    const t = performance.now() / 1000;

    if (this.kind === 'blob') {
      const sq = st.moving ? Math.abs(Math.sin(this.phase * 0.7)) : Math.sin(t * 2) * 0.3 + 0.3;
      this.root.scale.set(1 + sq * 0.15, 1 - sq * 0.2, 1 + sq * 0.15);
      this.root.position.y = st.moving ? Math.abs(Math.sin(this.phase * 0.7)) * 0.25 : 0;
      if (st.attack >= 0) this.root.position.z = Math.sin(st.attack * Math.PI) * 0.4;
      else this.root.position.z = 0;
      return;
    }

    this.root.position.y = st.moving ? Math.abs(swing) * 0.06 : Math.sin(t * 2) * 0.012;
    if (this.kind === 'biped') {
      if (this.legs[0]) this.legs[0].rotation.x = swing * 0.7;
      if (this.legs[1]) this.legs[1].rotation.x = -swing * 0.7;
      let rArm = -swing * 0.6;
      let lArm = swing * 0.6;
      let lArmZ = 0;
      let rArmZ = 0;
      if (st.attack >= 0) {
        const a = st.attack;
        rArm = a < 0.35 ? -2.4 * (a / 0.35) : -2.4 + 3.2 * Math.min(1, (a - 0.35) / 0.3);
        if (this.torso) this.torso.rotation.y = Math.sin(a * Math.PI) * 0.4;
      } else if (this.torso) this.torso.rotation.y = 0;
      if (st.cast >= 0) {
        const c = Math.sin(Math.min(1, st.cast) * Math.PI);
        rArm = -2.6 * c;
        lArm = -2.6 * c;
        lArmZ = 0.4 * c;
        rArmZ = -0.4 * c;
      }
      if (st.stunned) {
        rArm = 0.2;
        lArm = 0.2;
        if (this.head) this.head.rotation.z = Math.sin(t * 5) * 0.2;
      } else if (this.head) this.head.rotation.z = 0;
      if (this.armR) {
        this.armR.rotation.x = rArm;
        this.armR.rotation.z = rArmZ;
      }
      if (this.armL) {
        this.armL.rotation.x = lArm;
        this.armL.rotation.z = lArmZ;
      }
    } else if (this.kind === 'quad' || this.kind === 'crab') {
      const n = this.legs.length;
      for (let i = 0; i < n; i++) {
        const ph = i % 2 === 0 ? 1 : -1;
        const side = i < n / 2 ? 1 : -1;
        if (this.kind === 'quad') this.legs[i].rotation.x = swing * 0.6 * ph * side;
        else this.legs[i].rotation.z = (st.moving ? Math.sin(this.phase * 1.6 + i) * 0.5 : 0) * side;
      }
      if (this.tail) this.tail.rotation.y = Math.sin(t * 6) * 0.4;
      if (st.attack >= 0) {
        const a = Math.sin(st.attack * Math.PI);
        this.root.position.z = a * 0.35;
        if (this.head) this.head.rotation.x = -a * 0.5;
      } else {
        this.root.position.z = 0;
        if (this.head) this.head.rotation.x = 0;
      }
    }
  }
}

// ---------------- Персонаж игрока (высокое разрешение) ----------------
export interface Appearance {
  cls: 'warden' | 'ranger' | 'mystic';
  skin: number;
  hair: number;
  longHair: boolean;
}

export const SKINS = [0xf6d5b8, 0xe8b48a, 0xc68a5e, 0x8d5a3b];
export const HAIRS = [0x2b2b33, 0x6b4a2f, 0xd8b26a, 0xc0503a, 0xe8e8f0, 0x5a7bd8, 0x7a4ac8];

export const PS = 0.056; // воксель персонажа

const CLASS_COLORS = {
  warden: { top: 0x8a9aae, top2: 0x3d6fb5, pants: 0x3a3e4a, boots: 0x5a3f2b, accent: 0xd8b04a, cape: 0x2f5a9a },
  ranger: { top: 0x6b8f3a, top2: 0x8a6a40, pants: 0x5a4632, boots: 0x3e2c1e, accent: 0xc9a46a, cape: 0x3f6a32 },
  mystic: { top: 0xf2efe6, top2: 0x4a7bd1, pants: 0x2f3d6b, boots: 0x2a2a3a, accent: 0x5fe0ff, cape: 0 },
};

const darker = (c: number, k = 0.75) => mixHex(c, 0x000000, 1 - k);

/** Персонаж со слотами под оружие/щит/головной убор, плащом и вторичной анимацией */
export class CharacterRig extends Rig {
  weaponSlot = new THREE.Group();
  offhandSlot = new THREE.Group();
  backSlot = new THREE.Group();
  floatSlot = new THREE.Group();
  headSlot = new THREE.Group();
  hairBack?: THREE.Object3D;
  cape?: THREE.Object3D;
  lids?: THREE.Object3D;
  defaultHead = new THREE.Group();
  weaponTip = new THREE.Object3D();
  private blinkT = 2;
  private gearMats: THREE.MeshLambertMaterial[] = [];
  weaponRarity = 0;
  meleeWeapon = true;

  constructor(public ap: Appearance) {
    super('biped');
  }

  private gearMesh(grid: VoxelGrid, rarity: number, plus: number): THREE.Mesh {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.emissive.setHex(RARITY_GLOW[Math.min(4, rarity)]);
    if (plus >= 3) mat.emissive.lerp(new THREE.Color(0x404040), 0.5);
    this.gearMats.push(mat);
    const m = new THREE.Mesh(grid.toGeometry(WS), mat);
    m.castShadow = true;
    return m;
  }

  private clear(slot: THREE.Group) {
    for (const c of [...slot.children]) {
      slot.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
  }

  setWeapon(id: string | null, rarity = 0, runes: string[] = [], plus = 0) {
    this.clear(this.weaponSlot);
    if (this.offhandSlot.userData.bow) {
      this.clear(this.offhandSlot);
      this.offhandSlot.userData.bow = false;
    }
    this.weaponRarity = rarity;
    this.meleeWeapon = this.ap.cls === 'warden';
    if (!id) return;
    const gm = buildGear(id);
    if (!gm) return;
    addRuneGems(gm.grid, runes);
    const m = this.gearMesh(gm.grid, rarity, plus);
    if (gm.mount === 'bow') {
      // лук держим в левой руке
      this.clear(this.offhandSlot);
      m.rotation.y = Math.PI / 2;
      this.offhandSlot.add(m);
      this.offhandSlot.userData.bow = true;
      this.weaponTip.position.set(0, 0.6, 0);
      return;
    }
    m.rotation.x = id.includes('Staff') ? 0.08 : Math.PI / 2;
    this.weaponSlot.add(m);
    m.add(this.weaponTip);
    this.weaponTip.position.set(0, 20 * WS, 0);
  }

  setOffhand(id: string | null, rarity = 0) {
    if (this.offhandSlot.userData.bow) {
      // лук занимает левую руку — второй предмет вешаем на спину/рядом
    } else this.clear(this.offhandSlot);
    this.clear(this.backSlot);
    this.clear(this.floatSlot);
    if (!id) return;
    const gm = buildGear(id);
    if (!gm) return;
    const m = this.gearMesh(gm.grid, rarity, 0);
    if (gm.mount === 'arm') {
      if (this.offhandSlot.userData.bow) return;
      m.rotation.y = -Math.PI / 2;
      this.offhandSlot.add(m);
    } else if (gm.mount === 'back') {
      m.rotation.z = 0.5;
      this.backSlot.add(m);
    } else if (gm.mount === 'float') this.floatSlot.add(m);
  }

  setHeadgear(id: string | null) {
    this.clear(this.headSlot);
    this.defaultHead.visible = !id;
    if (!id) return;
    const g = headgearGrid(id, this.ap);
    if (!g) {
      this.defaultHead.visible = true;
      return;
    }
    this.headSlot.add(this.mesh(g, [6.5, 0, 6], PS));
  }

  animate(dt: number, st: AnimState) {
    super.animate(dt, st);
    if (st.dead >= 0) return;
    const t = performance.now() / 1000;
    // дыхание
    if (this.torso) this.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.012;
    // волосы и плащ
    const mv = st.moving ? 1 : 0;
    if (this.hairBack) this.hairBack.rotation.x = -0.12 * mv - Math.sin(t * 2 + 1) * 0.03 - Math.abs(Math.sin(t * 9)) * 0.05 * mv;
    if (this.cape) this.cape.rotation.x = -0.35 * mv - 0.05 - Math.sin(t * 7) * 0.06 * mv - Math.sin(t * 1.6) * 0.03;
    // моргание
    this.blinkT -= dt;
    if (this.lids) this.lids.visible = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3;
    // парящая руна
    this.floatSlot.position.set(-0.55 + Math.cos(t * 1.5) * 0.1, 1.2 + Math.sin(t * 2) * 0.08, 0.25 + Math.sin(t * 1.5) * 0.1);
    this.floatSlot.rotation.y = t;
  }
}

/** Коробчатая «оболочка» вокруг головы с волосами: x -2..14, z -2..13 */
function shell(g: VoxelGrid, y0: number, y1: number, col: (x: number, y: number, z: number) => number | null, back = -2) {
  for (let x = -2; x <= 14; x++)
    for (let z = back; z <= 13; z++)
      for (let y = y0; y <= y1; y++) {
        const edgeX = x === -2 || x === 14,
          edgeZ = z === back || z === 13,
          top = y === y1;
        if (!(edgeX || edgeZ || top)) continue;
        if (top && (edgeX || edgeZ)) continue; // скруглённая кромка сверху
        const c = col(x, y, z);
        if (c !== null) g.set(x, y, z, c);
      }
}

function headgearGrid(id: string, ap: Appearance): VoxelGrid | null {
  const g = new VoxelGrid();
  switch (id) {
    case 'warden':
    case 'steelHelm': {
      const base = id === 'warden' ? 0xa8b4c2 : 0x8a949e;
      shell(g, 5, 15, (x, y, z) => {
        if (z === 13 && y < 10 && x >= 1 && x <= 11) return null; // открытое лицо
        if (y === 10 || y === 11) return jit(darker(base, 0.78), x, y, z, 0.04);
        return jit(base, x, y, z, 0.04);
      });
      g.box(-1, 15, -1, 15, 1, 14, (x, y, z) => jit(base, x, y, z, 0.04)); // купол
      g.box(1, 16, 1, 11, 1, 10, (x, y, z) => jit(darker(base, 1.08), x, y, z, 0.04));
      g.box(-2, 9, 13, 3, 1, 1, darker(base, 0.6)).box(12, 9, 13, 3, 1, 1, darker(base, 0.6));
      if (id === 'warden') for (let z = -3; z <= 11; z++) g.box(5, 17 + Math.round(Math.sin(((z + 3) / 14) * Math.PI) * 2), z, 3, 2, 1, jit(0xc0392b, 5, 17, z, 0.08));
      return g;
    }
    case 'ranger':
    case 'leatherHood': {
      const base = id === 'ranger' ? 0x4f7f3a : 0x8a5a34;
      shell(g, 0, 15, (x, y, z) => (z === 13 && y < 12 && x >= 0 && x <= 12 ? null : jit(base, x, y, z, 0.06)), -3);
      g.box(-1, 15, -2, 15, 1, 15, (x, y, z) => jit(base, x, y, z, 0.06));
      g.box(4, 12, -5, 5, 3, 2, base).box(5, 10, -6, 3, 3, 1, base); // кончик капюшона
      g.box(-2, 12, 14, 17, 1, 1, darker(base, 0.8)); // кромка
      return g;
    }
    case 'mystic': {
      for (let x = -6; x <= 18; x++)
        for (let z = -6; z <= 18; z++) {
          const d = Math.hypot(x - 6, z - 5.5);
          if (d > 12.4) continue;
          const droop = d > 10 ? 1 : 0;
          g.set(x, 14 - droop, z, jit(d > 11.4 ? 0xe2ded2 : 0xf2efe6, x, 14, z, 0.03));
        }
      for (let y = 15; y < 30; y++) {
        const r = Math.max(0.6, 7.2 - (y - 15) * 0.45);
        const bend = y > 24 ? (y - 24) * 0.9 : 0;
        for (let x = -8; x <= 20; x++)
          for (let z = -8; z <= 20; z++) {
            if ((x - 6) ** 2 + (z - 5.5 + bend) ** 2 > r * r) continue;
            g.set(x, y, z, y === 15 || y === 16 ? 0x4a7bd1 : jit(0xf2efe6, x, y, z, 0.03));
          }
      }
      g.set(10, 16, 12, 0xffe080).set(11, 17, 12, 0xffe080).set(9, 17, 12, 0xffe080).set(10, 18, 12, 0xffe080);
      return g;
    }
    case 'sageCirclet': {
      shell(g, 9, 9, (x) => (x % 3 === 0 ? 0xf0d070 : 0xd8b04a));
      g.box(5, 9, 14, 3, 2, 1, 0x5fe0ff);
      return g;
    }
    case 'berserkerMask': {
      g.box(-1, 2, 13, 15, 8, 1, (x, y) => ((y === 4 || y === 5) && (x === 3 || x === 4 || x === 8 || x === 9) ? 0x111111 : jit(0xb02a2a, x, y, 13, 0.06)));
      g.line([0, 9, 13], [-3, 15, 12], 0.5, 0xf2e8d0).line([12, 9, 13], [15, 15, 12], 0.5, 0xf2e8d0);
      return g;
    }
  }
  void ap;
  return null;
}

export function buildCharacter(ap: Appearance): CharacterRig {
  const rig = new CharacterRig(ap);
  const c = CLASS_COLORS[ap.cls];
  const S = PS;
  const skin = ap.skin;
  const hair = ap.hair;

  // ---- Ноги (пивот у бедра): 4×10×4, ботинки с подошвой и носком
  const leg = (side: number) => {
    const g = new VoxelGrid();
    g.box(0, 0, 0, 4, 10, 4, (x, y, z) => {
      if (y === 0) return darker(c.boots, 0.6);
      if (y <= 2) return jit(c.boots, x, y, z, 0.05);
      if (y === 3) return ap.cls === 'warden' ? 0xa8b4c2 : darker(c.boots, 1.15);
      if (y <= 5) return ap.cls === 'warden' ? jit(0x9aa7b5, x, y, z, 0.04) : ap.cls === 'mystic' ? c.pants : jit(0xf2efe6, x, y, z, 0.03);
      return jit(c.pants, x, y, z, 0.05);
    });
    g.box(0, 0, 4, 4, 2, 1, c.boots).box(0, 0, 4, 4, 1, 1, darker(c.boots, 0.6)); // носок
    if (ap.cls === 'warden') g.box(0, 5, 4, 4, 2, 1, 0xa8b4c2); // наколенник
    return rig.part(g, [2, 10, 2], [side * 2 * S, 10 * S, 0], rig.root, S);
  };
  rig.legs.push(leg(-1), leg(1));

  // ---- Торс 10×9×6
  const torso = new THREE.Group();
  torso.position.set(0, 10 * S, 0);
  rig.root.add(torso);
  rig.torso = torso;
  const tg = new VoxelGrid();
  tg.box(0, 0, 0, 10, 9, 6, (x, y, z) => {
    const front = z === 5;
    if (y <= 1) return y === 1 && front && (x === 4 || x === 5) ? c.accent : jit(0x4a3020, x, y, z, 0.05); // ремень с пряжкой
    if (ap.cls === 'warden') {
      if (front && (x === 4 || x === 5)) return jit(c.top2, x, y, z, 0.04);
      if (front && y === 6 && (x === 1 || x === 8)) return 0xe0e4e8; // заклёпки
      return jit(y >= 7 ? 0xa8b4c2 : c.top, x, y, z, 0.04);
    }
    if (ap.cls === 'ranger') {
      if (front && x + 1 === y) return jit(0x6a4a2a, x, y, z, 0.05); // перевязь
      if (front && y === 8 && x >= 3 && x <= 6) return 0xf2efe6; // воротник рубашки
      return jit(c.top, x, y, z, 0.05);
    }
    if (front && (x === 4 || x === 5)) return c.top2;
    if (front && y === 8) return c.top2;
    return jit(c.top, x, y, z, 0.03);
  });
  if (ap.cls === 'ranger') tg.box(-1, 2, 1, 1, 3, 3, 0x6a4a2a).set(-1, 3, 4, c.accent); // подсумок
  if (ap.cls === 'mystic') {
    // подол мантии
    for (let y = -6; y < 0; y++) {
      const grow = Math.floor(-y / 3);
      tg.box(-grow, y, -grow, 10 + grow * 2, 1, 6 + grow * 2, (x, yy, z) => (yy === -6 ? c.top2 : (z === 5 + grow && (x === 4 || x === 5)) ? c.top2 : jit(c.top, x, yy, z, 0.03)));
    }
  }
  torso.add(rig.mesh(tg, [5, 0, 3], S));

  // ---- Плащ
  if (c.cape) {
    const cg = new VoxelGrid();
    for (let x = -5; x < 5; x++) {
      const len = 15 + Math.round(vhash(x, 0, 0, 3) * 2);
      for (let y = -len; y <= 0; y++) cg.set(x, y, 0, jit(y > -2 ? darker(c.cape, 0.8) : c.cape, x, y, 0, 0.05));
    }
    const cape = rig.part(cg, [-0.5, 0, 0], [0, 8.5 * S, -3.6 * S], torso, S);
    rig.cape = cape;
  }

  // ---- Руки (пивот у плеча) 3×9×3
  const arm = (side: number) => {
    const g = new VoxelGrid();
    g.box(0, 0, 0, 3, 9, 3, (x, y, z) => {
      if (y <= 1) return ap.cls === 'mystic' ? skin : y === 0 ? darker(c.boots, 0.9) : jit(0x6a4a2a, x, y, z, 0.05); // кисть/перчатка
      if (y === 2) return ap.cls === 'mystic' ? c.top2 : skin;
      return jit(ap.cls === 'warden' && y >= 6 ? 0xa8b4c2 : c.top, x, y, z, 0.04);
    });
    if (ap.cls === 'warden') g.box(-1, 6, -1, 5, 3, 5, (x, y, z) => jit(y === 8 ? 0xc0c8d2 : 0x9aa7b5, x, y, z, 0.04)); // наплечник
    if (ap.cls === 'mystic') g.box(-1, 2, -1, 5, 2, 5, (x, y, z) => jit(c.top, x, y, z, 0.03)); // широкий рукав
    return rig.part(g, [1.5, 9, 1.5], [side * 6.5 * S, 8.6 * S, 0], torso, S);
  };
  rig.armL = arm(-1);
  rig.armR = arm(1);
  rig.weaponSlot.position.set(0, -8.4 * S, 0.6 * S);
  rig.armR.add(rig.weaponSlot);
  rig.offhandSlot.position.set(-0.4 * S, -6.5 * S, 0.8 * S);
  rig.armL.add(rig.offhandSlot);
  rig.backSlot.position.set(2 * S, 2 * S, -4 * S);
  torso.add(rig.backSlot);
  rig.group.add(rig.floatSlot);

  // ---- Голова 13×12×12 (чиби), лицо на z=11
  const hg = new VoxelGrid();
  hg.box(0, 0, 0, 13, 12, 12, (x, y, z) => jit(skin, x, y, z, 0.02));
  const FZ = 12; // слой лица перед кожей
  const eyeCol = 0x6a3a2a;
  for (const ex of [3, 8]) {
    hg.box(ex - 1, 6, FZ - 1, 4, 1, 1, 0x2a1a14); // ресницы
    hg.box(ex, 4, FZ - 1, 2, 2, 1, eyeCol);
    hg.set(ex, 5, FZ - 1, 0xffffff); // блик
    hg.set(ex + 1, 4, FZ - 1, darker(eyeCol, 0.6));
    hg.box(ex, 8, FZ - 1, 2, 1, 1, darker(hair, 0.8)); // брови
    hg.set(ex === 3 ? 2 : 10, 3, FZ - 1, 0xf2a0a0); // румянец
  }
  hg.set(6, 2, FZ - 1, 0xc07060).set(7, 2, FZ - 1, 0xb06050); // рот
  hg.set(6, 3, FZ - 1, darker(skin, 0.92));
  // волосы: шапка, чёлка с прядями, виски, затылок
  for (let x = -1; x <= 13; x++)
    for (let z = -1; z <= 12; z++) {
      for (let y = 9; y <= 12; y++) if (!(z === 12 && y < 9)) hg.set(x, y, z, jit(hair, x, y, z, 0.06));
      hg.set(x, 13, z, jit(darker(hair, 1.1), x, 13, z, 0.06));
    }
  for (let x = 0; x <= 12; x++) {
    const len = 2 + Math.floor(vhash(x, 1, 1, 7) * 3) + (x === 0 || x === 12 ? 3 : 0);
    for (let y = 12 - len; y <= 11; y++) hg.set(x, y, FZ, jit(hair, x, y, FZ, 0.06));
  }
  for (const sx of [-1, 13]) for (let y = 2; y <= 11; y++) for (let z = 5; z <= 12; z++) if (y > 4 || z < 10) hg.set(sx, y, z, jit(hair, sx, y, z, 0.06));
  for (let x = -1; x <= 13; x++) for (let y = 2; y <= 12; y++) hg.set(x, y, -1, jit(hair, x, y, -1, 0.06));
  const head = new THREE.Group();
  head.position.set(0, 9 * S, 0);
  head.add(rig.mesh(hg, [6.5, 0, 6], S));
  torso.add(head);
  rig.head = head;
  // веки для моргания
  const lg = new VoxelGrid();
  for (const ex of [3, 8]) lg.box(ex, 4, FZ, 2, 2, 1, darker(skin, 0.9));
  const lids = rig.part(lg, [6.5, 0, 6], [0, 0, 0], head, S);
  lids.visible = false;
  rig.lids = lids;
  // длинные волосы — отдельная часть с покачиванием
  if (ap.longHair) {
    const bg = new VoxelGrid();
    for (let x = 0; x <= 12; x++) {
      const len = 13 + Math.round(vhash(x, 2, 2, 9) * 3) - (x === 0 || x === 12 ? 3 : 0);
      for (let y = -len; y <= 0; y++) bg.set(x, y, 0, jit(y < -len + 2 ? darker(hair, 0.85) : hair, x, y, 0, 0.06)).set(x, y, -1, jit(hair, x, y, -1, 0.06));
    }
    rig.hairBack = rig.part(bg, [6.5, 0, 0], [0, 9 * S, -8 * S], head, S);
  }
  // головной убор класса (заменяется предметом головы)
  head.add(rig.defaultHead);
  head.add(rig.headSlot);
  const dh = headgearGrid(ap.cls, ap);
  if (dh) rig.defaultHead.add(rig.mesh(dh, [6.5, 0, 6], S));
  rig.height = 31 * S;
  return rig;
}

// ---------------- Мобы ----------------
export function buildMob(model: string): Rig {
  REFINE = true;
  try {
    return buildMobInner(model);
  } finally {
    REFINE = false;
  }
}

function buildMobInner(model: string): Rig {
  switch (model) {
    case 'crab':
      return crab();
    case 'slime':
      return slime(0x7ad66a);
    case 'slimeBlue':
      return slime(0x6ab8f0);
    case 'wolf':
      return quad({ body: 0x6b7a6a, belly: 0x9aa89a, accent: 0x6cc23c, len: 10, h: 5, legH: 5, snout: true, ears: true, tail: true });
    case 'boar':
      return quad({ body: 0x7a5a40, belly: 0x9a7a5a, accent: 0x8fcf4f, len: 10, h: 6, legH: 3, tusks: true, tail: true });
    case 'deer':
      return quad({ body: 0xc08a50, belly: 0xeedcc0, accent: 0xffffff, len: 9, h: 5, legH: 7, antlers: true, tail: true });
    case 'rabbit':
      return quad({ body: 0xe8dcc8, belly: 0xffffff, accent: 0xf0a0a0, len: 5, h: 4, legH: 2, ears: true, horn: true });
    case 'fox':
      return quad({ body: 0xd8642a, belly: 0xf2efe6, accent: 0xe87a3a, len: 8, h: 4, legH: 3, snout: true, ears: true, tail: true });
    case 'camel':
      return quad({ body: 0xc89a5a, belly: 0xe0c08a, accent: 0xb8864a, len: 12, h: 6, legH: 10, snout: true, tail: true, hump: true });
    case 'lizard':
      return quad({ body: 0x8a9a4a, belly: 0xc8c890, accent: 0x6a8a3a, len: 6, h: 2, legH: 1, tail: true });
    case 'toad':
      return toad();
    case 'automaton':
      return automaton();
    case 'ogre':
      return ogre();
    default:
      return slime(0xff00ff);
  }
}

function crab(): Rig {
  const rig = new Rig('crab');
  const bin = new VoxelGrid();
  bin.box(-3, 0, -3, 7, 7, 7, (x, y, z) => (y === 4 && z === 3 && x >= 0 && x <= 1 ? 0xd7f0d0 : jit(0x4c8c4a, x, y, z, 0.06)));
  bin.box(-4, 7, -4, 9, 1, 9, 0x3f7a3d);
  bin.box(-1, 8, -1, 3, 1, 3, (x, y, z) => ((x + z) % 2 ? 0x6cc23c : null));
  const body = rig.part(bin, [0.5, 0, 0.5], [0, 3 * CS, 0]);
  rig.torso = body;
  // глаза на стебельках
  const eyes = new VoxelGrid();
  eyes.box(-2, 0, 0, 1, 2, 1, 0xe08040).box(2, 0, 0, 1, 2, 1, 0xe08040).set(-2, 2, 0, 0x111111);
  eyes.set(2, 2, 0, 0x111111);
  rig.part(eyes, [0.5, 0, -3.5], [0, 1 * CS, 0], body);
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    const g = new VoxelGrid();
    g.box(0, -3, 0, 4, 1, 1, 0xe0703a);
    g.box(3, -5, 0, 1, 3, 1, 0xe0703a);
    const l = rig.part(g, [0, 0, 0.5], [side * 3 * CS, 4 * CS, (-2 + (i % 3) * 2) * CS]);
    if (side < 0) l.rotation.y = Math.PI;
    rig.legs.push(l);
  }
  const claw = new VoxelGrid();
  claw.box(-5, 0, 0, 3, 2, 3, 0xf08048).box(3, 0, 0, 3, 2, 3, 0xf08048);
  const head = rig.part(claw, [0.5, 0, 0], [0, 3 * CS, 3.5 * CS]);
  rig.head = head;
  rig.height = 10 * CS;
  return rig;
}

function slime(color: number): Rig {
  const rig = new Rig('blob', new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88 }));
  const g = new VoxelGrid();
  g.box(-4, 0, -4, 9, 7, 9, (x, y, z) => {
    if ((Math.abs(x - 0.5) > 3.5 && Math.abs(z - 0.5) > 3.5) || (y === 6 && (Math.abs(x - 0.5) > 3 || Math.abs(z - 0.5) > 3))) return null;
    return jit(color, x, y, z, 0.07);
  });
  g.set(-2, 4, 4, 0x111111);
  g.set(2, 4, 4, 0x111111);
  g.set(-2, 5, 4, 0xffffff);
  g.set(2, 5, 4, 0xffffff);
  g.set(0, 2, 4, 0x2a5a2a);
  rig.part(g, [0.5, 0, 0.5], [0, 0, 0]);
  rig.height = 7 * CS;
  return rig;
}

interface QuadOpts {
  body: number;
  belly: number;
  accent: number;
  len: number;
  h: number;
  legH: number;
  snout?: boolean;
  ears?: boolean;
  tail?: boolean;
  tusks?: boolean;
  antlers?: boolean;
  horn?: boolean;
  hump?: boolean;
}
function quad(o: QuadOpts): Rig {
  const rig = new Rig('quad');
  const w = Math.max(4, Math.round(o.h * 0.9));
  const bg = new VoxelGrid();
  bg.box(-w / 2, 0, -o.len / 2, w, o.h, o.len, (x, y, z) => {
    if (y === 0) return o.belly;
    if (y === o.h - 1 && (x + z) % 3 === 0) return o.accent;
    return jit(o.body, x, y, z, 0.06);
  });
  if (o.hump) bg.sphere(0, o.h + 1, -1, 2.5, 2.5, 3, (x, y, z) => jit(o.body, x, y, z, 0.06));
  const body = rig.part(bg, [0, 0, 0], [0, o.legH * CS, 0]);
  rig.torso = body;
  // голова
  const hs = Math.max(4, Math.round(o.h * 0.9));
  const hg = new VoxelGrid();
  hg.box(-hs / 2, 0, 0, hs, hs, hs, (x, y, z) => jit(o.body, x, y, z, 0.05));
  hg.set(-hs / 2, hs - 2, hs - 1, 0x111111);
  hg.set(hs / 2 - 1, hs - 2, hs - 1, 0x111111);
  if (o.snout) hg.box(-1, 0, hs, 3, 2, 3, o.body).set(0, 1, hs + 2, 0x222222);
  if (o.tusks) hg.box(-hs / 2 - 1, 0, hs - 1, 1, 2, 1, 0xffffff).box(hs / 2, 0, hs - 1, 1, 2, 1, 0xffffff).box(-1, 0, hs, 2, 2, 2, 0xd09a8a);
  if (o.ears) hg.box(-hs / 2, hs, 1, 1, o.horn ? 4 : 2, 1, o.body).box(hs / 2 - 1, hs, 1, 1, o.horn ? 4 : 2, 1, o.body);
  if (o.horn) hg.box(0, hs, hs - 2, 1, 3, 1, 0xf2e2a0);
  if (o.antlers) {
    hg.box(-2, hs, 1, 1, 4, 1, 0xd8c8a0).box(1, hs, 1, 1, 4, 1, 0xd8c8a0);
    hg.box(-4, hs + 3, 1, 3, 1, 1, 0xd8c8a0).box(1, hs + 3, 1, 3, 1, 1, 0xd8c8a0);
  }
  const head = rig.part(hg, [0, 0, 0], [0, (o.legH + o.h * 0.5) * CS, (o.len / 2 - 1) * CS]);
  rig.head = head;
  for (let i = 0; i < 4; i++) {
    const lg = new VoxelGrid();
    lg.box(0, -o.legH, 0, 2, o.legH, 2, (x, y) => (y === -o.legH ? 0x3a2a1a : o.body));
    const sx = i < 2 ? 1 : -1;
    const sz = i % 2 === 0 ? 1 : -1;
    const l = rig.part(lg, [1, 0, 1], [sx * (w / 2 - 1) * CS, o.legH * CS, sz * (o.len / 2 - 1.5) * CS]);
    rig.legs.push(l);
  }
  if (o.tail) {
    const tg = new VoxelGrid();
    tg.box(0, 0, -4, 1, 1, 4, o.accent === 0xffffff ? 0xffffff : o.body);
    rig.tail = rig.part(tg, [0.5, 0.5, 0], [0, (o.legH + o.h - 1) * CS, (-o.len / 2) * CS]);
  }
  rig.height = (o.legH + o.h + 2) * CS;
  return rig;
}

function toad(): Rig {
  const rig = new Rig('quad');
  const g = new VoxelGrid();
  g.sphere(0, 3, 0, 5, 3.5, 5, (x, y, z) => (y <= 1 ? 0xd8d090 : (x * 3 + z) % 5 === 0 ? 0x5a6a30 : jit(0x7a8a40, x, y, z, 0.06)));
  const body = rig.part(g, [0, 0, 0], [0, 1 * CS, 0]);
  rig.torso = body;
  const eg = new VoxelGrid();
  eg.box(-4, 0, 0, 3, 3, 3, 0xe8d860).box(2, 0, 0, 3, 3, 3, 0xe8d860).set(-3, 1, 3, 0x111111);
  eg.set(3, 1, 3, 0x111111);
  eg.box(-3, -3, 3, 7, 1, 1, 0xa04040);
  rig.head = rig.part(eg, [0.5, 0, 0], [0, 5 * CS, 2 * CS]);
  for (let i = 0; i < 4; i++) {
    const lg = new VoxelGrid();
    lg.box(0, -2, 0, 3, 2, 3, 0x6a7a35);
    rig.legs.push(rig.part(lg, [1.5, 0, 1.5], [(i < 2 ? 1 : -1) * 4 * CS, 2 * CS, (i % 2 ? -3 : 3) * CS]));
  }
  rig.height = 8 * CS;
  return rig;
}

function biped(colors: { body: number; limb: number; head: number }, sz: { tw: number; th: number; td: number; hs: number; aw: number; ah: number; lh: number; lw: number }, headFn?: (g: VoxelGrid) => void, bodyFn?: (g: VoxelGrid) => void): Rig {
  const rig = new Rig('biped');
  for (const side of [-1, 1]) {
    const g = new VoxelGrid();
    g.box(0, 0, 0, sz.lw, sz.lh, sz.lw, (x, y, z) => jit(colors.limb, x, y, z, 0.06));
    rig.legs.push(rig.part(g, [sz.lw / 2, sz.lh, sz.lw / 2], [side * (sz.tw / 4) * CS, sz.lh * CS, 0]));
  }
  const torso = new THREE.Group();
  torso.position.set(0, sz.lh * CS, 0);
  rig.root.add(torso);
  rig.torso = torso;
  const tg = new VoxelGrid();
  tg.box(0, 0, 0, sz.tw, sz.th, sz.td, (x, y, z) => jit(colors.body, x, y, z, 0.07));
  bodyFn?.(tg);
  torso.add(rig.mesh(tg, [sz.tw / 2, 0, sz.td / 2]));
  for (const side of [-1, 1]) {
    const g = new VoxelGrid();
    g.box(0, 0, 0, sz.aw, sz.ah, sz.aw, (x, y, z) => jit(colors.limb, x, y, z, 0.06));
    const a = rig.part(g, [sz.aw / 2, sz.ah, sz.aw / 2], [side * (sz.tw / 2 + sz.aw / 2) * CS, sz.th * CS, 0], torso);
    if (side < 0) rig.armL = a;
    else rig.armR = a;
  }
  const hg = new VoxelGrid();
  hg.box(0, 0, 0, sz.hs, sz.hs, sz.hs, (x, y, z) => jit(colors.head, x, y, z, 0.05));
  headFn?.(hg);
  const head = new THREE.Group();
  head.position.set(0, sz.th * CS, 0);
  head.add(rig.mesh(hg, [sz.hs / 2, 0, sz.hs / 2]));
  torso.add(head);
  rig.head = head;
  rig.height = (sz.lh + sz.th + sz.hs) * CS;
  return rig;
}

function automaton(): Rig {
  const rig = biped(
    { body: 0xa0603a, limb: 0x7d7f84, head: 0x8a8d92 },
    { tw: 8, th: 7, td: 5, hs: 6, aw: 2, ah: 7, lh: 6, lw: 2 },
    (g) => {
      g.box(1, 2, 6, 4, 1, 1, 0xff4a2a);
      g.box(2, 6, 2, 1, 3, 1, 0x555555);
      g.set(2, 9, 2, 0xff4a2a);
    },
    (g) => {
      g.box(2, 2, 5, 4, 3, 1, 0x3a3d42);
      g.set(3, 3, 6, 0x6fd8f5);
      g.set(1, 5, 5, 0x6cc23c);
      g.set(6, 1, 5, 0x6cc23c);
    },
  );
  return rig;
}

function ogre(): Rig {
  const rig = biped(
    { body: 0x8a8f7a, limb: 0x7a7f6a, head: 0x8a8f7a },
    { tw: 12, th: 9, td: 7, hs: 7, aw: 4, ah: 9, lh: 6, lw: 4 },
    (g) => {
      g.box(1, 3, 7, 2, 1, 1, 0xffd040);
      g.box(4, 3, 7, 2, 1, 1, 0xffd040);
      g.box(1, 1, 7, 5, 1, 1, 0x4a4a3a);
      g.box(0, 0, 7, 1, 2, 1, 0xf0f0e0);
      g.box(6, 0, 7, 1, 2, 1, 0xf0f0e0);
      g.box(-1, 6, -1, 9, 2, 9, (x, y, z) => ((x + z) % 2 ? 0x8fcf4f : 0x6cc23c));
    },
    (g) => {
      g.box(0, 7, -1, 12, 3, 9, (x, y, z) => ((x * 7 + z * 3 + y) % 4 === 0 ? 0x6cc23c : 0x8fcf4f));
      g.box(3, 0, 7, 6, 2, 1, 0x6b4a2f);
    },
  );
  // Каменный молот
  const hg = new VoxelGrid();
  hg.box(0, -2, 0, 2, 14, 2, 0x6b4a2f);
  hg.box(-3, 10, -3, 8, 6, 8, (x, y, z) => jit(0x9ea2a8, x, y, z, 0.12));
  const h = rig.part(hg, [1, 0, 1], [0, -9 * CS, 1 * CS], rig.armR);
  h.rotation.x = Math.PI / 2;
  return rig;
}

// ---------------- Объекты лагеря ----------------
export function buildStation(kind: string): THREE.Group {
  REFINE = true;
  try {
    return buildStationInner(kind);
  } finally {
    REFINE = false;
  }
}

function buildStationInner(kind: string): THREE.Group {
  const rig = new Rig('static');
  const S = 0.125;
  const g = new VoxelGrid();
  if (kind === 'workbench') {
    g.box(-5, 5, -3, 11, 1, 7, (x, y, z) => jit(0xb8864f, x, y, z, 0.08));
    for (const [x, z] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) g.box(x, 0, z, 1, 5, 1, 0x7a5434);
    g.box(-3, 6, -1, 3, 1, 1, 0x888888).box(1, 6, 0, 1, 2, 1, 0x6b4a2f).box(1, 8, -1, 3, 1, 2, 0x9aa7b5);
    g.box(-4, 1, -2, 9, 1, 5, 0x9b7653);
  } else if (kind === 'forge') {
    g.box(-4, 0, -4, 9, 7, 8, (x, y, z) => (z === 3 && y >= 1 && y <= 3 && x >= -1 && x <= 1 ? 0xff7a2a : jit(0x8d9096, x, y, z, 0.12)));
    g.box(-2, 7, -2, 4, 5, 4, (x, y, z) => jit(0x6b6e70, x, y, z, 0.1));
    g.box(5, 0, 0, 3, 3, 3, 0x3a3a3a).box(5, 3, 0, 4, 1, 2, 0x555555);
  } else if (kind === 'alchemy') {
    g.box(-5, 4, -3, 11, 1, 6, 0x7a5434);
    for (const [x, z] of [[-5, -3], [5, -3], [-5, 2], [5, 2]]) g.box(x, 0, z, 1, 4, 1, 0x5a3f2b);
    const fl = [0xe84a6a, 0x4ae86a, 0x6a8ae8, 0xe8d84a];
    fl.forEach((c, i) => g.box(-4 + i * 3, 5, -1, 2, 3, 2, c).set(-4 + i * 3, 8, -1, 0xdddddd));
    g.box(-2, 0, -2, 4, 3, 4, 0x4a4a4a);
  } else if (kind === 'altar') {
    g.box(-4, 0, -4, 9, 2, 9, (x, y, z) => jit(0x9ea2a8, x, y, z, 0.1));
    g.box(-2, 2, -2, 5, 5, 5, (x, y, z) => (y === 4 && (x === 0 || z === 0) ? 0x9a6ae8 : jit(0x8d9096, x, y, z, 0.1)));
    g.box(-1, 9, -1, 3, 4, 3, (x, y) => (y === 10 ? 0xd8b8ff : 0x9a6ae8));
  } else if (kind === 'board') {
    g.box(-5, 0, 0, 1, 12, 1, 0x7a5434).box(5, 0, 0, 1, 12, 1, 0x7a5434);
    g.box(-5, 6, 0, 11, 6, 1, 0xb8864f);
    g.box(-4, 7, 1, 3, 4, 1, 0xf2efe6).box(0, 8, 1, 3, 3, 1, 0xf2e2b0).box(3, 7, 1, 2, 3, 1, 0xf2efe6);
  } else if (kind === 'campfire') {
    g.box(-3, 0, -1, 7, 1, 2, 0x6b4a2f).box(-1, 0, -3, 2, 1, 7, 0x7a5434);
    g.box(-1, 1, -1, 2, 2, 2, 0xffa030).box(0, 3, 0, 1, 2, 1, 0xffd040);
  }
  const m = rig.mesh(g, [0, 0, 0], S);
  m.castShadow = true;
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

export function buildLootBag(color: number): THREE.Mesh {
  const g = new VoxelGrid();
  g.box(-2, 0, -2, 5, 4, 5, 0x9b7653).box(-1, 4, -1, 3, 1, 3, 0x7a5434).box(0, 5, 0, 1, 1, 1, color);
  g.box(-2, 2, 3, 5, 1, 1, color);
  const m = new THREE.Mesh(g.toGeometry(0.08, [0.5, 0, 0.5]), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(color), emissiveIntensity: 0.25 }));
  m.castShadow = true;
  return m;
}
