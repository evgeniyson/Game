// Типы декораций (растения, камни, машины) и что из них добывается.

export const enum D {
  TreeOak = 0,
  TreePine,
  TreeBirch,
  Bush,
  Rock,
  GrassTuft,
  FlowerRed,
  FlowerYellow,
  Car,
  Van,
  TrashBin,
  DeadTree,
  Cactus,
  Mushroom,
  Crystal,
  Herb,
  ScrapPile,
  Reeds,
  COUNT,
}

export interface HarvestInfo {
  name: string;
  drops: { id: string; min: number; max: number; chance?: number }[];
  hits: number;
  respawn: number; // секунды
  block: boolean; // мешает ли проходу
  radius: number;
}

export const HARVEST: Partial<Record<D, HarvestInfo>> = {
  [D.TreeOak]: { name: 'Дуб', drops: [{ id: 'wood', min: 2, max: 4 }, { id: 'fiber', min: 0, max: 1 }], hits: 3, respawn: 240, block: true, radius: 0.6 },
  [D.TreePine]: { name: 'Сосна', drops: [{ id: 'wood', min: 2, max: 4 }], hits: 3, respawn: 240, block: true, radius: 0.55 },
  [D.TreeBirch]: { name: 'Берёза', drops: [{ id: 'wood', min: 2, max: 3 }], hits: 3, respawn: 240, block: true, radius: 0.5 },
  [D.DeadTree]: { name: 'Сухое дерево', drops: [{ id: 'wood', min: 1, max: 3 }], hits: 2, respawn: 240, block: true, radius: 0.45 },
  [D.Bush]: { name: 'Куст', drops: [{ id: 'fiber', min: 1, max: 3 }, { id: 'berry', min: 0, max: 2 }], hits: 1, respawn: 150, block: false, radius: 0.5 },
  [D.Rock]: { name: 'Валун', drops: [{ id: 'stone', min: 2, max: 4 }, { id: 'crystal', min: 1, max: 1, chance: 0.06 }], hits: 3, respawn: 300, block: true, radius: 0.7 },
  [D.Car]: { name: 'Ржавая машина', drops: [{ id: 'scrap', min: 3, max: 5 }, { id: 'core', min: 1, max: 1, chance: 0.08 }], hits: 4, respawn: 600, block: true, radius: 1.2 },
  [D.Van]: { name: 'Фургон', drops: [{ id: 'scrap', min: 4, max: 6 }, { id: 'core', min: 1, max: 1, chance: 0.12 }], hits: 5, respawn: 600, block: true, radius: 1.4 },
  [D.ScrapPile]: { name: 'Груда хлама', drops: [{ id: 'scrap', min: 1, max: 3 }, { id: 'fiber', min: 0, max: 1 }], hits: 2, respawn: 300, block: false, radius: 0.6 },
  [D.TrashBin]: { name: 'Мусорный бак', drops: [{ id: 'scrap', min: 1, max: 2 }], hits: 2, respawn: 300, block: true, radius: 0.5 },
  [D.Cactus]: { name: 'Кактус', drops: [{ id: 'fiber', min: 1, max: 2 }, { id: 'herb', min: 0, max: 1 }], hits: 2, respawn: 240, block: true, radius: 0.4 },
  [D.Mushroom]: { name: 'Гриб', drops: [{ id: 'herb', min: 1, max: 1 }, { id: 'slime', min: 0, max: 1, chance: 0.3 }], hits: 1, respawn: 200, block: false, radius: 0.4 },
  [D.Crystal]: { name: 'Кристалл', drops: [{ id: 'crystal', min: 1, max: 3 }], hits: 4, respawn: 900, block: true, radius: 0.6 },
  [D.Herb]: { name: 'Целебная трава', drops: [{ id: 'herb', min: 1, max: 2 }], hits: 1, respawn: 180, block: false, radius: 0.4 },
  [D.Reeds]: { name: 'Камыш', drops: [{ id: 'fiber', min: 1, max: 2 }], hits: 1, respawn: 150, block: false, radius: 0.3 },
};
