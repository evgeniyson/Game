// Базовая сущность: игрок и мобы.
import * as THREE from 'three';
import type { Rig } from '../render/models';
import { deriveStats, type BaseDef, type Mods, type Stats } from '../combat/stats';
import { effectMods, isRooted, isSilenced, isStunned, type EffectInst } from '../combat/effects';

export type Team = 'player' | 'enemy' | 'neutral' | 'passive';

let NEXT_ID = 1;

export interface Dash {
  dir: THREE.Vector3;
  remaining: number;
  speed: number;
  hit: Set<number>;
  onHit?: (e: Entity) => void;
  onEnd?: () => void;
}

export class Entity {
  id = NEXT_ID++;
  name = '';
  team: Team = 'enemy';
  level = 1;
  pos = new THREE.Vector3();
  facing = 0;
  radius = 0.4;
  hp = 1;
  mp = 0;
  base: BaseDef;
  staticMods: Mods[] = [];
  stats: Stats;
  effects: EffectInst[] = [];
  rig: Rig;
  alive = true;
  deadT = 0;
  attackCd = 0;
  attackAnim = -1;
  castAnim = -1;
  moving = false;
  dash: Dash | null = null;
  knock = new THREE.Vector3();
  lastAttacker: Entity | null = null;
  attackCount = 0;
  isBoss = false;
  isElite = false;

  constructor(base: BaseDef, rig: Rig) {
    this.base = base;
    this.rig = rig;
    this.stats = deriveStats(base, 1, []);
    this.hp = this.stats.maxHp;
    this.mp = this.stats.maxMp;
  }

  recalc() {
    const prevMax = this.stats.maxHp;
    const prevMp = this.stats.maxMp;
    this.stats = deriveStats(this.base, this.level, [...this.staticMods, ...effectMods(this)]);
    if (prevMax > 0 && this.stats.maxHp !== prevMax) this.hp = Math.min(this.stats.maxHp, this.hp * (this.stats.maxHp / prevMax));
    if (prevMp > 0 && this.stats.maxMp !== prevMp) this.mp = Math.min(this.stats.maxMp, this.mp);
  }

  get stunned() {
    return isStunned(this);
  }
  get rooted() {
    return isRooted(this);
  }
  get silenced() {
    return isSilenced(this);
  }

  distTo(o: Entity | THREE.Vector3) {
    const p = o instanceof Entity ? o.pos : o;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  faceTo(p: THREE.Vector3) {
    const dx = p.x - this.pos.x,
      dz = p.z - this.pos.z;
    if (dx * dx + dz * dz > 1e-6) this.facing = Math.atan2(dx, dz);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  syncRig(dt: number) {
    this.rig.group.position.copy(this.pos);
    // плавный поворот
    const cur = this.rig.group.rotation.y;
    let d = this.facing - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.rig.group.rotation.y = cur + d * Math.min(1, dt * 14);
    this.rig.animate(dt, {
      moving: this.moving,
      speed: this.stats.moveSpeed,
      attack: this.attackAnim,
      cast: this.castAnim,
      dead: this.alive ? -1 : this.deadT,
      stunned: this.stunned,
    });
  }
}
