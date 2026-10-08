import './styles/globe.css';
import './styles/scrollbar.css';
import './panel/sidePanel.css';
import './panel/companyList.css';
import './panel/portfolioTable.css';
import './panel/chartModal.css';
import './timeline/weekTimeline.css';
import './timeline/topBanner.css';
import './timeline/weekAdmin.css';
import './admin/passwordModal.css';
import './admin/toast.css';
import './admin/colorPicker.css';
import './admin/presentationUploadModal.css';
import './admin/pdfSectionsModal.css';
import './panel/presentations.css';
import './panel/panelToggle.css';
import './panel/presentationsModal.css';
import './panel/lexiqueModal.css';
import './panel/presentationMode.css';
import './panel/panelResize.css';
import './panel/brightnessMode.css';
import { REGIONS } from './globe/regions.js';
import { regionPosition } from './globe/cycle.js';
import { initGlobeScene } from './globe/globeScene.js';
import { createFirestoreClient } from './data/firestoreClient.js';
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getIaFintechItemsForWeek, getWeekContentKeys, getAllMarketItemsForWeek, getAllNewsItemsForWeek, getAllCompanyItemsForWeek, getAllCompaniesEverPresented, getPresentations } from './data/selectors.js';
import { getPortfolioEntriesForRegion, getPortfolioRegion, PORTFOLIO_REGION_BY_GLOBE_REGION } from './data/portfolioSelectors.js';
import { normalizeRegionLabel } from './data/regionMatch.js';
import { fridayOfCurrentWeekDDMM } from './data/dateUtils.js';
import { initSidePanel } from './panel/sidePanel.js';
import { initPanelToggle } from './panel/panelToggle.js';
import { initPresentationMode } from './panel/presentationMode.js';
import { initPresentationZoom } from './panel/presentationZoom.js';
import { initPanelResize } from './panel/panelResize.js';
import { initBrightnessMode } from './panel/brightnessMode.js';
import { initPresentationsModal } from './panel/presentationsModal.js';
import { initLexiqueModal } from './panel/lexiqueModal.js';
import { initCompanyChartModal } from './panel/chartModal.js';
import { buildExportFilename, buildPortfolioExportFilename } from './panel/pdfExport.js';
import { generateReportPDF } from './panel/pdfReportBuilder.js';
import { openPresentationPdf } from './panel/presentationPdf.js';
import { initWeekTimeline } from './timeline/weekTimeline.js';
import { initTopBanner } from './timeline/topBanner.js';
import { renderWeekAdmin } from './timeline/weekAdmin.js';
import { startPortfolioLiveRefresh } from './panel/portfolioLiveRefresh.js';
import { initPasswordModal } from './admin/passwordModal.js';
import { initPresentationUploadModal } from './admin/presentationUploadModal.js';
import { initPdfSectionsModal } from './admin/pdfSectionsModal.js';
import { showToast } from './admin/toast.js';
import { generateId } from './admin/uid.js';
import { ADMIN_PASSWORD } from './admin/config.js';
import { computeSessionRestore, splitUnrestorablePresentationDeletes } from './admin/sessionUndo.js';
import { arrayBufferToBase64, validatePresentationFile, uploadPresentation, MAX_FILE_SIZE_BYTES } from './panel/presentationUpload.js';
import { initScrollActivity } from './styles/scrollActivity.js';

const GROUP_LABEL_BY_REGION = {
  asia: 'ASIE',
  'brics-uk': 'BRICS + UK',
  europe: 'EUROPE & UK',
  'north-america': 'AMÉRIQUE DU NORD',
};

const OLD_SITE_URL = 'https://makor-morning-news.vercel.app/';

const container = document.getElementById('globe-container');
const indicator = document.getElementById('region-indicator');
const prevBtn = document.getElementById('arrow-prev');
const nextBtn = document.getElementById('arrow-next');
const timelineEl = document.getElementById('week-timeline');

const chartModal = initCompanyChartModal({
  modalEl: document.getElementById('chart-modal'),
  titleEl: document.getElementById('chart-modal-title'),
  bodyEl: document.getElementById('chart-modal-body'),
});
document.getElementById('chart-modal-close').addEventListener('click', () => chartModal.close());

let currentPortfolioEntriesForChart = [];

const client = createFirestoreClient();

let db = {};
let activeWeekId = null;
let activeRegionId = 'asia';
let liveRefreshHandle = null;
let liveRefreshRegionId = null;
let isEditing = false;
let weekTimelineHandle = null;
let lastFocusedCompanyKey = null;
// Deep copy of db taken when edit mode is unlocked, so "Tout annuler" can
// restore the session's starting point. null whenever edit mode is off.
let sessionSnapshot = null;

function marketItemKey(item) {
  return `mkg:market:${activeWeekId}:${item.id}`;
}

function setItemLocal(key, value, rollbackMessage) {
  const previous = db[key];
  db[key] = value;
  renderPanelForCurrentSelection();
  client.writeDoc(key, value).catch(() => {
    if (previous === undefined) delete db[key]; else db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), rollbackMessage);
  });
}

