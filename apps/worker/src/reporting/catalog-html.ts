// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';

import type { ReportCatalog } from './catalog-types.js';

const styles = `
:root{color-scheme:light dark;--bg:#f4f5f2;--panel:#fff;--ink:#192721;--muted:#617068;--line:#dce3dd;--accent:#185b43;--tint:#e9f3ed;--amber:#805411;--amber-bg:#fcf2df;--red:#a13939;--red-bg:#fceeee;--shadow:0 8px 28px #162c2210;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}button,input,select{font:inherit}button,select{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #478e73;outline-offset:3px}a{color:var(--accent)}.skip{position:absolute;left:20px;top:-80px;background:var(--panel);padding:12px;z-index:5}.skip:focus{top:12px}.shell{max-width:1600px;margin:auto;padding:0 36px 40px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:10px;font-weight:750;letter-spacing:-.02em}.mark{display:grid;place-items:center;background:var(--accent);color:#fff;width:29px;height:29px;border-radius:8px;font-size:18px}.eyebrow,.section-label{font-size:11px;font-weight:750;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.local{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}.local:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent)}header{padding:29px 0 22px}h1{font-size:34px;letter-spacing:-.045em;line-height:1.18;margin:7px 0 12px}h2,h3,p{margin:0}header p{color:var(--muted);max-width:780px}.source-line{margin-top:17px;display:flex;flex-wrap:wrap;gap:5px 10px;align-items:baseline;color:var(--muted);font-size:12px}.source-line code{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;color:var(--ink)}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.metric{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:17px 20px}.metric .number{display:block;font-size:30px;letter-spacing:-.035em;font-weight:650;line-height:1.35;margin-top:4px}.metric .note{font-size:12px;color:var(--muted)}.banner{padding:13px 16px;border:1px solid var(--line);background:var(--tint);border-radius:10px;margin-bottom:20px}.banner.partial{background:var(--amber-bg);border-color:#d9bd87}.banner strong{font-size:13px}.banner p,.banner li{font-size:12px;color:var(--muted);margin-top:3px}.banner ul{margin:8px 0 0;padding-left:20px}.banner code{overflow-wrap:anywhere}main{display:grid;grid-template-columns:minmax(0,1fr) 324px;gap:20px;align-items:start}.collection,.detail{background:var(--panel);border:1px solid var(--line);border-radius:13px;box-shadow:var(--shadow);min-width:0}.toolbar{padding:19px 20px 16px}.collection-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px}.collection-title h2,.detail h2{font-size:16px;letter-spacing:-.015em}.quiet-button{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:6px;padding:5px 10px;font-size:12px}.quiet-button:hover{background:var(--bg);color:var(--ink)}.search-label{display:block;margin-bottom:13px}.search-label span{display:block;font-size:11px;font-weight:650;color:var(--muted);margin-bottom:5px}input[type=search]{width:100%;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:10px 12px;background:var(--bg)}.filters{display:flex;gap:10px;flex-wrap:wrap}.filters label{display:flex;flex-direction:column;gap:4px;flex:1;min-width:110px;font-size:11px;font-weight:650;color:var(--muted)}select{width:100%;min-height:34px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);font-size:12px;font-weight:400}.table-wrap{overflow:auto;scrollbar-gutter:stable}table{border-collapse:collapse;text-align:left;width:100%;min-width:800px;table-layout:fixed}caption{text-align:left;padding:10px 20px;background:var(--bg);border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}th{padding:11px 12px;color:var(--muted);font-size:10px;letter-spacing:.055em;text-transform:uppercase;font-weight:650;background:var(--panel);border-bottom:1px solid var(--line)}th:first-child{width:29%;padding-left:20px}th:nth-child(2){width:15%}th:nth-child(3){width:17%}th:nth-child(4){width:11%}th:nth-child(5){width:15%}th:last-child{width:13%}td{padding:13px 12px;border-bottom:1px solid var(--line);font-size:12px;vertical-align:top}td:first-child{padding-left:20px}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:var(--bg)}tbody tr.selected{background:var(--tint)}.folder-button{display:block;width:100%;text-align:left;padding:0;border:0;background:transparent;color:var(--ink);font-size:12px;font-weight:650;overflow-wrap:anywhere;line-height:1.45}.folder-button:hover{text-decoration:underline;text-underline-offset:3px}.subtext{font-size:11px;color:var(--muted);margin-top:4px;overflow-wrap:anywhere}.badge{display:inline-block;border-radius:5px;padding:2px 6px;font-size:10px;font-weight:650;white-space:nowrap;background:var(--bg);color:var(--muted)}.badge.good{background:var(--tint);color:var(--accent)}.badge.warn{background:var(--amber-bg);color:var(--amber)}.badge.bad{background:var(--red-bg);color:var(--red)}.count{font-variant-numeric:tabular-nums;font-weight:650}.detail{padding:20px;position:sticky;top:20px}.detail .section-label{margin-bottom:7px}.detail h2{margin-bottom:15px;overflow-wrap:anywhere}.detail h3{font-size:12px;font-weight:700;margin:22px 0 8px}.detail p{font-size:12px;color:var(--muted)}.detail .path{padding:11px;background:var(--bg);border:1px solid var(--line);border-radius:7px;font:11px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;color:var(--ink)}dl{margin:0}dl>div{display:flex;justify-content:space-between;gap:15px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px}dt{color:var(--muted)}dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere}.detail ul{padding:0;list-style:none;margin:0}.detail li{font-size:12px;padding:8px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}.detail li strong{display:block;font-size:11px}.detail li p{margin-top:4px}.detail .hash{font:10px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;padding-top:6px}.empty{text-align:center;padding:48px 24px}.empty h3{font-size:15px;margin-bottom:7px}.empty p{font-size:12px;color:var(--muted)}.privacy-note{padding:16px 20px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}footer{font-size:11px;color:var(--muted);margin-top:25px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[hidden]{display:none!important}noscript{display:block;background:var(--amber-bg);padding:20px;border:1px solid var(--line)}
@media(prefers-color-scheme:dark){:root{--bg:#111b17;--panel:#17231d;--ink:#e0eae3;--muted:#9aaca0;--line:#304238;--accent:#8cc7a8;--tint:#213b2d;--amber:#e8c071;--amber-bg:#382f1f;--red:#eaa7a7;--red-bg:#402727;--shadow:none}.mark{color:#15291d}.banner.partial{border-color:#695635}}
@media(max-width:1150px){main{grid-template-columns:minmax(0,1fr)}.detail{position:static}.detail dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px}.detail .path{max-width:100%}}
@media(max-width:650px){.shell{padding:0 16px 28px}.topbar{padding:16px 0}.local{font-size:11px}header{padding:24px 0 18px}h1{font-size:29px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{padding:14px}.metric .number{font-size:27px}.metric .note{font-size:11px}.toolbar{padding:16px}.filters{gap:9px}.filters label{min-width:calc(50% - 9px)}.detail dl{grid-template-columns:minmax(0,1fr)}.source-line{display:block}.source-line code{display:block;margin-top:4px}.privacy-note{padding:14px 16px}main{gap:14px}}
`;

