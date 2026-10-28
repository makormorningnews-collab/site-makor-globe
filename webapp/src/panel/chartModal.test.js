// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initCompanyChartModal } from './chartModal.js';

function makeElements() {
  return {
    modalEl: document.createElement('div'),
    titleEl: document.createElement('span'),
    bodyEl: document.createElement('div'),
  };
}

const NOW = () => new Date('2026-07-24T12:00:00Z');
const COMPANY = { name: 'Evergreen Marine', yahooSymbol: '2603.TW' };
const PORTFOLIO_ENTRIES = [{ entreprise: 'Evergreen Marine', date: '16/07' }];

describe('initCompanyChartModal', () => {
  it('opens the modal and sets the title immediately, before the fetch resolves', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn(() => new Promise(() => {})); // never resolves
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(modalEl.classList.contains('open')).toBe(true);
    expect(titleEl.textContent).toBe('Evergreen Marine');
  });

  it('renders a chart once the fetch resolves with points', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-07-16', close: 6.2 }, { date: '2026-07-17', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('svg')).not.toBeNull();
    expect(fetchQuoteHistoryFn).toHaveBeenCalledWith('2603.TW', '2021-07-24'); // 5 years, sliced client-side per range
  });

  it('shows a message instead of calling fetch when the company has no resolvable symbol', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn();
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open({ name: 'No Symbol Co' }, PORTFOLIO_ENTRIES);
    expect(fetchQuoteHistoryFn).not.toHaveBeenCalled();
    expect(bodyEl.textContent.length).toBeGreaterThan(0);
    expect(bodyEl.querySelector('svg')).toBeNull();
  });

  it('shows a message when the fetch resolves with no usable data', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue(null);
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.textContent.length).toBeGreaterThan(0);
    expect(bodyEl.querySelector('svg')).toBeNull();
  });

  it('closes the modal and clears the body', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-07-16', close: 6.2 }, { date: '2026-07-17', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    modal.close();
    expect(modalEl.classList.contains('open')).toBe(false);
    expect(bodyEl.children.length).toBe(0);
  });

  it('never interprets the company name as HTML', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn: vi.fn(), now: NOW });
    await modal.open({ name: '<img src=x onerror=alert(1)>' }, []);
    expect(titleEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(titleEl.querySelector('img')).toBeNull();
  });

  it('falls back to the linked portfolio row symbol, and needs no presentation date', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({ points: [{ date: '2026-04-24', close: 1 }, { date: '2026-07-23', close: 2 }] });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open({ name: 'NKT A/S' }, [{ entreprise: 'NKT A/S', symbol: 'NKT.CO', date: '' }]);
    expect(fetchQuoteHistoryFn).toHaveBeenCalledWith('NKT.CO', '2021-07-24');
    expect(bodyEl.querySelector('svg')).not.toBeNull();
  });

  it('defaults to YTD and recomputes the change when another range is picked', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [
        { date: '2024-07-25', close: 50 }, { date: '2025-12-31', close: 80 },
        { date: '2026-01-02', close: 90 }, { date: '2026-07-23', close: 100 },
      ],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-range-btn.active').textContent).toBe('YTD');
    expect(bodyEl.querySelector('.chart-price-change').textContent).toBe('+25.00% depuis le 1er janvier'); // from the 2025 last close
    bodyEl.querySelector('.chart-range-btn[data-range="5y"]').click();
    expect(bodyEl.querySelector('.chart-range-btn.active').textContent).toBe('5A');
    expect(bodyEl.querySelector('.chart-price-change').textContent).toBe('+100.00% sur 5 ans');
    expect(fetchQuoteHistoryFn).toHaveBeenCalledTimes(1);
  });

  it('shows the symbol as a subtitle', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 6.2 }, { date: '2026-07-23', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-modal-sub').textContent).toContain('2603.TW');
  });

  it('shows the current price and a green percentage for a rising series', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 100 }, { date: '2026-07-23', close: 110 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-price').textContent).toBe('110.00');
    const change = bodyEl.querySelector('.chart-price-change');
    expect(change.textContent).toContain('+10.00%');
    expect(change.classList.contains('positive')).toBe(true);
  });

  it('shows a red percentage for a falling series', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 100 }, { date: '2026-07-23', close: 90 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-price-change').classList.contains('negative')).toBe(true);
  });

  it('discards a stale response when a newer open() call has already superseded it', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    let resolveFirst;
    const fetchQuoteHistoryFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ points: [{ date: '2026-04-24', close: 50 }, { date: '2026-07-23', close: 60 }] });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn, now: NOW });

    const firstOpen = modal.open(COMPANY, PORTFOLIO_ENTRIES); // starts, does not resolve yet
    await modal.open({ name: 'Second Co', yahooSymbol: 'SEC' }, [{ entreprise: 'Second Co', date: '16/07' }]); // resolves and renders fully

    expect(titleEl.textContent).toBe('Second Co');
    const priceBeforeStaleResolution = bodyEl.querySelector('.chart-price')?.textContent;

    resolveFirst({ points: [{ date: '2026-04-24', close: 999 }, { date: '2026-07-23', close: 999 }] }); // stale response for the FIRST company arrives late
    await firstOpen;

    expect(titleEl.textContent).toBe('Second Co'); // still the second company, not overwritten
    expect(bodyEl.querySelector('.chart-price')?.textContent).toBe(priceBeforeStaleResolution);
  });
});
