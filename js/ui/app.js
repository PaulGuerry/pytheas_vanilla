// Page: loads the release, then reads queries from the bar and from the URL (?q=...&q=...&lang=fr&r=261013&p=syntax).
import { loadRelease, browserFetchBytes } from '../data/store.js';
import { buildLexicon } from '../query/lexicon.js';
import { prepare } from '../cohort/prepare.js';
import { parse } from '../query/parse.js';
import { canonical } from '../query/format.js';
import { setLang, getLang, t, strings } from '../i18n/strings.js';
import { initBar } from './bar.js';
import { resultCard, errorCard } from './card.js';
import { CHIPS, POOL } from './examples.js';
import { esc } from './describe.js';
import { renderPage, PAGES } from './pages.js';

const $ = (id) => document.getElementById(id);
const state = { L: null, ctx: null, release: null, queries: [], bar: null, requested: null, page: 'query' };

function readURL() {
  const p = new URLSearchParams(location.search);
  return { queries: p.getAll('q'), lang: p.get('lang'), release: p.get('r'), page: PAGES[p.get('p')] ? p.get('p') : 'query' };
}
function writeURL(push) {
  const p = new URLSearchParams();
  for (const q of state.queries) p.append('q', q);
  if (getLang() === 'fr') p.set('lang', 'fr');
  if (state.requested) p.set('r', state.requested);
  if (state.page !== 'query') p.set('p', state.page);
  const url = `${location.pathname}${p.toString() ? '?' + p.toString().replace(/%20/g, '+') : ''}`;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}
const linkFor = (canon) => {
  const p = new URLSearchParams({ q: canon });
  if (getLang() === 'fr') p.set('lang', 'fr');
  if (state.requested) p.set('r', state.requested);
  return `${location.origin}${location.pathname}?${p.toString().replace(/%20/g, '+')}`;
};

function staticTexts() {
  const S = strings();
  document.documentElement.lang = getLang();
  $('query').placeholder = S.placeholder;
  $('examples-label').textContent = S.examples;
  $('chips').innerHTML = CHIPS.map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(shown(q))}</button>`).join('');
  for (const k of Object.keys(S.nav)) $(`nav-${k}`).textContent = S.nav[k];
  $('f-contact').textContent = S.contact;
  $('f-cite').textContent = S.cite;
  $('f-sponsors').textContent = S.sponsors;
  if (state.release) $('release').textContent = S.release(state.release.info);
  document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
  document.querySelectorAll('nav.pages a').forEach((a) => a.classList.toggle('active', a.dataset.page === state.page));
}

/** A query as shown on the page (French keywords in French); the canonical form stays in the URL. */
function shown(q) {
  if (!state.L) return q;
  const a = parse(q, state.L);
  return (a.ok && canonical(a, state.L, getLang())) || q;
}

function showPage(name) {
  state.page = PAGES[name] ? name : 'query';
  $('view-query').hidden = state.page !== 'query';
  $('view-page').hidden = state.page === 'query';
  if (state.page !== 'query' && state.ctx) renderPage(state.page, $('view-page'), { ctx: state.ctx, L: state.L });
  document.querySelectorAll('nav.pages a').forEach((a) => a.classList.toggle('active', a.dataset.page === state.page));
}

function cardFor(canon) {
  const ast = parse(canon, state.L);
  const el = resultCard(ast, canon, state.ctx, state.L);
  el.dataset.q = canon;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'close') {
      state.queries = state.queries.filter((q) => q !== canon);
      el.remove(); writeURL(true);
    } else if (b.dataset.act === 'edit') state.bar.setValue(shown(canon));
    else if (b.dataset.act === 'link') {
      try { await navigator.clipboard.writeText(linkFor(canon)); b.textContent = t('copied'); } catch { prompt('', linkFor(canon)); }
    }
  });
  return el;
}

function renderAll() {
  const box = $('cards');
  box.innerHTML = '';
  for (const q of state.queries) box.appendChild(cardFor(q));
}

function submit(text) {
  if (state.page !== 'query') { showPage('query'); window.scrollTo(0, 0); }
  const ast = parse(text, state.L);
  $('error-slot').innerHTML = '';
  if (!ast.ok) {
    $('error-slot').appendChild(errorCard(ast, text, (fixed) => state.bar.setValue(fixed)));
    return;
  }
  if (ast.analysis.kind === 'example') return submit(POOL[Math.floor(Math.random() * POOL.length)]);
  const canon = canonical(ast, state.L);
  state.queries = [canon, ...state.queries.filter((q) => q !== canon)];
  const old = [...$('cards').children].find((c) => c.dataset.q === canon);
  if (old) old.remove();
  $('cards').prepend(cardFor(canon));
  state.bar.setValue('');
  writeURL(true);
}

async function boot() {
  const url = readURL();
  setLang(url.lang || ((navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en'));
  state.requested = url.release;
  staticTexts();
  $('status').textContent = t('loading');
  try {
    state.release = await loadRelease(browserFetchBytes, { release: url.release });
  } catch (err) {
    $('status').textContent = `${t('loadError')}: ${err.message}`;
    return;
  }
  state.L = buildLexicon(state.release);
  state.ctx = prepare(state.release);
  $('status').textContent = '';
  staticTexts();
  state.bar = initBar({ input: $('query'), pills: $('pills'), dropdown: $('dropdown'), L: state.L, onSubmit: submit });
  // queries of the URL, shown in their canonical form
  state.queries = url.queries.map((q) => { const a = parse(q, state.L); return a.ok ? canonical(a, state.L) : null; }).filter(Boolean);
  renderAll();
  showPage(url.page);
  writeURL(false);
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) submit(b.dataset.q); });
  document.addEventListener('click', (e) => {          // links that run a query, or open a page
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const q = e.target.closest('a[data-q]');
    if (q) { e.preventDefault(); submit(q.dataset.q); return; }
    const pg = e.target.closest('a[data-page]');
    if (pg) { e.preventDefault(); showPage(pg.dataset.page); window.scrollTo(0, 0); writeURL(true); }
  });
  document.addEventListener('pytheas:query', (e) => submit(e.detail));
  document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => {
    setLang(b.dataset.lang); $('error-slot').innerHTML = ''; staticTexts(); renderAll(); showPage(state.page); state.bar.refresh(); writeURL(false);
  }));
  window.addEventListener('popstate', () => {
    const u = readURL();
    setLang(u.lang || 'en'); staticTexts();
    state.queries = u.queries;
    renderAll();
    showPage(u.page);
  });
  $('query').focus();
}

boot();
