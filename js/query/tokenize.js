// Tokenizer: query text -> typed tokens, by longest match against the lexicon.
// The same tokens drive the pills under the query bar, so what is shown is what is parsed.
import { norm } from './text.js';
import { OPTIONS } from './vocab.js';

/** Splits the text: spaces separate, double quotes group, a comma or "|" stands alone. */
function scan(input) {
  const parts = [];
  let cur = null;
  let inQuote = false;
  const flush = (end) => {
    if (cur && cur.text.length) { cur.end = end; parts.push(cur); }
    cur = null;
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' || ch === '“' || ch === '”') {
      if (!cur) cur = { text: '', start: i, quoted: false };
      cur.quoted = true;
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) { flush(i); continue; }
    if (!inQuote && (ch === ',' || ch === '|')) {
      if (ch === ',' && cur && /^[^:=\s]+[:=]/.test(cur.text)) { cur.text += ch; continue; }  // gene:A,B or mark=a,b
      flush(i);
      parts.push({ text: ch, start: i, end: i + 1, special: ch === ',' ? 'or' : 'among' });
      continue;
    }
    if (!cur) cur = { text: '', start: i, quoted: false };
    cur.text += ch;
  }
  flush(input.length);
  return parts;
}

function resolveValue(field, raw, L) {
  const v = raw.trim();
  const n = norm(v);
  switch (field) {
    case 'disease': return L.diseaseByNorm.get(n);
    case 'gene': return L.geneByNorm.get(n);
    case 'tx': return L.txByNorm.get(n);
    case 'term': {
      const m = v.match(/^(?:hp:)?(\d{1,7})$/i);
      if (m) {
        const code = 'HP:' + m[1].padStart(7, '0');
        return L.release.hpo[code] ? code : undefined;
      }
      return L.lookup(v).find((c) => c.type === 'term')?.id;
    }
    case 'cluster': return /^\d+$/.test(v) ? v : undefined;
    case 'year': {
      const m = v.match(/^(\d{4})(?:-(\d{4}))?$/);
      if (!m) return undefined;
      const [a, b] = [+m[1], +(m[2] || m[1])].sort((x, y) => x - y);
      return a === b ? `${a}` : `${a}-${b}`;
    }
    case 'doi': return v.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, '').toLowerCase() || undefined;
    default: return L.fieldValues.get(field)?.get(n);
  }
}

const FIELD_TYPE = { disease: 'disease', gene: 'gene', tx: 'treatment', term: 'term' };

function fieldSuggestions(field, raw, L) {
  const type = FIELD_TYPE[field] || 'value';
  return L.suggest(raw, 12).filter((s) => s.type === type && (type !== 'value' || s.field === field)).slice(0, 3);
}

function fromCandidates(cands, text, start, end) {
  const [best, ...alts] = cands;
  return { ...best, text, start, end, alts };
}

/** Tokens: {type, id, field, values, text, start, end, alts, suggestions}. */
export function tokenize(input, L) {
  const parts = scan(String(input ?? ''));
  const tokens = [];
  let expectFacet = false;
  for (let i = 0; i < parts.length;) {
    const p = parts[i];
    if (p.special === 'or') { tokens.push({ type: 'or', text: ',', start: p.start, end: p.end }); i++; continue; }
    if (p.special === 'among') { tokens.push({ type: 'operator', id: 'among', text: '|', start: p.start, end: p.end }); i++; continue; }

    const opt = !p.quoted && p.text.match(/^([a-z]+)=(.*)$/i);
    if (opt) {
      const key = opt[1].toLowerCase();
      tokens.push({ type: 'option', key, value: opt[2].trim().toLowerCase(), known: key in OPTIONS, text: p.text, start: p.start, end: p.end });
      i++; continue;
    }
    const pre = p.text.match(/^([^:\s]+):(.+)$/s);
    if (pre && L.fieldPrefix.has(norm(pre[1]))) {
      const field = L.fieldPrefix.get(norm(pre[1]));
      const raws = pre[2].split(',').map((s) => s.trim()).filter(Boolean);
      const values = [];
      const bad = [];
      for (const r of raws) {
        const v = resolveValue(field, r, L);
        if (v === undefined) bad.push({ raw: r, suggestions: fieldSuggestions(field, r, L) });
        else if (!values.includes(v)) values.push(v);
      }
      tokens.push({ type: 'prefixed', field, values, bad, text: p.text, start: p.start, end: p.end });
      expectFacet = false;
      i++; continue;
    }

    // longest match over a run of plain words; a quoted part is one phrase
    let run = 0;
    if (!p.quoted) while (i + run < parts.length && !parts[i + run].special && !parts[i + run].quoted
                          && !/[=:]/.test(parts[i + run].text.slice(1))) run++;
    const maxLen = p.quoted ? 1 : Math.max(1, Math.min(L.maxWords, run));
    let done = false;
    for (let len = maxLen; len >= 1 && !done; len--) {
      const slice = parts.slice(i, i + len);
      const phrase = slice.map((s) => s.text).join(' ');
      const start = slice[0].start;
      const end = slice[slice.length - 1].end;
      if (expectFacet && L.facetDict.has(norm(phrase))) {
        tokens.push({ type: 'facet', id: L.facetDict.get(norm(phrase)), text: phrase, start, end });
        i += len; done = true; break;
      }
      const cands = L.lookup(phrase);
      if (cands.length) {
        tokens.push(fromCandidates(cands, phrase, start, end));
        i += len; done = true; break;
      }
    }
    if (!done) {
      tokens.push({ type: 'unknown', text: p.text, start: p.start, end: p.end, suggestions: L.suggest(p.text) });
      i++;
    }
    const last = tokens[tokens.length - 1];
    expectFacet = last.type === 'operator' && last.id === 'by';
  }
  return tokens;
}
