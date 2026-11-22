// Бестиарий: живность, враги, элиты и боссы.
import { Biome } from '../world/gen';
import type { Mods } from '../combat/stats';

export interface MobDef {
  id: string;
  name: string;
  model: string;
  team: 'enemy' | 'neutral' | 'passive';
  scale: number;
  hp: number;
  damage: number;
  armor: number;
  mr: number;
  attackRate: number;
  attackRange: number;
  moveSpeed: number;
  aggro: number;
  xp: number;
  biomes: Biome[];
  weight: number;
  pack: [number, number];
  minLevel?: number;
  night?: boolean; // чаще ночью
  ability?: string;
  abilityRange?: number;
  loot: [string, number, number, number][]; // id, шанс, мин, макс
  gearChance: number;
  splitInto?: string;
  boss?: boolean;
  onHit?: { effect: string; chance: number; dur: number; value: number };
}

export const MOBS: Record<string, MobDef> = {
  deer: {
    id: 'deer', name: 'Олень', model: 'deer', team: 'passive', scale: 1.1, hp: 120, damage: 0, armor: 0, mr: 0, attackRate: 1, attackRange: 1, moveSpeed: 5.5, aggro: 0, xp: 12,
    biomes: [Biome.Meadow, Biome.Forest], weight: 3, pack: [1, 3], loot: [['meat', 0.9, 1, 2], ['hide', 0.8, 1, 2]], gearChance: 0,
  },
  rabbit: {
    id: 'rabbit', name: 'Кролик-рогач', model: 'rabbit', team: 'passive', scale: 1, hp: 50, damage: 0, armor: 0, mr: 0, attackRate: 1, attackRange: 1, moveSpeed: 6, aggro: 0, xp: 5,
    biomes: [Biome.Meadow, Biome.Desert, Biome.Snow], weight: 2, pack: [1, 2], loot: [['meat', 0.8, 1, 1], ['hide', 0.5, 1, 1]], gearChance: 0,
  },
  boar: {
    id: 'boar', name: 'Кабан-мхоспин', model: 'boar', team: 'neutral', scale: 1.1, hp: 280, damage: 18, armor: 2, mr: 0, attackRate: 0.8, attackRange: 1.6, moveSpeed: 4.6, aggro: 7, xp: 30,
    biomes: [Biome.Meadow, Biome.Forest], weight: 2, pack: [1, 2], ability: 'boarCharge', abilityRange: 7,
    loot: [['meat', 1, 1, 2], ['hide', 0.9, 1, 2], ['fang', 0.35, 1, 1]], gearChance: 0.08,
  },
  crab: {
    id: 'crab', name: 'Мусорный краб', model: 'crab', team: 'enemy', scale: 1.1, hp: 190, damage: 14, armor: 4, mr: 0, attackRate: 0.9, attackRange: 1.5, moveSpeed: 3.6, aggro: 8, xp: 28,
    biomes: [Biome.City, Biome.Meadow, Biome.Desert], weight: 4, pack: [2, 3],
    loot: [['chitin', 0.6, 1, 2], ['scrap', 0.5, 1, 2]], gearChance: 0.1,
  },
  slime: {
    id: 'slime', name: 'Слизень-споровик', model: 'slime', team: 'enemy', scale: 1.2, hp: 160, damage: 12, armor: 0, mr: 10, attackRate: 0.8, attackRange: 1.4, moveSpeed: 3.2, aggro: 8, xp: 22,
    biomes: [Biome.Swamp, Biome.Forest, Biome.Meadow], weight: 4, pack: [1, 3], splitInto: 'slimeling', night: true,
    loot: [['slime', 0.8, 1, 2]], gearChance: 0.08,
  },
  slimeling: {
    id: 'slimeling', name: 'Слизнячок', model: 'slime', team: 'enemy', scale: 0.6, hp: 50, damage: 6, armor: 0, mr: 0, attackRate: 1, attackRange: 1.2, moveSpeed: 4.2, aggro: 10, xp: 6,
    biomes: [], weight: 0, pack: [1, 1], loot: [['slime', 0.3, 1, 1]], gearChance: 0,
  },
  wolf: {
    id: 'wolf', name: 'Лозоволк', model: 'wolf', team: 'enemy', scale: 1.15, hp: 210, damage: 19, armor: 1, mr: 0, attackRate: 1.1, attackRange: 1.6, moveSpeed: 6.0, aggro: 11, xp: 32,
    biomes: [Biome.Forest, Biome.Snow], weight: 3, pack: [2, 4], night: true, onHit: { effect: 'bleed', chance: 0.25, dur: 3, value: 8 },
    loot: [['hide', 0.6, 1, 2], ['fang', 0.5, 1, 2]], gearChance: 0.1,
  },
  automaton: {
    id: 'automaton', name: 'Ржавый автоматон', model: 'automaton', team: 'enemy', scale: 1.15, hp: 420, damage: 28, armor: 8, mr: 25, attackRate: 0.7, attackRange: 1.8, moveSpeed: 3.6, aggro: 9, xp: 60,
    biomes: [Biome.City, Biome.Desert], weight: 2, pack: [1, 1], minLevel: 3, onHit: { effect: 'shred', chance: 0.3, dur: 5, value: 2 },
    loot: [['scrap', 1, 2, 4], ['core', 0.3, 1, 1]], gearChance: 0.18,
  },
  toad: {
    id: 'toad', name: 'Болотная жаба', model: 'toad', team: 'enemy', scale: 1.3, hp: 230, damage: 18, armor: 2, mr: 15, attackRate: 0.7, attackRange: 1.6, moveSpeed: 3.4, aggro: 10, xp: 34,
    biomes: [Biome.Swamp], weight: 4, pack: [1, 2], ability: 'toadSpit', abilityRange: 8,
    loot: [['slime', 0.6, 1, 2], ['herb', 0.4, 1, 1]], gearChance: 0.1,
  },
  frostSlime: {
    id: 'frostSlime', name: 'Ледяной слизень', model: 'slimeBlue', team: 'enemy', scale: 1.3, hp: 260, damage: 16, armor: 2, mr: 20, attackRate: 0.8, attackRange: 1.4, moveSpeed: 3.0, aggro: 8, xp: 36,
    biomes: [Biome.Snow], weight: 3, pack: [1, 2], onHit: { effect: 'slow', chance: 0.5, dur: 2, value: 30 },
    loot: [['slime', 0.8, 1, 2], ['crystal', 0.12, 1, 1]], gearChance: 0.1,
  },
  ogre: {
    id: 'ogre', name: 'Каменный Молотоогр', model: 'ogre', team: 'enemy', scale: 2.2, hp: 2200, damage: 42, armor: 10, mr: 25, attackRate: 0.6, attackRange: 3.0, moveSpeed: 3.8, aggro: 13, xp: 900,
    biomes: [], weight: 0, pack: [1, 1], ability: 'ogreSlam', abilityRange: 3.5, boss: true,
    loot: [['stoneheart', 1, 1, 1], ['essence', 1, 2, 3], ['crystal', 0.8, 1, 3]], gearChance: 1,
  },
};

export interface EliteAffix {
  id: string;
  name: string;
  mods: Mods;
  onHit?: { effect: string; chance: number; dur: number; value: number };
}

export const ELITE_AFFIXES: EliteAffix[] = [
  { id: 'rabid', name: 'Бешеный', mods: { attackSpeedPct: 45, moveSpeedPct: 20 } },
  { id: 'stoneskin', name: 'Каменнокожий', mods: { armor: 10, maxHpPct: 50 } },
  { id: 'venom', name: 'Ядовитый', mods: { damagePct: 10 }, onHit: { effect: 'poison', chance: 0.6, dur: 4, value: 10 } },
  { id: 'vampiric', name: 'Вампирический', mods: { lifesteal: 35 } },
  { id: 'frozen', name: 'Ледяной', mods: { magicResist: 30 }, onHit: { effect: 'slow', chance: 0.5, dur: 2, value: 35 } },
];
