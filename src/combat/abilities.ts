// Способности классов (Q/W/E/R) в духе Dota 2.
import * as THREE from 'three';
import type { Entity } from '../game/entity';
import type { DmgType } from './stats';

export interface Aim {
  dir: THREE.Vector3; // нормализованное направление по XZ
  point: THREE.Vector3; // точка на земле
  target: Entity | null;
}

export interface ProjectileOpts {
  owner: Entity;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  range: number;
  radius: number;
  color: number;
  kind: 'arrow' | 'orb' | 'rock' | 'spit' | 'bolt';
  homing?: Entity | null;
  pierce?: boolean;
  onHit: (t: Entity, p: THREE.Vector3) => void;
  onEnd?: (p: THREE.Vector3) => void;
}

export interface ZoneOpts {
  owner: Entity;
  pos: THREE.Vector3;
  radius: number;
  duration: number;
  tick: number;
  color: number;
  kind: 'rain' | 'trap' | 'telegraph' | 'heal';
  delay?: number;
  onTick: (targets: Entity[], zone: { pos: THREE.Vector3; end: () => void }) => void;
}

export interface AbilityGame {
  enemiesNear(pos: THREE.Vector3, radius: number, of: Entity): Entity[];
  nearestEnemy(pos: THREE.Vector3, range: number, of: Entity): Entity | null;
  damage(src: Entity, tgt: Entity, amount: number, type: DmgType, opts?: { crit?: boolean; attack?: boolean; label?: string }): number;
  effect(tgt: Entity, id: string, dur: number, value?: number, src?: Entity | null, stacks?: number): void;
  heal(tgt: Entity, amount: number): void;
  projectile(o: ProjectileOpts): void;
  zone(o: ZoneOpts): void;
  startDash(e: Entity, dir: THREE.Vector3, dist: number, speed: number, onHit?: (t: Entity) => void, onEnd?: () => void): void;
  blink(e: Entity, to: THREE.Vector3): void;
  knockback(t: Entity, dir: THREE.Vector3, dist: number): void;
  later(delay: number, fn: () => void): void;
  fx: {
    ring(pos: THREE.Vector3, radius: number, color: number, dur?: number): void;
    burst(pos: THREE.Vector3, color: number, count?: number, speed?: number): void;
    lightning(points: THREE.Vector3[], color: number): void;
    line(from: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, color: number, dur?: number): void;
    shake(amount: number): void;
  };
  sfx(name: string): void;
  hasTalent(e: Entity, id: string): boolean;
  countZones(owner: Entity, kind: string): number;
}

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  maxLevel: number;
  targeting: 'none' | 'dir' | 'point' | 'unit';
  range: number;
  radius?: number;
  width?: number;
  mana: number[];
  cd: number[];
  castTime?: number;
  desc: (lvl: number) => string;
  cast: (g: AbilityGame, c: Entity, aim: Aim, lvl: number) => void;
}

const lv = (arr: number[], l: number) => arr[Math.max(0, Math.min(arr.length - 1, l - 1))];
const amp = (c: Entity) => 1 + c.stats.spellAmp / 100;
const fmt = (arr: number[]) => arr.map((v) => +v.toFixed(1)).join('/');
const up = (v: THREE.Vector3, y = 1) => v.clone().setY(v.y + y);

