// Типы декораций и построек, их варианты, коллизии и что из них добывается.

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
  // постройки и предметы мест
  Column,
  ColumnBroken,
  Arch,
  Colonnade,
  Aqueduct,
  Rubble,
  SandMound,
  Cabin,
  Fence,
  LampPost,
  LogPile,
  Bench,
  Signpost,
  PlaneWreck,
  TruckWreck,
  Crate,
  Barrel,
  Suitcase,
  Chest,
  Lantern,
  COUNT,
}

/** Сколько вариантов модели у типа (генератор выбирает по хэшу) */
export const VARIANTS: number[] = [];
for (let i = 0; i < D.COUNT; i++) VARIANTS[i] = 1;
VARIANTS[D.TreeOak] = 3;
VARIANTS[D.TreePine] = 3; // 2 — заснеженная
VARIANTS[D.TreeBirch] = 2;
VARIANTS[D.Bush] = 3;
VARIANTS[D.Rock] = 3;
VARIANTS[D.DeadTree] = 3;
VARIANTS[D.Cactus] = 2;
VARIANTS[D.Mushroom] = 3;
VARIANTS[D.Crystal] = 2;
VARIANTS[D.GrassTuft] = 2;
VARIANTS[D.Car] = 2;
VARIANTS[D.Column] = 2;
VARIANTS[D.ColumnBroken] = 3;
VARIANTS[D.Rubble] = 3;
VARIANTS[D.SandMound] = 2;
VARIANTS[D.Cabin] = 2; // 1 — под снегом
VARIANTS[D.Fence] = 2; // 1 — под снегом
VARIANTS[D.LogPile] = 2;
VARIANTS[D.Crate] = 2;
VARIANTS[D.Barrel] = 2;
VARIANTS[D.Suitcase] = 2;

/** Мелочь без теней (экономия) */
export const SMALL_DECO = new Set<number>([D.GrassTuft, D.FlowerRed, D.FlowerYellow, D.Herb, D.Reeds, D.Mushroom, D.Suitcase, D.Lantern, D.Rubble]);

/** Коллизии больших построек: круги [dx, dz, r] в локальных координатах модели (в блоках) */
export const COLLIDERS: Partial<Record<D, [number, number, number][]>> = {
  [D.Column]: [[0, 0, 0.55]],
  [D.ColumnBroken]: [[0, 0, 0.55]],
  [D.Arch]: [[-1.6, 0, 0.55], [1.6, 0, 0.55]],
  [D.Colonnade]: [[-3.75, 0, 0.55], [-1.25, 0, 0.55], [1.25, 0, 0.55], [3.75, 0, 0.55]],
  [D.Aqueduct]: [[-4, 0, 0.8], [0, 0, 0.8], [4, 0, 0.8]],
  [D.Cabin]: [[-2.8, -1.8, 1], [-1, -1.8, 1], [1, -1.8, 1], [2.8, -1.8, 1], [-2.8, 0, 1], [2.8, 0, 1], [0, 0, 1], [-2.8, 1.8, 1], [-1, 1.8, 1], [1, 1.8, 1], [2.8, 1.8, 1]],
  [D.Fence]: [[-1, 0, 0.3], [0, 0, 0.3], [1, 0, 0.3]],
  [D.LampPost]: [[0, 0, 0.25]],
  [D.LogPile]: [[-0.6, 0, 0.6], [0.6, 0, 0.6]],
  [D.Signpost]: [[0, 0, 0.2]],
  [D.PlaneWreck]: [[0, -2.2, 0.9], [0, 0, 1], [0, 2.2, 0.8], [-3, -0.4, 0.7], [3.2, -0.4, 0.7]],
  [D.TruckWreck]: [[0, -1.5, 1.2], [0, 1.2, 1.2]],
};

export interface HarvestInfo {
  name: string;
  drops: { id: string; min: number; max: number; chance?: number }[];
  hits: number;
  respawn: number; // секунды
  block: boolean; // мешает ли проходу
  radius: number;
  loot?: boolean; // сундук: случайный лут со снаряжением
}

