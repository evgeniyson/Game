// Атмосфера биомов: цвет неба/тумана, оттенок солнца, цветокоррекция. Плавно смешивается при переходах.
import * as THREE from 'three';
import { Biome } from '../world/gen';

export interface AtmoProfile {
  sky: THREE.Color;
  fog: THREE.Color;
  fogNear: number; // смещение от дистанции камеры
  fogFar: number;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  gain: THREE.Vector3;
  lift: THREE.Vector3;
  saturation: number;
  vignette: number;
}

const P = (o: {
  sky: number; fog: number; fogNear: number; fogFar: number; sun: number; sunI: number; hemiSky: number; hemiGround: number; hemiI: number;
  gain: [number, number, number]; lift?: [number, number, number]; saturation: number; vignette?: number;
}): AtmoProfile => ({
  sky: new THREE.Color(o.sky),
  fog: new THREE.Color(o.fog),
  fogNear: o.fogNear,
  fogFar: o.fogFar,
  sun: new THREE.Color(o.sun),
  sunI: o.sunI,
  hemiSky: new THREE.Color(o.hemiSky),
  hemiGround: new THREE.Color(o.hemiGround),
  hemiI: o.hemiI,
  gain: new THREE.Vector3(...o.gain),
  lift: new THREE.Vector3(...(o.lift ?? [0, 0, 0])),
  saturation: o.saturation,
  vignette: o.vignette ?? 0.38,
});

export const PROFILES: Record<number, AtmoProfile> = {
  [Biome.Meadow]: P({ sky: 0xbfe2f2, fog: 0xd8e6d0, fogNear: 6, fogFar: 62, sun: 0xffe2b8, sunI: 2.6, hemiSky: 0xd6ecff, hemiGround: 0x6f8f3e, hemiI: 1.0, gain: [1.06, 1.0, 0.9], saturation: 0.98 }),
  [Biome.Camp]: P({ sky: 0xc8e2ee, fog: 0xe0e2cc, fogNear: 6, fogFar: 62, sun: 0xffdcae, sunI: 2.6, hemiSky: 0xd6ecff, hemiGround: 0x8a7a50, hemiI: 1.0, gain: [1.07, 1.0, 0.9], saturation: 1.0 }),
  [Biome.City]: P({ sky: 0xb8d8ea, fog: 0xcfd9dc, fogNear: 6, fogFar: 60, sun: 0xfff0d8, sunI: 2.5, hemiSky: 0xd8ecff, hemiGround: 0x7a7a6a, hemiI: 1.0, gain: [1.0, 1.0, 0.98], saturation: 1.05 }),
  [Biome.Forest]: P({ sky: 0xa8d4c4, fog: 0xa9c7a6, fogNear: 2, fogFar: 54, sun: 0xffdca8, sunI: 2.4, hemiSky: 0xc8f0e0, hemiGround: 0x4f6f30, hemiI: 1.0, gain: [1.0, 1.02, 0.93], saturation: 0.97 }),
  [Biome.Swamp]: P({ sky: 0xadc2a4, fog: 0x9fb39a, fogNear: -2, fogFar: 46, sun: 0xf2e6c0, sunI: 2.1, hemiSky: 0xc8dcc0, hemiGround: 0x4a5a30, hemiI: 1.05, gain: [0.95, 1.02, 0.9], saturation: 0.95 }),
  [Biome.Desert]: P({ sky: 0xf2c48c, fog: 0xeeb67a, fogNear: 4, fogFar: 56, sun: 0xffd29a, sunI: 2.8, hemiSky: 0xffe0b8, hemiGround: 0xc0844a, hemiI: 1.05, gain: [1.12, 0.98, 0.84], lift: [0.02, 0.008, 0], saturation: 1.08 }),
  [Biome.Snow]: P({ sky: 0xb4bcef, fog: 0xa6addd, fogNear: 2, fogFar: 54, sun: 0xffd4a8, sunI: 2.5, hemiSky: 0xc8d0ff, hemiGround: 0x8a90c4, hemiI: 1.1, gain: [0.93, 0.96, 1.1], lift: [0.005, 0.005, 0.02], saturation: 0.95, vignette: 0.42 }),
};

