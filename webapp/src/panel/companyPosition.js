// A company card's trade direction (`position` field, edited in Morning News or
// the globe's edit mode). Stored as 'long' / 'short'; anything else (empty,
// legacy free text) reads as "not set".
export function normalizePosition(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'long') return 'long';
  if (v === 'short') return 'short';
  return null;
}

export function positionLabel(position) {
  return position === 'long' ? 'LONG' : position === 'short' ? 'SHORT' : '';
}
