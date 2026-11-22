// HUD в стиле референса: портрет, бары, трекер заданий/босса, миникарта, кнопки способностей, лог.
import * as THREE from 'three';
import { el, clear } from './dom';
import type { Game, UIHooks } from '../game/game';
import { DAY_LENGTH } from '../game/game';
import type { Input } from '../input/input';
import { ABILITY_LABELS } from '../input/input';
import { IS_TOUCH } from '../render/renderer';
import { fmtNum, powerRating } from '../combat/stats';
import { ITEMS } from '../data/items';
import { BLOCK_COLORS } from '../world/blocks';
import { questTitle } from '../game/quests';
import { Panels } from './panels';
import { iconNode } from '../render/icons';
import { Mob } from '../game/mob';
import { CAMP_RADIUS } from '../world/gen';

interface Float {
  e: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  dx: number;
}

export class Hud implements UIHooks {
  root: HTMLElement;
  game!: Game;
  panels: Panels;
  private floatsEl: HTMLElement;
  private floats: Float[] = [];
  private floatPool: HTMLDivElement[] = [];
  private bars = new Map<number, HTMLDivElement>();
  private barPool: HTMLDivElement[] = [];
  private e: Record<string, HTMLElement> = {};
  private abBtns: { root: HTMLElement; cdv: HTMLElement; cdt: HTMLElement; pips: HTMLElement; up: HTMLElement; icon: HTMLElement }[] = [];
  private qBtns: HTMLElement[] = [];
  private mm!: HTMLCanvasElement;
  private mmCtx!: CanvasRenderingContext2D;
  private mmT = 0;
  private trT = 0;
  private trTab: 'quests' | 'boss' = 'quests';
  private logEl!: HTMLElement;
  private deathEl!: HTMLElement;
  private loadingEl!: HTMLElement;
  private mmBig = false;

  constructor(app: HTMLElement, private input: Input) {
    this.root = el('div', { id: 'hud' });
    this.floatsEl = el('div', { id: 'floats' });
    app.appendChild(this.floatsEl);
    app.appendChild(this.root);
    this.panels = new Panels(app);
  }

  attach(game: Game) {
    this.game = game;
    this.panels.game = game;
    game.ui = this;
    this.build();
  }

