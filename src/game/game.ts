// Главный игровой цикл: мир, игрок, мобы, бой, лут, добыча, спавн, задания, сохранения.
import * as THREE from 'three';
import { Renderer, IS_TOUCH } from '../render/renderer';
import { World } from '../world/world';
import { FX } from '../render/fx';
import { GrassField } from '../render/grass';
import { Ambient } from './ambient';
import { Input, type Action } from '../input/input';
import { Player } from './player';
import { Mob } from './mob';
import { Entity } from './entity';
import { ABILITIES, type Aim, type ProjectileOpts, type ZoneOpts } from '../combat/abilities';
import { applyEffect, updateEffects, absorbShields, hasEffect, type EffectCtx, type EffectHost } from '../combat/effects';
import { mitigate, xpToNext, type DmgType } from '../combat/stats';
import { MOBS, ELITE_AFFIXES, type MobDef } from '../data/mobs';
import { ITEMS, RARITY, type ItemGame } from '../data/items';
import { makeItem, rollGear, rollRarity, randomGearId, type ItemInst } from '../items/inventory';
import { buildStation, buildLootBag } from '../render/models';
import { HARVEST } from '../world/decoTypes';
import { Biome, BIOME_NAMES, CAMP_RADIUS, GROUND, SEA, WorldGen } from '../world/gen';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import { makeQuest, questTitle, setQidBase, type Quest } from './quests';
import type { ClassId } from '../data/classes';
import type { Appearance } from '../render/models';

export interface UIHooks {
  log(msg: string, color?: string): void;
  float(pos: THREE.Vector3, text: string, cls: string): void;
  banner(title: string, sub?: string): void;
  invChanged(): void;
  openPanel(name: string, arg?: string): void;
  closePanels(): boolean;
}

interface Projectile {
  o: ProjectileOpts;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  traveled: number;
  hit: Set<number>;
  dead: boolean;
}

interface Zone {
  o: ZoneOpts;
  t: number;
  tickT: number;
  mesh: THREE.Object3D;
  dead: boolean;
}

interface Loot {
  item: ItemInst;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  t: number;
  vy: number;
}

export interface Station {
  kind: 'workbench' | 'forge' | 'alchemy' | 'altar' | 'board' | 'campfire';
  name: string;
  pos: THREE.Vector3;
}

export const DAY_LENGTH = 600; // секунд на полный цикл

export interface SaveData {
  v: number;
  seed: number;
  time: number;
  gameTime: number;
  player: {
    name: string;
    cls: ClassId;
    appearance: Appearance;
    level: number;
    xp: number;
    sp: number;
    abil: number[];
    talents: string[];
    hp: number;
    mp: number;
    pos: [number, number, number];
    kills: number;
    auto: boolean;
  };
  inv: any;
  harvested: [string, number][];
  quests: Quest[];
  bossTimers: [string, number][];
  visited?: string[];
}

export class Game implements ItemGame, EffectCtx {
  r: Renderer;
  world: World;
  grass: GrassField;
  ambient: Ambient;
  fx: FX & { shake(a: number): void };
  input: Input;
  player: Player;
  mobs: Mob[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  loot: Loot[] = [];
  laters: { t: number; fn: () => void }[] = [];
  stations: Station[] = [];
  quests: Quest[] = [];
  bossTimers = new Map<string, number>();
  rng = new Rng((Math.random() * 1e9) | 0);
  time = 0.3; // время суток 0..1
  gameTime = 0;
  ui!: UIHooks;
  paused = false;
  private spawnT = 0;
  private saveT = 0;
  private respawnTickT = 0;
  private lootGeo = new Map<number, THREE.Mesh>();
  private projGeo: Record<string, THREE.BufferGeometry> = {
    arrow: new THREE.BoxGeometry(0.06, 0.06, 0.7),
    orb: new THREE.BoxGeometry(0.42, 0.42, 0.42),
    rock: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    spit: new THREE.BoxGeometry(0.28, 0.28, 0.28),
    bolt: new THREE.BoxGeometry(0.22, 0.22, 0.4),
  };
  visited = new Set<string>();
  zoneName = '';
  zoneLevelNow = 1;
  nearStation: Station | null = null;
  nearHarvest: ReturnType<World['findHarvestable']> = null;
  lastDamageT = 0;

  constructor(r: Renderer, input: Input, save: SaveData | null, fresh?: { name: string; cls: ClassId; appearance: Appearance; seed: number }) {
    this.r = r;
    this.input = input;
    const seed = save ? save.seed : fresh!.seed;
    this.world = new World(r.scene, seed);
    const fx = new FX(r.scene);
    fx.onShake = (a) => (r.shake = Math.max(r.shake, a));
    this.fx = fx;
    this.grass = new GrassField(r.scene, this.world);
    this.ambient = new Ambient(r.scene, this.world);

    if (save) {
      const p = save.player;
      this.player = new Player(p.cls, p.appearance, p.name);
      this.player.level = p.level;
      this.player.xp = p.xp;
      this.player.skillPoints = p.sp;
      this.player.abil = p.abil;
      this.player.talents = p.talents;
      this.player.kills = p.kills ?? 0;
      this.player.autoMode = !!p.auto;
      this.player.inv.load(save.inv);
      this.player.refreshMods();
      this.player.hp = Math.min(this.player.stats.maxHp, p.hp);
      this.player.mp = Math.min(this.player.stats.maxMp, p.mp);
      this.player.pos.set(p.pos[0], p.pos[1], p.pos[2]);
      this.time = save.time;
      this.gameTime = save.gameTime;
      this.world.time = save.gameTime;
      for (const [k, v] of save.harvested) this.world.harvested.set(k, v);
      this.quests = save.quests ?? [];
      setQidBase(Math.max(0, ...this.quests.map((q) => q.id)) + 1);
      for (const [k, v] of save.bossTimers ?? []) this.bossTimers.set(k, v);
      for (const k of save.visited ?? []) this.visited.add(k);
    } else {
      const f = fresh!;
      this.player = new Player(f.cls, f.appearance, f.name);
      for (const id of this.player.cls.startItems) {
        const it = makeItem(id, 1, 0, 1);
        this.player.inv.add(it);
      }
      // стартовое снаряжение — сразу надеть
      for (let i = 0; i < this.player.inv.bag.length; i++) {
        const it = this.player.inv.bag[i];
        if (it && ITEMS[it.id].kind === 'gear') this.player.inv.equipFromBag(i, f.cls);
      }
      const potion = this.player.inv.bag.find((x) => x?.id === 'potionHp');
      if (potion) this.player.inv.quick[0] = potion.uid;
      const mpot = this.player.inv.bag.find((x) => x?.id === 'potionMp');
      if (mpot) this.player.inv.quick[1] = mpot.uid;
      this.player.refreshMods();
      this.player.hp = this.player.stats.maxHp;
      this.player.mp = this.player.stats.maxMp;
      this.player.pos.set(0.5, GROUND + 1, 4.5);
    }
    while (this.quests.length < 3) this.quests.push(makeQuest(this.player.level, this.rng, this.quests));
    this.player.inv.onChange = () => {
      this.player.refreshMods();
      this.ui?.invChanged();
    };
    r.scene.add(this.player.rig.group);
    r.target.copy(this.player.pos);
    this.buildCamp();
  }

  // ---------------- Лагерь ----------------
  private buildCamp() {
    const y = GROUND + 1;
    const defs: [Station['kind'], string, number, number, number][] = [
      ['workbench', 'Верстак', -5, -10, 0],
      ['forge', 'Кузница', 5, -10, 0],
      ['alchemy', 'Алхимический стол', -11, 0, Math.PI / 2],
      ['altar', 'Рунный алтарь', 11, 0, -Math.PI / 2],
      ['board', 'Доска наград', 3.5, 10.5, Math.PI],
      ['campfire', 'Костёр', 0, 0, 0],
    ];
    for (const [kind, name, x, z, rot] of defs) {
      const m = buildStation(kind);
      m.position.set(x + 0.5, y, z + 0.5);
      m.rotation.y = rot;
      this.r.scene.add(m);
      this.stations.push({ kind, name, pos: new THREE.Vector3(x + 0.5, y, z + 0.5) });
    }
    const light = new THREE.PointLight(0xff9a40, 6, 14, 1.6);
    light.position.set(0.5, y + 1.2, 0.5);
    this.r.scene.add(light);
  }

  // ---------------- Утилиты ----------------
  zoneLevel(x: number, z: number): number {
    const d = Math.hypot(x, z);
    let l = 1 + Math.floor(Math.max(0, d - 35) / 34);
    const b = this.world.biomeAt(x, z);
    if (b === Biome.Snow) l += 3;
    else if (b === Biome.Desert) l += 2;
    else if (b === Biome.Swamp || b === Biome.City) l += 1;
    return Math.max(1, Math.min(30, l));
  }

  inCamp(p: THREE.Vector3, extra = 0) {
    return Math.hypot(p.x, p.z) < CAMP_RADIUS + extra;
  }

  hostile(a: Entity, b: Entity): boolean {
    if (!b.alive || a === b) return false;
    if (a.team === 'player') return b.team !== 'player';
    return b.team === 'player';
  }

  enemiesNear(pos: THREE.Vector3, radius: number, of: Entity): Entity[] {
    const out: Entity[] = [];
    const all: Entity[] = of.team === 'player' ? this.mobs : [this.player];
    for (const e of all) {
      if (!this.hostile(of, e)) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d <= radius + e.radius) out.push(e);
    }
    return out;
  }

