// Turns raw input (newsletter markdown, loose notes, CSV or JSON) into a
// newsletter model. No DOM access, so it runs in the browser and in Node.
//
// Model shape:
//   { meta: {title, org, issue, date, tagline, theme, accent, footer, website, email, address, numbers},
//     hero: {src, caption} | null,
//     sections: [{ type, heading, kicker, blocks, images, rows, quote, attribution, button }],
//     warnings: [] }

export const SECTION_TYPES = ['story', 'stats', 'events', 'quote', 'gallery', 'chart', 'table', 'people', 'cta'];

const META_ALIASES = {
  title: 'title', name: 'title', newsletter: 'title',
  org: 'org', organisation: 'org', organization: 'org', publisher: 'org', from: 'org',
  issue: 'issue', edition: 'issue', volume: 'issue',
  date: 'date', month: 'date',
  tagline: 'tagline', subtitle: 'tagline',
  theme: 'theme', accent: 'accent', color: 'accent', colour: 'accent',
  footer: 'footer', website: 'website', web: 'website', url: 'website',
  email: 'email', address: 'address', numbers: 'numbers',
  hero: 'hero', cover: 'hero',
};

const TYPE_ALIASES = {
  story: 'story', article: 'story', text: 'story', news: 'story',
  stats: 'stats', stat: 'stats', numbers: 'stats', kpi: 'stats', kpis: 'stats', metrics: 'stats',
  events: 'events', event: 'events', calendar: 'events', dates: 'events', schedule: 'events',
  quote: 'quote', testimonial: 'quote',
  gallery: 'gallery', photos: 'gallery', pictures: 'gallery',
  chart: 'chart', bars: 'chart', graph: 'chart',
  table: 'table', data: 'table',
  people: 'people', spotlight: 'people', team: 'people', profiles: 'people', members: 'people',
  cta: 'cta', action: 'cta', button: 'cta', callout: 'cta',
};

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE_RE = new RegExp(
  `^(\\d{1,2}(st|nd|rd|th)?[\\s\\-/.]*(${MONTHS})[a-z]*|(${MONTHS})[a-z]*\\.?\\s*\\d{1,2}(st|nd|rd|th)?|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.-]\\d{1,2}([/.-]\\d{2,4})?|(mon|tue|wed|thu|fri|sat|sun)[a-z]*|today|tomorrow|tba|tbd|soon)`,
  'i');
const STAT_RE = /^[~≈+<>]?\s?[₹$€£¥]?\s?\d[\d,.]*\s?(%|\+|k|m|b|l|lakh|lakhs|cr|crore|x|×|hrs?|km|kg)?\+?$/i;
const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp)(\?.*)?$/i;
const IMAGE_LINE = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\s*$/;
const LINK_LINE = /^\[([^\]]+)\]\(\s*([^)\s]+)\s*\)$/;

export const isImageRef = (s) => IMAGE_RE.test(String(s).trim()) || /^data:image\//.test(String(s).trim());
export const isDateLike = (s) => DATE_RE.test(String(s).trim());
export const isStatValue = (s) => STAT_RE.test(String(s).trim());
const isNumberish = (s) => /^-?[\d,.]+\s*%?$/.test(String(s).trim()) && !Number.isNaN(toNumber(s));
export const toNumber = (s) => parseFloat(String(s).replace(/[^\d.-]/g, ''));

export function emptyModel() {
  return { meta: {}, hero: null, sections: [], warnings: [] };
}

export function parse(input) {
  const text = String(input ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const trimmed = text.trim();
  if (!trimmed) return emptyModel();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return fromText(jsonToMarkup(JSON.parse(trimmed))); } catch { /* not JSON, fall through */ }
  }
  if (looksLikeCSV(trimmed)) return fromText(csvToMarkup(trimmed));
  return fromText(text);
}

// ---------------------------------------------------------------- text ----