function deleteItemLocal(key, rollbackMessage) {
  const previous = db[key];
  delete db[key];
  renderPanelForCurrentSelection();
  client.deleteDocByKey(key).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), rollbackMessage);
  });
}

function handleIndexEdit(item, patch) {
  const key = marketItemKey(item);
  setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
}

function handleIndexAdd() {
  const id = generateId();
  const key = `mkg:market:${activeWeekId}:${id}`;
  const newItem = {
    id,
    group: GROUP_LABEL_BY_REGION[activeRegionId] || '',
    flag: '',
    name: 'Nouvel indice',
    value: '',
    weekChange: 0,
  };
  setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — le nouvel indice a été retiré');
}

function handleIndexDelete(item) {
  deleteItemLocal(marketItemKey(item), "⚠️ Suppression en ligne échouée — l'indice a été restauré");
}

function handleIndexColorChange(item, field, color) {
  const colors = { ...(item.colors || {}) };
  if (color) colors[field] = color; else delete colors[field];
  handleIndexEdit(item, { colors });
}

function companyItemKey(item) {
  return `mkg:content:entreprises:${activeWeekId}:${item.id}`;
}

function handleCompanyEdit(item, patch) {
  const key = companyItemKey(item);
  setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');

  // Keep the linked portfolio row's entreprise/symbol in sync — without this,
  // renaming a company after creation (the normal workflow: add a blank card,
  // then rename it) would silently break companyChart.js's entry.entreprise
  // === item.name lookup, since the portfolio row would still hold the old
  // placeholder name forever.
  if (item.portfolioEntryId && ('name' in patch || 'yahooSymbol' in patch)) {
    const linkedEntry = db[`mkg:portfolio:${item.portfolioEntryId}`];
    if (linkedEntry) {
      const portfolioPatch = {};
      if ('name' in patch) portfolioPatch.entreprise = patch.name;
      if ('yahooSymbol' in patch) portfolioPatch.symbol = patch.yahooSymbol;
      handlePortfolioEdit(linkedEntry, portfolioPatch);
    }
  }
}

function handleCompanyAdd() {
  const id = generateId();
  const key = `mkg:content:entreprises:${activeWeekId}:${id}`;
  const portfolioId = generateId();
  const portfolioKey = `mkg:portfolio:${portfolioId}`;

  const newItem = {
    id,
    portfolioEntryId: portfolioId,
    region: GROUP_LABEL_BY_REGION[activeRegionId] || '',
    name: 'Nouvelle entreprise',
    yahooSymbol: '',
    flag: '',
    country: '',
    marketCap: '',
    salesGrowth: '',
    evEbitda: '',
    coursActuel: '',
    targetPrice: '',
    bullets: [],
  };
  const newPortfolioEntry = {
    id: portfolioId,
    date: fridayOfCurrentWeekDDMM(),
    entreprise: newItem.name,
    stagiaire: '',
    symbol: '',
    regionId: PORTFOLIO_REGION_BY_GLOBE_REGION[activeRegionId] || '',
    depuis: 0,
    ytd: 0,
  };

  db[key] = newItem;
  db[portfolioKey] = newPortfolioEntry;
  renderPanelForCurrentSelection();

  client.writeDocsBatch([[key, newItem], [portfolioKey, newPortfolioEntry]]).catch(() => {
    delete db[key];
    delete db[portfolioKey];
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), "⚠️ Ajout en ligne échoué — la nouvelle entreprise et sa ligne de portefeuille ont été retirées");
  });
}

function handleCompanyDelete(item) {
  deleteItemLocal(companyItemKey(item), "⚠️ Suppression en ligne échouée — l'entreprise a été restaurée");
}

function handleCompanyColorChange(item, field, color) {
  const colors = { ...(item.colors || {}) };
  if (color) colors[field] = color; else delete colors[field];
  handleCompanyEdit(item, { colors });
}

function handleCompanyBulletAdd(item) {
  handleCompanyEdit(item, { bullets: [...(item.bullets || []), { type: 'text', text: 'Nouveau point clé à compléter' }] });
}

// `block` is a full { type, text } object (see companyList.js) rather than
// a bare string — this panel only ever edits 'text' blocks (list/table/
// image/chart are edited in Morning News), but the array itself holds
// whatever block shape Morning News last wrote at other indices, and this
// must not collapse those back down to a string.
function handleCompanyBulletEdit(item, index, block) {
  handleCompanyEdit(item, { bullets: (item.bullets || []).map((bullet, i) => (i === index ? block : bullet)) });
}

function reindexBulletColors(colors, deletedIndex) {
  const result = {};
  for (const [key, value] of Object.entries(colors || {})) {
    const match = key.match(/^bullet-(\d+)$/);
    if (!match) {
      result[key] = value;
      continue;
    }
    const bulletIndex = Number(match[1]);
    if (bulletIndex === deletedIndex) continue; // the deleted bullet's own color goes with it
    result[bulletIndex > deletedIndex ? `bullet-${bulletIndex - 1}` : key] = value;
  }
  return result;
}