  nearestEnemy(pos: THREE.Vector3, range: number, of: Entity, filter?: (e: Entity) => boolean): Entity | null {
    let best: Entity | null = null;
    let bd = range;
    for (const e of this.enemiesNear(pos, range, of)) {
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  hasTalent(e: Entity, id: string) {
    return e instanceof Player && e.talents.includes(id);
  }

  countZones(owner: Entity, kind: string) {
    return this.zones.filter((z) => !z.dead && z.o.owner === owner && z.o.kind === kind).length;
  }

  later(delay: number, fn: () => void) {
    this.laters.push({ t: delay, fn });
  }

  sfx(name: string) {
    sfx(name);
  }

  // ---------------- Урон и лечение ----------------
  damage(src: Entity | null, tgt: Entity | EffectHost, amount: number, type: DmgType, opts: { crit?: boolean; attack?: boolean; label?: string; dot?: boolean; reflected?: boolean } = {}): number {
    const t = tgt as Entity;
    if (!t.alive || amount <= 0) return 0;
    let dmg = mitigate(amount, type, t.stats);
    dmg = absorbShields(t, dmg);
    t.hp -= dmg;
    t.lastAttacker = src;
    if (t === this.player) this.lastDamageT = this.gameTime;
    if (!opts.dot) t.rig.hit();
    // всплывающие цифры
    const shown = Math.round(dmg);
    if (shown > 0 || !opts.dot) {
      const pos = t.pos.clone().setY(t.pos.y + t.rig.height * t.rig.baseScale + 0.3);
      let cls = t === this.player ? 'dmg-in' : type === 'magic' ? 'dmg-mag' : type === 'pure' ? 'dmg-pure' : 'dmg';
      if (opts.crit) cls += ' crit';
      if (opts.dot) cls += ' dot';
      this.ui.float(pos, shown > 0 ? String(shown) : 'Блок', cls);
    }
    if (src && src.alive && opts.attack && src.stats.lifesteal > 0) this.heal(src, (dmg * src.stats.lifesteal) / 100, true);
    if (src && src.alive && !opts.reflected && type !== 'pure' && t.stats.thorns > 0 && !opts.dot) {
      this.damage(t, src, (amount * t.stats.thorns) / 100, 'pure', { reflected: true });
    }
    if (t instanceof Mob && src) this.aggro(t, src);
    if (t.hp <= 0) this.kill(t, src);
    return dmg;
  }

  heal(tgt: Entity | EffectHost, amount: number, quiet = false) {
    const t = tgt as Entity;
    if (!t.alive) return;
    const a = amount * (1 + t.stats.healAmp / 100);
    const before = t.hp;
    t.hp = Math.min(t.stats.maxHp, t.hp + Math.max(0, a));
    const got = Math.round(t.hp - before);
    if (!quiet && got > 0) this.ui.float(t.pos.clone().setY(t.pos.y + t.rig.height + 0.2), '+' + got, 'heal');
  }

  effect(tgt: Entity, id: string, dur: number, value = 0, src: Entity | null = null, stacks = 1) {
    if (!tgt.alive) return;
    if (tgt.isBoss && (id === 'stun' || id === 'freeze' || id === 'root')) dur *= 0.5;
    const inst = applyEffect(tgt, id, dur, value, src, stacks);
    if (inst) tgt.recalc();
    else if (tgt.stats.ccImmune > 0) this.ui.float(tgt.pos.clone().setY(tgt.pos.y + tgt.rig.height + 0.4), 'Иммунитет', 'info');
  }

  knockback(t: Entity, dir: THREE.Vector3, dist: number) {
    if (t.isBoss || !t.alive) return;
    t.knock.addScaledVector(dir.clone().setY(0).normalize(), dist * 6);
  }

  startDash(e: Entity, dir: THREE.Vector3, dist: number, speed: number, onHit?: (t: Entity) => void, onEnd?: () => void) {
    e.dash = { dir: dir.clone().setY(0).normalize(), remaining: dist, speed, hit: new Set(), onHit, onEnd };
  }

  blink(e: Entity, to: THREE.Vector3) {
    const dir = to.clone().sub(e.pos).setY(0);
    const len = dir.length();
    if (len < 0.01) return;
    dir.normalize();
    for (let d = len; d >= 0; d -= 0.5) {
      const x = e.pos.x + dir.x * d,
        z = e.pos.z + dir.z * d;
      const h = this.world.heightAt(x, z);
      if (h === null || h < SEA - 1) continue;
      if (!this.world.canStand(h, x, z, e.radius)) continue;
      e.pos.set(x, h, z);
      e.faceTo(e.pos.clone().add(dir));
      return;
    }
  }

  projectile(o: ProjectileOpts) {
    const mat = new THREE.MeshBasicMaterial({ color: o.color, toneMapped: false });
    const mesh = new THREE.Mesh(this.projGeo[o.kind], mat);
    mesh.position.copy(o.pos);
    this.r.scene.add(mesh);
    this.projectiles.push({ o, mesh, pos: o.pos.clone(), dir: o.dir.clone().setY(0).normalize(), traveled: 0, hit: new Set(), dead: false });
  }

  zone(o: ZoneOpts) {
    const opacity = o.kind === 'trap' ? 0.35 : o.kind === 'telegraph' ? 0.18 : 0.15;
    const mesh = this.fx.zoneMesh(o.radius, o.color, opacity);
    mesh.position.copy(o.pos).setY(o.pos.y + 0.06);
    this.zones.push({ o, t: 0, tickT: 0, mesh, dead: false });
  }

  returnToCamp(p: Entity) {
    this.ui.log('Свиток вспыхивает… Вы переноситесь в лагерь.', '#ffd76a');
    this.fx.burst(p.pos.clone().setY(p.pos.y + 1), 0xffd76a, 20, 3);
    p.pos.set(0.5, GROUND + 1, 4.5);
    this.fx.burst(p.pos.clone().setY(p.pos.y + 1), 0xffd76a, 20, 3);
    this.sfx('blink');
  }

  /** Направление прицела для предметов (бомба, фазовый камень) */
  aimDir(p: Entity): { dir: THREE.Vector3; target: Entity | null } {
    if (!IS_TOUCH && this.input.mouse.has) {
      const pt = this.r.screenToGround(this.input.mouse.x, this.input.mouse.y, p.pos.y);
      if (pt) {
        const dir = pt.sub(p.pos).setY(0);
        if (dir.lengthSq() > 0.01) return { dir: dir.normalize(), target: this.nearestEnemy(p.pos.clone().add(dir.clone().multiplyScalar(6)), 3, p) };
      }
    }
    const t = this.nearestEnemy(p.pos, 10, p);
    if (t) return { dir: t.pos.clone().sub(p.pos).setY(0).normalize(), target: t };
    if (this.input.move.x || this.input.move.z) return { dir: new THREE.Vector3(this.input.move.x, 0, this.input.move.z).normalize(), target: null };
    return { dir: p.forward(), target: null };
  }

  // ---------------- Смерть, опыт, лут ----------------
  private kill(t: Entity, src: Entity | null) {
    if (!t.alive) return;
    t.alive = false;
    t.deadT = 0;
    t.hp = 0;
    t.effects = [];
    t.dash = null;
    if (t === this.player) {
      this.player.respawnT = 6;
      this.ui.log('Вы пали в бою… Возрождение в лагере.', '#ff6a5a');
      this.ui.banner('Вы погибли', 'Возрождение через несколько секунд');
      this.sfx('death');
      // потеря части опыта текущего уровня
      this.player.xp = Math.floor(this.player.xp * 0.85);
      return;
    }
    if (!(t instanceof Mob)) return;
    this.sfx('death');
    const p = this.player;
    if (p.alive && (src === p || p.distTo(t) < 30)) {
      let xp = t.xpValue;
      const diff = p.level - t.level;
      if (diff > 4) xp = Math.round(xp * Math.max(0.15, 1 - (diff - 4) * 0.2));
      this.gainXp(xp, t.pos);
      p.kills++;
      for (const q of this.quests) if ((q.kind === 'kill' && q.target === t.def.id) || (q.kind === 'boss' && t.def.id === q.target)) this.progressQuest(q, 1);
    }
    if (t.isBoss) {
      this.ui.banner('Босс повержен!', t.name);
      this.ui.log(`${t.name} повержен! Великая победа.`, '#ffa53a');
      this.sfx('boss');
      if (t.colossusKey) this.bossTimers.set(t.colossusKey, this.gameTime + 300);
    } else if (t.isElite) this.ui.log(`Элитный враг повержен: ${t.name}`, '#ffd76a');
    this.dropLoot(t);
    if (t.def.splitInto) {
      for (let i = 0; i < 2; i++) {
        const m = this.spawnMob(t.def.splitInto, t.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5)), t.level);
        if (m && p.alive) {
          m.aggroTarget = p;
          m.state = 'chase';
        }
      }
    }
  }

