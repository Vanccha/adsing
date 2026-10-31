import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validateAction } from '@engine/core';
import type { Action, Difficulty, Mode } from '@engine/core';
import type { MarketId } from '@engine/data/schema';
import { MARKETS, SCENARIOS, marketInfo, scenarioStatus, scenarioTitle } from '../engine/bundle';
import { DEFAULT_START_DATE, makeInitial } from '../engine/jobs';
import type { GameConfig } from '../engine/jobs';
import { makeFmt } from '../format';
import { useGame } from '../game/GameContext';
import { readSaves, readShareParams, shareParams } from '../game/storage';
import { go } from '../router';
import { FactBadge } from '../components/FactBadge';

const randomSeed = (): string => Math.random().toString(36).slice(2, 8);

export function Start() {
  const { t, i18n } = useTranslation();
  const g = useGame();
  const share = useMemo(() => (typeof location !== 'undefined' ? readShareParams(location.search) : {}), []);
  const [market, setMarket] = useState<MarketId>(share.market ?? 'tr');
  const [scenario, setScenario] = useState<string>(share.scenario ?? 'salon-saas');
  const [difficulty, setDifficulty] = useState<Difficulty>(share.difficulty ?? 'normal');
  const [mode, setMode] = useState<Mode>(share.mode ?? 'full');
  const [learning, setLearning] = useState(true);
  const [seed, setSeed] = useState<string>(share.seed ?? randomSeed());
  const [ch, setCh] = useState({ google: true, meta: false, local: true, geo: false });
  const [prep, setPrep] = useState({ tracking: true, lp: false });
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg: GameConfig = { market, scenario, difficulty, mode, learningMode: learning, seed: seed.trim() || 'default', startDate: DEFAULT_START_DATE };
  const preview = useMemo(() => {
    try {
      return { state: makeInitial(cfg), error: null as string | null };
    } catch (e) {
      return { state: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [market, scenario, difficulty, mode, seed]);
  const info = marketInfo(market);
  const fmt = makeFmt(info.locale, info.currency);

  const prepActions: Array<{ key: 'tracking' | 'lp'; a: Action }> = [
    { key: 'tracking', a: { type: 'track.fix', params: { level: 'basic' } } },
    { key: 'lp', a: { type: 'asset.create_lp', params: {} } },
  ];
  const saves = readSaves();
  const slots = Object.entries(saves);

  const begin = () => {
    g.start(cfg, { ...prep, ...ch });
    go('dashboard');
  };
  const legal = info.legal as { disclaimer?: string; consentRegime?: string };

  return (
    <div className="stack">
      <h1>{t('start.title')}</h1>
      <p>{t('start.intro')}</p>
      <div className="notice">{t('honesty.long')}</div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (preview.state) begin();
        }}
      >
        <fieldset>
          <legend>{t('start.setup')}</legend>
          <div className="form-grid">
            <label className="field">
              {t('start.market')}
              <select value={market} onChange={(e) => setMarket(e.target.value as MarketId)}>
                {MARKETS.map((m) => (
                  <option key={m} value={m}>{t(`market.${m}`)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('start.scenario')}
              <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                {SCENARIOS.map((s) => (
                  <option key={s} value={s}>
                    {scenarioTitle(s, i18n.language)}
                    {scenarioStatus(s) === 'skeleton' ? ` (${t('start.skeleton')})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('start.difficulty')}
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                {(['easy', 'normal', 'hard'] as const).map((d) => (
                  <option key={d} value={d}>{t(`difficulty.${d}`)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('start.mode')}
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="full">{t('mode.full')}</option>
                <option value="quick">{t('mode.quick')}</option>
              </select>
            </label>
            <label className="field">
              {t('start.seed')}
              <span className="row">
                <input value={seed} onChange={(e) => setSeed(e.target.value)} aria-label={t('start.seed')} />
                <button type="button" onClick={() => setSeed(randomSeed())}>{t('start.seed_random')}</button>
              </span>
            </label>
          </div>
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={learning} onChange={(e) => setLearning(e.target.checked)} />
            <span>
              <strong>{t('start.learning')}</strong>
              <br />
              <span className="small muted">{difficulty === 'hard' ? t('start.learning_hard') : t('start.learning_desc')}</span>
            </span>
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={async () => {
                const url = `${location.origin}${location.pathname}?${shareParams(cfg)}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                } catch {
                  window.prompt(t('start.share'), url);
                }
              }}
            >
              {t('start.share')}
            </button>
            {copied ? <span role="status" className="small">{t('start.copied')}</span> : null}
          </div>
        </fieldset>

        {preview.error ? (
          <div className="notice bad" role="alert">{t('start.init_error')}: {preview.error}</div>
        ) : preview.state ? (
          <div className="card">
            <h2>{t('start.preview')}</h2>
            <div className="grid cols-4">
              <div>
                <div className="small muted">{t('start.start_cash')} <FactBadge id={`scn.start_cash.${difficulty}`} market={market} scenario={scenario} /></div>
                <strong className="num">{fmt.money(preview.state.startCash)}</strong>
              </div>
              <div>
                <div className="small muted">{t('start.price')} <FactBadge id="price.monthly" market={market} scenario={scenario} /></div>
                <strong className="num">{fmt.money(preview.state.product.price)}</strong>
              </div>
              <div>
                <div className="small muted">{t('start.goal_mrr')} <FactBadge id={`scn.goal.${mode === 'quick' ? '90d' : '12m'}.target_mrr`} market={market} scenario={scenario} /></div>
                <strong className="num">{fmt.money(preview.state.goals.mrr)}</strong>
              </div>
              <div>
                <div className="small muted">{t('start.horizon')}</div>
                <strong>{t('start.days', { n: preview.state.horizon })}</strong>
              </div>
            </div>
            {legal.consentRegime ? <p className="small muted" style={{ marginTop: 8 }}>{t('start.consent')}: {legal.consentRegime}</p> : null}
          </div>
        ) : null}

        <fieldset>
          <legend>{t('start.channels')}</legend>
          <div className="grid cols-2">
            {(['google', 'meta', 'local', 'geo'] as const).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={ch[k]} onChange={(e) => setCh({ ...ch, [k]: e.target.checked })} />
                <span>
                  <strong>{t(`channel.${k}`)}</strong>
                  <br />
                  <span className="small muted">{t(`channel.${k}.desc`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('start.prep')}</legend>
          <p className="small muted">{t('start.prep_desc')}</p>
          {prepActions.map(({ key, a }) => {
            const v = preview.state ? validateAction(preview.state, a) : null;
            return (
              <label key={key} className="check">
                <input type="checkbox" checked={prep[key]} onChange={(e) => setPrep({ ...prep, [key]: e.target.checked })} />
                <span>
                  <strong>{t(`start.prep.${key}`)}</strong>
                  <br />
                  <span className="small muted">
                    {t(`start.prep.${key}.desc`)}
                    {v ? ` — ${t('queue.cost', { hours: v.hours, cash: fmt.money(v.cash) })}` : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="row">
          <button type="submit" className="primary" disabled={!preview.state}>{t('start.begin')}</button>
          <button type="button" onClick={() => fileRef.current?.click()}>{t('save.import')}</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label={t('save.import')}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const ok = await g.importJson(await f.text());
              if (ok) go('dashboard');
            }}
          />
        </div>
      </form>

      {slots.length ? (
        <section className="card" aria-labelledby="saves-h">
          <h2 id="saves-h">{t('save.slots')}</h2>
          <ul>
            {slots.map(([slot, f]) => (
              <li key={slot}>
                <strong>{slot}</strong> — {f.cfg.market.toUpperCase()}, {t('top.day', { day: f.day, total: f.cfg.mode === 'quick' ? 90 : 365 })}, {f.savedAt.slice(0, 16).replace('T', ' ')}{' '}
                <button type="button" onClick={async () => { if (await g.load(slot)) go('dashboard'); }}>{t('save.load')}</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