  private build() {
    const g = this.game;
    const p = g.player;
    clear(this.root);
    // --- Портрет и бары
    const portrait = el('div', { class: 'portrait pe' }, p.cls.icon, (this.e.lv = el('div', { class: 'lv' }, '1')), (this.e.sp = el('div', { class: 'sp-dot hidden' }, '1')));
    portrait.addEventListener('click', () => this.openPanel('skills'));
    const bars = el(
      'div',
      { class: 'bars' },
      el('div', { class: 'power' }, el('span', { class: 'sw' }, '⚔️'), (this.e.pw = el('span', {}, '0')), (this.e.zl = el('span', { class: 'zl' }, ''))),
      el('div', { class: 'bar hp' }, (this.e.hpShield = el('i', { class: 'shield' })), (this.e.hp = el('i')), (this.e.hpt = el('span'))),
      el('div', { class: 'bar mp' }, (this.e.mp = el('i')), (this.e.mpt = el('span'))),
      el('div', { class: 'bar xp' }, (this.e.xp = el('i'))),
      (this.e.buffs = el('div', { class: 'buffs' })),
    );
    this.root.append(el('div', { class: 'tl' }, portrait, bars));

    // --- Трекер
    const tq = el('button', { class: 'tab on pe' }, 'Задания');
    const tb = el('button', { class: 'tab pe' }, 'Босс');
    tq.addEventListener('click', () => {
      this.trTab = 'quests';
      tq.classList.add('on');
      tb.classList.remove('on');
      this.trT = 0;
    });
    tb.addEventListener('click', () => {
      this.trTab = 'boss';
      tb.classList.add('on');
      tq.classList.remove('on');
      this.trT = 0;
    });
    this.root.append(el('div', { class: 'tracker' }, el('div', { class: 'tabs' }, tq, tb), (this.e.trList = el('div'))));

    // --- Миникарта
    this.mm = el('canvas', { width: 264, height: 264 });
    this.mmCtx = this.mm.getContext('2d')!;
    const mmWrap = el('div', { class: 'minimap pe' }, this.mm);
    mmWrap.addEventListener('click', () => {
      this.mmBig = !this.mmBig;
      mmWrap.classList.toggle('big', this.mmBig);
      this.mmT = 0;
    });
    this.e.mmWrap = mmWrap;
    this.root.append(
      el('div', { class: 'tr' }, mmWrap, el('div', { class: 'zone' }, el('div', { class: 'zn' }, (this.e.zn = el('span')), (this.e.zp = el('span'))), el('div', { class: 'zb' }, (this.e.zb = el('i'))), el('div', { class: 'zn', style: { marginTop: '3px', fontSize: '11px', color: '#b9b4a6' } }, (this.e.clock = el('span')), (this.e.zlv = el('span'))))),
    );

    // --- Боковые кнопки
    const side = el('div', { class: 'side' });
    const mk = (icon: string, title: string, fn: () => void, badgeKey?: string) => {
      const b = el('button', { class: 'ibtn pe', title }, icon);
      if (badgeKey) b.append((this.e[badgeKey] = el('span', { class: 'badge hidden' }, '!')));
      this.input.bindTap(b, fn);
      side.append(b);
    };
    mk('🎒', 'Инвентарь (I)', () => this.openPanel('inventory'), 'bInv');
    mk('⚒️', 'Крафт (C)', () => this.openPanel('craft'));
    mk('⭐', 'Способности и таланты (K)', () => this.openPanel('skills'), 'bSk');
    mk('📜', 'Задания', () => this.openPanel('quests'));
    mk('☰', 'Меню (Esc)', () => this.openPanel('menu'));
    this.root.append(side);

    // --- Быстрые слоты
    const quick = el('div', { class: 'quick' });
    for (let i = 0; i < 4; i++) {
      const b = el('button', { class: 'qslot pe' });
      this.input.bindTap(b, () => {
        if (g.player.inv.quick[i] == null) this.openPanel('inventory');
        else g.useQuickItem(i);
      });
      quick.append(b);
      this.qBtns.push(b);
    }
    this.root.append(quick);

    // --- Боевой блок
    const combat = el('div', { class: 'combat' });
    const cancel = el('div', { class: 'cancel' }, '✖');
    const atk = el('button', { class: 'atk pe' }, p.cls.id === 'warden' ? '⚔️' : p.cls.id === 'ranger' ? '🏹' : '✴️');
    this.input.bindHold(
      atk,
      () => {
        this.input.attackHeld = true;
        atk.classList.add('on');
      },
      () => {
        this.input.attackHeld = false;
        atk.classList.remove('on');
      },
    );
    combat.append(atk);
    const pos: [number, number][] = [
      [124, 4],
      [116, 80],
      [66, 146],
      [0, 112],
    ];
    for (let i = 0; i < 4; i++) {
      const def = p.ability(i);
      const cdv = el('div', { class: 'cdv' });
      const cdt = el('div', { class: 'cdt' });
      const pips = el('div', { class: 'pips' });
      const up = el('div', { class: 'up hidden pe' }, '+');
      const icon = el('span', {}, def.icon);
      const b = el('button', { class: 'ab pe' + (i === 3 ? ' ult' : ''), style: { right: pos[i][0] + 'px', bottom: pos[i][1] + 'px' }, title: def.name }, icon, cdv, cdt, pips, up);
      if (!IS_TOUCH) b.append(el('span', { class: 'key' }, ABILITY_LABELS[i]));
      up.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (g.player.levelAbility(i)) {
          g.sfx('click');
          this.log(`Изучено: ${def.name} (ур. ${g.player.abil[i]})`, '#9ad0ff');
        }
      });
      this.input.bindAbilityButton(b, i, cancel);
      combat.append(b);
      this.abBtns.push({ root: b, cdv, cdt, pips, up, icon });
    }
    const auto = el('button', { class: 'auto pe', style: { right: '4px', bottom: '186px' } }, 'Auto');
    this.input.bindTap(auto, () => this.input.queue.push({ type: 'auto' }));
    this.e.auto = auto;
    const act = el('button', { class: 'act pe hidden', style: { right: '196px', bottom: '140px' } });
    this.input.bindTap(act, () => this.input.queue.push({ type: 'interact' }));
    this.e.act = act;
    combat.append(auto, act, cancel);
    this.root.append(combat);

    if (IS_TOUCH) {
      this.e.joyHint = el('div', { class: 'joy-hint' }, 'Касание слева — движение');
      this.root.append(this.e.joyHint);
    }

    this.logEl = el('div', { class: 'log' });
    this.root.append(this.logEl);
    this.deathEl = el('div', { class: 'death hidden' });
    this.root.append(this.deathEl);
    this.loadingEl = el('div', { class: 'loading' }, 'Генерация мира…');
    this.root.append(this.loadingEl);
    this.invChanged();
  }

  // ---------------- UIHooks ----------------
  log(msg: string, color = '#f4f1e8') {
    const d = el('div', { style: { color } }, msg);
    this.logEl.append(d);
    while (this.logEl.children.length > 6) this.logEl.firstChild!.remove();
    setTimeout(() => d.classList.add('old'), 9000);
  }

  float(pos: THREE.Vector3, text: string, cls: string) {
    if (this.floats.length > 60) {
      const f = this.floats.shift()!;
      f.e.remove();
      this.floatPool.push(f.e);
    }
    const e = this.floatPool.pop() ?? el('div');
    e.className = 'ft ' + cls;
    e.textContent = text;
    this.floatsEl.append(e);
    this.floats.push({ e, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
  }

  banner(title: string, sub?: string) {
    const b = el('div', { class: 'banner' }, el('h2', {}, title), sub ? el('p', {}, sub) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 2700);
  }

  invChanged() {
    this.panels.refresh();
  }

  openPanel(name: string, arg?: string) {
    this.panels.open(name, arg);
  }

  closePanels(): boolean {
    if (this.mmBig) {
      this.mmBig = false;
      this.e.mmWrap.classList.remove('big');
      return true;
    }
    return this.panels.close();
  }

  // ---------------- Кадр ----------------
  update(dt: number) {
    const g = this.game;
    const p = g.player;
    const s = p.stats;
    this.loadingEl.classList.toggle('hidden', g.world.heightAt(p.pos.x, p.pos.z) !== null);
    this.e.lv.textContent = String(p.level);
    const sp = p.skillPoints + (p.pendingTalentTier() >= 0 ? 1 : 0);
    this.e.sp.classList.toggle('hidden', sp <= 0);
    this.e.sp.textContent = String(sp);
    this.e.bSk.classList.toggle('hidden', sp <= 0);
    this.e.bInv.classList.toggle('hidden', p.inv.freeSlots() > 2);
    this.e.pw.textContent = fmtNum(powerRating(s, p.level));
    const shield = p.effects.filter((e) => e.def.id === 'shield' || e.def.id === 'spikedShell').reduce((a, e) => a + e.value, 0);
    this.e.hp.style.transform = `scaleX(${Math.max(0, p.hp / s.maxHp)})`;
    this.e.hpShield.style.transform = `scaleX(${Math.min(1, (p.hp + shield) / s.maxHp)})`;
    this.e.hpt.textContent = `${Math.ceil(p.hp)} / ${Math.round(s.maxHp)}${shield > 0 ? ` (+${Math.round(shield)})` : ''}`;
    this.e.mp.style.transform = `scaleX(${s.maxMp > 0 ? p.mp / s.maxMp : 0})`;
    this.e.mpt.textContent = `${Math.floor(p.mp)} / ${Math.round(s.maxMp)}`;
    this.e.xp.style.transform = `scaleX(${g.xpProgress()})`;
    this.e.zl.textContent = `Ур. ${p.level}`;
    this.e.auto.classList.toggle('on', p.autoMode);

    // бафы
    const buffs = p.effects.filter((e) => !e.def.hidden);
    const be = this.e.buffs;
    if (be.children.length !== buffs.length) {
      clear(be);
      for (let i = 0; i < buffs.length; i++) be.append(el('div', { class: 'buff' }, el('span'), el('b')));
    }
    buffs.forEach((b, i) => {
      const d = be.children[i] as HTMLElement;
      d.className = 'buff' + (b.def.debuff ? ' debuff' : '');
      (d.children[0] as HTMLElement).textContent = b.def.icon;
      (d.children[1] as HTMLElement).textContent = b.stacks > 1 ? '×' + b.stacks : b.time < 99 ? String(Math.ceil(b.time)) : '';
      d.title = `${b.def.name}: ${b.def.desc(b)}`;
    });

    // способности
    for (let i = 0; i < 4; i++) {
      const b = this.abBtns[i];
      const def = p.ability(i);
      const lvl = p.abil[i];
      const cd = p.cds[i];
      const maxCd = def.cd[Math.max(0, Math.min(def.cd.length - 1, lvl - 1))] * (1 - s.cdr / 100);
      b.root.classList.toggle('locked', lvl === 0);
      const cost = def.mana[Math.max(0, Math.min(def.mana.length - 1, lvl - 1))];
      b.root.classList.toggle('nomana', lvl > 0 && p.mp < cost);
      if (cd > 0) {
        const k = Math.min(1, cd / Math.max(0.1, maxCd));
        b.cdv.style.background = `conic-gradient(rgba(0,0,0,.65) ${k * 360}deg, transparent 0)`;
        b.cdt.textContent = cd > 1 ? String(Math.ceil(cd)) : cd.toFixed(1);
      } else {
        b.cdv.style.background = 'none';
        b.cdt.textContent = '';
      }
      if (b.pips.children.length !== def.maxLevel) {
        clear(b.pips);
        for (let j = 0; j < def.maxLevel; j++) b.pips.append(el('i'));
      }
      for (let j = 0; j < def.maxLevel; j++) (b.pips.children[j] as HTMLElement).className = j < lvl ? 'on' : '';
      b.up.classList.toggle('hidden', !p.canLevelAbility(i));
    }

    // быстрые слоты
    for (let i = 0; i < 4; i++) {
      const b = this.qBtns[i];
      const uid = p.inv.quick[i];
      const f = uid != null ? p.inv.findUid(uid) : null;
      if (uid != null && !f) p.inv.quick[i] = null;
      const def = f ? ITEMS[f.item.id] : null;
      const cnt = def ? (def.kind === 'consumable' ? p.inv.count(def.id) : 0) : 0;
      const cd = def ? p.itemCds[def.id] ?? 0 : 0;
      const key = `${def?.icon ?? ''}|${cnt}|${cd > 0}`;
      if (b.dataset.k !== key) {
        b.dataset.k = key;
        clear(b);
        b.append(el("s", {}, String(i + 1)), def && f ? iconNode(def.id, def.icon, f.item.rarity) : "＋");
        if (cnt) b.append(el("b", {}, String(cnt)));
        if (cd > 0) b.append(el("div", { class: "cd" }));
        b.style.opacity = def ? '1' : '0.6';
      }
    }

    // кнопка взаимодействия
    const act = this.e.act;
    let label = '';
    if (g.nearStation) {
      const k = g.nearStation.kind;
      label = `<span>${k === 'campfire' ? '🔥' : k === 'board' ? '📜' : '🔨'}</span>${g.nearStation.name}`;
    } else if (g.nearHarvest) label = '<span>✋</span>Добыть';
    if (label) {
      if (act.innerHTML !== label) act.innerHTML = label;
      act.classList.remove('hidden');
    } else act.classList.add('hidden');
    if (this.e.joyHint && (this.input.usingTouch || g.gameTime > 25)) {
      this.e.joyHint.remove();
      delete this.e.joyHint;
    }

    // смерть
    if (!p.alive) {
      this.deathEl.classList.remove('hidden');
      this.deathEl.textContent = `Возрождение через ${Math.max(0, Math.ceil(p.respawnT))}…`;
    } else this.deathEl.classList.add('hidden');

    // зона и время
    this.e.zn.textContent = g.zoneName;
    this.e.zp.textContent = Math.round(g.exploration() * 100) + '%';
    (this.e.zb as HTMLElement).style.width = Math.round(g.exploration() * 100) + '%';
    const mins = Math.floor(((g.time * 24 * 60) % (24 * 60)) + 0);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.e.clock.textContent = `${g.r.dayFactor > 0.35 ? '☀️' : '🌙'} ${hh}:${mm}`;
    this.e.zlv.textContent = g.inCamp(p.pos) ? 'Безопасно' : `Ур. ${g.zoneLevelNow}–${g.zoneLevelNow + 2}`;
    void DAY_LENGTH;

    this.updateFloats(dt);
    this.updateBars();
    this.mmT -= dt;
    if (this.mmT <= 0) {
      this.mmT = this.mmBig ? 0.4 : 0.25;
      this.drawMinimap();
    }
    this.trT -= dt;
    if (this.trT <= 0) {
      this.trT = 0.5;
      this.drawTracker();
    }
    this.panels.tick(dt);
  }

  private updateFloats(dt: number) {
    const r = this.game.r;
    this.floats = this.floats.filter((f) => {
      f.t += dt;
      if (f.t > 1.1) {
        f.e.remove();
        this.floatPool.push(f.e);
        return false;
      }
      const sp = r.worldToScreen(f.pos);
      const rise = f.t * 55;
      const op = f.t < 0.75 ? 1 : 1 - (f.t - 0.75) / 0.35;
      const sc = f.t < 0.12 ? 0.6 + f.t * 4 : 1;
      f.e.style.transform = `translate(${sp.x + f.dx * f.t - 20}px, ${sp.y - rise}px) scale(${sc})`;
      f.e.style.opacity = sp.vis ? String(op) : '0';
      return true;
    });
  }

  private updateBars() {
    const g = this.game;
    const p = g.player;
    const seen = new Set<number>();
    for (const m of g.mobs) {
      if (!m.alive) continue;
      const d = m.distTo(p);
      if (d > 24) continue;
      const head = m.pos.clone().setY(m.pos.y + m.rig.height * m.rig.baseScale + 0.35);
      const sp = g.r.worldToScreen(head);
      if (!sp.vis) continue;
      seen.add(m.id);
      let b = this.bars.get(m.id);
      if (!b) {
        b = this.barPool.pop() ?? el('div', { class: 'mbar' }, el('div', { class: 'nm' }), el('div', { class: 'hb' }, el('i')));
        b.className = 'mbar ' + m.team + (m.isElite ? ' elite' : '') + (m.isBoss ? ' boss' : '');
        const nm = b.children[0] as HTMLElement;
        clear(nm);
        nm.append(el('i', {}, String(m.level)), m.name);
        this.floatsEl.append(b);
        this.bars.set(m.id, b);
      }
      const w = m.isBoss ? 120 : 64;
      b.style.transform = `translate(${sp.x - w / 2}px, ${sp.y - 24}px)`;
      ((b.children[1] as HTMLElement).children[0] as HTMLElement).style.transform = `scaleX(${Math.max(0, m.hp / m.stats.maxHp)})`;
    }
    for (const [id, b] of this.bars) {
      if (seen.has(id)) continue;
      b.remove();
      this.barPool.push(b);
      this.bars.delete(id);
    }
  }

  private drawMinimap() {
    const g = this.game;
    const p = g.player;
    const c = this.mm;
    const big = this.mmBig;
    const wrap = this.e.mmWrap;
    const W = big ? Math.min(900, Math.floor(wrap.clientWidth)) : 132;
    const H = big ? Math.min(900, Math.floor(wrap.clientHeight)) : 132;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = this.mmCtx;
    const scale = big ? 1.5 : 1; // пикселей на блок
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const cx = p.pos.x,
      cz = p.pos.z;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wx = cx + (x - W / 2) / scale;
        const wz = cz + (y - H / 2) / scale;
        const t = g.world.topAt(wx, wz);
        const i = (x + y * W) * 4;
        if (!t) {
          d[i] = 30;
          d[i + 1] = 38;
          d[i + 2] = 50;
          d[i + 3] = 255;
          continue;
        }
        const col = BLOCK_COLORS[t];
        const hgt = g.world.heightAt(wx, wz) ?? 15;
        const k = 0.8 + Math.min(0.35, Math.max(-0.2, (hgt - 15) * 0.025));
        d[i] = Math.min(255, col[0] * k);
        d[i + 1] = Math.min(255, col[1] * k);
        d[i + 2] = Math.min(255, col[2] * k);
        d[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const toS = (x: number, z: number) => [W / 2 + (x - cx) * scale, H / 2 + (z - cz) * scale];
    // лагерь
    {
      const [x, y] = toS(0, 0);
      ctx.strokeStyle = 'rgba(255,220,120,.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, CAMP_RADIUS * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `${big ? 18 : 12}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⛺', x, y);
    }
    for (const col of g.world.gen.colossiNear(cx, cz)) {
      let [x, y] = toS(col.x, col.z);
      const out = x < 8 || y < 8 || x > W - 8 || y > H - 8;
      x = Math.max(8, Math.min(W - 8, x));
      y = Math.max(8, Math.min(H - 8, y));
      ctx.globalAlpha = out ? 0.75 : 1;
      ctx.fillText('👹', x, y);
      ctx.globalAlpha = 1;
    }
    for (const m of g.mobs) {
      if (!m.alive) continue;
      const [x, y] = toS(m.pos.x, m.pos.z);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.fillStyle = m.isBoss ? '#ff3a2a' : m.team === 'enemy' ? (m.isElite ? '#ffb030' : '#ff5a4a') : m.team === 'neutral' ? '#ffd84a' : '#9aff8a';
      ctx.beginPath();
      ctx.arc(x, y, m.isBoss ? 5 : big ? 3 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // игрок
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-p.facing + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawTracker() {
    const g = this.game;
    const list = this.e.trList;
    clear(list);
    if (this.trTab === 'quests') {
      for (const q of g.quests) {
        const done = q.have >= q.need;
        list.append(
          el(
            'div',
            { class: 'row' + (done ? ' done' : '') },
            el('div', { class: 'r1' }, el('span', {}, questTitle(q)), el('span', {}, `${q.have}/${q.need}`)),
            el('div', { class: 'r2' }, `Награда: ${q.xp} опыта ${q.reward.map(([id, c]) => ITEMS[id].icon + '×' + c).join(' ')}`),
            el('div', { class: 'mini' }, el('i', { style: { width: `${(q.have / q.need) * 100}%` } })),
          ),
        );
      }
    } else {
      const b = g.nearestBoss();
      const p = g.player;
      const name = 'Каменный Молотоогр';
      let state = 'Ждёт у Колосса';
      if (b.mob) state = b.mob.state === 'chase' ? 'В бою!' : 'Охраняет Колосс';
      else if (b.colossus) {
        const t = g.bossTimers.get(`${b.colossus.x},${b.colossus.z}`) ?? 0;
        if (t > g.gameTime) state = `Возродится через ${Math.ceil(t - g.gameTime)} с`;
      }
      let dirTxt = '';
      if (b.colossus) {
        const ang = Math.atan2(b.colossus.x - p.pos.x, -(b.colossus.z - p.pos.z));
        const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
        dirTxt = arrows[(Math.round((ang / (Math.PI * 2)) * 8) + 8) % 8];
      }
      list.append(
        el('div', { class: 'row' }, el('div', { class: 'r1' }, el('span', {}, name), el('span', {}, state)), el('div', { class: 'r2' }, `Ур. ${b.level}–${b.level + 2} · ${dirTxt} ${Math.round(b.dist)} м`)),
        el('div', { class: 'row' }, el('div', { class: 'r1' }, el('span', {}, 'Убито врагов'), el('span', {}, String(p.kills)))),
      );
      if (b.mob) {
        list.append(el('div', { class: 'row' }, el('div', { class: 'r1' }, el('span', {}, 'Здоровье босса'), el('span', {}, `${Math.round((b.mob.hp / b.mob.stats.maxHp) * 100)}%`)), el('div', { class: 'mini' }, el('i', { style: { width: `${(b.mob.hp / b.mob.stats.maxHp) * 100}%`, background: '#e8463a' } }))));
      }
    }
  }
}

void Mob;
