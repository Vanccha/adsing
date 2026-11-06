// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { initI18n } from '../i18n';
import { HBars, LineChart } from './Charts';

describe('grafikler', () => {
  initI18n('tr');
  const points = [1, 2, 3, 4].map((x) => ({ x, y: x * 10 }));

  it('klavyeyle gezilir: ipucu seçili günün değerini gösterir, Escape kapatır', () => {
    render(<LineChart title="MRR" xLabel="gün" fmtY={(v) => `${v}`} series={[{ name: 'MRR', color: 'red', points }]} />);
    const chart = screen.getByRole('img', { name: 'MRR' });
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(screen.getByRole('status')).toHaveTextContent('30');
    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('tek seride lejant yok, iki seride var; veri tablosu her zaman erişilebilir', () => {
    const { container, rerender } = render(<LineChart title="A" fmtY={String} series={[{ name: 'A', color: 'red', points }]} />);
    expect(container.querySelector('.legend')).toBeNull();
    expect(screen.getByText('Veri tablosu')).toBeInTheDocument();
    rerender(<LineChart title="A" fmtY={String} series={[{ name: 'A', color: 'red', points }, { name: 'B', color: 'blue', points }]} />);
    expect(container.querySelector('.legend')).not.toBeNull();
  });

  it('yatay çubuklar en büyükten küçüğe sıralanır', () => {
    render(<HBars label="Kanallar" fmt={String} items={[{ key: 'a', label: 'Az', value: 1 }, { key: 'b', label: 'Çok', value: 9 }]} />);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Çok');
  });
});
