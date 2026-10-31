// @vitest-environment jsdom
import './test/setup';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { i18n, initI18n, setLang } from './i18n';

async function startGame(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /Oyunu başlat|Start game/ }));
  await screen.findByRole('heading', { level: 1, name: /Panel|Dashboard/ });
}

describe('arayüz akışı', () => {
  it('başlangıç ekranından oyunu başlatır ve panelde nakit gösterir', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    await startGame(user);
    expect(screen.getAllByText('Nakit').length).toBeGreaterThan(0);
    expect(screen.getByText(/Gün 0 \/ 365/)).toBeInTheDocument();
    // ilk gün kuyruğu (takip + kanallar) görünür
    expect(screen.getByRole('heading', { name: /aksiyon kuyruğu/i })).toBeInTheDocument();
  });

  it('bir günü ilerletir', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    await startGame(user);
    await user.click(screen.getByRole('button', { name: '+1 gün' }));
    await waitFor(() => expect(screen.getByText(/Gün 1 \/ 365/)).toBeInTheDocument());
    // kuyruk işlendi
    expect(screen.getByText(/Kuyruk boş/)).toBeInTheDocument();
  });

  it('dili değiştirir (TR -> EN)', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Oyunu başlat' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Dil'), 'en');
    expect(await screen.findByRole('button', { name: 'Start game' })).toBeInTheDocument();
    expect(i18n.language).toBe('en');
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByText('Data')).toBeInTheDocument();
  });

  it('veri notu rozeti kaynak ayrıntısını açar', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    render(<App />);
    const badges = screen.getAllByRole('button', { name: /Varsayım|Kaynaklı|Türetilmiş/ });
    await user.click(badges[0]!);
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('Güven')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
