// Воксельные модели персонажей, мобов и объектов лагеря + процедурная анимация.
import * as THREE from 'three';
import { VoxelGrid, jit } from './voxel';

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

// ---------------- Персонаж игрока ----------------
export interface Appearance {
  cls: 'warden' | 'ranger' | 'mystic';
  skin: number;
  hair: number;
  longHair: boolean;
}

export const SKINS = [0xf6d5b8, 0xe8b48a, 0xc68a5e, 0x8d5a3b];
export const HAIRS = [0x2b2b33, 0x6b4a2f, 0xd8b26a, 0xc0503a, 0xe8e8f0, 0x5a7bd8, 0x7a4ac8];

const CLASS_COLORS = {
  warden: { top: 0x7d8fa3, top2: 0x3d6fb5, pants: 0x40434d, shoes: 0x5a3f2b, accent: 0xd8b04a },
  ranger: { top: 0x6b8f3a, top2: 0x8a6a40, pants: 0x5a4632, shoes: 0x3e2c1e, accent: 0xc9a46a },
  mystic: { top: 0xf2efe6, top2: 0x4a7bd1, pants: 0x2f3d6b, shoes: 0x2a2a3a, accent: 0x5fe0ff },
};

export function buildCharacter(ap: Appearance): Rig {
  const rig = new Rig('biped');
  const c = CLASS_COLORS[ap.cls];
  const skin = ap.skin;
  const hair = ap.hair;

  // Ноги (пивот у бедра)
  const leg = (side: number) => {
    const g = new VoxelGrid();
    g.box(0, 0, 0, 2, 6, 3, (x, y) => (y <= 1 ? c.shoes : y <= 3 ? (ap.cls === 'warden' ? c.pants : skin) : c.pants));
    if (ap.cls === 'warden') g.box(0, 2, 2, 2, 2, 1, 0x9aa7b5);
    return rig.part(g, [1, 6, 1.5], [side * 1.05 * CS, 6 * CS, 0]);
  };
  rig.legs.push(leg(-1), leg(1));

  // Торс
  const torso = new THREE.Group();
  torso.position.set(0, 6 * CS, 0);
  rig.root.add(torso);
  rig.torso = torso;
  const tg = new VoxelGrid();
  tg.box(0, 0, 0, 6, 6, 4, (x, y, z) => {
    if (y === 0) return ap.cls === 'mystic' ? c.top2 : 0x5a3f2b; // пояс
    if (ap.cls === 'warden') return z === 3 && x >= 2 && x <= 3 ? c.top2 : jit(c.top, x, y, z, 0.05);
    if (ap.cls === 'ranger') return x === 2 && z === 3 ? c.top2 : jit(c.top, x, y, z, 0.05);
    return z === 3 && (x === 2 || x === 3) ? c.top2 : c.top;
  });
  if (ap.cls === 'mystic') tg.box(-1, -2, -1, 8, 3, 6, (x, y, z) => (y === -2 ? c.top2 : c.top)); // мантия
  if (ap.cls === 'warden') {
    tg.box(-1, 5, -1, 2, 2, 6, 0x9aa7b5);
    tg.box(5, 5, -1, 2, 2, 6, 0x9aa7b5);
  }
  if (ap.cls === 'ranger') tg.box(1, 1, -2, 2, 7, 1, 0x7a5434); // колчан
  torso.add(rig.mesh(tg, [3, 0, 2]));

  // Руки (пивот у плеча)
  const arm = (side: number) => {
    const g = new VoxelGrid();
    g.box(0, 0, 0, 2, 6, 2, (x, y) => (y <= 1 ? skin : ap.cls === 'warden' && y >= 4 ? 0x9aa7b5 : c.top));
    return rig.part(g, [1, 6, 1], [side * 4 * CS, 6 * CS, 0], torso);
  };
  rig.armL = arm(-1);
  rig.armR = arm(1);

  // Оружие в правой руке
  const wg = new VoxelGrid();
  if (ap.cls === 'warden') {
    wg.box(0, -1, 0, 1, 2, 1, 0x6b4a2f);
    wg.box(-1, 1, 0, 3, 1, 1, c.accent);
    wg.box(0, 2, 0, 1, 9, 1, (x, y) => (y === 10 ? 0xffffff : 0xd0d6dc));
    const w = rig.part(wg, [0.5, 0, 0.5], [0, -6 * CS, 0.5 * CS], rig.armR);
    w.rotation.x = Math.PI / 2;
    // щит в левой
    const sg = new VoxelGrid();
    for (let x = -3; x <= 3; x++)
      for (let y = -3; y <= 3; y++) {
        if (Math.abs(x) + Math.abs(y) > 4) continue;
        sg.set(x, y, 0, y === 0 && Math.abs(x) < 3 ? 0xffffff : 0xc0392b);
      }
    sg.box(0, -6, 1, 1, 3, 1, 0x888888);
    const sh = rig.part(sg, [0, 0, 0], [-1.3 * CS, -4 * CS, 1.5 * CS], rig.armL);
    sh.rotation.y = -Math.PI / 2;
  } else if (ap.cls === 'ranger') {
    for (let y = -6; y <= 6; y++) {
      const z = Math.round(Math.cos((y / 6) * 1.2) * 2);
      wg.set(0, y, z, 0x8a5a30);
    }
    for (let y = -5; y <= 5; y++) wg.set(0, y, -1, 0xeeeeee);
    const w = rig.part(wg, [0.5, 0, 0.5], [0, -5 * CS, 0.5 * CS], rig.armL);
    w.rotation.y = Math.PI / 2;
  } else {
    wg.box(0, -4, 0, 1, 16, 1, 0x7a5434);
    wg.box(-1, 12, -1, 3, 3, 3, (x, y) => (y === 13 ? 0xb8f4ff : c.accent));
    const w = rig.part(wg, [0.5, 0, 0.5], [0, -6 * CS, 0.5 * CS], rig.armR);
    w.rotation.x = 0.1;
  }

  // Голова — крупная, чиби
  const hg = new VoxelGrid();
  hg.box(0, 0, 0, 8, 8, 8, skin);
  // волосы
  hg.box(-1, 5, -1, 10, 4, 10, (x, y, z) => (z === 8 && y < 7 && x > 0 && x < 7 ? null : hair));
  hg.box(-1, 1, -1, 10, 4, 3, hair);
  hg.box(-1, 3, -1, 1, 3, 9, hair);
  hg.box(8, 3, -1, 1, 3, 9, hair);
  hg.box(0, 6, 8, 3, 2, 1, hair);
  if (ap.longHair) hg.box(0, -4, -1, 8, 6, 2, hair), hg.box(-1, -2, 0, 1, 4, 4, hair), hg.box(8, -2, 0, 1, 4, 4, hair);
  // лицо
  hg.set(2, 3, 8, 0x3a2418);
  hg.set(2, 4, 8, 0x5a3a28);
  hg.set(5, 3, 8, 0x3a2418);
  hg.set(5, 4, 8, 0x5a3a28);
  hg.set(1, 2, 8, 0xf2a0a0);
  hg.set(6, 2, 8, 0xf2a0a0);
  hg.set(3, 1, 8, 0xc07060);
  hg.set(4, 1, 8, 0xc07060);
  // головные уборы
  if (ap.cls === 'warden') {
    hg.box(-1, 6, -1, 10, 3, 10, (x, y, z) => (z === 8 && y === 6 && x > 0 && x < 7 ? null : jit(0x9aa7b5, x, y, z, 0.04)));
    hg.box(3, 9, -1, 2, 2, 9, 0xc0392b);
  } else if (ap.cls === 'ranger') {
    hg.box(-1, 2, -2, 10, 8, 11, (x, y, z) => {
      if (z >= 7 && y < 8 && x >= 0 && x <= 7) return null;
      if (z === 8 && y === 8) return 0x5a7a30;
      return jit(0x4f8a3c, x, y, z, 0.05);
    });
    hg.box(2, 6, -3, 4, 3, 2, 0x4f8a3c);
  } else {
    hg.box(-4, 8, -4, 16, 1, 16, (x, y, z) => (Math.hypot(x - 3.5, z - 3.5) <= 7.8 ? jit(0xf2efe6, x, y, z, 0.03) : null));
    hg.box(0, 9, 0, 8, 1, 8, 0x4a7bd1);
    hg.box(1, 10, 1, 6, 3, 6, 0xf2efe6);
    hg.box(2, 13, 2, 4, 2, 4, 0xf2efe6);
    hg.box(3, 15, 3, 2, 2, 2, 0xf2efe6);
    hg.set(4, 17, 3, 0xf2efe6);
  }
  const head = new THREE.Group();
  head.position.set(0, 6 * CS, 0);
  head.add(rig.mesh(hg, [4, 0, 4]));
  torso.add(head);
  rig.head = head;
  rig.height = 22 * CS;
  return rig;
}

// ---------------- Мобы ----------------
export function buildMob(model: string): Rig {
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
