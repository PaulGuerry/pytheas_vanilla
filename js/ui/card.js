// Result cards: how the query was read, the patients of each cohort, then the figures, tables and notes
// of the analysis, with CSV, SVG and PNG downloads.
import { strings, getLang } from '../i18n/strings.js';
import { selectCohorts, splitBy } from '../cohort/filter.js';
import { renderPills } from './bar.js';
import { tokenize } from '../query/tokenize.js';
import { ANALYSES } from '../analyses/registry.js';
import { FACETS, OPTIONS } from '../query/vocab.js';
import { esc, describeFilters, analysisTitle, groupLabel } from './describe.js';
import { runAnalysis } from '../analyses/index.js';
import { downloadCSV, downloadSVG, downloadPNG } from './export.js';

function shell(title, canon, L, actions = true) {
  const S = strings();
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `<header class="card-head">
      <h2>${title}</h2>
      ${actions ? `<div class="card-actions">
        <button type="button" data-act="edit">${S.edit}</button>
        <button type="button" data-act="link">${S.copyLink}</button>
        <button type="button" data-act="close" aria-label="${S.close}">×</button></div>` : ''}
    </header>
    ${canon ? '<div class="card-query pills"></div>' : ''}
    <div class="card-body"></div>`;
  if (canon) renderPills(el.querySelector('.card-query'), tokenize(canon, L), L);
  return el;
}

export function errorCard(ast, query, onSuggestion) {
  const S = strings();
  const el = shell(S.errorTitle, null, null, false);
  el.classList.add('card-error');
  el.querySelector('.card-body').innerHTML = `<p class="query-text">${esc(query)}</p><ul class="diag">${
    ast.diagnostics.map((d, i) => {
      const msg = (S.diag[d.code] || (() => d.code))(d);
      const sugg = (d.suggestions || []).map((s) => `<button type="button" class="sugg" data-d="${i}" data-text="${esc(s.text)}">${esc(s.text)}</button>`).join(' ');
      return `<li class="${d.level}">${esc(msg)}${sugg ? ` <span class="muted">${S.didYouMean}</span> ${sugg}` : ''}</li>`;
    }).join('')}</ul>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.sugg');
    if (!b) return;
    const d = ast.diagnostics[+b.dataset.d];
    let text = b.dataset.text;
    if (d.code === 'unknown_value') {
      const tok = query.slice(d.start, d.end);
      text = tok.replace(d.value, /\s/.test(text) ? `"${text}"` : text);
    }
    onSuggestion(query.slice(0, d.start) + text + query.slice(d.end));
  });
  return el;
}

const FACET_FR = { gene: 'gène', disease: 'maladie', sex: 'sexe', zygosity: 'zygotie', variant: 'type de variant', cadd: 'cadd',
                   onset: 'début', status: 'statut', consanguinity: 'consanguinité', cluster: 'groupe', decade: 'décennie' };

function helpCard(ast, L) {
  const S = strings();
  const H = S.help;
  const el = shell(S.helpTitle, null, L, true);
  const lang = getLang();
  const names = ANALYSES.filter((a) => a.names && !a.implicit && a.id !== 'help')
    .map((a) => `<code>${esc(a.names[lang]?.[0] || a.names.en[0])}</code>`).join(' ');
  const facets = Object.entries(FACETS).map(([id, w]) => `<code>${esc(lang === 'fr' ? FACET_FR[id] : w[0])}</code>`).join(' ');
  el.querySelector('.card-body').innerHTML = `<p>${esc(H.intro)}</p>
    <pre class="grammar">${esc(H.grammar)}</pre>
    <p>${esc(H.operators)}</p><p>${esc(H.prefixes)}</p>
    <p><strong>${esc(H.analyses)}</strong>: ${names}</p>
    <p><strong>${esc(H.facets)}</strong>: ${facets}</p>
    <p><strong>${esc(H.options)}</strong>: ${Object.keys(OPTIONS).map((k) => `<code>${k}=</code>`).join(' ')}</p>`;
  return el;
}

export function resultCard(ast, canon, ctx, L) {
  const S = strings();
  if (ast.analysis.kind === 'analysis' && ast.analysis.id === 'help') return helpCard(ast, L);
  const el = shell(analysisTitle(ast.analysis, L), canon, L);
  const body = el.querySelector('.card-body');
  const release = ctx.release.id;
  let out = { html: '', figures: [] };
  const fill = (res) => {
    out = res || out;
    const sel = selectCohorts(ast, ctx);
    const cohorts = `<ul class="cohorts">${sel.map((s, i) => `<li><strong>${ast.cohorts.length > 1 ? `${S.cohort} ${i + 1}` : S.cohort}</strong> `
      + `${describeFilters(s.cohort.filters, L, s.cohort.all)} <span class="muted">· n = ${s.members.length}</span></li>`).join('')}</ul>`;
    const among = ast.among.length ? `<p class="among"><strong>${S.among}</strong>: ${describeFilters(ast.among, L)}</p>` : '';
    const index = new Map((out.figures || []).map((f, i) => [f, i]));
    const figs = (list) => list.map((f) => { const i = index.get(f); return `<figure class="fig" data-i="${i}">${f.svg}
      <figcaption>${f.note ? `<span class="muted small">${esc(f.note)}</span>` : ''}
      <span class="fig-actions"><button type="button" data-act="svg" data-i="${i}">SVG</button><button type="button" data-act="png" data-i="${i}">PNG</button></span></figcaption></figure>`; }).join('');
    const content = out.sections
      ? out.sections.map((x) => `<section class="part">${x.before || ''}${figs(x.figures || [])}${x.after || ''}</section>`).join('')
      : `${figs(out.figures || [])}${out.html || ''}`;
    const warnings = ast.diagnostics.filter((d) => d.level === 'warning')
      .map((d) => `<p class="warning">${esc(S.warning)}: ${esc((S.diag[d.code] || (() => d.code))(d))}</p>`).join('');
    const notes = (out.notes || []).filter(Boolean).map((n) => `<li>${esc(n)}</li>`).join('');
    body.innerHTML = `${among}${cohorts}${warnings}${content}
      <footer class="card-foot"><ul class="notes">${notes}<li>${esc(S.releaseShort(ctx.release.info))}</li></ul>
      ${out.csv?.rows?.length ? `<button type="button" data-act="csv" class="csv">CSV</button>` : ''}</footer>`;
  };
  const res = runAnalysis(ast, ctx, L);
  if (res && typeof res.then === 'function') {
    body.innerHTML = `<p class="muted">${esc(S.loading)}</p>`;
    res.then(fill, (e) => { body.innerHTML = `<p class="warning">${esc(S.loadFailed)} (${esc(e.message)})</p>`; });
  } else fill(res);
  el.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-q]');
    if (a) { e.preventDefault(); el.dispatchEvent(new CustomEvent('pytheas:query', { detail: a.dataset.q, bubbles: true })); return; }
    const b = e.target.closest('button[data-act]');
    if (!b || !['csv', 'svg', 'png'].includes(b.dataset.act)) return;
    const i = +b.dataset.i;
    const base = `pytheasdb_${release}_${(out.csv?.name || 'analysis')}`;
    if (b.dataset.act === 'csv') downloadCSV(out.csv.rows, base);
    else if (b.dataset.act === 'svg') downloadSVG(out.figures[i].svg, `pytheasdb_${release}_${out.figures[i].name}`);
    else downloadPNG(out.figures[i].svg, `pytheasdb_${release}_${out.figures[i].name}`);
  });
  return el;
}
