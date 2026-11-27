// ALPHI runs: which run a cohort is read in, and the cluster of a patient in it.
//
// A cohort is read in the run of its genes when it has a gene filter naming exactly the genes of a run
// (gene:MYO5B,STX3 = the run of MYO5B + STX3). Otherwise it is read in the run holding most of its
// patients, the smallest of those on a tie (MVID -> the smallest run with most MVID patients; all -> the
// largest run). Option k= picks one of the other eligible clusterings of that run by its number of clusters.

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/** Run of a cohort: {run, how: 'genes' | 'most', inRun} or null. filters = the cohort's own filters, without cluster:. */
export function resolveRun(filters, members, ctx) {
  if (!ctx.runs?.length) return null;
  const genes = filters.filter((f) => f.field === 'gene' && f.state !== 'absent');
  if (genes.length === 1) {
    const set = new Set(genes[0].values);
    const run = ctx.runs.find((r) => sameSet(r.geneSet, set));
    if (run) return { run, how: 'genes', inRun: members.filter((pp) => run.pos.has(pp.p.id)).length };
  }
  let best = null;
  for (const run of ctx.runs) {
    const inRun = members.reduce((n, pp) => n + run.pos.has(pp.p.id), 0);
    if (!inRun) continue;
    if (!best || inRun > best.inRun || (inRun === best.inRun && run.n < best.run.n)) best = { run, how: 'most', inRun };
  }
  return best;
}

/** Clustering of a run: the one with k clusters when asked (and eligible), else the first (ALPHI's choice). */
export function rankOf(run, k) {
  if (k != null) {
    const r = run.ranks.find((x) => x.k === +k);
    if (r) return { rank: r, index: run.ranks.indexOf(r), kMissing: false };
    return { rank: run.ranks[0], index: 0, kMissing: true };
  }
  return { rank: run.ranks[0], index: 0, kMissing: false };
}

/** Cluster of a patient: an id, -1 for noise, null when the patient is not in the run. */
export function clusterOf(run, rank, id) {
  const j = run.pos.get(id);
  return j === undefined ? null : rank.labels[j] ?? null;
}