function fromText(text) {
  const model = emptyModel();
  let lines = text.split('\n');

  // Front matter: --- key: value ---
  let start = lines.findIndex((l) => l.trim() !== '');
  let hadFrontMatter = false;
  if (start >= 0 && lines[start].trim() === '---') {
    const end = lines.findIndex((l, i) => i > start && l.trim() === '---');
    if (end > 0) {
      for (const l of lines.slice(start + 1, end)) setMeta(model.meta, l);
      lines = lines.slice(end + 1);
      hadFrontMatter = true;
    }
  }
  // Leading "Key: value" lines with known keys (e.g. "Issue: 12").
  while (lines.length && (lines[0].trim() === '' || isMetaLine(lines[0]))) {
    if (lines[0].trim()) setMeta(model.meta, lines[0]);
    lines.shift();
  }

  const structured = hadFrontMatter || lines.some((l) => /^#{1,2}\s+\S/.test(l));
  if (!structured) lines = autoStructure(lines, model.meta);

  // Split into the intro (before the first ##) and sections.
  const chunks = [{ heading: null, tag: null, lines: [] }];
  let sawTitle = false;
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    if (h1 && !sawTitle && chunks.length === 1) {
      if (!model.meta.title) model.meta.title = h1[1].trim();
      sawTitle = true;
      continue;
    }
    if (h2 || h1) {
      const { heading, tag } = splitTag((h2 || h1)[1]);
      chunks.push({ heading, tag, lines: [] });
      continue;
    }
    chunks[chunks.length - 1].lines.push(line);
  }

  // Intro: a leading "> line" is the tagline, a leading image is the hero.
  const intro = chunks[0];
  const introLines = intro.lines.slice();
  while (introLines.length && !introLines[0].trim()) introLines.shift();
  if (!model.meta.tagline && introLines[0] && /^>\s?/.test(introLines[0].trim())) {
    model.meta.tagline = introLines.shift().trim().replace(/^>\s?/, '');
  }
  const introSection = buildSection(null, null, introLines);
  if (introSection.images.length) {
    const [first, ...rest] = introSection.images;
    model.hero = first;
    introSection.images = rest;
  }
  if (model.meta.hero && !model.hero) model.hero = { src: model.meta.hero, caption: '' };
  if (hasContent(introSection)) {
    introSection.type = 'intro';
    model.sections.push(introSection);
  }

  for (const c of chunks.slice(1)) {
    const s = buildSection(c.heading, c.tag, c.lines);
    if (hasContent(s) || s.heading) model.sections.push(s);
  }
  return model;
}

function isMetaLine(line) {
  const m = line.match(/^\s*([A-Za-z][\w ]{0,20}?)\s*:\s*(.+)$/);
  return !!(m && META_ALIASES[m[1].toLowerCase().trim()]) && !/^\s*(https?|mailto):/i.test(line);
}

function setMeta(meta, line) {
  const m = line.match(/^\s*([A-Za-z][\w ]*?)\s*:\s*(.*)$/);
  if (!m) return;
  const key = META_ALIASES[m[1].toLowerCase().trim()] || m[1].toLowerCase().trim();
  let value = m[2].trim().replace(/^["']|["']$/g, '');
  if (key === 'numbers') value = !/^(no|false|off|0)$/i.test(value);
  meta[key] = value;
}

function splitTag(raw) {
  const m = raw.match(/^(.*?)\s*[{[]\s*([a-z]+)\s*[}\]]\s*$/i);
  if (m && TYPE_ALIASES[m[2].toLowerCase()]) return { heading: m[1].trim(), tag: TYPE_ALIASES[m[2].toLowerCase()] };
  return { heading: raw.trim(), tag: null };
}

const hasContent = (s) =>
  s.blocks.length || s.images.length || s.rows.length || s.quote || s.button;

// Loose notes with no markup: guess the title and headings.
function autoStructure(lines, meta) {
  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim()) cur.push(l.trim());
    else if (cur.length) { blocks.push(cur); cur = []; }
  }
  if (cur.length) blocks.push(cur);
  if (!blocks.length) return [];

  const out = [];
  const first = blocks[0];
  if (!meta.title && headingish(first[0])) {
    out.push('# ' + first.shift().replace(/:$/, ''));
    if (first.length && !meta.tagline && first[0].length < 140 && first.length === 1) {
      out.push('> ' + first.shift());
    }
    if (!first.length) blocks.shift();
  }
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    if (b.length === 1 && headingish(b[0]) && next && !headingish(next[0])) {
      out.push('## ' + b[0].replace(/:$/, ''));
    } else if (b.length > 1 && headingish(b[0]) && (b.slice(1).every(isSpecialLine) || (!isSpecialLine(b[1]) && b[1].length > 60))) {
      out.push('## ' + b[0].replace(/:$/, ''), ...b.slice(1));
    } else {
      out.push(...b);
    }
    out.push('');
  });
  return out;
}

