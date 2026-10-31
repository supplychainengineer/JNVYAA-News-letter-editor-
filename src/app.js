import { parse, autoPlace } from './parser.js';
import { renderNewsletter } from './render.js';
import { THEMES, DEFAULT_THEME, getTheme } from './themes.js';
import * as Photos from './photos.js';

const SAMPLE_DIR = 'newsletters/sample/';
const SAMPLE_PHOTOS = ['reunion.svg', 'campus.svg', 'sports.svg', 'library.svg', 'science.svg', 'portrait-1.svg', 'portrait-2.svg', 'portrait-3.svg'];
const STATE_KEY = 'newsletter-studio:v1';
const HTML_TO_IMAGE = new URL('../assets/vendor/html-to-image.js', import.meta.url).href; // v1.11.11, MIT

const STARTER = `# Our Newsletter
> News and updates from our community

Write a short welcome note here, or paste your raw notes, a CSV export or JSON — the layout adapts.

## First story headline
Tell the story in a few paragraphs. Drop photos in the Photos tab and they'll be placed automatically.

## By the numbers
120 | Members
8 | Events this year
`;

const BLOCKS = {
  story: '## Story headline\n### Kicker\n![Caption](photo.jpg)\nFirst paragraph of the story.\n\nSecond paragraph.\n',
  stats: '## By the numbers\n1,240 | Members\n₹5L | Raised\n12 | Events\n',
  events: '## Upcoming events\nNov 22 | Event title | Venue, time\nDec 06 | Another event | Online\n',
  quote: '## In their words\n> The quote goes here.\n— Name, Role\n',
  people: '## Spotlight\nFull Name | Role or batch | photo.jpg | One-line bio.\nFull Name | Role or batch | photo.jpg | One-line bio.\n',
  chart: '## Members by city {chart}\nCity A | 120\nCity B | 90\nCity C | 45\n',
  table: '## Results {table}\nName | Event | Position\nAsha | 100m | 1st\nRavi | Long jump | 2nd\n',
  gallery: '## In pictures\n![Caption](photo-1.jpg)\n![Caption](photo-2.jpg)\n![Caption](photo-3.jpg)\n',
  cta: '## Get involved {cta}\nOne or two sentences on what readers can do.\n[Button label](https://example.org)\n',
};

const $ = (s) => document.querySelector(s);
const source = $('#source');
const frame = $('#preview');

const state = { text: '', theme: '', accent: '', numbers: true, autoPhotos: true, view: 'desktop' };
const photos = new Map(); // lower-case name -> { name, blob, url }
let lastModel = null;

// ------------------------------------------------------------ storage ----

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(state, saved);
    return !!saved;
  } catch {
    return false;
  }
}
let saveTimer;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }, 300);
}

// ------------------------------------------------------------- render ----

const norm = (s) => String(s).split('/').pop().toLowerCase();

function buildModel() {
  return autoPlace(parse(state.text), [...photos.values()].map((p) => p.name), { auto: state.autoPhotos });
}

function renderOpts(resolveImage) {
  return { theme: state.theme || undefined, accent: state.accent || undefined, numbers: state.numbers, resolveImage };
}

const previewResolver = (src) => {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const p = photos.get(norm(src));
  return p ? p.url : null;
};

let renderTimer;
function scheduleRender(delay = 180) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, delay);
}

function render() {
  const model = buildModel();
  lastModel = model;
  const html = renderNewsletter(model, renderOpts(previewResolver));
  const win = frame.contentWindow;
  const y = win ? win.scrollY : 0;
  frame.onload = () => { try { frame.contentWindow.scrollTo(0, y); } catch { /* ignore */ } };
  frame.srcdoc = html;
  updateSummary(model);
  updateThemeSelection(model);
  updatePhotoUsage(model);
}

function updateSummary(model) {
  const counts = {};
  for (const s of model.sections) counts[s.type] = (counts[s.type] || 0) + 1;
  const parts = [`${model.sections.length} section${model.sections.length === 1 ? '' : 's'}`];
  if (photos.size) parts.push(`${photos.size} photo${photos.size === 1 ? '' : 's'}`);
  $('#summary').textContent = parts.join(' · ');
  const w = $('#warnings');
  w.replaceChildren(...model.warnings.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
}

// ------------------------------------------------------------- photos ----

function usedNames(model) {
  const used = new Set();
  if (model.hero) used.add(norm(model.hero.src));
  for (const s of model.sections) {
    s.images.forEach((i) => used.add(norm(i.src)));
    (s.items || []).forEach((it) => it && it.photo && used.add(norm(it.photo)));
  }
  return used;
}

function updatePhotoUsage(model) {
  const used = usedNames(model);
  document.querySelectorAll('.photo').forEach((el) => {
    el.querySelector('.used').textContent = used.has(el.dataset.key) ? 'In layout' : 'Not used';
  });
}

function renderPhotoGrid() {
  const grid = $('#photo-grid');
  grid.replaceChildren();
  for (const [key, p] of photos) {
    const el = document.createElement('div');
    el.className = 'photo';
    el.dataset.key = key;
    el.innerHTML = `<img alt=""><div class="meta"><span class="name"></span><span class="used"></span><div class="actions"><button class="btn small" data-act="insert">Insert</button><button class="btn small danger" data-act="remove" aria-label="Remove">✕</button></div></div>`;
    el.querySelector('img').src = p.url;
    el.querySelector('.name').textContent = p.name;
    el.querySelector('.name').title = p.name;
    grid.append(el);
  }
  $('#photo-count').textContent = photos.size;
  if (lastModel) updatePhotoUsage(lastModel);
}

async function addPhotoFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(f.name));
  if (!list.length) return;
  toast(`Adding ${list.length} photo${list.length > 1 ? 's' : ''}…`);
  for (const f of list) {
    const rec = await Photos.prepare(f);
    const key = rec.name.toLowerCase();
    const old = photos.get(key);
    if (old) URL.revokeObjectURL(old.url);
    photos.set(key, { name: rec.name, blob: rec.blob, url: URL.createObjectURL(rec.blob) });
    await Photos.save({ name: rec.name, blob: rec.blob });
  }
  renderPhotoGrid();
  render();
  toast(`${list.length} photo${list.length > 1 ? 's' : ''} added`);
}