  gainXp(xp: number, at?: THREE.Vector3) {
    const p = this.player;
    if (at) this.ui.float(at.clone().setY(at.y + 2), `+${xp} опыта`, 'xp');
    const ups = p.addXp(xp);
    if (ups) {
      this.ui.banner(`Уровень ${p.level}!`, p.pendingTalentTier() >= 0 ? 'Доступен новый талант' : 'Получено очко способностей');
      this.ui.log(`Новый уровень: ${p.level}. Очков способностей: ${p.skillPoints}.`, '#7ae0ff');
      this.fx.burst(p.pos.clone().setY(p.pos.y + 1), 0xffe08a, 40, 5);
      this.fx.ring(p.pos, 2.5, 0xffe08a, 0.8);
      this.sfx('levelup');
    }
  }

  private dropLoot(m: Mob) {
    const def = m.def;
    const items: ItemInst[] = [];
    for (const [id, ch, mn, mx] of def.loot) if (this.rng.chance(ch)) items.push(makeItem(id, this.rng.int(mn, mx)));
    if (m.isElite) {
      if (this.rng.chance(0.7)) items.push(makeItem('essence', 1));
    }
    let gearRolls = this.rng.chance(def.gearChance + (m.isElite ? 0.5 : 0)) ? 1 : 0;
    if (m.isBoss) gearRolls = 2;
    for (let i = 0; i < gearRolls; i++) {
      const id = randomGearId(this.rng, this.player.cls.id, m.level);
      const rarity = Math.max(m.isBoss ? 3 : m.isElite ? 1 : 0, rollRarity(this.rng, m.isBoss ? 0.2 : m.isElite ? 0.08 : 0));
      items.push(rollGear(id, m.level, rarity, this.rng));
    }
    if (this.rng.chance(0.06)) items.push(makeItem(this.rng.pick(['potionHp', 'potionMp', 'berry']), 1));
    for (const it of items) this.spawnLoot(it, m.pos);
  }

