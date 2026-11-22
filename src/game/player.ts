// Игрок: класс, прокачка способностей, таланты, инвентарь.
import { Entity } from './entity';
import { CLASSES, TALENT_LEVELS, type ClassDef, type ClassId } from '../data/classes';
import { buildCharacter, type Appearance } from '../render/models';
import { Inventory } from '../items/inventory';
import { ABILITIES, type AbilityDef } from '../combat/abilities';
import { MAX_LEVEL, xpToNext, type Mods } from '../combat/stats';

export class Player extends Entity {
  cls: ClassDef;
  appearance: Appearance;
  xp = 0;
  skillPoints = 1;
  abil = [0, 0, 0, 0];
  cds = [0, 0, 0, 0];
  talents: string[] = [];
  inv = new Inventory();
  itemCds: Record<string, number> = {};
  autoMode = false;
  focus: Entity | null = null;
  harvest: { key: string; t: number; hits: number } | null = null;
  respawnT = 0;
  kills = 0;

  constructor(clsId: ClassId, appearance: Appearance, name: string) {
    const cls = CLASSES[clsId];
    super(cls.base, buildCharacter(appearance));
    this.cls = cls;
    this.appearance = appearance;
    this.name = name;
    this.team = 'player';
    this.radius = 0.35;
  }

  ability(slot: number): AbilityDef {
    return ABILITIES[this.cls.abilities[slot]];
  }

  refreshMods() {
    const talentMods: Mods[] = [];
    for (const tier of this.cls.talents) for (const t of tier) if (this.talents.includes(t.id) && t.mods) talentMods.push(t.mods);
    this.staticMods = [...this.inv.equippedMods(), ...talentMods];
    this.recalc();
  }

  /** Правило Dota: Q/E/R-обычные — не выше (уровень+1)/2, ульта на 6/12/18 */
  canLevelAbility(slot: number): boolean {
    if (this.skillPoints <= 0) return false;
    const def = this.ability(slot);
    const cur = this.abil[slot];
    if (cur >= def.maxLevel) return false;
    if (slot === 3) return this.level >= [6, 12, 18][cur];
    return cur < Math.ceil(this.level / 2);
  }

  levelAbility(slot: number): boolean {
    if (!this.canLevelAbility(slot)) return false;
    this.abil[slot]++;
    this.skillPoints--;
    return true;
  }

  /** Доступный, но не выбранный ярус талантов */
  pendingTalentTier(): number {
    for (let i = 0; i < TALENT_LEVELS.length; i++) {
      if (this.level < TALENT_LEVELS[i]) break;
      const tier = this.cls.talents[i];
      if (!tier.some((t) => this.talents.includes(t.id))) return i;
    }
    return -1;
  }

  chooseTalent(tier: number, idx: number): boolean {
    if (this.pendingTalentTier() !== tier) return false;
    this.talents.push(this.cls.talents[tier][idx].id);
    this.refreshMods();
    return true;
  }

  /** Добавляет опыт; возвращает число полученных уровней */
  addXp(n: number): number {
    if (this.level >= MAX_LEVEL) return 0;
    this.xp += n;
    let ups = 0;
    while (this.level < MAX_LEVEL && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.skillPoints++;
      ups++;
    }
    if (ups) {
      this.recalc();
      this.hp = this.stats.maxHp;
      this.mp = this.stats.maxMp;
    }
    return ups;
  }
}
