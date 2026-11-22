// Окна: инвентарь и экипировка, крафт, способности и таланты, задания, меню.
import { el, clear } from './dom';
import type { Game } from '../game/game';
import { clearSave } from '../game/game';
import { ITEMS, RARITY, SLOT_NAMES } from '../data/items';
import { EQUIP_SLOTS, itemName, itemDescLines, itemMods, canCraft, craft, recipesFor, salvage, upgradeItem, socketRune, type ItemInst } from '../items/inventory';
import { STATIONS, UPGRADE, type Station } from '../data/recipes';
import { describeMods } from '../combat/stats';
import { TALENT_LEVELS } from '../data/classes';
import { questTitle } from '../game/quests';
import { setSound, soundOn, sfx } from '../core/audio';
import { settings, updateSettings, QUALITY_NAMES, DOF_NAMES, type Quality, type DofMode } from '../core/settings';
import { IS_TOUCH } from '../render/renderer';
import { iconNode } from '../render/icons';

type Tab = 'inventory' | 'craft' | 'skills' | 'quests' | 'menu';

const TABS: [Tab, string][] = [
  ['inventory', '🎒 Сумка'],
  ['craft', '⚒️ Крафт'],
  ['skills', '⭐ Навыки'],
  ['quests', '📜 Задания'],
  ['menu', '☰ Меню'],
];

export class Panels {
  game!: Game;
  modal: HTMLElement;
  body!: HTMLElement;
  tab: Tab | null = null;
  station: Station = 'hand';
  sel: { where: 'bag' | 'equip'; key: number | string } | null = null;
  private dirty = false;