function handleCompanyBulletDelete(item, index) {
  handleCompanyEdit(item, {
    bullets: (item.bullets || []).filter((_, i) => i !== index),
    // colors are keyed by positional index (bullet-0, bullet-1, ...) — without this,
    // deleting a non-last bullet would leave surviving bullets showing a sibling's
    // stale color once the array reindexes (found in code review, 2026-07-27).
    colors: reindexBulletColors(item.colors, index),
  });
}

function portfolioItemKey(item) {
  return `mkg:portfolio:${item.id}`;
}

function handlePortfolioEdit(item, patch) {
  const key = portfolioItemKey(item);
  setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
}

function handlePortfolioAdd() {
  const id = generateId();
  const key = `mkg:portfolio:${id}`;
  const newItem = {
    id,
    date: '',
    entreprise: 'Nouvelle position',
    stagiaire: '',
    symbol: '',
    regionId: PORTFOLIO_REGION_BY_GLOBE_REGION[activeRegionId] || '',
    depuis: 0,
    ytd: 0,
  };
  setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — la nouvelle ligne a été retirée');
}

function handlePortfolioDelete(item) {
  deleteItemLocal(portfolioItemKey(item), "⚠️ Suppression en ligne échouée — la ligne a été restaurée");
}

function newsItemKey(item) {
  return `mkg:content:news:${activeWeekId}:${item.id}`;
}

function handleNewsEdit(item, patch) {
  const key = newsItemKey(item);
  setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
}

function handleNewsAdd() {
  const id = generateId();
  const key = `mkg:content:news:${activeWeekId}:${id}`;
  const newItem = {
    id,
    region: GROUP_LABEL_BY_REGION[activeRegionId] || '',
    title: 'Nouvelle brève',
    description: 'Description à compléter.',
  };
  setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — la nouvelle brève a été retirée');
}

function handleNewsDelete(item) {
  deleteItemLocal(newsItemKey(item), "⚠️ Suppression en ligne échouée — la brève a été restaurée");
}

async function handlePresentationOpen(item) {
  showToast(document.getElementById('admin-toast'), 'Chargement de la présentation...');
  const result = await openPresentationPdf(item.id, client, (done, total) => {
    if (done % 5 === 0 || done === total) {
      showToast(document.getElementById('admin-toast'), `Chargement de la présentation... (${done}/${total})`);
    }
  });
  if (!result.ok) {
    const messages = {
      'not-ready': "⚠️ Cette présentation n'est pas encore complètement intégrée — réessaie dans une minute",
      'chunk-failed': '⚠️ Échec du chargement — vérifie ta connexion et réessaie',
      'reassembly-failed': "⚠️ Erreur lors de l'ouverture du PDF",
    };
    showToast(document.getElementById('admin-toast'), messages[result.reason] || "⚠️ Erreur lors de l'ouverture du PDF");
    return;
  }
  window.open(result.url, '_blank', 'noopener');
}

function handlePresentationTitleEdit(item, title) {
  const key = `mkg:presentation:${item.id}`;
  const previous = db[key];
  const updated = { ...previous, title };
  db[key] = updated;
  renderPanelForCurrentSelection();
  client.writeDoc(key, updated).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  });
}

async function handlePresentationDelete(item) {
  if (!window.confirm(`Supprimer la présentation "${item.title || 'Sans titre'}" et son PDF ? Cette action ne peut pas être annulée.`)) return;
  const key = `mkg:presentation:${item.id}`;
  const previous = db[key];
  let chunkKeys;
  try {
    chunkKeys = await client.fetchKeysWithPrefix(`mkg:pdfchunk:${item.id}:`);
  } catch {
    // Nothing has been mutated locally yet at this point, so there's nothing
    // to roll back — just let the admin know and stop.
    showToast(document.getElementById('admin-toast'), '⚠️ Suppression en ligne échouée — vérifie ta connexion et réessaie');
    return;
  }
  delete db[key];
  renderPanelForCurrentSelection();
  try {
    await client.deleteDocsBatch([...chunkKeys, key]);
  } catch {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Suppression en ligne échouée — la présentation a été restaurée');
  }
}

function handlePresentationAddClick() {
  presentationUploadModal.open();
}

async function handlePresentationUpload(file, title) {
  const invalidReason = validatePresentationFile(file);
  if (invalidReason) {
    const messages = {
      'wrong-type': 'Seuls les fichiers PDF sont acceptés.',
      'too-large': `Fichier trop volumineux (max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} Mo).`,
    };
    presentationUploadModal.showError(messages[invalidReason] || 'Fichier invalide.');
    return;
  }

  presentationUploadModal.setSubmitting(true);

  let result;
  try {
    const id = generateId();
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    result = await uploadPresentation({
      id,
      title,
      base64,
      client,
      onProgress: (done, total) => {
        if (done % 3 === 0 || done === total) {
          showToast(document.getElementById('admin-toast'), `Envoi de la présentation... (${done}/${total})`);
        }
      },
    });
  } catch {
    presentationUploadModal.setSubmitting(false);
    presentationUploadModal.showError("Échec de l'envoi — vérifie ta connexion et réessaie.");
    return;
  }

  presentationUploadModal.setSubmitting(false);

  if (!result.ok) {
    presentationUploadModal.showError("Échec de l'envoi — vérifie ta connexion et réessaie.");
    return;
  }

  db[result.key] = result.value;
  renderPanelForCurrentSelection();
  presentationUploadModal.close();
  showToast(document.getElementById('admin-toast'), '✓ Présentation ajoutée');
}

