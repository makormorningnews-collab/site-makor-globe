import { describe, it, expect } from 'vitest';
import { getPortfolioEntriesForRegion, getPortfolioRegion } from './portfolioSelectors.js';

const DB = {
  'mkg:portfolio-region:asie': { id: 'asie', label: 'Asie', color: '#16a34a' },
  'mkg:portfolio-region:amerique-du-nord-canada': { id: 'amerique-du-nord-canada', label: 'Amérique du Nord / Canada', color: '#e14b3f' },
  'mkg:portfolio:p1': { id: 'p1', date: '12/03', entreprise: 'Evergreen Marine', stagiaire: 'Léa', symbol: '2603.TW', regionId: 'asie', depuis: 5.2, ytd: 5.0 },
  'mkg:portfolio:p2': { id: 'p2', date: '20/06', entreprise: 'Reliance', stagiaire: 'Tom', symbol: 'RELIANCE.NS', regionId: 'brics-uk', depuis: -2.1, ytd: 3.4 },
  'mkg:portfolio:p3': { id: 'p3', date: '01/01', entreprise: 'Toyota', stagiaire: 'Léa', symbol: '7203.T', regionId: 'asie', depuis: 1.1, ytd: 0.4 },
};

describe('getPortfolioEntriesForRegion', () => {
  it('returns only entries for the globe region mapped to the matching portfolio regionId', () => {
    const entries = getPortfolioEntriesForRegion(DB, 'asia');
    expect(entries.map(e => e.id).sort()).toEqual(['p1', 'p3']);
  });

  it('does not leak entries from a different portfolio region', () => {
    const entries = getPortfolioEntriesForRegion(DB, 'asia');
    expect(entries.some(e => e.id === 'p2')).toBe(false);
  });

  it('translates north-america to amerique-du-nord-canada and returns an empty array when nothing matches', () => {
    expect(getPortfolioEntriesForRegion(DB, 'north-america')).toEqual([]);
    expect(getPortfolioRegion(DB, 'north-america')).toEqual({ id: 'amerique-du-nord-canada', label: 'Amérique du Nord / Canada', color: '#e14b3f' });
  });

  it('returns an empty array for an unmapped region id instead of throwing', () => {
    expect(getPortfolioEntriesForRegion(DB, 'not-a-real-region')).toEqual([]);
  });
});

describe('getPortfolioRegion', () => {
  it('returns the portfolio region document for a mapped globe region', () => {
    expect(getPortfolioRegion(DB, 'asia')).toEqual({ id: 'asie', label: 'Asie', color: '#16a34a' });
  });

  it('returns null when the mapped portfolio region document does not exist in db', () => {
    expect(getPortfolioRegion(DB, 'brics-uk')).toBeNull();
  });

  it('returns null for an unmapped region id instead of throwing', () => {
    expect(getPortfolioRegion(DB, 'not-a-real-region')).toBeNull();
  });
});

describe('getPortfolioEntriesForRegion order', () => {
  it('returns the region rows chronologically, whatever the key order', () => {
    const db = {
      'mkg:portfolio:zzz': { regionId: 'asie', entreprise: 'Mars', date: '20/03' },
      'mkg:portfolio:aaa': { regionId: 'asie', entreprise: 'Oct', date: '07/10' },
      'mkg:portfolio:mmm': { regionId: 'asie', entreprise: 'Juin', date: '12/06' },
    };
    expect(getPortfolioEntriesForRegion(db, 'asia').map(e => e.entreprise)).toEqual(['Mars', 'Juin', 'Oct']);
  });
});
