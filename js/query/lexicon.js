// Builds the dictionary of the query language from a release (lexicon.json + hpo.json.gz) and the vocabulary.
import { norm, levenshtein } from './text.js';
import { OPERATORS, ALL_WORDS, EXAMPLE_WORDS, FIELDS, FACETS, LAB_ALIASES } from './vocab.js';
import { ANALYSES } from '../analyses/registry.js';

/** When one phrase has several readings, the lowest number wins (reserved words first, HPO terms last). */
export const PRIORITY = { operator: 0, all: 0, example: 0, analysis: 1, lab: 2, pfic: 3, gene: 4, disease: 5, value: 6, treatment: 7, term: 8 };

export function buildLexicon(release) {
  const lx = release.lexicon;
  const hpo = release.hpo;
  const dict = new Map();          // norm(phrase) -> candidates, best first
  const entries = [];              // for autocomplete: {key, text, type, id, n}

  const add = (phrase, cand, complete = true) => {
    const key = norm(phrase);
    if (!key) return;
    const list = dict.get(key) || [];
    if (!list.some((c) => c.type === cand.type && c.id === cand.id && c.field === cand.field)) list.push(cand);
    dict.set(key, list);
    if (complete) entries.push({ key, text: phrase, ...cand });
  };

  for (const [op, words] of Object.entries(OPERATORS)) words.forEach((w) => add(w, { type: 'operator', id: op }, false));
  ALL_WORDS.forEach((w) => add(w, { type: 'all', id: 'all' }, false));
  EXAMPLE_WORDS.forEach((w) => add(w, { type: 'example', id: 'example' }, false));
  for (const a of ANALYSES) {
    if (!a.names) continue;
    for (const w of [...a.names.en, ...a.names.fr]) add(w, { type: 'analysis', id: a.id }, !a.implicit);
  }
  for (const [v, info] of Object.entries(lx.labs || {})) {
    add(v, { type: 'lab', id: v, n: info.patients });
    for (const alias of LAB_ALIASES[v] || []) add(alias, { type: 'lab', id: v, n: info.patients });
  }
  for (const [alias, x] of Object.entries(lx.pfic_aliases || {})) {
    if (!lx.genes[x.gene]) continue;
    const n = lx.diseases[x.disease]?.by?.[x.gene] || 0;
    add(alias, { type: 'pfic', id: alias, disease: x.disease, gene: x.gene, n });
    add(alias.replace(/(\d+)$/, ' $1'), { type: 'pfic', id: alias, disease: x.disease, gene: x.gene, n }, false);
  }
  for (const [g, info] of Object.entries(lx.genes || {})) add(g, { type: 'gene', id: g, n: info.n });
  for (const [d, info] of Object.entries(lx.diseases || {})) add(d, { type: 'disease', id: d, n: info.n });
  for (const [field, f] of Object.entries(FIELDS)) {
    for (const alias of f.bare || []) {
      const value = Object.keys(f.values).find((v) => f.values[v].includes(alias));
      if (value) add(alias, { type: 'value', field, id: value });
    }
  }
  for (const [name, info] of Object.entries(lx.treatments || {})) add(name, { type: 'treatment', id: name, n: info.patients });
  for (const [code, counts] of Object.entries(lx.terms || {})) {
    const node = hpo[code];
    if (!node || !(counts[1] > 0 || counts[2] > 0)) continue;
    const cand = { type: 'term', id: code, n: counts[1] };
    if (node.l) add(node.l, cand);
    for (const s of node.s || []) add(s, cand);
  }
  for (const list of dict.values()) list.sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type] || (b.n || 0) - (a.n || 0));

  const facetDict = new Map();
  for (const [facet, words] of Object.entries(FACETS)) words.forEach((w) => facetDict.set(norm(w), facet));
  const fieldPrefix = new Map();
  for (const [field, f] of Object.entries(FIELDS)) f.prefixes.forEach((p) => fieldPrefix.set(norm(p), field));
  const fieldValues = new Map();
  for (const [field, f] of Object.entries(FIELDS)) {
    if (!f.values) continue;
    const m = new Map();
    for (const [v, aliases] of Object.entries(f.values)) { m.set(norm(v), v); aliases.forEach((a) => m.set(norm(a), v)); }
    fieldValues.set(field, m);
  }
  const diseaseByNorm = new Map(Object.keys(lx.diseases || {}).map((d) => [norm(d), d]));
  const geneByNorm = new Map(Object.keys(lx.genes || {}).map((g) => [norm(g), g]));
  const txByNorm = new Map(Object.keys(lx.treatments || {}).map((t) => [norm(t), t]));
  let maxWords = 1;
  for (const k of dict.keys()) maxWords = Math.max(maxWords, k.split(' ').length);
  const keys = [...dict.keys()];

  /** Closest dictionary phrases to an unknown word: edit distance, then prefix. */
  function suggest(word, limit = 3) {
    const w = norm(word);
    if (!w) return [];
    const max = w.length <= 4 ? 1 : 2;
    const scored = [];
    for (const k of keys) {
      let d = levenshtein(w, k, max);
      if (d > max && w.length >= 3 && k.startsWith(w)) d = max + 0.5;
      if (d <= max + 0.5) {
        const c = dict.get(k)[0];
        if (c.type !== 'operator') scored.push({ key: k, d, c });
      }
    }
    scored.sort((a, b) => a.d - b.d || (b.c.n || 0) - (a.c.n || 0));
    const seen = new Set();
    const out = [];
    for (const s of scored) {
      const id = `${s.c.type}|${s.c.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ text: display(s.c), type: s.c.type, id: s.c.id, field: s.c.field });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Autocomplete: phrases starting with the prefix, or with a word starting with it. */
  function complete(prefix, limit = 8) {
    const p = norm(prefix);
    if (p.length < 2) return [];
    const hits = [];
    for (const e of entries) {
      const at = e.key.startsWith(p) ? 0 : e.key.includes(' ' + p) ? 1 : -1;
      if (at >= 0) hits.push({ ...e, at });
    }
    hits.sort((a, b) => a.at - b.at || PRIORITY[a.type] - PRIORITY[b.type] || (b.n || 0) - (a.n || 0) || a.key.length - b.key.length);
    const seen = new Set();
    const out = [];
    for (const h of hits) {
      const id = `${h.type}|${h.id}|${h.field || ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ text: h.text, label: h.type === 'value' ? h.text : display(h), type: h.type, id: h.id, field: h.field, n: h.n });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Display text of an entity. */
  function display(c) {
    if (c.type === 'term') return hpo[c.id]?.l || c.id;
    if (c.type === 'value') return FIELDS[c.field].show?.[c.id] || c.id;
    return c.id;
  }

  return {
    release, dict, facetDict, fieldPrefix, fieldValues, diseaseByNorm, geneByNorm, txByNorm, maxWords,
    lookup: (phrase) => dict.get(norm(phrase)) || [],
    suggest, complete, display,
    termLabel: (code) => hpo[code]?.l || code,
  };
}
