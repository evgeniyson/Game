// Классы персонажей, их базовые характеристики, пассивки и таланты.
import type { BaseDef, Mods } from '../combat/stats';

export type ClassId = 'warden' | 'ranger' | 'mystic';

export interface TalentDef {
  id: string;
  name: string;
  mods?: Mods;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  icon: string;
  role: string;
  desc: string;
  base: BaseDef;
  ranged: boolean;
  abilities: [string, string, string, string];
  passive: { name: string; icon: string; desc: string };
  startItems: string[];
  talents: [TalentDef, TalentDef][]; // уровни 10/15/20/25
}

export const TALENT_LEVELS = [10, 15, 20, 25];

export const CLASSES: Record<ClassId, ClassDef> = {
  warden: {
    id: 'warden',
    name: 'Страж',
    icon: '🛡️',
    role: 'Танк · ближний бой · Сила',
    desc: 'Закованный в латы из обломков древних машин защитник лагеря. Оглушает, врывается в толпу и отражает урон.',
    base: { str: 24, agi: 14, int: 12, strGain: 3, agiGain: 1.6, intGain: 1.4, primary: 'str', baseHp: 180, baseMp: 50, baseHpRegen: 1.5, baseMpRegen: 0.5, baseArmor: 3, baseMR: 15, baseDamage: 16, attackRate: 0.85, attackRange: 2.0, moveSpeed: 5.0 },
    ranged: false,
    abilities: ['shieldBash', 'charge', 'spikedShell', 'earthsplitter'],
    passive: { name: 'Тяжёлая рука', icon: '✊', desc: 'Каждая 4-я атака наносит +50% урона и оглушает на 0.6 с.' },
    startItems: ['pipeClub', 'stopSign', 'potionHp', 'potionHp', 'potionHp'],
    talents: [
      [{ id: 'w10a', name: '+14 к урону', mods: { damage: 14 } }, { id: 'w10b', name: '+250 к здоровью', mods: { maxHp: 250 } }],
      [{ id: 'w15a', name: 'Удар щитом: +0.6 с оглушения' }, { id: 'w15b', name: '+8 к броне', mods: { armor: 8 } }],
      [{ id: 'w20a', name: 'Рывок оглушает на 0.8 с' }, { id: 'w20b', name: '+25% отражения урона', mods: { thorns: 25 } }],
      [{ id: 'w25a', name: 'Разлом земли: −30 с перезарядки' }, { id: 'w25b', name: '+15% вампиризма', mods: { lifesteal: 15 } }],
    ],
  },
  ranger: {
    id: 'ranger',
    name: 'Следопыт',
    icon: '🏹',
    role: 'Стрелок · дальний бой · Ловкость',
    desc: 'Охотник руин, знающий каждую тропу. Ставит капканы, засыпает врагов стрелами и неуловим в бою.',
    base: { str: 16, agi: 24, int: 14, strGain: 1.8, agiGain: 3, intGain: 1.6, primary: 'agi', baseHp: 140, baseMp: 60, baseHpRegen: 1, baseMpRegen: 0.6, baseArmor: 1, baseMR: 15, baseDamage: 12, attackRate: 0.9, attackRange: 9, moveSpeed: 5.4 },
    ranged: true,
    abilities: ['arrowFan', 'trap', 'roll', 'arrowRain'],
    passive: { name: 'Меткость', icon: '🎯', desc: 'Атаки по одной и той же цели дают +6% шанса крита (до 5 раз).' },
    startItems: ['shortBow', 'quiver', 'potionHp', 'potionHp', 'potionHp'],
    talents: [
      [{ id: 'r10a', name: '+15% скорости атаки', mods: { attackSpeedPct: 15 } }, { id: 'r10b', name: '+10 к ловкости', mods: { agi: 10 } }],
      [{ id: 'r15a', name: 'Веер стрел: +2 стрелы' }, { id: 'r15b', name: '+12% уклонения', mods: { evasion: 12 } }],
      [{ id: 'r20a', name: 'Капкан: +1.5 с корней' }, { id: 'r20b', name: '+0.5 к силе крита', mods: { critMult: 0.5 } }],
      [{ id: 'r25a', name: 'Град стрел: замедление 60%' }, { id: 'r25b', name: '+20% вампиризма', mods: { lifesteal: 20 } }],
    ],
  },
  mystic: {
    id: 'mystic',
    name: 'Мистик Рун',
    icon: '🔮',
    role: 'Маг · контроль · Интеллект',
    desc: 'Читает руны древних, оставленные на Колоссах. Повелевает огнём, льдом и молнией, мерцает сквозь пространство.',
    base: { str: 15, agi: 14, int: 26, strGain: 1.6, agiGain: 1.4, intGain: 3.2, primary: 'int', baseHp: 130, baseMp: 90, baseHpRegen: 0.8, baseMpRegen: 1.0, baseArmor: 0, baseMR: 20, baseDamage: 10, attackRate: 0.75, attackRange: 8, moveSpeed: 5.0 },
    ranged: true,
    abilities: ['fireOrb', 'frostNova', 'blink', 'chainLightning'],
    passive: { name: 'Резонанс', icon: '🔮', desc: 'Каждая способность даёт заряд. На 3 зарядах следующая способность не тратит ману.' },
    startItems: ['branchStaff', 'runeFocus', 'potionHp', 'potionHp', 'potionMp', 'potionMp'],
    talents: [
      [{ id: 'm10a', name: '+180 к мане', mods: { maxMp: 180 } }, { id: 'm10b', name: '+12% силы способностей', mods: { spellAmp: 12 } }],
      [{ id: 'm15a', name: 'Мерцание: −3 с перезарядки' }, { id: 'm15b', name: '+15% сопр. магии', mods: { magicResist: 15 } }],
      [{ id: 'm20a', name: 'Ледяная нова замораживает' }, { id: 'm20b', name: '+3 к регенерации маны', mods: { mpRegen: 3 } }],
      [{ id: 'm25a', name: 'Цепная молния: +3 прыжка' }, { id: 'm25b', name: '+20% сокращения КД', mods: { cdr: 20 } }],
    ],
  },
};
