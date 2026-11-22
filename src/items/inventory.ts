// Экземпляры предметов, генерация лута, инвентарь, экипировка и крафт.
import { ITEMS, RARITY, AFFIXES, AFFIX_MAP, ALL_ITEMS, type Slot, type ItemDef } from '../data/items';
import { RECIPES, UPGRADE, type Recipe } from '../data/recipes';
import { sumMods, describeMods, type Mods } from '../combat/stats';
import type { ClassId } from '../data/classes';
import { Rng } from '../core/rng';

export interface ItemInst {
  uid: number;
  id: string;
  qty: number;
  rarity: number;
  ilvl: number;
  affixes: { id: string; v: number }[];
  sockets: number;
  runes: string[];
  plus: number;
}

let UID = 1;
export const setUidBase = (n: number) => {
  UID = Math.max(UID, n);
};

export function makeItem(id: string, qty = 1, rarity = 0, ilvl = 1): ItemInst {
  const def = ITEMS[id];
  if (!def) throw new Error('Неизвестный предмет ' + id);
  return { uid: UID++, id, qty, rarity: def.kind === 'gear' ? rarity : 0, ilvl, affixes: [], sockets: 0, runes: [], plus: 0 };
}

/** Генерация снаряжения: редкость, аффиксы, гнёзда */
export function rollGear(id: string, ilvl: number, rarity: number, rng: Rng): ItemInst {
  const it = makeItem(id, 1, rarity, ilvl);
  const n = RARITY[rarity].affixes;
  const pool = [...AFFIXES];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(rng.float() * pool.length);
    const a = pool.splice(idx, 1)[0];
    const v = (a.base + a.perLevel * ilvl) * rng.range(0.6, 1);
    it.affixes.push({ id: a.id, v: Math.round(v * 10) / 10 });
  }
  it.sockets = rarity >= 3 ? 2 : rarity >= 1 ? 1 : rng.chance(0.3) ? 1 : 0;
  return it;
}

export function rollRarity(rng: Rng, bonus = 0): number {
  const r = rng.float() - bonus;
  if (r < 0.02) return 4;
  if (r < 0.08) return 3;
  if (r < 0.25) return 2;
  if (r < 0.55) return 1;
  return 0;
}

export function randomGearId(rng: Rng, cls: ClassId | null, ilvl: number): string {
  const pool = ALL_ITEMS.filter((d) => d.kind === 'gear' && !d.noDrop && (d.tier ?? 1) <= 1 + Math.floor(ilvl / 4));
  const own = pool.filter((d) => !d.classes || (cls && d.classes.includes(cls)));
  const src = cls && rng.chance(0.7) && own.length ? own : pool;
  return rng.pick(src).id;
}

export function itemMods(it: ItemInst): Mods {
  const def = ITEMS[it.id];
  const out: Mods = {};
  if (def.kind === 'rune') return { ...def.stats };
  if (!def.stats) return out;
  const scale = (1 + (it.ilvl - 1) * 0.07) * RARITY[it.rarity].mult * (1 + it.plus * 0.12);
  for (const k in def.stats) {
    const v = (def.stats as any)[k] as number;
    (out as any)[k] = v > 0 ? round1(v * scale) : v;
  }
  for (const a of it.affixes) {
    const ad = AFFIX_MAP[a.id];
    if (!ad) continue;
    (out as any)[ad.stat] = round1(((out as any)[ad.stat] ?? 0) + a.v);
  }
  for (const r of it.runes) {
    const rd = ITEMS[r];
    if (rd?.stats) for (const k in rd.stats) (out as any)[k] = round1(((out as any)[k] ?? 0) + (rd.stats as any)[k]);
  }
  return out;
}
const round1 = (v: number) => Math.round(v * 10) / 10;

export function itemName(it: ItemInst): string {
  const def = ITEMS[it.id];
  if (def.kind !== 'gear') return def.name;
  let name = def.name;
  const pre = it.affixes.map((a) => AFFIX_MAP[a.id]).find((a) => a?.prefix);
  const suf = it.affixes.map((a) => AFFIX_MAP[a.id]).find((a) => a && !a.prefix);
  if (pre) name = `${pre.name} ${lowerFirst(name)}`;
  if (suf) name = `${name} ${suf.name}`;
  if (it.plus) name += ` +${it.plus}`;
  return name;
}
const lowerFirst = (s: string) => {
  // «Острый Меч» -> «Острый меч», но сохраняем кавычки
  return s.charAt(0).toLowerCase() + s.slice(1);
};

