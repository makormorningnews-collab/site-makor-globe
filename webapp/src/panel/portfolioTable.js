import { buildEditableInput } from '../admin/editableInput.js';

const COLUMNS = [
  { field: 'date', label: 'DATE', type: 'text' },
  { field: 'entreprise', label: 'ENTREPRISE', type: 'text' },
  { field: 'stagiaire', label: 'STAGIAIRE', type: 'text' },
  { field: 'symbol', label: 'SYMBOLE', type: 'text' },
  { field: 'depuis', label: 'DEPUIS', type: 'number' },
  { field: 'ytd', label: 'YTD', type: 'number' },
];
const PERCENT_FIELDS = new Set(['depuis', 'ytd']);
const SORTABLE_FIELDS = new Set(['date', 'depuis', 'ytd']);

export function renderPortfolioTable(container, entries, { sortField, sortDirection, onSort, isEditing = false, onEditItem, onAddItem, onDeleteItem }) {
  container.replaceChildren();

  const table = document.createElement('table');
  table.className = 'portfolio-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of COLUMNS) {
    const th = document.createElement('th');
    if (SORTABLE_FIELDS.has(col.field)) {
      th.className = 'portfolio-sortable';
      const indicator = sortField === col.field ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
      th.textContent = col.label + indicator;
      th.addEventListener('click', () => onSort(col.field));
    } else {
      th.textContent = col.label;
    }
    headRow.appendChild(th);
  }
  if (isEditing) headRow.appendChild(document.createElement('th'));
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  for (const entry of entries) {
    const row = document.createElement('tr');
    for (const col of COLUMNS) {
      const td = document.createElement('td');
      const raw = entry[col.field];
      if (isEditing) {
        td.appendChild(buildEditableInput(raw, col.type, 'portfolio-cell-input', v => onEditItem(entry, { [col.field]: v })));
      } else if (PERCENT_FIELDS.has(col.field)) {
        td.textContent = raw === undefined || raw === null || raw === '' ? '' : `${raw}%`;
        if (raw !== undefined && raw !== null && raw !== '') {
          const num = Number(raw);
          // Short: the position gains when the price falls since the
          // presentation, so DEPUIS colors flip. YTD is the stock's own
          // performance and keeps the normal colors.
          const invert = entry.isShort && col.field === 'depuis';
          const good = invert ? num < 0 : num > 0;
          const bad = invert ? num > 0 : num < 0;
          if (good) td.classList.add('portfolio-cell-positive');
          else if (bad) td.classList.add('portfolio-cell-negative');
          // exactly zero: no class added, stays the default neutral color
        }
      } else {
        td.textContent = raw ?? '';
        if (col.field === 'entreprise' && entry.isShort && !/short/i.test(raw || '')) {
          const tag = document.createElement('span');
          tag.className = 'portfolio-short-tag';
          tag.textContent = 'SHORT';
          td.appendChild(tag);
        }
      }
      row.appendChild(td);
    }
    if (isEditing) {
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'portfolio-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${entry.entreprise || 'la ligne'}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => onDeleteItem(entry));
      delTd.appendChild(delBtn);
      row.appendChild(delTd);
    }
    tbody.appendChild(row);
  }

  table.append(thead, tbody);
  container.appendChild(table);

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'portfolio-add';
    addBtn.textContent = '+ Ajouter une ligne';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}
