// ALPHI cluster card: the clustering of the run a cohort is read in (UMAP, phenomeprints, cluster table,
// genes by cluster), with ALPHI's own stability and symptom lists. The coordinates and symptom lists of a run
// are fetched on demand, so run(q) returns a promise.
import { embedding } from '../charts/charts.js';
import { phenomeprints } from '../charts/phenomeprint.js';
import { PALETTE, GREY, pct } from '../charts/svg.js';
import { canonical } from '../query/format.js';
import { getLang } from '../i18n/strings.js';
import { nodeCounts } from './core.js';
import { table, fmt, esc, T } from './common.js';
import { selectCohorts } from '../cohort/filter.js';

const NOISE = '#b8b8b8';
const colourOf = (id) => (id < 0 ? NOISE : PALETTE[id % PALETTE.length]);
const clusterName = (id) => (id < 0 ? T('noise', 'bruit') : `${T('cluster', 'groupe')} ${id}`);
const verdict = (j) => (j == null ? '–' : j >= 0.75 ? T('stable', 'stable') : j <= 0.5 ? T('not supported', 'non soutenu') : T('intermediate', 'intermédiaire'));
const runLabel = (run) => run.label[getLang()] || run.label.en;

function topCounts(list, n = 3) {
  const c = new Map();
  for (const x of list) c.set(x, (c.get(x) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
}

/** A link that runs a query in a new card (handled by the page; the href works too). */
export function queryLink(ast, L, change, text) {
  const q = canonical({ ...ast, ...change, options: { ...(change.options || ast.options) } }, L);
  return q ? `<a href="?q=${encodeURIComponent(q)}" data-q="${esc(q)}">${esc(text || q)}</a>` : '';
}

async function section(q, s, ci, nCohorts) {
  const { ast, ctx, L } = q;
  const { run, rank, index, how, kMissing } = s.alphi;
  const detail = await ctx.release.clusterDetail(run);
  const dr = detail.ranks[index] || { clusters: [] };
  const inQuery = new Set(s.members.map((pp) => pp.p.id));
  const subset = run.ids.some((id) => !inQuery.has(id));
  const ids = rank.clusters.map((c) => c.id).sort((a, b) => (a < 0) - (b < 0) || a - b);

  // patients of the run by cluster
  const by = new Map(ids.map((id) => [id, { all: [], query: [] }]));
  run.ids.forEach((pid, j) => {
    const id = rank.labels[j];
    if (id == null || !by.has(id)) return;
    const pp = ctx.byId.get(pid);
    by.get(id).all.push({ pp, xy: detail.xy[j] });
    if (inQuery.has(pid)) by.get(id).query.push(pp);
  });
  const nQuery = [...by.values()].reduce((a, g) => a + g.query.length, 0);
  const minSym = (run.settings.match(/--min-symptoms[\s=]+(\d+)/) || [])[1];

  // figure 1: UMAP
  const others = [];
  const series = ids.map((id) => {
    const g = by.get(id);
    const pts = [];
    for (const { pp, xy } of g.all) {
      if (!xy) continue;
      const pt = { x: xy[0], y: xy[1], title: `${pp.p.id} · ${clusterName(id)} · ${(pp.p.gene || []).join(', ')} · ${(pp.p.dis || []).join(', ')}` };
      (inQuery.has(pp.p.id) ? pts : others).push(pt);
    }
    return { label: `${clusterName(id)} (${g.all.length})`, colour: colourOf(id), points: pts, tag: id >= 0 ? String(id) : null, opacity: id < 0 ? 0.6 : 0.8 };
  });
  if (others.length) series.unshift({ label: T('other patients of the run', 'autres patients de l’analyse'), colour: '#dcdcdc', points: others, opacity: 0.9, r: 2.6 });
  const title = `${runLabel(run)} · k = ${rank.k}`;
  const figures = [{ name: `alphi_${run.key.slice(0, 60)}_k${rank.k}_umap`, svg: embedding({ series, title }),
    note: T('Each point is a patient, placed by the UMAP embedding of ALPHI; colours: clusters of the clustering shown, grey: noise.',
      'Chaque point est un patient, placé selon la projection UMAP d’ALPHI ; couleurs : groupes de la partition affichée, gris : bruit.') }];

  // figure 2: phenomeprints of the clusters (all their patients: the clusters as ALPHI found them)
  const layout = ctx.release.layout;
  const shown = ids.filter((id) => id >= 0 && by.get(id).all.length).slice(0, 12);
  if (layout && shown.length) {
    const panels = shown.map((id) => { const m = by.get(id).all.map((x) => x.pp); return { label: clusterName(id), n: m.length, counts: nodeCounts(m, layout) }; });
    figures.push({ name: `alphi_${run.key.slice(0, 60)}_k${rank.k}_phenomeprints`,
      svg: phenomeprints({ layout, panels, size: shown.length <= 2 ? 400 : shown.length <= 4 ? 300 : 220, title: `Phenomeprints · ${title}` }),
      note: ids.filter((id) => id >= 0).length > shown.length ? T('Phenomeprints of the first 12 clusters.', 'Phénomeprints des 12 premiers groupes.') : '' });
  }

  // table 1: clusters
  const meta = new Map(rank.clusters.map((c) => [c.id, c]));
  const det = new Map(dr.clusters.map((c) => [c.id, c]));
  const assoc = (id) => (det.get(id)?.associated || []).slice()
    .sort((a, b) => (typeof a[3] === 'number' ? a[3] : 0) - (typeof b[3] === 'number' ? b[3] : 0)).slice(0, 5)
    .map(([c, inC, rest]) => `${esc(L.termLabel(c))} <span class="muted">${T(`${fmt(inC, 0)}% vs ${fmt(rest, 0)}%`, `${fmt(inC, 0)} % contre ${fmt(rest, 0)} %`)}</span>`).join('<br>');
  const headers = [T('Cluster', 'Groupe'), T('Patients', 'Patients'), ...(subset ? [T('Of the query', 'De la requête')] : []),
    T('Stability (mean Jaccard)', 'Stabilité (Jaccard moyen)'), T('Dissolved', 'Dissous'), T('Genes', 'Gènes'), T('Diseases', 'Maladies'),
    T('Associated symptoms (ALPHI: cluster vs rest of the run)', 'Symptômes associés (ALPHI : groupe vs reste de l’analyse)')];
  const rows = ids.map((id) => {
    const g = by.get(id), mt = meta.get(id) || {};
    const genes = topCounts(g.all.flatMap((x) => x.pp.p.gene || [])).map(([k, n]) => `<i>${esc(k)}</i> ${n}`).join(', ');
    const dis = topCounts(g.all.flatMap((x) => x.pp.p.dis || [])).map(([k, n]) => `${esc(k)} ${n}`).join(', ');
    return [`<span class="swatch" style="background:${colourOf(id)}"></span>${esc(clusterName(id))}${mt.few_features ? ` <span class="warning" title="${esc(T('Separated from its closest cluster by few symptoms', 'Séparé du groupe le plus proche par peu de symptômes'))}">⚑</span>` : ''}`,
      g.all.length, ...(subset ? [g.query.length] : []),
      id < 0 ? '–' : mt.stability == null ? '–' : `${fmt(mt.stability, 2)} (${verdict(mt.stability)})`,
      id < 0 || mt.dissolved == null ? '–' : pct(mt.dissolved), genes || '–', dis || '–', id < 0 ? '–' : assoc(id) || '–'];
  });

  // table 2: genes by cluster (all patients of the run)
  const runPP = run.ids.map((id) => ctx.byId.get(id)).filter(Boolean);
  const genes = topCounts(runPP.flatMap((pp) => pp.p.gene || []), 40).map(([g]) => g);
  const has = (pp, gname) => (pp.p.gene || []).includes(gname);
  const gRows = genes.map((gname) => [`<i>${esc(gname)}</i>`, ...ids.map((id) => by.get(id).all.filter((x) => has(x.pp, gname)).length || ''),
    runPP.filter((pp) => has(pp, gname)).length]);
  const gTable = table([T('Gene', 'Gène'), ...ids.map((id) => esc(clusterName(id))), T('Total', 'Total')], gRows, 'crosstab');

  // other eligible clusterings, follow-up queries
  const others2 = run.ranks.map((r) => (r === rank ? `<strong>k = ${r.k}</strong>` : queryLink(ast, L, { options: { ...ast.options, k: String(r.k) } }, `k = ${r.k}`))).join(' · ');
  const keep = { k: rank === run.ranks[0] ? undefined : String(rank.k) };
  if (!keep.k) delete keep.k;
  const follow = ['symptoms', 'survival', 'onset', 'overview'].map((id) => queryLink(ast, L, { analysis: { kind: 'analysis', id }, by: { kind: 'facet', id: 'cluster' }, options: keep })).join(' · ');
  const csv = run.ids.map((pid, j) => {
    const pp = ctx.byId.get(pid);
    return { cohort: nCohorts > 1 ? ci + 1 : '', run: run.key, k: rank.k, id: pid, cluster: rank.labels[j] ?? '', umap_1: detail.xy[j]?.[0] ?? '', umap_2: detail.xy[j]?.[1] ?? '',
      in_query: inQuery.has(pid) ? 1 : 0, genes: (pp?.p.gene || []).join('; '), diseases: (pp?.p.dis || []).join('; ') };
  });
  const head = `<h3 class="run">${esc(runLabel(run))} <span class="muted">· ${run.n} ${T('patients', 'patients')} · k = ${rank.k}</span></h3>
    <p class="small">${T('Eligible clusterings', 'Partitions éligibles')} (${T('first: ALPHI’s choice', 'la première : choix d’ALPHI')}): ${others2}</p>
    ${kMissing ? `<p class="warning">${T(`No eligible clustering with k = ${esc(ast.options.k)}; ALPHI’s choice is shown.`, `Aucune partition éligible à k = ${esc(ast.options.k)} ; le choix d’ALPHI est affiché.`)}</p>` : ''}
    ${how === 'most' ? `<p class="small muted">${T('No run has exactly the genes of the cohort: shown is the run holding most of its patients. Another run: name its genes, e.g.', 'Aucune analyse n’a exactement les gènes de la cohorte : l’analyse affichée est celle qui contient le plus de ses patients. Une autre analyse : nommer ses gènes, p. ex.')} <code>clusters gene:${esc(run.genes.slice(0, 2).join(','))}</code>.</p>` : ''}`;
  const tail = `<p class="small">${T('Compare the clusters', 'Comparer les groupes')}: ${follow}</p>`;
  const notes = [
    nQuery < s.members.length ? T(`Patients of the cohort in the run: ${nQuery} of ${s.members.length}; the others were not in the input of the run${minSym ? ` (fewer than ${minSym} symptoms, or other genes)` : ''}.`,
      `Patients de la cohorte dans l’analyse : ${nQuery} sur ${s.members.length} ; les autres n’étaient pas dans l’entrée de l’analyse${minSym ? ` (moins de ${minSym} symptômes, ou autres gènes)` : ''}.`) : '',
    T('Stability: mean Jaccard recovery of the cluster over resampled runs (≥ 0.75 stable, ≤ 0.5 not supported); dissolved: share of resamples in which the cluster was not found. ⚑: separated from its closest cluster by few symptoms.',
      'Stabilité : recouvrement de Jaccard moyen du groupe sur les rééchantillonnages (≥ 0,75 stable, ≤ 0,5 non soutenu) ; dissous : part des rééchantillonnages où le groupe n’est pas retrouvé. ⚑ : séparé du groupe le plus proche par peu de symptômes.'),
    `${T('Settings of the run', 'Paramètres de l’analyse')}: ${run.settings || '–'}${ctx.release.clusters?.alphi ? ` · ALPHI ${ctx.release.clusters.alphi}` : ''}.`,
  ];
  return { figures, before: head, after: table(headers, rows, 'clusters') + `<h4>${T('Genes by cluster', 'Gènes par groupe')}</h4>` + gTable + tail, csv, notes };
}

export const clusters = {
  async run(q) {
    const sel = q.ctx.release.clusters ? selectCohorts(q.ast, q.ctx) : [];
    if (!sel.length || !sel.some((s) => s.alphi)) {
      return { figures: [], html: `<p class="muted">${q.ctx.release.clusters
        ? T('No ALPHI run of this release holds the patients of the query.', 'Aucune analyse ALPHI de cette version ne contient les patients de la requête.')
        : T('This release has no ALPHI results.', 'Cette version n’a pas de résultats ALPHI.')}</p>` };
    }
    const parts = [];
    for (const [ci, s] of sel.entries()) {
      if (s.alphi) parts.push(await section(q, s, ci, sel.length));
      else parts.push({ figures: [], before: `<p class="muted">${T('No ALPHI run holds the patients of this cohort.', 'Aucune analyse ALPHI ne contient les patients de cette cohorte.')}</p>`, after: '', csv: [], notes: [] });
    }
    return { figures: parts.flatMap((p) => p.figures), sections: parts.map((p) => ({ before: p.before, figures: p.figures, after: p.after })),
      html: '', csv: { name: 'alphi_clusters', rows: parts.flatMap((p) => p.csv) }, notes: [...new Set(parts.flatMap((p) => p.notes))] };
  },
};
