import { drawPortfolioTable } from './portfolioPdfTable.js';
import {
  A4_WIDTH_MM, MARGIN_SIDE_MM, MARGIN_BOTTOM_MM, CONTENT_MARGIN_TOP_MM,
  HEADER_IMAGE_URL, loadImageAsDataURL, addHeaderToEveryPage,
} from './pdfExport.js';
import { safeText } from './pdfTextSanitize.js';
import { isFlagSequence, flagImageUrl } from '../admin/flagImage.js';
import { normalizeBulletBlock } from './bulletBlocks.js';
import { normalizePosition, positionLabel } from './companyPosition.js';

// This report draws text directly with jsPDF (no HTML/canvas step), so a
// rich block becomes a plain string here. Tables are the exception: they're
// drawn as real grids by drawBulletTable, never through this function.
// Images/charts (un-renderable in this text-drawing path) become a named
// placeholder rather than "[object Object]" or a crash.
function blockToPdfText(rawBullet) {
  const block = normalizeBulletBlock(rawBullet);
  if (block.type === 'list') return (block.items || []).map(i => `- ${i}`).join('\n');
  if (block.type === 'image') return '[Image — voir la fiche entreprise]';
  if (block.type === 'chart') return '[Graphique — voir la fiche entreprise]';
  return (block.text || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*([^*]+?)\*/g, '$1');
}

const PAGE_HEIGHT_MM = 297;
const USABLE_WIDTH_MM = A4_WIDTH_MM - MARGIN_SIDE_MM * 2;

const NAVY = [15, 23, 48];
const MUTED = [118, 124, 140];
const BODY = [58, 63, 82];
const GOLD = [201, 151, 31];
const LINE = [228, 230, 236];
const POSITIVE = [28, 138, 75];
const NEGATIVE = [192, 57, 43];

const FLAG_ICON_SIZE_MM = 3.4;
const FLAG_ICON_GAP_MM = 1.3;

// jsPDF's standard built-in fonts (Helvetica/Times/Courier) have no glyphs for
// emoji — a flag like 🇯🇵 is a 2-codepoint regional-indicator sequence that used
// to get silently mis-encoded as text, producing garbage bytes with unpredictable
// measured width (this broke the indices row specifically, since it's the only
// place manual getTextWidth() math relies on an accurate width for right
// alignment). Flags are now drawn as real images via pdf.addImage() instead —
// same Twemoji PNG asset the live panel UI uses (admin/flagImage.js) — pre-fetched
// once per unique flag before drawing (see preloadFlagImages), since addImage
// needs the image data already in hand, unlike pdf.text().
async function preloadFlagImages(items, loadFlagImageFn) {
  const uniqueFlags = [...new Set(items.map(item => item.flag).filter(isFlagSequence))];
  const entries = await Promise.all(uniqueFlags.map(async flag => {
    try {
      return [flag, await loadFlagImageFn(flagImageUrl(flag))];
    } catch {
      return [flag, null]; // failed to load — callers fall back to plain text
    }
  }));
  return new Map(entries);
}

// Draws `segments` (each `{ text }` or `{ imageDataUrl }`, falsy/empty ones
// skipped) as one right-aligned unit ending at `rightX`, joined by " · " —
// used for the company sub-line, which mixes plain text (symbol/country) with
// an inline flag image and must still line up as a single right-aligned run,
// like the plain-text version this replaces.
function drawRightAlignedSegments(pdf, segments, rightX, y) {
  const parts = segments.filter(s => s && (s.text || s.imageDataUrl));
  if (parts.length === 0) return;
  const gapWidth = pdf.getTextWidth(' · ');
  const widths = parts.map(part => (part.imageDataUrl ? FLAG_ICON_SIZE_MM : pdf.getTextWidth(safeText(part.text))));
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gapWidth * (parts.length - 1);
  let x = rightX - totalWidth;
  parts.forEach((part, i) => {
    if (part.imageDataUrl) {
      pdf.addImage(part.imageDataUrl, 'PNG', x, y - FLAG_ICON_SIZE_MM + 1, FLAG_ICON_SIZE_MM, FLAG_ICON_SIZE_MM);
    } else {
      pdf.text(safeText(part.text), x, y);
    }
    x += widths[i];
    if (i < parts.length - 1) {
      pdf.text(' · ', x, y);
      x += gapWidth;
    }
  });
}

