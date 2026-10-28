import { fetchQuoteHistory as defaultFetchQuoteHistory } from '../data/quoteClient.js';
import {
  companySymbol, buildChartSVG, formatChartPrice, CHART_RANGES, DEFAULT_CHART_RANGE, chartRangeStartISO, slicePointsFrom,
} from './companyChart.js';

export function initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn = defaultFetchQuoteHistory, now = () => new Date() }) {
  let requestToken = 0;

  function close() {
    requestToken++;
    modalEl.classList.remove('open');
    bodyEl.replaceChildren();
  }

  function showMessage(text) {
    bodyEl.replaceChildren();
    const message = document.createElement('p');
    message.className = 'chart-modal-message';
    message.textContent = text;
    bodyEl.appendChild(message);
  }

  function showError(wrap, text) {
    wrap.replaceChildren();
    const error = document.createElement('div');
    error.className = 'chart-error';
    error.textContent = text;
    wrap.appendChild(error);
  }

  async function open(item, portfolioEntries = []) {
    const token = ++requestToken;
    titleEl.textContent = item.name;
    bodyEl.replaceChildren();
    modalEl.classList.add('open');

    const symbol = companySymbol(item, portfolioEntries);
    if (!symbol) {
      showMessage('Symbole boursier non renseigné pour cette entreprise.');
      return;
    }

    const today = now();
    let activeRange = DEFAULT_CHART_RANGE;

    const sub = document.createElement('div');
    sub.className = 'chart-modal-sub';
    sub.textContent = `Cours de l'action (${symbol})`;

    const rangeBar = document.createElement('div');
    rangeBar.className = 'chart-range-bar';
    const rangeButtons = CHART_RANGES.map(range => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chart-range-btn';
      btn.textContent = range.label;
      btn.dataset.range = range.id;
      rangeBar.appendChild(btn);
      return btn;
    });

    const wrap = document.createElement('div');
    wrap.className = 'chart-svg-wrap';
    const loading = document.createElement('div');
    loading.className = 'chart-loading';
    loading.textContent = 'Chargement de l\'historique des cours...';
    wrap.appendChild(loading);
    bodyEl.append(sub, rangeBar, wrap);

    const data = await fetchQuoteHistoryFn(symbol, chartRangeStartISO('5y', today));
    if (token !== requestToken) return; // superseded by a newer open() (or closed) since this fetch started

    if (!data || !data.points || data.points.length < 2) {
      showError(wrap, `Historique indisponible pour le moment. Le symbole (${symbol}) est peut-être incorrect, ou la source de cours est temporairement inaccessible.`);
      return;
    }

    function render() {
      rangeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.range === activeRange));
      const range = CHART_RANGES.find(r => r.id === activeRange);
      const points = slicePointsFrom(data.points, chartRangeStartISO(activeRange, today));
      if (points.length < 2) {
        showError(wrap, 'Pas assez de cotations sur cette période.');
        return;
      }

      const first = points[0].close;
      const last = points[points.length - 1].close;
      const changePct = ((last - first) / first) * 100;
      const sign = changePct >= 0 ? '+' : '';

      const priceRow = document.createElement('div');
      priceRow.className = 'chart-price-row';
      const price = document.createElement('div');
      price.className = 'chart-price';
      price.textContent = formatChartPrice(last);
      const change = document.createElement('div');
      change.className = `chart-price-change ${changePct >= 0 ? 'positive' : 'negative'}`;
      change.textContent = `${sign}${changePct.toFixed(2)}% ${range.suffix}`;
      priceRow.append(price, change);

      wrap.replaceChildren(priceRow);
      const svg = buildChartSVG(points);
      if (svg) wrap.appendChild(svg);
    }

    rangeButtons.forEach(btn => btn.addEventListener('click', () => {
      activeRange = btn.dataset.range;
      render();
    }));
    render();
  }

  return { open, close };
}
