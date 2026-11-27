// Plain-language description of a parsed query, in the language shown.
import { strings } from '../i18n/strings.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

export function describeFilter(f, L) {
  const S = strings();
  const join = (xs) => xs.join(` ${S.or} `);
  switch (f.field) {
    case 'disease': return join(f.values.map(esc));
    case 'gene': return join(f.values.map((g) => `<i>${esc(g)}</i>`));
    case 'sex': case 'zyg': case 'status': case 'cons': case 'onset':
      return join(f.values.map((v) => esc(S.values[f.field][v] || v)));
    case 'var': return `${join(f.values.map(esc))} ${S.field.var}`;
    case 'cadd': return `${S.field.cadd} ${join(f.values.map((v) => esc(v.toUpperCase())))}`;
    case 'tx': return `${S.field.tx} ${join(f.values.map(esc))}`;
    case 'term': return `${S.values.term[f.state]} ${join(f.values.map((c) => esc(L.termLabel(c))))}`;
    case 'year': return `${S.field.year} ${join(f.values.map(esc))}`;
    case 'doi': return `${S.field.doi} ${join(f.values.map(esc))}`;
    case 'cluster': return `${S.field.cluster} ${join(f.values.map(esc))}`;
    default: return esc(f.values.join(', '));
  }
}

export function describeFilters(filters, L, all = false) {
  if (!filters.length) return esc(strings().allPatients);
  const seen = new Set();
  const parts = [];
  for (const f of filters) {
    if (f.alias) {
      if (seen.has(f.alias)) continue;
      seen.add(f.alias);
      const g = filters.find((x) => x.alias === f.alias && x.field === 'gene');
      parts.push(`${esc(f.alias)} (PFIC, <i>${esc(g.values[0])}</i>)`);
    } else parts.push(describeFilter(f, L));
  }
  return (all ? `${esc(strings().allPatients)} · ` : '') + parts.join(' · ');
}

export function analysisTitle(a, L) {
  const S = strings();
  if (a.kind === 'lab') return `${S.analysisNames.lab}: ${esc(a.id)}`;
  if (a.kind === 'term') return `${S.analysisNames.term}: ${esc(L.termLabel(a.id))}`;
  if (a.kind === 'treatment') return `${S.analysisNames.treatment}: ${esc(a.id)}`;
  return S.analysisNames[a.id] || a.id;
}

export function groupLabel(by, key, L, release) {
  const S = strings();
  if (by.kind !== 'term' && by.id === 'cluster') return key === null ? S.notClustered : key === -1 ? S.noise : `${S.clusterWord} ${key}`;
  if (key === null) return S.notReported;
  if (by.kind === 'term') return S.values.termGroup[key];
  switch (by.id) {
    case 'gene': return `<i>${esc(key)}</i>`;
    case 'sex': return S.values.sex[key];
    case 'zygosity': return S.values.zyg[key];
    case 'status': return S.values.status[key];
    case 'consanguinity': return S.values.cons[key];
    case 'onset': return S.values.onset[key] || key;
    case 'cadd': return esc(key.toUpperCase());
    default: return esc(key);
  }
}