// Everything below is drawn as native jsPDF text/line/table content, not captured
// via html2canvas — this app's bundled html2canvas silently drops or clips content
// (confirmed independent of container width, font size, or side padding: the exact
// same rightmost content was cut on the very first successful export, before any of
// those were touched). Native drawing is the only approach proven reliable end to
// end (see portfolioPdfTable.js, which already used it for the table). ensureSpace
// below is this module's own lightweight page-break helper, mirroring what autoTable
// already does automatically for the table.
function ensureSpace(pdf, y, neededMm) {
  if (y + neededMm <= PAGE_HEIGHT_MM - MARGIN_BOTTOM_MM) return y;
  pdf.addPage();
  return CONTENT_MARGIN_TOP_MM;
}

const PRESENTATION_TAG = 'Morning News - Intern Presentation';
const PAGE_CENTER_MM = A4_WIDTH_MM / 2;

// Report masthead: centered above the region title on every generated PDF,
// so the document reads as one named deliverable (this presentation) rather
// than a per-region data dump. Sized and weighted above the region title
// (which stays the largest LEFT-aligned element) so the two don't compete —
// this is the one thing on the page meant to be read first.
function drawMainTitle(pdf, y) {
  pdf.setFont('times', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(...NAVY);
  pdf.text(safeText(PRESENTATION_TAG), PAGE_CENTER_MM, y, { align: 'center' });

  const ruleWidth = 26;
  pdf.setDrawColor(...GOLD);
  pdf.setLineWidth(0.5);
  pdf.line(PAGE_CENTER_MM - ruleWidth / 2, y + 4, PAGE_CENTER_MM + ruleWidth / 2, y + 4);

  return y + 15;
}

function drawTitle(pdf, regionLabel, weekLabel, y) {
  pdf.setFont('times', 'bold');
  pdf.setFontSize(24);
  pdf.setTextColor(...NAVY);
  pdf.text(safeText(regionLabel), MARGIN_SIDE_MM, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(...MUTED);
  pdf.text(safeText(weekLabel), MARGIN_SIDE_MM, y + 7);
  pdf.setDrawColor(...GOLD);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN_SIDE_MM, y + 11, A4_WIDTH_MM - MARGIN_SIDE_MM, y + 11);
  return y + 19;
}

function drawSectionLabel(pdf, text, y) {
  y = ensureSpace(pdf, y, 10);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(...NAVY);
  pdf.text(text.toUpperCase(), MARGIN_SIDE_MM, y);
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN_SIDE_MM, y + 2, A4_WIDTH_MM - MARGIN_SIDE_MM, y + 2);
  return y + 9;
}

function indexChangeColor(value) {
  return Number(value) < 0 ? NEGATIVE : POSITIVE;
}

function drawIndexCell(pdf, item, x, y, width, flagImages) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...NAVY);

  let nameX = x;
  const flagDataUrl = flagImages && flagImages.get(item.flag);
  if (flagDataUrl) {
    pdf.addImage(flagDataUrl, 'PNG', x, y - FLAG_ICON_SIZE_MM + 1, FLAG_ICON_SIZE_MM, FLAG_ICON_SIZE_MM);
    nameX = x + FLAG_ICON_SIZE_MM + FLAG_ICON_GAP_MM;
  } else if (item.flag && !isFlagSequence(item.flag)) {
    // Not a real flag emoji (e.g. stray literal text like "FR") — show as-is
    // rather than silently dropping it, same fallback as the live panel UI.
    pdf.text(safeText(item.flag), x, y);
    nameX = x + pdf.getTextWidth(safeText(item.flag)) + FLAG_ICON_GAP_MM;
  }
  pdf.text(safeText(item.name), nameX, y);

  const changeText = `${item.weekChange}%`;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...indexChangeColor(item.weekChange));
  pdf.text(changeText, x + width, y, { align: 'right' });

  const changeWidth = pdf.getTextWidth(changeText) + 3;
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...NAVY);
  pdf.text(safeText(item.value), x + width - changeWidth, y, { align: 'right' });
}

