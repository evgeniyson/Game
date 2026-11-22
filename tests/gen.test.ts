import { describe, it, expect } from 'vitest';
import { WorldGen, CHUNK } from '../src/world/gen';
import { meshChunk } from '../src/world/mesher';

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('генерация мира', () => {
  it('детерминирована по сиду', () => {
    const a = new WorldGen(42).generate(3, -2);
    const b = new WorldGen(42).generate(3, -2);
    expect(eq(a.blocks, b.blocks)).toBe(true);
    expect(Array.from(a.decos)).toEqual(Array.from(b.decos));
  });
  it('разные сиды дают разный мир', () => {
    const a = new WorldGen(1).generate(5, 5);
    const b = new WorldGen(2).generate(5, 5);
    expect(eq(a.heights, b.heights)).toBe(false);
  });
  it('лагерь в центре ровный и проходимый', () => {
    const c = new WorldGen(7).generate(0, 0);
    expect(c.heights[2 + 2 * CHUNK]).toBeGreaterThan(10);
  });
  it('меш строится и не пустой', () => {
    const c = new WorldGen(9).generate(2, 1);
    const m = meshChunk(c.blocks, 2, 1);
    expect(m.opaque.indices.length).toBeGreaterThan(1000);
  });
});
