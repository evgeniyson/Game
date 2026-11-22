// Предметы: материалы, расходники, снаряжение, руны. Аффиксы и редкость.
import type { Mods } from '../combat/stats';
import type { ClassId } from './classes';
import type { Entity } from '../game/entity';
import type { AbilityGame } from '../combat/abilities';

export type Slot = 'weapon' | 'offhand' | 'head' | 'chest' | 'legs' | 'boots' | 'trinket';
export type ItemKind = 'gear' | 'consumable' | 'material' | 'rune';

export const SLOT_NAMES: Record<Slot, string> = {
  weapon: 'Оружие',
  offhand: 'Вторая рука',
  head: 'Голова',
  chest: 'Тело',
  legs: 'Ноги',
  boots: 'Обувь',
  trinket: 'Амулет',
};

export interface ItemGame extends AbilityGame {
  returnToCamp(p: Entity): void;
  aimDir(p: Entity): { dir: import('three').Vector3; target: Entity | null };
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  desc?: string;
  slot?: Slot;
  classes?: ClassId[];
  stats?: Mods;
  tier?: number;
  maxStack?: number;
  active?: { name: string; desc: string; cd: number; use: (g: ItemGame, p: Entity) => boolean };
  use?: (g: ItemGame, p: Entity) => boolean;
  tradeoff?: boolean;
  salvage?: [string, number][];
  noDrop?: boolean;
}

export const RARITY = [
  { name: 'Обычный', color: '#d6d6d6', mult: 1, affixes: 0 },
  { name: 'Необычный', color: '#5fd35f', mult: 1.1, affixes: 1 },
  { name: 'Редкий', color: '#4aa8ff', mult: 1.25, affixes: 2 },
  { name: 'Эпический', color: '#b65cff', mult: 1.45, affixes: 3 },
  { name: 'Легендарный', color: '#ffa53a', mult: 1.7, affixes: 4 },
];

const mat = (id: string, name: string, icon: string, desc: string): ItemDef => ({ id, name, icon, kind: 'material', desc, maxStack: 99 });