function weekItemKey(week) {
  return `mkg:week:${week.id}`;
}

function handleWeekLabelEdit(week, patch) {
  const key = weekItemKey(week);
  const previous = db[key];
  const updated = { ...previous, ...patch };
  db[key] = updated;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
  renderPanelForCurrentSelection();
  client.writeDoc(key, updated).catch(() => {
    db[key] = previous;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  });
}

function handleWeekAdd() {
  const id = generateId();
  const key = `mkg:week:${id}`;
  const existingWeeks = getWeeks(db);
  const maxOrder = existingWeeks.reduce((max, w) => Math.max(max, w.order), -1);
  const newWeek = { id, label: 'Nouvelle semaine', order: maxOrder + 1 };
  const previousActiveWeekId = activeWeekId;

  db[key] = newWeek;
  activeWeekId = id;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
  renderPanelForCurrentSelection();

  client.writeDoc(key, newWeek).catch(() => {
    delete db[key];
    // Only snap navigation back if the user hasn't since moved on (e.g. a
    // second "+ Nouvelle semaine" click, or manually selecting another week)
    // — otherwise this would silently discard a later, successfully-saved
    // week switch just because an earlier, unrelated write failed.
    if (activeWeekId === id) activeWeekId = previousActiveWeekId;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Ajout en ligne échoué — la nouvelle semaine a été retirée');
  });
}

function handleWeekDelete(week) {
  const keys = getWeekContentKeys(db, week.id);
  const contentCount = keys.length - 1; // excludes the week document itself
  const confirmed = window.confirm(
    `Supprimer définitivement "${week.label}" et ${contentCount} élément(s) de contenu associé (indices, news, entreprises) ? Cette action ne peut pas être annulée facilement.`
  );
  if (!confirmed) return;

  const previousEntries = keys.map(key => [key, db[key]]);
  for (const key of keys) delete db[key];

  const wasActive = activeWeekId === week.id;
  let fallbackWeekId = activeWeekId;
  if (wasActive) {
    const remainingWeeks = getWeeks(db);
    activeWeekId = remainingWeeks.length ? remainingWeeks[remainingWeeks.length - 1].id : null;
    fallbackWeekId = activeWeekId;
  }
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
  renderPanelForCurrentSelection();

  client.deleteDocsBatch(keys).catch(() => {
    for (const [key, value] of previousEntries) db[key] = value;
    // Only snap navigation back to the deleted week if the user hasn't since
    // moved on from the fallback week this call switched to (e.g. manually
    // selecting another week) — same reasoning as handleWeekAdd's guard.
    if (wasActive && activeWeekId === fallbackWeekId) activeWeekId = week.id;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Suppression en ligne échouée — la semaine a été restaurée');
  });
}

function duplicateContentEntries(items, keyPrefix, newWeekId) {
  return items.map(item => {
    const newId = generateId();
    return [`${keyPrefix}${newWeekId}:${newId}`, { ...item, id: newId }];
  });
}

function handleWeekDuplicate(sourceWeek) {
  const sourceWeekId = sourceWeek.id;
  const newWeekId = generateId();
  const newWeekKey = `mkg:week:${newWeekId}`;
  const existingWeeks = getWeeks(db);
  const maxOrder = existingWeeks.reduce((max, w) => Math.max(max, w.order), -1);
  const newWeek = { id: newWeekId, label: `${sourceWeek.label} (copie)`, order: maxOrder + 1 };
  const previousActiveWeekId = activeWeekId;

  const contentEntries = [
    ...duplicateContentEntries(getAllMarketItemsForWeek(db, sourceWeekId), 'mkg:market:', newWeekId),
    ...duplicateContentEntries(getAllNewsItemsForWeek(db, sourceWeekId), 'mkg:content:news:', newWeekId),
    ...duplicateContentEntries(
      getAllCompanyItemsForWeek(db, sourceWeekId).map(({ portfolioEntryId, ...rest }) => rest),
      'mkg:content:entreprises:', newWeekId,
    ),
    ...duplicateContentEntries(getIaFintechItemsForWeek(db, sourceWeekId), 'mkg:content:ia-fintech:', newWeekId),
  ];

  db[newWeekKey] = newWeek;
  for (const [key, value] of contentEntries) db[key] = value;
  activeWeekId = newWeekId;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
  renderPanelForCurrentSelection();

  client.writeDocsBatch([[newWeekKey, newWeek], ...contentEntries]).catch(() => {
    delete db[newWeekKey];
    for (const [key] of contentEntries) delete db[key];
    // Same "only if the user hasn't since moved on" guard as handleWeekAdd/handleWeekDelete.
    if (activeWeekId === newWeekId) activeWeekId = previousActiveWeekId;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Duplication en ligne échouée — la semaine dupliquée a été retirée');
  });
}

