import { describe, it, expect } from 'vitest';
import { Inventory, makeItem, rollGear, rollRarity, itemMods, craft, canCraft, salvage, socketRune, upgradeItem } from '../src/items/inventory';
import { RECIPES } from '../src/data/recipes';
import { ITEMS } from '../src/data/items';
import { Rng } from '../src/core/rng';
import { makeQuest } from '../src/game/quests';

const recipe = (id: string) => RECIPES.find((r) => r.id === id)!;

describe('инвентарь', () => {
  it('стаки материалов объединяются', () => {
    const inv = new Inventory();
    inv.addId('wood', 60);
    inv.addId('wood', 60);
    expect(inv.count('wood')).toBe(120);
    expect(inv.bag.filter(Boolean).length).toBe(2);
    expect(inv.remove('wood', 100)).toBe(true);
    expect(inv.count('wood')).toBe(20);
    expect(inv.remove('wood', 100)).toBe(false);
  });
  it('экипировка учитывает класс и слот', () => {
    const inv = new Inventory();
    inv.add(makeItem('shortBow'));
    expect(inv.equipFromBag(0, 'warden')).toBe(false);
    expect(inv.equipFromBag(0, 'ranger')).toBe(true);
    expect(inv.equip.weapon?.id).toBe('shortBow');
  });
});

describe('крафт', () => {
  it('рецепт тратит материалы и создаёт предмет', () => {
    const inv = new Inventory();
    inv.addId('wood', 5);
    const out = craft(inv, recipe('hand:plank'), 1, new Rng(1));
    expect(out?.id).toBe('plank');
    expect(inv.count('wood')).toBe(3);
    expect(inv.count('plank')).toBe(1);
  });
  it('требование уровня и материалов', () => {
    const inv = new Inventory();
    expect(canCraft(inv, recipe('hand:plank'), 1).ok).toBe(false);
    inv.addId('steel', 10);
    inv.addId('plank', 5);
    expect(canCraft(inv, recipe('forge:rebarSword'), 1).ok).toBe(false);
    expect(canCraft(inv, recipe('forge:rebarSword'), 3).ok).toBe(true);
  });
  it('сборка старшего предмета из младшего (как в Dota)', () => {
    const inv = new Inventory();
    inv.add(makeItem('rustyKnife'));
    inv.add(makeItem('leatherHood'));
    inv.addId('essence', 1);
    const out = craft(inv, recipe('workbench:berserkerMask'), 6, new Rng(3));
    expect(out?.id).toBe('berserkerMask');
    expect(inv.count('rustyKnife')).toBe(0);
    expect(out!.rarity).toBeGreaterThanOrEqual(1);
  });
  it('у предметов с компромиссом есть и плюсы, и минусы', () => {
    const m = itemMods(makeItem('heavyPlate'));
    expect(m.armor!).toBeGreaterThan(0);
    expect(m.moveSpeedPct!).toBeLessThan(0);
    expect(ITEMS.heavyPlate.tradeoff).toBe(true);
  });
  it('руны вставляются в гнёзда и меняют характеристики', () => {
    const inv = new Inventory();
    const sword = rollGear('rebarSword', 5, 3, new Rng(5));
    inv.add(sword);
    inv.addId('runeFire', 1);
    const ref = inv.bag.find((x) => x?.id === 'rebarSword')!;
    const before = itemMods(ref).damage!;
    expect(socketRune(inv, ref, 'runeFire')).toBe(true);
    expect(itemMods(ref).damage!).toBeCloseTo(before + 10, 1);
    expect(itemMods(ref).magicResist!).toBeLessThan(0);
  });
  it('разбор возвращает материалы', () => {
    const inv = new Inventory();
    inv.add(makeItem('heavyPlate'));
    const got = salvage(inv, 0, new Rng(1));
    expect(got).toBeTruthy();
    expect(inv.count('steel')).toBe(3);
  });
  it('улучшение +1 гарантировано и усиливает предмет', () => {
    const inv = new Inventory();
    const it0 = makeItem('rebarSword');
    inv.add(it0);
    inv.addId('steel', 5);
    inv.addId('scrap', 5);
    const ref = inv.bag.find((x) => x?.id === 'rebarSword')!;
    const d0 = itemMods(ref).damage!;
    expect(upgradeItem(inv, ref, new Rng(1))).toBe('ok');
    expect(itemMods(ref).damage!).toBeGreaterThan(d0);
  });
});

describe('лут и задания', () => {
  it('редкость распределена от частой к редкой', () => {
    const rng = new Rng(42);
    const c = [0, 0, 0, 0, 0];
    for (let i = 0; i < 20000; i++) c[rollRarity(rng)]++;
    expect(c[0]).toBeGreaterThan(c[1]);
    expect(c[1]).toBeGreaterThan(c[2]);
    expect(c[2]).toBeGreaterThan(c[3]);
    expect(c[3]).toBeGreaterThan(c[4]);
    expect(c[4]).toBeGreaterThan(0);
  });
  it('количество аффиксов зависит от редкости', () => {
    const rng = new Rng(7);
    expect(rollGear('leatherJacket', 5, 0, rng).affixes.length).toBe(0);
    expect(rollGear('leatherJacket', 5, 4, rng).affixes.length).toBe(4);
  });
  it('задания генерируются без дублей', () => {
    const rng = new Rng(11);
    const qs = [makeQuest(5, rng, [])];
    for (let i = 0; i < 2; i++) qs.push(makeQuest(5, rng, qs));
    const keys = new Set(qs.map((q) => q.kind + q.target));
    expect(keys.size).toBe(3);
  });
});
