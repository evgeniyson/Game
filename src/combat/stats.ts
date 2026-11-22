// Характеристики в духе Dota 2: Сила / Ловкость / Интеллект + производные.

export interface Stats {
  str: number;
  agi: number;
  int: number;
  maxHp: number;
  maxMp: number;
  hpRegen: number;
  mpRegen: number;
  damage: number;
  attackRate: number; // атак в секунду
  attackRange: number;
  armor: number;
  magicResist: number; // доля 0..1
  moveSpeed: number;
  critChance: number; // %
  critMult: number; // множитель
  lifesteal: number; // %
  evasion: number; // %
  cdr: number; // %
  spellAmp: number; // %
  dmgTakenPct: number; // % доп. получаемого урона
  magicTakenPct: number;
  healAmp: number; // %
  thorns: number; // % отражения урона
  ccImmune: number; // >0 — иммунитет к контролю
}

/** Аддитивные модификаторы. Поля *Pct — проценты. magicResist тут тоже в процентах. */
export interface Mods {
  str?: number;
  agi?: number;
  int?: number;
  maxHp?: number;
  maxHpPct?: number;
  maxMp?: number;
  hpRegen?: number;
  mpRegen?: number;
  damage?: number;
  damagePct?: number;
  attackSpeedPct?: number;
  attackRange?: number;
  armor?: number;
  magicResist?: number;
  moveSpeedPct?: number;
  critChance?: number;
  critMult?: number;
  lifesteal?: number;
  evasion?: number;
  cdr?: number;
  spellAmp?: number;
  dmgTakenPct?: number;
  magicTakenPct?: number;
  healAmp?: number;
  thorns?: number;
  ccImmune?: number;
}

export type ModKey = keyof Mods;

export const MOD_LABELS: Record<ModKey, [string, boolean]> = {
  // [подпись, процент?]
  str: ['Сила', false],
  agi: ['Ловкость', false],
  int: ['Интеллект', false],
  maxHp: ['Здоровье', false],
  maxHpPct: ['Здоровье', true],
  maxMp: ['Мана', false],
  hpRegen: ['Реген. здоровья', false],
  mpRegen: ['Реген. маны', false],
  damage: ['Урон', false],
  damagePct: ['Урон', true],
  attackSpeedPct: ['Скорость атаки', true],
  attackRange: ['Дальность атаки', false],
  armor: ['Броня', false],
  magicResist: ['Сопр. магии', true],
  moveSpeedPct: ['Скорость бега', true],
  critChance: ['Шанс крита', true],
  critMult: ['Сила крита', false],
  lifesteal: ['Вампиризм', true],
  evasion: ['Уклонение', true],
  cdr: ['Сокращение КД', true],
  spellAmp: ['Сила способностей', true],
  dmgTakenPct: ['Получаемый урон', true],
  magicTakenPct: ['Получаемый маг. урон', true],
  healAmp: ['Сила лечения', true],
  thorns: ['Отражение урона', true],
  ccImmune: ['Иммунитет к контролю', false],
};

export interface BaseDef {
  str: number;
  agi: number;
  int: number;
  strGain: number;
  agiGain: number;
  intGain: number;
  primary: 'str' | 'agi' | 'int' | null;
  baseHp: number;
  baseMp: number;
  baseHpRegen: number;
  baseMpRegen: number;
  baseArmor: number;
  baseMR: number; // %
  baseDamage: number;
  attackRate: number;
  attackRange: number;
  moveSpeed: number;
}

export function sumMods(list: (Mods | undefined | null)[]): Required<Mods> {
  const acc: Required<Mods> = {
    str: 0, agi: 0, int: 0, maxHp: 0, maxHpPct: 0, maxMp: 0, hpRegen: 0, mpRegen: 0, damage: 0, damagePct: 0,
    attackSpeedPct: 0, attackRange: 0, armor: 0, magicResist: 0, moveSpeedPct: 0, critChance: 0, critMult: 0,
    lifesteal: 0, evasion: 0, cdr: 0, spellAmp: 0, dmgTakenPct: 0, magicTakenPct: 0, healAmp: 0, thorns: 0, ccImmune: 0,
  };
  for (const m of list) {
    if (!m) continue;
    for (const k in m) {
      const v = (m as any)[k];
      if (typeof v === 'number') (acc as any)[k] += v;
    }
  }
  return acc;
}

