// Рецепты крафта. Как в Dota 2, старшие предметы собираются из компонентов и младших предметов.

export type Station = 'hand' | 'workbench' | 'forge' | 'alchemy' | 'altar';

export const STATIONS: Record<Station, { name: string; icon: string; desc: string }> = {
  hand: { name: 'В руках', icon: '✋', desc: 'Простые рецепты, доступные везде' },
  workbench: { name: 'Верстак', icon: '🪚', desc: 'Кожа, луки, лёгкая броня, бомбы' },
  forge: { name: 'Кузница', icon: '⚒️', desc: 'Сталь, мечи, латы. Улучшение снаряжения' },
  alchemy: { name: 'Алхимический стол', icon: '⚗️', desc: 'Зелья и эликсиры' },
  altar: { name: 'Рунный алтарь', icon: '🔯', desc: 'Руны, артефакты. Вставка рун в гнёзда' },
};

export interface Recipe {
  id: string;
  station: Station;
  inputs: [string, number][];
  out: string;
  qty?: number;
  level?: number;
}

const r = (station: Station, out: string, inputs: [string, number][], qty = 1, level = 1): Recipe => ({ id: `${station}:${out}`, station, out, inputs, qty, level });

export const RECIPES: Recipe[] = [
  // В руках
  r('hand', 'plank', [['wood', 2]]),
  r('hand', 'rope', [['fiber', 3]]),
  r('hand', 'roastMeat', [['meat', 1], ['wood', 1]]),
  r('hand', 'luckyCharm', [['fiber', 4], ['berry', 3], ['fang', 1]], 1, 2),

  // Верстак
  r('workbench', 'leather', [['hide', 2]]),
  r('workbench', 'rustyKnife', [['scrap', 2], ['plank', 1]]),
  r('workbench', 'compositeBow', [['plank', 2], ['rope', 2], ['fang', 2]], 1, 3),
  r('workbench', 'crystalStaff', [['plank', 2], ['crystal', 2]], 1, 3),
  r('workbench', 'quiver', [['leather', 2]]),
  r('workbench', 'leatherHood', [['leather', 2], ['rope', 1]]),
  r('workbench', 'leatherJacket', [['leather', 3], ['rope', 1]]),
  r('workbench', 'leatherPants', [['leather', 2], ['rope', 1]]),
  r('workbench', 'oldSneakers', [['fiber', 4], ['rope', 1]]),
  r('workbench', 'travelBoots', [['leather', 2], ['rope', 1], ['slime', 1]], 1, 4),
  r('workbench', 'mageRobe', [['rope', 3], ['leather', 1], ['crystal', 1]], 1, 3),
  r('workbench', 'wolfFang', [['fang', 4], ['rope', 1]], 1, 3),
  r('workbench', 'snareNet', [['rope', 4], ['fang', 1]], 1, 4),
  r('workbench', 'healingTotem', [['plank', 2], ['herb', 4], ['essence', 1]], 1, 5),
  r('workbench', 'bomb', [['scrap', 2], ['slime', 1], ['fiber', 1]], 2),
  r('workbench', 'berserkerMask', [['rustyKnife', 1], ['leatherHood', 1], ['essence', 1]], 1, 6),

  // Кузница
  r('forge', 'steel', [['scrap', 3], ['stone', 1]]),
  r('forge', 'rebarSword', [['steel', 2], ['plank', 1]], 1, 3),
  r('forge', 'steelHelm', [['steel', 3]], 1, 4),
  r('forge', 'steelGreaves', [['steel', 3]], 1, 4),
  r('forge', 'ironBoots', [['steel', 2], ['leather', 1]], 1, 4),
  r('forge', 'towerShield', [['steel', 3], ['plank', 2], ['chitin', 2]], 1, 6),
  r('forge', 'hunterCrossbow', [['steel', 3], ['rope', 2], ['core', 1]], 1, 7),
  r('forge', 'heavyPlate', [['steel', 5], ['chitin', 2], ['leather', 1]], 1, 7),
  r('forge', 'bloodBlade', [['rebarSword', 1], ['fang', 3], ['essence', 1]], 1, 8),
  r('forge', 'signHammer', [['steel', 4], ['stoneheart', 1], ['plank', 2]], 1, 10),

  // Алхимия
  r('alchemy', 'potionHp', [['herb', 2], ['slime', 1]], 2),
  r('alchemy', 'potionMp', [['crystal', 1], ['herb', 1]], 2),
  r('alchemy', 'elixirFury', [['essence', 1], ['berry', 2], ['fang', 1]], 1, 5),
  r('alchemy', 'returnScroll', [['fiber', 2], ['crystal', 1]]),

  // Рунный алтарь
  r('altar', 'runeFire', [['crystal', 1], ['fang', 1], ['wood', 2]], 1, 4),
  r('altar', 'runeIce', [['crystal', 1], ['slime', 1], ['stone', 2]], 1, 4),
  r('altar', 'runeWind', [['crystal', 1], ['fiber', 3]], 1, 4),
  r('altar', 'runeLife', [['crystal', 1], ['herb', 3]], 1, 4),
  r('altar', 'runeMind', [['crystal', 2], ['essence', 1]], 1, 6),
  r('altar', 'runeBlood', [['crystal', 1], ['fang', 2], ['essence', 1]], 1, 6),
  r('altar', 'sageCirclet', [['crystal', 2], ['leather', 1]], 1, 3),
  r('altar', 'phaseStone', [['crystal', 3], ['essence', 1]], 1, 6),
  r('altar', 'stormEye', [['crystal', 4], ['core', 1], ['essence', 1]], 1, 8),
  r('altar', 'stormStaff', [['crystalStaff', 1], ['core', 1], ['crystal', 3], ['essence', 1]], 1, 9),
  r('altar', 'steadfastAmulet', [['stoneheart', 1], ['essence', 2]], 1, 10),
];

/** Стоимость улучшения +N в кузнице и шанс успеха */
export const UPGRADE = [
  { cost: [['steel', 1], ['scrap', 2]] as [string, number][], chance: 1 },
  { cost: [['steel', 2], ['scrap', 3]] as [string, number][], chance: 0.9 },
  { cost: [['steel', 3], ['crystal', 1]] as [string, number][], chance: 0.75 },
  { cost: [['steel', 4], ['crystal', 2]] as [string, number][], chance: 0.6 },
  { cost: [['steel', 5], ['essence', 1]] as [string, number][], chance: 0.45 },
];
