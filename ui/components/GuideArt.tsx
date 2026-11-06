// Kılavuz çizimleri: temaya uyan SVG ve ekran örnekleri. Metinler i18n'den gelir; örnek sayılar oyunun tipik oranlarıyla tutarlıdır.
import { useTranslation } from 'react-i18next';
import { CIBar } from './Charts';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];

/** Günlük döngü: karar ver, kuyruğa al, zamanı ilerlet, sonucu oku. */
export function LoopArt() {
  const { t } = useTranslation();
  const steps = ['decide', 'queue', 'advance', 'read'];
  const W = 680;
  const H = 150;
  const cx = (i: number) => 85 + i * 170;
  return (
    <svg className="guide-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={steps.map((k) => t(`guide.loop.${k}`)).join(' → ')}>
      <defs>
        <marker id="guide-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8Z" fill="var(--muted)" /></marker>
      </defs>
      {steps.map((k, i) => (
        <g key={k}>
          {i < 3 ? <line x1={cx(i) + 34} x2={cx(i + 1) - 40} y1={52} y2={52} stroke="var(--muted)" strokeWidth={2} markerEnd="url(#guide-arrow)" /> : null}
          <circle cx={cx(i)} cy={52} r={30} fill={COLORS[i]} />
          <text x={cx(i)} y={60} textAnchor="middle" fontSize="24" fontWeight="600" fill="#fff">{i + 1}</text>
          <text x={cx(i)} y={112} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{t(`guide.loop.${k}`)}</text>
          <text x={cx(i)} y={132} textAnchor="middle" fontSize="12" fill="var(--muted)">{t(`guide.loop.${k}_sub`)}</text>
        </g>
      ))}
      <path d={`M${cx(3)} 20 C${cx(3)} -14 ${cx(0)} -14 ${cx(0)} 20`} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 4" />
    </svg>
  );
}

/** Huni: her aşamada kalan sayı; tek seri, tek renk, değer uçta. */
export function FunnelArt() {
  const { t, i18n } = useTranslation();
  const pct = (v: number) => new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 }).format(v);
  const rows = [
    ['impressions', 10000],
    ['clicks', 500],
    ['leads', 50],
    ['qualified', 30],
    ['trials', 22],
    ['paid', 5],
  ] as const;
  return (
    <div className="guide-funnel" role="list" aria-label={t('guide.funnel.title')}>
      {rows.map(([k, v], i) => {
        const w = Math.max(3, (Math.log10(v + 1) / 4) * 100);
        const next = rows[i + 1];
        return (
          <div key={k} role="listitem">
            <div className="gf-row">
              <span>{t(`guide.funnel.${k}`)}</span>
              <span className="gf-track"><span className="gf-fill" style={{ width: `${w}%` }} /></span>
              <strong className="num">{v.toLocaleString(i18n.language)}</strong>
            </div>
            {next ? <div className="gf-rate">↓ {pct(next[1] / v)}</div> : null}
          </div>
        );
      })}
      <p className="small muted">{t('guide.funnel.log_note')}</p>
    </div>
  );
}

/** Kampanya tablosu örneği: numaralı işaretler aşağıdaki açıklamalarla eşleşir. */
export function CampaignMock() {
  const { t } = useTranslation();
  const Mark = ({ n }: { n: number }) => <span className="gmark" aria-hidden="true">{n}</span>;
  return (
    <figure className="guide-mock">
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('col.status')}</th><th>{t('col.name')}</th><th className="n">{t('col.budget')}</th><th className="n">{t('col.cost')}</th><th className="n">{t('col.conv')}</th><th className="n">CPA</th><th className="n">{t('col.is')}</th><th className="n">{t('col.lost_rank')}</th></tr></thead>
          <tbody>
            <tr>
              <td><Mark n={1} /><span className="switch mock" /></td>
              <th scope="row">{t('guide.mock.campaign')}</th>
              <td className="n"><Mark n={2} />$50</td>
              <td className="n">$1.480</td>
              <td className="n"><Mark n={3} />31</td>
              <td className="n">$48</td>
              <td className="n">%37</td>
              <td className="n"><Mark n={4} />%36</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ol className="guide-notes small">
        {[1, 2, 3, 4].map((n) => <li key={n}>{t(`guide.mock.note${n}`)}</li>)}
      </ol>
    </figure>
  );
}

