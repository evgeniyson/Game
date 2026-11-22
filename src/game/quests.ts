// Доска наград: охота, сбор, крафт и боссы.
import { MOBS } from '../data/mobs';
import { ITEMS } from '../data/items';
import { Rng } from '../core/rng';

export interface Quest {
  id: number;
  kind: 'kill' | 'gather' | 'craft' | 'boss';
  target: string;
  need: number;
  have: number;
  xp: number;
  reward: [string, number][];
}

let QID = 1;

const KILL_POOL: { id: string; min: number }[] = [
  { id: 'crab', min: 1 },
  { id: 'slime', min: 1 },
  { id: 'wolf', min: 3 },
  { id: 'toad', min: 4 },
  { id: 'automaton', min: 5 },
  { id: 'boar', min: 2 },
  { id: 'frostSlime', min: 7 },
];
const GATHER_POOL = ['wood', 'stone', 'scrap', 'fiber', 'herb', 'hide', 'slime', 'chitin', 'fang'];
const REWARDS: [string, number][][] = [
  [['potionHp', 2]],
  [['potionMp', 2]],
  [['bomb', 2]],
  [['crystal', 1]],
  [['steel', 2]],
  [['leather', 2]],
  [['roastMeat', 3]],
  [['essence', 1]],
  [['returnScroll', 1]],
];

export function questTitle(q: Quest): string {
  switch (q.kind) {
    case 'kill':
      return `Охота: ${MOBS[q.target].name}`;
    case 'gather':
      return `Сбор: ${ITEMS[q.target].name}`;
    case 'craft':
      return 'Мастерство: создать предметы';
    case 'boss':
      return `Награда за голову: ${MOBS[q.target].name}`;
  }
}

export function makeQuest(level: number, rng: Rng, avoid: Quest[]): Quest {
  const xpBase = Math.round(60 + level * 45);
  for (let tries = 0; tries < 20; tries++) {
    const r = rng.float();
    let q: Quest;
    if (r < 0.45) {
      const pool = KILL_POOL.filter((k) => k.min <= level + 1);
      const k = rng.pick(pool);
      q = { id: QID++, kind: 'kill', target: k.id, need: rng.int(5, 9), have: 0, xp: xpBase * 2, reward: rng.pick(REWARDS) };
    } else if (r < 0.8) {
      q = { id: QID++, kind: 'gather', target: rng.pick(GATHER_POOL), need: rng.int(6, 14), have: 0, xp: xpBase, reward: rng.pick(REWARDS) };
    } else if (r < 0.9 || level < 4) {
      q = { id: QID++, kind: 'craft', target: 'any', need: rng.int(2, 4), have: 0, xp: xpBase, reward: rng.pick(REWARDS) };
    } else {
      q = { id: QID++, kind: 'boss', target: 'ogre', need: 1, have: 0, xp: xpBase * 6, reward: [['essence', 2], ['crystal', 2]] };
    }
    if (!avoid.some((a) => a.kind === q.kind && a.target === q.target)) return q;
  }
  return { id: QID++, kind: 'gather', target: 'wood', need: 10, have: 0, xp: xpBase, reward: [['potionHp', 1]] };
}

export function setQidBase(n: number) {
  QID = Math.max(QID, n);
}