const list: ItemDef[] = [
  // ---------- Материалы ----------
  mat('wood', 'Древесина', '🪵', 'Добывается из деревьев.'),
  mat('stone', 'Камень', '🪨', 'Добывается из валунов.'),
  mat('scrap', 'Металлолом', '⚙️', 'Остатки древних машин.'),
  mat('fiber', 'Волокно', '🌾', 'Из кустов, камыша и травы.'),
  mat('herb', 'Целебная трава', '🌸', 'Основа зелий.'),
  mat('meat', 'Сырое мясо', '🥩', 'Можно пожарить.'),
  mat('hide', 'Шкура', '🟫', 'Снимается со зверей.'),
  mat('crystal', 'Кристалл', '💎', 'Редкий минерал, хранит силу рун.'),
  mat('slime', 'Слизь', '🟢', 'Липкая и полезная.'),
  mat('chitin', 'Хитин', '🦀', 'Прочный панцирь мусорных крабов.'),
  mat('fang', 'Клык', '🦷', 'Острый клык хищника.'),
  mat('core', 'Ржавое ядро', '🔩', 'Сердце автоматона. Ещё тёплое.'),
  mat('essence', 'Эссенция', '✨', 'Выпадает из элитных врагов.'),
  mat('stoneheart', 'Каменное сердце', '🗿', 'Трофей Каменного Молотоогра.'),
  mat('plank', 'Доска', '🟧', 'Компонент: обработанная древесина.'),
  mat('rope', 'Верёвка', '🪢', 'Компонент: сплетённое волокно.'),
  mat('steel', 'Слиток стали', '🔷', 'Компонент: переплавленный лом.'),
  mat('leather', 'Кожа', '👜', 'Компонент: выделанная шкура.'),

  // ---------- Расходники ----------
  {
    id: 'potionHp', name: 'Зелье здоровья', icon: '🧪', kind: 'consumable', maxStack: 20, desc: 'Мгновенно восстанавливает 35% здоровья и ещё 15% за 5 с.',
    use: (g, p) => { g.heal(p, p.stats.maxHp * 0.35); g.effect(p, 'regen', 5, Math.round(p.stats.maxHp * 0.03), p); g.sfx('drink'); return true; },
  },
  {
    id: 'potionMp', name: 'Зелье маны', icon: '💙', kind: 'consumable', maxStack: 20, desc: 'Восстанавливает 40% маны.',
    use: (g, p) => { p.mp = Math.min(p.stats.maxMp, p.mp + p.stats.maxMp * 0.4); g.effect(p, 'manaRegen', 5, 4, p); g.sfx('drink'); return true; },
  },
  {
    id: 'berry', name: 'Ягоды', icon: '🫐', kind: 'consumable', maxStack: 40, desc: 'Восстанавливают 60 здоровья.',
    use: (g, p) => { g.heal(p, 60); g.sfx('eat'); return true; },
  },
  {
    id: 'roastMeat', name: 'Жареное мясо', icon: '🍖', kind: 'consumable', maxStack: 20, desc: 'Сытость на 90 с: +4 реген. здоровья, +40 здоровья.',
    use: (g, p) => { g.effect(p, 'wellFed', 90, 4, p); g.heal(p, 80); g.sfx('eat'); return true; },
  },
  {
    id: 'bomb', name: 'Самодельная бомба', icon: '💣', kind: 'consumable', maxStack: 10, desc: 'Бросок на 8 м: 150 маг. урона в радиусе 3 м и замедление.',
    use: (g, p) => {
      const aim = g.aimDir(p);
      const explode = (pos: import('three').Vector3) => {
        for (const t of g.enemiesNear(pos, 3, p)) { g.damage(p, t, 150 + p.level * 10, 'magic'); g.effect(t, 'slow', 2, 40, p); }
        g.fx.ring(pos, 3, 0xffa030, 0.4); g.fx.burst(pos, 0xffa030, 26, 6); g.fx.shake(0.3); g.sfx('boom');
      };
      let done = false;
      g.projectile({ owner: p, pos: p.pos.clone().setY(p.pos.y + 1.2), dir: aim.dir, speed: 13, range: 8, radius: 0.5, color: 0x333333, kind: 'rock', homing: aim.target,
        onHit: (_t, pos) => { if (!done) { done = true; explode(pos); } }, onEnd: (pos) => { if (!done) { done = true; explode(pos); } } });
      return true;
    },
  },
  {
    id: 'elixirFury', name: 'Эликсир ярости', icon: '🍷', kind: 'consumable', maxStack: 10, desc: '+25% урона и +25% скорости атаки на 25 с.',
    use: (g, p) => { g.effect(p, 'empower', 25, 25, p); g.effect(p, 'frenzy', 25, 25, p); g.sfx('drink'); return true; },
  },
  {
    id: 'returnScroll', name: 'Свиток возврата', icon: '📜', kind: 'consumable', maxStack: 10, desc: 'Переносит в лагерь выживших.',
    use: (g, p) => { g.returnToCamp(p); return true; },
  },

  // ---------- Оружие ----------
  { id: 'pipeClub', name: 'Труба-дубина', icon: '🔧', kind: 'gear', slot: 'weapon', classes: ['warden'], stats: { damage: 8 }, tier: 1, salvage: [['scrap', 2]] },
  { id: 'rebarSword', name: 'Меч из арматуры', icon: '🗡️', kind: 'gear', slot: 'weapon', classes: ['warden'], stats: { damage: 20, str: 4 }, tier: 2, salvage: [['steel', 1]] },
  { id: 'signHammer', name: 'Кувалда разрушителя', icon: '🔨', kind: 'gear', slot: 'weapon', classes: ['warden'], stats: { damage: 38, str: 10, attackSpeedPct: -10 }, tier: 4, noDrop: true, salvage: [['steel', 2], ['essence', 1]] },
  { id: 'bloodBlade', name: 'Кровавый клинок', icon: '🩸', kind: 'gear', slot: 'weapon', classes: ['warden', 'ranger'], stats: { damage: 26, lifesteal: 18, maxHpPct: -12 }, tier: 3, tradeoff: true, noDrop: true, desc: 'Пьёт кровь врагов — и хозяина.', salvage: [['steel', 1], ['fang', 2]] },
  { id: 'shortBow', name: 'Самодельный лук', icon: '🏹', kind: 'gear', slot: 'weapon', classes: ['ranger'], stats: { damage: 7 }, tier: 1, salvage: [['wood', 2]] },
  { id: 'compositeBow', name: 'Композитный лук', icon: '🎯', kind: 'gear', slot: 'weapon', classes: ['ranger'], stats: { damage: 17, agi: 4 }, tier: 2, salvage: [['plank', 1], ['rope', 1]] },
  { id: 'hunterCrossbow', name: 'Арбалет-ловец', icon: '🪃', kind: 'gear', slot: 'weapon', classes: ['ranger'], stats: { damage: 32, critChance: 10, attackSpeedPct: -15 }, tier: 3, salvage: [['steel', 2]] },
  { id: 'branchStaff', name: 'Посох-ветка', icon: '🪄', kind: 'gear', slot: 'weapon', classes: ['mystic'], stats: { damage: 5, int: 3 }, tier: 1, salvage: [['wood', 2]] },
  { id: 'crystalStaff', name: 'Кристальный посох', icon: '🔱', kind: 'gear', slot: 'weapon', classes: ['mystic'], stats: { damage: 10, int: 8, spellAmp: 6 }, tier: 2, salvage: [['crystal', 1]] },
  { id: 'stormStaff', name: 'Посох бури', icon: '⚡', kind: 'gear', slot: 'weapon', classes: ['mystic'], stats: { damage: 14, int: 16, spellAmp: 14, maxMp: 120, mpRegen: 1.5 }, tier: 4, noDrop: true, salvage: [['crystal', 2], ['essence', 1]] },
  { id: 'rustyKnife', name: 'Ржавый нож', icon: '🔪', kind: 'gear', slot: 'weapon', stats: { damage: 11, attackSpeedPct: 12 }, tier: 1, salvage: [['scrap', 1]] },

  // ---------- Вторая рука ----------
  { id: 'stopSign', name: 'Щит «Стоп»', icon: '🛑', kind: 'gear', slot: 'offhand', classes: ['warden'], stats: { armor: 3, maxHp: 40 }, tier: 1, salvage: [['scrap', 2]] },
  { id: 'towerShield', name: 'Башенный щит', icon: '🛡️', kind: 'gear', slot: 'offhand', classes: ['warden'], stats: { armor: 8, maxHp: 140, moveSpeedPct: -5 }, tier: 3, tradeoff: true, salvage: [['steel', 2]] },
  { id: 'quiver', name: 'Колчан', icon: '🎒', kind: 'gear', slot: 'offhand', classes: ['ranger'], stats: { agi: 3, attackSpeedPct: 8 }, tier: 1, salvage: [['leather', 1]] },
  { id: 'runeFocus', name: 'Рунный фокус', icon: '🔮', kind: 'gear', slot: 'offhand', classes: ['mystic'], stats: { int: 3, mpRegen: 0.8 }, tier: 1, salvage: [['crystal', 1]] },

  // ---------- Броня ----------
  { id: 'leatherHood', name: 'Кожаный капюшон', icon: '🧢', kind: 'gear', slot: 'head', stats: { armor: 1, agi: 2 }, tier: 1, salvage: [['leather', 1]] },
  { id: 'steelHelm', name: 'Стальной шлем', icon: '⛑️', kind: 'gear', slot: 'head', stats: { armor: 3, str: 3 }, tier: 2, salvage: [['steel', 1]] },
  { id: 'sageCirclet', name: 'Обруч мудреца', icon: '👑', kind: 'gear', slot: 'head', stats: { int: 6, mpRegen: 1 }, tier: 2, salvage: [['crystal', 1]] },
  { id: 'berserkerMask', name: 'Маска берсерка', icon: '👺', kind: 'gear', slot: 'head', stats: { attackSpeedPct: 35, damage: 6, armor: -4 }, tier: 3, tradeoff: true, noDrop: true, desc: 'Ярость ценой защиты.', salvage: [['leather', 1], ['essence', 1]] },
  { id: 'leatherJacket', name: 'Кожаная куртка', icon: '🧥', kind: 'gear', slot: 'chest', stats: { armor: 3, maxHp: 60 }, tier: 1, salvage: [['leather', 1]] },
  { id: 'heavyPlate', name: 'Тяжёлые латы', icon: '🦺', kind: 'gear', slot: 'chest', stats: { armor: 12, maxHp: 160, moveSpeedPct: -10 }, tier: 3, tradeoff: true, desc: 'Неприступно, но неповоротливо.', salvage: [['steel', 3]] },
  { id: 'mageRobe', name: 'Мантия рун', icon: '👘', kind: 'gear', slot: 'chest', stats: { int: 6, maxMp: 80, magicResist: 8 }, tier: 2, salvage: [['fiber', 3], ['crystal', 1]] },
  { id: 'leatherPants', name: 'Кожаные штаны', icon: '👖', kind: 'gear', slot: 'legs', stats: { armor: 2, agi: 2 }, tier: 1, salvage: [['leather', 1]] },
  { id: 'steelGreaves', name: 'Стальные поножи', icon: '🦿', kind: 'gear', slot: 'legs', stats: { armor: 4, str: 2 }, tier: 2, salvage: [['steel', 1]] },
  { id: 'oldSneakers', name: 'Старые кеды', icon: '👟', kind: 'gear', slot: 'boots', stats: { moveSpeedPct: 6 }, tier: 1, salvage: [['fiber', 2]] },
  { id: 'travelBoots', name: 'Сапоги странника', icon: '🥾', kind: 'gear', slot: 'boots', stats: { moveSpeedPct: 12, evasion: 4 }, tier: 2, salvage: [['leather', 1]] },
  { id: 'ironBoots', name: 'Железные ботинки', icon: '🥿', kind: 'gear', slot: 'boots', stats: { armor: 3, moveSpeedPct: 3, maxHp: 50 }, tier: 2, salvage: [['steel', 1]] },

  // ---------- Амулеты (в т.ч. активные) ----------
  {
    id: 'phaseStone', name: 'Фазовый камень', icon: '🌀', kind: 'gear', slot: 'trinket', stats: { int: 3 }, tier: 3, noDrop: true, salvage: [['crystal', 2]],
    active: { name: 'Фазовый скачок', desc: 'Телепорт на 9 м по направлению движения/прицела.', cd: 15, use: (g, p) => { const a = g.aimDir(p); g.blink(p, p.pos.clone().addScaledVector(a.dir, 9)); g.fx.burst(p.pos.clone().setY(p.pos.y + 1), 0xc8a0ff, 16, 3); g.sfx('blink'); return true; } },
  },
  {
    id: 'steadfastAmulet', name: 'Амулет стойкости', icon: '🗿', kind: 'gear', slot: 'trinket', stats: { str: 4, maxHp: 80 }, tier: 4, noDrop: true, salvage: [['essence', 1]],
    active: { name: 'Несокрушимость', desc: 'Снимает дебафы, даёт иммунитет к контролю и +40% сопр. магии на 5 с.', cd: 40, use: (g, p) => { p.effects = p.effects.filter((e) => !e.def.debuff); g.effect(p, 'steadfast', 5, 0, p); g.fx.ring(p.pos, 1.6, 0xffd040, 0.5); g.sfx('shield'); return true; } },
  },
  {
    id: 'healingTotem', name: 'Тотем лечения', icon: '🪆', kind: 'gear', slot: 'trinket', stats: { hpRegen: 2 }, tier: 2, salvage: [['plank', 1], ['herb', 2]],
    active: { name: 'Исцеляющий круг', desc: 'Восстанавливает 30% здоровья за 6 с.', cd: 35, use: (g, p) => { g.effect(p, 'regen', 6, Math.round(p.stats.maxHp * 0.05), p); g.fx.ring(p.pos, 2, 0x6aff8a, 0.6); g.sfx('heal'); return true; } },
  },
  {
    id: 'snareNet', name: 'Ловчая сеть', icon: '🕸️', kind: 'gear', slot: 'trinket', stats: { agi: 3 }, tier: 2, salvage: [['rope', 2]],
    active: { name: 'Набросить сеть', desc: 'Обездвиживает врагов в радиусе 3.5 м на 2 с.', cd: 25, use: (g, p) => { for (const t of g.enemiesNear(p.pos, 3.5, p)) g.effect(t, 'root', 2, 0, p); g.fx.ring(p.pos, 3.5, 0xd8d0b0, 0.5); g.sfx('trap'); return true; } },
  },
  { id: 'stormEye', name: 'Глаз бури', icon: '👁️', kind: 'gear', slot: 'trinket', stats: { maxMp: 150, spellAmp: 15, magicTakenPct: 15 }, tier: 3, tradeoff: true, noDrop: true, desc: 'Сила грозы притягивает и чужую магию.', salvage: [['crystal', 2]] },
  { id: 'wolfFang', name: 'Ожерелье из клыков', icon: '📿', kind: 'gear', slot: 'trinket', stats: { critChance: 8, damage: 6 }, tier: 2, salvage: [['fang', 2]] },
  { id: 'luckyCharm', name: 'Талисман удачи', icon: '🍀', kind: 'gear', slot: 'trinket', stats: { evasion: 6, moveSpeedPct: 4 }, tier: 1, salvage: [['fiber', 2]] },

  // ---------- Руны (вставляются в гнёзда на Рунном алтаре) ----------
  { id: 'runeFire', name: 'Руна огня', icon: '🔥', kind: 'rune', maxStack: 10, stats: { damage: 10, magicResist: -8 }, tradeoff: true, desc: 'Вставляется в снаряжение.' },
  { id: 'runeIce', name: 'Руна льда', icon: '🧊', kind: 'rune', maxStack: 10, stats: { armor: 5, attackSpeedPct: -8 }, tradeoff: true, desc: 'Вставляется в снаряжение.' },
  { id: 'runeWind', name: 'Руна ветра', icon: '🍃', kind: 'rune', maxStack: 10, stats: { moveSpeedPct: 8, maxHp: -60 }, tradeoff: true, desc: 'Вставляется в снаряжение.' },
  { id: 'runeLife', name: 'Руна жизни', icon: '💗', kind: 'rune', maxStack: 10, stats: { maxHp: 150, damage: -5 }, tradeoff: true, desc: 'Вставляется в снаряжение.' },
  { id: 'runeMind', name: 'Руна разума', icon: '🧠', kind: 'rune', maxStack: 10, stats: { maxMp: 100, spellAmp: 8, hpRegen: -1 }, tradeoff: true, desc: 'Вставляется в снаряжение.' },
  { id: 'runeBlood', name: 'Руна крови', icon: '🩸', kind: 'rune', maxStack: 10, stats: { lifesteal: 8, dmgTakenPct: 6 }, tradeoff: true, desc: 'Вставляется в снаряжение.' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((d) => [d.id, d]));
export const ALL_ITEMS = list;

// ---------- Аффиксы ----------
export interface AffixDef {
  id: string;
  name: string; // прилагательное (префикс) или «…чего» (суффикс)
  prefix: boolean;
  stat: keyof Mods;
  base: number; // значение на 1 уровне предмета
  perLevel: number;
}

export const AFFIXES: AffixDef[] = [
  { id: 'sharp', name: 'Острый', prefix: true, stat: 'damage', base: 3, perLevel: 0.8 },
  { id: 'sturdy', name: 'Крепкий', prefix: true, stat: 'armor', base: 1, perLevel: 0.25 },
  { id: 'vital', name: 'Живучий', prefix: true, stat: 'maxHp', base: 30, perLevel: 9 },
  { id: 'swift', name: 'Быстрый', prefix: true, stat: 'attackSpeedPct', base: 5, perLevel: 0.6 },
  { id: 'strong', name: 'Могучий', prefix: true, stat: 'str', base: 2, perLevel: 0.5 },
  { id: 'agile', name: 'Ловкий', prefix: true, stat: 'agi', base: 2, perLevel: 0.5 },
  { id: 'wise', name: 'Мудрый', prefix: true, stat: 'int', base: 2, perLevel: 0.5 },
  { id: 'vamp', name: 'вампира', prefix: false, stat: 'lifesteal', base: 3, perLevel: 0.3 },
  { id: 'wind', name: 'ветра', prefix: false, stat: 'moveSpeedPct', base: 3, perLevel: 0.25 },
  { id: 'storm', name: 'бури', prefix: false, stat: 'spellAmp', base: 3, perLevel: 0.35 },
  { id: 'luck', name: 'удачи', prefix: false, stat: 'critChance', base: 3, perLevel: 0.3 },
  { id: 'shadow', name: 'тени', prefix: false, stat: 'evasion', base: 2, perLevel: 0.25 },
  { id: 'spring', name: 'источника', prefix: false, stat: 'mpRegen', base: 0.5, perLevel: 0.1 },
  { id: 'time', name: 'времени', prefix: false, stat: 'cdr', base: 3, perLevel: 0.25 },
  { id: 'warding', name: 'оберега', prefix: false, stat: 'magicResist', base: 4, perLevel: 0.3 },
];
export const AFFIX_MAP: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));