export function deriveStats(b: BaseDef, level: number, mods: (Mods | undefined | null)[]): Stats {
  const a = sumMods(mods);
  const L = level - 1;
  const str = b.str + b.strGain * L + a.str;
  const agi = b.agi + b.agiGain * L + a.agi;
  const int = b.int + b.intGain * L + a.int;
  const primary = b.primary === 'str' ? str : b.primary === 'agi' ? agi : b.primary === 'int' ? int : 0;
  const maxHp = Math.max(1, (b.baseHp + str * 20 + a.maxHp) * (1 + a.maxHpPct / 100));
  const maxMp = Math.max(0, b.baseMp + int * 12 + a.maxMp);
  return {
    str,
    agi,
    int,
    maxHp,
    maxMp,
    hpRegen: b.baseHpRegen + str * 0.1 + a.hpRegen,
    mpRegen: b.baseMpRegen + int * 0.05 + a.mpRegen,
    damage: Math.max(1, (b.baseDamage + primary + a.damage) * (1 + a.damagePct / 100)),
    attackRate: Math.min(5, Math.max(0.2, b.attackRate * (1 + (agi + a.attackSpeedPct) / 100))),
    attackRange: b.attackRange + a.attackRange,
    armor: b.baseArmor + agi * 0.16 + a.armor,
    magicResist: Math.min(0.9, 1 - (1 - b.baseMR / 100) * (1 - a.magicResist / 100)),
    moveSpeed: Math.max(0.8, b.moveSpeed * (1 + a.moveSpeedPct / 100)),
    critChance: Math.min(90, a.critChance),
    critMult: 1.75 + a.critMult,
    lifesteal: a.lifesteal,
    evasion: Math.min(60, a.evasion),
    cdr: Math.min(45, a.cdr),
    spellAmp: int * 0.07 + a.spellAmp,
    dmgTakenPct: a.dmgTakenPct,
    magicTakenPct: a.magicTakenPct,
    healAmp: a.healAmp,
    thorns: a.thorns,
    ccImmune: a.ccImmune,
  };
}

/** Множитель физического урона от брони (формула Dota 2) */
export function armorMult(armor: number): number {
  return 1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor));
}

export type DmgType = 'phys' | 'magic' | 'pure';

export function mitigate(amount: number, type: DmgType, s: Stats): number {
  let m = amount;
  if (type === 'phys') m *= armorMult(s.armor);
  else if (type === 'magic') m *= (1 - s.magicResist) * (1 + s.magicTakenPct / 100);
  m *= 1 + s.dmgTakenPct / 100;
  return Math.max(0, m);
}

export function xpToNext(level: number): number {
  return Math.round(60 * Math.pow(level, 1.6) + 40);
}

export const MAX_LEVEL = 30;

/** «Боевая мощь» — одно число, как на экране референса */
export function powerRating(s: Stats, level: number): number {
  const dps = s.damage * s.attackRate * (1 + (s.critChance / 100) * (s.critMult - 1));
  const ehp = s.maxHp / armorMult(Math.max(0, s.armor)) / (1 - s.magicResist * 0.5);
  return Math.round(dps * 22 + ehp * 1.4 + s.spellAmp * 40 + level * 120);
}

export function fmtNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

export function describeMods(m: Mods): string[] {
  const out: string[] = [];
  for (const k in m) {
    const v = (m as any)[k] as number;
    if (!v) continue;
    const [label, pct] = MOD_LABELS[k as ModKey];
    if (k === 'ccImmune') {
      out.push(label);
      continue;
    }
    const val = Math.abs(v) < 10 && !Number.isInteger(v) ? v.toFixed(1) : Math.round(v).toString();
    out.push(`${v > 0 ? '+' : '−'}${val.replace('-', '')}${pct ? '%' : ''} ${label}`);
  }
  return out;
}
