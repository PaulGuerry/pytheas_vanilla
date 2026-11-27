// Cohort selection from a parsed query, and the splits of "by".
import { resolveRun, rankOf, clusterOf } from './clusters.js';

const CADD_GROUPS = { pp3: ['pp3-moderate', 'pp3-supporting'], bp4: ['bp4-supporting', 'bp4-moderate', 'bp4-strong'] };
const TIER_ORDER = ['pp3-moderate', 'pp3-supporting', 'indeterminate', 'bp4-supporting', 'bp4-moderate', 'bp4-strong'];

/** State of a term in a patient: present (term or a subterm), absent (term or an ancestor reported absent), or null. */
export function termState(pp, code, ctx, sub = true) {
  if ((sub ? pp.present : pp.exact).has(code)) return 'present';
  if (sub ? ctx.ancOrSelf(code).some((a) => pp.absent.has(a)) : pp.absent.has(code)) return 'absent';
  return null;
}

function matcher(f, ctx, sub) {
  const v = f.values;
  switch (f.field) {
    case 'disease': return (pp) => v.some((x) => pp.p.dis?.includes(x));
    case 'gene': return (pp) => v.some((x) => pp.p.gene?.includes(x));
    case 'sex': return (pp) => v.includes(pp.p.sex);
    case 'zyg': return (pp) => v.includes(pp.p.zyg);
    case 'var': return (pp) => (pp.p.al || []).some((a) => v.includes(a.type));
    case 'cadd': {
      const set = new Set(v.flatMap((x) => CADD_GROUPS[x] || [x]));
      return (pp) => pp.tiers.some((t) => t && set.has(t));
    }
    case 'onset': return (pp) => v.includes(pp.period);
    case 'status': return (pp) => v.includes(pp.p.status);
    case 'cons': return (pp) => v.includes(pp.p.cons === true ? 'yes' : pp.p.cons === false ? 'no' : null);
    case 'tx': return (pp) => (pp.p.tx || []).some((t) => v.includes(t.name));
    case 'term': return (pp) => v.some((c) => termState(pp, c, ctx, sub) === f.state);
    case 'year': {
      const ranges = v.map((y) => y.split('-').map(Number)).map(([a, b]) => [a, b ?? a]);
      return (pp) => (pp.p.art || []).some((a) => a.year && ranges.some(([lo, hi]) => a.year >= lo && a.year <= hi));
    }
    case 'doi': return (pp) => (pp.p.art || []).some((a) => v.includes((a.doi || '').toLowerCase()));
    case 'cluster': return () => true;            // applied in selectCohorts, once the run of the cohort is known
    default: return () => false;
  }
}

/** Members of each cohort of a query (filters of the cohort AND those after "among"). */
export function selectCohorts(ast, ctx) {
  const sub = ast.options.sub !== 'off';
  return ast.cohorts.map((c) => {
    const filters = [...c.filters, ...ast.among];
    const tests = filters.filter((f) => f.field !== 'cluster').map((f) => matcher(f, ctx, sub));
    let members = ctx.prepped.filter((pp) => tests.every((t) => t(pp)));
    const alphi = resolveRun(c.filters.filter((f) => f.field !== 'cluster'), members, ctx);
    if (alphi) Object.assign(alphi, rankOf(alphi.run, ast.options.k));
    const cl = filters.filter((f) => f.field === 'cluster');
    if (cl.length) {
      members = alphi ? members.filter((pp) => {
        const id = clusterOf(alphi.run, alphi.rank, pp.p.id);
        return id !== null && cl.every((f) => (f.values.includes(String(id))) !== (f.state === 'absent'));
      }) : [];
    }
    return { cohort: c, members, alphi };
  });
}

function groupBy(members, keysOf, order = 'n') {
  const groups = new Map();
  for (const pp of members) {
    const keys = [...new Set(keysOf(pp))];
    for (const k of keys.length ? keys : [null]) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(pp);
    }
  }
  const out = [...groups.entries()].map(([key, m]) => ({ key, members: m }));
  const rank = (k) => (Array.isArray(order) ? (order.includes(k) ? order.indexOf(k) : order.length) : 0);
  out.sort((a, b) => (a.key === null) - (b.key === null) || rank(a.key) - rank(b.key)
    || (order === 'alpha' ? String(a.key).localeCompare(String(b.key)) : b.members.length - a.members.length || String(a.key).localeCompare(String(b.key))));
  const overlap = out.reduce((s, g) => s + g.members.length, 0) > members.length;
  return { groups: out, overlap };
}

/** Subgroups of "by". key null = value not reported. */
export function splitBy(members, by, ctx, sub = true, alphi = null) {
  if (!by) return null;
  if (by.kind === 'term') {
    return groupBy(members, (pp) => [termState(pp, by.id, ctx, sub)], ['present', 'absent']);
  }
  const lex = ctx.release.lexicon;
  switch (by.id) {
    case 'gene': return groupBy(members, (pp) => pp.p.gene || []);
    case 'disease': return groupBy(members, (pp) => pp.p.dis || []);
    case 'sex': return groupBy(members, (pp) => (pp.p.sex ? [pp.p.sex] : []), ['M', 'F']);
    case 'zygosity': return groupBy(members, (pp) => (pp.p.zyg ? [pp.p.zyg] : []), ['homozygous', 'compound', 'heterozygous']);
    case 'variant': return groupBy(members, (pp) => (pp.p.al || []).map((a) => a.type).filter(Boolean));
    case 'cadd': return groupBy(members, (pp) => pp.tiers.filter(Boolean), TIER_ORDER);
    case 'onset': return groupBy(members, (pp) => (pp.period ? [pp.period] : []), lex.onset_periods.map((p) => p.key));
    case 'status': return groupBy(members, (pp) => (pp.p.status ? [pp.p.status] : []), ['alive', 'dead']);
    case 'consanguinity': return groupBy(members, (pp) => (pp.p.cons === true ? ['yes'] : pp.p.cons === false ? ['no'] : []), ['yes', 'no']);
    case 'decade': return groupBy(members, (pp) => (pp.year ? [`${Math.floor(pp.year / 10) * 10}s`] : []), 'alpha');
    case 'cluster': {
      if (!alphi) return { groups: [], overlap: false, unavailable: true };
      const order = [...alphi.rank.clusters.map((c) => c.id).filter((id) => id >= 0), -1];
      return groupBy(members, (pp) => { const id = clusterOf(alphi.run, alphi.rank, pp.p.id); return id === null ? [] : [id]; }, order);
    }
    default: return null;
  }
}