const isSpecialLine = (l) => /^([-*•>|]|!\[)/.test(l) || l.includes('|');

function headingish(line) {
  if (!line || isSpecialLine(line)) return false;
  const t = line.trim();
  if (t.length > 72 || t.split(/\s+/).length > 11) return false;
  if (/[.,;!?]$/.test(t) && !/[A-Z]\.$/.test(t)) return false;
  return true;
}

// ------------------------------------------------------------- sections ---

function buildSection(heading, tag, lines) {
  const s = {
    type: tag, heading, kicker: null, blocks: [], images: [], rows: [],
    quote: '', attribution: '', button: null,
  };
  let para = [];
  const flush = () => {
    if (para.length) s.blocks.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m;
    if ((m = line.match(/^###+\s+(.+)$/))) {
      flush();
      if (!s.blocks.length && !s.kicker && !s.images.length) s.kicker = m[1].trim();
      else s.blocks.push({ kind: 'h', text: m[1].trim() });
    } else if ((m = line.match(IMAGE_LINE))) {
      flush();
      s.images.push({ src: m[2], caption: m[1].trim() });
    } else if ((m = line.match(/^[-*•]\s+(.+)$/))) {
      flush();
      const last = s.blocks[s.blocks.length - 1];
      if (last && last.kind === 'ul') last.items.push(m[1].trim());
      else s.blocks.push({ kind: 'ul', items: [m[1].trim()] });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      s.quote = (s.quote ? s.quote + ' ' : '') + m[1].trim();
    } else if ((m = line.match(/^(?:—|–|--|~)\s*(.+)$/))) {
      flush();
      s.attribution = m[1].trim();
    } else if ((m = line.match(LINK_LINE))) {
      flush();
      s.button = { label: m[1].trim(), url: m[2].trim() };
    } else if (line.includes('|') && !/^\|?\s*:?-{2,}/.test(line)) {
      flush();
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (cells.some(Boolean)) s.rows.push(cells);
    } else if (/^\|?\s*:?-{2,}/.test(line)) {
      // markdown table separator row
    } else {
      para.push(line);
    }
  }
  flush();
  if (!s.type) s.type = inferType(s);
  normalizeItems(s);
  return s;
}

function inferType(s) {
  const textBlocks = s.blocks.length;
  if (s.images.length >= 2 && !textBlocks && !s.rows.length) return 'gallery';
  if (s.quote && textBlocks <= 1 && !s.rows.length) return 'quote';
  if (s.rows.length && textBlocks <= 1) {
    const rows = s.rows;
    const two = rows.every((r) => r.length === 2);
    if (rows.every((r) => r.some(isImageRef))) return 'people';
    if (rows.every((r) => isDateLike(r[0]))) return 'events';
    if (two && rows.every((r) => isStatValue(r[0])) && rows.length <= 8) return 'stats';
    if (two && rows.every((r) => isNumberish(r[1]))) return rows.length <= 4 ? 'stats' : 'chart';
    return 'table';
  }
  if (s.button && textBlocks <= 2 && !s.images.length) return 'cta';
  return 'story';
}

// Turns raw rows into typed items for the structured section types.
function normalizeItems(s) {
  const rows = s.rows;
  if (s.type === 'stats') {
    s.items = rows.map((r) => {
      const vi = r.findIndex(isStatValue);
      const i = vi >= 0 ? vi : 0;
      return { value: r[i], label: r.filter((_, j) => j !== i).join(' · ') };
    });
    // "- 1,240 members" bullets also work as stats
    if (!s.items.length) {
      for (const b of s.blocks.filter((b) => b.kind === 'ul')) {
        for (const it of b.items) {
          const m = it.match(/^(\S+)\s+(.+)$/);
          if (m && isStatValue(m[1])) s.items.push({ value: m[1], label: m[2] });
        }
      }
      if (s.items.length) s.blocks = s.blocks.filter((b) => b.kind !== 'ul');
    }
  } else if (s.type === 'events') {
    s.items = rows.map((r) => ({ date: r[0] || '', title: r[1] || '', details: r.slice(2).filter(Boolean).join(' · ') }));
  } else if (s.type === 'chart') {
    s.items = rows
      .map((r) => {
        const vi = r.length > 1 && isNumberish(r[1]) ? 1 : r.findIndex(isNumberish);
        return { label: r.filter((_, j) => j !== vi).join(' '), display: r[vi] ?? '', value: toNumber(r[vi] ?? '') };
      })
      .filter((it) => !Number.isNaN(it.value));
  } else if (s.type === 'people') {
    s.items = rows.map((r) => {
      const img = r.find(isImageRef) || '';
      const rest = r.filter((c) => c !== img);
      return { name: rest[0] || '', role: rest[1] || '', blurb: rest.slice(2).join(' '), photo: img };
    });
  } else if (s.type === 'table') {
    s.items = rows;
  } else if (s.type === 'quote' && !s.quote) {
    const p = s.blocks.find((b) => b.kind === 'p');
    if (p) { s.quote = p.text; s.blocks = s.blocks.filter((b) => b !== p); }
  } else if (s.type === 'gallery' && s.images.length === 0 && rows.length) {
    s.images = rows.filter((r) => isImageRef(r[0])).map((r) => ({ src: r[0], caption: r[1] || '' }));
  }
}

// ------------------------------------------------------------ CSV/JSON ----

function looksLikeCSV(t) {
  const lines = t.split('\n').filter((l) => l.trim());
  if (lines.length < 2 || /^(#|---)/.test(lines[0])) return false;
  const count = (l) => splitCSVLine(l).length;
  const n = count(lines[0]);
  if (n < 2) return false;
  const sample = lines.slice(1, 6);
  return sample.filter((l) => count(l) === n).length >= Math.ceil(sample.length * 0.6);
}

function splitCSVLine(line, sep = line.includes('\t') && !line.includes(',') ? '\t' : ',') {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCSV(t) {
  // Handles quoted fields containing newlines.
  const rows = [];
  let buf = '';
  for (const line of t.split('\n')) {
    buf = buf ? buf + '\n' + line : line;
    if ((buf.match(/"/g) || []).length % 2 === 0) {
      if (buf.trim()) rows.push(splitCSVLine(buf));
      buf = '';
    }
  }
  if (buf.trim()) rows.push(splitCSVLine(buf));
  return rows;
}

const pipe = (cells) => cells.map((c) => String(c ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ');

function csvToMarkup(t) {
  const [header, ...rows] = parseCSV(t);
  const h = header.map((c) => c.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names) => h.findIndex((c) => names.includes(c));
  const ci = {
    type: col('type', 'kind', 'block', 'sectiontype'),
    heading: col('heading', 'headline', 'title', 'section', 'name'),
    body: col('body', 'text', 'content', 'description', 'story', 'details', 'summary'),
    image: col('image', 'photo', 'picture', 'img', 'imagefile', 'photofile'),
    caption: col('caption', 'alt'),
    value: col('value', 'number', 'count', 'amount', 'total'),
    label: col('label', 'metric'),
    date: col('date', 'when'),
    role: col('role', 'position', 'batch', 'subtitle'),
    link: col('link', 'url', 'button'),
  };
  const known = ci.type >= 0 || (ci.heading >= 0 && (ci.body >= 0 || ci.image >= 0));

  if (!known) {
    // Plain data table: two columns of label/number become a chart.
    const numeric = header.length === 2 && rows.every((r) => isNumberish(r[1]));
    return [`## ${header.join(' & ')} {${numeric ? 'chart' : 'table'}}`, ...(numeric ? [] : [pipe(header)]), ...rows.map(pipe)].join('\n');
  }

  const get = (r, k) => (ci[k] >= 0 ? (r[ci[k]] || '').trim() : '');
  const out = [];
  let group = null;
  for (const r of rows) {
    const type = TYPE_ALIASES[get(r, 'type').toLowerCase()] || (/^(title|meta|masthead|cover|header)$/i.test(get(r, 'type')) ? 'meta' : '');
    if (type === 'meta') {
      out.unshift(...[get(r, 'heading') && `# ${get(r, 'heading')}`, get(r, 'body') && `> ${get(r, 'body')}`, get(r, 'image') && `![${get(r, 'caption')}](${get(r, 'image')})`].filter(Boolean));
      group = null;
      continue;
    }
    if (['stats', 'events', 'people', 'chart', 'gallery', 'table'].includes(type)) {
      // Consecutive rows of the same list type collapse into one section.
      if (!group || group.type !== type) {
        group = { type };
        out.push('', `## ${get(r, 'heading') && type !== 'people' && type !== 'events' ? get(r, 'heading') : defaultHeading(type)} {${type}}`);
      }
      if (type === 'stats') out.push(pipe([get(r, 'value') || get(r, 'heading'), get(r, 'label') || get(r, 'body')]));
      else if (type === 'chart') out.push(pipe([get(r, 'label') || get(r, 'heading'), get(r, 'value')]));
      else if (type === 'events') out.push(pipe([get(r, 'date'), get(r, 'heading'), get(r, 'body')]));
      else if (type === 'people') out.push(pipe([get(r, 'heading'), get(r, 'role'), get(r, 'image') || 'none.jpg', get(r, 'body')]));
      else if (type === 'gallery') out.push(`![${get(r, 'caption') || get(r, 'heading')}](${get(r, 'image')})`);
      else out.push(pipe(r));
      continue;
    }
    group = null;
    out.push('', `## ${get(r, 'heading') || 'Untitled'}${type ? ` {${type}}` : ''}`);
    if (get(r, 'image')) out.push(`![${get(r, 'caption')}](${get(r, 'image')})`);
    if (type === 'quote') out.push(`> ${get(r, 'body')}`, get(r, 'role') ? `— ${get(r, 'role')}` : '');
    else out.push(...get(r, 'body').split(/\n\s*\n|\\n/).map((p) => p.trim() + '\n'));
    if (get(r, 'link')) out.push(`[${get(r, 'label') || 'Learn more'}](${get(r, 'link')})`);
  }
  return out.join('\n');
}

const defaultHeading = (type) => ({
  stats: 'By the numbers', events: 'Upcoming events', people: 'Spotlight',
  chart: 'The data', gallery: 'In pictures', table: 'At a glance',
}[type] || 'Section');

function jsonToMarkup(data) {
  const doc = Array.isArray(data) ? { sections: data } : data;
  const meta = { ...(doc.meta || {}) };
  for (const k of Object.keys(META_ALIASES)) if (typeof doc[k] === 'string' && !meta[k]) meta[k] = doc[k];
  const out = ['---', ...Object.entries(meta).map(([k, v]) => `${k}: ${v}`), '---'];
  const hero = doc.hero || meta.hero;
  if (hero) out.push(typeof hero === 'string' ? `![](${hero})` : `![${hero.caption || ''}](${hero.src || hero.image})`);
  if (doc.intro) out.push('', doc.intro);
  for (const s of doc.sections || []) {
    const type = TYPE_ALIASES[String(s.type || '').toLowerCase()];
    out.push('', `## ${s.heading || s.title || defaultHeading(type)}${type ? ` {${type}}` : ''}`);
    if (s.kicker) out.push(`### ${s.kicker}`);
    for (const img of [].concat(s.image || s.images || [])) {
      out.push(typeof img === 'string' ? `![](${img})` : `![${img.caption || ''}](${img.src || img.image})`);
    }
    const body = Array.isArray(s.body) ? s.body : String(s.body || s.text || '').split(/\n\s*\n/);
    for (const p of body) if (p.trim()) out.push(p.trim(), '');
    for (const b of s.bullets || []) out.push(`- ${b}`);
    if (s.quote) out.push(`> ${s.quote}`);
    if (s.attribution || s.author) out.push(`— ${s.attribution || s.author}`);
    for (const it of s.items || []) {
      if (Array.isArray(it)) out.push(pipe(it));
      else if (type === 'stats') out.push(pipe([it.value, it.label]));
      else if (type === 'events') out.push(pipe([it.date, it.title, it.details || it.location || '']));
      else if (type === 'people') out.push(pipe([it.name, it.role || '', it.photo || it.image || 'none.jpg', it.blurb || '']));
      else if (type === 'chart') out.push(pipe([it.label, it.value]));
      else out.push(pipe(Object.values(it)));
    }
    if (s.button || s.link) {
      const b = s.button || { label: 'Learn more', url: s.link };
      out.push(`[${b.label}](${b.url})`);
    }
  }
  return out.join('\n');
}

// ------------------------------------------------------------- photos -----

// Fills empty slots with uploaded photos that the text never mentions:
// first the hero, then stories without a picture, the rest go to a gallery.
export function autoPlace(model, photoNames = [], { auto = true } = {}) {
  const m = structuredClone(model);
  const norm = (s) => String(s).split('/').pop().toLowerCase();
  const available = new Map(photoNames.map((n) => [norm(n), n]));
  const used = new Set();
  const mark = (src) => { if (src) used.add(norm(src)); };
  mark(m.hero && m.hero.src);
  for (const s of m.sections) {
    s.images.forEach((i) => mark(i.src));
    (s.items || []).forEach((it) => mark(it && it.photo));
  }

  const check = (src) => {
    if (!src || /^(https?:|data:)/.test(src) || src === 'none.jpg') return;
    if (!available.has(norm(src))) m.warnings.push(`Photo "${src}" is referenced but hasn't been added.`);
  };
  check(m.hero && m.hero.src);
  for (const s of m.sections) {
    s.images.forEach((i) => check(i.src));
    (s.items || []).forEach((it) => it && check(it.photo));
  }

  if (!auto) return m;
  const spare = photoNames.filter((n) => !used.has(norm(n)));
  if (!m.hero && spare.length) m.hero = { src: spare.shift(), caption: '' };
  for (const s of m.sections) {
    if (!spare.length) break;
    if (s.type === 'story' && !s.images.length) s.images.push({ src: spare.shift(), caption: '' });
  }
  if (spare.length) {
    const gallery = m.sections.find((s) => s.type === 'gallery');
    const imgs = spare.map((src) => ({ src, caption: '' }));
    if (gallery) gallery.images.push(...imgs);
    else {
      const g = { type: 'gallery', heading: 'In pictures', kicker: null, blocks: [], images: imgs, rows: [], quote: '', attribution: '', button: null };
      const cta = m.sections.findIndex((s) => s.type === 'cta');
      m.sections.splice(cta >= 0 ? cta : m.sections.length, 0, g);
    }
  }
  return m;
}