/** Platform ile CRM: aynı dönemde farklı sayılar. */
export function ReportArt() {
  const { t } = useTranslation();
  const rows = [
    ['platform', 42],
    ['crm', 31],
    ['qualified', 18],
    ['paid', 4],
  ] as const;
  return (
    <div className="hbars" role="list" aria-label={t('guide.report.title')}>
      {rows.map(([k, v]) => (
        <div className="hbar" role="listitem" key={k}>
          <span>{t(`guide.report.${k}`)}</span>
          <span className="track"><span className="fill" style={{ width: `${(v / 42) * 100}%` }} /></span>
          <span className="val">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** A/B testi: örtüşen ve ayrışan güven aralıkları. */
export function AbArt() {
  const { t } = useTranslation();
  const Row = ({ label, mean, lo, hi }: { label: string; mean: number; lo: number; hi: number }) => (
    <div className="guide-ci">
      <span>{label}</span>
      <CIBar mean={mean} lo={lo} hi={hi} max={0.2} label={`${label}: %${Math.round(mean * 100)}, %${Math.round(lo * 100)} - %${Math.round(hi * 100)}`} />
      <span className="num small">%{Math.round(mean * 100)}</span>
    </div>
  );
  return (
    <div className="grid cols-2">
      <div className="guide-case">
        <span className="badge warn">{t('guide.ab.wait')}</span>
        <p className="small muted">{t('guide.ab.wait_desc')}</p>
        <Row label="A" mean={0.06} lo={0.02} hi={0.13} />
        <Row label="B" mean={0.08} lo={0.03} hi={0.15} />
      </div>
      <div className="guide-case">
        <span className="badge good">{t('guide.ab.decide')}</span>
        <p className="small muted">{t('guide.ab.decide_desc')}</p>
        <Row label="A" mean={0.05} lo={0.03} hi={0.07} />
        <Row label="B" mean={0.11} lo={0.09} hi={0.14} />
      </div>
    </div>
  );
}

/** Reklam ve sayfa mesajı: tutarlı örnek ile uyumsuz örnek. */
export function MessageArt() {
  const { t } = useTranslation();
  const Pair = ({ ok }: { ok: boolean }) => (
    <div className="guide-case">
      <span className={`badge ${ok ? 'good' : 'bad'}`}>{ok ? t('guide.msg.good') : t('guide.msg.bad')}</span>
      <div className="guide-pair">
        <div className="guide-ad"><span className="small muted">{t('guide.msg.ad_label')}</span><strong>{t('guide.msg.ad')}</strong></div>
        <span aria-hidden="true">→</span>
        <div className="guide-ad"><span className="small muted">{t('guide.msg.page_label')}</span><strong>{ok ? t('guide.msg.page_good') : t('guide.msg.page_bad')}</strong></div>
      </div>
    </div>
  );
  return <div className="grid cols-2"><Pair ok /><Pair ok={false} /></div>;
}

/** Sonuç kademeleri. */
export function OutcomeArt() {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [['won', 'good'], ['healthy', 'good'], ['survived', 'info'], ['stagnant', 'warn'], ['lost', 'bad']];
  return (
    <ul className="guide-outcomes">
      {rows.map(([k, tone]) => (
        <li key={k}><span className={`badge ${tone}`}>{t(`outcome.status.${k}`)}</span><span className="small">{t(`guide.outcome.${k}`)}</span></li>
      ))}
    </ul>
  );
}
