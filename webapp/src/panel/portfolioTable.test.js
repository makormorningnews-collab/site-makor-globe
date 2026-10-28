// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderPortfolioTable } from './portfolioTable.js';

const ENTRIES = [
  { id: 'p1', date: '12/03', entreprise: 'Evergreen Marine', stagiaire: 'Léa', symbol: '2603.TW', depuis: 5.2, ytd: 5.0 },
  { id: 'p2', date: '01/01', entreprise: 'Toyota', stagiaire: 'Tom', symbol: '7203.T', depuis: -1.1, ytd: 0.4 },
];

describe('renderPortfolioTable', () => {
  it('renders one row per entry with all 6 columns', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const cells = [...rows[0].querySelectorAll('td')].map(td => td.textContent);
    expect(cells).toEqual(['12/03', 'Evergreen Marine', 'Léa', '2603.TW', '5.2%', '5%']);
  });

  it('renders the 6 column headers', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const headers = [...container.querySelectorAll('thead th')].map(th => th.textContent.replace(/[▲▼]/g, '').trim());
    expect(headers).toEqual(['DATE', 'ENTREPRISE', 'STAGIAIRE', 'SYMBOLE', 'DEPUIS', 'YTD']);
  });

  it('shows a sort indicator only on the currently-sorted column', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'ytd', sortDirection: 'desc', onSort: () => {} });
    const headers = [...container.querySelectorAll('thead th')];
    expect(headers.find(h => h.textContent.startsWith('YTD')).textContent).toContain('▼');
    expect(headers.find(h => h.textContent.startsWith('DATE')).textContent).not.toMatch(/[▲▼]/);
  });

  it('calls onSort with the clicked column field', () => {
    const container = document.createElement('div');
    const onSort = vi.fn();
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort });
    const headers = [...container.querySelectorAll('thead th')];
    headers.find(h => h.textContent.startsWith('YTD')).click();
    expect(onSort).toHaveBeenCalledWith('ytd');
  });

  it('marks DATE/DEPUIS/YTD headers as sortable', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const headers = [...container.querySelectorAll('thead th')];
    for (const label of ['DATE', 'DEPUIS', 'YTD']) {
      const th = headers.find(h => h.textContent.startsWith(label));
      expect(th.className).toBe('portfolio-sortable');
    }
  });

  it('does not mark ENTREPRISE/STAGIAIRE/SYMBOLE headers as sortable', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const headers = [...container.querySelectorAll('thead th')];
    for (const label of ['ENTREPRISE', 'STAGIAIRE', 'SYMBOLE']) {
      const th = headers.find(h => h.textContent.startsWith(label));
      expect(th.className).toBe('');
    }
  });

  it('does not call onSort when clicking ENTREPRISE/STAGIAIRE/SYMBOLE headers', () => {
    const container = document.createElement('div');
    const onSort = vi.fn();
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort });
    const headers = [...container.querySelectorAll('thead th')];
    for (const label of ['ENTREPRISE', 'STAGIAIRE', 'SYMBOLE']) {
      headers.find(h => h.textContent.startsWith(label)).click();
    }
    expect(onSort).not.toHaveBeenCalled();
  });

  it('renders an empty percentage cell rather than "undefined%" for a missing depuis/ytd value', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ id: 'p3', date: '01/01', entreprise: 'X', stagiaire: 'Y', symbol: 'Z' }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells[4].textContent).toBe('');
    expect(cells[5].textContent).toBe('');
  });

  it('clears previous rows on re-render', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    renderPortfolioTable(container, [ENTRIES[0]], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('never interprets stored content as HTML', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ ...ENTRIES[0], entreprise: '<img src=x onerror=alert(1)>' }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
  });

  it('colors a positive DEPUIS/YTD value green and a negative one red, in read-only mode', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody tr')[0].querySelectorAll('td')];
    expect(cells[4].classList.contains('portfolio-cell-positive')).toBe(true); // depuis: 5.2
    expect(cells[5].classList.contains('portfolio-cell-positive')).toBe(true); // ytd: 5.0
    const secondRowCells = [...container.querySelectorAll('tbody tr')[1].querySelectorAll('td')];
    expect(secondRowCells[4].classList.contains('portfolio-cell-negative')).toBe(true); // depuis: -1.1
  });

  it('applies no color class when the DEPUIS/YTD value is missing', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ id: 'p3', date: '01/01', entreprise: 'X', stagiaire: 'Y', symbol: 'Z' }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells[4].className).toBe('');
    expect(cells[5].className).toBe('');
  });

  it('applies no color class (neutral) when the DEPUIS/YTD value is exactly zero', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ id: 'p3', date: '01/01', entreprise: 'X', stagiaire: 'Y', symbol: 'Z', depuis: 0, ytd: 0 }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells[4].className).toBe('');
    expect(cells[5].className).toBe('');
    expect(cells[4].textContent).toBe('0%');
  });

});

