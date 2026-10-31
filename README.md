# Newsletter Studio

Turn raw notes, spreadsheets and photos into designed newsletters, then export them as HTML, PDF or PNG. It's a static site, so it runs free on GitHub Pages with no server or accounts.

## Two ways to use it

### 1. The editor (in the browser)

Open the GitHub Pages site (or run it locally, see below):

1. **Content tab:** paste anything: loose notes, newsletter markdown, a CSV export or JSON. The preview updates as you type.
2. **Photos tab:** drag photos in. Large photos are resized, and they stay in your browser between visits.
3. **Design tab:** pick one of six themes, change the accent colour and toggle the options.
4. **Export:** use **Download HTML** for a single file with the photos embedded, **PDF** for the print dialog (choose "Save as PDF"), or **PNG** for a high-resolution image.

Any photo you upload but don't mention gets placed for you: the cover first, then stories that have no picture, and the rest go in a gallery.

### 2. Push a folder and let GitHub build it

```
newsletters/
  2026-12/
    content.md        # or content.csv / content.json / content.txt
    photos/
      cover.jpg
      team.jpg
```

Push to `main`. The workflow in `.github/workflows/pages.yml` runs the tests, then builds every issue into `issues/<folder>/` with `index.html`, `<folder>.pdf` and `<folder>.png`. It also builds an archive page at `issues/` and publishes the editor at the site root. To start a new issue, copy `newsletters/_template/`.

**One-time setup:** in the repo, open Settings → Pages → Source and select **GitHub Actions**.

## Input format

Loose notes work without any markup. The first short line becomes the title, short lines become headings, and paragraphs become stories. For more control, use this:

```markdown
---
title: The Alumni Chronicle
org: Riverside Alumni Association
issue: Issue 14
date: November 2026
tagline: Stories from our community
theme: heritage            # heritage | editorial | modern | fresh | bold | minimal
accent: "#7a1f2b"          # optional
website: example.org
footer: Forward this to a batchmate.
---

![Cover caption](cover.jpg)

Opening note from the editor.
— Editor's name

## Story headline
### Kicker label
![Caption](photo.jpg)
Paragraphs with **bold**, *italic* and [links](https://example.org).
- bullets

## By the numbers
612 | Alumni at the reunion
₹18L | Raised

## Upcoming events
Nov 22 | Chapter meetup | Bengaluru, 5 PM

## Spotlight
Name | Role | photo.jpg | One-line bio

## In their words
> The quote.
— Who said it

## Members by city {chart}
Bengaluru | 412

## Get involved {cta}
A short pitch.
[Button label](https://example.org)
```

The section type is worked out from the rows:

| Rows look like | Section type |
|---|---|
| `date \| title \| details` | events |
| `number \| label` | stats |
| `label \| number` (5+ rows) | bar chart |
| a row containing `photo.jpg` | people spotlight |
| only images | gallery |
| `> quote` | quote |
| anything else with pipes | table |

To force a type, add `{stats}`, `{events}`, `{quote}`, `{people}`, `{chart}`, `{table}`, `{gallery}` or `{cta}` after the heading.

**CSV:** you can use columns like `type, heading, body, image, caption, date, value, label, role, link`. A `type` of `title` sets the masthead, and consecutive `stat` or `event` rows are grouped into one section. A plain two-column sheet (`City,Members`) becomes a chart.

**JSON:** use `{ "title": "…", "sections": [{ "heading": "…", "type": "stats", "body": "…", "items": [...] }] }`.

## Run locally

```bash
npm start                 # editor at http://localhost:8080
npm run build             # build every folder in newsletters/ into dist/
npm run build:all         # also PDF + PNG (needs: npm i -D playwright && npx playwright install chromium)
npm test
```

There are no runtime dependencies. The editor uses native ES modules, so serve it over HTTP. Opening `index.html` with `file://` won't work.

## Project layout

| Path | What it does |
|---|---|
| `src/parser.js` | Turns raw text, CSV or JSON into the newsletter model, and places photos automatically |
| `src/render.js` | Turns the model into standalone HTML (the layout logic and all newsletter CSS) |
| `src/themes.js` | Theme fonts, palettes and masthead styles. Add a theme here |
| `src/app.js`, `src/photos.js`, `assets/` | The browser editor |
| `cli/build.mjs` | Batch builder used by GitHub Actions |
| `newsletters/` | One folder per issue |

The parser and renderer are pure functions, so the editor and the CLI produce identical output.

## Notes

- Fonts come from Google Fonts. PNG export uses a vendored copy of [html-to-image](https://github.com/bubkoo/html-to-image) (MIT).
- The sample photos are placeholder illustrations. Replace them with real ones.
- The HTML export works well for web and sharing. For email platforms such as Mailchimp, paste it in as custom HTML. Some email clients ignore web fonts and fall back to system fonts.
