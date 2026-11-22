// Воксельные модели декораций мира. 1 воксель = 0.2 блока.
import * as THREE from 'three';
import { VoxelGrid, jit } from './voxel';
import { D } from '../world/decoTypes';

const S = 0.2;
const LEAVES = [0x5fb33b, 0x6cc246, 0x4fa233, 0x7bd152];

function leafColor(x: number, y: number, z: number, base = 0) {
  const i = Math.abs(Math.floor(x * 3 + y * 7 + z * 5 + base)) % LEAVES.length;
  return jit(LEAVES[i], x, y, z, 0.1);
}

function oak(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-1, 0, -1, 2, 11, 2, (x, y, z) => jit(0x7a5434, x, y, z));
  g.box(1, 7, -1, 2, 1, 1, 0x7a5434);
  g.sphere(0, 13, 0, 6.5, 5, 6.5, (x, y, z) => leafColor(x, y, z));
  g.sphere(3, 11, 2, 4, 3.5, 4, (x, y, z) => leafColor(x, y, z, 1));
  g.sphere(-3, 12, -2, 4, 3.5, 4, (x, y, z) => leafColor(x, y, z, 2));
  g.sphere(0, 17, 0, 4, 3, 4, (x, y, z) => leafColor(x, y, z, 3));
  return g;
}
function pine(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-1, 0, -1, 2, 6, 2, 0x6a4a30);
  for (let i = 0; i < 5; i++) {
    const r = 6 - i * 1.1;
    const y = 4 + i * 3.2;
    g.sphere(0, y, 0, r, 2.2, r, (x, yy, z) => jit(yy % 3 === 0 ? 0x3f8a4a : 0x4b9a55, x, yy, z, 0.08));
  }
  g.box(0, 20, 0, 1, 2, 1, 0x4b9a55);
  return g;
}
function birch(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-1, 0, -1, 2, 13, 2, (x, y, z) => (y % 4 === 1 && (x + z) % 2 === 0 ? 0x333333 : 0xeeeae0));
  g.sphere(0, 14, 0, 4.5, 6, 4.5, (x, y, z) => jit(y % 2 ? 0x9ad15a : 0x86c24a, x, y, z, 0.1));
  return g;
}
function bush(): VoxelGrid {
  const g = new VoxelGrid();
  g.sphere(0, 2, 0, 3.5, 2.6, 3.5, (x, y, z) => leafColor(x, y, z, 5));
  g.set(1, 4, 2, 0xd94848);
  g.set(-2, 3, 2, 0xd94848);
  g.set(2, 3, -1, 0xd94848);
  return g;
}
function rock(): VoxelGrid {
  const g = new VoxelGrid();
  g.sphere(0, 2, 0, 4.5, 3.4, 3.8, (x, y, z) => jit(y > 3 ? 0x9ea2a8 : 0x878b91, x, y, z, 0.1));
  g.sphere(2, 4, 1, 2.5, 2, 2, (x, y, z) => (y > 4 && (x + z) % 3 === 0 ? 0x8fcf4f : jit(0x9ea2a8, x, y, z)));
  return g;
}
function grass(): VoxelGrid {
  const g = new VoxelGrid();
  const c = [0x7cc94a, 0x8fd65a, 0x6ab83c];
  g.box(0, 0, 0, 1, 2, 1, c[0]);
  g.box(1, 0, 1, 1, 3, 1, c[1]);
  g.box(-1, 0, 1, 1, 2, 1, c[2]);
  g.box(1, 0, -1, 1, 1, 1, c[0]);
  return g;
}
function flower(color: number): VoxelGrid {
  const g = new VoxelGrid();
  g.box(0, 0, 0, 1, 2, 1, 0x5aa83a);
  g.set(0, 2, 0, 0xffe066);
  g.set(1, 2, 0, color);
  g.set(-1, 2, 0, color);
  g.set(0, 2, 1, color);
  g.set(0, 2, -1, color);
  g.set(2, 0, 1, 0x5aa83a);
  g.set(2, 1, 1, color);
  return g;
}
function car(): VoxelGrid {
  const g = new VoxelGrid();
  const body = 0x6fcfb6;
  g.box(-5, 1, -10, 10, 4, 20, (x, y, z) => (y === 1 && (z === -7 || z === 6) ? 0x222222 : jit(body, x, y, z, 0.06)));
  g.box(-4, 5, -5, 8, 3, 9, (x, y, z) => (y >= 6 && (x === -4 || x === 3 || z === -5 || z === 3) ? 0x3b4b5c : body));
  for (const [x, z] of [[-6, -8], [5, -8], [-6, 5], [5, 5]]) g.box(x, 0, z, 1, 3, 3, 0x2a2a2a);
  g.box(-4, 1, 9, 2, 1, 1, 0xffe8a0);
  g.box(2, 1, 9, 2, 1, 1, 0xffe8a0);
  // мох и трава
  g.sphere(0, 8, -1, 4, 1.5, 4, (x, y, z) => ((x + z) % 2 === 0 ? leafColor(x, y, z) : null));
  g.sphere(-2, 5, -8, 3, 1.5, 2, (x, y, z) => leafColor(x, y, z));
  return g;
}
function van(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-6, 1, -12, 12, 9, 22, (x, y, z) => (z > 6 && y > 6 ? null : y === 1 && (z === -9 || z === 5) ? 0x222222 : jit(0xf0eee6, x, y, z, 0.04)));
  g.box(-5, 6, 7, 10, 3, 3, (x, y, z) => (z === 9 && y > 6 ? 0x3b4b5c : 0xf0eee6));
  g.box(-6, 4, -12, 12, 1, 1, 0x4a9ae0);
  for (const [x, z] of [[-7, -10], [6, -10], [-7, 4], [6, 4]]) g.box(x, 0, z, 1, 3, 3, 0x2a2a2a);
  g.sphere(0, 10, -4, 5.5, 2, 7, (x, y, z) => ((x * 3 + z) % 4 !== 0 ? leafColor(x, y, z) : null));
  return g;
}
function trashBin(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-2, 0, -2, 5, 6, 5, (x, y, z) => (y === 3 && z === 2 && x === 0 ? 0xd7f0d0 : jit(0x4c8c4a, x, y, z, 0.06)));
  g.box(-3, 6, -3, 7, 1, 7, 0x3f7a3d);
  return g;
}
function deadTree(): VoxelGrid {
  const g = new VoxelGrid();
  const c = 0x6b5a48;
  g.box(-1, 0, -1, 2, 12, 2, c);
  g.box(1, 6, 0, 4, 1, 1, c);
  g.box(4, 7, 0, 1, 3, 1, c);
  g.box(-4, 8, 0, 3, 1, 1, c);
  g.box(-4, 9, 0, 1, 3, 1, c);
  g.box(0, 12, 0, 1, 2, 1, c);
  return g;
}
function cactus(): VoxelGrid {
  const g = new VoxelGrid();
  const c = (x: number, y: number, z: number) => jit(0x5f9e48, x, y, z, 0.08);
  g.box(-1, 0, -1, 3, 12, 3, c);
  g.box(2, 5, 0, 2, 1, 1, c);
  g.box(3, 5, 0, 1, 4, 1, c);
  g.box(-3, 7, 0, 2, 1, 1, c);
  g.box(-3, 7, 0, 1, 3, 1, c);
  g.set(0, 12, 0, 0xf06aa0);
  return g;
}
function mushroom(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(0, 0, 0, 1, 3, 1, 0xefe6d0);
  g.sphere(0, 4, 0, 2.5, 1.3, 2.5, (x, y, z) => ((x + z * 2) % 3 === 0 && y >= 4 ? 0xffffff : 0xd8443a));
  g.box(3, 0, 1, 1, 2, 1, 0xefe6d0);
  g.sphere(3, 2, 1, 1.5, 0.8, 1.5, 0xd8443a);
  return g;
}
function crystal(): VoxelGrid {
  const g = new VoxelGrid();
  const c = (x: number, y: number, z: number) => (y % 3 === 0 ? 0xb8f4ff : 0x6fd8f5);
  g.box(-1, 0, -1, 2, 8, 2, c);
  g.box(0, 8, 0, 1, 2, 1, 0xd8faff);
  g.box(2, 0, 0, 1, 5, 1, c);
  g.box(-3, 0, 1, 1, 4, 1, c);
  g.box(0, 0, 2, 1, 3, 1, c);
  g.sphere(0, 0, 0, 3, 1, 3, 0x8d9096);
  return g;
}
function herb(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(0, 0, 0, 1, 2, 1, 0x4f9a3a);
  g.box(-1, 1, 0, 1, 2, 1, 0x5fb33b);
  g.box(1, 1, 0, 1, 2, 1, 0x5fb33b);
  g.set(0, 2, 0, 0xff8ad8);
  g.set(-1, 3, 0, 0xff8ad8);
  g.set(1, 3, 0, 0xff8ad8);
  g.set(0, 3, 0, 0xffffff);
  return g;
}
function scrap(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(-3, 0, -2, 4, 2, 3, 0xa0603a);
  g.box(0, 0, 0, 3, 3, 3, 0x7d7f84);
  g.box(-2, 2, -1, 2, 1, 4, 0x5a5d63);
  g.box(1, 3, 1, 1, 1, 1, 0xd0a040);
  g.set(-3, 2, 1, 0x6cc23c);
  return g;
}
function reeds(): VoxelGrid {
  const g = new VoxelGrid();
  g.box(0, 0, 0, 1, 5, 1, 0x7a9a3a);
  g.box(2, 0, 1, 1, 4, 1, 0x8aaa4a);
  g.box(-1, 0, 2, 1, 6, 1, 0x7a9a3a);
  g.set(-1, 6, 2, 0x6b4a2f);
  g.set(0, 5, 0, 0x6b4a2f);
  return g;
}

