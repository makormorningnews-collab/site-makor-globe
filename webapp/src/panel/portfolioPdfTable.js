import { A4_WIDTH_MM, MARGIN_SIDE_MM, CONTENT_MARGIN_TOP_MM } from './pdfExport.js';
import { safeText } from './pdfTextSanitize.js';

const NAVY = [15, 23, 48];
const WHITE = [255, 255, 255];
const ROW_ALT = [247, 247, 250];
const POSITIVE_COLOR = [28, 138, 75];
const NEGATIVE_COLOR = [192, 57, 43];

const PORTFOLIO_COLUMNS = [
  ['date', 'DATE'], ['entreprise', 'ENTREPRISE'], ['stagiaire', 'STAGIAIRE'],
  ['symbol', 'SYMBOLE'], ['depuis', 'DEPUIS'], ['ytd', 'YTD'],
];
const PERCENT_COLUMN_INDEXES = new Set([4, 5]);

function formatCell(raw, isPercent) {
  if (raw === undefined || raw === null || raw === '') return '';
  return isPercent ? `${raw}%` : safeText(raw);
}

// Short rows: a falling price is a gain, so the colors flip.
function portfolioCellColor(value, isShort = false) {
  const num = Number(isShort ? -value : value);
  if (num > 0) return POSITIVE_COLOR;
  if (num < 0) return NEGATIVE_COLOR;
  return null; // exactly zero: neutral, keep the default text color
}

// Draws the portfolio table as native jsPDF vector content (via jspdf-autotable)
// instead of capturing it through html2canvas like the rest of the report. This
// bundled html2canvas version silently drops content from a captured element's
// rightmost columns on this specific table (reproduced with a <table>, then again
// with a CSS Grid row, both verified correct in the live DOM before capture) — a
// native table sidesteps that failure mode entirely, and reads sharper at any zoom
// since it's real vector text, not a rasterized image.
export async function drawPortfolioTable(pdf, entries, regionLabel, { autoTableFn } = {}) {
  const autoTable = autoTableFn || (await import('jspdf-autotable')).default;
  pdf.addPage();
  let startY = CONTENT_MARGIN_TOP_MM;

  if (regionLabel) {
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...NAVY);
    pdf.text(safeText(regionLabel), MARGIN_SIDE_MM, startY);
    pdf.setFont(undefined, 'normal');
    startY += 6;
  }

  autoTable(pdf, {
    startY,
    head: [PORTFOLIO_COLUMNS.map(([, label]) => label)],
    body: entries.map(entry => PORTFOLIO_COLUMNS.map(([field], i) => {
      const cell = formatCell(entry[field], PERCENT_COLUMN_INDEXES.has(i));
      return field === 'entreprise' && entry.isShort && !/short/i.test(cell) ? `${cell} (SHORT)` : cell;
    })),
    theme: 'striped',
    styles: { fontSize: 10, cellPadding: 3.5, textColor: NAVY, lineColor: [228, 230, 236] },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 9, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: MARGIN_SIDE_MM, right: MARGIN_SIDE_MM, top: CONTENT_MARGIN_TOP_MM },
    tableWidth: A4_WIDTH_MM - MARGIN_SIDE_MM * 2,
    didParseCell(data) {
      if (data.section !== 'body' || !PERCENT_COLUMN_INDEXES.has(data.column.index)) return;
      const field = PORTFOLIO_COLUMNS[data.column.index][0];
      const color = portfolioCellColor(entries[data.row.index][field], entries[data.row.index].isShort);
      if (color) data.cell.styles.textColor = color;
    },
  });
}
