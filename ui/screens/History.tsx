import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeAction } from '../components/Actions';
import { shareParams, readSaves, deleteSave } from '../game/storage';
import { useGame } from '../game/GameContext';

export function History() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const [slot, setSlot] = useState('slot1');
  const [msg, setMsg] = useState('');
  const [saves, setSaves] = useState(readSaves());
  const fileRef = useRef<HTMLInputElement>(null);
  const exportFile = () => {
    const blob = new Blob([g.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adsing-${g.cfg!.seed}-d${s.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="stack">
      <h1>{t('nav.history')}</h1>
      <section className="card">
        <h2>{t('save.title')}</h2>
        <div className="row">
          <label className="field">{t('save.slot')}<input value={slot} onChange={(e) => setSlot(e.target.value)} /></label>
          <button type="button" className="primary" onClick={() => { setMsg(g.save(slot) ? t('save.saved') : t('save.failed')); setSaves(readSaves()); }}>{t('save.save')}</button>
          <button type="button" onClick={exportFile}>{t('save.export')}</button>
          <button type="button" onClick={() => fileRef.current?.click()}>{t('save.import')}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label={t('save.import')} onChange={async (e) => { const f = e.target.files?.[0]; if (f) setMsg((await g.importJson(await f.text())) ? t('save.loaded') : t('save.bad_file')); }} />
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?${shareParams(g.cfg!)}`); setMsg(t('start.copied')); } catch { setMsg(shareParams(g.cfg!)); } }}>{t('start.share')}</button>
        </div>
        <p role="status" className="small">{msg}</p>
        <p className="small muted">{t('save.seed_info', { seed: g.cfg!.seed })}</p>
        <ul>
          {Object.entries(saves).map(([k, f]) => (
            <li key={k}>
              <strong>{k}</strong> — {t('top.day', { day: f.day, total: f.cfg.mode === 'quick' ? 90 : 365 })} — {f.savedAt.slice(0, 16).replace('T', ' ')}{' '}
              <button type="button" onClick={async () => setMsg((await g.load(k)) ? t('save.loaded') : t('save.bad_file'))}>{t('save.load')}</button>{' '}
              <button type="button" className="danger" onClick={() => { deleteSave(k); setSaves(readSaves()); }}>{t('save.delete')}</button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>{t('history.title')}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="n">{t('unit.day')}</th><th>{t('history.action')}</th><th>{t('col.status')}</th></tr></thead>
            <tbody>
              {s.decisions.length === 0 ? <tr><td colSpan={3} className="muted">{t('history.none')}</td></tr> : null}
              {[...s.decisions].reverse().map((d, i) => (
                <tr key={i}>
                  <td className="n">{d.day}</td>
                  <td>{describeAction(d.action, t)}</td>
                  <td>
                    <span className={`badge ${d.status === 'rejected' ? 'bad' : d.status === 'queued' ? 'warn' : 'good'}`}>{t(`dstatus.${d.status}`)}</span>
                    {d.reason ? <span className="small muted"> {t(d.reason)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