const defs: AbilityDef[] = [
  // ===================== СТРАЖ =====================
  {
    id: 'shieldBash', name: 'Удар щитом', icon: '🛡️', maxLevel: 4, targeting: 'unit', range: 2.8,
    mana: [40, 45, 50, 55], cd: [9, 8, 7, 6], castTime: 0.25,
    desc: (l) => `Бьёт щитом цель перед собой: ${fmt([60, 100, 140, 180])} + 60% урона атаки (физ.) и оглушает на ${fmt([1, 1.2, 1.4, 1.6])} с.`,
    cast(g, c, aim, l) {
      const stun = lv([1, 1.2, 1.4, 1.6], l) + (g.hasTalent(c, 'w15a') ? 0.6 : 0);
      const dmg = lv([60, 100, 140, 180], l) + c.stats.damage * 0.6;
      const center = c.pos.clone().addScaledVector(aim.dir, 1.4);
      const targets = aim.target && aim.target.distTo(c) < 3.4 ? [aim.target] : g.enemiesNear(center, 1.8, c).slice(0, 1);
      for (const t of targets) {
        g.damage(c, t, dmg, 'phys');
        g.effect(t, 'stun', stun, 0, c);
        g.knockback(t, aim.dir, 0.8);
        g.fx.burst(up(t.pos), 0xffe08a, 14, 4);
      }
      g.fx.ring(center, 1.6, 0xffe08a, 0.3);
      g.fx.shake(0.15);
      g.sfx('bash');
    },
  },
  {
    id: 'charge', name: 'Рывок', icon: '🐗', maxLevel: 4, targeting: 'dir', range: 8, width: 1.6,
    mana: [60, 60, 60, 60], cd: [14, 12, 10, 8],
    desc: () => `Таранит по прямой на 8 м. Враги на пути получают ${fmt([40, 70, 100, 130])} + 50% атаки урона, отбрасываются и замедляются на 30%.`,
    cast(g, c, aim, l) {
      const dmg = lv([40, 70, 100, 130], l) + c.stats.damage * 0.5;
      const stun = g.hasTalent(c, 'w20a');
      g.fx.line(c.pos, aim.dir, 8, 1.6, 0xffc070, 0.35);
      g.startDash(c, aim.dir, 8, 22, (t) => {
        g.damage(c, t, dmg, 'phys');
        g.effect(t, 'slow', 2, 30, c);
        if (stun) g.effect(t, 'stun', 0.8, 0, c);
        const side = new THREE.Vector3(aim.dir.z, 0, -aim.dir.x);
        if (side.dot(t.pos.clone().sub(c.pos)) < 0) side.negate();
        g.knockback(t, side.add(aim.dir).normalize(), 2);
        g.fx.burst(up(t.pos), 0xffc070, 10);
      });
      g.sfx('dash');
    },
  },
  {
    id: 'spikedShell', name: 'Шипастый панцирь', icon: '🦔', maxLevel: 4, targeting: 'none', range: 0,
    mana: [70, 70, 70, 70], cd: [18, 16, 14, 12],
    desc: () => `На 6 с даёт щит ${fmt([100, 170, 240, 310])} + 10% макс. здоровья, броню и отражение 35–65% получаемого урона.`,
    cast(g, c, _aim, l) {
      const shield = lv([100, 170, 240, 310], l) + c.stats.maxHp * 0.1;
      c.effects = c.effects.filter((e) => e.def.id !== 'spikedShell');
      g.effect(c, 'spikedShell', 6, shield, c, l);
      g.fx.ring(c.pos, 1.5, 0x9ad0ff, 0.5);
      g.fx.burst(up(c.pos), 0x9ad0ff, 16, 3);
      g.sfx('shield');
    },
  },
  {
    id: 'earthsplitter', name: 'Разлом земли', icon: '🌋', maxLevel: 3, targeting: 'dir', range: 10, width: 3.2,
    mana: [150, 200, 250], cd: [80, 70, 60], castTime: 0.5,
    desc: () => `Раскалывает землю перед собой (10 м). Через 0.6 с враги на линии получают ${fmt([220, 340, 460])} маг. урона и оглушаются на 1.5/1.8/2.1 с.`,
    cast(g, c, aim, l) {
      const dmg = lv([220, 340, 460], l) * amp(c);
      const stun = lv([1.5, 1.8, 2.1], l);
      const start = c.pos.clone();
      const dir = aim.dir.clone();
      g.fx.line(start, dir, 10, 3.2, 0xff6a3a, 0.7);
      g.later(0.6, () => {
        for (let i = 1; i <= 10; i += 1.5) g.fx.burst(start.clone().addScaledVector(dir, i).setY(start.y + 0.3), 0x9b7653, 8, 5);
        g.fx.shake(0.5);
        const hit = new Set<number>();
        for (let i = 0.5; i <= 10; i += 1) {
          for (const t of g.enemiesNear(start.clone().addScaledVector(dir, i), 1.7, c)) {
            if (hit.has(t.id)) continue;
            hit.add(t.id);
            g.damage(c, t, dmg, 'magic');
            g.effect(t, 'stun', stun, 0, c);
          }
        }
        g.sfx('quake');
      });
    },
  },

  // ===================== СЛЕДОПЫТ =====================
  {
    id: 'arrowFan', name: 'Веер стрел', icon: '🏹', maxLevel: 4, targeting: 'dir', range: 10,
    mana: [50, 55, 60, 65], cd: [7, 6, 5.5, 5],
    desc: () => `Выпускает веер из 5 стрел. Каждая наносит ${fmt([50, 75, 100, 125])} + 50% атаки физ. урона.`,
    cast(g, c, aim, l) {
      const n = 5 + (g.hasTalent(c, 'r15a') ? 2 : 0);
      const dmg = lv([50, 75, 100, 125], l) + c.stats.damage * 0.5;
      const spread = 0.9;
      for (let i = 0; i < n; i++) {
        const a = -spread / 2 + (spread * i) / (n - 1);
        const d = aim.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        g.projectile({ owner: c, pos: up(c.pos, 1.1), dir: d, speed: 22, range: 11, radius: 0.5, color: 0xfff0c0, kind: 'arrow', onHit: (t) => g.damage(c, t, dmg, 'phys') });
      }
      g.sfx('bow');
    },
  },
  {
    id: 'trap', name: 'Капкан', icon: '🪤', maxLevel: 4, targeting: 'point', range: 9, radius: 1.4,
    mana: [60, 60, 60, 60], cd: [12, 11, 10, 9],
    desc: () => `Ставит скрытый капкан (до 3 шт.). Первый наступивший враг обездвижен на ${fmt([1.5, 2, 2.5, 3])} с и кровоточит (${fmt([20, 30, 40, 50])} урона/с).`,
    cast(g, c, aim, l) {
      const root = lv([1.5, 2, 2.5, 3], l) + (g.hasTalent(c, 'r20a') ? 1.5 : 0);
      const bleed = lv([20, 30, 40, 50], l);
      if (g.countZones(c, 'trap') >= 3) return;
      g.zone({
        owner: c, pos: aim.point.clone(), radius: 1.4, duration: 40, tick: 0.1, color: 0xc0a060, kind: 'trap', delay: 0.5,
        onTick: (targets, z) => {
          if (!targets.length) return;
          for (const t of g.enemiesNear(z.pos, 2.5, c)) {
            g.effect(t, 'root', root, 0, c);
            g.effect(t, 'bleed', 4, bleed, c);
            g.damage(c, t, bleed, 'phys');
          }
          g.fx.burst(up(z.pos, 0.3), 0xc0a060, 12, 3);
          g.sfx('trap');
          z.end();
        },
      });
    },
  },
  {
    id: 'roll', name: 'Перекат', icon: '🌀', maxLevel: 4, targeting: 'dir', range: 5,
    mana: [35, 35, 35, 35], cd: [12, 10, 8, 6],
    desc: () => `Кувырок на 5 м с уклонением от всех атак, затем +30% скорости бега на ${fmt([2, 2.5, 3, 3.5])} с и +3 заряда Меткости.`,
    cast(g, c, aim, l) {
      g.effect(c, 'rolling', 0.35, 0, c);
      g.startDash(c, aim.dir, 5, 17, undefined, () => {
        g.effect(c, 'haste', lv([2, 2.5, 3, 3.5], l), 30, c);
        g.effect(c, 'focus', 6, 0, c, 3);
      });
      g.fx.burst(up(c.pos, 0.3), 0xd8f0ff, 10, 2);
      g.sfx('dash');
    },
  },
  {
    id: 'arrowRain', name: 'Град стрел', icon: '🌧️', maxLevel: 3, targeting: 'point', range: 12, radius: 4.5,
    mana: [125, 175, 225], cd: [70, 60, 50],
    desc: () => `На 4 с обрушивает дождь стрел (радиус 4.5 м): ${fmt([45, 70, 95])} + 25% атаки физ. урона каждые 0.5 с и замедление на 35%.`,
    cast(g, c, aim, l) {
      const dmg = lv([45, 70, 95], l) + c.stats.damage * 0.25;
      const slow = g.hasTalent(c, 'r25a') ? 60 : 35;
      g.zone({
        owner: c, pos: aim.point.clone(), radius: 4.5, duration: 4, tick: 0.5, color: 0xfff0c0, kind: 'rain',
        onTick: (targets, z) => {
          for (const t of targets) {
            g.damage(c, t, dmg, 'phys');
            g.effect(t, 'slow', 1, slow, c);
          }
          for (let i = 0; i < 6; i++) {
            const p = z.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0.2, (Math.random() - 0.5) * 8));
            g.fx.burst(p, 0xfff0c0, 2, 1.5);
          }
        },
      });
      g.sfx('bow');
    },
  },

  // ===================== МИСТИК =====================
  {
    id: 'fireOrb', name: 'Огненная сфера', icon: '☄️', maxLevel: 4, targeting: 'dir', range: 11,
    mana: [60, 70, 80, 90], cd: [6, 5.5, 5, 4.5],
    desc: () => `Сфера взрывается при попадании (радиус 2.2 м): ${fmt([80, 130, 180, 230])} маг. урона и поджог ${fmt([15, 22, 30, 38])} урона/с на 3 с.`,
    cast(g, c, aim, l) {
      const dmg = lv([80, 130, 180, 230], l) * amp(c);
      const burn = lv([15, 22, 30, 38], l) * amp(c);
      const explode = (p: THREE.Vector3) => {
        for (const t of g.enemiesNear(p, 2.2, c)) {
          g.damage(c, t, dmg, 'magic');
          g.effect(t, 'burn', 3, Math.round(burn), c);
        }
        g.fx.ring(p, 2.2, 0xff7a2a, 0.35);
        g.fx.burst(p, 0xff9a3a, 22, 5);
        g.sfx('boom');
      };
      let done = false;
      g.projectile({
        owner: c, pos: up(c.pos, 1.2), dir: aim.dir, speed: 16, range: 11, radius: 0.6, color: 0xff7a2a, kind: 'orb',
        onHit: (_t, p) => { if (!done) { done = true; explode(p); } },
        onEnd: (p) => { if (!done) { done = true; explode(p); } },
      });
      g.sfx('fire');
    },
  },
  {
    id: 'frostNova', name: 'Ледяная нова', icon: '❄️', maxLevel: 4, targeting: 'none', range: 0, radius: 4.5,
    mana: [80, 80, 80, 80], cd: [12, 11, 10, 9],
    desc: () => `Волна холода вокруг (4.5 м): ${fmt([60, 100, 140, 180])} маг. урона и замедление на 40% на 2.5 с.`,
    cast(g, c, _aim, l) {
      const dmg = lv([60, 100, 140, 180], l) * amp(c);
      const freeze = g.hasTalent(c, 'm20a');
      for (const t of g.enemiesNear(c.pos, 4.5, c)) {
        g.damage(c, t, dmg, 'magic');
        g.effect(t, 'slow', 2.5, 40, c);
        if (freeze) g.effect(t, 'freeze', 1.2, 0, c);
      }
      g.fx.ring(c.pos, 4.5, 0x9ae8ff, 0.5);
      g.fx.burst(up(c.pos, 0.5), 0xd8f8ff, 30, 7);
      g.sfx('ice');
    },
  },
  {
    id: 'blink', name: 'Мерцание', icon: '✨', maxLevel: 4, targeting: 'point', range: 11,
    mana: [50, 50, 50, 50], cd: [12, 10, 8, 6],
    desc: () => `Мгновенно перемещается в точку на расстоянии до ${fmt([8, 9, 10, 11])} м.`,
    cast(g, c, aim, l) {
      const range = lv([8, 9, 10, 11], l);
      const d = Math.min(range, c.distTo(aim.point));
      const to = c.pos.clone().addScaledVector(aim.dir, d);
      g.fx.burst(up(c.pos), 0xc8a0ff, 16, 3);
      g.blink(c, to);
      g.fx.burst(up(c.pos), 0xc8a0ff, 16, 3);
      g.sfx('blink');
    },
  },
  {
    id: 'chainLightning', name: 'Цепная молния', icon: '⚡', maxLevel: 3, targeting: 'unit', range: 10,
    mana: [160, 220, 280], cd: [60, 50, 40],
    desc: () => `Молния бьёт цель (${fmt([220, 330, 440])} маг. урона) и перескакивает на 6 врагов, теряя 15% за прыжок. Каждое попадание кратко оглушает.`,
    cast(g, c, aim, l) {
      const first = aim.target ?? g.nearestEnemy(c.pos.clone().addScaledVector(aim.dir, 4), 7, c);
      if (!first) return;
      let dmg = lv([220, 330, 440], l) * amp(c);
      const bounces = 6 + (g.hasTalent(c, 'm25a') ? 3 : 0);
      const pts = [up(c.pos, 1.3)];
      const hit = new Set<number>();
      let cur: Entity | null = first;
      for (let i = 0; i <= bounces && cur; i++) {
        hit.add(cur.id);
        pts.push(up(cur.pos, 0.9));
        g.damage(c, cur, dmg, 'magic');
        g.effect(cur, 'stun', 0.3, 0, c);
        dmg *= 0.85;
        const from: Entity = cur;
        cur = g.enemiesNear(from.pos, 6, c).filter((e) => !hit.has(e.id)).sort((a, b) => a.distTo(from) - b.distTo(from))[0] ?? null;
      }
      g.fx.lightning(pts, 0xbfe8ff);
      g.sfx('zap');
    },
  },

  // ===================== МОБЫ =====================
  {
    id: 'ogreSlam', name: 'Сокрушение', icon: '🔨', maxLevel: 1, targeting: 'none', range: 0, radius: 4,
    mana: [0], cd: [7],
    desc: () => 'Удар молотом по земле',
    cast(g, c) {
      const p = c.pos.clone();
      g.zone({
        owner: c, pos: p, radius: 4, duration: 1.3, tick: 99, color: 0xff3a2a, kind: 'telegraph', delay: 1.2,
        onTick: (targets) => {
          for (const t of targets) {
            g.damage(c, t, c.stats.damage * 2.2, 'phys');
            g.effect(t, 'stun', 1, 0, c);
          }
          g.fx.ring(p, 4, 0xc0a080, 0.5);
          g.fx.burst(p.clone().setY(p.y + 0.3), 0x9b7653, 30, 6);
          g.fx.shake(0.6);
          g.sfx('quake');
        },
      });
    },
  },
  {
    id: 'toadSpit', name: 'Ядовитый плевок', icon: '🤢', maxLevel: 1, targeting: 'unit', range: 8,
    mana: [0], cd: [5],
    desc: () => 'Плюётся ядом',
    cast(g, c, aim) {
      g.projectile({
        owner: c, pos: up(c.pos, 0.6), dir: aim.dir, speed: 12, range: 9, radius: 0.5, color: 0x9ae83a, kind: 'spit', homing: aim.target,
        onHit: (t) => {
          g.damage(c, t, c.stats.damage * 0.8, 'magic');
          g.effect(t, 'poison', 4, Math.round(c.stats.damage * 0.15 + 2), c);
        },
      });
    },
  },
  {
    id: 'boarCharge', name: 'Таран', icon: '🐗', maxLevel: 1, targeting: 'dir', range: 7,
    mana: [0], cd: [8],
    desc: () => 'Бросается вперёд',
    cast(g, c, aim) {
      g.startDash(c, aim.dir, 6, 14, (t) => {
        g.damage(c, t, c.stats.damage * 1.5, 'phys');
        g.knockback(t, aim.dir, 1.5);
        g.effect(t, 'stun', 0.5, 0, c);
      });
    },
  },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
