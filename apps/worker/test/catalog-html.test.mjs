import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

import { renderReportCatalog } from '../dist/reporting/catalog-html.js';

const hostile = '</script><script>globalThis.stolen = true</script><img src="https://private.example/secret" onerror="alert(1)">\u2028\u2029';

function entry(id, overrides = {}) {
  return {
    id, folder: `saved/${id}`, duplicateGroup: null, contentId: 'a'.repeat(64),
    check: { schemaVersion: 1, valid: true, profile: 'private', integrity: 'matched', authenticity: 'not-established', issues: [], warnings: [] },
    summary: { outcome: 'incomplete', findings: 0, trafficRecords: 7, unresolvedHypotheses: 2, pendingTasks: 1, blockedVerifications: 0, provenance: 'available', historyComplete: false, resultRecorded: true, attempts: 2 },
    ...overrides,
  };
}

function fixture(entries = [entry('bundle-1')], overrides = {}) {
  return {
    schemaVersion: 1, kind: 'private-report-catalog', root: 'C:\\private\\saved reports', generatedAt: '2026-09-07T12:00:00.000Z', complete: true,
    limits: { maxDepth: 12, maxDirectories: 1000, maxBundles: 100, maxEntries: 10000 }, directoriesVisited: 3, entries, traversalIssues: [],
    totals: { bundles: entries.length, valid: entries.length, invalid: 0, integrityMatched: entries.length, integrityUnavailable: 0, integrityFailed: 0, duplicateGroups: 0, duplicateCopies: 0, provenanceAvailable: entries.length, provenanceUnavailable: 0, provenanceUnknown: 0 },
    ...overrides,
  };
}

function scripts(html) {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map((match) => ({ attributes: match[1], text: match[2] }));
}

// A small DOM double verifies application state and text sinks without a browser dependency.
// Real browser layout, CSP enforcement, and interactions are verified separately.
class Element {
  constructor(tagName) {
    this.tagName = tagName; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {};
    this.value = tagName === 'select' ? 'all' : ''; this.hidden = false; this.ownText = ''; this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  set textContent(text) { this.ownText = String(text); this.children = []; }
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.ownText = ''; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector(tag) {
    for (const child of this.children) {
      if (child.tagName === tag) return child;
      const result = child.querySelector(tag); if (result) return result;
    }
    return null;
  }
  focus() { this.focused = true; }
}

function application(catalog) {
  const html = renderReportCatalog(catalog);
  const elements = new Map([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/g)].map((match) => [match[2], new Element(match[1])]));
  const embedded = scripts(html);
  elements.get('catalog-data').textContent = embedded[0].text;
  const context = vm.createContext({ document: { getElementById: (id) => { assert.ok(elements.has(id), `missing DOM element ${id}`); return elements.get(id); }, createElement: (tag) => new Element(tag) } });
  new vm.Script(embedded[1].text).runInContext(context, { timeout: 1000 });
  return {
    get: (id) => elements.get(id), context,
    change: (id, value) => { const element = elements.get(id); element.value = value; element.listeners[id === 'search' ? 'input' : 'change'](); },
    click: (id) => elements.get(id).listeners.click(),
  };
}

test('catalog embeds hostile private folder strings only as inert JSON and preserves their text', () => {
  const catalog = fixture([entry('bundle-1', { folder: hostile })], { root: hostile, traversalIssues: [{ code: 'directory_unreadable', folder: hostile }], complete: false });
  const html = renderReportCatalog(catalog);
  const embedded = scripts(html);
  assert.equal(embedded.length, 2);
  assert.equal(embedded[0].attributes, ' id="catalog-data" type="application/json"');
  assert.equal(embedded[0].text.includes('<'), false);
  assert.equal(embedded[0].text.includes('\u2028'), false);
  assert.equal(embedded[0].text.includes('\u2029'), false);
  assert.deepEqual(JSON.parse(embedded[0].text), catalog);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script>globalThis.stolen'), false);
  const app = application(catalog);
  assert.equal(app.get('source-root').textContent, hostile);
  assert.equal(app.get('report-rows').children[0].querySelector('button').textContent, hostile);
  assert.ok(app.get('report-detail').textContent.includes(hostile));
  assert.equal(app.context.stolen, undefined);
});