describe('editable portfolio table', () => {
  const EDIT_OPTS = { sortField: 'date', sortDirection: 'asc', onSort: () => {}, isEditing: true, onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {} };

  it('renders plain text (no inputs) when isEditing is false or omitted', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.querySelector('input')).toBeNull();
  });

  it('renders all 6 columns as inputs, with DEPUIS/YTD as number inputs and the rest as text, when isEditing is true', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [ENTRIES[0]], EDIT_OPTS);
    const inputs = [...container.querySelectorAll('tbody tr input')];
    expect(inputs).toHaveLength(6);
    expect(inputs.map(i => i.type)).toEqual(['text', 'text', 'text', 'text', 'number', 'number']);
  });

  it('calls onEditItem with the correct field patch for every column when its input changes', () => {
    const onEditItem = vi.fn();
    const container = document.createElement('div');
    renderPortfolioTable(container, [ENTRIES[0]], { ...EDIT_OPTS, onEditItem });
    const inputs = [...container.querySelectorAll('tbody tr input')];
    const cases = [
      { value: '20/06', patch: { date: '20/06' } },
      { value: 'Evergreen Marine Corp', patch: { entreprise: 'Evergreen Marine Corp' } },
      { value: 'Marie', patch: { stagiaire: 'Marie' } },
      { value: 'EMC.TW', patch: { symbol: 'EMC.TW' } },
      { value: '9.9', patch: { depuis: 9.9 } },
      { value: '8.8', patch: { ytd: 8.8 } },
    ];
    inputs.forEach((input, i) => {
      input.value = cases[i].value;
      input.dispatchEvent(new Event('change'));
      expect(onEditItem).toHaveBeenNthCalledWith(i + 1, ENTRIES[0], cases[i].patch);
    });
  });

  it('renders a delete button per row in edit mode that calls onDeleteItem with the entry', () => {
    const onDeleteItem = vi.fn();
    const container = document.createElement('div');
    renderPortfolioTable(container, [ENTRIES[0]], { ...EDIT_OPTS, onDeleteItem });
    container.querySelector('.portfolio-delete').click();
    expect(onDeleteItem).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it('does not render delete/add buttons when isEditing is false', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.querySelector('.portfolio-delete')).toBeNull();
    expect(container.querySelector('.portfolio-add')).toBeNull();
  });

  it('renders an add-entry button in edit mode that calls onAddItem', () => {
    const onAddItem = vi.fn();
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { ...EDIT_OPTS, onAddItem });
    container.querySelector('.portfolio-add').click();
    expect(onAddItem).toHaveBeenCalledTimes(1);
  });
});

describe('renderPortfolioTable short rows', () => {
  it('inverts DEPUIS/YTD colors and tags the name for a short row', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ id: 's', date: '01/10', entreprise: 'Bear Co', depuis: -5, ytd: 3, isShort: true }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody td')];
    const depuis = cells.find(td => td.textContent === '-5%');
    const ytd = cells.find(td => td.textContent === '3%');
    expect(depuis.classList.contains('portfolio-cell-positive')).toBe(true);
    expect(ytd.classList.contains('portfolio-cell-negative')).toBe(true);
    expect(container.querySelector('.portfolio-short-tag').textContent).toBe('SHORT');
  });
});