const panel = initSidePanel({
  labelEl: document.getElementById('panel-region-label'),
  indicesEl: document.getElementById('panel-indices'),
  newsEl: document.getElementById('panel-news'),
  companiesEl: document.getElementById('panel-companies'),
  compareEl: document.getElementById('panel-compare'),
  portfolioLabelEl: document.getElementById('panel-portfolio-region-label'),
  portfolioEl: document.getElementById('panel-portfolio'),
  presentationsEl: document.getElementById('panel-presentations'),
  onOpenChart: item => chartModal.open(item, currentPortfolioEntriesForChart),
  onIndexEdit: handleIndexEdit,
  onIndexAdd: handleIndexAdd,
  onIndexDelete: handleIndexDelete,
  onIndexColorChange: handleIndexColorChange,
  onCompanyEdit: handleCompanyEdit,
  onCompanyColorChange: handleCompanyColorChange,
  onCompanyAdd: handleCompanyAdd,
  onCompanyDelete: handleCompanyDelete,
  onCompanyBulletAdd: handleCompanyBulletAdd,
  onCompanyBulletEdit: handleCompanyBulletEdit,
  onCompanyBulletDelete: handleCompanyBulletDelete,
  onPortfolioEdit: handlePortfolioEdit,
  onPortfolioAdd: handlePortfolioAdd,
  onPortfolioDelete: handlePortfolioDelete,
  onNewsEdit: handleNewsEdit,
  onNewsAdd: handleNewsAdd,
  onNewsDelete: handleNewsDelete,
  onPresentationOpen: handlePresentationOpen,
  onPresentationDelete: handlePresentationDelete,
  onPresentationTitleEdit: handlePresentationTitleEdit,
  onPresentationAddClick: handlePresentationAddClick,
});

// .side-panel has no id in index.html (only a class) — queried directly
// rather than assuming a specific nesting/id, per the same caution the panel
// itself already needs when its DOM structure changes.
initScrollActivity(document.querySelector('.side-panel'));

function updateIndicator(regionId) {
  const region = REGIONS.find(r => r.id === regionId);
  const { index, total } = regionPosition(REGIONS, regionId);
  indicator.textContent = `${region.label} · ${index}/${total}`;
  return region;
}

function renderPanelForCurrentSelection() {
  // Rendered unconditionally, before the activeWeekId guard below: unlike
  // the region panel, this has always been able to represent "no active
  // week" (renderWeekAdmin(null) just shows the add-week button, no crash).
  // Deleting the last remaining week is the one path that can drive
  // activeWeekId to null *during* an editing session — if this call were
  // gated behind the same early return as the rest of the function, the
  // week-admin container would keep showing a stale rename input/delete
  // button still wired to the just-deleted week, and using them could
  // resurrect a malformed ghost week document in Firestore.
  renderWeekAdmin(document.getElementById('week-admin'), {
    activeWeek: activeWeekId ? getWeeks(db).find(w => w.id === activeWeekId) || null : null,
    isEditing,
    onLabelEdit: handleWeekLabelEdit,
    onAddWeek: handleWeekAdd,
    onDeleteWeek: handleWeekDelete,
    onDuplicateWeek: handleWeekDuplicate,
  });

  if (!activeWeekId) return;
  const region = REGIONS.find(r => r.id === activeRegionId);
  const portfolioRegion = getPortfolioRegion(db, activeRegionId);
  const portfolioEntries = getPortfolioEntriesForRegion(db, activeRegionId);
  currentPortfolioEntriesForChart = portfolioEntries;
  panel.showRegion(region.label, {
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
    portfolioEntries,
    presentations: getPresentations(db),
    isEditing,
  });

  if (activeRegionId !== liveRefreshRegionId) {
    liveRefreshRegionId = activeRegionId;
    if (liveRefreshHandle) liveRefreshHandle.stop();
    liveRefreshHandle = startPortfolioLiveRefresh({
      getEntries: () => getPortfolioEntriesForRegion(db, activeRegionId),
      onOverrides: overrides => panel.updateLiveQuotes(overrides),
    });
  }
}

function handleRegionSelect(regionId) {
  activeRegionId = regionId;
  updateIndicator(regionId);
  renderPanelForCurrentSelection();
}

const scene = initGlobeScene(container, {
  regions: REGIONS,
  initialRegionId: activeRegionId,
  onRegionSelect: handleRegionSelect,
});

prevBtn.addEventListener('click', () => scene.goToPrevRegion());
nextBtn.addEventListener('click', () => scene.goToNextRegion());

const panelToggleHandle = initPanelToggle({
  toggleBtn: document.getElementById('panel-toggle-btn'),
  bodyEl: document.body,
});