export const HARVEST: Partial<Record<D, HarvestInfo>> = {
  [D.TreeOak]: { name: 'Дуб', drops: [{ id: 'wood', min: 2, max: 4 }, { id: 'fiber', min: 0, max: 1 }], hits: 3, respawn: 240, block: true, radius: 0.55 },
  [D.TreePine]: { name: 'Сосна', drops: [{ id: 'wood', min: 2, max: 4 }], hits: 3, respawn: 240, block: true, radius: 0.5 },
  [D.TreeBirch]: { name: 'Берёза', drops: [{ id: 'wood', min: 2, max: 3 }], hits: 3, respawn: 240, block: true, radius: 0.45 },
  [D.DeadTree]: { name: 'Сухое дерево', drops: [{ id: 'wood', min: 1, max: 3 }], hits: 2, respawn: 240, block: true, radius: 0.4 },
  [D.Bush]: { name: 'Куст', drops: [{ id: 'fiber', min: 1, max: 3 }, { id: 'berry', min: 0, max: 2 }], hits: 1, respawn: 150, block: false, radius: 0.5 },
  [D.Rock]: { name: 'Валун', drops: [{ id: 'stone', min: 2, max: 4 }, { id: 'crystal', min: 1, max: 1, chance: 0.06 }], hits: 3, respawn: 300, block: true, radius: 0.65 },
  [D.Car]: { name: 'Ржавая машина', drops: [{ id: 'scrap', min: 3, max: 5 }, { id: 'core', min: 1, max: 1, chance: 0.08 }], hits: 4, respawn: 600, block: true, radius: 1.2 },
  [D.Van]: { name: 'Фургон', drops: [{ id: 'scrap', min: 4, max: 6 }, { id: 'core', min: 1, max: 1, chance: 0.12 }], hits: 5, respawn: 600, block: true, radius: 1.4 },
  [D.ScrapPile]: { name: 'Груда хлама', drops: [{ id: 'scrap', min: 1, max: 3 }, { id: 'fiber', min: 0, max: 1 }], hits: 2, respawn: 300, block: false, radius: 0.6 },
  [D.TrashBin]: { name: 'Мусорный бак', drops: [{ id: 'scrap', min: 1, max: 2 }], hits: 2, respawn: 300, block: true, radius: 0.5 },
  [D.Cactus]: { name: 'Кактус', drops: [{ id: 'fiber', min: 1, max: 2 }, { id: 'herb', min: 0, max: 1 }], hits: 2, respawn: 240, block: true, radius: 0.4 },
  [D.Mushroom]: { name: 'Гриб', drops: [{ id: 'herb', min: 1, max: 1 }, { id: 'slime', min: 0, max: 1, chance: 0.3 }], hits: 1, respawn: 200, block: false, radius: 0.4 },
  [D.Crystal]: { name: 'Кристалл', drops: [{ id: 'crystal', min: 1, max: 3 }], hits: 4, respawn: 900, block: true, radius: 0.55 },
  [D.Herb]: { name: 'Целебная трава', drops: [{ id: 'herb', min: 1, max: 2 }], hits: 1, respawn: 180, block: false, radius: 0.4 },
  [D.Reeds]: { name: 'Камыш', drops: [{ id: 'fiber', min: 1, max: 2 }], hits: 1, respawn: 150, block: false, radius: 0.3 },
  [D.Crate]: { name: 'Ящик', drops: [{ id: 'wood', min: 1, max: 3 }, { id: 'scrap', min: 0, max: 2 }, { id: 'potionHp', min: 1, max: 1, chance: 0.15 }], hits: 2, respawn: 600, block: true, radius: 0.5 },
  [D.Barrel]: { name: 'Бочка', drops: [{ id: 'scrap', min: 1, max: 2 }, { id: 'slime', min: 1, max: 1, chance: 0.3 }], hits: 2, respawn: 600, block: true, radius: 0.4 },
  [D.Suitcase]: { name: 'Чемодан', drops: [{ id: 'fiber', min: 1, max: 2 }, { id: 'leather', min: 1, max: 1, chance: 0.3 }, { id: 'returnScroll', min: 1, max: 1, chance: 0.1 }], hits: 1, respawn: 600, block: false, radius: 0.4 },
  [D.Chest]: { name: 'Сундук с припасами', drops: [{ id: 'potionHp', min: 1, max: 2 }, { id: 'crystal', min: 0, max: 1 }], hits: 2, respawn: 600, block: true, radius: 0.5, loot: true },
};
