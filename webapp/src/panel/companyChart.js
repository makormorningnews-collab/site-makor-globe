// The card's own symbol first, else its linked portfolio row's (same
// precedence as Morning News's companySymbol).
export function companySymbol(item, portfolioEntries = []) {
  if (item.yahooSymbol && String(item.yahooSymbol).trim()) return String(item.yahooSymbol).trim();
  const match = portfolioEntries.find(entry => entry.entreprise === item.name);
  return (match && match.symbol && String(match.symbol).trim()) || null;
}

// Ranges offered in the chart modal. Five years are fetched once and every
// range is a slice of that, so switching ranges needs no new request.
export const CHART_RANGES = [
  { id: '1m', label: '1M', suffix: 'sur 1 mois' },
  { id: '6m', label: '6M', suffix: 'sur 6 mois' },
  { id: 'ytd', label: 'YTD', suffix: 'depuis le 1er janvier' },
  { id: '1y', label: '1A', suffix: 'sur 1 an' },
  { id: '5y', label: '5A', suffix: 'sur 5 ans' },
];
export const DEFAULT_CHART_RANGE = 'ytd';

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function chartRangeStartISO(rangeId, today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (rangeId === 'ytd') return `${d.getUTCFullYear()}-01-01`;
  if (rangeId === '1m') d.setUTCMonth(d.getUTCMonth() - 1);
  else if (rangeId === '6m') d.setUTCMonth(d.getUTCMonth() - 6);
  else if (rangeId === '1y') d.setUTCFullYear(d.getUTCFullYear() - 1);
  else d.setUTCFullYear(d.getUTCFullYear() - 5);
  return isoDate(d);
}

// YTD is measured from the last close of the previous year (the usual
// convention), so the slice keeps the last point before the start date.
export function slicePointsFrom(points, startISO) {
  const idx = points.findIndex(p => p.date >= startISO);
  if (idx === -1) return [];
  return points.slice(Math.max(idx - 1, 0));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 560;
const CHART_HEIGHT = 260;
const CHART_PAD_LEFT = 62;
const CHART_PAD_RIGHT = 16;
const CHART_PAD_TOP = 16;
const CHART_PAD_BOTTOM = 30;
const CHART_GREEN = '#1c8a4b';
const CHART_RED = '#c0392b';
const CHART_GRID_COLOR = '#eceef4';
const CHART_LABEL_COLOR = '#8a90a6';

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

// x-axis label: day/month on short ranges, month/year once the series spans
// more than a year (otherwise "03-14" repeats every year on the 5-year view).
function xAxisLabel(dateISO, multiYear) {
  const [y, m, d] = dateISO.split('-');
  return multiYear ? `${m}/${y.slice(2)}` : `${d}/${m}`;
}

// Prices above 1,000 (e.g. 188,600 KRW) drop decimals and get thousands
// separators, otherwise they overflow the y-axis gutter.
export function formatChartPrice(value) {
  return value >= 1000 ? Math.round(value).toLocaleString('fr-FR') : value.toFixed(2);
}

export function buildChartSVG(points, { width = CHART_WIDTH, height = CHART_HEIGHT } = {}) {
  if (!points || points.length < 2) return null;

  const closes = points.map(p => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const plotWidth = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const plotHeight = height - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const x = i => CHART_PAD_LEFT + (i / Math.max(points.length - 1, 1)) * plotWidth;
  const y = close => CHART_PAD_TOP + (1 - (close - min) / span) * plotHeight;

  const lineColor = closes[closes.length - 1] >= closes[0] ? CHART_GREEN : CHART_RED;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, style: 'width:100%;height:auto;' });

  const mid = (min + max) / 2;
  for (const value of [max, mid, min]) {
    svg.appendChild(svgEl('line', {
      x1: CHART_PAD_LEFT, y1: y(value).toFixed(1), x2: width - CHART_PAD_RIGHT, y2: y(value).toFixed(1),
      stroke: CHART_GRID_COLOR, 'stroke-width': 1,
    }));
  }

  const linePoints = points.map((p, i) => `${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
  const areaPoints = `${x(0).toFixed(1)},${(height - CHART_PAD_BOTTOM).toFixed(1)} ${linePoints} ${x(points.length - 1).toFixed(1)},${(height - CHART_PAD_BOTTOM).toFixed(1)}`;

  svg.appendChild(svgEl('polygon', { points: areaPoints, fill: lineColor, opacity: 0.08 }));
  svg.appendChild(svgEl('polyline', {
    points: linePoints, fill: 'none', stroke: lineColor, 'stroke-width': 2.2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  for (const value of [max, mid, min]) {
    const label = svgEl('text', { x: CHART_PAD_LEFT - 8, y: (y(value) + 4).toFixed(1), 'font-size': 10, fill: CHART_LABEL_COLOR, 'text-anchor': 'end' });
    label.textContent = formatChartPrice(value);
    svg.appendChild(label);
  }

  const multiYear = (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) > 400 * 86400000;
  const labelCount = Math.min(5, points.length);
  const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, k) => Math.round((k * (points.length - 1)) / Math.max(labelCount - 1, 1))))];
  for (const i of labelIndexes) {
    const label = svgEl('text', { x: x(i).toFixed(1), y: height - 8, 'font-size': 10, fill: CHART_LABEL_COLOR, 'text-anchor': 'middle' });
    label.textContent = xAxisLabel(points[i].date, multiYear);
    svg.appendChild(label);
  }

  return svg;
}
