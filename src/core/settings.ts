// Настройки графики, сохраняются в localStorage.

export type Quality = 'high' | 'medium' | 'low';
export type DofMode = 'strong' | 'moderate' | 'off';

export interface Settings {
  quality: Quality;
  dof: DofMode;
  sound: boolean;
}

const KEY = 'dawnruins.settings.v1';

function load(): Settings {
  const def: Settings = { quality: 'high', dof: 'strong', sound: true };
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...def, ...JSON.parse(s) };
  } catch {
    /* хранилище недоступно */
  }
  return def;
}

export const settings: Settings = load();
const listeners: (() => void)[] = [];

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function onSettings(fn: () => void) {
  listeners.push(fn);
}

export const QUALITY_NAMES: Record<Quality, string> = { high: 'Высокое', medium: 'Среднее', low: 'Низкое' };
export const DOF_NAMES: Record<DofMode, string> = { strong: 'Сильное', moderate: 'Умеренное', off: 'Выкл' };
