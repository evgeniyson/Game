import { describe, it, expect } from 'vitest';
import { armorMult, mitigate, deriveStats, xpToNext, type BaseDef } from '../src/combat/stats';
import { applyEffect, updateEffects, absorbShields, effectMods, isStunned, type EffectHost } from '../src/combat/effects';
import { CLASSES } from '../src/data/classes';
import { ABILITIES } from '../src/combat/abilities';

const host = (cc = 0): EffectHost => ({ effects: [], stats: { ccImmune: cc }, alive: true });
const noCtx = { damage: () => {}, heal: () => {} };

describe('характеристики', () => {
  it('броня по формуле Dota 2', () => {
    expect(armorMult(0)).toBe(1);
    expect(armorMult(10)).toBeCloseTo(1 - 0.6 / 1.6, 5);
    expect(armorMult(-5)).toBeGreaterThan(1);
  });
  it('физ. урон режется бронёй, магический — сопротивлением', () => {
    const s = deriveStats(CLASSES.warden.base, 1, [{ armor: 10, magicResist: 50 }]);
    expect(mitigate(100, 'phys', s)).toBeLessThan(100);
    expect(mitigate(100, 'magic', s)).toBeLessThan(50);
    expect(mitigate(100, 'pure', s)).toBe(100);
  });
  it('основной атрибут даёт урон, сила — здоровье', () => {
    const b: BaseDef = CLASSES.warden.base;
    const s1 = deriveStats(b, 1, []);
    const s2 = deriveStats(b, 1, [{ str: 10 }]);
    expect(s2.maxHp - s1.maxHp).toBe(200);
    expect(s2.damage - s1.damage).toBe(10);
  });
  it('уровень повышает атрибуты', () => {
    const s1 = deriveStats(CLASSES.mystic.base, 1, []);
    const s10 = deriveStats(CLASSES.mystic.base, 10, []);
    expect(s10.int).toBeCloseTo(s1.int + 9 * CLASSES.mystic.base.intGain);
    expect(s10.maxMp).toBeGreaterThan(s1.maxMp);
  });
  it('кривая опыта растёт', () => {
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(4));
  });
});

describe('бафы и дебафы', () => {
  it('замедление даёт отрицательный модификатор скорости и истекает', () => {
    const h = host();
    applyEffect(h, 'slow', 2, 30);
    expect(effectMods(h)[0].moveSpeedPct).toBe(-30);
    updateEffects(h, 2.1, noCtx);
    expect(h.effects.length).toBe(0);
  });
  it('яд складывается до 5 стаков и тикает', () => {
    const h = host();
    let dealt = 0;
    for (let i = 0; i < 7; i++) applyEffect(h, 'poison', 4, 10);
    expect(h.effects[0].stacks).toBe(5);
    updateEffects(h, 1.01, { damage: (_s, _t, a) => (dealt += a), heal: () => {} });
    expect(dealt).toBe(50);
  });
  it('иммунитет к контролю блокирует оглушение', () => {
    const h = host(1);
    expect(applyEffect(h, 'stun', 2)).toBeNull();
    expect(isStunned(h)).toBe(false);
    expect(applyEffect(h, 'slow', 2, 20)).not.toBeNull();
  });
  it('щит поглощает урон', () => {
    const h = host();
    applyEffect(h, 'shield', 5, 100);
    expect(absorbShields(h, 60)).toBe(0);
    expect(absorbShields(h, 60)).toBe(20);
    updateEffects(h, 0.01, noCtx);
    expect(h.effects.length).toBe(0);
  });
});

describe('способности', () => {
  it('у каждого класса 4 существующие способности, ульта до 3 уровня', () => {
    for (const c of Object.values(CLASSES)) {
      expect(c.abilities.length).toBe(4);
      for (const id of c.abilities) expect(ABILITIES[id]).toBeTruthy();
      expect(ABILITIES[c.abilities[3]].maxLevel).toBe(3);
      expect(c.talents.length).toBe(4);
    }
  });
});