  spawnLoot(it: ItemInst, at: THREE.Vector3) {
    const color = it.rarity > 0 ? parseInt(RARITY[it.rarity].color.slice(1), 16) : ITEMS[it.id].kind === 'material' ? 0xc9a46a : 0xffffff;
    let proto = this.lootGeo.get(color);
    if (!proto) {
      proto = buildLootBag(color);
      this.lootGeo.set(color, proto);
    }
    const mesh = proto.clone();
    if (it.rarity >= 2) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, toneMapped: false }));
      beam.position.y = 1.3;
      mesh.add(beam);
    }
    const pos = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.5, (Math.random() - 0.5) * 1.6));
    mesh.position.copy(pos);
    this.r.scene.add(mesh);
    this.loot.push({ item: it, mesh, pos, t: 0, vy: 3 });
  }

  // ---------------- Задания ----------------
  progressQuest(q: Quest, n: number) {
    if (q.have >= q.need) return;
    q.have = Math.min(q.need, q.have + n);
    if (q.have >= q.need) {
      this.ui.banner('Задание выполнено!', questTitle(q));
      this.ui.log(`Задание «${questTitle(q)}» выполнено. Награда: ${q.xp} опыта и ${q.reward.map(([id, c]) => ITEMS[id].icon + '×' + c).join(' ')}`, '#8aff8a');
      this.sfx('quest');
      this.gainXp(q.xp);
      for (const [id, c] of q.reward) {
        const left = this.player.inv.addId(id, c);
        if (left > 0) this.spawnLoot(makeItem(id, left), this.player.pos);
      }
      this.later(2.5, () => {
        const i = this.quests.indexOf(q);
        if (i >= 0) this.quests[i] = makeQuest(this.player.level, this.rng, this.quests);
      });
    }
  }

  onGather(id: string, qty: number) {
    for (const q of this.quests) if (q.kind === 'gather' && q.target === id) this.progressQuest(q, qty);
  }
  onCraft() {
    for (const q of this.quests) if (q.kind === 'craft') this.progressQuest(q, 1);
  }

  // ---------------- Спавн ----------------
  spawnMob(id: string, pos: THREE.Vector3, level: number, elite: (typeof ELITE_AFFIXES)[number] | null = null): Mob | null {
    const m = new Mob(id, level, elite);
    m.pos.copy(pos);
    m.home.copy(pos);
    m.facing = Math.random() * Math.PI * 2;
    this.mobs.push(m);
    this.r.scene.add(m.rig.group);
    return m;
  }

  private spawnTick() {
    const p = this.player;
    const night = this.r.dayFactor < 0.35;
    const near = this.mobs.filter((m) => m.alive && m.distTo(p) < 50 && !m.isBoss);
    const cap = (IS_TOUCH ? 10 : 14) + (night ? 4 : 0);
    // деспавн далёких
    for (const m of this.mobs) if (m.distTo(p) > 70 && !(m.isBoss && m.distTo(p) < 90)) m.removeMe = true;

    if (near.length < cap) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 16;
      const x = p.pos.x + Math.cos(ang) * dist,
        z = p.pos.z + Math.sin(ang) * dist;
      if (Math.hypot(x, z) > CAMP_RADIUS + 14 && this.world.isLoaded(x, z)) {
        const biome = this.world.biomeAt(x, z);
        const lvl = this.zoneLevel(x, z);
        const cands: { w: number; v: MobDef }[] = [];
        for (const d of Object.values(MOBS)) {
          if (!d.biomes.includes(biome) || (d.minLevel ?? 1) > lvl) continue;
          let w = d.weight;
          if (d.night && night) w *= 2.5;
          if (d.team === 'passive' && night) w *= 0.4;
          cands.push({ w, v: d });
        }
        if (cands.length) {
          const def = this.rng.weighted(cands);
          const n = this.rng.int(def.pack[0], def.pack[1]);
          const elite = def.team === 'enemy' && this.rng.chance(0.08 + (night ? 0.05 : 0)) ? this.rng.pick(ELITE_AFFIXES) : null;
          for (let i = 0; i < n; i++) {
            const sp = this.world.findSpawnPoint(x, z, 8);
            if (!sp) continue;
            this.spawnMob(def.id, sp, Math.min(30, lvl + this.rng.int(0, 1)), i === 0 ? elite : null);
          }
        }
      }
    }

    // Боссы у Колоссов
    for (const c of this.world.gen.colossiNear(p.pos.x, p.pos.z)) {
      const key = `${c.x},${c.z}`;
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d > 75) continue;
      if (this.mobs.some((m) => m.colossusKey === key && m.alive)) continue;
      if ((this.bossTimers.get(key) ?? 0) > this.gameTime) continue;
      const bx = c.rot === 0 ? c.x : c.x - 14;
      const bz = c.rot === 0 ? c.z + 15 : c.z;
      if (!this.world.isLoaded(bx, bz)) continue;
      const sp = this.world.findSpawnPoint(bx, bz, 12);
      if (!sp) continue;
      const lvl = Math.max(5, this.zoneLevel(c.x, c.z) + 3);
      const m = this.spawnMob('ogre', sp, lvl);
      if (m) {
        m.colossusKey = key;
        this.bossTimers.set(key, 0);
      }
    }
  }

  /** Ближайший живой босс (для трекера) */
  nearestBoss(): { mob: Mob | null; dist: number; level: number; colossus: { x: number; z: number } | null } {
    const p = this.player;
    let best: Mob | null = null;
    for (const m of this.mobs) if (m.isBoss && m.alive && (!best || m.distTo(p) < best.distTo(p))) best = m;
    let col: { x: number; z: number } | null = null;
    let cd = Infinity;
    for (const c of this.world.gen.colossiNear(p.pos.x, p.pos.z)) {
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < cd) {
        cd = d;
        col = c;
      }
    }
    const level = col ? Math.max(5, this.zoneLevel(col.x, col.z) + 3) : 0;
    return { mob: best, dist: best ? best.distTo(p) : cd, level: best ? best.level : level, colossus: col };
  }

  // ---------------- Перемещение ----------------
  private moveEntity(e: Entity, dx: number, dz: number, dt: number) {
    const w = this.world;
    const r = e.radius * 0.8;
    const nx = e.pos.x + dx,
      nz = e.pos.z + dz;
    const blockCamp = e instanceof Mob && e.team === 'enemy' && this.inCamp(new THREE.Vector3(nx, 0, nz), 2);
    if (!blockCamp) {
      if (w.canStand(e.pos.y, nx, nz, r)) {
        e.pos.x = nx;
        e.pos.z = nz;
      } else if (dx && w.canStand(e.pos.y, nx, e.pos.z, r)) e.pos.x = nx;
      else if (dz && w.canStand(e.pos.y, e.pos.x, nz, r)) e.pos.z = nz;
    }
    this.settle(e, dt);
  }

  /** Привязка к земле: подъём на ступеньку и падение */
  private settle(e: Entity, dt: number) {
    const h = this.world.heightAt(e.pos.x, e.pos.z);
    if (h === null) return;
    const ground = h < SEA ? Math.max(h, SEA - 0.9) : h;
    if (ground > e.pos.y) e.pos.y = Math.min(ground, e.pos.y + dt * 14);
    else if (ground < e.pos.y) e.pos.y = Math.max(ground, e.pos.y - dt * 16);
  }

  private physics(e: Entity, dt: number) {
    this.settle(e, dt);
    if (e.dash) {
      const d = e.dash;
      const step = Math.min(d.remaining, d.speed * dt);
      const bx = e.pos.x,
        bz = e.pos.z;
      this.moveEntity(e, d.dir.x * step, d.dir.z * step, dt);
      const moved = Math.hypot(e.pos.x - bx, e.pos.z - bz);
      d.remaining -= step;
      e.facing = Math.atan2(d.dir.x, d.dir.z);
      e.moving = true;
      if (d.onHit)
        for (const t of this.enemiesNear(e.pos, 1.3, e)) {
          if (d.hit.has(t.id)) continue;
          d.hit.add(t.id);
          d.onHit(t);
        }
      if (d.remaining <= 0.01 || moved < step * 0.3) {
        e.dash = null;
        d.onEnd?.();
      }
    }
    if (e.knock.lengthSq() > 0.01) {
      this.moveEntity(e, e.knock.x * dt, e.knock.z * dt, dt);
      e.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    }
  }

  // ---------------- Бой: атака ----------------
  private tryAttack(a: Entity, t: Entity): boolean {
    if (a.attackCd > 0 || a.stunned || !t.alive) return false;
    a.attackCd = 1 / a.stats.attackRate;
    a.attackAnim = 0;
    a.faceTo(t.pos);
    const ranged = a instanceof Player ? a.cls.ranged : false;
    if (ranged) {
      const isMystic = (a as Player).cls.id === 'mystic';
      this.projectile({
        owner: a, pos: a.pos.clone().setY(a.pos.y + 1.1), dir: t.pos.clone().sub(a.pos), speed: isMystic ? 15 : 24, range: a.stats.attackRange + 4, radius: 0.45,
        color: isMystic ? 0x8ae8ff : 0xfff0c0, kind: isMystic ? 'bolt' : 'arrow', homing: t,
        onHit: (tt) => this.attackHit(a, tt),
      });
      this.sfx(isMystic ? 'blink' : 'bow');
    } else {
      this.sfx('swing');
      if (a === this.player) {
        const glow = [0xfff4d8, 0x9aff9a, 0x8ac8ff, 0xd08aff, 0xffb050][this.player.crig.weaponRarity] ?? 0xfff4d8;
        this.later(0.08, () => this.fx.slash(a.pos, a.facing, glow));
      }
      this.later(0.16, () => {
        if (a.alive && t.alive && a.distTo(t) <= a.stats.attackRange + t.radius + 0.8) this.attackHit(a, t);
      });
    }
    return true;
  }

  private attackHit(a: Entity, t: Entity) {
    if (!t.alive) return;
    if (t.stats.evasion > 0 && Math.random() * 100 < t.stats.evasion) {
      this.ui.float(t.pos.clone().setY(t.pos.y + t.rig.height + 0.3), 'Промах', 'info');
      return;
    }
    let dmg = a.stats.damage * (0.92 + Math.random() * 0.16);
    let crit = Math.random() * 100 < a.stats.critChance;
    a.attackCount++;
    if (a instanceof Player) {
      if (a.cls.id === 'warden' && a.attackCount % 4 === 0) {
        dmg *= 1.5;
        this.effect(t, 'stun', 0.6, 0, a);
        this.fx.burst(t.pos.clone().setY(t.pos.y + 1), 0xffe08a, 8, 3);
      }
      if (a.cls.id === 'ranger') {
        if (a.focus !== t) a.effects = a.effects.filter((e) => e.def.id !== 'focus');
        a.focus = t;
        this.effect(a, 'focus', 4, 0, a, 1);
      }
      a.focus = t;
    }
    if (crit) dmg *= a.stats.critMult;
    this.damage(a, t, dmg, 'phys', { attack: true, crit });
    this.sfx(crit ? 'crit' : 'hit');
    this.fx.burst(t.pos.clone().setY(t.pos.y + t.rig.height * 0.6), crit ? 0xffd040 : 0xffffff, crit ? 10 : 5, 2.5);
    if (a instanceof Mob) {
      for (const oh of [a.def.onHit, a.elite?.onHit]) if (oh && Math.random() < oh.chance) this.effect(t, oh.effect, oh.dur, oh.value + a.level, a);
    }
  }

  private aggro(m: Mob, src: Entity) {
    if (!m.alive) return;
    if (m.team === 'passive') {
      m.state = 'flee';
      m.stateT = 4;
      m.aggroTarget = src;
      return;
    }
    if (src.team === 'player') {
      m.aggroTarget = src;
      m.state = 'chase';
      // стая помогает
      for (const o of this.mobs) if (o !== m && o.alive && o.def.id === m.def.id && o.distTo(m) < 9 && o.state !== 'chase') this.aggro(o, src);
    }
  }

  // ---------------- Способности игрока ----------------
  castAbility(slot: number, aimIn: { dx: number; dz: number; k: number } | null, mouse = false): boolean {
    const p = this.player;
    if (!p.alive) return false;
    const def = p.ability(slot);
    const lvl = p.abil[slot];
    const fail = (msg: string) => {
      this.ui.float(p.pos.clone().setY(p.pos.y + 2.4), msg, 'info');
      this.sfx('error');
      return false;
    };
    if (lvl <= 0) return fail('Не изучено');
    if (p.cds[slot] > 0) return fail('Перезарядка');
    if (p.silenced) return fail('Немота');
    const res = p.cls.id === 'mystic' ? p.effects.find((e) => e.def.id === 'resonance') : undefined;
    const free = !!res && res.stacks >= 3;
    const cost = def.mana[Math.min(def.mana.length - 1, lvl - 1)];
    if (!free && p.mp < cost) return fail('Мало маны');

    // Разрешение прицела
    const aim: Aim = { dir: p.forward(), point: p.pos.clone(), target: null };
    if (aimIn) {
      aim.dir.set(aimIn.dx, 0, aimIn.dz).normalize();
      aim.point.copy(p.pos).addScaledVector(aim.dir, Math.max(1, def.range * aimIn.k));
      aim.target = this.nearestEnemy(def.targeting === 'unit' ? aim.point : p.pos.clone().addScaledVector(aim.dir, Math.min(def.range, 4)), def.targeting === 'unit' ? 3 : def.range, p, (e) => {
        const v = e.pos.clone().sub(p.pos).setY(0).normalize();
        return v.dot(aim.dir) > 0.6;
      });
    } else if (mouse && !IS_TOUCH && this.input.mouse.has) {
      const pt = this.r.screenToGround(this.input.mouse.x, this.input.mouse.y, p.pos.y);
      if (pt) {
        const d = pt.clone().sub(p.pos).setY(0);
        if (d.lengthSq() > 0.01) aim.dir.copy(d).normalize();
        aim.point.copy(pt);
        aim.target = this.nearestEnemy(pt, 2.5, p);
      }
    } else {
      const t = (p.focus && p.focus.alive && p.distTo(p.focus) < def.range + 3 ? p.focus : null) ?? this.nearestEnemy(p.pos, Math.max(def.range, 4) + 3, p, (e) => e.team === 'enemy' || e === p.focus);
      if (t) {
        aim.target = t;
        aim.dir.copy(t.pos).sub(p.pos).setY(0).normalize();
        aim.point.copy(t.pos);
      } else {
        if (this.input.move.x || this.input.move.z) aim.dir.set(this.input.move.x, 0, this.input.move.z).normalize();
        aim.point.copy(p.pos).addScaledVector(aim.dir, def.range * 0.7);
      }
    }
    // ограничение дальности
    const dd = p.distTo(aim.point);
    if (dd > def.range && def.range > 0) aim.point.copy(p.pos).addScaledVector(aim.dir, def.range);
    if (def.targeting === 'unit' && (!aim.target || p.distTo(aim.target) > def.range + 2)) {
      const alt = this.nearestEnemy(p.pos, def.range + 1, p);
      if (!alt && def.id === 'chainLightning') return fail('Нет цели');
      if (alt) {
        aim.target = alt;
        aim.dir.copy(alt.pos).sub(p.pos).setY(0).normalize();
      }
    }
    if (def.targeting === 'point') aim.point.y = this.world.heightAt(aim.point.x, aim.point.z) ?? p.pos.y;

    // оплата
    if (free) {
      p.effects = p.effects.filter((e) => e.def.id !== 'resonance');
      this.ui.float(p.pos.clone().setY(p.pos.y + 2.6), 'Резонанс!', 'info');
    } else p.mp -= cost;
    let cd = def.cd[Math.min(def.cd.length - 1, lvl - 1)];
    if (def.id === 'earthsplitter' && p.talents.includes('w25a')) cd -= 30;
    if (def.id === 'blink' && p.talents.includes('m15a')) cd -= 3;
    p.cds[slot] = Math.max(0.5, cd * (1 - p.stats.cdr / 100));
    p.castAnim = 0;
    p.faceTo(p.pos.clone().add(aim.dir));
    p.harvest = null;
    def.cast(this, p, aim, lvl);
    if (p.cls.id === 'mystic' && !free) this.effect(p, 'resonance', 30, 0, p, 1);
    return true;
  }

  useQuickItem(slot: number) {
    const p = this.player;
    const uid = p.inv.quick[slot];
    if (uid == null) return;
    const found = p.inv.findUid(uid);
    if (!found) {
      // предмет закончился — ищем такой же по id в сумке не получится без id; очищаем слот
      p.inv.quick[slot] = null;
      return;
    }
    this.useItem(found.item);
  }

  useItem(it: ItemInst): boolean {
    const p = this.player;
    if (!p.alive) return false;
    const def = ITEMS[it.id];
    if (def.use) {
      if ((p.itemCds[def.id] ?? 0) > 0) return false;
      if (def.use(this, p)) {
        p.itemCds[def.id] = 1;
        const quickIdx = p.inv.quick.indexOf(it.uid);
        it.qty--;
        if (it.qty <= 0) {
          const f = p.inv.findUid(it.uid);
          if (f && f.where === 'bag') p.inv.bag[f.key as number] = null;
          // переназначаем быстрый слот на другой стак того же предмета
          if (quickIdx >= 0) {
            const other = p.inv.bag.find((x) => x && x.id === it.id);
            p.inv.quick[quickIdx] = other ? other.uid : null;
          }
        }
        p.inv.onChange();
        return true;
      }
    } else if (def.active) {
      const f = p.inv.findUid(it.uid);
      if (!f || f.where !== 'equip') {
        this.ui.log('Наденьте предмет, чтобы использовать его способность.', '#ffb070');
        return false;
      }
      const cd = p.itemCds[def.id] ?? 0;
      if (cd > 0) {
        this.ui.float(p.pos.clone().setY(p.pos.y + 2.4), `КД ${Math.ceil(cd)} с`, 'info');
        return false;
      }
      if (def.active.use(this, p)) {
        p.itemCds[def.id] = def.active.cd * (1 - p.stats.cdr / 100);
        return true;
      }
    }
    return false;
  }

  interact() {
    const p = this.player;
    if (!p.alive) return;
    if (this.nearStation) {
      const k = this.nearStation.kind;
      if (k === 'board') this.ui.openPanel('quests');
      else if (k === 'campfire') {
        this.heal(p, p.stats.maxHp);
        p.mp = p.stats.maxMp;
        this.ui.log('Вы отдыхаете у костра. Силы восстановлены, игра сохранена.', '#ffd76a');
        this.save();
      } else this.ui.openPanel('craft', k);
      return;
    }
    const h = this.world.findHarvestable(p.pos, 2.6);
    if (h) {
      p.harvest = { key: h.key, t: 0, hits: 0 };
      p.faceTo(h.pos);
    }
  }

  private updateHarvest(dt: number) {
    const p = this.player;
    if (!p.harvest) return;
    const h = this.world.findHarvestable(p.pos, 2.8);
    if (!h || h.key !== p.harvest.key) {
      p.harvest = null;
      return;
    }
    const hv = HARVEST[h.type]!;
    p.harvest.t -= dt;
    if (p.harvest.t <= 0) {
      p.harvest.t = 0.45;
      p.harvest.hits++;
      p.attackAnim = 0;
      p.faceTo(h.pos);
      this.sfx('harvest');
      this.fx.burst(h.pos.clone().setY(h.pos.y + 0.8), 0xc9a46a, 6, 2.5);
      if (p.harvest.hits >= hv.hits) {
        const got: string[] = [];
        for (const d of hv.drops) {
          if (d.chance !== undefined && Math.random() > d.chance) continue;
          const q = this.rng.int(d.min, d.max);
          if (q <= 0) continue;
          const left = p.inv.addId(d.id, q);
          if (left > 0) this.spawnLoot(makeItem(d.id, left), p.pos);
          got.push(`+${q} ${ITEMS[d.id].icon}`);
          this.onGather(d.id, q);
        }
        if (hv.loot) {
          const lvl = this.zoneLevel(h.pos.x, h.pos.z);
          const n = 1 + (this.rng.chance(0.35) ? 1 : 0);
          for (let i = 0; i < n; i++) this.spawnLoot(rollGear(randomGearId(this.rng, p.cls.id, lvl), lvl, Math.max(1, rollRarity(this.rng, 0.12)), this.rng), h.pos);
          this.ui.log('Сундук открыт! Внутри что-то блестит…', '#ffd76a');
          this.fx.burst(h.pos.clone().setY(h.pos.y + 0.8), 0xffd76a, 24, 3);
        }
        if (got.length) this.ui.float(h.pos.clone().setY(h.pos.y + 1.6), got.join(' '), 'loot');
        this.world.harvest(h);
        this.gainXp(2 + Math.floor(p.level / 3));
        p.harvest = null;
      }
    }
  }

  // ---------------- Обновление игрока ----------------
  private updatePlayer(dt: number) {
    const p = this.player;
    const inp = this.input;
    if (!p.alive) {
      p.deadT += dt;
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        p.alive = true;
        p.deadT = 0;
        p.rig.group.scale.setScalar(1);
        p.rig.root.rotation.set(0, 0, 0);
        p.pos.set(0.5, GROUND + 1, 4.5);
        p.recalc();
        p.hp = p.stats.maxHp;
        p.mp = p.stats.maxMp;
        this.ui.log('Вы очнулись у костра в лагере.', '#ffd76a');
      }
      return;
    }
    for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
    for (const k in p.itemCds) p.itemCds[k] = Math.max(0, p.itemCds[k] - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    if (p.attackAnim >= 0) p.attackAnim = p.attackAnim + dt * 2.6 > 1 ? -1 : p.attackAnim + dt * 2.6;
    if (p.castAnim >= 0) p.castAnim = p.castAnim + dt * 2.5 > 1 ? -1 : p.castAnim + dt * 2.5;
    // реген
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.hpRegen * dt * (this.inCamp(p.pos) ? 4 : 1));
    p.mp = Math.min(p.stats.maxMp, p.mp + p.stats.mpRegen * dt * (this.inCamp(p.pos) ? 4 : 1));

    let mvx = inp.move.x,
      mvz = inp.move.z;
    const stunned = p.stunned;
    p.moving = false;
    if (p.dash) return;

    // цель атаки
    let target: Entity | null = null;
    const wantsAttack = inp.attackHeld;
    if (wantsAttack || (p.autoMode && !mvx && !mvz)) {
      if (wantsAttack && !IS_TOUCH && inp.mouse.has) {
        const pt = this.r.screenToGround(inp.mouse.x, inp.mouse.y, p.pos.y);
        if (pt) target = this.nearestEnemy(pt, 3, p);
      }
      if (!target && p.focus && p.focus.alive && p.distTo(p.focus) < 14) target = p.focus;
      if (!target) target = this.nearestEnemy(p.pos, p.autoMode ? 14 : p.stats.attackRange + 5, p, (e) => e.team === 'enemy' || wantsAttack || e.lastAttacker === p);
      if (!target && wantsAttack) {
        const h = this.world.findHarvestable(p.pos, 2.6);
        if (h && !p.harvest) {
          p.harvest = { key: h.key, t: 0, hits: 0 };
          p.faceTo(h.pos);
        }
      }
    }
    if (p.autoMode && !mvx && !mvz && target) this.autoCast(target);
    if (p.autoMode && !mvx && !mvz && p.hp < p.stats.maxHp * 0.3) {
      const slot = p.inv.quick.findIndex((uid) => uid != null && p.inv.findUid(uid)?.item.id === 'potionHp');
      if (slot >= 0 && (p.itemCds['potionHp'] ?? 0) <= 0) this.useQuickItem(slot);
    }

    if (!stunned) {
      if (mvx || mvz) {
        p.harvest = null;
        if (!p.rooted) {
          const sp = p.stats.moveSpeed * dt;
          this.moveEntity(p, mvx * sp, mvz * sp, dt);
          p.moving = true;
        }
        p.facing = Math.atan2(mvx, mvz);
      } else if (target) {
        p.harvest = null;
        const d = p.distTo(target);
        const range = p.stats.attackRange + target.radius;
        if (d > range) {
          if (!p.rooted) {
            const dir = target.pos.clone().sub(p.pos).setY(0).normalize();
            const sp = p.stats.moveSpeed * dt;
            this.moveEntity(p, dir.x * sp, dir.z * sp, dt);
            p.moving = true;
            p.faceTo(target.pos);
          }
        } else this.tryAttack(p, target);
      }
    }
    if (!stunned && !p.moving) this.updateHarvest(dt);
  }

  private autoCast(target: Entity) {
    const p = this.player;
    if (p.silenced) return;
    const near = this.enemiesNear(p.pos, 6, p).length;
    for (let s = 0; s < 4; s++) {
      if (p.abil[s] <= 0 || p.cds[s] > 0) continue;
      const def = p.ability(s);
      const cost = def.mana[Math.min(def.mana.length - 1, p.abil[s] - 1)];
      if (p.mp < cost) continue;
      if (s === 3 && !(target.isBoss || target.isElite || near >= 3)) continue;
      if (def.id === 'blink' || def.id === 'roll') continue; // мобильность оставляем игроку
      if (def.id === 'spikedShell' && p.hp > p.stats.maxHp * 0.8) continue;
      const d = p.distTo(target);
      if (def.targeting !== 'none' && d > def.range + 1) continue;
      if (def.targeting === 'none' && def.radius && d > def.radius) continue;
      const dir = target.pos.clone().sub(p.pos).setY(0).normalize();
      if (this.castAbility(s, { dx: dir.x, dz: dir.z, k: Math.min(1, d / Math.max(1, def.range)) })) return;
    }
  }

  // ---------------- ИИ мобов ----------------
  private updateMob(m: Mob, dt: number) {
    if (!m.alive) {
      m.deadT += dt;
      if (m.deadT > 1.6) m.removeMe = true;
      return;
    }
    m.attackCd = Math.max(0, m.attackCd - dt);
    m.abilityCd = Math.max(0, m.abilityCd - dt);
    if (m.attackAnim >= 0) m.attackAnim = m.attackAnim + dt * 2.5 > 1 ? -1 : m.attackAnim + dt * 2.5;
    if (m.hp < m.stats.maxHp) m.hp = Math.min(m.stats.maxHp, m.hp + m.stats.hpRegen * dt * (m.state === 'return' ? 15 : 1));
    m.moving = false;
    if (m.dash) return;
    if (m.stunned) return;
    const p = this.player;
    const night = this.r.dayFactor < 0.35;

    if (m.isBoss && !m.enraged && m.hp < m.stats.maxHp * 0.5) {
      m.enraged = true;
      this.effect(m, 'enrage', 999, 0, m);
      this.ui.log(`${m.name} впадает в бешенство!`, '#ff6a5a');
      this.fx.burst(m.pos.clone().setY(m.pos.y + 2), 0xff3a2a, 30, 4);
    }

    const go = (to: THREE.Vector3, speedMul = 1) => {
      if (m.rooted) return;
      const dir = to.clone().sub(m.pos).setY(0);
      const len = dir.length();
      if (len < 0.2) return;
      dir.divideScalar(len);
      const sp = m.stats.moveSpeed * speedMul * dt;
      this.moveEntity(m, dir.x * sp, dir.z * sp, dt);
      m.facing = Math.atan2(dir.x, dir.z);
      m.moving = true;
    };

    switch (m.state) {
      case 'idle':
      case 'wander': {
        m.stateT -= dt;
        if (m.team === 'enemy' && p.alive && !this.inCamp(p.pos, 3)) {
          const ag = m.def.aggro + (night ? 2 : 0) + (m.isBoss ? 0 : 0);
          if (m.distTo(p) < ag) {
            m.aggroTarget = p;
            m.state = 'chase';
            if (m.isBoss) {
              this.ui.banner(m.name, `Уровень ${m.level} · Босс`);
              this.sfx('boss');
            }
            break;
          }
        }
        if (m.stateT <= 0) {
          if (m.state === 'idle') {
            m.state = 'wander';
            const a = Math.random() * Math.PI * 2;
            const r = m.isBoss ? 3 : 2 + Math.random() * 6;
            m.wanderTo = m.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
            m.stateT = 3 + Math.random() * 3;
          } else {
            m.state = 'idle';
            m.stateT = 1 + Math.random() * 3;
          }
        }
        if (m.state === 'wander' && m.wanderTo) {
          go(m.wanderTo, 0.45);
          if (m.distTo(m.wanderTo) < 0.5) m.state = 'idle';
        }
        break;
      }
      case 'flee': {
        m.stateT -= dt;
        const src = m.aggroTarget;
        if (src) {
          const away = m.pos.clone().sub(src.pos).setY(0).normalize().multiplyScalar(5).add(m.pos);
          go(away, 1.1);
        }
        if (m.stateT <= 0) {
          m.state = 'idle';
          m.home.copy(m.pos);
        }
        break;
      }
      case 'chase': {
        const t = m.aggroTarget;
        const leash = m.isBoss ? 22 : 26;
        if (!t || !t.alive || m.distTo(m.home) > leash || (t === p && this.inCamp(p.pos, 1))) {
          m.state = 'return';
          m.aggroTarget = null;
          break;
        }
        const d = m.distTo(t);
        if (m.def.ability && m.abilityCd <= 0 && d <= (m.def.abilityRange ?? 3)) {
          const ab = ABILITIES[m.def.ability];
          const dir = t.pos.clone().sub(m.pos).setY(0).normalize();
          m.faceTo(t.pos);
          m.attackAnim = 0;
          ab.cast(this, m, { dir, point: t.pos.clone(), target: t }, 1);
          m.abilityCd = ab.cd[0] * (m.enraged ? 0.7 : 1);
          break;
        }
        const range = m.stats.attackRange + t.radius;
        if (d > range) go(t.pos);
        else this.tryAttack(m, t);
        break;
      }
      case 'return': {
        go(m.home, 1.2);
        if (m.distTo(m.home) < 1) {
          m.state = 'idle';
          m.stateT = 1;
          m.hp = m.stats.maxHp;
          m.enraged = false;
          m.effects = m.effects.filter((e) => e.def.id !== 'enrage');
          m.recalc();
        }
        break;
      }
    }
  }

  // ---------------- Главный апдейт ----------------
  update(dt: number) {
    if (this.paused) {
      for (const a of this.input.queue.splice(0)) if (a.type === 'panel' || a.type === 'escape') this.handleAction(a);
      this.r.follow(this.player.pos, dt);
      this.syncVisuals(dt);
      return;
    }
    this.gameTime += dt;
    this.world.time = this.gameTime;
    this.time = (this.time + dt / DAY_LENGTH) % 1;
    this.r.setDayTime(this.time);
    this.input.update();

    // действия из очереди ввода
    for (const a of this.input.queue.splice(0)) this.handleAction(a);

    const p = this.player;
    // эффекты
    const all: Entity[] = [p, ...this.mobs];
    for (const e of all) {
      if (!e.alive) continue;
      const changed = updateEffects(e, dt, this);
      if (changed || e.effects.length) e.recalc();
    }
    this.updatePlayer(dt);
    for (const m of this.mobs) this.updateMob(m, dt);
    for (const e of all) if (e.alive) this.physics(e, dt);
    this.separate();

    // отложенные действия
    for (const l of this.laters) l.t -= dt;
    const due = this.laters.filter((l) => l.t <= 0);
    this.laters = this.laters.filter((l) => l.t > 0);
    for (const l of due) l.fn();

    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateLoot(dt);

    // удаление мёртвых
    this.mobs = this.mobs.filter((m) => {
      if (!m.removeMe) return true;
      this.r.scene.remove(m.rig.group);
      return false;
    });

    // мир
    this.world.update(p.pos.x, p.pos.z);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.8;
      this.spawnTick();
    }
    this.respawnTickT -= dt;
    if (this.respawnTickT <= 0) {
      this.respawnTickT = 5;
      this.world.tickRespawn();
    }
    this.visited.add(Math.floor(p.pos.x / 32) + ',' + Math.floor(p.pos.z / 32));
    const b = this.world.biomeAt(p.pos.x, p.pos.z);
    this.r.setBiome(b);
    this.zoneName = BIOME_NAMES[b];
    this.zoneLevelNow = this.zoneLevel(p.pos.x, p.pos.z);
    this.nearStation = this.stations.find((s) => s.pos.distanceTo(p.pos) < 3.2) ?? null;
    this.nearHarvest = this.nearStation ? null : this.world.findHarvestable(p.pos, 2.6);

    // атмосфера: костёр и светлячки
    if (Math.random() < dt * 14) this.fx.float(new THREE.Vector3(0.5, GROUND + 1.4, 0.5), Math.random() < 0.5 ? 0xff8a30 : 0xffd040, 1, 0.5, 0.1, 0.8);
    if (this.r.dayFactor < 0.4 && Math.random() < dt * 4) {
      const fp = p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 24, 0.5 + Math.random(), (Math.random() - 0.5) * 18));
      this.fx.float(fp, 0xd8ff6a, 1, 0.1, 0.07, 3);
    }

    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 20;
      this.save();
    }

    this.r.follow(p.pos, dt);
    this.grass.update(dt, p.pos);
    this.ambient.update(dt, p.pos, b, this.r.dayFactor < 0.35);
    this.weather(dt, b);
    this.syncVisuals(dt);
  }

  private wv = new THREE.Vector3();
  private wp = new THREE.Vector3();
  /** Погода частицами: снегопад, пыль, листья, пыльца */
  private weather(dt: number, b: Biome) {
    const c = this.r.target;
    const rnd = (k: number) => (Math.random() - 0.5) * k;
    if (b === Biome.Snow) {
      for (let i = 0; i < Math.floor(dt * 70 + Math.random()); i++) {
        this.wp.set(c.x + rnd(40), c.y + 8 + Math.random() * 8, c.z + rnd(34));
        this.wv.set(0.7 + rnd(0.4), -1.3 - Math.random() * 0.6, 0.3 + rnd(0.4));
        this.fx.drift(this.wp, Math.random() < 0.8 ? 0xffffff : 0xdce4ff, this.wv, 0.05 + Math.random() * 0.04, 10);
      }
    } else if (b === Biome.Desert) {
      for (let i = 0; i < Math.floor(dt * 25 + Math.random()); i++) {
        this.wp.set(c.x + rnd(36) - 8, c.y + 0.2 + Math.random() * 2.5, c.z + rnd(30));
        this.wv.set(2.4 + Math.random(), 0.15 + rnd(0.2), 0.8 + rnd(0.5));
        this.fx.drift(this.wp, Math.random() < 0.5 ? 0xe8c890 : 0xd8a868, this.wv, 0.035 + Math.random() * 0.03, 3.5);
      }
    } else if (b === Biome.Forest) {
      if (Math.random() < dt * 6) {
        this.wp.set(c.x + rnd(34), c.y + 5 + Math.random() * 5, c.z + rnd(28));
        this.wv.set(0.4 + rnd(0.4), -0.7, 0.2 + rnd(0.4));
        this.fx.drift(this.wp, [0xd88a3a, 0xc8b040, 0x7cb04a][Math.floor(Math.random() * 3)], this.wv, 0.07, 12);
      }
    } else if ((b === Biome.Meadow || b === Biome.Camp) && this.r.dayFactor > 0.4) {
      if (Math.random() < dt * 8) {
        this.wp.set(c.x + rnd(30), c.y + 0.4 + Math.random() * 2, c.z + rnd(24));
        this.wv.set(0.3 + rnd(0.3), 0.1 + rnd(0.2), rnd(0.3));
        this.fx.drift(this.wp, 0xfff8c0, this.wv, 0.03, 5);
      }
    }
  }

  private tipPos = new THREE.Vector3();
  private syncVisuals(dt: number) {
    this.player.syncRig(dt);
    const cr = this.player.crig;
    if (cr.weaponRarity >= 3 && this.player.alive && Math.random() < dt * 8) {
      cr.weaponTip.getWorldPosition(this.tipPos);
      this.fx.float(this.tipPos, cr.weaponRarity === 4 ? 0xffc060 : 0xd8a0ff, 1, 0.15, 0.05, 0.6);
    }
    for (const m of this.mobs) m.syncRig(dt);
    this.fx.update(dt);
    this.updateAimIndicator();
  }

  private separate() {
    const ents: Entity[] = [this.player, ...this.mobs.filter((m) => m.alive)];
    for (let i = 0; i < ents.length; i++)
      for (let j = i + 1; j < ents.length; j++) {
        const a = ents[i],
          b = ents[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.pos.x - a.pos.x,
          dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const nx = dx / d,
          nz = dz / d;
        const wa = a.isBoss ? 0.1 : 1,
          wb = b.isBoss ? 0.1 : 1;
        if (this.world.canStand(a.pos.y, a.pos.x - nx * push * wa, a.pos.z - nz * push * wa, a.radius * 0.5, true)) {
          a.pos.x -= nx * push * wa;
          a.pos.z -= nz * push * wa;
        }
        if (this.world.canStand(b.pos.y, b.pos.x + nx * push * wb, b.pos.z + nz * push * wb, b.radius * 0.5, true)) {
          b.pos.x += nx * push * wb;
          b.pos.z += nz * push * wb;
        }
      }
  }

  private handleAction(a: Action) {
    const p = this.player;
    switch (a.type) {
      case 'ability':
        this.castAbility(a.slot, a.aim, a.mouse);
        break;
      case 'item':
        this.useQuickItem(a.slot);
        break;
      case 'interact':
        this.interact();
        break;
      case 'panel':
        this.ui.openPanel(a.name);
        break;
      case 'auto':
        p.autoMode = !p.autoMode;
        this.ui.log(p.autoMode ? 'Автобой включён' : 'Автобой выключен', '#9ad0ff');
        break;
      case 'escape':
        if (!this.ui.closePanels()) this.ui.openPanel('menu');
        break;
    }
  }

  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const o = pr.o;
      if (o.homing && o.homing.alive) {
        const to = o.homing.pos.clone().setY(o.homing.pos.y + o.homing.rig.height * 0.5 * o.homing.rig.baseScale);
        const d = to.sub(pr.pos);
        pr.dir.copy(d.normalize());
      }
      const step = o.speed * dt;
      pr.pos.addScaledVector(pr.dir, step);
      pr.traveled += step;
      pr.mesh.position.copy(pr.pos);
      pr.mesh.lookAt(pr.pos.clone().add(pr.dir));
      if (o.kind === 'orb') this.fx.float(pr.pos, 0xff9a3a, 1, 0.2, 0.1, 0.4);
      if (o.kind === 'spit') this.fx.float(pr.pos, 0x9ae83a, 1, 0.1, 0.06, 0.3);
      for (const t of this.enemiesNear(pr.pos, o.radius, o.owner)) {
        if (pr.hit.has(t.id)) continue;
        if (Math.abs(pr.pos.y - (t.pos.y + t.rig.height * 0.5 * t.rig.baseScale)) > 1.6 * t.rig.baseScale) continue;
        pr.hit.add(t.id);
        o.onHit(t, pr.pos.clone());
        if (!o.pierce) {
          pr.dead = true;
          break;
        }
      }
      if (pr.dead) continue;
      const gh = this.world.heightAt(pr.pos.x, pr.pos.z);
      if (pr.traveled >= o.range || (gh !== null && gh > pr.pos.y + 0.2 && !o.homing)) {
        pr.dead = true;
        o.onEnd?.(pr.pos.clone().setY(gh ?? pr.pos.y));
      }
    }
    this.projectiles = this.projectiles.filter((pr) => {
      if (!pr.dead) return true;
      this.r.scene.remove(pr.mesh);
      ((pr.mesh as THREE.Mesh).material as THREE.Material).dispose();
      return false;
    });
  }

  private updateZones(dt: number) {
    for (const z of this.zones) {
      if (z.dead) continue;
      z.t += dt;
      const handle = { pos: z.o.pos, end: () => (z.dead = true) };
      if (z.o.kind === 'telegraph') {
        const k = Math.min(1, z.t / (z.o.delay ?? 1));
        z.mesh.scale.setScalar(z.o.radius * (0.3 + 0.7 * k));
      }
      if (z.t >= (z.o.delay ?? 0)) {
        z.tickT -= dt;
        if (z.tickT <= 0) {
          z.tickT = z.o.tick;
          z.o.onTick(this.enemiesNear(z.o.pos, z.o.radius, z.o.owner), handle);
        }
      }
      if (z.t >= z.o.duration) z.dead = true;
    }
    this.zones = this.zones.filter((z) => {
      if (!z.dead) return true;
      this.fx.disposeObj(z.mesh);
      return false;
    });
  }

  private updateLoot(dt: number) {
    const p = this.player;
    for (const l of this.loot) {
      l.t += dt;
      const ground = this.world.heightAt(l.pos.x, l.pos.z) ?? l.pos.y;
      if (l.pos.y > ground || l.vy > 0) {
        l.vy -= 12 * dt;
        l.pos.y = Math.max(ground, l.pos.y + l.vy * dt);
        if (l.pos.y === ground) l.vy = 0;
      }
      l.mesh.position.set(l.pos.x, l.pos.y + Math.sin(l.t * 3) * 0.05 + 0.05, l.pos.z);
      l.mesh.rotation.y += dt * 1.5;
      if (p.alive && l.t > 0.5) {
        const d = Math.hypot(p.pos.x - l.pos.x, p.pos.z - l.pos.z);
        if (d < 3.2) {
          l.pos.lerp(p.pos, Math.min(1, dt * 6));
        }
        if (d < 0.9) {
          const before = l.item.qty;
          const left = p.inv.add(l.item);
          if (left < before) {
            const def = ITEMS[l.item.id];
            const name = def.kind === 'gear' ? `[${def.name}]` : `${def.name} ×${before - left}`;
            const color = def.kind === 'gear' ? RARITY[l.item.rarity].color : '#e8e0c8';
            this.ui.log(`Получено: ${def.icon} ${name}`, color);
            this.sfx('pickup');
            if (def.kind === 'material') this.onGather(l.item.id, before - left);
          }
          if (left <= 0) l.t = -999;
          else if (l.t > 0) {
            l.t = -1; // инвентарь полон — ждём
            this.ui.float(p.pos.clone().setY(p.pos.y + 2.2), 'Сумка полна', 'info');
          }
        }
      }
      if (l.t > 300) l.t = -999;
    }
    this.loot = this.loot.filter((l) => {
      if (l.t > -999) return true;
      this.r.scene.remove(l.mesh);
      return false;
    });
  }

  // ---------------- Индикатор прицела ----------------
  private updateAimIndicator() {
    const fx = this.fx;
    const p = this.player;
    fx.aimRange.visible = fx.aimCircle.visible = fx.aimLine.visible = fx.selectRing.visible = false;
    let slot = -1;
    let dir: THREE.Vector3 | null = null;
    let k = 0.7;
    let point: THREE.Vector3 | null = null;
    const inp = this.input;
    if (inp.aim) {
      slot = inp.aim.slot;
      if (inp.aim.k > 0) {
        dir = new THREE.Vector3(inp.aim.dx, 0, inp.aim.dz);
        k = inp.aim.k;
      }
    } else if (inp.hoverAbility >= 0 && inp.mouse.has) {
      slot = inp.hoverAbility;
      const pt = this.r.screenToGround(inp.mouse.x, inp.mouse.y, p.pos.y);
      if (pt) {
        point = pt;
        dir = pt.clone().sub(p.pos).setY(0);
        if (dir.lengthSq() < 0.01) dir = null;
        else dir.normalize();
      }
    }
    // выделение текущей цели
    const tgt = p.focus && p.focus.alive && p.distTo(p.focus) < 16 ? p.focus : null;
    if (tgt) {
      fx.selectRing.visible = true;
      fx.selectRing.position.set(tgt.pos.x, tgt.pos.y + 0.06, tgt.pos.z);
      fx.selectRing.scale.setScalar(Math.max(0.6, tgt.radius * 1.8));
    }
    if (slot < 0 || p.abil[slot] <= 0) return;
    const def = p.ability(slot);
    const base = p.pos.clone().setY(p.pos.y + 0.07);
    if (def.range > 0) {
      fx.aimRange.visible = true;
      fx.aimRange.position.copy(base);
      fx.aimRange.scale.setScalar(def.range);
    }
    if (!dir) {
      const t = this.nearestEnemy(p.pos, def.range + 3, p);
      dir = t ? t.pos.clone().sub(p.pos).setY(0).normalize() : p.forward();
    }
    const cancel = !!inp.aim?.cancel;
    const col = cancel ? 0xff4a3a : 0x7ad0ff;
    (fx.aimCircle.material as THREE.MeshBasicMaterial).color.setHex(col);
    (fx.aimLine.material as THREE.MeshBasicMaterial).color.setHex(col);
    if (def.targeting === 'dir') {
      fx.aimLine.visible = true;
      fx.aimLine.position.copy(base);
      fx.aimLine.rotation.y = Math.atan2(dir.x, dir.z);
      fx.aimLine.scale.set(def.width ?? 0.9, 1, def.range);
    } else if (def.targeting === 'point' || def.targeting === 'unit') {
      const pt = point && p.distTo(point) <= def.range ? point : p.pos.clone().addScaledVector(dir, def.range * k);
      fx.aimCircle.visible = true;
      fx.aimCircle.position.set(pt.x, (this.world.heightAt(pt.x, pt.z) ?? p.pos.y) + 0.08, pt.z);
      fx.aimCircle.scale.setScalar(def.radius ?? 1);
    } else if (def.targeting === 'none') {
      fx.aimCircle.visible = true;
      fx.aimCircle.position.copy(base);
      fx.aimCircle.scale.setScalar(def.radius ?? 2);
    }
  }

  // ---------------- Сохранение ----------------
  toSave(): SaveData {
    const p = this.player;
    return {
      v: 1,
      seed: this.world.seed,
      time: this.time,
      gameTime: this.gameTime,
      player: {
        name: p.name, cls: p.cls.id, appearance: p.appearance, level: p.level, xp: p.xp, sp: p.skillPoints, abil: p.abil, talents: p.talents,
        hp: p.alive ? p.hp : p.stats.maxHp, mp: p.mp, pos: p.alive ? [p.pos.x, p.pos.y, p.pos.z] : [0.5, GROUND + 1, 4.5], kills: p.kills, auto: p.autoMode,
      },
      inv: p.inv.toJSON(),
      harvested: [...this.world.harvested.entries()],
      quests: this.quests,
      bossTimers: [...this.bossTimers.entries()],
      visited: [...this.visited],
    };
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.toSave()));
    } catch {
      /* хранилище недоступно — игра продолжается без сохранения */
    }
  }

  dispose() {
    this.ambient.dispose();
    this.grass.dispose();
    this.world.dispose();
  }

  /** Доля исследованных чанков в текущем регионе (как «91%» на миникарте) */
  exploration(): number {
    const R = WorldGen.REGION;
    const p = this.player.pos;
    const rx = Math.floor(p.x / R),
      rz = Math.floor(p.z / R);
    const n = Math.ceil(R / 32);
    let c = 0;
    for (const k of this.visited) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.floor((cx * 32) / R) === rx && Math.floor((cz * 32) / R) === rz) c++;
    }
    return Math.min(1, c / (n * n * 0.35));
  }

  xpProgress() {
    return this.player.xp / xpToNext(this.player.level);
  }
}

export const SAVE_KEY = 'dawnruins.save.v1';

export function loadSave(): SaveData | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return null;
    const d = JSON.parse(s) as SaveData;
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

