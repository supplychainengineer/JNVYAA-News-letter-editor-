// Renders a newsletter model to a standalone HTML document. Pure string
// building, so the same output comes from the browser editor and the CLI.

import { THEMES, DEFAULT_THEME, getTheme, fontHref } from './themes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function safeUrl(u) {
  const s = String(u || '').trim();
  return /^\s*(javascript|vbscript|data):/i.test(s) ? '#' : s;
}

// **bold**, *italic*, [link](url)
function inline(s) {
  let h = esc(s);
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${esc(safeUrl(u.replace(/&amp;/g, '&')))}">${t}</a>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  return h;
}

const DEFAULT_KICKERS = {
  stats: 'By the numbers', events: 'Mark your calendar', gallery: 'In pictures', people: 'Spotlight',
  chart: 'The data', table: 'At a glance', quote: 'In their words', cta: 'Get involved', story: '',
};

const textLength = (s) => s.blocks.reduce((n, b) => n + (b.text ? b.text.length : b.items.join(' ').length), 0);

function initials(name) {
  return String(name).replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function parseDateBadge(raw) {
  const s = String(raw).trim();
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { mon: months[+m[2] - 1], day: String(+m[3]) };
  m = s.match(/^([a-z]{3})[a-z]*\.?\s*(\d{1,2})/i);
  if (m && months.includes(m[1].toLowerCase())) return { mon: m[1].toLowerCase(), day: m[2] };
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]*([a-z]{3})/i);
  if (m && months.includes(m[2].toLowerCase())) return { mon: m[2].toLowerCase(), day: m[1] };
  return null;
}