const presentationZoomHandle = initPresentationZoom({
  outBtn: document.getElementById('presentation-zoom-out-btn'),
  inBtn: document.getElementById('presentation-zoom-in-btn'),
  valueEl: document.getElementById('presentation-zoom-value'),
  targets: [document.querySelector('.side-panel'), document.querySelector('.chart-modal-content')],
});

initPresentationMode({
  toggleBtn: document.getElementById('presentation-mode-btn'),
  bodyEl: document.body,
  onEnter: () => panelToggleHandle.open(),
  onExit: () => presentationZoomHandle.reset(),
});

initPanelResize({
  handleEl: document.getElementById('panel-resize-handle'),
  bodyEl: document.body,
});

initBrightnessMode({
  toggleBtn: document.getElementById('brightness-mode-btn'),
  bodyEl: document.body,
});

function handleSearchSelectCompany(company) {
  lastFocusedCompanyKey = `mkg:content:entreprises:${company.weekId}:${company.id}`;
  activeWeekId = company.weekId;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);

  const targetRegionId = normalizeRegionLabel(company.region);
  if (targetRegionId && targetRegionId !== activeRegionId) {
    scene.goToRegion(targetRegionId);
    // goToRegion's onRegionSelect callback (handleRegionSelect) already calls
    // renderPanelForCurrentSelection() — no need to call it a second time here.
  } else {
    renderPanelForCurrentSelection();
  }

  panelToggleHandle.open();

  // The panel's CSS opening transition (globe.css, 0.35s) must finish before
  // the target card exists at a stable scroll position — matches the timing
  // already used elsewhere in this codebase for post-transition DOM work.
  setTimeout(() => {
    // Looked up via the card's own data-companyName attribute, not
    // .panel-company-name's textContent: while editing, that span holds an
    // <input> instead of plain text (companyList.js), so a textContent match
    // would silently miss the card whenever edit mode is on (found in review).
    const card = [...document.querySelectorAll('.panel-company-card')]
      .find(el => el.dataset.companyName === company.name);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('search-highlight');
    setTimeout(() => card.classList.remove('search-highlight'), 1500);
  }, 400);
}

initTopBanner({
  searchInputEl: document.getElementById('top-banner-search-input'),
  searchResultsEl: document.getElementById('top-banner-search-results'),
  getAllCompanies: () => getAllCompaniesEverPresented(db),
  onSelectCompany: handleSearchSelectCompany,
});
initScrollActivity(document.getElementById('top-banner-search-results'));

initPresentationsModal({
  modalEl: document.getElementById('presentations-modal'),
  closeBtn: document.getElementById('presentations-modal-close'),
  triggerBtn: document.getElementById('presentations-trigger-btn'),
});

function handleLexiqueSelectCompany(company) {
  lastFocusedCompanyKey = `mkg:content:entreprises:${company.weekId}:${company.id}`;
  activeWeekId = company.weekId;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);

  const targetRegionId = normalizeRegionLabel(company.region);
  if (targetRegionId && targetRegionId !== activeRegionId) {
    scene.goToRegion(targetRegionId);
  } else {
    renderPanelForCurrentSelection();
  }

  panelToggleHandle.open();

  setTimeout(() => {
    // Looked up via the card's own data-companyName attribute, not
    // .panel-company-name's textContent: while editing, that span holds an
    // <input> instead of plain text (companyList.js), so a textContent match
    // would silently miss the card whenever edit mode is on (found in review).
    const card = [...document.querySelectorAll('.panel-company-card')]
      .find(el => el.dataset.companyName === company.name);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('search-highlight');
    setTimeout(() => card.classList.remove('search-highlight'), 1500);
  }, 400);
}

initLexiqueModal({
  modalEl: document.getElementById('lexique-modal'),
  searchInputEl: document.getElementById('lexique-search-input'),
  listEl: document.getElementById('lexique-list'),
  triggerBtn: document.getElementById('lexique-trigger-btn'),
  closeBtn: document.getElementById('lexique-modal-close'),
  getAllCompanies: () => getAllCompaniesEverPresented(db),
  onSelectCompany: handleLexiqueSelectCompany,
});

const editToggleBtn = document.getElementById('edit-toggle-btn');
const undoAllBtn = document.getElementById('undo-all-btn');

const passwordModal = initPasswordModal({
  modalEl: document.getElementById('password-modal'),
  inputEl: document.getElementById('password-input'),
  errorEl: document.getElementById('password-error'),
  cancelBtn: document.getElementById('password-cancel'),
  okBtn: document.getElementById('password-ok'),
  expectedPassword: ADMIN_PASSWORD,
  onUnlock: () => {
    isEditing = true;
    sessionSnapshot = JSON.parse(JSON.stringify(db));
    editToggleBtn.textContent = '🔒 Terminer';
    editToggleBtn.classList.add('active');
    undoAllBtn.classList.add('visible');
    renderPanelForCurrentSelection();
  },
});

