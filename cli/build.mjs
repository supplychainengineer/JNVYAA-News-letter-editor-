#!/usr/bin/env node
// Builds newsletters from folders of content + photos.
//
//   node cli/build.mjs                         # every folder in newsletters/
//   node cli/build.mjs newsletters/2026-11     # one issue
//   node cli/build.mjs --out dist --pdf --png  # also export PDF / PNG (needs Playwright)
//   node cli/build.mjs --theme bold            # override the theme
//
// An issue folder holds one content file (content.md / .txt / .csv / .json,
// or any single file with those extensions) and its photos, either loose or in
// a photos/ subfolder. Output goes to <out>/<folder-name>/index.html.

import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse, autoPlace } from '../src/parser.js';
import { renderNewsletter } from '../src/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_EXT = ['.md', '.markdown', '.txt', '.csv', '.tsv', '.json'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'];

function parseArgs(argv) {
  const args = { dirs: [], out: path.join(ROOT, 'dist'), pdf: false, png: false, theme: null, noAuto: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = path.resolve(argv[++i]);
    else if (a === '--pdf') args.pdf = true;
    else if (a === '--png') args.png = true;
    else if (a === '--theme') args.theme = argv[++i];
    else if (a === '--no-auto-photos') args.noAuto = true;
    else if (a === '-h' || a === '--help') { console.log(readHelp()); process.exit(0); }
    else args.dirs.push(path.resolve(a));
  }
  return args;
}

function readHelp() {
  return 'Usage: node cli/build.mjs [issue-dir ...] [--out dir] [--theme name] [--pdf] [--png] [--no-auto-photos]';
}

const exists = (p) => stat(p).then(() => true, () => false);

async function listIssueDirs() {
  const base = path.join(ROOT, 'newsletters');
  if (!(await exists(base))) return [];
  const entries = await readdir(base, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !/^[._]/.test(e.name)).map((e) => path.join(base, e.name)).sort();
}

async function findContent(dir) {
  const files = (await readdir(dir)).filter((f) => CONTENT_EXT.includes(path.extname(f).toLowerCase()) && !/^readme/i.test(f));
  const preferred = files.find((f) => /^content\./i.test(f));
  return preferred || files[0] || null;
}

async function findPhotos(dir) {
  const found = [];
  for (const sub of [dir, path.join(dir, 'photos'), path.join(dir, 'images')]) {
    if (!(await exists(sub))) continue;
    for (const f of await readdir(sub)) {
      if (IMAGE_EXT.includes(path.extname(f).toLowerCase())) found.push({ name: f, file: path.join(sub, f) });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function buildIssue(dir, args) {
  const slug = path.basename(dir);
  const contentFile = await findContent(dir);
  if (!contentFile) {
    console.warn(`! ${slug}: no content file found, skipping`);
    return null;
  }
  const text = await readFile(path.join(dir, contentFile), 'utf8');
  const photos = await findPhotos(dir);
  const byName = new Map(photos.map((p) => [p.name.toLowerCase(), p]));

  const model = autoPlace(parse(text), photos.map((p) => p.name), { auto: !args.noAuto });
  const outDir = path.join(args.out, slug);
  await mkdir(path.join(outDir, 'photos'), { recursive: true });

  const html = renderNewsletter(model, {
    theme: args.theme || undefined,
    resolveImage: (src) => {
      if (/^(https?:|data:)/.test(src)) return src;
      const p = byName.get(String(src).split('/').pop().toLowerCase());
      return p ? `photos/${encodeURIComponent(p.name)}` : null;
    },
  });
  await writeFile(path.join(outDir, 'index.html'), html);
  for (const p of photos) await copyFile(p.file, path.join(outDir, 'photos', p.name));

  for (const w of model.warnings) console.warn(`! ${slug}: ${w}`);
  console.log(`✓ ${slug} → ${path.relative(process.cwd(), path.join(outDir, 'index.html'))}`);
  return { slug, meta: model.meta, outDir };
}

async function exportMedia(issues, args) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    // A global install is only visible to require() (via NODE_PATH).
    try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* not installed */ }
  }
  if (!chromium) {
    console.warn('! PDF/PNG export needs Playwright: npm i -D playwright && npx playwright install chromium');
    return;
  }
  const browser = await chromium.launch();
  try {
    for (const issue of issues) {
      const page = await browser.newPage({ viewport: { width: 860, height: 1200 }, deviceScaleFactor: 2 });
      await page.goto(pathToFileURL(path.join(issue.outDir, 'index.html')).href, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      if (args.pdf) {
        await page.emulateMedia({ media: 'print' });
        await page.pdf({ path: path.join(issue.outDir, `${issue.slug}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
        await page.emulateMedia({ media: 'screen' });
        console.log(`✓ ${issue.slug} → ${issue.slug}.pdf`);
      }
      if (args.png) {
        await page.locator('.nl').screenshot({ path: path.join(issue.outDir, `${issue.slug}.png`) });
        console.log(`✓ ${issue.slug} → ${issue.slug}.png`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function archivePage(issues) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const items = issues.map((i) => `
    <li><a href="${encodeURIComponent(i.slug)}/"><span class="t">${esc(i.meta.title || i.slug)}</span><span class="m">${esc([i.meta.issue, i.meta.date].filter(Boolean).join(' · '))}</span></a></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Newsletter archive</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f4f2ee;color:#1d1b18}main{max-width:640px;margin:0 auto;padding:48px 16px}h1{font:700 32px/1.1 Georgia,serif;margin:0 0 24px}ul{list-style:none;padding:0;margin:0}li a{display:flex;justify-content:space-between;gap:16px;padding:16px 18px;margin-bottom:10px;background:#fff;border-radius:10px;text-decoration:none;color:inherit;box-shadow:0 1px 2px rgba(0,0,0,.06)}li a:hover{box-shadow:0 4px 16px rgba(0,0,0,.1)}.t{font-weight:600}.m{color:#6b665e;font-size:14px;white-space:nowrap}p{color:#6b665e}a.back{color:#7a1f2b}</style></head>
<body><main><h1>Newsletter archive</h1><ul>${items}</ul><p><a class="back" href="../">Open the editor →</a></p></main></body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dirs = args.dirs.length ? args.dirs : await listIssueDirs();
  if (!dirs.length) {
    console.error('No issue folders found. Create newsletters/<issue>/content.md and add photos.');
    process.exit(1);
  }
  const issues = [];
  for (const d of dirs) {
    const r = await buildIssue(d, args);
    if (r) issues.push(r);
  }
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'index.html'), archivePage(issues));
  if (args.pdf || args.png) await exportMedia(issues, args);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
