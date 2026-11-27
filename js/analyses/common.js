// Shared pieces of the analyses: series (cohorts x groups of "by"), colours, tables, footnotes.
import { selectCohorts, splitBy, termState } from '../cohort/filter.js';
import { filtersText } from '../query/format.js';
import { PALETTE, GREY, esc, pct } from '../charts/svg.js';
import { getLang, strings } from '../i18n/strings.js';
import { groupLabel } from '../ui/describe.js';

export const MIN_N = 5;          // series smaller than this are drawn in grey
export const MAX_SERIES = 12;    // series drawn in a figure (all are in the tables and the CSV)
export const T = (en, fr) => (getLang() === 'fr' ? fr : en);
export { termState, esc, pct };

const plain = (html) => String(html).replace(/<[^>]+>/g, '');

/** One series per cohort, or per cohort x group of "by". defaultBy is used when the query has no "by". */
export function buildSeries(q, defaultBy = null) {
  const { ast, ctx, L } = q;
  const S = strings();
  const sel = selectCohorts(ast, ctx);
  const sub = ast.options.sub !== 'off';
  const by = ast.by || (defaultBy && sel.length === 1 && !sel[0].cohort.filters.length ? defaultBy : null);
  const series = [];
  let overlap = false, unavailable = false;
  sel.forEach((s, ci) => {
    const base = s.cohort.filters.length ? filtersText(s.cohort.filters, L) : S.allPatients;
    if (by) {
      const sp = splitBy(s.members, by, ctx, sub, s.alphi);
      if (!sp || sp.unavailable) { unavailable = true; return; }
      overlap ||= sp.overlap;
      for (const g of sp.groups) {
        const gl = plain(groupLabel(by, g.key, L, ctx.release));
        series.push({ label: sel.length > 1 ? `${base} · ${gl}` : gl, members: g.members, key: g.key, cohort: ci });
      }
    } else series.push({ label: base, members: s.members, cohort: ci });
  });
  let k = 0;
  for (const s of series) {
    s.n = s.members.length;
    s.small = s.n < MIN_N;
    s.colour = s.small || s.key === null ? GREY : PALETTE[k++ % PALETTE.length];
    s.dash = s.small;
  }
  return { series, sel, sub, overlap, unavailable, by, among: ast.among, k: ast.options.k };
}

/** The series drawn in figures: the largest MAX_SERIES; note when some are left out. */
export function drawn(series) {
  if (series.length <= MAX_SERIES) return { list: series, note: '' };
  const list = [...series].sort((a, b) => b.n - a.n).slice(0, MAX_SERIES);
  return { list: series.filter((s) => list.includes(s)), note: T(`Figure: the ${MAX_SERIES} largest of ${series.length} groups; all are in the table.`,
    `Figure : les ${MAX_SERIES} plus grands des ${series.length} groupes ; tous figurent dans le tableau.`) };
}

export const swatch = (s) => `<span class="swatch" style="background:${s.colour}"></span>`;

export function table(headers, rows, cls = '') {
  return `<div class="table-wrap"><table class="data ${cls}"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr>${r.map((c, j) => `<td${j ? ' class="num"' : ''}>${c ?? '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export const nOf = (k, n) => `${k}/${n}`;
export const share = (k, n, d = 0) => (n ? `${k} (${pct(k / n, d)})` : '–');
export const fmt = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(getLang() === 'fr' ? 'fr-FR' : 'en-GB'));
export const pval = (p) => {
  if (p == null || !Number.isFinite(p)) return '–';
  const v = p < 0.001 ? '< 0.001' : p.toFixed(3);
  return getLang() === 'fr' ? v.replace('.', ',') : v;
};
/** "p = 0.012" or "p < 0.001". */
export const pEq = (p) => { const v = pval(p); return v.startsWith('<') ? `p ${v}` : `p = ${v}`; };

/** Which ALPHI run and clustering a cohort was read in. */
export function alphiNote(sel, kAsked = null) {
  const a = sel.alphi;
  const n = a.run.ids ? sel.members.filter((pp) => a.run.pos.has(pp.p.id)).length : 0;
  return strings().alphiNote(a.run, n, a.rank, a.how, a.kMissing, kAsked ?? a.rank.k);
}

export function seriesNotes(info) {
  const notes = [];
  if (info.overlap) notes.push(strings().overlapNote);
  if (info.series.some((s) => s.small)) notes.push(T(`Groups of fewer than ${MIN_N} patients are drawn in grey, dashed.`, `Les groupes de moins de ${MIN_N} patients sont tracés en gris, en pointillés.`));
  if (info.unavailable) notes.push(strings().clusterLater);
  const usesClusters = info.by?.id === 'cluster' || info.sel.some((s) => [...s.cohort.filters, ...(info.among || [])].some((f) => f.field === 'cluster'));
  if (usesClusters) for (const s of info.sel) if (s.alphi) notes.push(alphiNote(s, info.k));
  return notes;
}

export const statsNote = () => T('Tests are given on request (stats=on): literature cohorts are selected samples, and p-values are descriptive.',
  'Tests sur demande (stats=on) : les cohortes issues de la littérature sont des échantillons sélectionnés ; les valeurs de p sont descriptives.');
