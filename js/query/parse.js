// Parser: tokens -> query tree.
//   query  = [analysis] cohort { "vs" cohort } [ "among" filters ] [ "by" facet ] { option }
//   cohort = filter { filter }                      filters combine with AND; a comma joins values (OR)
// A diagnostic carries a code and the position of its token; the page translates it.
import { tokenize } from './tokenize.js';
import { FIELDS, OPTIONS } from './vocab.js';
import { ANALYSIS_BY_ID } from '../analyses/registry.js';

function tokenFilters(t) {
  switch (t.type) {
    case 'gene': return [{ field: 'gene', values: [t.id] }];
    case 'disease': return [{ field: 'disease', values: [t.id] }];
    case 'pfic': return [{ field: 'disease', values: [t.disease], alias: t.id }, { field: 'gene', values: [t.gene], alias: t.id }];
    case 'value': return [{ field: t.field, values: [t.id] }];
    case 'treatment': return [{ field: 'tx', values: [t.id] }];
    case 'term': return [{ field: 'term', values: [t.id], state: 'present', implicit: true }];
    case 'prefixed':
      if (!t.values.length) return [];
      return [t.field === 'term' ? { field: 'term', values: [...t.values], state: 'present', implicit: true }
                                 : { field: t.field, values: [...t.values] }];
    default: return null;
  }
}

const termOf = (t) => (t?.type === 'term' ? t.id : t?.type === 'prefixed' && t.field === 'term' && t.values.length === 1 && !t.bad.length ? t.values[0] : null);