const script = `
'use strict';
(() => {
  const catalog = JSON.parse(document.getElementById('catalog-data').textContent);
  const byId = (id) => document.getElementById(id);
  const format = (value) => value === null || value === undefined ? 'Unknown' : typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = format(text);
    if (className) element.className = className;
    return element;
  };
  const outcome = (entry) => entry.summary ? entry.summary.outcome : 'unknown';
  const provenance = (entry) => entry.summary ? entry.summary.provenance : 'unknown';
  const duplication = (entry) => entry.duplicateGroup ? 'duplicate' : entry.contentId ? 'unique' : 'unknown';
  const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
  const badge = (text, tone) => node('span', text, 'badge' + (tone ? ' ' + tone : ''));
  const addPair = (list, label, value) => {
    const row = node('div'); row.append(node('dt', label), node('dd', value)); list.append(row);
  };
  const resultLabel = (value) => value === 'complete' ? 'Complete' : value === 'incomplete' ? 'Incomplete' : value === 'failed' ? 'Failed' : value === 'running' ? 'Running' : 'Unknown';
  const integrityLabel = (value) => value === 'matched' ? 'Hash matched' : value === 'failed' ? 'Integrity failed' : 'No manifest';
  byId('source-root').textContent = catalog.root;
  byId('generated-at').textContent = 'Snapshot: ' + catalog.generatedAt;
  byId('metric-bundles').textContent = format(catalog.totals.bundles);
  byId('metric-valid').textContent = format(catalog.totals.valid) + ' structurally valid';
  byId('metric-invalid').textContent = format(catalog.totals.invalid);
  byId('metric-provenance').textContent = format(catalog.totals.provenanceUnavailable);
  byId('metric-provenance-unknown').textContent = format(catalog.totals.provenanceUnknown) + ' unknown · ' + format(catalog.totals.provenanceAvailable) + ' available';
  byId('metric-copies').textContent = format(catalog.totals.duplicateCopies);
  byId('metric-groups').textContent = format(catalog.totals.duplicateGroups) + ' exact content groups';
  const banner = byId('inventory-banner');
  byId('inventory-title').textContent = catalog.complete ? 'Directory inventory complete' : 'Partial directory inventory';
  byId('inventory-note').textContent = (catalog.complete ? 'All directories within the supplied root were inventoried.' : 'Some folders could not be inventoried. Counts describe only the reports discovered.') + ' This does not establish assessment coverage or security.';
  if (!catalog.complete) banner.classList.add('partial');
  if (catalog.traversalIssues.length) {
    const list = node('ul');
    for (const issue of catalog.traversalIssues) {
      const item = node('li'); item.append(node('code', issue.folder), node('span', ' — ' + issue.code)); list.append(item);
    }
    banner.append(list);
  }
  byId('inventory-limits').textContent = format(catalog.directoriesVisited) + ' directories visited · limits: depth ' + format(catalog.limits.maxDepth) + ', ' + format(catalog.limits.maxDirectories) + ' directories, ' + format(catalog.limits.maxBundles) + ' bundles, ' + format(catalog.limits.maxEntries) + ' directory entries';
  const filters = ['validity', 'integrity', 'outcome', 'provenance', 'duplicates'];
  let selectedId = null;
  let visible = [];
  function renderDetails(entry) {
    const detail = byId('report-detail'); detail.replaceChildren(node('div', 'Selected report', 'section-label'));
    if (!entry) {
      detail.append(node('h2', 'Select a report'), node('p', 'Report details appear here. Choose a source folder from the table.'));
      return;
    }
    detail.append(node('h2', entry.folder), node('p', 'Private relative folder', 'section-label'), node('p', entry.folder, 'path'));
    const artifact = node('dl');
    addPair(artifact, 'Artifact check', entry.check.valid ? 'Valid' : 'Invalid');
    addPair(artifact, 'Profile', titleCase(entry.check.profile));
    addPair(artifact, 'Integrity', integrityLabel(entry.check.integrity));
    addPair(artifact, 'Authenticity', 'Not established');
    detail.append(node('h3', 'Artifact status'), artifact);
    const result = node('dl');
    addPair(result, 'Recorded outcome', resultLabel(outcome(entry)));
    addPair(result, 'Findings', entry.summary ? entry.summary.findings : null);
    addPair(result, 'Traffic records', entry.summary ? entry.summary.trafficRecords : null);
    addPair(result, 'Unresolved hypotheses', entry.summary ? entry.summary.unresolvedHypotheses : null);
    addPair(result, 'Pending / running tasks', entry.summary ? entry.summary.pendingTasks : null);
    addPair(result, 'Blocked verifications', entry.summary ? entry.summary.blockedVerifications : null);
    detail.append(node('h3', 'Recorded result'), result);
    if (!entry.summary) detail.append(node('p', 'Result counts are unknown because the bundle did not pass validation.'));
    const history = node('dl');
    addPair(history, 'Provenance', titleCase(provenance(entry)));
    addPair(history, 'History complete', entry.summary && entry.summary.historyComplete !== null ? entry.summary.historyComplete ? 'Yes' : 'No' : null);
    addPair(history, 'Result attempt recorded', entry.summary && entry.summary.provenance === 'available' ? entry.summary.resultRecorded ? 'Yes' : 'No' : null);
    addPair(history, 'Recorded attempts', entry.summary && entry.summary.provenance === 'available' ? entry.summary.attempts : null);
    detail.append(node('h3', 'Provenance'), history);
    detail.append(node('h3', 'Exact content grouping'));
    const group = entry.duplicateGroup;
    const copies = group ? catalog.entries.filter((candidate) => candidate.duplicateGroup === group).length : 0;
    detail.append(node('p', group ? format(copies) + ' bundles share the same artifact bytes in this profile (' + group + ').' : entry.contentId ? 'No exact copy was found in this inventory.' : 'Unknown: invalid bundles are not grouped.'));
    if (entry.contentId) detail.append(node('p', entry.contentId, 'hash'));
    detail.append(node('p', 'Grouping excludes the manifest. Copies are not independent assessments; matching hashes do not prove authenticity.'));
    if (entry.check.issues.length) {
      detail.append(node('h3', 'Validation issues'));
      const issues = node('ul');
      for (const issue of entry.check.issues) {
        const item = node('li'); item.append(node('strong', issue.code), node('p', issue.message));
        if (issue.file || issue.location) item.append(node('p', [issue.file, issue.location].filter(Boolean).join(' · '), 'subtext'));
        issues.append(item);
      }
      detail.append(issues);
    }
    if (entry.check.warnings.length) {
      detail.append(node('h3', 'Check notes'));
      const warnings = node('ul');
      for (const warning of entry.check.warnings) warnings.append(node('li', warning));
      detail.append(warnings);
    }
  }
  function selectEntry(id) {
    selectedId = id;
    const entry = visible.find((candidate) => candidate.id === id);
    for (const row of byId('report-rows').children) {
      const active = row.dataset.entryId === id;
      row.classList.toggle('selected', active);
      row.querySelector('button').setAttribute('aria-pressed', String(active));
    }
    renderDetails(entry);
    byId('selection-status').textContent = entry ? 'Selected ' + entry.folder : '';
  }
  function render() {
    const query = byId('search').value.trim().toLocaleLowerCase('en-US');
    const values = Object.fromEntries(filters.map((name) => [name, byId('filter-' + name).value]));
    visible = catalog.entries.filter((entry) => {
      const searchable = [entry.folder, entry.check.profile, outcome(entry), provenance(entry), entry.duplicateGroup || '', ...entry.check.issues.map((issue) => issue.code)].join(' ').toLocaleLowerCase('en-US');
      return (!query || searchable.includes(query))
        && (values.validity === 'all' || values.validity === (entry.check.valid ? 'valid' : 'invalid'))
        && (values.integrity === 'all' || values.integrity === entry.check.integrity)
        && (values.outcome === 'all' || values.outcome === outcome(entry))
        && (values.provenance === 'all' || values.provenance === provenance(entry))
        && (values.duplicates === 'all' || values.duplicates === duplication(entry));
    });
    if (!visible.some((entry) => entry.id === selectedId)) selectedId = visible.length ? visible[0].id : null;
    byId('result-count').textContent = format(visible.length) + ' of ' + format(catalog.entries.length) + ' reports';
    const rows = byId('report-rows'); rows.replaceChildren();
    for (const entry of visible) {
      const row = node('tr'); row.dataset.entryId = entry.id;
      const folder = node('td');
      const button = node('button', entry.folder, 'folder-button');
      button.type = 'button'; button.setAttribute('aria-controls', 'report-detail'); button.setAttribute('aria-pressed', String(entry.id === selectedId));
      button.addEventListener('click', () => selectEntry(entry.id));
      folder.append(button, node('div', titleCase(entry.check.profile) + ' · ' + (entry.check.valid ? 'valid artifacts' : 'invalid artifacts'), 'subtext'));
      const recorded = node('td');
      recorded.append(badge(resultLabel(outcome(entry)), outcome(entry) === 'complete' ? 'good' : outcome(entry) === 'failed' ? 'bad' : outcome(entry) === 'incomplete' ? 'warn' : ''));
      recorded.append(node('div', entry.summary ? format(entry.summary.trafficRecords) + ' traffic records' : 'Result unknown', 'subtext'));
      const integrity = node('td'); integrity.append(badge(integrityLabel(entry.check.integrity), entry.check.integrity === 'matched' ? 'good' : entry.check.integrity === 'failed' ? 'bad' : 'warn'));
      if (entry.check.issues.length) integrity.append(node('div', format(entry.check.issues.length) + ' validation issues', 'subtext'));
      const findings = node('td', entry.summary ? entry.summary.findings : null, 'count');
      const source = node('td'); source.append(node('div', titleCase(provenance(entry))));
      if (entry.summary && entry.summary.provenance === 'available') source.append(node('div', format(entry.summary.attempts) + ' attempts', 'subtext'));
      const copies = node('td'); copies.append(node('div', entry.duplicateGroup ? 'Exact copy' : entry.contentId ? 'Unique' : 'Unknown'));
      if (entry.duplicateGroup) copies.append(node('div', entry.duplicateGroup, 'subtext'));
      row.classList.toggle('selected', entry.id === selectedId); row.append(folder, recorded, integrity, findings, source, copies); rows.append(row);
    }
    byId('empty-state').hidden = visible.length !== 0;
    byId('empty-title').textContent = catalog.entries.length ? 'No reports match your filters' : 'No report bundles found';
    byId('empty-note').textContent = catalog.entries.length ? 'Try a shorter search or clear the filters.' : 'No recognized saved report artifacts were discovered. See the inventory status above for any discovery limits or errors.';
    renderDetails(visible.find((entry) => entry.id === selectedId));
  }
  byId('search').addEventListener('input', render);
  for (const name of filters) byId('filter-' + name).addEventListener('change', render);
  byId('clear-filters').addEventListener('click', () => {
    byId('search').value = ''; for (const name of filters) byId('filter-' + name).value = 'all'; render(); byId('search').focus();
  });
  render();
})();
`;

