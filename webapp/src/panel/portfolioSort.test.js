import { describe, it, expect } from 'vitest';
import { sortPortfolioEntries, nextSort } from './portfolioSort.js';

const ENTRIES = [
  { id: 'a', date: '20/06', depuis: -2.1, ytd: 3.4 },
  { id: 'b', date: '01/01', depuis: 5.2, ytd: 5.0 },
  { id: 'c', date: '12/03', depuis: 1.1, ytd: 0.4 },
];

describe('sortPortfolioEntries', () => {
  it('sorts by date ascending (day/month)', () => {
    expect(sortPortfolioEntries(ENTRIES, 'date', 'asc').map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by date descending', () => {
    expect(sortPortfolioEntries(ENTRIES, 'date', 'desc').map(e => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by depuis ascending', () => {
    expect(sortPortfolioEntries(ENTRIES, 'depuis', 'asc').map(e => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by ytd descending', () => {
    expect(sortPortfolioEntries(ENTRIES, 'ytd', 'desc').map(e => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const copy = [...ENTRIES];
    sortPortfolioEntries(ENTRIES, 'date', 'asc');
    expect(ENTRIES).toEqual(copy);
  });

  it('treats an unparseable date as sorting last in ascending order', () => {
    const withBadDate = [...ENTRIES, { id: 'd', date: 'n/a', depuis: 0, ytd: 0 }];
    const sorted = sortPortfolioEntries(withBadDate, 'date', 'asc');
    expect(sorted[sorted.length - 1].id).toBe('d');
  });
});

describe('sortPortfolioEntries robustness', () => {
  it('accepts DD/MM/YYYY and DD.MM, keeps blanks last in both directions, ties by createdAt', () => {
    const rows = [
      { id: 'blank', date: '' },
      { id: 'oct-b', date: '07/10', createdAt: 2 },
      { id: 'mar', date: '20.03' },
      { id: 'oct-a', date: '07/10/2026', createdAt: 1 },
    ];
    expect(sortPortfolioEntries(rows, 'date', 'asc').map(e => e.id)).toEqual(['mar', 'oct-a', 'oct-b', 'blank']);
    expect(sortPortfolioEntries(rows, 'date', 'desc').map(e => e.id)).toEqual(['oct-a', 'oct-b', 'mar', 'blank']);
  });
});

describe('nextSort', () => {
  it('reverses direction when clicking the currently-sorted column', () => {
    expect(nextSort('date', 'asc', 'date')).toEqual({ field: 'date', direction: 'desc' });
    expect(nextSort('date', 'desc', 'date')).toEqual({ field: 'date', direction: 'asc' });
  });

  it('switches to date with its default ascending direction when clicked fresh', () => {
    expect(nextSort('ytd', 'desc', 'date')).toEqual({ field: 'date', direction: 'asc' });
  });

  it('switches to depuis or ytd with their default descending direction when clicked fresh', () => {
    expect(nextSort('date', 'asc', 'depuis')).toEqual({ field: 'depuis', direction: 'desc' });
    expect(nextSort('date', 'asc', 'ytd')).toEqual({ field: 'ytd', direction: 'desc' });
  });
});
