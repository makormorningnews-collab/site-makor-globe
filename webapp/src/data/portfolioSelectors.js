import { sortPortfolioEntries } from '../panel/portfolioSort.js';

export const PORTFOLIO_REGION_BY_GLOBE_REGION = {
  asia: 'asie',
  'brics-uk': 'brics-uk',
  europe: 'europe',
  'north-america': 'amerique-du-nord-canada',
};

export function getPortfolioEntriesForRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return [];
  const entries = Object.keys(db)
    .filter(key => key.startsWith('mkg:portfolio:'))
    .map(key => db[key])
    .filter(entry => entry.regionId === portfolioRegionId);
  // Chronological (oldest presentation first), like the on-screen table and
  // Morning News — the PDF export uses this list as-is.
  return sortPortfolioEntries(entries, 'date', 'asc');
}

export function getPortfolioRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return null;
  return db[`mkg:portfolio-region:${portfolioRegionId}`] || null;
}
