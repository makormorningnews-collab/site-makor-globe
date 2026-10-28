import { buildEditableInput } from '../admin/editableInput.js';
import { buildColorDot } from '../admin/colorPicker.js';
import { buildFlagImageEl, appendJoinedParts } from '../admin/flagImage.js';
import { normalizeBulletBlock, buildBulletBlockContentEl } from './bulletBlocks.js';
import { normalizePosition, positionLabel } from './companyPosition.js';

const STAT_FIELDS = [
  ['salesGrowthLabel', 'salesGrowth', 'Croissance CA'],
  ['evEbitdaLabel', 'evEbitda', 'EV/EBITDA'],
  ['coursActuelLabel', 'coursActuel', 'Cours actuel'],
  ['targetPriceLabel', 'targetPrice', 'Objectif'],
];

// Deliberately does NOT read item.colors[valueField] or render a color dot
// for the value span: that per-company override (still used by name/
// marketCap/bullets below) was the root cause of the 4 key stat values
// showing inconsistent colors across companies — whichever ones an admin
// had happened to recolor via the dot stayed off-white forever, with no way
// to tell from the UI alone. Removing the read (not just overriding it with
// CSS) means any stale colors.<field> value left over in Firestore from
// before this fix is inert — these 4 values now always render in the
// default .panel-company-stat-value text color, for every company, with no
// mechanism left that could ever make them diverge again.
function buildStatsGrid(item, isEditing, { onEditItem }) {
  const stats = document.createElement('div');
  stats.className = 'panel-company-stats';
  for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
    const stat = document.createElement('div');
    stat.className = 'panel-company-stat';

    const label = document.createElement('span');
    label.className = 'panel-company-stat-label';
    if (isEditing) {
      label.appendChild(buildEditableInput(item[labelField] || defaultLabel, 'text', 'panel-company-stat-label-input', v => onEditItem(item, { [labelField]: v })));
    } else {
      label.textContent = item[labelField] || defaultLabel;
    }

    const value = document.createElement('span');
    value.className = 'panel-company-stat-value';
    if (isEditing) {
      value.appendChild(buildEditableInput(item[valueField], 'text', 'panel-company-stat-input', v => onEditItem(item, { [valueField]: v })));
    } else {
      value.textContent = item[valueField] ?? '';
    }

    stat.append(label, value);
    stats.appendChild(stat);
  }
  return stats;
}

