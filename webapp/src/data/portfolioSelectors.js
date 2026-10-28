import { sortPortfolioEntries } from '../panel/portfolioSort.js';

export const PORTFOLIO_REGION_BY_GLOBE_REGION = {
  asia: 'asie',
  'brics-uk': 'brics-uk',
  europe: 'europe',
  'north-america': 'amerique-du-nord-canada',
};

// A portfolio row is a short when its linked company card (portfolioEntryId)
// — or, for rows created before that link existed, a card with the same
// name — is set to SHORT, or when "(short)" was typed in the name itself.
// Short rows show DEPUIS with inverted colors (a falling price is green);
// YTD keeps normal colors.
export function shortPortfolioMatcher(db) {
  const shortIds = new Set();
  const shortNames = new Set();
  for (const key of Object.keys(db)) {
    if (!key.startsWith('mkg:content:entreprises:')) continue;
    const card = db[key];
    if (!card || String(card.position || '').trim().toLowerCase() !== 'short') continue;
    if (card.portfolioEntryId) shortIds.add(card.portfolioEntryId);
    if (card.name) shortNames.add(String(card.name).trim().toLowerCase());
  }
  return entry => shortIds.has(entry.id)
    || shortNames.has(String(entry.entreprise || '').trim().toLowerCase())
    || /\(\s*short\s*\)/i.test(entry.entreprise || '');
}

export function getPortfolioEntriesForRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return [];
  const short = shortPortfolioMatcher(db);
  const entries = Object.keys(db)
    .filter(key => key.startsWith('mkg:portfolio:'))
    .map(key => db[key])
    .filter(entry => entry.regionId === portfolioRegionId)
    // Copies (never the db objects): isShort is display-only and must not be
    // written back by an edit.
    .map(entry => ({ ...entry, isShort: short(entry) }));
  // Chronological (oldest presentation first), like the on-screen table and
  // Morning News — the PDF export uses this list as-is.
  return sortPortfolioEntries(entries, 'date', 'asc');
}

export function getPortfolioRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return null;
  return db[`mkg:portfolio-region:${portfolioRegionId}`] || null;
}