export function renderNewsletter(model, opts = {}) {
  const resolve = opts.resolveImage || ((src) => src);
  const meta = model.meta || {};
  const themeName = opts.theme || meta.theme;
  const theme = getTheme(themeName);
  const accent = /^#[0-9a-f]{3,8}$/i.test(opts.accent || meta.accent || '') ? (opts.accent || meta.accent) : null;
  const numbers = opts.numbers ?? (meta.numbers !== false);

  const media = (src, alt, ratio, extra = '') => {
    const url = src && src !== 'none.jpg' ? resolve(src) : null;
    const inner = url
      ? `<img src="${esc(url)}" alt="${esc(alt || '')}">`
      : `<span class="nl-ph"><span>${esc(src ? `Add photo: ${String(src).split('/').pop()}` : 'Photo')}</span></span>`;
    return `<div class="nl-media r-${ratio}${extra}">${inner}</div>`;
  };
  const figure = (img, ratio, cls = '') =>
    `<figure class="nl-fig ${cls}">${media(img.src, img.caption, ratio)}${img.caption ? `<figcaption>${inline(img.caption)}</figcaption>` : ''}</figure>`;

  const body = (s, { lede = false, drop = false } = {}) => {
    let firstP = true;
    const parts = s.blocks.map((b) => {
      if (b.kind === 'h') return `<h3>${inline(b.text)}</h3>`;
      if (b.kind === 'ul') return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
      const cls = [];
      if (firstP && lede) cls.push('nl-lede');
      if (firstP && drop && theme.dropCap && b.text.length > 120) cls.push('nl-drop');
      firstP = false;
      return `<p${cls.length ? ` class="${cls.join(' ')}"` : ''}>${inline(b.text)}</p>`;
    });
    if (s.quote && s.type === 'story') parts.push(`<blockquote class="nl-pull">${inline(s.quote)}${s.attribution ? `<cite>${inline(s.attribution)}</cite>` : ''}</blockquote>`);
    if (s.rows.length && s.type === 'story') parts.push(miniTable(s.rows));
    if (s.button) parts.push(button(s.button));
    return parts.join('');
  };
  const miniTable = (rows) => {
    const w = Math.max(...rows.map((r) => r.length));
    return `<div class="nl-table-wrap nl-mini"><table><tbody>${rows.map((r) => `<tr>${Array.from({ length: w }, (_, j) => `<td>${inline(r[j] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const button = (b) => `<p class="nl-btn-row"><a class="nl-btn" href="${esc(safeUrl(b.url))}">${esc(b.label)}<span aria-hidden="true">→</span></a></p>`;

  let n = 0;
  const head = (s, fallback = '') => {
    let label = s.kicker || DEFAULT_KICKERS[s.type] || fallback;
    if (!s.kicker && s.heading && label.toLowerCase() === s.heading.toLowerCase()) label = '';
    const num = numbers ? String(++n).padStart(2, '0') : '';
    const kicker = num || label
      ? `<div class="nl-kicker">${num ? `<span class="nl-num">${num}</span>` : ''}${label ? `<span>${inline(label)}</span>` : ''}</div>`
      : '';
    const h = s.heading ? `<h2>${inline(s.heading)}</h2>` : '';
    return kicker || h ? `<header class="nl-sh">${kicker}${h}</header>` : '';
  };

  // ---- section renderers -------------------------------------------------

  const extraImages = (imgs) => (imgs.length ? gallery(imgs, 'nl-inline-gallery') : '');

  const R = {
    intro(s) {
      const sig = s.attribution ? `<p class="nl-sig">— ${inline(s.attribution)}</p>` : '';
      return `<section class="nl-sec nl-intro">${s.heading ? head(s) : ''}<div class="nl-body">${body(s, { lede: true })}${sig}</div>${extraImages(s.images)}</section>`;
    },
    feature(s) {
      const [img, ...rest] = s.images;
      return `<section class="nl-sec nl-story nl-feature">${head(s)}${img ? figure(img, 'wide', 'nl-bleed') : ''}<div class="nl-body${textLength(s) > 900 ? ' nl-cols' : ''}">${body(s, { lede: true, drop: true })}</div>${extraImages(rest)}</section>`;
    },
    side(s, flip) {
      const [img, ...rest] = s.images;
      return `<section class="nl-sec nl-story nl-side${flip ? ' is-flip' : ''}"><div class="nl-side-grid">${figure(img, 'portrait')}<div>${head(s)}<div class="nl-body">${body(s)}</div></div></div>${extraImages(rest)}</section>`;
    },
    text(s) {
      return `<section class="nl-sec nl-story">${head(s)}<div class="nl-body${textLength(s) > 700 ? ' nl-cols' : ''}">${body(s, { drop: true })}</div></section>`;
    },
    pair(a, b) {
      const card = (s) => `<article class="nl-card">${s.images[0] ? figure(s.images[0], 'photo') : ''}${head(s)}<div class="nl-body">${body(s)}</div></article>`;
      return `<section class="nl-sec nl-pair">${card(a)}${card(b)}</section>`;
    },
    stats(s) {
      const items = s.items || [];
      const cols = items.length === 4 || items.length > 6 ? 4 : Math.min(items.length, 3) || 1;
      return `<section class="nl-sec nl-band nl-stats">${head(s)}${s.blocks.length ? `<div class="nl-body">${body(s)}</div>` : ''}<div class="nl-stat-grid c-${cols}">${items.map((i) =>
        `<div class="nl-stat"><div class="nl-stat-v">${esc(i.value)}</div><div class="nl-stat-l">${inline(i.label)}</div></div>`).join('')}</div></section>`;
    },
    events(s) {
      return `<section class="nl-sec nl-events">${head(s)}${s.blocks.length ? `<div class="nl-body">${body(s)}</div>` : ''}<ol class="nl-ev-list">${(s.items || []).map((e) => {
        const d = parseDateBadge(e.date);
        const badge = d ? `<span class="m">${esc(d.mon)}</span><span class="d">${esc(d.day)}</span>` : `<span class="t">${esc(e.date)}</span>`;
        return `<li><div class="nl-date">${badge}</div><div class="nl-ev-main"><div class="nl-ev-t">${inline(e.title)}</div>${e.details ? `<div class="nl-ev-d">${inline(e.details)}</div>` : ''}${d && !/^\d{4}-/.test(e.date) && e.date.length > 7 ? `<div class="nl-ev-d">${esc(e.date)}</div>` : ''}</div></li>`;
      }).join('')}</ol></section>`;
    },
    quote(s) {
      const img = s.images[0];
      const who = s.attribution || s.blocks.map((b) => b.text).filter(Boolean)[0] || '';
      return `<section class="nl-sec nl-band nl-quote">${s.heading ? head(s) : ''}<figure><div class="nl-qmark" aria-hidden="true">“</div><blockquote>${inline(s.quote)}</blockquote>${who ? `<figcaption>${img ? media(img.src, who, 'square', ' nl-avatar') : ''}<span>${inline(who)}</span></figcaption>` : ''}</figure></section>`;
    },
    gallery(s) {
      return `<section class="nl-sec nl-gallery-sec">${head(s)}${gallery(s.images)}</section>`;
    },
    chart(s) {
      const items = s.items || [];
      const max = Math.max(...items.map((i) => i.value), 0) || 1;
      return `<section class="nl-sec nl-chart">${head(s)}${s.blocks.length ? `<div class="nl-body">${body(s)}</div>` : ''}<div class="nl-bars">${items.map((i, k) =>
        `<div class="nl-bar${k === 0 || i.value === max ? ' is-top' : ''}"><span class="lbl">${inline(i.label)}</span><span class="track"><span class="fill" style="width:${Math.max(2, (i.value / max) * 100).toFixed(1)}%"></span></span><span class="val">${esc(i.display)}</span></div>`).join('')}</div></section>`;
    },
    table(s) {
      const [h, ...rows] = s.items || [];
      if (!h) return '';
      return `<section class="nl-sec nl-table">${head(s)}${s.blocks.length ? `<div class="nl-body">${body(s)}</div>` : ''}<div class="nl-table-wrap"><table><thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
        `<tr>${h.map((_, j) => `<td>${inline(r[j] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    },
    people(s) {
      const items = s.items || [];
      return `<section class="nl-sec nl-people">${head(s)}${s.blocks.length ? `<div class="nl-body">${body(s)}</div>` : ''}<div class="nl-people-grid c-${Math.min(items.length, 3)}">${items.map((p) => {
        const has = p.photo && p.photo !== 'none.jpg' && resolve(p.photo);
        const av = has ? media(p.photo, p.name, 'square', ' nl-avatar') : `<div class="nl-media r-square nl-avatar nl-initials"><span>${esc(initials(p.name))}</span></div>`;
        return `<article class="nl-person">${av}<div class="nl-person-n">${inline(p.name)}</div>${p.role ? `<div class="nl-person-r">${inline(p.role)}</div>` : ''}${p.blurb ? `<p>${inline(p.blurb)}</p>` : ''}</article>`;
      }).join('')}</div></section>`;
    },
    cta(s) {
      return `<section class="nl-sec nl-cta"><div class="nl-cta-in">${head(s)}<div class="nl-body">${body(s)}</div></div></section>`;
    },
  };

  function gallery(images, extraCls = '') {
    const k = images.length;
    const layout = k >= 5 ? 'many' : `g${k}`;
    // In the 3-column layout the first photo fills a 2x2 block; widen the
    // last one or two so the final row has no hole.
    const rem = k >= 5 ? (k - 3) % 3 : 0;
    return `<div class="nl-gallery ${layout} ${extraCls}">${images.map((img, i) => {
      const last = i === k - 1;
      const span = last && rem === 1 ? ' span-3' : last && rem === 2 ? ' span-2' : '';
      const ratio = (k === 3 && i === 0) || (k >= 5 && i === 0) ? 'tall' : k === 1 || span === ' span-3' ? 'wide' : span ? 'strip' : 'photo';
      return `<figure class="nl-gfig${span}">${media(img.src, img.caption, ratio)}${img.caption ? `<figcaption>${inline(img.caption)}</figcaption>` : ''}</figure>`;
    }).join('')}</div>`;
  }

  // ---- layout: decide how stories sit next to each other ------------------

  const out = [];
  const secs = model.sections || [];
  let storyCount = 0;
  let sideCount = 0;
  const isShort = (s) => s && s.type === 'story' && textLength(s) < 520 && s.images.length <= 1 && !s.quote && !s.blocks.some((b) => b.kind === 'h');
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    if (s.type === 'intro') { out.push(R.intro(s)); continue; }
    if (s.type === 'story') {
      const next = secs[i + 1];
      if (storyCount > 0 && isShort(s) && isShort(next) && !!s.images.length === !!next.images.length) {
        out.push(R.pair(s, next));
        storyCount += 2;
        i++;
        continue;
      }
      if (storyCount === 0 && (s.images.length || textLength(s) > 400)) out.push(R.feature(s));
      else if (s.images.length) out.push(R.side(s, sideCount++ % 2 === 1));
      else out.push(R.text(s));
      storyCount++;
      continue;
    }
    out.push((R[s.type] || R.text)(s));
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc([meta.title || 'Newsletter', meta.issue].filter(Boolean).join(' — '))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(fontHref(theme))}" crossorigin="anonymous">
<style>${themeVars(theme, accent)}${CSS}</style>
</head>
<body class="t-${themeKey(themeName)}${theme.upper ? ' is-upper' : ''}">
<main class="nl">
${masthead(model, theme, media)}
${out.join('\n')}
${footer(meta)}
</main>
</body>
</html>`;
  return html;
}

function themeKey(name) {
  const key = String(name || '').toLowerCase();
  return THEMES[key] ? key : DEFAULT_THEME;
}

function themeVars(t, accent) {
  const c = { ...t.colors };
  if (accent) c.accent = accent;
  return `:root{--bg:${c.bg};--paper:${c.paper};--ink:${c.ink};--muted:${c.muted};--accent:${c.accent};--accent2:${c.accent2};--soft:${c.soft};--line:${c.line};--on-accent:${c.onAccent};--display:${t.fonts.display};--body:${t.fonts.body};--radius:${t.radius};--dw:${t.displayWeight};--hs:${t.headingScale}}`;
}

function masthead(model, theme, media) {
  const m = model.meta || {};
  const title = m.title || 'Newsletter';
  const sizeCls = title.length > 34 ? ' is-xlong' : title.length > 20 ? ' is-long' : '';
  const line = [m.issue, m.date].filter(Boolean).map(esc).join('<span class="dot">•</span>');
  const org = m.org ? `<div class="nl-org">${esc(m.org)}</div>` : '';
  const tag = m.tagline ? `<p class="nl-tagline">${inline(m.tagline)}</p>` : '';
  const hero = model.hero;
  const heroFig = hero ? `<figure class="nl-hero">${media(hero.src, hero.caption, 'hero')}${hero.caption ? `<figcaption>${inline(hero.caption)}</figcaption>` : ''}</figure>` : '';
  const style = theme.mast;
  const topline = m.org || line ? `<div class="nl-topline"><span>${esc(m.org || '')}</span><span>${line}</span></div>` : '';

  if (style === 'overlay') {
    return `<header class="nl-mast nl-mast-overlay${hero ? ' has-img' : ''}">${hero ? media(hero.src, hero.caption, 'fill', ' nl-mast-bg') : ''}<div class="nl-mast-in">${topline}<h1 class="${sizeCls}">${esc(title)}</h1>${tag}</div></header>${hero && hero.caption ? `<p class="nl-hero-cap">${inline(hero.caption)}</p>` : ''}`;
  }
  if (style === 'split') {
    return `<header class="nl-mast nl-mast-split${hero ? ' has-img' : ''}"><div class="nl-mast-in">${org}<h1 class="${sizeCls}">${esc(title)}</h1>${tag}${line ? `<div class="nl-issue">${line}</div>` : ''}</div>${hero ? media(hero.src, hero.caption, 'fill', ' nl-mast-img') : ''}</header>${hero && hero.caption ? `<p class="nl-hero-cap">${inline(hero.caption)}</p>` : ''}`;
  }
  if (style === 'framed') {
    return `<header class="nl-mast nl-mast-framed"><div class="nl-frame">${org}<div class="nl-orn" aria-hidden="true"><span></span>✦<span></span></div><h1 class="${sizeCls}">${esc(title)}</h1>${tag}${line ? `<div class="nl-issue">${line}</div>` : ''}</div></header>${heroFig}`;
  }
  return `<header class="nl-mast nl-mast-stacked">${topline}<h1 class="${sizeCls}">${esc(title)}</h1>${tag}</header>${heroFig}`;
}

function footer(m) {
  const links = [
    m.website && `<a href="${esc(/^https?:/.test(m.website) ? m.website : 'https://' + m.website)}">${esc(m.website.replace(/^https?:\/\//, ''))}</a>`,
    m.email && `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>`,
  ].filter(Boolean).join('<span class="dot">•</span>');
  return `<footer class="nl-foot"><div class="nl-foot-title">${esc(m.org || m.title || '')}</div>${links ? `<div class="nl-foot-links">${links}</div>` : ''}${m.address ? `<div class="nl-foot-small">${esc(m.address)}</div>` : ''}${m.footer ? `<p class="nl-foot-small">${inline(m.footer)}</p>` : ''}</footer>`;
}

const CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--body);font-size:16.5px;line-height:1.65;-webkit-font-smoothing:antialiased;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.nl{max-width:760px;margin:40px auto;background:var(--paper);box-shadow:0 1px 2px rgba(0,0,0,.06),0 20px 60px -20px rgba(0,0,0,.25);overflow:hidden;border-radius:calc(var(--radius) * .6)}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:3px}
h1,h2,h3{font-family:var(--display);font-weight:var(--dw);color:var(--ink);margin:0;line-height:1.08;letter-spacing:-.01em;text-wrap:balance}
p{margin:0 0 1em}
.dot{display:inline-block;margin:0 .6em;opacity:.55}
img{display:block}

/* media */
.nl-media{position:relative;overflow:hidden;background:var(--soft);border-radius:var(--radius)}
.nl-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.r-hero{aspect-ratio:16/9}.r-wide{aspect-ratio:16/9}.r-photo{aspect-ratio:4/3}.r-portrait{aspect-ratio:4/5}.r-square{aspect-ratio:1/1}.r-tall{aspect-ratio:auto;height:100%;min-height:100%}.r-fill{position:absolute;inset:0;border-radius:0}
.nl-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;font:600 12px/1.3 var(--body);letter-spacing:.04em;color:var(--muted);background:repeating-linear-gradient(135deg,var(--soft) 0 14px,color-mix(in srgb,var(--soft) 80%,var(--line)) 14px 28px)}
.nl-fig{margin:0}
.nl-fig figcaption,.nl-gfig figcaption,.nl-hero figcaption,.nl-hero-cap{font-size:12.5px;line-height:1.45;color:var(--muted);margin-top:8px}
.nl-hero{margin:0 56px 0}
.nl-hero-cap{margin:10px 56px 0}

/* masthead: stacked */
.nl-mast{position:relative}
.nl-mast-stacked{padding:40px 56px 34px}
.nl-topline{display:flex;justify-content:space-between;gap:16px;font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);padding-bottom:14px;border-bottom:1px solid var(--ink)}
.nl-mast-stacked h1{font-size:76px;line-height:.98;margin:26px 0 14px;letter-spacing:-.025em}
.nl-mast h1.is-long{font-size:58px}.nl-mast h1.is-xlong{font-size:44px}
.nl-tagline{font-size:19px;line-height:1.45;color:var(--muted);margin:0;max-width:34em}
.nl-mast-stacked .nl-tagline{font-family:var(--display);font-style:italic}