function drawIndices(pdf, marketItems, y, flagImages) {
  const gap = 10;
  const colWidth = (USABLE_WIDTH_MM - gap) / 2;
  const rowHeight = 7;
  for (let i = 0; i < marketItems.length; i += 2) {
    y = ensureSpace(pdf, y, rowHeight);
    drawIndexCell(pdf, marketItems[i], MARGIN_SIDE_MM, y, colWidth, flagImages);
    if (marketItems[i + 1]) drawIndexCell(pdf, marketItems[i + 1], MARGIN_SIDE_MM + colWidth + gap, y, colWidth, flagImages);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN_SIDE_MM, y + 2, MARGIN_SIDE_MM + colWidth, y + 2);
    if (marketItems[i + 1]) pdf.line(MARGIN_SIDE_MM + colWidth + gap, y + 2, A4_WIDTH_MM - MARGIN_SIDE_MM, y + 2);
    y += rowHeight;
  }
  return y + 3;
}

function drawNews(pdf, newsItems, y) {
  for (const item of newsItems) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    for (const line of pdf.splitTextToSize(safeText(item.title), USABLE_WIDTH_MM)) {
      y = ensureSpace(pdf, y, 5);
      pdf.setTextColor(...NAVY);
      pdf.text(line, MARGIN_SIDE_MM, y);
      y += 5;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    for (const line of pdf.splitTextToSize(safeText(item.description), USABLE_WIDTH_MM)) {
      y = ensureSpace(pdf, y, 4.5);
      pdf.setTextColor(...BODY);
      pdf.text(line, MARGIN_SIDE_MM, y);
      y += 4.5;
    }
    y += 5;
  }
  return y;
}

const STAT_FIELDS = [
  ['salesGrowthLabel', 'salesGrowth', 'Croissance CA'],
  ['evEbitdaLabel', 'evEbitda', 'EV/EBITDA'],
  ['coursActuelLabel', 'coursActuel', 'Cours actuel'],
  ['targetPriceLabel', 'targetPrice', 'Objectif'],
];

// A Points-clés table block, drawn as a real bordered grid (first row = header,
// same as on screen) instead of "a | b | c" text lines.
function drawBulletTable(pdf, autoTable, rows, y) {
  const width = Math.max(...rows.map(r => r.length));
  const pad = r => [...r, ...Array(width - r.length).fill('')].map(cell => safeText(cell));
  autoTable(pdf, {
    startY: y,
    head: [pad(rows[0])],
    body: rows.slice(1).map(pad),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: BODY, lineColor: LINE, lineWidth: 0.2 },
    headStyles: { fillColor: [248, 248, 251], textColor: NAVY, fontStyle: 'bold' },
    margin: { left: MARGIN_SIDE_MM + 5, right: MARGIN_SIDE_MM, top: CONTENT_MARGIN_TOP_MM },
    tableWidth: 'auto',
  });
  const finalY = pdf.lastAutoTable && pdf.lastAutoTable.finalY;
  return (typeof finalY === 'number' ? finalY : y + rows.length * 6) + 4;
}