async function loadSavedPhotos() {
  for (const rec of await Photos.loadAll()) {
    if (rec && rec.blob) photos.set(rec.name.toLowerCase(), { name: rec.name, blob: rec.blob, url: URL.createObjectURL(rec.blob) });
  }
  renderPhotoGrid();
}

$('#photo-grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const key = btn.closest('.photo').dataset.key;
  const p = photos.get(key);
  if (!p) return;
  if (btn.dataset.act === 'insert') {
    insertAtCursor(`![](${p.name})\n`);
    switchTab('content');
  } else {
    URL.revokeObjectURL(p.url);
    photos.delete(key);
    await Photos.remove(p.name);
    renderPhotoGrid();
    render();
  }
});

$('#btn-clear-photos').addEventListener('click', async () => {
  if (!photos.size || !confirm('Remove all photos from this browser?')) return;
  for (const p of photos.values()) URL.revokeObjectURL(p.url);
  photos.clear();
  await Photos.clear();
  renderPhotoGrid();
  render();
});

$('#photo-input').addEventListener('change', (e) => { addPhotoFiles(e.target.files); e.target.value = ''; });

// --------------------------------------------------------- drag & drop ----

let dragDepth = 0;
const overlay = $('#drop-overlay');
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  dragDepth++;
  overlay.classList.add('show');
});
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; overlay.classList.remove('show'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.classList.remove('show');
  const files = [...(e.dataTransfer?.files || [])];
  const data = files.find((f) => /\.(md|markdown|txt|csv|tsv|json)$/i.test(f.name));
  if (data) await importDataFile(data);
  const imgs = files.filter((f) => f !== data);
  if (imgs.length) { switchTab('photos'); await addPhotoFiles(imgs); }
});

// ------------------------------------------------------------ content ----

function setText(text) {
  source.value = text;
  state.text = text;
  saveState();
  render();
}

source.addEventListener('input', () => {
  state.text = source.value;
  saveState();
  scheduleRender();
});

function insertAtCursor(snippet) {
  const { selectionStart: a, selectionEnd: b, value } = source;
  const before = value.slice(0, a);
  const pad = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const text = pad + snippet;
  source.value = before + text + value.slice(b);
  source.focus();
  source.selectionStart = source.selectionEnd = a + text.length;
  state.text = source.value;
  saveState();
  render();
}

$('#insert-block').addEventListener('change', (e) => {
  const snippet = BLOCKS[e.target.value];
  e.target.value = '';
  if (snippet) insertAtCursor(snippet);
});

async function importDataFile(file) {
  const text = await file.text();
  if (source.value.trim() && !confirm(`Replace the current content with ${file.name}?`)) return;
  switchTab('content');
  setText(text);
  toast(`Imported ${file.name}`);
}
$('#file-import').addEventListener('change', (e) => { if (e.target.files[0]) importDataFile(e.target.files[0]); e.target.value = ''; });

async function loadSample({ ask = true } = {}) {
  if (ask && source.value.trim() && !confirm('Replace the current content with the sample newsletter?')) return;
  try {
    const res = await fetch(SAMPLE_DIR + 'content.md');
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    for (const name of SAMPLE_PHOTOS) {
      if (photos.has(name)) continue;
      const r = await fetch(SAMPLE_DIR + 'photos/' + name);
      if (!r.ok) continue;
      const blob = await r.blob();
      photos.set(name, { name, blob, url: URL.createObjectURL(blob) });
      await Photos.save({ name, blob });
    }
    state.theme = '';
    state.accent = '';
    syncDesignControls();
    renderPhotoGrid();
    setText(text);
  } catch {
    // Opened from file:// or the sample is missing: fall back to a starter.
    setText(STARTER);
    toast('Sample unavailable here — serve the folder over http to load it');
  }
}
$('#btn-sample').addEventListener('click', () => loadSample());

// ------------------------------------------------------------- design ----

