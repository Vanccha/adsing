import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectors } from '@engine/index';
import type { BidStrategy, GCampaign, MatchType, QueryClass } from '@engine/core';
import { ActBtn, StatusSwitch } from '../components/Actions';
import { Performance, sumOf } from '../components/Performance';
import type { PerfMetric } from '../components/Performance';
import { Select, NumInput, TextInput, useAssetOptions, Tabs } from '../components/Fields';
import { FactBadge } from '../components/FactBadge';
import { Hint } from '../components/Hint';
import { QueuePanel } from '../components/Actions';
import { googleStarter, nextGoogleCounter } from '../game/plan';
import { useGame } from '../game/GameContext';

const STRATS: BidStrategy[] = ['manual', 'maxClicks', 'maxConversions', 'tcpa'];
const MATCH: MatchType[] = ['exact', 'phrase', 'broad'];
const CLASSES: QueryClass[] = ['irrelevant', 'info', 'neighbor', 'brand', 'target'];
type Tab = 'overview' | 'campaigns' | 'adgroups' | 'keywords' | 'terms' | 'edit' | 'new';

export function GoogleScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const [tab, setTab] = useState<Tab>('overview');
  const [step, setStep] = useState(0);
  const om = useMemo(() => selectors.observedMetrics(s, 7), [s]);
  const opts = useAssetOptions(s);
  const price = Math.round(s.product.price);

  // Yeni kampanya
  const [type, setType] = useState<'search' | 'pmax'>('search');
  const [strategy, setStrategy] = useState<BidStrategy>('manual');
  const [budget, setBudget] = useState<number>(price);
  const [bid, setBid] = useState<number>(Math.round(((s.params['gads.search.cpc'] as number) ?? 1) * 100) / 100);
  const [tcpa, setTcpa] = useState<number>(Math.round(price * 0.5));
  const [lpId, setLpId] = useState(s.assets.lps[0]!.id);
  const [offerId, setOfferId] = useState(s.assets.offers[0]!.id);
  const [creativeId, setCreativeId] = useState(s.assets.creatives.find((c) => c.channel === 'google')!.id);
  const [name, setName] = useState('');
  const [starter, setStarter] = useState(true);

  // Düzenleme
  const [selId, setSelId] = useState<string>(s.google.campaigns[0]?.id ?? '');
  const camp: GCampaign | undefined = s.google.campaigns.find((c) => c.id === selId) ?? s.google.campaigns[0];
  const [eBudget, setEBudget] = useState<number>(camp?.dailyBudget ?? price);
  const [eStrategy, setEStrategy] = useState<BidStrategy>(camp?.strategy ?? 'manual');
  const [eBid, setEBid] = useState<number>(camp?.manualBid ?? bid);
  const [eTcpa, setETcpa] = useState<number>(camp?.tcpaTarget ?? tcpa);
  const [negCls, setNegCls] = useState<QueryClass[]>(['irrelevant', 'info']);
  const [negBreadth, setNegBreadth] = useState<'narrow' | 'broad'>('narrow');
  const [agCreative, setAgCreative] = useState(creativeId);
  const [kwTheme, setKwTheme] = useState<'core' | 'adjacent' | 'brand'>('core');
  const [kwMatch, setKwMatch] = useState<MatchType>('phrase');
  const [kwBid, setKwBid] = useState<number>(0);
  const [kwText, setKwText] = useState('');
  const [kwGroup, setKwGroup] = useState<string>(camp?.adGroups[0]?.id ?? '');
  const [eLp, setELp] = useState(camp?.lpId ?? s.assets.lps[0]!.id);
  const [bidKw, setBidKw] = useState('');
  const [bidVal, setBidVal] = useState<number>(0);

  const campOpts = s.google.campaigns.map((c) => ({ value: c.id, label: `${c.id} · ${c.name}` }));
  const stratOpts = (ty: 'search' | 'pmax') => STRATS.filter((x) => ty === 'search' || x === 'maxConversions' || x === 'tcpa').map((x) => ({ value: x, label: t(`strategy.${x}`) }));
  const pending = camp && g.queue.some((a) => a.type === 'gads.create_campaign');
  const counter = nextGoogleCounter(s, g.queue);

  const newActions = type === 'search' && starter
    ? googleStarter(s, g.queue, { budget, type, strategy, manualBid: bid, ...(strategy === 'tcpa' ? { tcpaTarget: tcpa } : {}), lpId, offerId, creativeId, ...(name ? { name } : {}) })
    : [{ type: 'gads.create_campaign' as const, params: { ...(name ? { name } : {}), type, dailyBudget: budget, strategy, ...(strategy === 'manual' ? { manualBid: bid } : {}), ...(strategy === 'tcpa' ? { tcpaTarget: tcpa } : {}), lpId, offerId } }];

  const qsLabel = (b: string | null) => (b ? t(`qs.${b}`) : '—');
  const metrics = om.campaigns;
  const hist = (f: (r: (typeof s.history)[number]) => number) => s.history.map((r) => ({ x: r.day, y: f(r) }));
  const count = (v: number) => fmt.num(v, 0);
  const money = (v: number) => fmt.money(v, 0);
  const perf: PerfMetric[] = [
    { key: 'clicks', label: t('col.clicks'), points: hist((r) => r.gClicks ?? 0), total: (p) => count(sumOf(p)), fmt: count },
    { key: 'impr', label: t('col.impr'), points: hist((r) => r.gImpr ?? 0), total: (p) => count(sumOf(p)), fmt: count },
    { key: 'cost', label: t('col.cost'), points: hist((r) => r.spend.google ?? 0), total: (p) => money(sumOf(p)), fmt: money },
    { key: 'conv', label: t('col.conv'), points: hist((r) => r.platformConv.google ?? 0), total: (p) => fmt.num(sumOf(p), 1), fmt: (v) => fmt.num(v, 1), note: t('google.platform_note') },
  ];
  const statusDot = (st: string) => <span className={`dot ${st === 'active' ? 'on' : 'off'}`} aria-hidden="true" />;
  const steps = ['type', 'budget', 'landing', 'ads', 'review'];
  const totals = s.google.campaigns.reduce((a, c) => ({ impr: a.impr + c.stats.impressions, clicks: a.clicks + c.stats.clicks, cost: a.cost + c.stats.cost, conv: a.conv + c.stats.conv }), { impr: 0, clicks: 0, cost: 0, conv: 0 });

  return (
    <div className="stack">
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>{t('nav.google')}</h1>
        <button type="button" className="primary" onClick={() => { setStep(0); setTab('new'); }}>+ {t('google.tab.new')}</button>
      </div>
      <p className="muted">{t('google.intro')}</p>
      <Hint k="hint.google" />
      {s.google.campaigns.some((c) => c.adGroups.some((ag) => new Set(ag.keywords.map((k) => k.theme)).size > 1)) ? <Hint k="hint.ad_group_focus" /> : null}
      <Tabs
        label={t('nav.google')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: t('google.tab.overview') },
          { id: 'campaigns', label: t('google.tab.campaigns') },
          { id: 'adgroups', label: t('google.tab.adgroups') },
          { id: 'keywords', label: t('google.tab.keywords') },
          { id: 'terms', label: t('google.tab.terms') },
          { id: 'edit', label: t('google.tab.edit') },
        ]}
      />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="stack">
        {tab === 'overview' ? <Performance title={t('perf.google')} xLabel={t('unit.day')} metrics={perf} /> : null}

        {tab === 'campaigns' ? (
          <section className="card">
            {s.google.campaigns.length === 0 ? <p className="muted">{t('google.none')}{pending ? ` ${t('google.pending')}` : ''}</p> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th aria-label={t('col.status')} />
                    <th>{t('col.name')}</th><th>{t('col.status')}</th><th>{t('col.strategy')}</th><th>{t('col.learning')}</th>
                    <th className="n">{t('col.budget')}</th><th className="n">{t('col.impr')}</th><th className="n">{t('col.clicks')}</th><th className="n">CTR</th><th className="n">{t('col.cost')}</th>
                    <th className="n">{t('col.conv')}</th><th className="n">CPA</th><th className="n">{t('col.is')}</th><th className="n">{t('col.lost_budget')}</th><th className="n">{t('col.lost_rank')}</th><th>{t('col.qs')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.google.campaigns.map((c) => {
                    const m = metrics.find((x) => x.id === c.id);
                    return (
                      <tr key={c.id}>
                        <td><StatusSwitch on={c.status === 'active'} label={`${c.name}: ${c.status === 'active' ? t('google.pause') : t('google.resume')}`} action={{ type: 'gads.set_status', params: { campaignId: c.id, status: c.status === 'active' ? 'paused' : 'active' } }} /></td>
                        <th scope="row"><button type="button" className="link" onClick={() => { setSelId(c.id); setTab('edit'); }}>{c.name}</button> <span className="badge info">{c.type === 'pmax' ? 'PMax' : t('google.search')}</span></th>
                        <td>{statusDot(c.status)}{t(`status.${c.status}`)}</td>
                        <td>{t(`strategy.${c.strategy}`)}</td>
                        <td><span className={`badge ${c.learning.state === 'limited' ? 'bad' : c.learning.state === 'learning' ? 'warn' : 'good'}`}>{t(`learning.${c.learning.state}`)}</span></td>
                        <td className="n">{fmt.money(c.dailyBudget)}</td>
                        <td className="n">{fmt.num(c.stats.impressions, 0)}</td>
                        <td className="n">{fmt.num(c.stats.clicks, 0)}</td>
                        <td className="n">{c.stats.impressions > 0 ? fmt.pct(c.stats.clicks / c.stats.impressions, 2) : '—'}</td>
                        <td className="n">{fmt.money(c.stats.cost)}</td>
                        <td className="n">{fmt.num(c.stats.conv, 1)}</td>
                        <td className="n">{c.stats.conv > 0 ? fmt.money(c.stats.cost / c.stats.conv) : '—'}</td>
                        <td className="n">{m?.isShare != null ? fmt.pct(m.isShare, 0) : '—'}</td>
                        <td className="n">{m?.isLostBudget != null ? fmt.pct(m.isLostBudget, 0) : '—'}</td>
                        <td className="n">{m?.isLostRank != null ? fmt.pct(m.isLostRank, 0) : '—'}</td>
                        <td>{qsLabel(m?.qsBand ?? null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {s.google.campaigns.length > 1 ? (
                  <tfoot>
                    <tr>
                      <td /><th scope="row" colSpan={5}>{t('common.total')}</th>
                      <td className="n">{fmt.num(totals.impr, 0)}</td><td className="n">{fmt.num(totals.clicks, 0)}</td>
                      <td className="n">{totals.impr > 0 ? fmt.pct(totals.clicks / totals.impr, 2) : '—'}</td>
                      <td className="n">{fmt.money(totals.cost)}</td><td className="n">{fmt.num(totals.conv, 1)}</td>
                      <td className="n">{totals.conv > 0 ? fmt.money(totals.cost / totals.conv) : '—'}</td><td colSpan={4} />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            <p className="small muted">{t('google.platform_note')}</p>
            {s.google.campaigns.some((c) => c.negatives.length) ? (
              <p className="small">{t('google.negatives')}: {s.google.campaigns.map((c) => `${c.name}: ${c.negatives.map((n) => `${t(`qclass.${n.cls}`)}/${t(`breadth.${n.breadth}`)}`).join(', ') || '—'}`).join(' · ')}</p>
            ) : null}
          </section>
        ) : null}

        {tab === 'adgroups' ? (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('google.adgroup')}</th><th>{t('google.campaign')}</th><th>{t('google.creative')}</th><th className="n">{t('google.keywords')}</th><th className="n">{t('col.impr')}</th><th className="n">{t('col.clicks')}</th><th className="n">{t('col.cost')}</th><th className="n">{t('col.conv')}</th></tr></thead>
                <tbody>
                  {s.google.campaigns.flatMap((c) => c.adGroups.map((ag) => {
                    const sum = ag.keywords.reduce((a, k) => ({ impr: a.impr + k.stats.impressions, clicks: a.clicks + k.stats.clicks, cost: a.cost + k.stats.cost, conv: a.conv + k.stats.conv }), { impr: 0, clicks: 0, cost: 0, conv: 0 });
                    return (
                      <tr key={ag.id}>
                        <th scope="row">{ag.name}</th><td>{c.name}</td><td>{ag.creativeId}</td><td className="n">{ag.keywords.length}</td>
                        <td className="n">{fmt.num(sum.impr, 0)}</td><td className="n">{fmt.num(sum.clicks, 0)}</td><td className="n">{fmt.money(sum.cost)}</td><td className="n">{fmt.num(sum.conv, 1)}</td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
            {s.google.campaigns.every((c) => c.adGroups.length === 0) ? <p className="muted">{t('google.none')}</p> : null}
          </section>
        ) : null}

        {tab === 'keywords' ? (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('google.keyword')}</th><th>{t('google.kw_match')}</th><th>{t('google.kw_theme')}</th><th>{t('google.adgroup')}</th><th>{t('col.status')}</th><th className="n">{t('google.kw_bid')}</th><th className="n">{t('col.impr')}</th><th className="n">{t('col.clicks')}</th><th className="n">{t('col.cost')}</th><th className="n">{t('col.conv')}</th></tr></thead>
                <tbody>
                  {s.google.campaigns.flatMap((c) => c.adGroups.flatMap((ag) => ag.keywords.map((k) => (
                    <tr key={k.id}>
                      <th scope="row">{k.text}</th><td>{t(`match.${k.match}`)}</td><td>{t(`theme.${k.theme}`)}</td><td>{ag.name}</td><td>{statusDot(k.status)}{t(`status.${k.status}`)}</td>
                      <td className="n">{k.bid !== null ? fmt.money(k.bid) : t('google.camp_bid')}</td>
                      <td className="n">{fmt.num(k.stats.impressions, 0)}</td><td className="n">{fmt.num(k.stats.clicks, 0)}</td><td className="n">{fmt.money(k.stats.cost)}</td><td className="n">{fmt.num(k.stats.conv, 1)}</td>
                    </tr>
                  ))))}
                </tbody>
              </table>
            </div>
            {s.google.campaigns.every((c) => c.adGroups.every((g2) => g2.keywords.length === 0)) ? <p className="muted">{t('google.none')}</p> : null}
          </section>
        ) : null}

        {tab === 'new' ? (
          <section className="card">
            <h2>{t('google.new')}</h2>
            <ol className="stepper">
              {steps.map((x, i) => (
                <li key={x} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : undefined}><span className="n">{i < step ? '✓' : i + 1}</span>{t(`google.step.${x}`)}</li>
              ))}
            </ol>
            {step === 0 ? (
              <div className="choice">
                {(['search', 'pmax'] as const).map((x) => (
                  <button type="button" key={x} aria-pressed={type === x} onClick={() => { setType(x); if (x === 'pmax') setStrategy('maxConversions'); }}>
                    <strong>{x === 'pmax' ? 'PMax' : t('google.search')}</strong>
                    <span className="small muted">{t(`google.type_desc.${x}`)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {step === 1 ? (
              <>
                <p className="small muted">CPC {fmt.money(s.params['gads.search.cpc'] as number)} <FactBadge id="gads.search.cpc" /> · CTR {fmt.pct(s.params['gads.search.ctr'] as number, 1)} <FactBadge id="gads.search.ctr" /></p>
                <div className="form-grid">
                  <NumInput label={t('col.budget')} value={budget} onChange={setBudget} step={1} />
                  <Select label={t('col.strategy')} value={strategy} onChange={setStrategy} options={stratOpts(type)} />
                  {strategy === 'manual' ? <NumInput label={t('google.manual_bid')} value={bid} onChange={setBid} step={0.1} /> : null}
                  {strategy === 'tcpa' ? <NumInput label={t('google.tcpa')} value={tcpa} onChange={setTcpa} step={1} /> : null}
                </div>
                <Hint k="hint.google_strategy" />
              </>
            ) : null}
            {step === 2 ? (
              <div className="form-grid">
                <Select label={t('studio.lp')} value={lpId} onChange={setLpId} options={opts.lps} />
                <Select label={t('studio.offer')} value={offerId} onChange={setOfferId} options={opts.offers} />
              </div>
            ) : null}
            {step === 3 ? (
              <div className="stack">
                {type === 'search' ? (
                  <>
                    <div className="form-grid">
                      <Select label={t('studio.creative')} value={creativeId} onChange={setCreativeId} options={opts.creatives('google')} />
                      <TextInput label={t('col.name')} value={name} onChange={setName} />
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} />
                      {t('google.starter')} ({t('google.next_ids', { n: counter })})
                    </label>
                    <Hint k="hint.match_types" />
                  </>
                ) : (
                  <>
                    <TextInput label={t('col.name')} value={name} onChange={setName} />
                    <p className="small muted">{t('google.pmax_note')}</p>
                  </>
                )}
              </div>
            ) : null}
            {step === 4 ? (
              <dl className="summary-list">
                <dt>{t('google.type')}</dt><dd>{type === 'pmax' ? 'PMax' : t('google.search')}</dd>
                <dt>{t('col.budget')}</dt><dd>{fmt.money(budget)}</dd>
                <dt>{t('col.strategy')}</dt><dd>{t(`strategy.${strategy}`)}</dd>
                <dt>{t('studio.lp')}</dt><dd>{lpId}</dd>
                <dt>{t('studio.offer')}</dt><dd>{offerId}</dd>
              </dl>
            ) : null}
            <div className="row" style={{ marginTop: 14 }}>
              {step > 0 ? <button type="button" onClick={() => setStep(step - 1)}>{t('common.back')}</button> : null}
              {step < steps.length - 1 ? <button type="button" className="primary" onClick={() => setStep(step + 1)}>{t('common.next')}</button> : <ActBtn primary action={newActions} label={t('google.create')} />}
            </div>
          </section>
        ) : null}

        {tab === 'edit' ? (
          <section className="card">
            <h2>{t('google.edit')}</h2>
            {!camp ? <p className="muted">{t('google.none')}</p> : (
              <div className="stack">
                <Select label={t('google.campaign')} value={camp.id} onChange={(v) => { setSelId(v); const c = s.google.campaigns.find((x) => x.id === v); if (c) { setEBudget(c.dailyBudget); setEStrategy(c.strategy); setKwGroup(c.adGroups[0]?.id ?? ''); setELp(c.lpId); setBidKw(''); } }} options={campOpts} />
                <div className="form-grid">
                  <NumInput label={t('col.budget')} value={eBudget} onChange={setEBudget} />
                  <ActBtn action={{ type: 'gads.set_budget', params: { campaignId: camp.id, dailyBudget: eBudget } }} label={t('google.set_budget')} />
                </div>
                <div className="form-grid">
                  <Select label={t('col.strategy')} value={eStrategy} onChange={setEStrategy} options={stratOpts(camp.type)} />
                  {eStrategy === 'manual' ? <NumInput label={t('google.manual_bid')} value={eBid} onChange={setEBid} step={0.1} /> : null}
                  {eStrategy === 'tcpa' ? <NumInput label={t('google.tcpa')} value={eTcpa} onChange={setETcpa} /> : null}
                  <ActBtn action={{ type: 'gads.set_strategy', params: { campaignId: camp.id, strategy: eStrategy, ...(eStrategy === 'manual' ? { manualBid: eBid } : {}), ...(eStrategy === 'tcpa' ? { tcpaTarget: eTcpa } : {}) } }} label={t('google.set_strategy')} />
                </div>
                <Hint k="hint.reset_learning" />
                <div className="form-grid">
                  <Select label={t('studio.lp')} value={eLp} onChange={setELp} options={opts.lps} />
                  <ActBtn action={{ type: 'gads.set_lp', params: { campaignId: camp.id, lpId: eLp } }} label={t('google.set_lp')} disabled={eLp === camp.lpId} />
                </div>
                <div className="row">
                  <ActBtn action={{ type: 'gads.set_status', params: { campaignId: camp.id, status: camp.status === 'active' ? 'paused' : 'active' } }} label={camp.status === 'active' ? t('google.pause') : t('google.resume')} />
                </div>
                {camp.type === 'search' ? (
                  <>
                    <fieldset>
                      <legend>{t('google.add_adgroup')}</legend>
                      <div className="form-grid">
                        <Select label={t('studio.creative')} value={agCreative} onChange={setAgCreative} options={opts.creatives('google')} />
                        <ActBtn action={{ type: 'gads.add_adgroup', params: { campaignId: camp.id, creativeId: agCreative } }} label={t('google.add_adgroup')} />
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>{t('google.add_keywords')}</legend>
                      <div className="form-grid">
                        <Select label={t('google.adgroup')} value={kwGroup || camp.adGroups[0]?.id || ''} onChange={setKwGroup} options={camp.adGroups.map((a) => ({ value: a.id, label: a.name }))} />
                        <TextInput label={t('google.kw_text')} value={kwText} onChange={setKwText} />
                        <Select label={t('google.kw_theme')} value={kwTheme} onChange={setKwTheme} options={(['core', 'adjacent', 'brand'] as const).map((x) => ({ value: x, label: t(`theme.${x}`) }))} />
                        <Select label={t('google.kw_match')} value={kwMatch} onChange={setKwMatch} options={MATCH.map((x) => ({ value: x, label: t(`match.${x}`) }))} />
                        <NumInput label={t('google.kw_bid')} value={kwBid} onChange={setKwBid} step={0.1} hint={t('google.kw_bid_hint')} />
                        <ActBtn action={{ type: 'gads.add_keywords', params: { campaignId: camp.id, adGroupId: kwGroup || camp.adGroups[0]?.id || '', keywords: [{ ...(kwText ? { text: kwText } : {}), theme: kwTheme, match: kwMatch, ...(kwBid > 0 ? { bid: kwBid } : {}) }] } }} label={t('google.add_keywords')} />
                      </div>
                      <Hint k="hint.match_types" />
                    </fieldset>
                    {camp.adGroups.some((ag) => ag.keywords.length > 0) ? (
                      <fieldset>
                        <legend>{t('google.kw_bid_edit')}</legend>
                        <div className="form-grid">
                          <Select label={t('google.keyword')} value={bidKw || camp.adGroups.flatMap((ag) => ag.keywords)[0]!.id} onChange={setBidKw} options={camp.adGroups.flatMap((ag) => ag.keywords.map((k) => ({ value: k.id, label: `${k.text} [${t(`match.${k.match}`)}]` })))} />
                          <NumInput label={t('google.kw_bid')} value={bidVal} onChange={setBidVal} step={0.1} hint={t('google.kw_bid_hint')} />
                          <ActBtn action={{ type: 'gads.set_keyword_bid', params: { campaignId: camp.id, keywordId: bidKw || camp.adGroups.flatMap((ag) => ag.keywords)[0]!.id, bid: bidVal > 0 ? bidVal : null } }} label={t('google.set_kw_bid')} />
                        </div>
                      </fieldset>
                    ) : null}
                    <fieldset>
                      <legend>{t('google.negatives')}</legend>
                      <div className="row">
                        {CLASSES.map((c) => (
                          <label key={c} className="check">
                            <input type="checkbox" checked={negCls.includes(c)} onChange={(e) => setNegCls(e.target.checked ? [...negCls, c] : negCls.filter((x) => x !== c))} />
                            {t(`qclass.${c}`)}
                          </label>
                        ))}
                      </div>
                      <div className="form-grid">
                        <Select label={t('google.breadth')} value={negBreadth} onChange={setNegBreadth} options={[{ value: 'narrow', label: t('breadth.narrow') }, { value: 'broad', label: t('breadth.broad') }]} />
                        <ActBtn action={{ type: 'gads.add_negatives', params: { campaignId: camp.id, classes: negCls, breadth: negBreadth } }} label={t('google.add_negatives')} />
                      </div>
                    </fieldset>
                    <div className="row">
                      <ActBtn action={{ type: 'gads.review_search_terms', params: { campaignId: camp.id } }} label={t('google.review_terms')} />
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'terms' ? (
          <section className="card">
            <h2>{t('google.terms')}</h2>
            {s.google.campaigns.length === 0 ? <p className="muted">{t('google.none')}</p> : null}
            {s.google.campaigns.map((c) => (
              <div key={c.id} className="stack">
                <h3>{c.name}</h3>
                {c.searchTerms ? (
                  <>
                    <p className="small muted">{t('google.terms_day', { n: c.searchTerms.day })}</p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>{t('google.query_class')}</th><th className="n">{t('col.impr')}</th><th className="n">{t('col.clicks')}</th><th className="n">{t('col.cost')}</th><th className="n">{t('col.conv')}</th></tr>
                        </thead>
                        <tbody>
                          {c.searchTerms.rows.map((r) => (
                            <tr key={r.cls}>
                              <th scope="row">{t(`qclass.${r.cls}`)}</th>
                              <td className="n">{fmt.num(r.impressions, 0)}</td>
                              <td className="n">{fmt.num(r.clicks, 0)}</td>
                              <td className="n">{fmt.money(r.cost)}</td>
                              <td className="n">{fmt.num(r.conv, 1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="muted">{t('google.terms_none')}</p>
                )}
                <ActBtn action={{ type: 'gads.review_search_terms', params: { campaignId: c.id } }} label={t('google.review_terms')} />
              </div>
            ))}
            <Hint k="hint.search_terms" />
          </section>
        ) : null}
      </div>
      <QueuePanel />
    </div>
  );
}