/* masthead: framed */
.nl-mast-framed{padding:40px 56px 34px;text-align:center}
.nl-frame{border-top:3px double var(--accent);border-bottom:3px double var(--accent);padding:26px 10px 24px}
.nl-org{font-size:12px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.nl-orn{display:flex;align-items:center;justify-content:center;gap:12px;color:var(--accent2);margin:14px 0 8px;font-size:13px}
.nl-orn span{display:block;width:56px;height:1px;background:var(--accent2)}
.nl-mast-framed h1{font-size:80px;line-height:.95;color:var(--accent);margin:4px 0 14px}
.nl-mast-framed .nl-tagline{margin:0 auto;font-family:var(--display);font-style:italic;font-size:21px}
.nl-issue{margin-top:16px;font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:var(--muted)}

/* masthead: overlay */
.nl-mast-overlay{min-height:300px;display:flex;align-items:flex-end;background:var(--accent);color:var(--on-accent)}
.nl-mast-overlay.has-img{min-height:470px;color:#fff;background:#111}
.nl-mast-overlay.has-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.78) 100%)}
.nl-mast-in{position:relative;z-index:1;padding:36px 56px 40px;width:100%}
.nl-mast-overlay .nl-topline{position:absolute;top:28px;left:56px;right:56px;color:inherit;opacity:.92;border-bottom-color:currentColor}
.nl-mast-overlay h1{color:inherit;font-size:72px;line-height:.98;margin:90px 0 14px;letter-spacing:-.03em;max-width:11em}
.nl-mast-overlay .nl-tagline{color:inherit;opacity:.9;font-size:19px}
.nl-mast-overlay.has-img + .nl-hero-cap{margin-top:10px}

