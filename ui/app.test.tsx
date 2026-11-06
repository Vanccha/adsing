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

  it('öğretici sıradaki adımı gösterir, ilerler ve kapatılabilir', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    localStorage.clear();
    const user = userEvent.setup();
    await startGame(user);
    const card = screen.getByRole('heading', { name: 'İlk adımlar' }).closest('section') as HTMLElement;
    // kurulum kuyruğu takibi ve kanalı karşılıyor: sıradaki adım saat ayırmak
    expect(within(card).getByText('Saatlerini ayır', { selector: 'strong' })).toBeInTheDocument();
    expect(within(card).getByText('2 / 8')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Öğreticiyi kapat' }));
    expect(screen.queryByRole('heading', { name: 'İlk adımlar' })).not.toBeInTheDocument();
    expect(localStorage.getItem('adsing.tutorial.off')).toBe('1');
    localStorage.clear();
  });

  it('zaman düğmeleri her ekrandan erişilebilir, panelde renkli özet kartı grafiği değiştirir', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    await startGame(user);
    await user.click(screen.getByRole('button', { name: '+1 gün' }));
    await user.click(screen.getByRole('button', { name: '+1 gün' }));
    const card = document.querySelectorAll('.kpi')[1] as HTMLElement;
    expect(card).toHaveTextContent('Nakit');
    await user.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Tümü' }));
    expect(screen.getByRole('button', { name: 'Tümü' })).toHaveAttribute('aria-pressed', 'true');
    window.location.hash = '/google';
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Google Ads' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '+1 gün' })).toBeInTheDocument();
    window.location.hash = '/dashboard';
  });

  it('Google kampanya sihirbazı adım adım ilerler ve kuyruğa ekler', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    await startGame(user);
    window.location.hash = '/google';
    await user.click(await screen.findByRole('button', { name: '+ Yeni kampanya' }));
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'İleri' }));
    expect(screen.getByText('Gözden geçir').closest('li')).toHaveAttribute('aria-current', 'step');
    const before = screen.getByRole('heading', { name: /aksiyon kuyruğu/i }).textContent;
    await user.click(screen.getByRole('button', { name: 'Kuyruğa ekle: kampanya' }));
    expect(screen.getByRole('heading', { name: /aksiyon kuyruğu/i }).textContent).not.toBe(before);
    window.location.hash = '/dashboard';
  });

  it('Meta satır içi anahtarı duraklatmayı kuyruğa alır, Pixel sekmesi veri kaynaklarını gösterir', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByLabelText(/Meta Ads/));
    await user.click(screen.getByRole('button', { name: 'Oyunu başlat' }));
    await user.click(await screen.findByRole('button', { name: '+1 hafta' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.keyboard('{Escape}');
    window.location.hash = '/meta';
    await user.click(await screen.findByRole('tab', { name: 'Reklam setleri' }));
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('tab', { name: 'Pixel ve olaylar' }));
    expect(screen.getByText("Dönüşüm API'si (sunucu)")).toBeInTheDocument();
    window.location.hash = '/dashboard';
  });

  it('Nasıl oynanır oyun başlamadan menüden açılır ve tüm bölümleri çevrilmiş gösterir', async () => {
    initI18n('tr');
    await act(async () => setLang('tr'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('navigation', { name: /gezinme/i })).getByRole('link', { name: 'Nasıl oynanır' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Nasıl oynanır' })).toBeInTheDocument();
    expect(document.querySelectorAll('.guide section.card')).toHaveLength(13);
    expect(document.querySelector('main')!.textContent).not.toMatch(/guide\.[a-z]/);
    expect(screen.getByRole('img', { name: /Karar ver/ })).toBeInTheDocument();
    window.location.hash = '/start';
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