export function itemDescLines(it: ItemInst): string[] {
  const def = ITEMS[it.id];
  const lines: string[] = [];
  if (def.kind === 'gear' || def.kind === 'rune') lines.push(...describeMods(itemMods(it)));
  if (def.active) lines.push(`Активно — ${def.active.name}: ${def.active.desc} (КД ${def.active.cd} с)`);
  if (def.desc) lines.push(def.desc);
  if (def.kind === 'gear' && it.sockets) lines.push(`Гнёзда: ${it.runes.map((r) => ITEMS[r].icon).join(' ')}${'◇ '.repeat(it.sockets - it.runes.length)}`);
  return lines;
}

// ---------------- Инвентарь ----------------
export const BAG_SIZE = 36;
export const EQUIP_SLOTS: { key: string; slot: Slot }[] = [
  { key: 'weapon', slot: 'weapon' },
  { key: 'offhand', slot: 'offhand' },
  { key: 'head', slot: 'head' },
  { key: 'chest', slot: 'chest' },
  { key: 'legs', slot: 'legs' },
  { key: 'boots', slot: 'boots' },
  { key: 'trinket1', slot: 'trinket' },
  { key: 'trinket2', slot: 'trinket' },
];

export class Inventory {
  bag: (ItemInst | null)[] = new Array(BAG_SIZE).fill(null);
  equip: Record<string, ItemInst | null> = {};
  quick: (number | null)[] = [null, null, null, null]; // uid предметов в быстрых слотах
  onChange: () => void = () => {};

  constructor() {
    for (const s of EQUIP_SLOTS) this.equip[s.key] = null;
  }

  count(id: string): number {
    let n = 0;
    for (const it of this.bag) if (it && it.id === id) n += it.qty;
    return n;
  }

  /** Добавляет предмет. Возвращает остаток, который не влез. */
  add(item: ItemInst): number {
    const def = ITEMS[item.id];
    const max = def.maxStack ?? 1;
    if (max > 1) {
      for (const it of this.bag) {
        if (it && it.id === item.id && it.qty < max) {
          const take = Math.min(max - it.qty, item.qty);
          it.qty += take;
          item.qty -= take;
          if (item.qty <= 0) break;
        }
      }
    }
    while (item.qty > 0) {
      const idx = this.bag.indexOf(null);
      if (idx < 0) break;
      const take = Math.min(max, item.qty);
      this.bag[idx] = { ...item, qty: take, uid: take === item.qty ? item.uid : UID++ };
      item.qty -= take;
    }
    this.onChange();
    return item.qty;
  }

  addId(id: string, qty = 1): number {
    return this.add(makeItem(id, qty));
  }

  remove(id: string, qty: number): boolean {
    if (this.count(id) < qty) return false;
    // сначала из наименее ценных стаков/предметов
    const idxs = this.bag.map((it, i) => (it && it.id === id ? i : -1)).filter((i) => i >= 0);
    idxs.sort((a, b) => this.bag[a]!.rarity - this.bag[b]!.rarity || this.bag[a]!.qty - this.bag[b]!.qty);
    for (const i of idxs) {
      const it = this.bag[i]!;
      const take = Math.min(it.qty, qty);
      it.qty -= take;
      qty -= take;
      if (it.qty <= 0) this.bag[i] = null;
      if (qty <= 0) break;
    }
    this.onChange();
    return true;
  }

  findUid(uid: number): { where: 'bag' | 'equip'; key: number | string; item: ItemInst } | null {
    for (let i = 0; i < this.bag.length; i++) if (this.bag[i]?.uid === uid) return { where: 'bag', key: i, item: this.bag[i]! };
    for (const k in this.equip) if (this.equip[k]?.uid === uid) return { where: 'equip', key: k, item: this.equip[k]! };
    return null;
  }

  canEquip(it: ItemInst, cls: ClassId): boolean {
    const def = ITEMS[it.id];
    if (def.kind !== 'gear' || !def.slot) return false;
    return !def.classes || def.classes.includes(cls);
  }

  equipFromBag(index: number, cls: ClassId): boolean {
    const it = this.bag[index];
    if (!it || !this.canEquip(it, cls)) return false;
    const slot = ITEMS[it.id].slot!;
    let key = EQUIP_SLOTS.find((s) => s.slot === slot && !this.equip[s.key])?.key;
    if (!key) key = EQUIP_SLOTS.find((s) => s.slot === slot)!.key;
    const prev = this.equip[key];
    this.equip[key] = it;
    this.bag[index] = prev;
    this.onChange();
    return true;
  }

