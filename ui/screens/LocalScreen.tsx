import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectors } from '@engine/index';
import { marketInfo } from '../engine/bundle';
import { ActBtn, QueuePanel } from '../components/Actions';
import { FactBadge } from '../components/FactBadge';
import { NumInput, Select } from '../components/Fields';
import { Hint } from '../components/Hint';
import { useGame } from '../game/GameContext';
import type { ContentTopic } from '@engine/core';

type Legal = { status?: string; rule?: string; maxPenalty?: { value: number; unit: string; per: string } | null };

export function LocalScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const info = marketInfo(s.marketId);
  const legal = info.legal as Record<string, unknown> & { disclaimer?: string; coldEmail?: Legal; coldCall?: Legal; sms?: Legal };
  const [gbpH, setGbpH] = useState(2);
  const [revN, setRevN] = useState(3);
  const [reward, setReward] = useState(Math.round(s.product.price * 0.5));
  const [fieldH, setFieldH] = useState(3);
  const [kind, setKind] = useState<'email' | 'call' | 'sms'>('email');
  const [vol, setVol] = useState(40);
  const [ack, setAck] = useState(false);
  const [cKind, setCKind] = useState<'social' | 'seo'>('seo');
  const [cH, setCH] = useState(3);
  const [topic, setTopic] = useState<'' | ContentTopic>('');
  const customers = selectors.mrr(s).customers;
  const lg = kind === 'email' ? legal.coldEmail : kind === 'call' ? legal.coldCall : legal.sms;
  const status = lg?.status ?? (s.params[kind === 'sms' ? 'legal.sms' : `legal.cold_${kind}`] as string | undefined) ?? 'allowed';
  const risky = status !== 'allowed';
  const byCh = s.funnel.byChannel;
  const organicChannels = ['gbp', 'referral', 'field', 'outreach', 'content', 'organic'];

  return (
    <div className="stack">
      <h1>{t('nav.local')}</h1>
      <p className="muted">{t('local.intro')}</p>
      <Hint k="hint.local" />

      <section className="card">
        <h2>{t('local.results')}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('local.channel')}</th><th className="n">{t('local.leads_crm')}</th><th className="n">{t('local.paid')}</th></tr></thead>
            <tbody>
              {organicChannels.map((c) => (
                <tr key={c}><th scope="row">{t(`leadch.${c}`)}</th><td className="n">{fmt.num(byCh[c]?.leads ?? 0, 0)}</td><td className="n">{fmt.num(byCh[c]?.paid ?? 0, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">{t('local.attrib_note')}</p>
      </section>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="gbp-h">
          <h2 id="gbp-h">{t('local.gbp')}</h2>
          <p>
            {t('local.gbp_state')}: <span className={`badge ${s.local.gbp.claimed ? 'good' : 'warn'}`}>{s.local.gbp.claimed ? t('local.claimed') : t('local.not_claimed')}</span>
            {' · '}{t('local.reviews')}: {fmt.num(s.local.gbp.reviews, 0)} · {t('local.rating')}: {s.local.gbp.reviews > 0 ? fmt.num(s.local.gbp.rating, 1) : '—'}
          </p>
          <p className="small muted">{t('local.gbp_effect')}: <FactBadge id="local.gbp_effect" /></p>
          <div className="form-grid">
            <NumInput label={t('unit.hours')} value={gbpH} onChange={setGbpH} step={0.5} />
            <ActBtn action={{ type: 'local.optimize_gbp', params: { hours: gbpH } }} label={t('local.optimize_gbp')} />
          </div>
          <div className="form-grid">
            <NumInput label={t('local.review_count')} value={revN} onChange={setRevN} hint={t('local.have_customers', { n: customers })} />
            <ActBtn action={{ type: 'local.request_reviews', params: { count: revN } }} label={t('local.request_reviews')} />
          </div>
          <Hint k="hint.reviews" />
        </section>

        <section className="card" aria-labelledby="ref-h">
          <h2 id="ref-h">{t('local.referral')}</h2>
          <p>{t('local.referral_state')}: <span className={`badge ${s.local.referral.active ? 'good' : 'warn'}`}>{s.local.referral.active ? t('common.on') : t('common.off')}</span>{s.local.referral.active ? ` · ${t('local.reward')}: ${fmt.money(s.local.referral.reward)}` : ''}</p>
          <p className="small muted">{t('local.referral_rate')}: <FactBadge id="local.referral_rate" /></p>
          <div className="form-grid">
            <NumInput label={t('local.reward')} value={reward} onChange={setReward} />
            <ActBtn action={{ type: 'local.set_referral', params: { on: !s.local.referral.active, reward } }} label={s.local.referral.active ? t('local.referral_off') : t('local.referral_on')} />
            {s.local.referral.active ? <ActBtn action={{ type: 'local.set_referral', params: { on: true, reward } }} label={t('local.referral_update')} /> : null}
          </div>
        </section>

        <section className="card" aria-labelledby="field-h">
          <h2 id="field-h">{t('local.field')}</h2>
          <p className="small muted">{t('local.field_desc')} <FactBadge id="local.field_sales_close" /></p>
          <div className="form-grid">
            <NumInput label={t('unit.hours')} value={fieldH} onChange={setFieldH} step={0.5} />
            <ActBtn action={{ type: 'local.field_sales', params: { hours: fieldH } }} label={t('local.field_sales')} />
          </div>
        </section>

        <section className="card" aria-labelledby="content-h">
          <h2 id="content-h">{t('local.content')}</h2>
          <p className="small muted">{t('local.content_state', { social: fmt.num(s.local.content.social, 1), seo: fmt.num(s.local.content.seo, 1) })}</p>
          <div className="form-grid">
            <Select label={t('local.content_kind')} value={cKind} onChange={setCKind} options={[{ value: 'seo', label: 'SEO' }, { value: 'social', label: t('local.social') }]} />
            <Select label={t('local.content_topic')} value={topic} onChange={setTopic} options={[{ value: '', label: t('topic.none') }, ...(['howto', 'comparison', 'local', 'story'] as const).map((x) => ({ value: x, label: t(`topic.${x}`) }))]} />
            <NumInput label={t('unit.hours')} value={cH} onChange={setCH} step={0.5} />
            <ActBtn action={{ type: 'local.content', params: { kind: cKind, hours: cH, ...(topic ? { topic } : {}) } }} label={t('local.do_content')} />
          </div>
          <Hint k="hint.content_topic" />
        </section>
      </div>

      <section className="card" aria-labelledby="out-h">
        <h2 id="out-h">{t('local.outreach')}</h2>
        <div className={`notice ${status === 'banned' ? 'bad' : status === 'restricted' ? 'warn' : ''}`} role="note">
          <strong>{t('local.legal_title', { market: t(`market.${s.marketId}`) })}:</strong> {t(`legal.${status}`)}
          {lg?.rule ? <div>{lg.rule}</div> : null}
          {lg?.maxPenalty ? <div>{t('local.max_penalty')}: {fmt.num(lg.maxPenalty.value, 0)} {lg.maxPenalty.unit} / {lg.maxPenalty.per}</div> : null}
          <div className="small">{legal.disclaimer ?? t('local.legal_disclaimer')}</div>
          <div className="small">{t('local.legal_game_note')}</div>
        </div>
        <div className="form-grid">
          <Select label={t('local.outreach_kind')} value={kind} onChange={(v) => { setKind(v); setAck(false); }} options={[{ value: 'email', label: t('local.email') }, { value: 'call', label: t('local.call') }, { value: 'sms', label: 'SMS' }]} />
          <NumInput label={t('local.volume')} value={vol} onChange={setVol} step={10} />
        </div>
        {risky ? (
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            {t('local.ack_risk')}
          </label>
        ) : null}
        <ActBtn disabled={risky && !ack} action={{ type: 'local.cold_outreach', params: { kind, volume: vol } }} label={t('local.send')} />
        <p className="small muted">{t('local.domain_health', { v: fmt.pct(s.local.outreach.domainHealth, 0), n: fmt.num(s.local.outreach.sent30, 0) })}</p>
      </section>
      <QueuePanel />
    </div>
  );
}
