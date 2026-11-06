import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../game/GameContext';
import { setTutorialDismissed, tutorialDismissed, tutorialView } from '../game/tutorial';
import { go } from '../router';

/** Panelde "ilk adımlar" kartı: sıradaki adımı ve nedenini gösterir; öğrenme kipi kapalıysa ya da kapatıldıysa görünmez. */
export function Tutorial() {
  const { t } = useTranslation();
  const g = useGame();
  const [off, setOff] = useState(tutorialDismissed);
  const s = g.state!;
  if (off || !s.learningMode || s.outcome) return null;
  const v = tutorialView(s, g.queue);
  if (!v.next) return null;
  const close = () => {
    setTutorialDismissed(true);
    setOff(true);
  };
  return (
    <section className="card" aria-labelledby="tut-h">
      <div className="row between">
        <h2 id="tut-h">{t('tutorial.title')}</h2>
        <span className="small muted" aria-label={t('tutorial.progress_label', { done: v.doneCount, total: v.total })}>{v.doneCount} / {v.total}</span>
      </div>
      <p><strong>{t(`tutorial.${v.next.id}.title`)}</strong></p>
      <p className="small">{t(`tutorial.${v.next.id}.why`)}</p>
      <div className="row">
        {v.next.route !== 'dashboard' ? <button type="button" className="primary" onClick={() => go(v.next!.route)}>{t('tutorial.go')}</button> : null}
        <button type="button" onClick={() => go('guide')}>{t('nav.guide')}</button>
        <button type="button" onClick={close}>{t('tutorial.dismiss')}</button>
      </div>
      <ol className="small tutorial-steps">
        {v.steps.map(({ step, done }) => (
          <li key={step.id} className={done ? 'muted' : undefined}>
            {done ? <span aria-label={t('tutorial.done')}>✓ </span> : null}{t(`tutorial.${step.id}.title`)}
          </li>
        ))}
      </ol>
    </section>
  );
}