function buildBulletsList(item, isEditing, { onBulletAdd, onBulletEdit, onBulletDelete, onColorChange }) {
  const bullets = document.createElement('ul');
  bullets.className = 'panel-company-bullets';

  (item.bullets || []).forEach((rawBullet, index) => {
    const block = normalizeBulletBlock(rawBullet);
    const li = document.createElement('li');
    const field = `bullet-${index}`;
    const bulletColor = item.colors && item.colors[field];
    if (bulletColor) li.style.color = bulletColor;
    // Rich blocks (list/table/image/chart) are edited in Morning News, not
    // here — this panel only offers plain-text editing (matching what it
    // always offered) plus delete, which works for any block type.
    if (isEditing && block.type === 'text') {
      const textarea = document.createElement('textarea');
      textarea.className = 'panel-company-bullet-input';
      textarea.value = block.text || '';
      textarea.addEventListener('change', () => onBulletEdit(item, index, { type: 'text', text: textarea.value }));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-company-bullet-delete';
      delBtn.setAttribute('aria-label', `Supprimer le point clé ${index + 1}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => onBulletDelete(item, index));

      li.append(textarea, buildColorDot(bulletColor, color => onColorChange(item, field, color)), delBtn);
    } else {
      if (block.type === 'text' || !block.type) {
        const arrow = document.createElement('span');
        arrow.className = 'panel-bullet-arrow';
        arrow.textContent = '▶';
        li.appendChild(arrow);
      }
      const contentEl = buildBulletBlockContentEl(block);
      if (contentEl) li.appendChild(contentEl);
      if (isEditing) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'panel-company-bullet-delete';
        delBtn.setAttribute('aria-label', `Supprimer le point clé ${index + 1}`);
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => onBulletDelete(item, index));
        li.appendChild(delBtn);
      }
    }
    bullets.appendChild(li);
  });

  if (isEditing) {
    const addLi = document.createElement('li');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-company-bullet-add';
    addBtn.textContent = '+ Point clé';
    addBtn.addEventListener('click', () => onBulletAdd(item));
    addLi.appendChild(addBtn);
    bullets.appendChild(addLi);
  }

  return bullets;
}

// LONG (green) / SHORT (red) badge at the top right of the card; a select in
// edit mode. Always returns an element (an empty placeholder when unset) so
// the header's layout doesn't shift between cards.
function buildPositionEl(item, isEditing, { onEditItem }) {
  const position = normalizePosition(item.position);
  if (isEditing) {
    const select = document.createElement('select');
    select.className = 'panel-company-position-select';
    select.setAttribute('aria-label', `Position ${item.name}`);
    for (const [value, label] of [['', 'Position…'], ['long', 'Long'], ['short', 'Short']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if ((position || '') === value) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener('change', () => onEditItem(item, { position: select.value }));
    return select;
  }
  const badge = document.createElement('span');
  badge.className = 'panel-company-position' + (position ? ` ${position}` : '');
  badge.textContent = positionLabel(position);
  return badge;
}

export function renderCompanies(container, items, selectedIds, { onToggle, onOpenChart, isEditing = false, onEditItem, onAddItem, onDeleteItem, onBulletAdd, onBulletEdit, onBulletDelete, onColorChange }) {
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'panel-company-card';
    // Independent of isEditing: while editing, .panel-company-name's text is
    // replaced by an <input> (see below), so textContent-based lookups (e.g.
    // the top-banner search and Lexique's "scroll to this card" navigation)
    // would silently fail to find the card whenever edit mode is on. A
    // dedicated attribute on the card itself works in both modes.
    card.dataset.companyName = item.name;

    const header = document.createElement('div');
    header.className = 'panel-company-header';

    const name = document.createElement('span');
    name.className = 'panel-company-name';
    const nameColor = item.colors && item.colors.name;
    if (nameColor) name.style.color = nameColor;
    if (isEditing) {
      name.appendChild(buildEditableInput(item.name, 'text', 'panel-company-name-input', v => onEditItem(item, { name: v })));
      name.appendChild(buildColorDot(nameColor, color => onColorChange(item, 'name', color)));
    } else {
      name.textContent = item.name;
    }

    const chartBtn = document.createElement('button');
    chartBtn.type = 'button';
    chartBtn.className = 'panel-chart-toggle';
    chartBtn.textContent = '📈';
    chartBtn.setAttribute('aria-label', `Graphique ${item.name}`);
    chartBtn.addEventListener('click', () => onOpenChart(item));

    const compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'panel-compare-toggle' + (selectedIds.includes(item.id) ? ' active' : '');
    compareBtn.textContent = '⚖';
    compareBtn.setAttribute('aria-label', `Comparer ${item.name}`);
    compareBtn.addEventListener('click', () => onToggle(item.id));

    header.append(name, chartBtn, compareBtn, buildPositionEl(item, isEditing, { onEditItem }));

    const sub = document.createElement('div');
    sub.className = 'panel-company-sub';
    if (isEditing) {
      sub.append(
        buildEditableInput(item.yahooSymbol, 'text', 'panel-company-sub-input', v => onEditItem(item, { yahooSymbol: v })),
        buildEditableInput(item.flag, 'text', 'panel-company-sub-input panel-company-flag-input', v => onEditItem(item, { flag: v })),
        buildEditableInput(item.country, 'text', 'panel-company-sub-input', v => onEditItem(item, { country: v })),
      );
    } else {
      appendJoinedParts(sub, [item.yahooSymbol, buildFlagImageEl(item.flag) || item.flag, item.country], ' · ');
    }

    const cap = document.createElement('div');
    cap.className = 'panel-company-cap';
    const capColor = item.colors && item.colors.marketCap;
    if (capColor) cap.style.color = capColor;
    if (isEditing) {
      cap.appendChild(buildEditableInput(item.marketCap, 'text', 'panel-company-cap-input', v => onEditItem(item, { marketCap: v })));
      cap.appendChild(buildColorDot(capColor, color => onColorChange(item, 'marketCap', color)));
    } else {
      cap.textContent = item.marketCap ?? '';
    }

    card.append(header, sub, cap, buildStatsGrid(item, isEditing, { onEditItem }), buildBulletsList(item, isEditing, { onBulletAdd, onBulletEdit, onBulletDelete, onColorChange }));

    if (isEditing) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-company-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${item.name}`);
      delBtn.textContent = '✕ Supprimer';
      delBtn.addEventListener('click', () => onDeleteItem(item));
      card.appendChild(delBtn);
    }

    container.appendChild(card);
  }

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-company-add';
    addBtn.textContent = '+ Ajouter une entreprise';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}

export function renderComparison(container, items, selectedIds) {
  container.replaceChildren();
  if (selectedIds.length !== 2) return;

  const [a, b] = selectedIds.map(id => items.find(item => item.id === id));
  if (!a || !b) return;

  const table = document.createElement('table');
  table.className = 'panel-compare-table';

  function addRow(label, valueA, valueB) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = label;
    const tdA = document.createElement('td');
    tdA.textContent = valueA ?? '';
    const tdB = document.createElement('td');
    tdB.textContent = valueB ?? '';
    row.append(th, tdA, tdB);
    table.appendChild(row);
  }

  addRow('', a.name, b.name);
  for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
    const labelA = a[labelField] || defaultLabel;
    const labelB = b[labelField] || defaultLabel;
    if (labelA === labelB) {
      addRow(defaultLabel, a[valueField], b[valueField]);
    } else {
      addRow(defaultLabel, `${labelA}: ${a[valueField] ?? ''}`, `${labelB}: ${b[valueField] ?? ''}`);
    }
  }

  container.appendChild(table);
}
