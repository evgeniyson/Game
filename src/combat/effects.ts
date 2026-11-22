// Единая система бафов и дебафов: длительность, стаки, тики, контроль.
import type { Mods, DmgType } from './stats';

export interface EffectHost {
  effects: EffectInst[];
  stats: { ccImmune: number };
  alive: boolean;
}

export interface EffectCtx {
  damage(src: unknown, target: EffectHost, amount: number, type: DmgType, opts?: { dot?: boolean; label?: string }): void;
  heal(target: EffectHost, amount: number): void;
}

export interface EffectDef {
  id: string;
  name: string;
  icon: string;
  debuff: boolean;
  stun?: boolean;
  root?: boolean;
  silence?: boolean;
  maxStacks?: number;
  tick?: number;
  mods?: (inst: EffectInst) => Mods;
  onTick?: (target: EffectHost, inst: EffectInst, ctx: EffectCtx) => void;
  desc: (inst: EffectInst) => string;
  hidden?: boolean;
}

export interface EffectInst {
  def: EffectDef;
  time: number; // осталось
  duration: number;
  stacks: number;
  value: number;
  source: unknown;
  tickT: number;
}

const defs: EffectDef[] = [
  { id: 'stun', name: 'Оглушение', icon: '💫', debuff: true, stun: true, desc: () => 'Не может двигаться и действовать' },
  { id: 'freeze', name: 'Заморозка', icon: '🧊', debuff: true, stun: true, mods: () => ({ armor: -3 }), desc: () => 'Скован льдом, −3 брони' },
  { id: 'root', name: 'Корни', icon: '🌿', debuff: true, root: true, desc: () => 'Не может передвигаться' },
  { id: 'silence', name: 'Немота', icon: '🔇', debuff: true, silence: true, desc: () => 'Не может применять способности' },
  { id: 'slow', name: 'Замедление', icon: '🐌', debuff: true, mods: (i) => ({ moveSpeedPct: -i.value, attackSpeedPct: -i.value / 2 }), desc: (i) => `−${i.value}% скорости бега` },
  {
    id: 'burn', name: 'Поджог', icon: '🔥', debuff: true, tick: 0.5,
    onTick: (t, i, ctx) => ctx.damage(i.source, t, i.value * 0.5, 'magic', { dot: true }),
    desc: (i) => `${i.value} маг. урона в секунду`,
  },
  {
    id: 'poison', name: 'Яд', icon: '☠️', debuff: true, tick: 1, maxStacks: 5,
    mods: () => ({ healAmp: -30 }),
    onTick: (t, i, ctx) => ctx.damage(i.source, t, i.value * i.stacks, 'magic', { dot: true }),
    desc: (i) => `${i.value * i.stacks} урона/с, −30% лечения`,
  },
  {
    id: 'bleed', name: 'Кровотечение', icon: '🩸', debuff: true, tick: 0.5, maxStacks: 3,
    onTick: (t, i, ctx) => ctx.damage(i.source, t, i.value * 0.5 * i.stacks, 'pure', { dot: true }),
    desc: (i) => `${i.value * i.stacks} чистого урона/с`,
  },
  { id: 'shred', name: 'Раскол брони', icon: '🪓', debuff: true, maxStacks: 5, mods: (i) => ({ armor: -i.value * i.stacks }), desc: (i) => `−${i.value * i.stacks} брони` },
  { id: 'curse', name: 'Проклятие', icon: '🕯️', debuff: true, mods: () => ({ healAmp: -50, dmgTakenPct: 10 }), desc: () => '−50% лечения, +10% получаемого урона' },
  { id: 'weaken', name: 'Слабость', icon: '🥀', debuff: true, mods: (i) => ({ damagePct: -i.value }), desc: (i) => `−${i.value}% урона` },
  { id: 'haste', name: 'Ускорение', icon: '💨', debuff: false, mods: (i) => ({ moveSpeedPct: i.value }), desc: (i) => `+${i.value}% скорости бега` },
  { id: 'regen', name: 'Регенерация', icon: '💚', debuff: false, mods: (i) => ({ hpRegen: i.value }), desc: (i) => `+${i.value} здоровья/с` },
  { id: 'manaRegen', name: 'Прилив маны', icon: '💧', debuff: false, mods: (i) => ({ mpRegen: i.value }), desc: (i) => `+${i.value} маны/с` },
  { id: 'shield', name: 'Щит', icon: '🛡️', debuff: false, desc: (i) => `Поглощает ${Math.round(i.value)} урона` },
  { id: 'spikedShell', name: 'Шипастый панцирь', icon: '🦔', debuff: false, mods: (i) => ({ armor: 4 + i.stacks * 2, thorns: 25 + i.stacks * 10 }), desc: (i) => `Щит ${Math.round(i.value)}, отражает ${25 + i.stacks * 10}% урона` },
  { id: 'empower', name: 'Ярость', icon: '😤', debuff: false, mods: (i) => ({ damagePct: i.value }), desc: (i) => `+${i.value}% урона` },
  { id: 'fortify', name: 'Укрепление', icon: '🧱', debuff: false, mods: (i) => ({ armor: i.value }), desc: (i) => `+${i.value} брони` },
  { id: 'frenzy', name: 'Неистовство', icon: '⚡', debuff: false, mods: (i) => ({ attackSpeedPct: i.value }), desc: (i) => `+${i.value}% скорости атаки` },
  { id: 'bloodlust', name: 'Жажда крови', icon: '🩸', debuff: false, mods: (i) => ({ lifesteal: i.value }), desc: (i) => `+${i.value}% вампиризма` },
  { id: 'steadfast', name: 'Стойкость', icon: '🗿', debuff: false, mods: () => ({ ccImmune: 1, magicResist: 40 }), desc: () => 'Иммунитет к контролю, +40% сопр. магии' },
  { id: 'wellFed', name: 'Сытость', icon: '🍖', debuff: false, mods: (i) => ({ hpRegen: i.value, maxHp: 40 }), desc: (i) => `+${i.value} реген. здоровья, +40 здоровья` },
  { id: 'focus', name: 'Меткость', icon: '🎯', debuff: false, maxStacks: 5, mods: (i) => ({ critChance: i.stacks * 6 }), desc: (i) => `+${i.stacks * 6}% шанс крита` },
  { id: 'resonance', name: 'Резонанс', icon: '🔮', debuff: false, maxStacks: 3, desc: (i) => (i.stacks >= 3 ? 'Следующая способность бесплатна' : `Заряды: ${i.stacks}/3`) },
  { id: 'enrage', name: 'Бешенство', icon: '👹', debuff: false, mods: () => ({ damagePct: 35, attackSpeedPct: 40, moveSpeedPct: 15 }), desc: () => 'Босс в ярости!' },
  { id: 'rolling', name: 'Перекат', icon: '🌀', debuff: false, mods: () => ({ evasion: 100 }), hidden: true, desc: () => '' },
];

