// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { generateReportPDF } from './pdfReportBuilder.js';

function makePdf() {
  return {
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    text: vi.fn(),
    line: vi.fn(),
    splitTextToSize: vi.fn(text => [text]),
    getTextWidth: vi.fn(() => 10),
    addPage: vi.fn(),
    internal: { getNumberOfPages: vi.fn(() => 1) },
    setPage: vi.fn(),
    addImage: vi.fn(),
    save: vi.fn(),
  };
}

const MARKET_ITEMS = [
  { flag: '🇫🇷', name: 'CAC 40', value: '8 268 pts', weekChange: -0.83 },
  { flag: '🇩🇪', name: 'DAX 40', value: '19 500 pts', weekChange: 1.2 },
];
const NEWS_ITEMS = [{ title: 'Titre test', description: 'Description test' }];
const COMPANY_ITEMS = [{
  name: 'ARM Holdings', yahooSymbol: 'ARM', flag: '🇬🇧', country: 'UK', marketCap: '143,3 Md$',
  salesGrowth: '+26,35%', evEbitda: 'N/A', coursActuel: '—', targetPrice: '1345$',
  bullets: ['Point clé 1'],
}];
const PORTFOLIO_ENTRIES = [
  { date: '20/03', entreprise: 'Sumitomo Pharma', stagiaire: '', symbol: '4506.T', depuis: -30.66, ytd: -44.52 },
];

function baseOptions(overrides = {}) {
  const pdf = makePdf();
  return {
    pdf,
    autoTableFn: vi.fn(),
    loadHeaderImageFn: vi.fn().mockResolvedValue('data:image/png;base64,xxx'),
    loadFlagImageFn: vi.fn().mockResolvedValue('data:image/png;base64,flag'),
    pdfFactory: vi.fn(() => pdf),
    ...overrides,
  };
}