test('offline HTML uses exact script and style hashes with no external resource elements', () => {
  const html = renderReportCatalog(fixture());
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const code = scripts(html)[1].text;
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const hash = (value) => createHash('sha256').update(value).digest('base64');
  assert.ok(policy.includes(`script-src 'sha256-${hash(code)}'`));
  assert.ok(policy.includes(`style-src 'sha256-${hash(css)}'`));
  for (const directive of ['default-src', 'connect-src', 'img-src', 'font-src', 'object-src', 'base-uri', 'form-action']) assert.ok(policy.includes(`${directive} 'none'`));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.doesNotMatch(html, /<(?:script|img|iframe|link|audio|video)\b[^>]*(?:src|href)=/i);
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|fetch\s*\(|XMLHttpRequest|WebSocket|eval\s*\(/);
  assert.doesNotMatch(css, /@import|url\(/);
  assert.match(html, /Local folder paths are private metadata/);
  assert.match(html, /not a sanitized share/);
});

test('invalid report counts and absent provenance stay unknown instead of zero', () => {
  const invalid = entry('broken', { summary: null, contentId: null, check: { schemaVersion: 1, valid: false, profile: 'unknown', integrity: 'unavailable', authenticity: 'not-established', issues: [{ code: 'missing_artifact', file: 'report.json', message: 'An expected artifact is missing.' }], warnings: [] } });
  const app = application(fixture([invalid]));
  const cells = app.get('report-rows').children[0].children;
  assert.equal(cells[3].textContent, 'Unknown');
  assert.equal(cells[4].textContent, 'Unknown');
  assert.equal(cells[5].textContent, 'Unknown');
  assert.match(app.get('report-detail').textContent, /Result counts are unknown/);
  assert.match(app.get('report-detail').textContent, /missing_artifact/);
  const legacy = application(fixture([entry('legacy', { summary: { ...entry('legacy').summary, provenance: 'unavailable', historyComplete: null, resultRecorded: false, attempts: 0 } })]));
  const detailPairs = legacy.get('report-detail').children.filter((child) => child.tagName === 'dl').flatMap((list) => list.children);
  assert.equal(detailPairs.find((row) => row.children[0].textContent === 'Recorded attempts').children[1].textContent, 'Unknown');
  assert.equal(detailPairs.find((row) => row.children[0].textContent === 'Result attempt recorded').children[1].textContent, 'Unknown');
});

test('search and all five filters combine, clear, and update the selected report', () => {
  const copies = [entry('alpha', { duplicateGroup: 'duplicate-1' }), entry('beta', { duplicateGroup: 'duplicate-1' })];
  const unique = entry('gamma', { contentId: 'b'.repeat(64), summary: { ...entry('gamma').summary, outcome: 'complete', provenance: 'unavailable' }, check: { ...entry('gamma').check, integrity: 'unavailable' } });
  const app = application(fixture([...copies, unique]));
  assert.equal(app.get('result-count').textContent, '3 of 3 reports');
  app.change('filter-validity', 'valid');
  app.change('filter-integrity', 'matched');
  app.change('filter-outcome', 'incomplete');
  app.change('filter-provenance', 'available');
  app.change('filter-duplicates', 'duplicate');
  assert.equal(app.get('result-count').textContent, '2 of 3 reports');
  app.change('search', 'BETA');
  assert.equal(app.get('result-count').textContent, '1 of 3 reports');
  assert.match(app.get('report-detail').textContent, /saved\/beta/);
  assert.match(app.get('report-detail').textContent, /2 bundles share/);
  app.change('filter-outcome', 'complete');
  assert.equal(app.get('result-count').textContent, '0 of 3 reports');
  assert.equal(app.get('empty-state').hidden, false);
  assert.equal(app.get('empty-title').textContent, 'No reports match your filters');
  assert.doesNotMatch(app.get('report-detail').textContent, /saved\/beta/);
  app.click('clear-filters');
  assert.equal(app.get('result-count').textContent, '3 of 3 reports');
  assert.equal(app.get('search').focused, true);
  app.get('report-rows').children[2].querySelector('button').listeners.click();
  assert.match(app.get('report-detail').textContent, /saved\/gamma/);
  assert.equal(app.get('report-rows').children[2].querySelector('button').attributes['aria-pressed'], 'true');
  assert.equal(app.get('report-rows').children[0].querySelector('button').attributes['aria-pressed'], 'false');
});

test('empty and partial inventories explain their limits without claiming assessment coverage', () => {
  const app = application(fixture([], { complete: false, directoriesVisited: 2, traversalIssues: [{ code: 'max_depth_reached', folder: 'saved/deep' }] }));
  assert.equal(app.get('empty-title').textContent, 'No report bundles found');
  assert.equal(app.get('inventory-title').textContent, 'Partial directory inventory');
  assert.match(app.get('inventory-note').textContent, /only the reports discovered/);
  assert.match(app.get('inventory-note').textContent, /does not establish assessment coverage or security/);
  assert.match(app.get('inventory-banner').textContent, /saved\/deep — max_depth_reached/);
  assert.match(app.get('inventory-limits').textContent, /2 directories visited/);
  assert.match(app.get('inventory-limits').textContent, /12.*1,000.*100.*10,000/);
  const complete = application(fixture([]));
  assert.equal(complete.get('inventory-title').textContent, 'Directory inventory complete');
  assert.match(complete.get('inventory-note').textContent, /does not establish assessment coverage or security/);
});
