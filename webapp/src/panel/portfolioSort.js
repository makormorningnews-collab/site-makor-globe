const DEFAULT_DIRECTION = { date: 'asc', depuis: 'desc', ytd: 'desc' };

// "DD/MM", also tolerating a trailing year ("07/10/2026") or "DD.MM" — same
// leniency as Morning News's portfolioDateSortValue, so both sites order rows
// identically.
function parseDDMM(dateStr) {
  const match = typeof dateStr === 'string' ? /^(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?$/.exec(dateStr.trim()) : null;
  if (!match) return null;
  return Number(match[2]) * 100 + Number(match[1]);
}

function sortValue(entry, field) {
  if (field === 'date') {
    const parsed = parseDDMM(entry.date);
    return parsed === null ? Infinity : parsed;
  }
  const num = Number(entry[field]);
  return Number.isFinite(num) ? num : Infinity;
}

// Ties (same date, or both unparseable) keep insertion order (createdAt),
// like Morning News — otherwise they'd come out in Firestore's random id order.
export function sortPortfolioEntries(entries, field, direction) {
  const sign = direction === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    const va = sortValue(a, field);
    const vb = sortValue(b, field);
    if (va !== vb) return va === Infinity ? 1 : vb === Infinity ? -1 : sign * (va - vb);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export function nextSort(currentField, currentDirection, clickedField) {
  if (clickedField === currentField) {
    return { field: clickedField, direction: currentDirection === 'asc' ? 'desc' : 'asc' };
  }
  return { field: clickedField, direction: DEFAULT_DIRECTION[clickedField] || 'asc' };
}
