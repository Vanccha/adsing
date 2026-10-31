import { useTranslation } from 'react-i18next';

export function About() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1>{t('nav.about')}</h1>
      <div className="notice warn" role="note"><strong>{t('honesty.short')}</strong></div>
      <section className="card">
        <p>{t('about.p1')}</p>
        <p>{t('about.p2')}</p>
        <ul>
          <li>{t('about.l1')}</li>
          <li>{t('about.l2')}</li>
          <li>{t('about.l3')}</li>
          <li>{t('about.l4')}</li>
          <li>{t('about.l5')}</li>
        </ul>
        <p>{t('honesty.long')}</p>
        <p className="small muted">{t('about.offline')}</p>
      </section>
    </div>
  );
}
