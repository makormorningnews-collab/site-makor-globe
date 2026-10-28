// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { companySymbol, buildChartSVG, chartRangeStartISO, slicePointsFrom } from './companyChart.js';

describe('companySymbol', () => {
  it('returns the yahooSymbol field when present', () => {
    expect(companySymbol({ name: 'Evergreen Marine', yahooSymbol: '2603.TW' })).toBe('2603.TW');
  });

  it('returns null when yahooSymbol is missing', () => {
    expect(companySymbol({ name: 'Mystery Co' })).toBeNull();
  });

  it('returns null when yahooSymbol is an empty string', () => {
    expect(companySymbol({ name: 'Mystery Co', yahooSymbol: '' })).toBeNull();
  });
});

describe('companySymbol portfolio fallback', () => {
  it('uses the matching portfolio row symbol when the card has none', () => {
    expect(companySymbol({ name: 'Cohort' }, [{ entreprise: 'Cohort', symbol: 'CHRT.L' }])).toBe('CHRT.L');
  });
});

describe('chartRangeStartISO / slicePointsFrom', () => {
  const today = new Date('2026-10-28T09:00:00Z');
  it('computes each range start from today', () => {
    expect(chartRangeStartISO('ytd', today)).toBe('2026-01-01');
    expect(chartRangeStartISO('1m', today)).toBe('2026-09-28');
    expect(chartRangeStartISO('6m', today)).toBe('2026-04-28');
    expect(chartRangeStartISO('1y', today)).toBe('2025-10-28');
    expect(chartRangeStartISO('5y', today)).toBe('2021-10-28');
  });

  it('keeps the last point before the start as the baseline', () => {
    const pts = [{ date: '2025-12-30', close: 1 }, { date: '2025-12-31', close: 2 }, { date: '2026-01-02', close: 3 }];
    expect(slicePointsFrom(pts, '2026-01-01').map(p => p.close)).toEqual([2, 3]);
    expect(slicePointsFrom(pts, '2027-01-01')).toEqual([]);
  });
});

describe('buildChartSVG (legacy design)', () => {
  const RISING = [{ date: '2026-04-24', close: 100 }, { date: '2026-05-21', close: 110 }, { date: '2026-07-23', close: 130 }];
  const FALLING = [{ date: '2026-04-24', close: 100 }, { date: '2026-05-21', close: 90 }, { date: '2026-07-23', close: 70 }];

  it('uses green for a rising series and red for a falling one', () => {
    const risingSvg = buildChartSVG(RISING);
    expect(risingSvg.querySelector('polyline').getAttribute('stroke')).toBe('#1c8a4b');
    const fallingSvg = buildChartSVG(FALLING);
    expect(fallingSvg.querySelector('polyline').getAttribute('stroke')).toBe('#c0392b');
  });

  it('renders 3 y-axis gridlines/labels and up to 5 x-axis date labels', () => {
    const svg = buildChartSVG(RISING);
    expect(svg.querySelectorAll('line')).toHaveLength(3);
    const texts = [...svg.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).toContain('130.00');
    expect(texts).toContain('100.00');
    expect(texts).toContain('24/04');
    expect(texts).toContain('23/07');
  });

  it('returns null for fewer than 2 points', () => {
    expect(buildChartSVG([{ date: '2026-04-24', close: 100 }])).toBeNull();
    expect(buildChartSVG([])).toBeNull();
  });
});

describe('buildChartSVG multi-year axis', () => {
  it('labels the x-axis month/year once the series spans more than a year', () => {
    const pts = [{ date: '2021-10-28', close: 1 }, { date: '2026-10-28', close: 2 }];
    const texts = Array.from(buildChartSVG(pts).querySelectorAll('text')).map(t => t.textContent);
    expect(texts).toContain('10/21');
    expect(texts).toContain('10/26');
  });
});
