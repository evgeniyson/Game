// Мобы: масштабирование по уровню зоны, элиты, боссы.
import * as THREE from 'three';
import { Entity } from './entity';
import { MOBS, type MobDef, type EliteAffix } from '../data/mobs';
import { buildMob } from '../render/models';
import type { BaseDef } from '../combat/stats';

export type MobState = 'idle' | 'wander' | 'chase' | 'flee' | 'return';

export class Mob extends Entity {
  def: MobDef;
  home = new THREE.Vector3();
  state: MobState = 'idle';
  stateT = 0;
  wanderTo: THREE.Vector3 | null = null;
  aggroTarget: Entity | null = null;
  abilityCd = 2;
  elite: EliteAffix | null = null;
  colossusKey: string | null = null;
  enraged = false;
  removeMe = false;

  constructor(defId: string, level: number, elite: EliteAffix | null = null) {
    const def = MOBS[defId];
    const L = level - 1;
    const hpMul = (1 + 0.3 * L) * (elite ? 2.5 : 1);
    const base: BaseDef = {
      str: 0, agi: 0, int: 0, strGain: 0, agiGain: 0, intGain: 0, primary: null,
      baseHp: def.hp * hpMul,
      baseMp: 0,
      baseHpRegen: def.boss ? 0 : def.hp * 0.004,
      baseMpRegen: 0,
      baseArmor: def.armor + 0.35 * L,
      baseMR: def.mr,
      baseDamage: def.damage * (1 + 0.17 * L) * (elite ? 1.4 : 1),
      attackRate: def.attackRate,
      attackRange: def.attackRange,
      moveSpeed: def.moveSpeed,
    };
    const rig = buildMob(def.model);
    super(base, rig);
    this.def = def;
    this.level = level;
    this.team = def.team;
    this.elite = elite;
    this.isElite = !!elite;
    this.isBoss = !!def.boss;
    this.name = elite ? `${elite.name} ${def.name.toLowerCase()}` : def.name;
    const scale = def.scale * (elite ? 1.3 : 1);
    rig.setScale(scale);
    this.radius = 0.35 * scale * (def.model === 'ogre' ? 1.6 : 1);
    if (elite) this.staticMods = [elite.mods];
    this.recalc();
    this.hp = this.stats.maxHp;
    if (elite) {
      rig.baseEmissive.setHex(0x3a1400);
      rig.material.emissive.setHex(0x3a1400);
    }
  }

  get xpValue(): number {
    return Math.round(this.def.xp * (1 + 0.28 * (this.level - 1)) * (this.isElite ? 3 : 1));
  }
}
