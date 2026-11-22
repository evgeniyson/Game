// Палитра блоков. Цвета подобраны под «заросший постапокалипсис»: сочная зелень, тёплый бетон, патина.

export const enum B {
  Air = 0,
  Grass,
  Dirt,
  Stone,
  Sand,
  Water,
  Snow,
  Log,
  Leaves,
  Concrete,
  ConcretePink,
  Window,
  Asphalt,
  RoadLine,
  Copper,
  CopperDark,
  Moss,
  Mud,
  DarkGrass,
  Plank,
  Roof,
  Brick,
  Ice,
  Vine,
  RustMetal,
  ConcreteBeige,
  PineLeaves,
  Gravel,
  CopperLight,
  Path,
  COUNT,
}

/** RGB 0..255 */
export const BLOCK_COLORS: [number, number, number][] = [];
const set = (b: B, hex: number) => {
  BLOCK_COLORS[b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
};
set(B.Air, 0x000000);
set(B.Grass, 0x7cc94a);
set(B.Dirt, 0x9b7653);
set(B.Stone, 0x8d9096);
set(B.Sand, 0xe2cf92);
set(B.Water, 0x4cb3c9);
set(B.Snow, 0xf2f6fa);
set(B.Log, 0x7a5434);
set(B.Leaves, 0x5fb33b);
set(B.Concrete, 0xc9c6bd);
set(B.ConcretePink, 0xe0b8a8);
set(B.Window, 0x3b4b5c);
set(B.Asphalt, 0x6b6e70);
set(B.RoadLine, 0xe8e2c8);
set(B.Copper, 0x7fc8b4);
set(B.CopperDark, 0x5a9e8d);
set(B.Moss, 0x8fcf4f);
set(B.Mud, 0x6b5a3e);
set(B.DarkGrass, 0x4f8f3a);
set(B.Plank, 0xb8864f);
set(B.Roof, 0xb2553e);
set(B.Brick, 0xb4705a);
set(B.Ice, 0xb8e4f2);
set(B.Vine, 0x6cc23c);
set(B.RustMetal, 0xa0603a);
set(B.ConcreteBeige, 0xe6dcc0);
set(B.PineLeaves, 0x3f8a4a);
set(B.Gravel, 0xa59e94);
set(B.CopperLight, 0xa3dccb);
set(B.Path, 0xd9b77e);

export const isSolid = (b: number) => b !== B.Air && b !== B.Water;
export const isTransparentForFaces = (b: number) => b === B.Air || b === B.Water;
