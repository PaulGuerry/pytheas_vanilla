// Query bar: the input, the pills (the tokens as parsed), autocomplete and history.
import { tokenize } from '../query/tokenize.js';
import { strings, getLang } from '../i18n/strings.js';
import { esc } from './describe.js';

const TYPE_LABEL = {
  en: { analysis: 'analysis', lab: 'laboratory value', gene: 'gene', disease: 'disease', pfic: 'PFIC type', value: 'filter',
        treatment: 'treatment', term: 'symptom (HPO)', operator: 'operator', facet: 'facet', option: 'option', all: 'all patients',
        example: 'example', prefixed: 'filter', or: 'or', unknown: 'unknown word' },
  fr: { analysis: 'analyse', lab: 'valeur biologique', gene: 'gène', disease: 'maladie', pfic: 'type de PFIC', value: 'filtre',
        treatment: 'traitement', term: 'symptôme (HPO)', operator: 'opérateur', facet: 'facette', option: 'option', all: 'tous les patients',
        example: 'exemple', prefixed: 'filtre', or: 'ou', unknown: 'mot inconnu' },
};
const typeLabel = (type) => TYPE_LABEL[getLang()][type] || type;
const npat = (n) => (n ? ` · ${n} ${strings().patients}` : '');

function pillTitle(tok, L) {
  if (tok.type === 'unknown') {
    const s = (tok.suggestions || []).map((x) => x.text).join(', ');
    return `${typeLabel('unknown')}${s ? ` — ${strings().didYouMean}: ${s}` : ''}`;
  }
  if (tok.type === 'pfic') return `${typeLabel('pfic')}: PFIC + ${tok.gene}${npat(tok.n)}`;
  if (tok.type === 'term') return `${typeLabel('term')}: ${L.termLabel(tok.id)} (${tok.id})${npat(tok.n)}`;
  if (tok.type === 'prefixed') return `${typeLabel('prefixed')} ${tok.field}: ${tok.values.join(', ')}${tok.bad.length ? ' — ?' + tok.bad.map((b) => b.raw).join(', ') : ''}`;
  return `${typeLabel(tok.type)}${tok.id && tok.id !== tok.text ? `: ${tok.id}` : ''}${npat(tok.n)}`;
}

export function renderPills(container, tokens, L) {
  container.innerHTML = tokens.map((tok) => {
    const bad = tok.type === 'unknown' || (tok.type === 'prefixed' && tok.bad.length);
    const text = tok.type === 'term' && norm2(tok.text) !== norm2(L.termLabel(tok.id)) ? `${tok.text} → ${L.termLabel(tok.id)}` : tok.text;
    return `<span class="pill pill-${bad ? 'unknown' : tok.type}" title="${esc(pillTitle(tok, L))}">${esc(text)}</span>`;
  }).join('');
}
const norm2 = (s) => String(s).toLowerCase();

export function initBar({ input, pills, dropdown, L, onSubmit }) {
  const history = [];
  let hIndex = 0;
  let draft = '';
  let items = [];
  let active = -1;
  let fragment = null;

  const refreshPills = () => renderPills(pills, tokenize(input.value, L), L);

  function findCompletions() {
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret);
    if (!before || /\s$/.test(before)) return null;
    const words = [...before.matchAll(/\S+/g)];
    const last = words[words.length - 1];
    const pre = last[0].match(/^([^:\s]+):(.*)$/);
    if (pre && L.fieldPrefix.has(pre[1].toLowerCase())) {
      const field = L.fieldPrefix.get(pre[1].toLowerCase());
      const type = { disease: 'disease', gene: 'gene', tx: 'treatment', term: 'term' }[field] || 'value';
      const value = pre[2].split(',').pop();
      if (value.length < 2) return null;
      const res = L.complete(value, 30).filter((r) => r.type === type && (type !== 'value' || r.field === field)).slice(0, 8);
      return res.length ? { start: caret - value.length, end: caret, res, quote: true } : null;
    }
    for (let k = Math.min(3, words.length); k >= 1; k--) {
      const start = words[words.length - k].index;
      const frag = before.slice(start);
      const res = L.complete(frag);
      if (res.length) return { start, end: caret, res };
    }
    return null;
  }

  function showDropdown() {
    fragment = findCompletions();
    items = fragment ? fragment.res : [];
    active = -1;
    if (!items.length) { dropdown.hidden = true; return; }
    dropdown.innerHTML = items.map((it, i) => `<li data-i="${i}"><span class="ac-text">${esc(it.label)}</span>
      <span class="ac-type pill-${it.type}">${esc(typeLabel(it.type))}${it.n ? ` · ${it.n}` : ''}</span></li>`).join('');
    dropdown.hidden = false;
  }
  function highlight() {
    [...dropdown.children].forEach((li, i) => li.classList.toggle('active', i === active));
  }
  function accept(i) {
    const it = items[i];
    if (!it || !fragment) return;
    let text = it.type === 'term' ? it.label : it.text;
    if (fragment.quote && /\s/.test(text)) text = `"${text}"`;
    const v = input.value;
    input.value = v.slice(0, fragment.start) + text + ' ' + v.slice(fragment.end).replace(/^\s+/, '');
    const pos = fragment.start + text.length + 1;
    input.setSelectionRange(pos, pos);
    dropdown.hidden = true;
    refreshPills();
    input.focus();
  }

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { refreshPills(); showDropdown(); }, 100);
  });
  input.addEventListener('keydown', (e) => {
    const open = !dropdown.hidden && items.length;
    if (e.key === 'ArrowDown' && open) { active = (active + 1) % items.length; highlight(); e.preventDefault(); return; }
    if (e.key === 'ArrowUp' && open) { active = (active - 1 + items.length) % items.length; highlight(); e.preventDefault(); return; }
    if ((e.key === 'Tab' || e.key === 'Enter') && open && active >= 0) { accept(active); e.preventDefault(); return; }
    if (e.key === 'Escape') { dropdown.hidden = true; return; }
    if (e.key === 'Enter') {
      dropdown.hidden = true;
      const q = input.value.trim();
      if (!q) return;
      if (history[history.length - 1] !== q) history.push(q);
      hIndex = history.length;
      onSubmit(q);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp' && history.length) {
      if (hIndex === history.length) draft = input.value;
      hIndex = Math.max(0, hIndex - 1);
      input.value = history[hIndex];
      refreshPills(); e.preventDefault();
    } else if (e.key === 'ArrowDown' && history.length) {
      hIndex = Math.min(history.length, hIndex + 1);
      input.value = hIndex === history.length ? draft : history[hIndex];
      refreshPills(); e.preventDefault();
    }
  });
  dropdown.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (li) { accept(+li.dataset.i); e.preventDefault(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { dropdown.hidden = true; }, 150));

  return {
    setValue(text) { input.value = text; refreshPills(); input.focus(); },
    refresh: refreshPills,
  };
}