function hash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('base64');
}

/** Render a private, self-contained catalog. Local folder names remain private metadata. */
export function renderReportCatalog(catalog: ReportCatalog): string {
  const data = JSON.stringify(catalog)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const policy = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(styles)}'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Private report library</title>
<style>${styles}</style>
</head>
<body>
<a class="skip" href="#reports">Skip to reports</a>
<div class="shell">
  <div class="topbar"><div class="brand"><span class="mark" aria-hidden="true">≡</span> Report library</div><div class="local">Offline · Private catalog</div></div>
  <header><div class="eyebrow">Saved evidence / local workspace</div><h1>Your reports, in one place.</h1><p>Review saved results, inspect missing evidence, and identify exact copies. Every status reflects the files in this snapshot.</p><div class="source-line"><span>Source root</span><code id="source-root"></code></div></header>
  <noscript>JavaScript is required to browse this embedded catalog. The accompanying catalog.json contains the full inventory.</noscript>
  <section class="metrics" aria-label="Catalog totals">
    <div class="metric"><div class="section-label">Saved bundles</div><span class="number" id="metric-bundles">—</span><span class="note" id="metric-valid">Awaiting catalog</span></div>
    <div class="metric"><div class="section-label">Invalid artifacts</div><span class="number" id="metric-invalid">—</span><span class="note">Result counts stay unknown</span></div>
    <div class="metric"><div class="section-label">Missing provenance</div><span class="number" id="metric-provenance">—</span><span class="note" id="metric-provenance-unknown">Unknown is counted separately</span></div>
    <div class="metric"><div class="section-label">Extra copies</div><span class="number" id="metric-copies">—</span><span class="note" id="metric-groups">Exact artifact bytes only</span></div>
  </section>
  <section class="banner" id="inventory-banner" aria-label="Directory inventory status"><strong id="inventory-title">Directory inventory</strong><p id="inventory-note"></p></section>
  <main id="reports">
    <section class="collection" aria-labelledby="reports-heading">
      <div class="toolbar">
        <div class="collection-title"><h2 id="reports-heading">Saved reports</h2><button class="quiet-button" id="clear-filters" type="button">Clear filters</button></div>
        <label class="search-label" for="search"><span>Search folders, profiles, outcomes or issue codes</span><input id="search" type="search" placeholder="Find a saved report…" autocomplete="off" spellcheck="false"></label>
        <div class="filters">
          <label for="filter-validity">Artifacts<select id="filter-validity"><option value="all">All checks</option><option value="valid">Valid</option><option value="invalid">Invalid</option></select></label>
          <label for="filter-integrity">Integrity<select id="filter-integrity"><option value="all">All integrity</option><option value="matched">Hash matched</option><option value="unavailable">No manifest</option><option value="failed">Failed</option></select></label>
          <label for="filter-outcome">Recorded outcome<select id="filter-outcome"><option value="all">All outcomes</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="failed">Failed</option><option value="running">Running</option><option value="unknown">Unknown</option></select></label>
          <label for="filter-provenance">Provenance<select id="filter-provenance"><option value="all">All provenance</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="unknown">Unknown</option></select></label>
          <label for="filter-duplicates">Content grouping<select id="filter-duplicates"><option value="all">All content</option><option value="duplicate">Exact copies</option><option value="unique">Unique</option><option value="unknown">Unknown</option></select></label>
        </div>
      </div>
      <div class="table-wrap"><table><caption id="result-count" aria-live="polite">Loading saved reports</caption><thead><tr><th scope="col">Source folder</th><th scope="col">Recorded result</th><th scope="col">Integrity</th><th scope="col">Findings</th><th scope="col">Provenance</th><th scope="col">Content</th></tr></thead><tbody id="report-rows"></tbody></table></div>
      <div class="empty" id="empty-state" hidden><h3 id="empty-title"></h3><p id="empty-note"></p></div>
      <p class="privacy-note">Local folder paths are private metadata. This library is not a sanitized share. Zero findings do not establish security, and a complete recorded outcome does not establish coverage.</p>
    </section>
    <aside class="detail" id="report-detail" aria-label="Selected report details"><div class="section-label">Selected report</div><h2>Select a report</h2><p>Choose a source folder to inspect its saved artifact status.</p></aside>
  </main>
  <div id="selection-status" class="sr-only" role="status" aria-live="polite"></div>
  <footer><span id="generated-at"></span><span id="inventory-limits"></span></footer>
</div>
<script id="catalog-data" type="application/json">${data}</script>
<script>${script}</script>
</body>
</html>
`;
}