  unequip(key: string): boolean {
    const it = this.equip[key];
    if (!it) return false;
    const idx = this.bag.indexOf(null);
    if (idx < 0) return false;
    this.bag[idx] = it;
    this.equip[key] = null;
    this.onChange();
    return true;
  }

  equippedMods(): Mods[] {
    return Object.values(this.equip)
      .filter((x): x is ItemInst => !!x)
      .map(itemMods);
  }

  equippedSum(): Required<Mods> {
    return sumMods(this.equippedMods());
  }

  freeSlots(): number {
    return this.bag.filter((x) => !x).length;
  }

  sort() {
    const items = this.bag.filter((x): x is ItemInst => !!x);
    const order = { gear: 0, consumable: 1, rune: 2, material: 3 } as Record<string, number>;
    items.sort((a, b) => order[ITEMS[a.id].kind] - order[ITEMS[b.id].kind] || b.rarity - a.rarity || a.id.localeCompare(b.id));
    this.bag = [...items, ...new Array(BAG_SIZE - items.length).fill(null)];
    this.onChange();
  }

  toJSON() {
    return { bag: this.bag, equip: this.equip, quick: this.quick };
  }
  load(d: any) {
    if (!d) return;
    this.bag = d.bag ?? this.bag;
    while (this.bag.length < BAG_SIZE) this.bag.push(null);
    this.equip = { ...this.equip, ...(d.equip ?? {}) };
    this.quick = d.quick ?? this.quick;
    let max = 0;
    for (const it of [...this.bag, ...Object.values(this.equip)]) if (it) max = Math.max(max, it.uid);
    setUidBase(max + 1);
  }
}

// ---------------- Крафт ----------------
export function canCraft(inv: Inventory, r: Recipe, level: number): { ok: boolean; reason?: string } {
  if ((r.level ?? 1) > level) return { ok: false, reason: `Нужен ${r.level} уровень` };
  for (const [id, q] of r.inputs) if (inv.count(id) < q) return { ok: false, reason: 'Не хватает материалов' };
  if (inv.freeSlots() < 1 && inv.count(r.out) === 0) return { ok: false, reason: 'Инвентарь полон' };
  return { ok: true };
}

export function craft(inv: Inventory, r: Recipe, level: number, rng: Rng): ItemInst | null {
  if (!canCraft(inv, r, level).ok) return null;
  for (const [id, q] of r.inputs) inv.remove(id, q);
  const def = ITEMS[r.out];
  let out: ItemInst;
  if (def.kind === 'gear') {
    // крафт гарантирует минимум «необычное» качество
    out = rollGear(r.out, Math.max(level, r.level ?? 1), Math.max(1, rollRarity(rng, 0.1)), rng);
  } else out = makeItem(r.out, r.qty ?? 1);
  inv.add({ ...out });
  return out;
}

export function recipesFor(station: string): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}

/** Разбор предмета на материалы */
export function salvage(inv: Inventory, index: number, rng: Rng): [string, number][] | null {
  const it = inv.bag[index];
  if (!it) return null;
  const def = ITEMS[it.id];
  if (def.kind !== 'gear') return null;
  inv.bag[index] = null;
  const got: [string, number][] = [...(def.salvage ?? [['scrap', 1]])];
  if (it.rarity >= 3 || (it.rarity === 2 && rng.chance(0.3))) got.push(['essence', 1]);
  for (const r of it.runes) got.push([r, 1]);
  for (const [id, q] of got) inv.addId(id, q);
  return got;
}

export function upgradeItem(inv: Inventory, it: ItemInst, rng: Rng): 'ok' | 'fail' | 'max' | 'cost' {
  if (it.plus >= UPGRADE.length) return 'max';
  const u = UPGRADE[it.plus];
  for (const [id, q] of u.cost) if (inv.count(id) < q) return 'cost';
  for (const [id, q] of u.cost) inv.remove(id, q);
  if (rng.chance(u.chance)) {
    it.plus++;
    inv.onChange();
    return 'ok';
  }
  return 'fail';
}

export function socketRune(inv: Inventory, it: ItemInst, runeId: string): boolean {
  if (it.runes.length >= it.sockets) return false;
  if (!inv.remove(runeId, 1)) return false;
  it.runes.push(runeId);
  inv.onChange();
  return true;
}

export function getDef(it: ItemInst): ItemDef {
  return ITEMS[it.id];
}
