// ALPHI results on the site: run of a cohort, cluster filters and splits, cluster card.
// Uses tests/fixtures/alphi (the release's own results are not needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWithClusters } from './release.mjs';
import { parse } from '../js/query/parse.js';
import { canonical } from '../js/query/format.js';
import { selectCohorts } from '../js/cohort/filter.js';
import { buildSeries } from '../js/analyses/common.js';
import { runAnalysis } from '../js/analyses/index.js';

const { L, ctx } = await loadWithClusters();
const P = (q) => { const ast = parse(q, L); assert.ok(ast.ok, `${q}: ${ast.diagnostics.map((d) => d.code)}`); return ast; };
const run = (key) => ctx.runs.find((r) => r.key === key);

test('every patient of the fixture is in the release, and every clustering labels every patient', () => {
  for (const r of ctx.runs) {
    for (const id of r.ids) assert.ok(ctx.byId.has(id), id);
    for (const k of r.ranks) {
      assert.equal(k.labels.length, r.ids.length);
      assert.equal(k.clusters.reduce((a, c) => a + c.n, 0), r.ids.filter((_, j) => k.labels[j] != null).length);
    }
  }
});

test('run of a cohort: exact gene set first, else the run holding most of its patients', () => {
  assert.equal(selectCohorts(P('clusters MYO5B'), ctx)[0].alphi.run.key, 'MYO5B');
  assert.equal(selectCohorts(P('clusters MYO5B'), ctx)[0].alphi.how, 'genes');
  const s = selectCohorts(P('clusters gene:SKIC3,SKIC2'), ctx)[0];
  assert.equal(s.alphi.run.key, 'SKIC2_SKIC3');
  const m = selectCohorts(P('clusters MVID'), ctx)[0];
  assert.equal(m.alphi.run.key, 'MYO5B');
  assert.equal(m.alphi.how, 'most');
  assert.equal(selectCohorts(P('clusters THES1'), ctx)[0].alphi.run.key, 'SKIC2_SKIC3');
  assert.equal(selectCohorts(P('clusters KARS1'), ctx)[0].alphi, null);
});

test('k= picks an eligible clustering; another k falls back to ALPHI’s choice', () => {
  const r = run('MYO5B');
  const other = r.ranks[1];
  const a = selectCohorts(P(`clusters MYO5B k=${other.k}`), ctx)[0].alphi;
  assert.equal(a.rank, other);
  const b = selectCohorts(P('clusters MYO5B k=99'), ctx)[0].alphi;
  assert.equal(b.rank, r.ranks[0]);
  assert.ok(b.kMissing);
  assert.ok(!P(`survival MYO5B by cluster k=${other.k}`).diagnostics.some((d) => d.code === 'option_ignored'));
  assert.ok(P('survival MYO5B k=4').diagnostics.some((d) => d.code === 'option_ignored'));
});

test('by cluster and cluster: give the sizes of the clustering', () => {
  const r = run('MYO5B');
  const rank = r.ranks[0];
  const info = buildSeries({ ast: P('survival MYO5B by cluster'), ctx, L });
  for (const c of rank.clusters) {
    const s = info.series.find((x) => x.key === c.id);
    assert.equal(s.members.length, c.n, `cluster ${c.id}`);
    if (c.id >= 0) assert.equal(selectCohorts(P(`MYO5B cluster:${c.id}`), ctx)[0].members.length, c.n);
  }
  const outside = info.series.find((x) => x.key === null);
  const all = selectCohorts(P('MYO5B'), ctx)[0].members.length;
  assert.equal(outside?.members.length || 0, all - r.ids.length);
  const among = selectCohorts(P(`onset MYO5B among cluster:${rank.clusters.at(-1).id} by sex`), ctx)[0];
  assert.equal(among.members.length, rank.clusters.at(-1).n);
});

test('cluster card: figures, tables, CSV and follow-up queries', async () => {
  const ast = P('clusters MYO5B');
  const out = await runAnalysis(ast, ctx, L);
  assert.equal(out.sections.length, 1);
  assert.ok(out.figures.length >= 1);
  for (const f of out.figures) assert.ok(!/NaN|undefined/.test(f.svg), f.name);
  const html = out.sections.map((s) => s.before + s.after).join('');
  assert.ok(!/NaN|undefined/.test(html));
  assert.equal(out.csv.rows.length, run('MYO5B').n);
  const links = [...html.matchAll(/data-q="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.ok(links.length >= 4);
  for (const q of links) assert.ok(P(q).ok, q);
  assert.ok(links.includes('symptoms MYO5B by cluster'));
  const two = await runAnalysis(P('clusters MYO5B vs gene:SKIC2,SKIC3'), ctx, L);
  assert.equal(two.sections.length, 2);
  assert.equal(canonical(P('clusters MYO5B k=6'), L), 'clusters MYO5B k=6');
});
