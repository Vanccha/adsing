import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Erişilebilir iletişim kutusu: Esc ile kapanır, açılışta odak alır, kapanınca önceki öğeye döner, Tab içeride döner. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab' && ref.current) {
      const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === ref.current) {
        e.preventDefault();
        last.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onKeyDown={onKey}>
        <div className="row between">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