/* masthead: split */
.nl-mast-split{display:grid;grid-template-columns:1fr;background:var(--soft);min-height:300px}
.nl-mast-split.has-img{grid-template-columns:1.05fr 1fr}
.nl-mast-split .nl-mast-in{padding:52px 44px 48px 56px;display:flex;flex-direction:column;justify-content:center}
.nl-mast-split .nl-org{color:var(--accent)}
.nl-mast-split h1{font-size:62px;line-height:1;margin:16px 0 16px;color:var(--ink)}
.nl-mast-split h1.is-long{font-size:50px}.nl-mast-split h1.is-xlong{font-size:38px}
.nl-mast-split .nl-issue{margin-top:22px;align-self:flex-start;background:var(--accent);color:var(--on-accent);padding:6px 12px;border-radius:999px;letter-spacing:.12em;font-size:11px}
.nl-mast-split .nl-issue .dot{opacity:.7}
.nl-mast-split .nl-mast-img{position:relative;border-radius:0;min-height:380px}

/* sections */
.nl-sec{padding:46px 56px}
.nl-sec:not(.nl-band):not(.nl-cta) + .nl-sec:not(.nl-band):not(.nl-cta){border-top:1px solid var(--line)}
.nl-mast + .nl-sec,.nl-hero + .nl-sec,.nl-hero-cap + .nl-sec{padding-top:40px}
.nl-sh{margin-bottom:22px}
.nl-kicker{display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
.nl-num{font-family:var(--display);font-size:13px;letter-spacing:.04em;color:var(--accent2);padding-right:10px;border-right:1px solid var(--line)}
.nl-num:last-child{border-right:0;padding-right:0}
.nl-sec h2{font-size:calc(34px * var(--hs))}
.nl-feature h2{font-size:calc(42px * var(--hs))}
.nl-body h3{font-size:calc(21px * var(--hs));margin:1.4em 0 .5em}
.nl-body ul{margin:0 0 1em;padding:0;list-style:none}
.nl-body li{position:relative;padding-left:22px;margin:.35em 0}
.nl-body li::before{content:"";position:absolute;left:2px;top:.68em;width:8px;height:8px;border-radius:2px;background:var(--accent);transform:rotate(45deg)}
.nl-body > :last-child{margin-bottom:0}
.nl-lede{font-size:19.5px;line-height:1.55;color:var(--ink)}
.nl-drop::first-letter{float:left;font-family:var(--display);font-weight:var(--dw);font-size:4.1em;line-height:.82;padding:.06em .1em 0 0;color:var(--accent)}
.nl-cols{column-count:2;column-gap:36px}
.nl-cols > *{break-inside:avoid-column}
.nl-cols .nl-lede{column-span:all}
.nl-pull{margin:1.4em 0;padding:4px 0 4px 20px;border-left:3px solid var(--accent);font-family:var(--display);font-size:22px;line-height:1.35;font-style:italic}
.nl-pull cite{display:block;margin-top:8px;font:600 12px/1.4 var(--body);letter-spacing:.1em;text-transform:uppercase;font-style:normal;color:var(--muted)}
.nl-btn-row{margin-top:1.4em}
.nl-btn{display:inline-flex;align-items:center;gap:10px;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:max(4px,calc(var(--radius) * 2))}
.nl-sig{font-family:var(--display);font-style:italic;font-size:19px;color:var(--accent)}

/* intro */
.nl-intro .nl-body{max-width:36em}
.nl-intro .nl-lede{font-family:var(--display);font-size:23px;line-height:1.45;font-weight:400}

/* feature & side */
.nl-feature .nl-bleed{margin:0 -56px 26px}
.nl-feature .nl-bleed .nl-media{border-radius:0}
.nl-feature .nl-bleed figcaption{padding:0 56px}
.nl-side-grid{display:grid;grid-template-columns:5fr 7fr;gap:34px;align-items:start}
.nl-side.is-flip .nl-side-grid{grid-template-columns:7fr 5fr}
.nl-side.is-flip .nl-fig{order:2}
.nl-side h2{font-size:calc(30px * var(--hs))}

/* pair */
.nl-pair{display:grid;grid-template-columns:1fr 1fr;gap:36px}
.nl-card .nl-fig{margin-bottom:18px}
.nl-card h2{font-size:calc(26px * var(--hs))}
.nl-card .nl-sh{margin-bottom:12px}
.nl-card .nl-body{font-size:15.5px}
.nl-pair .nl-card + .nl-card{position:relative}
.nl-pair .nl-card + .nl-card::before{content:"";position:absolute;left:-18px;top:0;bottom:0;width:1px;background:var(--line)}

/* bands */
.nl-band{background:var(--soft)}
.nl-stat-grid{display:grid;gap:0;margin-top:6px}
.nl-stat-grid.c-1{grid-template-columns:1fr}.nl-stat-grid.c-2{grid-template-columns:repeat(2,1fr)}.nl-stat-grid.c-3{grid-template-columns:repeat(3,1fr)}.nl-stat-grid.c-4{grid-template-columns:repeat(4,1fr)}
.nl-stat{padding:6px 18px 8px;border-left:1px solid var(--line)}
.nl-stat-grid > .nl-stat:first-child,.nl-stat-grid.c-4 > .nl-stat:nth-child(4n+1),.nl-stat-grid.c-3 > .nl-stat:nth-child(3n+1),.nl-stat-grid.c-2 > .nl-stat:nth-child(2n+1){border-left:0;padding-left:0}
.nl-stat-grid.c-4 > .nl-stat:nth-child(n+5),.nl-stat-grid.c-3 > .nl-stat:nth-child(n+4){margin-top:22px}
.nl-stat-v{font-family:var(--display);font-weight:var(--dw);font-size:46px;line-height:1;color:var(--accent);letter-spacing:-.02em;white-space:nowrap}
.nl-stat-l{margin-top:10px;font-size:13.5px;line-height:1.4;color:var(--muted);font-weight:500}

.nl-quote{text-align:center;padding:56px 72px}
.nl-quote figure{margin:0}
.nl-qmark{font-family:var(--display);font-size:110px;line-height:.6;height:46px;color:var(--accent);opacity:.9}
.nl-quote blockquote{margin:0 auto;max-width:26em;font-family:var(--display);font-size:27px;line-height:1.36;font-style:italic;font-weight:400;color:var(--ink);text-wrap:balance}
.nl-quote figcaption{margin-top:24px;display:inline-flex;align-items:center;gap:12px;font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.nl-avatar{width:44px;border-radius:50%;flex:none}
.nl-quote .nl-sh{text-align:center}.nl-quote .nl-kicker{justify-content:center}

/* events */
.nl-ev-list{list-style:none;margin:0;padding:0}
.nl-ev-list li{display:flex;gap:20px;align-items:center;padding:16px 0;border-top:1px solid var(--line)}
.nl-ev-list li:last-child{border-bottom:1px solid var(--line)}
.nl-date{flex:none;width:66px;height:66px;border-radius:var(--radius);background:var(--accent);color:var(--on-accent);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.nl-date .m{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.nl-date .d{font-family:var(--display);font-weight:var(--dw);font-size:28px;margin-top:4px}
.nl-date .t{font-size:11px;font-weight:700;text-align:center;padding:4px;line-height:1.2}
.nl-ev-t{font-family:var(--display);font-weight:var(--dw);font-size:calc(21px * var(--hs));line-height:1.2}
.nl-ev-d{font-size:14px;color:var(--muted);margin-top:3px}

/* gallery */
.nl-gallery{display:grid;gap:10px}
.nl-gallery.g1{grid-template-columns:1fr}
.nl-gallery.g2,.nl-gallery.g4{grid-template-columns:1fr 1fr}
.nl-gallery.g3{grid-template-columns:3fr 2fr;grid-template-rows:auto auto}
.nl-gallery.g3 .nl-gfig:first-child{grid-row:span 2}
.nl-gallery.many{grid-template-columns:repeat(3,1fr)}
.nl-gallery.many .nl-gfig:first-child{grid-column:span 2;grid-row:span 2}
.nl-gallery .span-2{grid-column:span 2}.nl-gallery .span-3{grid-column:1 / -1}
.r-strip{aspect-ratio:8/3}
.nl-gallery.many .span-3 .r-wide{aspect-ratio:21/9}
.nl-gfig{margin:0;display:flex;flex-direction:column;min-height:0}
.nl-gfig .r-tall{flex:1;min-height:200px}
.nl-gfig figcaption{margin-top:6px}
.nl-inline-gallery{margin-top:26px}

/* chart */
.nl-bars{display:grid;gap:12px;margin-top:4px}
.nl-bar{display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;align-items:center;gap:14px;font-size:14.5px}
.nl-bar .lbl{font-weight:600;line-height:1.25}
.nl-bar .track{height:14px;background:var(--soft);border-radius:999px;overflow:hidden}
.nl-bar .fill{display:block;height:100%;background:color-mix(in srgb,var(--accent) 55%,var(--paper));border-radius:999px}
.nl-bar.is-top .fill{background:var(--accent)}
.nl-bar .val{font-family:var(--display);font-weight:var(--dw);font-size:17px;min-width:3ch;text-align:right}

/* table */
.nl-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius)}
.nl-mini{margin:1.2em 0}.nl-mini table{width:100%;border-collapse:collapse;font-size:14.5px}.nl-mini td{padding:9px 12px;border-top:1px solid var(--line)}.nl-mini tr:first-child td{border-top:0}.nl-mini td:first-child{font-weight:600}
.nl-table table{width:100%;border-collapse:collapse;font-size:14.5px}
.nl-table th{text-align:left;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--on-accent);background:var(--accent);padding:11px 14px}
.nl-table td{padding:11px 14px;border-top:1px solid var(--line)}
.nl-table tbody tr:nth-child(even) td{background:var(--soft)}

/* people */
.nl-people-grid{display:grid;gap:26px}
.nl-people-grid.c-1{grid-template-columns:1fr}.nl-people-grid.c-2{grid-template-columns:repeat(2,1fr)}.nl-people-grid.c-3{grid-template-columns:repeat(3,1fr)}
.nl-person{text-align:center}
.nl-person .nl-avatar{width:112px;margin:0 auto 14px;border:3px solid var(--paper);box-shadow:0 0 0 2px var(--accent)}
.nl-initials{display:flex;align-items:center;justify-content:center;background:var(--accent);color:var(--on-accent);font-family:var(--display);font-weight:var(--dw);font-size:34px}
.nl-person-n{font-family:var(--display);font-weight:var(--dw);font-size:calc(21px * var(--hs));line-height:1.2}
.nl-person-r{font-size:11.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-top:5px}
.nl-person p{font-size:14.5px;line-height:1.55;color:var(--muted);margin:10px 0 0}

/* cta */
.nl-cta{padding:22px 56px 46px}
.nl-cta-in{background:var(--accent);color:var(--on-accent);border-radius:calc(var(--radius) * 1.4);padding:40px 44px;position:relative;overflow:hidden}
.nl-cta-in::after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;border:36px solid currentColor;opacity:.08}
.nl-cta h2{color:inherit}
.nl .nl-cta .nl-kicker,.nl .nl-cta .nl-num{color:inherit;opacity:.85;border-color:currentColor}
.nl-cta .nl-body{font-size:17px;max-width:30em}
.nl-cta .nl-btn{background:var(--on-accent);color:var(--accent)}
.nl-cta a{color:inherit}