function buildThemeGrid() {
  // Load every theme's fonts so the cards preview their type.
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + [...new Set(Object.values(THEMES).flatMap((t) => t.fonts.families))].map((f) => 'family=' + f).join('&') + '&display=swap';
  document.head.append(link);

  const grid = $('#theme-grid');
  for (const [key, t] of Object.entries(THEMES)) {
    const b = document.createElement('button');
    b.className = 'theme-card';
    b.dataset.theme = key;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<div class="sw"><span class="aa">Aa</span><span class="dots"><i></i><i></i><i></i></span></div><div class="tx"><b></b><span></span></div>`;
    const sw = b.querySelector('.sw');
    sw.style.background = t.colors.paper;
    sw.style.color = t.colors.ink;
    const aa = b.querySelector('.aa');
    aa.style.fontFamily = t.fonts.display;
    aa.style.fontWeight = t.displayWeight;
    aa.style.color = t.mast === 'framed' ? t.colors.accent : t.colors.ink;
    const dots = b.querySelectorAll('.dots i');
    [t.colors.accent, t.colors.accent2, t.colors.soft].forEach((c, i) => { dots[i].style.background = c; });
    b.querySelector('b').textContent = t.label;
    b.querySelector('.tx span').textContent = t.description;
    b.addEventListener('click', () => {
      state.theme = key;
      state.accent = '';
      syncDesignControls();
      saveState();
      render();
    });
    grid.append(b);
  }
}

function activeThemeKey(model) {
  const k = String(state.theme || model?.meta?.theme || DEFAULT_THEME).toLowerCase();
  return THEMES[k] ? k : DEFAULT_THEME;
}

function updateThemeSelection(model) {
  const active = activeThemeKey(model);
  document.querySelectorAll('.theme-card').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.theme === active)));
  if (!state.accent) {
    const metaAccent = /^#[0-9a-f]{6}$/i.test(model?.meta?.accent || '') ? model.meta.accent : null;
    $('#accent').value = metaAccent || getTheme(active).colors.accent;
  }
}

function syncDesignControls() {
  $('#opt-numbers').checked = state.numbers;
  $('#opt-auto').checked = state.autoPhotos;
  if (state.accent) $('#accent').value = state.accent;
}

$('#accent').addEventListener('input', (e) => { state.accent = e.target.value; saveState(); scheduleRender(60); });
$('#accent-reset').addEventListener('click', () => { state.accent = ''; saveState(); render(); });
$('#opt-numbers').addEventListener('change', (e) => { state.numbers = e.target.checked; saveState(); render(); });
$('#opt-auto').addEventListener('change', (e) => { state.autoPhotos = e.target.checked; saveState(); render(); });

// ---------------------------------------------------------------- tabs ----

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + name; });
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
  state.view = b.dataset.view;
  document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#frame-wrap').classList.toggle('is-mobile', state.view === 'mobile');
  saveState();
}));

// -------------------------------------------------------------- export ----

function fileSlug() {
  const m = lastModel?.meta || {};
  return [m.title, m.issue].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'newsletter';
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function withBusy(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (err) { console.error(err); toast('Export failed — ' + (err.message || err)); } finally { btn.disabled = false; }
}

$('#btn-html').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  const model = buildModel();
  const dataUrls = new Map();
  for (const [k, p] of photos) dataUrls.set(k, await Photos.blobToDataURL(p.blob));
  const html = renderNewsletter(model, renderOpts((src) => (/^(https?:|data:)/.test(src) ? src : dataUrls.get(norm(src)) || null)));
  download(new Blob([html], { type: 'text/html' }), fileSlug() + '.html');
  toast('HTML downloaded');
}));

$('#btn-print').addEventListener('click', () => {
  const win = frame.contentWindow;
  if (!win) return;
  toast('Choose “Save as PDF” in the print dialog');
  win.focus();
  win.print();
});

$('#btn-png').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  toast('Rendering image…');
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!win.htmlToImage) {
    await new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = HTML_TO_IMAGE;
      s.onload = resolve;
      s.onerror = () => reject(new Error('could not load the image library'));
      doc.head.append(s);
    });
  }
  await doc.fonts.ready;
  const node = doc.querySelector('.nl');
  const bg = getComputedStyle(doc.body).getPropertyValue('--paper').trim() || '#fff';
  const url = await win.htmlToImage.toPng(node, { pixelRatio: 2, backgroundColor: bg, style: { margin: '0', boxShadow: 'none', borderRadius: '0' } });
  const blob = await (await fetch(url)).blob();
  download(blob, fileSlug() + '.png');
  toast('PNG downloaded');
}));

// -------------------------------------------------------------- toast ----

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// --------------------------------------------------------------- boot ----

async function boot() {
  const had = loadState();
  buildThemeGrid();
  syncDesignControls();
  document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === state.view)));
  $('#frame-wrap').classList.toggle('is-mobile', state.view === 'mobile');
  await loadSavedPhotos();
  if (had && state.text.trim()) {
    source.value = state.text;
    render();
  } else {
    await loadSample({ ask: false });
  }
}

boot();