export function parse(input, L) {
  const tokens = typeof input === 'string' ? tokenize(input, L) : input;
  const diagnostics = [];
  const at = (t) => (t ? { start: t.start, end: t.end, text: t.text } : {});
  const err = (code, t, params = {}) => diagnostics.push({ level: 'error', code, ...at(t), ...params });
  const warn = (code, t, params = {}) => diagnostics.push({ level: 'warning', code, ...at(t), ...params });
  const ast = { analysis: null, cohorts: [{ filters: [], all: false }], among: [], by: null, options: {}, tokens, diagnostics, ok: false };

  if (!tokens.length) { err('empty'); return ast; }
  let i = 0;
  const t0 = tokens[0];
  if (t0.type === 'example') {
    ast.analysis = { kind: 'example' };
    if (tokens.length > 1) err('example_alone', tokens[1]);
    ast.ok = !diagnostics.some((d) => d.level === 'error');
    return ast;
  }
  if (t0.type === 'analysis' && t0.id === 'help') {
    const nx = tokens[1];
    ast.analysis = { kind: 'analysis', id: 'help', topic: nx ? { type: nx.type, id: nx.id, field: nx.field } : null };
    if (nx && !['analysis', 'lab', 'term', 'treatment', 'value', 'operator', 'gene', 'disease'].includes(nx.type)) err('help_topic', nx);
    if (tokens.length > 2) err('help_extra', tokens[2]);
    ast.ok = !diagnostics.some((d) => d.level === 'error');
    return ast;
  }
  if (t0.type === 'analysis' && t0.id === 'lab') {
    if (tokens[1]?.type === 'lab') { ast.analysis = { kind: 'lab', id: tokens[1].id }; i = 2; }
    else { err('lab_expected', tokens[1] || t0); ast.analysis = { kind: 'analysis', id: 'overview', implicit: true }; i = 1; }
  } else if (t0.type === 'analysis') { ast.analysis = { kind: 'analysis', id: t0.id }; i = 1; }
  else if (t0.type === 'lab') { ast.analysis = { kind: 'lab', id: t0.id }; i = 1; }
  else if (termOf(t0)) { ast.analysis = { kind: 'term', id: termOf(t0) }; i = 1; }
  else if (t0.type === 'treatment') { ast.analysis = { kind: 'treatment', id: t0.id }; i = 1; }
  else if (t0.type === 'prefixed' && t0.field === 'tx' && t0.values.length === 1 && !t0.bad.length) {
    ast.analysis = { kind: 'treatment', id: t0.values[0] }; i = 1;
  } else ast.analysis = { kind: 'analysis', id: 'overview', implicit: true };

  let state = 'cohort';
  let target = ast.cohorts[0].filters;
  let last = null;
  let pendingOr = null;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'operator') {
      if (pendingOr) { err('or_dangling', pendingOr); pendingOr = null; }
      if (t.id === 'vs') {
        if (state !== 'cohort') err('vs_position', t);
        else {
          const cur = ast.cohorts[ast.cohorts.length - 1];
          if (!cur.filters.length && !cur.all) err('empty_cohort', t);
          ast.cohorts.push({ filters: [], all: false });
          target = ast.cohorts[ast.cohorts.length - 1].filters;
        }
        last = null;
      } else if (t.id === 'among') {
        if (state === 'among') err('among_twice', t);
        else if (state === 'by') err('among_after_by', t);
        state = 'among'; target = ast.among; last = null;
      } else if (t.id === 'by') {
        if (ast.by) err('by_twice', t);
        const nx = tokens[i + 1];
        if (nx?.type === 'facet') { ast.by = { kind: 'facet', id: nx.id }; i++; }
        else if (termOf(nx)) { ast.by = { kind: 'term', id: termOf(nx) }; i++; }
        else err('facet_expected', nx || t);
        state = 'by'; last = null;
      } else {                                            // with, without
        const nx = tokens[i + 1];
        const code = termOf(nx);
        if (!code) { err('term_expected', nx || t); continue; }
        if (state === 'by') { err('after_by', nx); i++; continue; }
        const f = { field: 'term', values: [code], state: t.id === 'with' ? 'present' : 'absent' };
        target.push(f); last = f; i++;
      }
      continue;
    }
    switch (t.type) {
      case 'or':
        if (!last || pendingOr) err('or_dangling', t); else pendingOr = t;
        break;
      case 'option':
        if (!t.known) err('unknown_option', t, { key: t.key });
        else if (!OPTIONS[t.key](t.value)) err('bad_option_value', t, { key: t.key, value: t.value });
        else ast.options[t.key] = t.value;
        break;
      case 'analysis': case 'lab': case 'example':
        err('analysis_position', t, { word: t.text });
        break;
      case 'facet':
        err('unknown_word', t, { word: t.text, suggestions: [] });
        break;
      case 'all':
        if (state === 'cohort') ast.cohorts[ast.cohorts.length - 1].all = true; else err('all_position', t);
        break;
      case 'unknown':
        err('unknown_word', t, { word: t.text, suggestions: t.suggestions || [] });
        break;
      default: {
        if (state === 'by') { err('after_by', t); break; }
        for (const b of t.bad || []) err('unknown_value', t, { field: t.field, value: b.raw, suggestions: b.suggestions });
        const fs = tokenFilters(t) || [];
        if (!fs.length) break;
        if (pendingOr) {
          const f = fs[0];
          if (fs.length === 1 && last && f.field === last.field && !last.alias && f.state === last.state) {
            for (const v of f.values) if (!last.values.includes(v)) last.values.push(v);
          } else err('or_mismatch', t);
          pendingOr = null;
        } else {
          target.push(...fs);
          last = fs[fs.length - 1];
        }
      }
    }
  }
  if (pendingOr) err('or_dangling', pendingOr);

  // checks on the whole query
  const lastCohort = ast.cohorts[ast.cohorts.length - 1];
  if (ast.cohorts.length > 1 && !lastCohort.filters.length && !lastCohort.all) err('empty_cohort', tokens[tokens.length - 1]);
  for (const filters of [...ast.cohorts.map((c) => c.filters), ast.among]) {
    const seen = {};
    for (const f of filters) {
      if (!FIELDS[f.field]?.single) continue;
      if (seen[f.field]) err('single_twice', null, { field: f.field });
      seen[f.field] = true;
    }
  }
  const def = ANALYSIS_BY_ID[ast.analysis.kind === 'analysis' ? ast.analysis.id : ast.analysis.kind];
  const usesClusters = ast.by?.id === 'cluster' || [...ast.cohorts.flatMap((c) => c.filters), ...ast.among].some((f) => f.field === 'cluster');
  for (const key of Object.keys(ast.options)) {
    if (key === 'k' && usesClusters) continue;            // k= picks the clustering of "by cluster" and "cluster:"
    if (!def.options.includes(key)) warn('option_ignored', null, { key, analysis: def.id });
  }
  ast.ok = !diagnostics.some((d) => d.level === 'error');
  return ast;
}