export const EFFECTS: Record<string, EffectDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function applyEffect(host: EffectHost, id: string, duration: number, value = 0, source: unknown = null, stacks = 1): EffectInst | null {
  const def = EFFECTS[id];
  if (!def || !host.alive) return null;
  if ((def.stun || def.root || def.silence) && host.stats.ccImmune > 0) return null;
  const existing = host.effects.find((e) => e.def.id === id);
  if (existing) {
    existing.time = Math.max(existing.time, duration);
    existing.duration = Math.max(existing.duration, duration);
    existing.value = Math.max(existing.value, value);
    existing.source = source ?? existing.source;
    existing.stacks = Math.min(def.maxStacks ?? 1, existing.stacks + stacks);
    return existing;
  }
  const inst: EffectInst = { def, time: duration, duration, stacks: Math.min(def.maxStacks ?? 1, stacks), value, source, tickT: def.tick ?? 0 };
  host.effects.push(inst);
  return inst;
}

export function removeEffect(host: EffectHost, id: string) {
  host.effects = host.effects.filter((e) => e.def.id !== id);
}

export function hasEffect(host: EffectHost, id: string) {
  return host.effects.some((e) => e.def.id === id);
}

export function updateEffects(host: EffectHost, dt: number, ctx: EffectCtx): boolean {
  let changed = false;
  for (const e of host.effects) {
    e.time -= dt;
    if (e.def.tick && e.def.onTick) {
      e.tickT -= dt;
      while (e.tickT <= 0 && host.alive) {
        e.def.onTick(host, e, ctx);
        e.tickT += e.def.tick;
      }
    }
  }
  const before = host.effects.length;
  host.effects = host.effects.filter((e) => e.time > 0 && !(e.def.id === 'shield' && e.value <= 0));
  if (host.effects.length !== before) changed = true;
  return changed;
}

export function effectMods(host: EffectHost): Mods[] {
  const out: Mods[] = [];
  for (const e of host.effects) if (e.def.mods) out.push(e.def.mods(e));
  return out;
}

export const isStunned = (h: EffectHost) => h.effects.some((e) => e.def.stun);
export const isRooted = (h: EffectHost) => h.effects.some((e) => e.def.root || e.def.stun);
export const isSilenced = (h: EffectHost) => h.effects.some((e) => e.def.silence || e.def.stun);

/** Поглощение урона щитами (shield, spikedShell). Возвращает остаток урона. */
export function absorbShields(host: EffectHost, amount: number): number {
  for (const e of host.effects) {
    if ((e.def.id === 'shield' || e.def.id === 'spikedShell') && e.value > 0) {
      const a = Math.min(e.value, amount);
      e.value -= a;
      amount -= a;
      if (amount <= 0) break;
    }
  }
  return amount;
}

/** Снять все дебафы (развеивание) */
export function purge(host: EffectHost) {
  host.effects = host.effects.filter((e) => !e.def.debuff);
}