function drawCompanies(pdf, companyItems, y, flagImages, autoTable) {
  companyItems.forEach((item, index) => {
    if (index > 0) {
      y = ensureSpace(pdf, y, 8);
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.2);
      pdf.line(MARGIN_SIDE_MM, y, A4_WIDTH_MM - MARGIN_SIDE_MM, y);
      y += 7;
    }
    // Keep the header block (name + sub + market cap + the 4-stat row, ~32mm)
    // together — never start a card so low on the page that its stats clip.
    y = ensureSpace(pdf, y, 34);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...NAVY);
    pdf.text(safeText(item.name), MARGIN_SIDE_MM, y);
    const position = normalizePosition(item.position);
    if (position) {
      const nameWidth = pdf.getTextWidth(safeText(item.name));
      pdf.setFontSize(9);
      pdf.setTextColor(...(position === 'long' ? POSITIVE : NEGATIVE));
      pdf.text(positionLabel(position), MARGIN_SIDE_MM + nameWidth + 3, y);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTED);
    const flagDataUrl = flagImages && flagImages.get(item.flag);
    const flagSegment = flagDataUrl
      ? { imageDataUrl: flagDataUrl }
      : { text: item.flag && !isFlagSequence(item.flag) ? item.flag : '' };
    drawRightAlignedSegments(pdf, [
      { text: item.yahooSymbol },
      flagSegment,
      { text: item.country },
    ], A4_WIDTH_MM - MARGIN_SIDE_MM, y);
    y += 5;

    if (item.marketCap) {
      pdf.setFontSize(9.5);
      pdf.setTextColor(...BODY);
      pdf.text(safeText(item.marketCap), MARGIN_SIDE_MM, y);
      y += 5;
    }
    y += 3;

    // Each stat is drawn in its own fixed-width column. Both the label and the
    // value are wrapped to the column width (was: single unclipped line) — a
    // long value like "≈ 23× (vs ~38× pour GE Vernova)" used to spill sideways
    // over the next column and overprint its value (found live on Siemens
    // Energy). The row's vertical advance grows to fit the tallest column.
    const statColWidth = USABLE_WIDTH_MM / STAT_FIELDS.length;
    const statTextWidth = statColWidth - 3;
    let statRowLines = 2;
    STAT_FIELDS.forEach(([labelField, valueField, defaultLabel], i) => {
      const sx = MARGIN_SIDE_MM + i * statColWidth;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...MUTED);
      const labelLines = pdf.splitTextToSize(safeText(item[labelField] || defaultLabel).toUpperCase(), statTextWidth).slice(0, 2);
      labelLines.forEach((line, li) => pdf.text(line, sx, y + li * 3));

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...NAVY);
      const valueBaseY = y + labelLines.length * 3 + 3.5;
      const valueLines = pdf.splitTextToSize(safeText(item[valueField]), statTextWidth).slice(0, 3);
      valueLines.forEach((line, li) => pdf.text(line, sx, valueBaseY + li * 4.5));

      statRowLines = Math.max(statRowLines, labelLines.length + valueLines.length);
    });
    y += 4 + statRowLines * 3.5;

    if ((item.bullets || []).length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...BODY);
      for (const bullet of item.bullets) {
        const block = normalizeBulletBlock(bullet);
        if (block.type === 'table' && (block.rows || []).length) {
          y = ensureSpace(pdf, y, 6 * Math.min(block.rows.length, 4));
          y = drawBulletTable(pdf, autoTable, block.rows, y - 3);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(...BODY);
          continue;
        }
        const lines = pdf.splitTextToSize(safeText(blockToPdfText(bullet)), USABLE_WIDTH_MM - 5);
        lines.forEach((line, li) => {
          y = ensureSpace(pdf, y, 4.5);
          pdf.text((li === 0 ? '•  ' : '   ') + line, MARGIN_SIDE_MM, y);
          y += 4.5;
        });
        y += 1;
      }
    }
  });
  return y;
}

async function defaultPdfFactory() {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
}

export async function generateReportPDF({
  regionLabel, weekLabel, portfolioRegionLabel = '',
  marketItems = [], newsItems = [], companyItems = [], portfolioEntries = [],
  sections = ['indices', 'news', 'companies', 'portfolio'],
}, filename, { loadHeaderImageFn = loadImageAsDataURL, loadFlagImageFn = loadImageAsDataURL, autoTableFn, pdfFactory = defaultPdfFactory } = {}) {
  const headerDataUrl = await loadHeaderImageFn(HEADER_IMAGE_URL);
  const flagImages = await preloadFlagImages([...marketItems, ...companyItems], loadFlagImageFn);
  const pdf = await pdfFactory();

  // +8mm on top of CONTENT_MARGIN_TOP_MM: that margin was tuned for image placement
  // (a straight gap under the header banner), but pdf.text()'s y is the text
  // BASELINE — a 24pt bold title's cap-height reaches ~6mm above its baseline, which
  // without this extra clearance put "Asie" almost touching the header banner.
  let y = drawMainTitle(pdf, CONTENT_MARGIN_TOP_MM + 8);
  y = drawTitle(pdf, regionLabel, weekLabel, y);

  if (sections.includes('indices') && marketItems.length) {
    y = drawSectionLabel(pdf, 'Indices régionaux', y);
    y = drawIndices(pdf, marketItems, y, flagImages);
  }
  if (sections.includes('news') && newsItems.length) {
    y = drawSectionLabel(pdf, 'News macro', y);
    y = drawNews(pdf, newsItems, y);
  }
  if (sections.includes('companies') && companyItems.length) {
    y = drawSectionLabel(pdf, 'Entreprises présentées', y);
    const hasTable = companyItems.some(item => (item.bullets || []).some(b => normalizeBulletBlock(b).type === 'table'));
    const autoTable = hasTable ? (autoTableFn || (await import('jspdf-autotable')).default) : null;
    y = drawCompanies(pdf, companyItems, y, flagImages, autoTable);
  }
  if (sections.includes('portfolio') && portfolioEntries.length) {
    await drawPortfolioTable(pdf, portfolioEntries, portfolioRegionLabel, { autoTableFn });
  }

  addHeaderToEveryPage(pdf, headerDataUrl);
  pdf.save(filename);
}