const presentationUploadModal = initPresentationUploadModal({
  modalEl: document.getElementById('presentation-upload-modal'),
  fileInputEl: document.getElementById('presentation-upload-file'),
  titleInputEl: document.getElementById('presentation-upload-title'),
  errorEl: document.getElementById('presentation-upload-error'),
  cancelBtn: document.getElementById('presentation-upload-cancel'),
  okBtn: document.getElementById('presentation-upload-ok'),
  onSubmit: handlePresentationUpload,
});

editToggleBtn.addEventListener('click', () => {
  const params = new URLSearchParams({ week: activeWeekId || '', cat: 'entreprises' });
  // mkg:content:entreprises:{weekId}:{id} splits into 5 parts on ':' —
  // ['mkg', 'content', 'entreprises', weekId, id] — weekId is index 3.
  // generateId() output is base-36, never contains ':', so this split is
  // unambiguous (same assumption already relied on elsewhere in this
  // project, see phase 12 of the project memory).
  const focusedWeekId = (lastFocusedCompanyKey || '').split(':')[3];
  if (lastFocusedCompanyKey && focusedWeekId === activeWeekId) {
    params.set('key', lastFocusedCompanyKey);
  }
  window.open(`${OLD_SITE_URL}?${params.toString()}`, '_blank', 'noopener');
});

function handleUndoAll() {
  if (!sessionSnapshot) return;

  const { writes: rawWrites, deletes } = computeSessionRestore(sessionSnapshot, db);
  // A deleted presentation's PDF chunks are gone forever (handlePresentationDelete
  // removes them atomically with the metadata doc, and they're never tracked in
  // db to begin with) — restoring just the metadata doc would resurrect a card
  // that looks fine but can never open. Exclude those, tell the admin plainly.
  const { safeWrites: writes, unrestorablePresentationTitles } = splitUnrestorablePresentationDeletes(rawWrites, db);

  if (writes.length === 0 && deletes.length === 0) {
    if (unrestorablePresentationTitles.length > 0) {
      showToast(document.getElementById('admin-toast'), `⚠️ Rien à restaurer — ${unrestorablePresentationTitles.join(', ')} ne peuvent pas être récupérées (PDF définitivement supprimé)`);
    } else {
      showToast(document.getElementById('admin-toast'), 'Rien à annuler');
    }
    return;
  }

  const total = writes.length + deletes.length;
  let confirmMessage = `Annuler toutes les modifications faites depuis le début de cette session d'édition ? ${total} élément(s) seront restaurés à leur état initial.`;
  if (unrestorablePresentationTitles.length > 0) {
    confirmMessage += `\n\n⚠️ ${unrestorablePresentationTitles.join(', ')} ne peuvent pas être restaurées (PDF définitivement supprimé) et resteront supprimées.`;
  }
  if (!window.confirm(confirmMessage)) return;

  // Capture only the keys this undo actually touches, so a failed commit
  // restores exactly those and nothing else. Deliberately NOT a full copy of
  // db: the batch commit is async (and retries for up to ~1.8s), so an admin
  // can legitimately edit another section while it is in flight — wholesale
  // restoring db would silently wipe that concurrent, unrelated work.
  // Capturing references is safe here because no handler in this file ever
  // mutates a db value in place; they all build a new object and reassign.
  const touchedKeys = [...writes.map(([key]) => key), ...deletes];
  const beforeUndo = {};
  for (const key of touchedKeys) beforeUndo[key] = db[key];
  const previousActiveWeekId = activeWeekId;

  for (const [key, value] of writes) db[key] = value;
  for (const key of deletes) delete db[key];

  // A week created during this session is now gone; don't leave the app
  // pointing at a week that no longer exists. Same fallback handleWeekDelete
  // uses: land on the last remaining week, or nothing if there are none.
  const restoredWeeks = getWeeks(db);
  if (!restoredWeeks.some(w => w.id === activeWeekId)) {
    activeWeekId = restoredWeeks.length ? restoredWeeks[restoredWeeks.length - 1].id : null;
  }
  // Recorded so the failure path below can tell "the admin hasn't navigated
  // since this optimistic restore" apart from "they have" — same guard
  // handleWeekAdd/handleWeekDelete already use, so a failed commit doesn't
  // silently snap the admin back to a week they've since moved on from.
  const activeWeekIdAfterRestore = activeWeekId;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(restoredWeeks, activeWeekId);
  renderPanelForCurrentSelection();

  client.applyBatch({ writes, deletes }).then(() => {
    // sessionSnapshot is deliberately left untouched. db now matches it for
    // every key this restore covered, so a second click already computes an
    // empty diff — and keeping the original snapshot means any edit made
    // concurrently during the commit stays undoable, which re-snapshotting
    // from db would silently forfeit. (Production re-snapshots here; that is
    // equivalent only when nothing changed mid-flight.)
    showToast(document.getElementById('admin-toast'), '↺ Modifications de la session annulées');
  }).catch(() => {
    for (const key of touchedKeys) {
      if (beforeUndo[key] === undefined) delete db[key]; else db[key] = beforeUndo[key];
    }
    if (activeWeekId === activeWeekIdAfterRestore) activeWeekId = previousActiveWeekId;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Annulation en ligne échouée — vos modifications ont été conservées');
  });
}

