// Kayıt/yükleme: localStorage (try/catch). Kayıt = yapılandırma + ActionLog; yükleme yeniden oynatır (deterministik).
import type { Action, ActionLog } from '@engine/core';
import type { GameConfig } from '../engine/jobs';

export interface SaveFile {
  v: 1;
  label: string;
  savedAt: string;
  cfg: GameConfig;
  log: ActionLog;
  day: number;
  queue: Action[];
}

const KEY = 'adsing.saves.v1';

export function readSaves(): Record<string, SaveFile> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SaveFile>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSave(slot: string, f: SaveFile): boolean {
  try {
    const all = readSaves();
    all[slot] = f;
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave(slot: string): void {
  try {
    const all = readSaves();
    delete all[slot];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* yok say */
  }
}

export function parseSaveFile(text: string): SaveFile | null {
  try {
    const o = JSON.parse(text) as Partial<SaveFile>;
    if (!o || o.v !== 1 || !o.cfg || !Array.isArray(o.log) || typeof o.day !== 'number') return null;
    const c = o.cfg;
    if (typeof c.seed !== 'string' || !['us', 'de', 'tr'].includes(c.market)) return null;
    return { v: 1, label: o.label ?? '', savedAt: o.savedAt ?? '', cfg: c, log: o.log, day: o.day, queue: Array.isArray(o.queue) ? o.queue : [] };
  } catch {
    return null;
  }
}

export function shareParams(cfg: GameConfig): string {
  const p = new URLSearchParams({ seed: cfg.seed, market: cfg.market, scenario: cfg.scenario, mode: cfg.mode, difficulty: cfg.difficulty });
  return p.toString();
}

export function readShareParams(search: string): Partial<GameConfig> {
  const p = new URLSearchParams(search);
  const out: Partial<GameConfig> = {};
  const seed = p.get('seed');
  if (seed) out.seed = seed;
  const m = p.get('market');
  if (m === 'us' || m === 'de' || m === 'tr') out.market = m;
  const sc = p.get('scenario');
  if (sc) out.scenario = sc;
  const mode = p.get('mode');
  if (mode === 'full' || mode === 'quick') out.mode = mode;
  const d = p.get('difficulty');
  if (d === 'easy' || d === 'normal' || d === 'hard') out.difficulty = d;
  return out;
}
