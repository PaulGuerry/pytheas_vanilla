// Per-patient sets computed once when a release is loaded: terms with their ancestors (true-path rule),
// CADD tier of each allele, onset period, first publication year.

/** CADD tiers are given to missense alleles only (the PP3/BP4 calibration of Pejaver et al. 2022). */
export const CADD_MISSENSE_ONLY = true;

export const tierKey = (tier) => tier.toLowerCase().replace('_', '-');

export function prepare(release) {
  const { hpo, lexicon, patients } = release;
  const memo = new Map();
  const ancestors = (code) => {
    if (memo.has(code)) return memo.get(code);
    const out = new Set();
    memo.set(code, out);                       // guard against cycles
    for (const p of hpo[code]?.p || []) {
      out.add(p);
      for (const a of ancestors(p)) out.add(a);
    }
    return out;
  };
  const ancOrSelf = (code) => [code, ...ancestors(code)];
  const tiers = lexicon.cadd_tiers;
  const tierOf = (s) => {
    for (const t of tiers) if (t.min === null || s > t.min || (t.min_inclusive && s === t.min)) return tierKey(t.tier);
    return null;
  };
  const periods = lexicon.onset_periods;
  const periodOf = (m) => periods.find((p) => m >= p.from_m && (p.to_m === null || m < p.to_m))?.key || null;

  const prepped = patients.map((p, i) => {
    const exact = new Set((p.hp || []).map((x) => x[0]));
    const present = new Set();
    for (const c of exact) { present.add(c); for (const a of ancestors(c)) present.add(a); }
    const years = (p.art || []).map((a) => a.year).filter(Boolean);
    return {
      i, p, exact, present,
      absent: new Set(p.abs || []),
      tiers: (p.al || []).map((a) => (a.cadd == null || (CADD_MISSENSE_ONLY && a.type !== 'missense') ? null : tierOf(a.cadd))),
      period: p.onset_m == null ? null : periodOf(p.onset_m),
      year: years.length ? Math.min(...years) : null,
    };
  });
  const byId = new Map(prepped.map((pp) => [pp.p.id, pp]));
  const runs = (release.clusters?.runs || []).map((r) => ({ ...r, geneSet: new Set(r.genes), pos: new Map(r.ids.map((id, j) => [id, j])) }));
  return { prepped, ancestors, ancOrSelf, tierOf, periodOf, release, byId, runs };
}
