import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GameProvider, useGame } from './game/GameContext';
import { readShareParams } from './game/storage';
import { go, useRoute } from './router';
import type { Route } from './router';
import { LANGS, setLang } from './i18n';
import type { Lang } from './i18n';
import { useTheme } from './theme';
import { Modal } from './components/Modal';
import { Start } from './screens/Start';
import { Dashboard } from './screens/Dashboard';
import { GoogleScreen } from './screens/GoogleScreen';
import { MetaScreen } from './screens/MetaScreen';
import { LocalScreen } from './screens/LocalScreen';
import { GeoScreen } from './screens/GeoScreen';
import { Studio } from './screens/Studio';
import { CrmScreen } from './screens/CrmScreen';
import { OpsScreen } from './screens/OpsScreen';
import { DataScreen } from './screens/DataScreen';
import { OutcomeScreen } from './screens/OutcomeScreen';
import { Glossary } from './screens/Glossary';
import { History } from './screens/History';
import { About } from './screens/About';
import { WeeklyModal } from './screens/WeeklyModal';

const NAV: Route[] = ['dashboard', 'google', 'meta', 'local', 'geo', 'studio', 'crm', 'ops', 'history', 'data', 'learn', 'about'];

function Shell() {
  const { t, i18n } = useTranslation();
  const route = useRoute();
  const g = useGame();
  const [theme, setTheme] = useTheme();
  const playing = !!g.state;
  const needsGame: Route[] = ['dashboard', 'google', 'meta', 'local', 'geo', 'studio', 'crm', 'ops', 'outcome', 'history'];
  const effective: Route = !playing && needsGame.includes(route) ? 'start' : route;

  useEffect(() => {
    document.title = t('app.title');
  }, [t, i18n.language]);

  const screen = () => {
    switch (effective) {
      case 'start': return <Start />;
      case 'dashboard': return <Dashboard />;
      case 'google': return <GoogleScreen />;
      case 'meta': return <MetaScreen />;
      case 'local': return <LocalScreen />;
      case 'geo': return <GeoScreen />;
      case 'studio': return <Studio />;
      case 'crm': return <CrmScreen />;
      case 'ops': return <OpsScreen />;
      case 'data': return <DataScreen />;
      case 'outcome': return <OutcomeScreen />;
      case 'learn': return <Glossary />;
      case 'history': return <History />;
      case 'about': return <About />;
    }
  };

  return (
    <div className="app">
      <a className="skip" href="#main">{t('a11y.skip')}</a>
      <header className="topbar">
        <span className="brand">{t('app.title')}</span>
        {playing ? (
          <span className="small muted" aria-live="polite">
            {t('top.day', { day: g.state!.day, total: g.state!.horizon })} · {g.fmt.gameDate(g.state!.startDate, g.state!.day)}
          </span>
        ) : null}
        {playing ? (
          <label className="check small">
            <input type="checkbox" checked={g.state!.learningMode} onChange={(e) => g.setLearning(e.target.checked)} />
            {t('start.learning')}
          </label>
        ) : null}
        <label className="field small">
          <span className="sr-only">{t('top.theme')}</span>
          <select aria-label={t('top.theme')} value={theme} onChange={(e) => setTheme(e.target.value as 'system' | 'light' | 'dark')}>
            <option value="system">{t('theme.system')}</option>
            <option value="light">{t('theme.light')}</option>
            <option value="dark">{t('theme.dark')}</option>
          </select>
        </label>
        <label className="field small">
          <span className="sr-only">{t('top.language')}</span>
          <select aria-label={t('top.language')} value={i18n.language} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
        </label>
      </header>
      <nav className="nav" aria-label={t('a11y.nav')}>
        {!playing ? (
          <a href="#/start" aria-current={effective === 'start' ? 'page' : undefined}>{t('nav.start')}</a>
        ) : null}
        {NAV.filter((r) => playing || r === 'data' || r === 'learn' || r === 'about').map((r) => (
          <a key={r} href={`#/${r}`} aria-current={effective === r ? 'page' : undefined}>{t(`nav.${r}`)}</a>
        ))}
        {g.state?.outcome ? <a href="#/outcome" aria-current={effective === 'outcome' ? 'page' : undefined}>{t('nav.outcome')}</a> : null}
      </nav>
      <main id="main" tabIndex={-1}>
        {g.error ? <div className="notice bad" role="alert">{t('error.generic')}: {g.error}</div> : null}
        {g.state && !g.state.outcome && effective !== 'start' ? <p className="small muted">{t('honesty.short')}</p> : null}
        {screen()}
      </main>
      <footer>{t('honesty.footer')}</footer>
      {g.weekly ? (
        <Modal title={t('weekly.title', { n: g.weekly.weekNo })} onClose={g.closeWeekly}>
          <WeeklyModal w={g.weekly} onOutcome={() => { g.closeWeekly(); go('outcome'); }} />
        </Modal>
      ) : null}
    </div>
  );
}

export function App() {
  const share = typeof location !== 'undefined' ? readShareParams(location.search) : {};
  return (
    <GameProvider marketHint={share.market}>
      <Shell />
    </GameProvider>
  );
}
