// Oyun oturumu: durum, gözlem günlüğü, aksiyon kuyruğu, ilerletme, kayıt/yükleme. Tüm motor çağrıları runJob üzerinden.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { extractLog } from '@engine/core';
import type { Action, ActionResult, GameEvent, GameState } from '@engine/core';
import { marketInfo } from '../engine/bundle';
import { runJob } from '../engine/client';
import { makeInitial } from '../engine/jobs';
import type { GameConfig } from '../engine/jobs';
import type { ObsDay } from '../engine/obs';
import { makeFmt } from '../format';
import type { Fmt } from '../format';
import { setupActions } from './plan';
import type { SetupChoices } from './plan';
import { parseSaveFile, readSaves, writeSave } from './storage';
import type { SaveFile } from './storage';
import { weeklySummary } from './weekly';
import type { WeeklySummary } from './weekly';

export interface FeedItem {
  day: number;
  event: GameEvent;
}
export interface ResultItem {
  day: number;
  result: ActionResult;
}

export interface Ctx {
  cfg: GameConfig | null;
  state: GameState | null;
  obs: ObsDay[];
  queue: Action[];
  feed: FeedItem[];
  results: ResultItem[];
  busy: boolean;
  error: string | null;
  weekly: WeeklySummary | null;
  fmt: Fmt;
  hintsOn: boolean;
  start: (cfg: GameConfig, choices: SetupChoices) => void;
  enqueue: (a: Action | Action[]) => void;
  dequeue: (i: number) => void;
  clearQueue: () => void;
  advance: (days: number) => Promise<void>;
  closeWeekly: () => void;
  setLearning: (on: boolean) => void;
  save: (slot: string, label?: string) => boolean;
  load: (slot: string) => Promise<boolean>;
  exportJson: () => string;
  importJson: (text: string) => Promise<boolean>;
  reset: () => void;
}

const GameCtx = createContext<Ctx | null>(null);

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('GameProvider yok');
  return c;
}

export function GameProvider({ children, marketHint }: { children: ReactNode; marketHint?: GameConfig['market'] }) {
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [obs, setObs] = useState<ObsDay[]>([]);
  const [queue, setQueue] = useState<Action[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const busyRef = useRef(false);

  const fmt = useMemo(() => {
    const info = marketInfo(cfg?.market ?? marketHint ?? 'us');
    return makeFmt(info.locale, info.currency);
  }, [cfg?.market, marketHint]);

  const hintsOn = !!state && state.learningMode && state.difficulty !== 'hard';

  const reset = useCallback(() => {
    setCfg(null);
    setState(null);
    setObs([]);
    setQueue([]);
    setFeed([]);
    setResults([]);
    setWeekly(null);
    setError(null);
  }, []);

  const start = useCallback((c: GameConfig, choices: SetupChoices) => {
    try {
      const s = makeInitial(c);
      setCfg(c);
      setState(s);
      setObs([]);
      setFeed([]);
      setResults([]);
      setWeekly(null);
      setQueue(setupActions(s, choices));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const enqueue = useCallback((a: Action | Action[]) => setQueue((q) => [...q, ...(Array.isArray(a) ? a : [a])]), []);
  const dequeue = useCallback((i: number) => setQueue((q) => q.filter((_, k) => k !== i)), []);
  const clearQueue = useCallback(() => setQueue([]), []);

  const persist = useCallback((slot: string, c: GameConfig, s: GameState, q: Action[], label = ''): boolean => {
    const f: SaveFile = { v: 1, label, savedAt: new Date().toISOString(), cfg: c, log: extractLog(s), day: s.day, queue: q };
    return writeSave(slot, f);
  }, []);

  const advance = useCallback(
    async (days: number) => {
      if (!state || !cfg || busyRef.current || state.outcome) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await runJob({ job: 'advance', state, actions: queue, days, ...(obs.length ? { prevObs: obs[obs.length - 1]! } : {}) });
        if (res.job !== 'advance') return;
        const { state: ns, obs: no, days: dl } = res.result;
        const allObs = [...obs, ...no];
        setState(ns);
        setObs(allObs);
        setQueue([]);
        setFeed((f) => [...f, ...dl.flatMap((d) => d.events.map((event) => ({ day: d.day, event })))].slice(-300));
        setResults((r) => [...r, ...dl.flatMap((d) => d.results.map((result) => ({ day: d.day, result })))].slice(-300));
        if (Math.floor(ns.day / 7) > Math.floor(state.day / 7) || ns.outcome) {
          setWeekly(weeklySummary(ns, allObs, ns.learningMode && ns.difficulty !== 'hard'));
        }
        persist('auto', cfg, ns, [], 'auto');
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [state, cfg, queue, obs, persist],
  );

  const restoreFile = useCallback(async (f: SaveFile): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await runJob({ job: 'replay', cfg: f.cfg, log: f.log, upToDay: f.day });
      if (res.job !== 'replay') return false;
      setCfg(f.cfg);
      setState(res.result.state);
      setObs(res.result.obs);
      setQueue(f.queue);
      setFeed(res.result.state.events.map((event) => ({ day: event.day, event })));
      setResults([]);
      setWeekly(null);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const load = useCallback(
    async (slot: string) => {
      const f = readSaves()[slot];
      return f ? restoreFile(f) : false;
    },
    [restoreFile],
  );

  const save = useCallback((slot: string, label?: string) => (cfg && state ? persist(slot, cfg, state, queue, label ?? slot) : false), [cfg, state, queue, persist]);

  const exportJson = useCallback((): string => {
    if (!cfg || !state) return '';
    const f: SaveFile = { v: 1, label: 'export', savedAt: new Date().toISOString(), cfg, log: extractLog(state), day: state.day, queue };
    return JSON.stringify(f, null, 2);
  }, [cfg, state, queue]);

  const importJson = useCallback(
    async (text: string) => {
      const f = parseSaveFile(text);
      return f ? restoreFile(f) : false;
    },
    [restoreFile],
  );

  const setLearning = useCallback((on: boolean) => {
    setCfg((c) => (c ? { ...c, learningMode: on } : c));
    setState((s) => (s ? { ...s, learningMode: on } : s));
  }, []);

  const value: Ctx = {
    cfg, state, obs, queue, feed, results, busy, error, weekly, fmt, hintsOn,
    start, enqueue, dequeue, clearQueue, advance, closeWeekly: () => setWeekly(null), setLearning, save, load, exportJson, importJson, reset,
  };
  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}