const NIGHT = P({ sky: 0x141c3c, fog: 0x1c2448, fogNear: -4, fogFar: 44, sun: 0x8aa0ff, sunI: 0.35, hemiSky: 0x3a4a90, hemiGround: 0x1a2030, hemiI: 0.55, gain: [0.85, 0.92, 1.15], saturation: 0.85, vignette: 0.5 });
const DUSK_SUN = new THREE.Color(0xff9a5a);
const DUSK_SKY = new THREE.Color(0xffa070);

/** Текущее (сглаженное) состояние атмосферы */
export class Atmosphere {
  cur: AtmoProfile = cloneProfile(PROFILES[Biome.Meadow]);
  out: AtmoProfile = cloneProfile(PROFILES[Biome.Meadow]);
  private target: AtmoProfile = PROFILES[Biome.Meadow];

  setBiome(b: Biome) {
    this.target = PROFILES[b] ?? PROFILES[Biome.Meadow];
  }

  snap() {
    copyProfile(this.cur, this.target);
  }

  /** day: 0..1 (ночь→день), dusk: 0..1 сила заката */
  update(dt: number, day: number, dusk: number): AtmoProfile {
    lerpProfile(this.cur, this.target, Math.min(1, dt * 0.8));
    copyProfile(this.out, NIGHT);
    lerpProfile(this.out, this.cur, day);
    if (dusk > 0) {
      this.out.sun.lerp(DUSK_SUN, dusk * 0.6);
      this.out.sky.lerp(DUSK_SKY, dusk * 0.35);
      this.out.fog.lerp(DUSK_SKY, dusk * 0.25);
      this.out.gain.lerp(new THREE.Vector3(1.1, 0.96, 0.86), dusk * 0.5);
    }
    return this.out;
  }
}

function cloneProfile(p: AtmoProfile): AtmoProfile {
  return {
    ...p,
    sky: p.sky.clone(),
    fog: p.fog.clone(),
    sun: p.sun.clone(),
    hemiSky: p.hemiSky.clone(),
    hemiGround: p.hemiGround.clone(),
    gain: p.gain.clone(),
    lift: p.lift.clone(),
  };
}
function copyProfile(a: AtmoProfile, b: AtmoProfile) {
  a.sky.copy(b.sky);
  a.fog.copy(b.fog);
  a.sun.copy(b.sun);
  a.hemiSky.copy(b.hemiSky);
  a.hemiGround.copy(b.hemiGround);
  a.gain.copy(b.gain);
  a.lift.copy(b.lift);
  a.fogNear = b.fogNear;
  a.fogFar = b.fogFar;
  a.sunI = b.sunI;
  a.hemiI = b.hemiI;
  a.saturation = b.saturation;
  a.vignette = b.vignette;
}
function lerpProfile(a: AtmoProfile, b: AtmoProfile, t: number) {
  a.sky.lerp(b.sky, t);
  a.fog.lerp(b.fog, t);
  a.sun.lerp(b.sun, t);
  a.hemiSky.lerp(b.hemiSky, t);
  a.hemiGround.lerp(b.hemiGround, t);
  a.gain.lerp(b.gain, t);
  a.lift.lerp(b.lift, t);
  a.fogNear += (b.fogNear - a.fogNear) * t;
  a.fogFar += (b.fogFar - a.fogFar) * t;
  a.sunI += (b.sunI - a.sunI) * t;
  a.hemiI += (b.hemiI - a.hemiI) * t;
  a.saturation += (b.saturation - a.saturation) * t;
  a.vignette += (b.vignette - a.vignette) * t;
}
