// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { normalizeBulletBlock, appendMarkupText, buildBulletBlockContentEl } from './bulletBlocks.js';

describe('normalizeBulletBlock', () => {
  it('wraps a legacy plain-string bullet as a text block', () => {
    expect(normalizeBulletBlock('Hello')).toEqual({ type: 'text', text: 'Hello' });
  });

  it('passes an already-migrated block through unchanged', () => {
    const block = { type: 'list', items: ['a', 'b'] };
    expect(normalizeBulletBlock(block)).toBe(block);
  });

  it('falls back to an empty text block for null/undefined', () => {
    expect(normalizeBulletBlock(null)).toEqual({ type: 'text', text: '' });
  });
});

describe('appendMarkupText', () => {
  it('renders **bold** as a <b> element', () => {
    const span = document.createElement('span');
    appendMarkupText(span, 'Un **marché** en croissance');
    expect(span.innerHTML).toBe('Un <b>marché</b> en croissance');
  });

  it('renders *italic* as an <i> element', () => {
    const span = document.createElement('span');
    appendMarkupText(span, 'Un *marché* en croissance');
    expect(span.innerHTML).toBe('Un <i>marché</i> en croissance');
  });

  it('never interprets literal HTML in the source text', () => {
    const span = document.createElement('span');
    appendMarkupText(span, '<script>alert(1)</script>');
    expect(span.querySelector('script')).toBeNull();
    expect(span.textContent).toBe('<script>alert(1)</script>');
  });
});

describe('buildBulletBlockContentEl', () => {
  it('renders a text block as a .panel-bullet-text element', () => {
    const el = buildBulletBlockContentEl({ type: 'text', text: 'Hello' });
    expect(el.className).toBe('panel-bullet-text');
    expect(el.textContent).toBe('Hello');
  });

  it('renders "- " lines of a text block as a real list, one line per paragraph otherwise', () => {
    const el = buildBulletBlockContentEl({ type: 'text', text: 'Intro **forte**\n- un\n- deux\nFin' });
    const ps = el.querySelectorAll(':scope > .bt-p');
    expect([...ps].map(p => p.textContent)).toEqual(['Intro forte', 'Fin']);
    expect(ps[0].querySelector('b').textContent).toBe('forte');
    const ul = el.querySelector(':scope > ul.bt-list');
    expect([...ul.children].map(li => li.textContent)).toEqual(['un', 'deux']);
  });

  it('nests indented items and keeps → / numbered markers', () => {
    const el = buildBulletBlockContentEl({ type: 'text', text: '1. a\n  → sub\n2. b\n3) c' });
    const ol = el.querySelector(':scope > ol.bt-list');
    expect(ol.children).toHaveLength(3);
    expect([...ol.children].map(li => li.dataset.n)).toEqual(['1.', '2.', '3)']);
    const sub = ol.children[0].querySelector('ul.bt-list > li');
    expect(sub.className).toBe('bt-arrow');
    expect(sub.textContent).toBe('sub');
  });

  it('renders a list block as a <ul> with one <li> per item', () => {
    const el = buildBulletBlockContentEl({ type: 'list', items: ['a', 'b', 'c'] });
    expect(el.tagName).toBe('UL');
    expect(el.querySelectorAll('li')).toHaveLength(3);
    expect(el.querySelectorAll('li')[1].textContent).toBe('b');
  });

  it('renders a table block with the first row as headers', () => {
    const el = buildBulletBlockContentEl({ type: 'table', rows: [['FY', 'CA'], ['2025', '€500m']] });
    expect(el.tagName).toBe('TABLE');
    expect(el.querySelectorAll('th')).toHaveLength(2);
    expect(el.querySelectorAll('td')).toHaveLength(2);
  });

  it('renders an image block with the stored width', () => {
    const el = buildBulletBlockContentEl({ type: 'image', dataUrl: 'data:image/png;base64,AAA', widthPct: 50 });
    const img = el.querySelector('img');
    expect(img.src).toContain('data:image/png');
    expect(img.style.width).toBe('50%');
  });

  it('returns null for an image block with no dataUrl', () => {
    expect(buildBulletBlockContentEl({ type: 'image', dataUrl: '' })).toBeNull();
  });

  it('renders a chart block as an svg-bearing wrapper', () => {
    const el = buildBulletBlockContentEl({
      type: 'chart', chartType: 'bar', labels: ['2025', '2026'], series: [{ name: 'S1', data: [10, 20] }],
    });
    expect(el.className).toBe('panel-bullet-chart-wrap');
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('renders an empty chart wrapper (no svg) when the chart has no usable data', () => {
    const el = buildBulletBlockContentEl({ type: 'chart', chartType: 'bar', labels: [], series: [] });
    expect(el.querySelector('svg')).toBeNull();
  });
});
