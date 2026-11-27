// Tests of the analyses: every card runs and gives well-formed figures; counts agree with reference.json
// (written by the Python build); the PFIC survival curve agrees with scipy.stats.ecdf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './release.mjs';
import { parse } from '../js/query/parse.js';
import { quoteIfNeeded } from '../js/query/text.js';
import { runAnalysis } from '../js/analyses/index.js';
import { setLang } from '../js/i18n/strings.js';
import { tierKey } from '../js/cohort/prepare.js';
import { POOL } from '../js/ui/examples.js';

const { rel, L, ctx, reference: ref } = await load();

function run(q) {
  const ast = parse(q, L);
  assert.ok(ast.ok, `${q}: ${ast.diagnostics?.map((d) => d.code).join(', ')}`);
  return runAnalysis(ast, ctx, L);
}
const dis = (d) => `dis:${quoteIfNeeded(d)}`;
const bigDiseases = Object.entries(rel.lexicon.diseases).filter(([, v]) => v.n >= 10).map(([d]) => d);

const QUERIES = [
  'PFIC', 'PFIC vs MVID', 'by gene', 'phenomeprint MVID vs MVID+PFIC', 'phenomeprint PFIC2 style=arc mark=HP:0001396',
  'survival PFIC by gene stats=on', 'onset MYO5B by zygosity stats=on', 'symptoms THES1 vs THES2 stats=on', 'symptoms PFIC by gene top=15',
  'cholestasis', 'pruritus by gene stats=on', 'variants ABCB11 vs ABCB4 stats=on', 'zygosity PFIC by gene', 'cadd PFIC by gene',
  'sex ARC syndrome vs THES2 stats=on', 'birth PFIC by gene', 'ALT PFIC by gene', 'ALT PFIC by gene x=onset', 'treatments PFIC',
  'odevixibat by gene', 'patients MVID', 'articles MYO5B', 'clusters MYO5B', 'survival MYO5B by cholestasis',
];

for (const lang of ['en', 'fr']) {
  test(`every analysis runs (${lang})`, async () => {
    setLang(lang);
    for (const q of QUERIES) {
      const out = await run(q);
      assert.ok(out && typeof out.html === 'string', q);
      for (const f of out.figures || []) {
        assert.match(f.svg, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"/, `${q}: ${f.name}`);
        assert.ok(!/NaN|undefined/.test(f.svg), `${q}: ${f.name} contains NaN or undefined`);
      }
      assert.ok(!/NaN|undefined/.test(out.html), `${q}: table contains NaN or undefined`);
    }
    setLang('en');
  });
}

test('survival: patients with status and age, and deaths, as in reference.json', () => {
  for (const d of bigDiseases) {
    const r = ref.survival[d];
    const out = run(`survival ${dis(d)}`);
    const steps = out.csv.rows;
    if (!r.available) { assert.equal(steps.length, 0, d); continue; }
    assert.equal(steps[0].at_risk, r.available, d);
    assert.equal(steps.reduce((a, s) => a + s.deaths, 0), r.deaths, d);
  }
});

test('survival of PFIC agrees with scipy.stats.ecdf', { skip: rel.id !== '261013' }, () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/scipy_km_pfic.json', import.meta.url)));
  const steps = run('survival dis:PFIC').csv.rows;
  const at = (y) => steps.filter((s) => s.age_years <= y).at(-1);
  assert.equal(steps[0].at_risk, fx.n);
  for (const [y, s] of Object.entries(fx.at)) assert.ok(Math.abs(at(+y).survival - s) < 1e-9, `S(${y})`);
  assert.ok(Math.abs(at(5).lo95 - fx.ci5[0]) < 1e-6 && Math.abs(at(5).hi95 - fx.ci5[1]) < 1e-6, 'CI at 5 years');
});

test('onset: patients with an onset age and median, as in reference.json', () => {
  for (const d of bigDiseases) {
    const r = ref.onset[d] || { available: 0 };
    const rows = run(`onset ${dis(d)}`).csv.rows;
    assert.equal(rows.length, r.available, d);
    if (!r.available) continue;
    const v = rows.map((x) => x.onset_months).sort((a, b) => a - b);
    const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    assert.ok(Math.abs(m - r.median_m) < 1e-9, d);
  }
});

test('sex and CADD tiers of missense alleles, as in reference.json', () => {
  for (const d of bigDiseases) {
    const sx = Object.fromEntries(run(`sex ${dis(d)}`).csv.rows.map((x) => [x.category, x.count]));
    assert.equal(sx.M, ref.sex[d].M || 0, `${d} boys`);
    assert.equal(sx.F, ref.sex[d].F || 0, `${d} girls`);
    const cd = Object.fromEntries(run(`cadd ${dis(d)}`).csv.rows.map((x) => [x.category, x.count]));
    for (const t of rel.lexicon.cadd_tiers) assert.equal(cd[tierKey(t.tier)], ref.cadd_tiers_alleles[d]?.missense?.[t.tier] || 0, `${d} ${t.tier}`);
  }
});

test('symptoms: most reported terms with subterms, as in reference.json', () => {
  for (const [d, top] of Object.entries(ref.top_terms)) {
    const q = rel.lexicon.diseases[d] ? dis(d) : d;
    const rows = run(`symptoms ${q} top=40`).csv.rows;
    const byCode = new Map(rows.map((x) => [x.hpo, x]));
    for (const t of top.slice(0, 5)) {
      const r = byCode.get(t.hp);
      assert.ok(r, `${d}: ${t.hp} missing`);
      assert.equal(r.present, t.present, `${d}: ${t.hp} present`);
      assert.equal(r.absent, t.absent, `${d}: ${t.hp} absent`);
    }
  }
});

test('term card: sub=off counts the term as reported', () => {
  const t = ref.top_terms.PFIC[0];
  const on = run(`${t.hp} PFIC`).csv.rows[0];
  const off = run(`${t.hp} PFIC sub=off`).csv.rows[0];
  assert.equal(on.present, t.present);
  assert.equal(off.present, t.present_exact);
});

test('phenomeprint: node counts never exceed the cohort and parents carry their children', () => {
  const rows = run('phenomeprint MVID').csv.rows;
  const byNode = new Map(rows.map((r) => [r.node, r]));
  for (const r of rows) {
    assert.ok(r.count <= r.n);
    const p = byNode.get(r.parent);
    if (p) assert.ok(p.count >= r.count, `${r.term} > ${p.term}`);
  }
});

test('every example chip and every query of the example pool runs', async () => {
  for (const q of POOL) {
    const out = await run(q);
    assert.ok(out && (out.figures?.length || out.html), q);
  }
});