let cache: THREE.BufferGeometry[] | null = null;

export function decoGeometries(): THREE.BufferGeometry[] {
  if (cache) return cache;
  const make: Record<number, () => VoxelGrid> = {
    [D.TreeOak]: oak,
    [D.TreePine]: pine,
    [D.TreeBirch]: birch,
    [D.Bush]: bush,
    [D.Rock]: rock,
    [D.GrassTuft]: grass,
    [D.FlowerRed]: () => flower(0xe8564a),
    [D.FlowerYellow]: () => flower(0xf4d03f),
    [D.Car]: car,
    [D.Van]: van,
    [D.TrashBin]: trashBin,
    [D.DeadTree]: deadTree,
    [D.Cactus]: cactus,
    [D.Mushroom]: mushroom,
    [D.Crystal]: crystal,
    [D.Herb]: herb,
    [D.ScrapPile]: scrap,
    [D.Reeds]: reeds,
  };
  cache = [];
  for (let i = 0; i < D.COUNT; i++) cache[i] = make[i]().toGeometry(S, [0, 0, 0]);
  return cache;
}

/** Мелкая трава/цветы не отбрасывают тень — экономим на мобилках */
export const SMALL_DECO = new Set<number>([D.GrassTuft, D.FlowerRed, D.FlowerYellow, D.Herb, D.Reeds, D.Mushroom]);
