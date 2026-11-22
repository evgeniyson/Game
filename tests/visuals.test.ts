import { describe, it, expect } from 'vitest';
import { WorldGen, CHUNK } from '../src/world/gen';
import { D, VARIANTS, COLLIDERS, HARVEST } from '../src/world/decoTypes';
import { decoGeometry } from '../src/render/decoModels';
import { buildGear } from '../src/render/weaponModels';
import { ALL_ITEMS } from '../src/data/items';
import { DECO_STRIDE } from '../src/render/decoRenderer';

describe('места и декорации', () => {
  it('генерация мест детерминирована', () => {
    const a = new WorldGen(77),
      b = new WorldGen(77);
    for (let gx = -3; gx <= 3; gx++)
      for (let gz = -3; gz <= 3; gz++) expect(JSON.stringify(a.siteInCell(gx, gz))).toBe(JSON.stringify(b.siteInCell(gx, gz)));
  });

  it('в мире встречаются все три вида мест', () => {
    const g = new WorldGen(5);
    const kinds = new Set<string>();
    for (let gx = -12; gx <= 12; gx++) for (let gz = -12; gz <= 12; gz++) {
      const s = g.siteInCell(gx, gz);
      if (s) kinds.add(s.kind);
    }
    expect(kinds.has('ruins')).toBe(true);
    expect(kinds.has('cabins')).toBe(true);
    expect(kinds.has('crash')).toBe(true);
  });

  it('куски места попадают в декорации чанка с корректным вариантом', () => {
    const g = new WorldGen(5);
    let site = null;
    for (let gx = -6; gx <= 6 && !site; gx++) for (let gz = -6; gz <= 6 && !site; gz++) site = g.siteInCell(gx, gz);
    expect(site).toBeTruthy();
    const p = site!.pieces[0];
    const ch = g.generate(Math.floor(p.x / CHUNK), Math.floor(p.z / CHUNK));
    let found = false;
    for (let i = 0; i < ch.decos.length; i += DECO_STRIDE) {
      const t = ch.decos[i];
      expect(ch.decos[i + 6]).toBeLessThan(VARIANTS[t]);
      if (t === p.t && Math.abs(ch.decos[i + 1] - p.x) < 0.01 && Math.abs(ch.decos[i + 3] - p.z) < 0.01) found = true;
    }
    expect(found).toBe(true);
  });

  it('у каждого типа и варианта есть геометрия, грубый LOD легче детального', () => {
    for (let t = 0; t < D.COUNT; t++)
      for (let v = 0; v < VARIANTS[t]; v++) {
        const g0 = decoGeometry(t as D, v, 0);
        const g1 = decoGeometry(t as D, v, 1);
        expect(g0.index!.count).toBeGreaterThan(0);
        expect(g1.index!.count).toBeLessThanOrEqual(g0.index!.count);
      }
  });

  it('у больших построек есть коллизии, у сундука — лут', () => {
    expect(COLLIDERS[D.Cabin]!.length).toBeGreaterThan(4);
    expect(COLLIDERS[D.PlaneWreck]).toBeTruthy();
    expect(HARVEST[D.Chest]!.loot).toBe(true);
  });
});

describe('модели снаряжения', () => {
  it('у каждого предмета снаряжения есть воксельная модель', () => {
    for (const d of ALL_ITEMS) {
      if (d.kind !== 'gear') continue;
      const m = buildGear(d.id);
      expect(m, d.id).toBeTruthy();
      expect(m!.grid.size).toBeGreaterThan(5);
    }
  });
  it('оружие крепится в руку, луки — как лук, щиты — на предплечье', () => {
    expect(buildGear('rebarSword')!.mount).toBe('hand');
    expect(buildGear('compositeBow')!.mount).toBe('bow');
    expect(buildGear('towerShield')!.mount).toBe('arm');
    expect(buildGear('quiver')!.mount).toBe('back');
  });
});