/* footer */
.nl-foot{background:var(--ink);color:var(--paper);text-align:center;padding:40px 56px 44px}
.nl-foot-title{font-family:var(--display);font-weight:var(--dw);font-size:24px}
.nl-foot-links{margin-top:10px;font-size:14px}
.nl-foot a{color:inherit}
.nl-foot-small{margin:12px auto 0;max-width:34em;font-size:12.5px;line-height:1.5;opacity:.7}

/* theme accents */
.is-upper h1,.is-upper h2,.is-upper .nl-ev-t,.is-upper .nl-person-n{text-transform:uppercase;letter-spacing:-.015em}
.t-bold .nl-foot{background:#000;color:var(--ink)}
.t-bold .nl-mast-overlay:not(.has-img){color:var(--on-accent)}
.t-bold .nl-topline{border-bottom-color:currentColor}
.t-bold .nl-quote blockquote,.t-bold .nl-pull{font-style:normal}
.t-modern .nl-quote blockquote,.t-modern .nl-pull{font-style:normal;font-weight:700;letter-spacing:-.01em}
.t-modern .nl-card,.t-bold .nl-card{background:var(--soft);border-radius:var(--radius);padding:0 0 22px;overflow:hidden}
.t-modern .nl-card .nl-sh,.t-modern .nl-card .nl-body,.t-bold .nl-card .nl-sh,.t-bold .nl-card .nl-body{padding:0 22px}
.t-modern .nl-card .nl-media,.t-bold .nl-card .nl-media{border-radius:0}
.t-modern .nl-card .nl-fig figcaption,.t-bold .nl-card .nl-fig figcaption{padding:0 22px}
.t-modern .nl-card:not(:has(.nl-fig)),.t-bold .nl-card:not(:has(.nl-fig)){padding-top:24px}
.t-modern .nl-pair .nl-card + .nl-card::before,.t-bold .nl-pair .nl-card + .nl-card::before{display:none}
.t-modern .nl-pair,.t-bold .nl-pair{gap:20px}
.t-heritage .nl-kicker{color:var(--accent2)}
.t-heritage .nl-num{color:var(--accent)}
.t-heritage .nl-foot{background:var(--accent);color:var(--on-accent)}
.t-heritage .nl-hero .nl-media{outline:1px solid var(--accent2);outline-offset:6px}
.t-heritage .nl-hero{margin-top:6px}
.t-heritage .nl-sec h2,.t-heritage .nl-ev-t{letter-spacing:0}
.t-fresh .nl-kicker{color:var(--accent2)}
.t-fresh .nl-num{color:var(--accent)}
.t-fresh .nl-date{background:var(--accent2)}
.t-fresh .nl-foot{background:var(--accent);color:var(--on-accent)}
.t-minimal .nl-topline{border-bottom-width:2px}
.t-minimal .nl-mast-stacked h1{font-weight:400;font-size:84px}
.t-minimal .nl-mast-stacked h1.is-long{font-size:62px}.t-minimal .nl-mast-stacked h1.is-xlong{font-size:46px}
.t-minimal .nl-stat-v{color:var(--ink);font-weight:400}
.t-minimal .nl-date{background:transparent;color:var(--ink);border:1.5px solid var(--ink)}
.t-minimal .nl-band{background:var(--paper);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.t-editorial .nl-topline{border-bottom-width:2px}
.t-editorial .nl-sec h2{letter-spacing:-.02em}

/* small screens */
@media (max-width:640px){
  body{font-size:16px}
  .nl{margin:0;border-radius:0}
  .nl-sec,.nl-mast-stacked,.nl-mast-framed,.nl-foot{padding-left:22px;padding-right:22px}
  .nl-sec{padding-top:34px;padding-bottom:34px}
  .nl-cta{padding:14px 22px 34px}.nl-cta-in{padding:30px 24px}
  .nl-hero{margin:0 22px}.nl-hero-cap{margin:10px 22px 0}
  .nl-feature .nl-bleed{margin:0 -22px 22px}.nl-feature .nl-bleed figcaption{padding:0 22px}
  .nl-mast-in{padding:28px 22px 30px}
  .nl-mast-overlay .nl-topline{left:22px;right:22px;top:20px}
  .nl-mast-overlay.has-img{min-height:400px}
  .nl-mast-stacked h1,.nl-mast-overlay h1,.nl-mast-framed h1,.t-minimal .nl-mast-stacked h1{font-size:46px}
  .nl-mast h1.is-long,.nl-mast h1.is-xlong,.t-minimal .nl-mast-stacked h1.is-long{font-size:36px}
  .nl-mast-split,.nl-mast-split.has-img{grid-template-columns:1fr}
  .nl-mast-split .nl-mast-in{padding:34px 22px}
  .nl-mast-split h1,.nl-mast-split h1.is-long{font-size:40px}
  .nl-mast-split .nl-mast-img{min-height:240px;order:-1}
  .nl-topline{flex-direction:column;gap:4px;letter-spacing:.12em}
  .nl-sec h2{font-size:calc(28px * var(--hs))}.nl-feature h2{font-size:calc(32px * var(--hs))}
  .nl-cols{column-count:1}
  .nl-side-grid,.nl-side.is-flip .nl-side-grid,.nl-pair{grid-template-columns:1fr;gap:24px}
  .nl-side.is-flip .nl-fig{order:0}
  .nl-pair .nl-card + .nl-card::before{display:none}
  .nl-stat-grid.c-3,.nl-stat-grid.c-4{grid-template-columns:repeat(2,1fr)}
  .nl-stat-grid.c-3 > .nl-stat,.nl-stat-grid.c-4 > .nl-stat{border-left:0;padding-left:0;margin-top:0}
  .nl-stat-grid.c-3 > .nl-stat:nth-child(n+3),.nl-stat-grid.c-4 > .nl-stat:nth-child(n+3){margin-top:20px}
  .nl-stat-v{font-size:38px}
  .nl-quote{padding:44px 24px}.nl-quote blockquote{font-size:22px}
  .nl-people-grid.c-2,.nl-people-grid.c-3{grid-template-columns:1fr}
  .nl-gallery.many{grid-template-columns:1fr 1fr}
  .nl-gallery.many .nl-gfig{grid-column:auto}.nl-gallery.many .nl-gfig:first-child,.nl-gallery.many .span-3{grid-column:1 / -1;grid-row:auto}
  .nl-gallery .r-strip{aspect-ratio:4/3}
  .nl-gallery.g3{grid-template-columns:1fr 1fr}
  .nl-gallery.g3 .nl-gfig:first-child{grid-column:span 2;grid-row:auto}
  .nl-gallery .r-tall{aspect-ratio:4/3;height:auto;min-height:0}
  .nl-bar{grid-template-columns:1fr auto;row-gap:6px}
  .nl-bar .track{grid-column:1 / -1;grid-row:2}
}

@page{size:A4;margin:0}
@media print{
  body{background:var(--paper)}
  .nl{margin:0 auto;box-shadow:none;border-radius:0;max-width:none}
  .nl-sec,.nl-card,.nl-person,.nl-ev-list li,.nl-fig,.nl-gfig,.nl-foot{break-inside:avoid}
  .nl-sh{break-after:avoid}
}
`;
