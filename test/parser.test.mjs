import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, autoPlace } from '../src/parser.js';
import { renderNewsletter } from '../src/render.js';
import { THEMES } from '../src/themes.js';

const types = (m) => m.sections.map((s) => s.type);

test('front matter, hero, intro and typed sections', () => {
  const m = parse(`---
title: The Chronicle
issue: Issue 3
theme: modern
---

![Cover](cover.jpg)

Welcome note.

— The Editor

## Big story
### Cover story
![Quad](quad.jpg)
Paragraph one.

## By the numbers
612 | Alumni
₹18L | Raised

## Upcoming
Nov 22 | Meetup | Café
2026-12-06 | Webinar | Online

## Spotlight
Ana Rao | 2004 | ana.jpg | Doctor

## Words
> Some places never leave you.
— Suresh

## Cities {chart}
Bengaluru | 412
Chennai | 241

## Join {cta}
Do the thing.
[Sign up](https://example.org)
`);
  assert.equal(m.meta.title, 'The Chronicle');
  assert.equal(m.meta.theme, 'modern');
  assert.deepEqual(m.hero, { src: 'cover.jpg', caption: 'Cover' });
  assert.deepEqual(types(m), ['intro', 'story', 'stats', 'events', 'people', 'quote', 'chart', 'cta']);
  assert.equal(m.sections[0].attribution, 'The Editor');
  assert.equal(m.sections[1].kicker, 'Cover story');
  assert.deepEqual(m.sections[2].items[1], { value: '₹18L', label: 'Raised' });
  assert.equal(m.sections[3].items[0].title, 'Meetup');
  assert.equal(m.sections[4].items[0].photo, 'ana.jpg');
  assert.equal(m.sections[5].quote, 'Some places never leave you.');
  assert.equal(m.sections[6].items[0].value, 412);
  assert.deepEqual(m.sections[7].button, { label: 'Sign up', url: 'https://example.org' });
});

test('loose notes get a title, tagline and headings', () => {
  const m = parse(`Green Valley Newsletter
Fresh updates from our campus

Sports Day Results
Our annual sports day was held on 12 October with over 400 students taking part.

Dates to remember
Nov 14 | Parent-teacher meeting | School hall
Dec 20 | Winter break begins`);
  assert.equal(m.meta.title, 'Green Valley Newsletter');
  assert.equal(m.meta.tagline, 'Fresh updates from our campus');
  assert.deepEqual(types(m), ['story', 'events']);
  assert.equal(m.sections[1].heading, 'Dates to remember');
});

test('CSV with section columns', () => {
  const m = parse(`type,heading,body,image,value,label,date
title,Monthly Update,All the news,cover.jpg,,,
story,"Lab opens","The new lab, finally.",lab.jpg,,,
stat,,,,120,Members,
stat,,,,8,Events,
event,Meetup,Hall,,,,Nov 3`);
  assert.equal(m.meta.title, 'Monthly Update');
  assert.equal(m.meta.tagline, 'All the news');
  assert.equal(m.hero.src, 'cover.jpg');
  assert.deepEqual(types(m), ['story', 'stats', 'events']);
  assert.equal(m.sections[0].blocks[0].text, 'The new lab, finally.');
  assert.equal(m.sections[1].items.length, 2);
});

test('plain two-column CSV becomes a chart', () => {
  const m = parse('City,Members\nBengaluru,412\nHyderabad,298');
  assert.deepEqual(types(m), ['chart']);
  assert.equal(m.sections[0].items.length, 2);
});

test('JSON input', () => {
  const m = parse(JSON.stringify({
    title: 'JSON News',
    sections: [
      { heading: 'Hello', body: 'First.\n\nSecond.' },
      { type: 'stats', items: [{ value: '5', label: 'Things' }] },
    ],
  }));
  assert.equal(m.meta.title, 'JSON News');
  assert.deepEqual(types(m), ['story', 'stats']);
  assert.equal(m.sections[0].blocks.length, 2);
});

test('autoPlace fills hero, stories, then a gallery and flags missing photos', () => {
  const m = autoPlace(parse('# T\n\n## A\nText.\n\n## B\n![x](missing.jpg)\nText.'), ['one.jpg', 'two.jpg', 'three.jpg']);
  assert.equal(m.hero.src, 'one.jpg');
  assert.equal(m.sections[0].images[0].src, 'two.jpg');
  assert.equal(m.sections.at(-1).type, 'gallery');
  assert.equal(m.sections.at(-1).images[0].src, 'three.jpg');
  assert.match(m.warnings[0], /missing\.jpg/);
});

test('renderer escapes HTML and neutralises javascript: links', () => {
  const html = renderNewsletter(parse('# <script>x</script>\n\n## S\nHi [a](javascript:alert(1)) <img src=x onerror=1>'));
  assert.ok(!html.includes('<script>x'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<img src=x'));
});

test('sample renders in every theme', async () => {
  const text = await readFile(new URL('../newsletters/sample/content.md', import.meta.url), 'utf8');
  const model = parse(text);
  for (const theme of Object.keys(THEMES)) {
    const html = renderNewsletter(model, { theme });
    assert.ok(html.includes(`class="t-${theme}`), theme);
    assert.ok(html.includes('The Alumni Chronicle'));
  }
});
