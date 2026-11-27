// Canonical form of a parsed query: English keywords, values bare where they read back unchanged,
// prefixed otherwise. This string is what goes into the history and the URL.
import { FIELDS, FIELD_ORDER, FACETS } from './vocab.js';
import { ANALYSIS_BY_ID } from '../analyses/registry.js';
import { quoteIfNeeded } from './text.js';

const TYPE_OF_FIELD = { disease: 'disease', gene: 'gene', tx: 'treatment' };

function bareResolves(text, field, id, L) {
  const c = L.lookup(text)[0];
  if (!c) return false;
  if (TYPE_OF_FIELD[field]) return c.type === TYPE_OF_FIELD[field] && c.id === id;
  return c.type === 'value' && c.field === field && c.id === id;
}

function bareText(field, id) {
  const f = FIELDS[field];
  if (TYPE_OF_FIELD[field]) return id;
  if (f.show?.[id]) return f.show[id];
  return f.values?.[id] ? (f.values[id].find((a) => (f.bare || []).includes(a)) || null) : null;
}

export function termText(code, L) {
  const label = L.termLabel(code);
  if (label && !/[,;"|:=]/.test(label)) {
    const c = L.lookup(label)[0];
    if (c?.type === 'term' && c.id === code) return label;
  }
  return code;
}

function filterText(f, L) {
  if (f.field === 'term') {
    const head = f.state === 'absent' ? 'without ' : 'with ';
    return head + (f.values.length === 1 ? termText(f.values[0], L) : `hp:${f.values.map((c) => c.slice(3)).join(',')}`);
  }
  const prefix = FIELDS[f.field].prefixes[0];
  if (f.values.length === 1) {
    const bare = bareText(f.field, f.values[0]);
    if (bare && bareResolves(bare, f.field, f.values[0], L)) return bare;
    return `${prefix}:${quoteIfNeeded(f.values[0])}`;
  }
  return `${prefix}:${f.values.map(quoteIfNeeded).join(',')}`;
}

export function filtersText(filters, L) {
  const out = [];
  const aliases = new Set();
  const ordered = [...filters].sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
  for (const f of ordered.filter((f) => f.alias)) {
    if (!aliases.has(f.alias)) { aliases.add(f.alias); out.push(f.alias); }
  }
  for (const f of ordered) if (!f.alias) out.push(filterText(f, L));
  return out.join(' ');
}

export function analysisText(a, L) {
  if (a.kind === 'lab') return a.id;
  if (a.kind === 'term') return termText(a.id, L);
  if (a.kind === 'treatment') {
    const c = L.lookup(a.id)[0];
    return c?.type === 'treatment' && c.id === a.id ? a.id : `tx:${quoteIfNeeded(a.id)}`;
  }
  if (a.kind === 'example') return 'example';
  return ANALYSIS_BY_ID[a.id].names.en[0];
}

/** Canonical text of a query, or null when it has errors. */
export function canonical(ast, L) {
  if (!ast.ok) return null;
  const a = ast.analysis;
  if (a.kind === 'example') return 'example';
  if (a.kind === 'analysis' && a.id === 'help') {
    const t = a.topic;
    if (!t) return 'help';
    if (t.type === 'analysis') return `help ${ANALYSIS_BY_ID[t.id].names.en[0]}`;
    if (t.type === 'term') return `help ${termText(t.id, L)}`;
    return `help ${t.id}`;
  }
  const parts = [];
  if (!(a.kind === 'analysis' && a.id === 'overview')) parts.push(analysisText(a, L));
  const cohorts = ast.cohorts.map((c) => filtersText(c.filters, L));
  const onlyOne = ast.cohorts.length === 1;
  const lone = !parts.length && !ast.among.length && !ast.by && !Object.keys(ast.options).length;
  const ct = cohorts.map((t) => t || (onlyOne && !lone ? '' : 'all'));
  if (ct.some(Boolean)) parts.push(ct.join(' vs '));
  if (ast.among.length) parts.push('among ' + filtersText(ast.among, L));
  if (ast.by) parts.push('by ' + (ast.by.kind === 'facet' ? FACETS[ast.by.id][0] : termText(ast.by.id, L)));
  for (const k of Object.keys(ast.options).sort()) parts.push(`${k}=${ast.options[k]}`);
  return parts.join(' ');
}