describe('generateReportPDF', () => {
  it('draws the region title and week label, then saves under the given filename', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, pdfFactory } = baseOptions();
    await generateReportPDF({ regionLabel: 'Europe', weekLabel: 'Semaine 23-27 MARS' }, 'test.pdf', { autoTableFn, loadHeaderImageFn, pdfFactory });
    expect(pdf.text).toHaveBeenCalledWith('Europe', expect.any(Number), expect.any(Number));
    expect(pdf.text).toHaveBeenCalledWith('Semaine 23-27 MARS', expect.any(Number), expect.any(Number));
    expect(pdf.save).toHaveBeenCalledWith('test.pdf');
  });

  it('loads the header image once and stamps it onto every page', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, pdfFactory } = baseOptions();
    pdf.internal.getNumberOfPages = () => 3;
    await generateReportPDF({ regionLabel: 'Europe', weekLabel: 'W' }, 'test.pdf', { autoTableFn, loadHeaderImageFn, pdfFactory });
    expect(loadHeaderImageFn).toHaveBeenCalledTimes(1);
    expect(pdf.setPage).toHaveBeenCalledTimes(3);
    expect(pdf.addImage).toHaveBeenCalledTimes(3);
  });

  it('draws every market index and colors weekChange green for positive, red for negative', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory } = baseOptions();
    await generateReportPDF({ regionLabel: 'Europe', weekLabel: 'W', marketItems: MARKET_ITEMS }, 'test.pdf', { autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory });
    expect(pdf.text).toHaveBeenCalledWith('-0.83%', expect.any(Number), expect.any(Number), { align: 'right' });
    expect(pdf.setTextColor).toHaveBeenCalledWith(192, 57, 43); // negative
    expect(pdf.setTextColor).toHaveBeenCalledWith(28, 138, 75); // positive
  });

  it('draws the index name plus its flag as a real image (not text, not dropped) — same Twemoji asset the live panel UI uses', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory } = baseOptions();
    await generateReportPDF({ regionLabel: 'Europe', weekLabel: 'W', marketItems: MARKET_ITEMS }, 'test.pdf', { autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory });
    expect(pdf.text).toHaveBeenCalledWith('CAC 40', expect.any(Number), expect.any(Number));
    expect(pdf.text).toHaveBeenCalledWith('DAX 40', expect.any(Number), expect.any(Number));
    expect(pdf.text).not.toHaveBeenCalledWith(expect.stringContaining('🇫🇷'), expect.anything(), expect.anything());
    // Header image (once) + one addImage per unique flag (2: FR, DE).
    expect(loadFlagImageFn).toHaveBeenCalledWith('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/1f1eb-1f1f7.png');
    expect(loadFlagImageFn).toHaveBeenCalledWith('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/1f1e9-1f1ea.png');
    expect(pdf.addImage).toHaveBeenCalledWith('data:image/png;base64,flag', 'PNG', expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
  });

  it('draws every company name, sub (with the flag as a real image, not a text code), stats, and bullets', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory } = baseOptions();
    await generateReportPDF({ regionLabel: 'Europe', weekLabel: 'W', companyItems: COMPANY_ITEMS }, 'test.pdf', { autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory });
    expect(pdf.text).toHaveBeenCalledWith('ARM Holdings', expect.any(Number), expect.any(Number));
    expect(loadFlagImageFn).toHaveBeenCalledWith('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/1f1ec-1f1e7.png');
    expect(pdf.text).not.toHaveBeenCalledWith(expect.stringContaining('GB'), expect.anything(), expect.anything());
    expect(pdf.text).toHaveBeenCalledWith('+26,35%', expect.any(Number), expect.any(Number));
    expect(pdf.text).toHaveBeenCalledWith('•  Point clé 1', expect.any(Number), expect.any(Number));
  });

  it('falls back to plain text for a flag field that is not a real flag emoji (e.g. stray literal "FR")', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory } = baseOptions();
    const items = [{ flag: 'FR', name: 'CAC 40', value: '8 268 pts', weekChange: 1 }];
    await generateReportPDF({ regionLabel: 'Europe', weekLabel: 'W', marketItems: items }, 'test.pdf', { autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory });
    expect(loadFlagImageFn).not.toHaveBeenCalled();
    expect(pdf.text).toHaveBeenCalledWith('FR', expect.any(Number), expect.any(Number));
    expect(pdf.addImage).not.toHaveBeenCalledWith(expect.anything(), 'PNG', expect.any(Number), expect.any(Number), 3.4, 3.4);
  });

  it('omits a section entirely when its data is empty, and respects the sections filter', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory } = baseOptions();
    await generateReportPDF({
      regionLabel: 'Europe', weekLabel: 'W', marketItems: MARKET_ITEMS, newsItems: [],
    }, 'test.pdf', { autoTableFn, loadHeaderImageFn, loadFlagImageFn, pdfFactory });
    expect(pdf.text).not.toHaveBeenCalledWith('NEWS MACRO', expect.any(Number), expect.any(Number));

    const second = baseOptions();
    await generateReportPDF({
      regionLabel: 'Europe', weekLabel: 'W', marketItems: MARKET_ITEMS, portfolioEntries: PORTFOLIO_ENTRIES,
      sections: ['portfolio'],
    }, 'test.pdf', second);
    expect(second.pdf.text).not.toHaveBeenCalledWith('INDICES RÉGIONAUX', expect.any(Number), expect.any(Number));
  });

  it('draws the portfolio table via autoTable when portfolio entries are present', async () => {
    const { pdf, autoTableFn, loadHeaderImageFn, pdfFactory } = baseOptions();
    await generateReportPDF({
      regionLabel: 'Europe', weekLabel: 'W', portfolioEntries: PORTFOLIO_ENTRIES, portfolioRegionLabel: 'Europe',
    }, 'test.pdf', { autoTableFn, loadHeaderImageFn, pdfFactory });
    expect(pdf.addPage).toHaveBeenCalled();
    expect(autoTableFn).toHaveBeenCalledTimes(1);
    const [, config] = autoTableFn.mock.calls[0];
    expect(config.body).toEqual([['20/03', 'Sumitomo Pharma', '', '4506.T', '-30.66%', '-44.52%']]);
  });

  it('never draws the portfolio table when there are no entries', async () => {
    const { autoTableFn, loadHeaderImageFn, pdfFactory } = baseOptions();
    await generateReportPDF({ regionLabel: 'Europe', weekLabel: 'W' }, 'test.pdf', { autoTableFn, loadHeaderImageFn, pdfFactory });
    expect(autoTableFn).not.toHaveBeenCalled();
  });

  it('rejects when the header image fails to load, without drawing or saving anything', async () => {
    const { pdf, autoTableFn, pdfFactory } = baseOptions();
    const loadHeaderImageFn = vi.fn().mockRejectedValue(new Error('image load failed'));
    await expect(
      generateReportPDF({ regionLabel: 'Europe', weekLabel: 'W' }, 'test.pdf', { autoTableFn, loadHeaderImageFn, pdfFactory })
    ).rejects.toThrow('image load failed');
    expect(pdf.save).not.toHaveBeenCalled();
  });
});

describe('generateReportPDF company tables and position', () => {
  it('draws a Points-clés table block as a real table (autoTable), not "a | b" text', async () => {
    const opts = baseOptions();
    const items = [{ ...COMPANY_ITEMS[0], bullets: [{ type: 'table', rows: [['', 'CA', 'EBITDA'], ['2025', '605 M$', '135 M$']] }] }];
    await generateReportPDF({ regionLabel: 'E', weekLabel: 'W', companyItems: items, sections: ['companies'] }, 't.pdf', opts);
    expect(opts.autoTableFn).toHaveBeenCalledWith(opts.pdf, expect.objectContaining({
      head: [['', 'CA', 'EBITDA']],
      body: [['2025', '605 M$', '135 M$']],
    }));
    expect(opts.pdf.text).not.toHaveBeenCalledWith(expect.stringContaining('|'), expect.anything(), expect.anything());
  });

  it('writes LONG / SHORT next to the company name', async () => {
    const opts = baseOptions();
    await generateReportPDF({ regionLabel: 'E', weekLabel: 'W', companyItems: [{ ...COMPANY_ITEMS[0], position: 'short' }], sections: ['companies'] }, 't.pdf', opts);
    expect(opts.pdf.text).toHaveBeenCalledWith('SHORT', expect.any(Number), expect.any(Number));
    expect(opts.pdf.setTextColor).toHaveBeenCalledWith(192, 57, 43);
  });
});
