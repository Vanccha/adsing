import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../game/GameContext';

/** Bağlamsal ipucu: yalnızca öğrenme modu açık ve zorluk "zor" değilse görünür. */
export function Hint({ k, children, params }: { k?: string; children?: ReactNode; params?: Record<string, string | number> }) {
  const { hintsOn } = useGame();
  const { t } = useTranslation();
  if (!hintsOn) return null;
  return (
    <div className="hint" role="note">
      <strong>{t('learn.hint_label')}: </strong>
      {k ? t(k, params) : children}
    </div>
  );
}
