// Nasıl oynanır: görselli ve örnekli kılavuz. Oyun başlamadan da açılır; oyun sürerken ilgili ekrana götüren bağlantılar çalışır.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AbArt, CampaignMock, FunnelArt, LoopArt, MessageArt, OutcomeArt, ReportArt } from '../components/GuideArt';
import { useGame } from '../game/GameContext';
import { go } from '../router';
import type { Route } from '../router';

interface Section {
  id: string;
  art?: ReactNode;
  /** Bu bölümde kaç madde var (guide.<id>.pN). */
  points: number;
  route?: Route;
}

const SECTIONS: Section[] = [
  { id: 'goal', points: 3 },
  { id: 'loop', art: <LoopArt />, points: 3 },
  { id: 'resources', points: 4 },
  { id: 'funnel', art: <FunnelArt />, points: 3 },
  { id: 'firstweek', points: 6, route: 'dashboard' },
  { id: 'google', art: <CampaignMock />, points: 4, route: 'google' },
  { id: 'meta', points: 3, route: 'meta' },
  { id: 'content', art: <MessageArt />, points: 4, route: 'studio' },
  { id: 'reports', art: <ReportArt />, points: 3, route: 'crm' },
  { id: 'tests', art: <AbArt />, points: 3, route: 'studio' },
  { id: 'cases', points: 3, route: 'dashboard' },
  { id: 'mistakes', points: 5 },
  { id: 'outcome', art: <OutcomeArt />, points: 2 },
];

export function HowTo() {
  const { t } = useTranslation();
  const g = useGame();
  const playing = !!g.state;
  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="stack guide">
      <h1>{t('nav.guide')}</h1>
      <p className="muted">{t('guide.intro')}</p>
      <nav className="guide-toc" aria-label={t('guide.toc')}>
        {SECTIONS.map((s, i) => (
          <button type="button" key={s.id} onClick={() => jump(s.id)}>{i + 1}. {t(`guide.${s.id}.title`)}</button>
        ))}
      </nav>
      {SECTIONS.map((s, i) => (
        <section className="card" id={`guide-${s.id}`} key={s.id} aria-labelledby={`guide-h-${s.id}`}>
          <h2 id={`guide-h-${s.id}`}><span className="guide-num" aria-hidden="true">{i + 1}</span>{t(`guide.${s.id}.title`)}</h2>
          <p>{t(`guide.${s.id}.lead`)}</p>
          {s.art ? <div className="guide-art">{s.art}</div> : null}
          <ul className="guide-points">
            {Array.from({ length: s.points }, (_, k) => <li key={k}>{t(`guide.${s.id}.p${k + 1}`)}</li>)}
          </ul>
          {s.route && playing ? <button type="button" onClick={() => go(s.route!)}>{t(`nav.${s.route}`)} →</button> : null}
        </section>
      ))}
      <p className="notice">{t('guide.example_note')}</p>
      {!playing ? <button type="button" className="primary" onClick={() => go('start')}>{t('guide.start_game')}</button> : null}
    </div>
  );
}
