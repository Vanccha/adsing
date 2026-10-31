import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const GLOSSARY = ['cpc', 'ctr', 'cpm', 'cpa', 'cpl', 'qs', 'is', 'cac', 'ltv', 'ltvcac', 'payback', 'mrr', 'arr', 'churn', 'runway', 'incrementality', 'holdout', 'overreport', 'match', 'negative', 'learning', 'frequency', 'fatigue', 'lookalike', 'pmax', 'smart', 'ci', 'posterior', 'consent', 'serverside', 'gbp', 'geo', 'marginal', 'attribution', 'funnel'] as const;

export function Glossary() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const items = GLOSSARY.filter((k) => `${t(`gloss.${k}.term`)} ${t(`gloss.${k}.def`)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <h1>{t('nav.learn')}</h1>
      <p className="muted">{t('learn.intro')}</p>
      <label className="field">{t('common.search')}<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <dl className="card">
        {items.map((k) => (
          <div key={k} id={`gloss-${k}`} style={{ marginBottom: 10 }}>
            <dt><strong>{t(`gloss.${k}.term`)}</strong></dt>
            <dd style={{ margin: '2px 0 0 0' }}>{t(`gloss.${k}.def`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
