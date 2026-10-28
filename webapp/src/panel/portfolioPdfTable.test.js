// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { drawPortfolioTable } from './portfolioPdfTable.js';

function makePdf() {
  return {
    addPage: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
  };
}

const ENTRIES = [
  { date: '20/03', entreprise: 'Sumitomo Pharma', stagiaire: '', symbol: '4506.T', depuis: -30.66, ytd: -44.52 },
  { date: '12/03', entreprise: 'Evergreen Marine', stagiaire: 'Léa', symbol: '2603.TW', depuis: 5.2, ytd: 0 },
];

describe('drawPortfolioTable', () => {
  it('always starts the table on a fresh page', async () => {
    const pdf = makePdf();
    const autoTableFn = vi.fn();
    await drawPortfolioTable(pdf, ENTRIES, 'Asie', { autoTableFn });
    expect(pdf.addPage).toHaveBeenCalledTimes(1);
  });

  it('draws the region label as text above the table when given, and skips it when omitted', async () => {
    const pdf = makePdf();
    const autoTableFn = vi.fn();
    await drawPortfolioTable(pdf, ENTRIES, 'Asie', { autoTableFn });
    expect(pdf.text).toHaveBeenCalledWith('Asie', expect.any(Number), expect.any(Number));

    const pdfNoLabel = makePdf();
    await drawPortfolioTable(pdfNoLabel, ENTRIES, '', { autoTableFn });
    expect(pdfNoLabel.text).not.toHaveBeenCalled();
  });

  it('calls autoTable with the full 6-column head and one body row per entry, in the right field order', async () => {
    const pdf = makePdf();
    const autoTableFn = vi.fn();
    await drawPortfolioTable(pdf, ENTRIES, '', { autoTableFn });
    expect(autoTableFn).toHaveBeenCalledTimes(1);
    const [, config] = autoTableFn.mock.calls[0];
    expect(config.head).toEqual([['DATE', 'ENTREPRISE', 'STAGIAIRE', 'SYMBOLE', 'DEPUIS', 'YTD']]);
    expect(config.body).toEqual([
      ['20/03', 'Sumitomo Pharma', '', '4506.T', '-30.66%', '-44.52%'],
      ['12/03', 'Evergreen Marine', 'Léa', '2603.TW', '5.2%', '0%'],
    ]);
  });

  it('colors DEPUIS/YTD cells green for positive, red for negative, and leaves zero neutral (no color override)', async () => {
    const pdf = makePdf();
    const autoTableFn = vi.fn();
    await drawPortfolioTable(pdf, ENTRIES, '', { autoTableFn });
    const { didParseCell } = autoTableFn.mock.calls[0][1];

    const negativeCell = { section: 'body', column: { index: 4 }, row: { index: 0 }, cell: { styles: {} } };
    didParseCell(negativeCell);
    expect(negativeCell.cell.styles.textColor).toEqual([192, 57, 43]);

    const positiveCell = { section: 'body', column: { index: 4 }, row: { index: 1 }, cell: { styles: {} } };
    didParseCell(positiveCell);
    expect(positiveCell.cell.styles.textColor).toEqual([28, 138, 75]);

    const neutralCell = { section: 'body', column: { index: 5 }, row: { index: 1 }, cell: { styles: {} } };
    didParseCell(neutralCell);
    expect(neutralCell.cell.styles.textColor).toBeUndefined();
  });

  it('never touches non-percent columns or the header row when coloring', async () => {
    const pdf = makePdf();
    const autoTableFn = vi.fn();
    await drawPortfolioTable(pdf, ENTRIES, '', { autoTableFn });
    const { didParseCell } = autoTableFn.mock.calls[0][1];

    const nameCell = { section: 'body', column: { index: 1 }, row: { index: 0 }, cell: { styles: {} } };
    didParseCell(nameCell);
    expect(nameCell.cell.styles.textColor).toBeUndefined();

    const headCell = { section: 'head', column: { index: 4 }, row: { index: 0 }, cell: { styles: {} } };
    didParseCell(headCell);
    expect(headCell.cell.styles.textColor).toBeUndefined();
  });

  it('renders an empty cell rather than "undefined%"/"null%" for a missing depuis/ytd value', async () => {
    const pdf = makePdf();
    const autoTableFn = vi.fn();
    await drawPortfolioTable(pdf, [{ date: '01/01', entreprise: 'X', stagiaire: '', symbol: 'Z' }], '', { autoTableFn });
    const { body } = autoTableFn.mock.calls[0][1];
    expect(body[0][4]).toBe('');
    expect(body[0][5]).toBe('');
  });
});

describe('drawPortfolioTable short rows', () => {
  it('marks short rows and colors a falling price green', async () => {
    const { drawPortfolioTable } = await import('./portfolioPdfTable.js');
    const pdf = { addPage() {}, setFont() {}, setFontSize() {}, setTextColor() {}, text() {} };
    const autoTableFn = vi.fn();
    await drawPortfolioTable(pdf, [{ date: '01/10', entreprise: 'Bear Co', depuis: -5, ytd: 2, isShort: true }], '', { autoTableFn });
    const opts = autoTableFn.mock.calls[0][1];
    expect(opts.body[0][1]).toBe('Bear Co (SHORT)');
    const cell = { styles: {} };
    opts.didParseCell({ section: 'body', column: { index: 4 }, row: { index: 0 }, cell });
    expect(cell.styles.textColor).toEqual([28, 138, 75]);
    const ytdCell = { styles: {} };
    opts.didParseCell({ section: 'body', column: { index: 5 }, row: { index: 0 }, cell: ytdCell });
    expect(ytdCell.styles.textColor).toEqual([28, 138, 75]); // +2% YTD stays green
  });
});