undoAllBtn.addEventListener('click', handleUndoAll);

const exportPdfBtn = document.getElementById('export-pdf-btn');

// Full export goes through a section-picker modal (same 4 sections/labels as
// the old site's own "Exporter en PDF" button, kept consistent across both):
// the button no longer generates immediately, it opens the modal, which then
// drives the actual export via onConfirm. generateReportPDF already accepts
// a `sections` filter (pdfReportBuilder.js) — the same option the per-region
// portfolio export below already relies on — so no new export logic is
// needed here, just the selection UI in front of the existing call.
const pdfSectionsModal = initPdfSectionsModal({
  modalEl: document.getElementById('pdf-sections-modal'),
  checkboxEls: Array.from(document.querySelectorAll('#pdf-sections-modal .pdf-sections-modal-checkbox')),
  cancelBtn: document.getElementById('pdf-sections-cancel'),
  okBtn: document.getElementById('pdf-sections-ok'),
  onConfirm: async (sections) => {
    if (sections.length === 0) {
      showToast(document.getElementById('admin-toast'), 'Sélectionne au moins une section à inclure dans le PDF');
      return;
    }

    const region = REGIONS.find(r => r.id === activeRegionId);
    const activeWeek = getWeeks(db).find(w => w.id === activeWeekId);
    const portfolioRegion = getPortfolioRegion(db, activeRegionId);
    const filename = buildExportFilename(region ? region.label : '', activeWeek ? activeWeek.label : '');

    exportPdfBtn.disabled = true;
    exportPdfBtn.textContent = '⏳ Génération...';
    try {
      await generateReportPDF({
        regionLabel: region ? region.label : '',
        weekLabel: activeWeek ? activeWeek.label : '',
        portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
        marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
        newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
        companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
        portfolioEntries: getPortfolioEntriesForRegion(db, activeRegionId),
        sections,
      }, filename);
    } catch (error) {
      console.error('PDF export failed', error);
    } finally {
      exportPdfBtn.disabled = false;
      exportPdfBtn.textContent = '📄 Exporter en PDF';
    }
  },
});

exportPdfBtn.addEventListener('click', () => pdfSectionsModal.open());

const exportPortfolioPdfBtn = document.getElementById('export-portfolio-pdf-btn');

exportPortfolioPdfBtn.addEventListener('click', async () => {
  const portfolioRegion = getPortfolioRegion(db, activeRegionId);
  const activeWeek = getWeeks(db).find(w => w.id === activeWeekId);
  const filename = buildPortfolioExportFilename(portfolioRegion ? portfolioRegion.label : '', activeWeek ? activeWeek.label : '');

  exportPortfolioPdfBtn.disabled = true;
  exportPortfolioPdfBtn.textContent = '⏳';
  try {
    await generateReportPDF({
      regionLabel: portfolioRegion ? portfolioRegion.label : '',
      weekLabel: activeWeek ? activeWeek.label : '',
      portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
      portfolioEntries: getPortfolioEntriesForRegion(db, activeRegionId),
      sections: ['portfolio'],
    }, filename);
  } catch (error) {
    console.error('Portfolio PDF export failed', error);
  } finally {
    exportPortfolioPdfBtn.disabled = false;
    exportPortfolioPdfBtn.textContent = '📄';
  }
});

async function bootstrap() {
  try {
    // The live listener's first snapshot IS the initial load. This used to
    // be loadAllOnce() followed by subscribeToChanges(), but a new listener
    // always starts by re-reading every document from the server, so each
    // page load paid for the whole collection twice (~1,700 reads) —
    // a big share of Firestore's 50k/day free read quota, whose exhaustion
    // is what stopped edits from saving in Morning News.
    db = await new Promise((resolve, reject) => {
      let first = true;
      client.subscribeToChanges(newDb => {
        if (first) {
          first = false;
          resolve(newDb);
          return;
        }
        // Keeps this tab in sync with edits made elsewhere (the old site is
        // now the sole edit interface — see the "editer-redirect-old-site"
        // plan) without requiring a manual reload. Later snapshots only
        // arrive after the first render below has finished.
        db = newDb;
        if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
        renderPanelForCurrentSelection();
      }, error => {
        console.error('Firestore live sync error', error);
        if (first) {
          first = false;
          reject(error);
        }
      });
    });

    const weeks = getWeeks(db);
    activeWeekId = weeks.length ? weeks[weeks.length - 1].id : null;

    weekTimelineHandle = initWeekTimeline({
      container: timelineEl,
      weeks,
      activeWeekId,
      onSelect: weekId => {
        activeWeekId = weekId;
        renderPanelForCurrentSelection();
      },
    });

    renderPanelForCurrentSelection();
  } catch (error) {
    console.error('Failed to load Firestore data', error);
    panel.showRegion('Données indisponibles', { marketItems: [], newsItems: [] });
  }
}

bootstrap();
