/// <reference lib="webworker" />
import { WorldGen } from './gen';
import { meshChunk } from './mesher';

let gen: WorldGen | null = null;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'init') {
    gen = new WorldGen(msg.seed);
    return;
  }
  if (msg.type === 'gen' && gen) {
    const data = gen.generate(msg.cx, msg.cz);
    const mesh = meshChunk(data.blocks, msg.cx, msg.cz);
    const out = {
      type: 'chunk',
      cx: msg.cx,
      cz: msg.cz,
      heights: data.heights,
      tops: data.tops,
      biomes: data.biomes,
      decos: data.decos,
      opaque: mesh.opaque,
      water: mesh.water,
    };
    const tr: Transferable[] = [
      data.heights.buffer,
      data.tops.buffer,
      data.biomes.buffer,
      data.decos.buffer,
      mesh.opaque.positions.buffer,
      mesh.opaque.normals.buffer,
      mesh.opaque.colors.buffer,
      mesh.opaque.indices.buffer,
      mesh.water.positions.buffer,
      mesh.water.normals.buffer,
      mesh.water.colors.buffer,
      mesh.water.indices.buffer,
    ];
    (self as unknown as Worker).postMessage(out, tr);
  }
};