  constructor(private app: HTMLElement) {
    this.modal = el('div', { class: 'modal hidden' });
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close();
    });
    app.appendChild(this.modal);
  }

  get isOpen() {
    return this.tab !== null;
  }

  open(name: string, arg?: string) {
    if (name === 'map') return;
    const t = name as Tab;
    if (this.tab === t && !arg) {
      this.close();
      return;
    }
    if (t === 'craft') this.station = (arg as Station) ?? (this.game.nearStation && this.game.nearStation.kind in STATIONS ? (this.game.nearStation.kind as Station) : 'hand');
    this.tab = t;
    this.game.paused = true;
    this.game.input.attackHeld = false;
    this.modal.classList.remove('hidden');
    this.render();
    sfx('click');
  }

  close(): boolean {
    if (!this.tab) return false;
    this.tab = null;
    this.game.paused = false;
    this.modal.classList.add('hidden');
    clear(this.modal);
    return true;
  }

  refresh() {
    if (this.tab) this.dirty = true;
  }

  tick(_dt: number) {
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
  }

  private render() {
    if (!this.tab) return;
    const scroll = this.body?.scrollTop ?? 0;
    clear(this.modal);
    const head = el('div', { class: 'ph' });
    for (const [t, label] of TABS) {
      const b = el('button', { class: 't' + (t === this.tab ? ' on' : '') }, label);
      b.addEventListener('click', () => {
        this.tab = t;
        this.render();
      });
      head.append(b);
    }
    const x = el('button', { class: 'x' }, '✕');
    x.addEventListener('click', () => this.close());
    head.append(x);
    this.body = el('div', { class: 'pb' });
    this.modal.append(el('div', { class: 'panel' }, head, this.body));
    switch (this.tab) {
      case 'inventory':
        this.renderInventory();
        break;
      case 'craft':
        this.renderCraft();
        break;
      case 'skills':
        this.renderSkills();
        break;
      case 'quests':
        this.renderQuests();
        break;
      case 'menu':
        this.renderMenu();
        break;
    }
    this.body.scrollTop = scroll;
  }

  // ---------------- Инвентарь ----------------
  private slotEl(it: ItemInst | null, label: string | null, selected: boolean, onClick: () => void) {
    const def = it ? ITEMS[it.id] : null;
    const b = el('button', { class: 'slot' + (selected ? ' sel' : '') });
    if (def && it) {
      b.style.borderColor = def.kind === 'gear' ? RARITY[it.rarity].color : 'rgba(255,255,255,.12)';
      if (def.kind === 'gear' && it.rarity > 0) b.style.background = RARITY[it.rarity].color + '22';
      b.append(iconNode(it.id, def.icon, def.kind === 'gear' ? it.rarity : 0));
      if (it.qty > 1) b.append(el('b', {}, String(it.qty)));
      if (it.plus) b.append(el('span', { class: 'q' }, '+' + it.plus));
      const qi = this.game.player.inv.quick.indexOf(it.uid);
      if (qi >= 0) b.append(el('em', {}, String(qi + 1)));
    } else if (label) b.append(el('em', { style: { position: 'static', fontSize: '10px', textAlign: 'center', lineHeight: '1.1' } }, label));
    b.addEventListener('click', onClick);
    return b;
  }

  private renderInventory() {
    const g = this.game;
    const p = g.player;
    const inv = p.inv;
    const left = el('div');
    const right = el('div');
    left.append(el('div', { class: 'h3' }, 'Снаряжение'));
    const eq = el('div', { class: 'equip' });
    for (const s of EQUIP_SLOTS) {
      const it = inv.equip[s.key];
      eq.append(this.slotEl(it, SLOT_NAMES[s.slot], this.sel?.where === 'equip' && this.sel.key === s.key, () => this.select('equip', s.key)));
    }
    left.append(eq);
    left.append(this.detail());
    left.append(el('div', { class: 'h3', style: { marginTop: '12px' } }, 'Характеристики'));
    left.append(this.statSheet());

    const hdr = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, el('div', { class: 'h3' }, `Сумка (${inv.bag.filter(Boolean).length}/${inv.bag.length})`));
    const sortB = el('button', { class: 'btn' }, 'Сортировать');
    sortB.addEventListener('click', () => {
      inv.sort();
      this.sel = null;
    });
    hdr.append(sortB);
    right.append(hdr);
    const grid = el('div', { class: 'grid' });
    inv.bag.forEach((it, i) => grid.append(this.slotEl(it, null, this.sel?.where === 'bag' && this.sel.key === i, () => this.select('bag', i))));
    right.append(grid);
    right.append(el('div', { class: 'help', style: { marginTop: '10px' } }, 'Выберите предмет, чтобы надеть, использовать, назначить в быстрый слот (1–4) или разобрать. Улучшение — у Кузницы, руны — у Рунного алтаря.'));
    this.body.append(el('div', { class: 'cols' }, left, right));
  }

  private select(where: 'bag' | 'equip', key: number | string) {
    const inv = this.game.player.inv;
    const it = where === 'bag' ? inv.bag[key as number] : inv.equip[key as string];
    if (!it) {
      this.sel = null;
      this.render();
      return;
    }
    // двойной тап по тому же предмету — быстрое действие
    if (this.sel && this.sel.where === where && this.sel.key === key) {
      const def = ITEMS[it.id];
      if (where === 'bag' && def.kind === 'gear') {
        inv.equipFromBag(key as number, this.game.player.cls.id);
        this.sel = null;
        sfx('click');
        return;
      }
      if (def.kind === 'consumable') {
        this.game.useItem(it);
        return;
      }
    }
    this.sel = { where, key };
    this.render();
  }

  private detail(): HTMLElement {
    const g = this.game;
    const p = g.player;
    const inv = p.inv;
    const box = el('div', { class: 'detail' });
    if (!this.sel) {
      box.append(el('div', { class: 'help' }, 'Ничего не выбрано.'));
      return box;
    }
    const it = this.sel.where === 'bag' ? inv.bag[this.sel.key as number] : inv.equip[this.sel.key as string];
    if (!it) {
      this.sel = null;
      box.append(el('div', { class: 'help' }, 'Ничего не выбрано.'));
      return box;
    }
    const def = ITEMS[it.id];
    const color = def.kind === 'gear' ? RARITY[it.rarity].color : '#f4f1e8';
    box.append(el('div', { class: 'nm', style: { color, display: 'flex', alignItems: 'center', gap: '8px' } }, el('span', { class: 'big-ico' }, iconNode(it.id, def.icon, def.kind === 'gear' ? it.rarity : 0)), itemName(it)));
    const sub: string[] = [];
    if (def.kind === 'gear') {
      sub.push(RARITY[it.rarity].name, SLOT_NAMES[def.slot!], `ур. предмета ${it.ilvl}`);
      if (def.classes) sub.push('Классы: ' + def.classes.map((c) => ({ warden: 'Страж', ranger: 'Следопыт', mystic: 'Мистик' })[c]).join(', '));
    } else sub.push({ consumable: 'Расходник', material: 'Материал', rune: 'Руна' }[def.kind as 'consumable']);
    if (def.tradeoff) sub.push('⚖️ С компромиссом');
    box.append(el('div', { class: 'sub' }, sub.join(' · ')));
    for (const ln of itemDescLines(it)) box.append(el('div', { class: 'ln' + (ln.startsWith('−') ? ' neg' : ln.startsWith('+') ? ' pos' : '') }, ln));

    // сравнение с надетым
    if (this.sel.where === 'bag' && def.kind === 'gear') {
      const cur = EQUIP_SLOTS.filter((s) => s.slot === def.slot).map((s) => inv.equip[s.key]).find(Boolean);
      if (cur) box.append(el('div', { class: 'sub', style: { marginTop: '6px' } }, `Сейчас надето: ${itemName(cur)} — ${describeMods(itemMods(cur)).join(', ')}`));
    }

    const btns = el('div', { class: 'btns' });
    const btn = (label: string, fn: () => void, cls = '', disabled = false) => {
      const b = el('button', { class: 'btn ' + cls }, label);
      if (disabled) b.setAttribute('disabled', '');
      b.addEventListener('click', () => {
        fn();
        sfx('click');
        this.render();
      });
      btns.append(b);
    };
    const near = g.nearStation?.kind;
    if (def.kind === 'gear') {
      if (this.sel.where === 'bag') {
        const ok = inv.canEquip(it, p.cls.id);
        btn(ok ? 'Надеть' : 'Не для вашего класса', () => {
          inv.equipFromBag(this.sel!.key as number, p.cls.id);
          this.sel = null;
        }, 'gold', !ok);
      } else
        btn('Снять', () => {
          if (!inv.unequip(this.sel!.key as string)) g.ui.log('Сумка полна!', '#ff8a7a');
          this.sel = null;
        });
      if (def.active) btn('Активировать', () => g.useItem(it), '', this.sel.where !== 'equip');
      // улучшение
      if (it.plus < UPGRADE.length) {
        const u = UPGRADE[it.plus];
        const cost = u.cost.map(([id, q]) => `${ITEMS[id].icon}${q}`).join(' ');
        btn(`Улучшить +${it.plus + 1} (${cost}, ${Math.round(u.chance * 100)}%)`, () => {
          const r = upgradeItem(inv, it, g.rng);
          if (r === 'ok') {
            g.ui.log(`Улучшение успешно: ${itemName(it)}`, '#8aff8a');
            sfx('craft');
          } else if (r === 'fail') g.ui.log('Улучшение не удалось. Материалы потеряны.', '#ff8a7a');
          else if (r === 'cost') g.ui.log('Не хватает материалов для улучшения.', '#ff8a7a');
          p.refreshMods();
        }, '', near !== 'forge');
      }
      // руны
      if (it.runes.length < it.sockets) {
        const runes = inv.bag.filter((x) => x && ITEMS[x.id].kind === 'rune') as ItemInst[];
        const seen = new Set<string>();
        for (const r of runes) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          btn(`Вставить ${ITEMS[r.id].icon} ${ITEMS[r.id].name}`, () => {
            if (socketRune(inv, it, r.id)) {
              g.ui.log(`Руна вставлена: ${ITEMS[r.id].name}`, '#c8a0ff');
              p.refreshMods();
            }
          }, '', near !== 'altar');
        }
      }
      if (this.sel.where === 'bag')
        btn('Разобрать', () => {
          const got = salvage(inv, this.sel!.key as number, g.rng);
          if (got) g.ui.log(`Разобрано: ${got.map(([id, q]) => ITEMS[id].icon + '×' + q).join(' ')}`, '#e8e0c8');
          this.sel = null;
        }, 'red');
      if (near !== 'forge' && it.plus < UPGRADE.length) btns.append(el('div', { class: 'help', style: { width: '100%' } }, 'Улучшение доступно у Кузницы в лагере, вставка рун — у Рунного алтаря.'));
    }
    if (def.kind === 'consumable') btn('Использовать', () => g.useItem(it), 'gold');
    if (def.kind === 'consumable' || def.active) {
      for (let i = 0; i < 4; i++)
        btn(`В слот ${i + 1}`, () => {
          const q = inv.quick;
          for (let j = 0; j < 4; j++) if (q[j] === it.uid) q[j] = null;
          q[i] = it.uid;
        });
    }
    if (this.sel.where === 'bag')
      btn('Выбросить', () => {
        inv.bag[this.sel!.key as number] = null;
        inv.onChange();
        this.sel = null;
      }, 'red');
    box.append(btns);
    return box;
  }

  private statSheet(): HTMLElement {
    const s = this.game.player.stats;
    const rows: [string, string][] = [
      ['💪 Сила / 🏃 Ловкость / 🧠 Интеллект', `${Math.round(s.str)} / ${Math.round(s.agi)} / ${Math.round(s.int)}`],
      ['❤️ Здоровье (реген.)', `${Math.round(s.maxHp)} (${s.hpRegen.toFixed(1)}/с)`],
      ['💧 Мана (реген.)', `${Math.round(s.maxMp)} (${s.mpRegen.toFixed(1)}/с)`],
      ['⚔️ Урон', String(Math.round(s.damage))],
      ['⏱️ Атак в секунду', s.attackRate.toFixed(2)],
      ['🛡️ Броня', `${s.armor.toFixed(1)} (−${Math.round((1 - (1 - (0.06 * s.armor) / (1 + 0.06 * Math.abs(s.armor)))) * 100)}% физ.)`],
      ['🔰 Сопр. магии', Math.round(s.magicResist * 100) + '%'],
      ['👟 Скорость бега', s.moveSpeed.toFixed(1)],
      ['🎯 Крит (сила)', `${Math.round(s.critChance)}% (×${s.critMult.toFixed(2)})`],
      ['🩸 Вампиризм / 💨 Уклонение', `${Math.round(s.lifesteal)}% / ${Math.round(s.evasion)}%`],
      ['✨ Сила способностей / ⌛ КД', `+${Math.round(s.spellAmp)}% / −${Math.round(s.cdr)}%`],
    ];
    if (s.thorns) rows.push(['🦔 Отражение', Math.round(s.thorns) + '%']);
    if (s.dmgTakenPct || s.magicTakenPct) rows.push(['⚠️ Доп. получаемый урон', `${Math.round(s.dmgTakenPct)}% / маг. ${Math.round(s.magicTakenPct)}%`]);
    const box = el('div', { class: 'stats' });
    for (const [a, b] of rows) box.append(el('span', {}, a), el('span', {}, b));
    return box;
  }

  // ---------------- Крафт ----------------
  private renderCraft() {
    const g = this.game;
    const p = g.player;
    const near = g.nearStation?.kind;
    const tabs = el('div', { class: 'sw-row', style: { marginBottom: '10px' } });
    for (const k of Object.keys(STATIONS) as Station[]) {
      const st = STATIONS[k];
      const avail = k === 'hand' || near === k;
      const b = el('button', { class: 'btn' + (k === this.station ? ' gold' : '') }, `${st.icon} ${st.name}${avail ? '' : ' 🔒'}`);
      b.addEventListener('click', () => {
        this.station = k;
        this.render();
      });
      tabs.append(b);
    }
    this.body.append(tabs);
    const st = STATIONS[this.station];
    const avail = this.station === 'hand' || near === this.station;
    this.body.append(el('div', { class: 'help', style: { marginBottom: '8px' } }, `${st.desc}. ${avail ? '' : '⚠️ Подойдите к этой станции в лагере, чтобы создавать предметы.'}`));
    for (const r of recipesFor(this.station)) {
      const def = ITEMS[r.out];
      const chk = canCraft(p.inv, r, p.level);
      const ins = el('div', { class: 'in' });
      r.inputs.forEach(([id, q], i) => {
        const have = p.inv.count(id);
        ins.append(el('span', { class: have >= q ? 'ok' : 'no' }, `${ITEMS[id].icon} ${ITEMS[id].name} ${have}/${q}`), i < r.inputs.length - 1 ? ' · ' : '');
      });
      if ((r.level ?? 1) > 1) ins.append(el('span', { class: p.level >= r.level! ? 'ok' : 'no' }, ` · ур. ${r.level}`));
      const stats = def.stats ? describeMods(def.stats).join(', ') : def.desc ?? '';
      const b = el('button', { class: 'btn gold' }, 'Создать');
      if (!chk.ok || !avail) b.setAttribute('disabled', '');
      b.addEventListener('click', () => {
        const out = craft(p.inv, r, p.level, g.rng);
        if (out) {
          const color = ITEMS[out.id].kind === 'gear' ? RARITY[out.rarity].color : '#e8e0c8';
          g.ui.log(`Создано: ${ITEMS[out.id].icon} ${itemName(out)}${(r.qty ?? 1) > 1 ? ' ×' + r.qty : ''}`, color);
          g.onCraft();
          sfx('craft');
        }
        this.render();
      });
      this.body.append(
        el(
          'div',
          { class: 'recipe' + (chk.ok && avail ? '' : ' dis') },
          el('div', { class: 'ic' }, iconNode(def.id, def.icon, 1)),
          el('div', { class: 'info' }, el('div', { class: 'n' }, `${def.name}${(r.qty ?? 1) > 1 ? ' ×' + r.qty : ''}${def.tradeoff ? ' ⚖️' : ''}`), el('div', { class: 'in', style: { color: '#d8d2c0' } }, stats), ins),
          b,
        ),
      );
    }
  }

  // ---------------- Навыки ----------------
  private renderSkills() {
    const g = this.game;
    const p = g.player;
    const left = el('div');
    left.append(el('div', { class: 'h3' }, `${p.cls.icon} ${p.cls.name} · Уровень ${p.level} · Очков: ${p.skillPoints}`));
    for (let i = 0; i < 4; i++) {
      const def = p.ability(i);
      const lvl = p.abil[i];
      const up = el('button', { class: 'btn gold' }, `+ (${lvl}/${def.maxLevel})`);
      if (!p.canLevelAbility(i)) up.setAttribute('disabled', '');
      up.addEventListener('click', () => {
        if (p.levelAbility(i)) sfx('click');
        this.render();
      });
      const l = Math.max(1, lvl);
      const mana = def.mana[Math.min(def.mana.length - 1, l - 1)];
      const cd = def.cd[Math.min(def.cd.length - 1, l - 1)];
      const key = IS_TOUCH ? '' : ` [${['Q', 'E', 'R', 'T'][i]}]`;
      left.append(
        el(
          'div',
          { class: 'abrow' },
          el('div', { class: 'ic', style: i === 3 ? { borderColor: '#ff8a5a' } : {} }, def.icon),
          el('div', { class: 'd' }, el('div', { class: 'n' }, def.name + (i === 3 ? ' (ульта)' : '') + key), el('div', {}, def.desc(l)), el('div', { class: 'm' }, `Мана: ${mana} · Перезарядка: ${cd} с${i === 3 ? ' · Изучается на 6/12/18 ур.' : ''}`)),
          up,
        ),
      );
    }
    left.append(el('div', { class: 'abrow' }, el('div', { class: 'ic' }, p.cls.passive.icon), el('div', { class: 'd' }, el('div', { class: 'n' }, `${p.cls.passive.name} (пассивная)`), el('div', {}, p.cls.passive.desc))));

    const right = el('div');
    right.append(el('div', { class: 'h3' }, 'Таланты'));
    const pend = p.pendingTalentTier();
    const tal = el('div', { class: 'talents' });
    for (let t = p.cls.talents.length - 1; t >= 0; t--) {
      const row = el('div', { class: 'trow' }, el('div', { class: 'lvl' }, String(TALENT_LEVELS[t])));
      p.cls.talents[t].forEach((td, idx) => {
        const on = p.talents.includes(td.id);
        const b = el('div', { class: 'tal' + (on ? ' on' : pend === t ? ' avail' : '') }, td.name);
        b.addEventListener('click', () => {
          if (p.chooseTalent(t, idx)) {
            g.ui.log(`Талант выбран: ${td.name}`, '#ffd76a');
            sfx('levelup');
          }
          this.render();
        });
        row.append(b);
      });
      tal.append(row);
    }
    right.append(tal);
    right.append(el('div', { class: 'help', style: { marginTop: '8px' } }, 'На 10, 15, 20 и 25 уровнях выберите один из двух талантов — выбор окончательный.'));
    right.append(el('div', { class: 'h3', style: { marginTop: '12px' } }, 'Характеристики'));
    right.append(this.statSheet());
    this.body.append(el('div', { class: 'cols' }, left, right));
  }

  // ---------------- Задания ----------------
  private renderQuests() {
    const g = this.game;
    this.body.append(el('div', { class: 'h3' }, 'Доска наград лагеря'));
    for (const q of g.quests) {
      this.body.append(
        el(
          'div',
          { class: 'recipe' },
          el('div', { class: 'ic' }, q.kind === 'kill' ? '⚔️' : q.kind === 'gather' ? '🧺' : q.kind === 'craft' ? '⚒️' : '👹'),
          el('div', { class: 'info' }, el('div', { class: 'n' }, questTitle(q)), el('div', { class: 'in' }, `Прогресс: ${q.have}/${q.need} · Награда: ${q.xp} опыта, ${q.reward.map(([id, c]) => `${ITEMS[id].icon} ${ITEMS[id].name} ×${c}`).join(', ')}`)),
        ),
      );
    }
    this.body.append(
      el(
        'div',
        { class: 'help', style: { marginTop: '10px' } },
        el('b', {}, 'Советы выжившего. '),
        'Сложность растёт с удалением от лагеря — следите за уровнем зоны под миникартой. Поваленные Колоссы (👹 на карте) охраняет Каменный Молотоогр. Отдых у костра восстанавливает силы и сохраняет игру. Ночью монстров больше, но и элитные враги встречаются чаще.',
      ),
    );
  }

  // ---------------- Меню ----------------
  private renderMenu() {
    const g = this.game;
    const btns = el('div', { class: 'main-btns', style: { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px' } });
    const b = (label: string, fn: () => void, cls = 'btn') => {
      const e = el('button', { class: cls }, label);
      e.addEventListener('click', fn);
      btns.append(e);
    };
    b('▶ Продолжить', () => this.close(), 'btn gold');
    b('💾 Сохранить', () => {
      g.save();
      g.ui.log('Игра сохранена.', '#8aff8a');
      this.close();
    });
    b(soundOn ? '🔊 Звук: вкл' : '🔇 Звук: выкл', () => {
      setSound(!soundOn);
      updateSettings({ sound: soundOn });
      this.render();
    });
    const row = (label: string, opts: [string, string][], cur: string, set: (v: string) => void) => {
      const r = el('div', { class: 'sw-row', style: { alignItems: 'center' } }, el('span', { style: { fontWeight: '800', fontSize: '13px', minWidth: '120px' } }, label));
      for (const [v, name] of opts) {
        const e = el('button', { class: 'btn' + (v === cur ? ' gold' : '') }, name);
        e.addEventListener('click', () => {
          set(v);
          this.render();
        });
        r.append(e);
      }
      btns.append(r);
    };
    row('🎨 Графика', Object.entries(QUALITY_NAMES), settings.quality, (v) => {
      updateSettings({ quality: v as Quality });
      g.grass.rebuild();
    });
    row('📷 Диорама', Object.entries(DOF_NAMES), settings.dof, (v) => updateSettings({ dof: v as DofMode }));
    b('🗑️ Новая игра (удалить сохранение)', () => {
      if (confirm('Удалить сохранение и начать заново?')) {
        clearSave();
        location.reload();
      }
    }, 'btn red');
    this.body.append(el('div', { class: 'cols' }, btns, this.controlsHelp()));
  }

  controlsHelp(): HTMLElement {
    return el(
      'div',
      { class: 'help' },
      el('div', { class: 'h3' }, 'Управление'),
      el('div', { html: '<b>Телефон:</b> касание левой части экрана — джойстик. Большая кнопка — атака (зажмите). Кнопки способностей: <b>тап</b> — применить к ближайшему врагу, <b>перетянуть</b> — прицелиться, увести палец на ✖ — отмена. <b>Auto</b> — автобой.' }),
      el('div', { html: '<b>ПК:</b> WASD — движение, ЛКМ/Пробел — атака, <b>Q E R T</b> — способности (зажмите для прицела мышью), 1–4 — быстрые слоты, F — взаимодействие/добыча, I — сумка, C — крафт, K — навыки, G — автобой, Esc — меню.', style: { marginTop: '6px' } }),
    );
  }
}
