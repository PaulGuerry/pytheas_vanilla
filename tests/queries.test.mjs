// Golden tests of the query language and of cohort selection.   node --test tests/
// Counts are checked against data/<release>/reference.json, written by build/build_release.py
// (an independent implementation in Python), so the tests hold for any release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './release.mjs';
import { parse } from '../js/query/parse.js';
import { canonical } from '../js/query/format.js';
import { selectCohorts, splitBy } from '../js/cohort/filter.js';

const { L, ctx, reference: ref } = await load();

const fstr = (f) => `${f.field}${f.state === 'absent' ? '!' : '='}${f.values.join('|')}`;
const summary = (ast) => ({
  a: ast.analysis.kind === 'analysis' ? ast.analysis.id : `${ast.analysis.kind}:${ast.analysis.id ?? ''}`,
  c: ast.cohorts.map((c) => [...(c.all ? ['all'] : []), ...c.filters.map(fstr).sort()]),
  among: ast.among.map(fstr).sort(),
  by: ast.by ? `${ast.by.kind}:${ast.by.id}` : null,
  o: ast.options,
});
const errors = (ast) => ast.diagnostics.filter((d) => d.level === 'error').map((d) => d.code);
const n = (q) => selectCohorts(parse(q, L), ctx).map((s) => s.members.length);
const quoted = (s) => `"${s}"`;

// [query, canonical form, analysis, cohorts, extra checks]
const CASES = [
  // queries of the audit of pytheas_vanilla (16 Sep 2026)
  ['survival ATP8B1 PFIC boys', 'survival PFIC ATP8B1 boys', 'survival', [['disease=PFIC', 'gene=ATP8B1', 'sex=M']]],
  ['CADD score PFIC1', 'cadd PFIC1', 'cadd', [['disease=PFIC', 'gene=ATP8B1']]],
  ['CADD score PFIC1 boys', 'cadd PFIC1 boys', 'cadd', [['disease=PFIC', 'gene=ATP8B1', 'sex=M']]],
  ['ALT newborn period', 'ALT newborn', 'lab:ALT', [['onset=newborn']]],
  ['longitudinal weight', 'weight', 'lab:weight', [[]]],
  ['survival MVID+PFIC', 'survival MVID+PFIC', 'survival', [['disease=MVID+PFIC']]],
  ['survival MVID vs MVID+PFIC', 'survival MVID vs MVID+PFIC', 'survival', [['disease=MVID'], ['disease=MVID+PFIC']]],
  ['ABCB4', 'ABCB4', 'overview', [['gene=ABCB4']]],
  ['survival PFIC homozygous', 'survival PFIC homozygous', 'survival', [['disease=PFIC', 'zyg=homozygous']]],
  ['onset PFIC missense', 'onset PFIC missense', 'onset', [['disease=PFIC', 'var=missense']]],
  ['survival PFIC2 vs PFIC3', 'survival PFIC2 vs PFIC3', 'survival', [['disease=PFIC', 'gene=ABCB11'], ['disease=PFIC', 'gene=ABCB4']]],
  ['survie PFIC garçons', 'survival PFIC boys', 'survival', [['disease=PFIC', 'sex=M']]],
  ['ALT PFIC', 'ALT PFIC', 'lab:ALT', [['disease=PFIC']]],
  ['weight PFIC', 'weight PFIC', 'lab:weight', [['disease=PFIC']]],
  ['poids PFIC', 'weight PFIC', 'lab:weight', [['disease=PFIC']]],
  ['survival LSR deficiency', 'survival LSR deficiency', 'survival', [['disease=LSR deficiency']]],
  ['treatments PFIC', 'treatments PFIC', 'treatments', [['disease=PFIC']]],
  ['survival THES1 vs THES2', 'survival THES1 vs THES2', 'survival', [['disease=THES1'], ['disease=THES2']]],
  ['survival FARSA deficiency', 'survival FARSA deficiency', 'survival', [['disease=FARSA deficiency']]],
  // examples of the design document
  ['PFIC', 'PFIC', 'overview', [['disease=PFIC']]],
  ['survival PFIC by gene', 'survival PFIC by gene', 'survival', [['disease=PFIC']], { by: 'facet:gene' }],
  ['survival PFIC2 vs PFIC3 among boys', 'survival PFIC2 vs PFIC3 among boys', 'survival',
    [['disease=PFIC', 'gene=ABCB11'], ['disease=PFIC', 'gene=ABCB4']], { among: ['sex=M'] }],
  ['survie PFIC2 contre PFIC3 parmi garçons', 'survival PFIC2 vs PFIC3 among boys', 'survival',
    [['disease=PFIC', 'gene=ABCB11'], ['disease=PFIC', 'gene=ABCB4']], { among: ['sex=M'] }],
  ['survival PFIC2 vs PFIC3 | girls', 'survival PFIC2 vs PFIC3 among girls', 'survival',
    [['disease=PFIC', 'gene=ABCB11'], ['disease=PFIC', 'gene=ABCB4']], { among: ['sex=F'] }],
  ['onset MYO5B by zygosity', 'onset MYO5B by zygosity', 'onset', [['gene=MYO5B']], { by: 'facet:zygosity' }],
  ['symptoms THES1 vs THES2', 'symptoms THES1 vs THES2', 'symptoms', [['disease=THES1'], ['disease=THES2']]],
  ['symptoms PFIC by gene top=15', 'symptoms PFIC by gene top=15', 'symptoms', [['disease=PFIC']], { by: 'facet:gene', o: { top: '15' } }],
  ['cholestasis by gene', 'Cholestasis by gene', 'term:HP:0001396', [[]], { by: 'facet:gene' }],
  ['HP:0001396 by gene', 'Cholestasis by gene', 'term:HP:0001396', [[]], { by: 'facet:gene' }],
  ['survival MYO5B by cholestasis', 'survival MYO5B by Cholestasis', 'survival', [['gene=MYO5B']], { by: 'term:HP:0001396' }],
  ['ALT PFIC by gene x=onset', 'ALT PFIC by gene x=onset', 'lab:ALT', [['disease=PFIC']], { by: 'facet:gene', o: { x: 'onset' } }],
  ['odevixibat by gene', 'odevixibat by gene', 'treatment:odevixibat', [[]], { by: 'facet:gene' }],
  ['patients MVID year:2015-2026', 'patients MVID year:2015-2026', 'patients', [['disease=MVID', 'year=2015-2026']]],
  ['clusters MYO5B', 'clusters MYO5B', 'clusters', [['gene=MYO5B']]],
  ['survival MYO5B by cluster', 'survival MYO5B by cluster', 'survival', [['gene=MYO5B']], { by: 'facet:cluster' }],
  ['phenomeprint PFIC by gene', 'phenomeprint PFIC by gene', 'phenomeprint', [['disease=PFIC']], { by: 'facet:gene' }],
  // grammar
  ['gene:ABCB11,ABCB4 boys', 'gene:ABCB11,ABCB4 boys', 'overview', [['gene=ABCB11|ABCB4', 'sex=M']]],
  ['ABCB11, ABCB4', 'gene:ABCB11,ABCB4', 'overview', [['gene=ABCB11|ABCB4']]],
  ['PFIC boys,girls', 'PFIC sex:M,F', 'overview', [['disease=PFIC', 'sex=M|F']]],
  ['dis:"ARC syndrome",PFIC by disease', 'dis:"ARC syndrome",PFIC by disease', 'overview', [['disease=ARC syndrome|PFIC']], { by: 'facet:disease' }],
  ['survival all vs PFIC', 'survival all vs PFIC', 'survival', [['all'], ['disease=PFIC']]],
  ['survival', 'survival', 'survival', [[]]],
  ['all', 'all', 'overview', [['all']]],
  ['by gene', 'by gene', 'overview', [[]], { by: 'facet:gene' }],
  ['MYO5B with "failure to thrive" without cholestasis', 'MYO5B with Failure to thrive without Cholestasis', 'overview',
    [['gene=MYO5B', 'term=HP:0001508', 'term!HP:0001396']]],
  ['MYO5B diarrhea', null, 'overview', [['gene=MYO5B', 'term=HP:0002014']]],
  ['cadd:pp3 PFIC', 'PFIC cadd:pp3', 'overview', [['disease=PFIC', 'cadd=pp3']]],
  ['PFIC cons:yes dead', 'PFIC dead consanguineous', 'overview', [['disease=PFIC', 'status=dead', 'cons=yes']]],
  ['UDCA PFIC', 'UDCA PFIC', 'treatment:UDCA', [['disease=PFIC']]],
  ['survival PFIC tx:UDCA', 'survival PFIC UDCA', 'survival', [['disease=PFIC', 'tx=UDCA']]],
  ['survival PFIC 2 vs PFIC 3', 'survival PFIC2 vs PFIC3', 'survival', [['disease=PFIC', 'gene=ABCB11'], ['disease=PFIC', 'gene=ABCB4']]],
  ['sexe PFIC par gène', 'sex PFIC by gene', 'sex', [['disease=PFIC']], { by: 'facet:gene' }],
  ['début MVID+PFIC vs mixed', 'onset MVID+PFIC vs mixed', 'onset', [['disease=MVID+PFIC'], ['disease=mixed']]],
  ['zyg:compound MYO5B', 'MYO5B compound', 'overview', [['gene=MYO5B', 'zyg=compound']]],
  ['survival PFIC by decade', 'survival PFIC by decade', 'survival', [['disease=PFIC']], { by: 'facet:decade' }],
  ['PFIC ABCB11 by sex sub=off', 'PFIC ABCB11 by sex sub=off', 'overview', [['disease=PFIC', 'gene=ABCB11']], { by: 'facet:sex', o: { sub: 'off' } }],
  ['help survival', 'help survival', 'help', [[]]],
  ['help', 'help', 'help', [[]]],
  ['example', 'example', 'example:', [[]]],
];

for (const [q, canon, a, cohorts, extra = {}] of CASES) {
  test(`parse: ${q}`, () => {
    const ast = parse(q, L);
    assert.deepEqual(errors(ast), [], `errors: ${JSON.stringify(ast.diagnostics)}`);
    const s = summary(ast);
    assert.equal(s.a, a);
    if (a !== 'help' && !a.startsWith('example')) assert.deepEqual(s.c, cohorts.map((c) => [...c.filter((x) => x === 'all'), ...c.filter((x) => x !== 'all').sort()]));
    if (extra.by !== undefined) assert.equal(s.by, extra.by);
    if (extra.among) assert.deepEqual(s.among, [...extra.among].sort());
    if (extra.o) assert.deepEqual(s.o, extra.o);
    const c = canonical(ast, L);
    if (canon !== null) assert.equal(c, canon);
    // round trip: the canonical form reads back as the same query
    const again = parse(c, L);
    assert.deepEqual(errors(again), []);
    assert.deepEqual(summary(again), s);
    assert.equal(canonical(again, L), c);
  });
}

// [query, error codes]
const ERRORS = [
  ['survival PFIC boys girls', ['single_twice']],
  ['survival vs PFIC', ['empty_cohort']],
  ['survival PFIC vs', ['empty_cohort']],
  ['survival PFIC by', ['facet_expected']],
  ['survival PFIC by boys', ['facet_expected', 'after_by']],
  ['survival PFIC with', ['term_expected']],
  ['PFIC, ABCB11', ['or_mismatch']],
  ['PFIC ,', ['or_dangling']],
  ['gene:ABCB11,PFIC', ['unknown_value']],
  ['PFIC dis:ARC', ['unknown_value']],
  ['ALT PFIC top=abc', ['bad_option_value']],
  ['PFIC xyz=1', ['unknown_option']],
  ['survival PFIC survival', ['analysis_position']],
  ['survival foo', ['unknown_word']],
  ['longitudinal PFIC', ['lab_expected']],
  ['survival PFIC by gene among boys', ['among_after_by']],
  ['survival PFIC by gene by sex', ['by_twice']],
  ['example PFIC', ['example_alone']],
  ['', ['empty']],
];
for (const [q, codes] of ERRORS) {
  test(`error: ${JSON.stringify(q)}`, () => {
    const ast = parse(q, L);
    assert.deepEqual(errors(ast), codes);
    assert.equal(canonical(ast, L), null);
  });
}

test('suggestions for misspelled words and values', () => {
  const s = (q) => parse(q, L).diagnostics[0].suggestions.map((x) => x.text);
  assert.ok(s('cholestsis by gene').includes('Cholestasis'));
  assert.ok(s('survival PFIC dis:ARC').includes('ARC syndrome'));
  assert.ok(s('survival ABCB1 boys').includes('ABCB11'));
  assert.deepEqual(errors(parse('survival FARSA', L)), []);   // FARSA is a gene: no error
});

test('no word is replaced by another entity (FARSA is not FARSB)', () => {
  const ast = parse('survival FARSA deficiency', L);
  assert.deepEqual(summary(ast).c, [['disease=FARSA deficiency']]);
});

test('option not used by the analysis gives a warning only', () => {
  const ast = parse('survival PFIC top=3', L);
  assert.ok(ast.ok);
  assert.deepEqual(ast.diagnostics.map((d) => d.code), ['option_ignored']);
});

// ---- counts against reference.json ----------------------------------------------------------
test('every disease label: n', () => {
  for (const [d, expected] of Object.entries(ref.by_disease)) {
    if (d === '(no label)') continue;
    assert.deepEqual(n(`dis:${quoted(d)}`), [expected], d);
  }
});

test('every gene: n', () => {
  for (const [g, expected] of Object.entries(ref.by_gene)) assert.deepEqual(n(`gene:${g}`), [expected], g);
});

test('every disease x gene pair: n', () => {
  for (const [pair, expected] of Object.entries(ref.by_disease_gene)) {
    const [d, g] = pair.split('|');
    assert.deepEqual(n(`dis:${quoted(d)} gene:${g}`), [expected], pair);
  }
});

test('sex per disease, and by-sex splits', () => {
  for (const [d, counts] of Object.entries(ref.sex)) {
    if (d === '(no label)') continue;
    assert.deepEqual(n(`dis:${quoted(d)} sex:M`), [counts.M || 0], `${d} M`);
    assert.deepEqual(n(`dis:${quoted(d)} sex:F`), [counts.F || 0], `${d} F`);
    const ast = parse(`dis:${quoted(d)} by sex`, L);
    const groups = splitBy(selectCohorts(ast, ctx)[0].members, ast.by, ctx).groups;
    const got = Object.fromEntries(groups.map((g) => [g.key ?? 'unknown', g.members.length]));
    assert.deepEqual(got, Object.fromEntries(Object.entries(counts).filter(([, v]) => v > 0)), d);
  }
});

test('terms: present with subterms, exact, absent (true-path rule) per disease', () => {
  for (const [d, rows] of Object.entries(ref.top_terms)) {
    if (d === '(no label)') continue;
    for (const r of rows) {
      const base = `dis:${quoted(d)}`;
      assert.deepEqual(n(`${base} with ${r.hp}`), [r.present], `${d} ${r.hp} present`);
      assert.deepEqual(n(`${base} with ${r.hp} sub=off`), [r.present_exact], `${d} ${r.hp} exact`);
      assert.deepEqual(n(`${base} without ${r.hp}`), [r.absent], `${d} ${r.hp} absent`);
    }
  }
});

test('CADD tiers of missense alleles per disease', () => {
  for (const [d, tiers] of Object.entries(ref.cadd_tiers_alleles)) {
    if (d === '(no label)') continue;
    const members = selectCohorts(parse(`dis:${quoted(d)}`, L), ctx)[0].members;
    const got = {};
    for (const pp of members) for (const t of pp.tiers) if (t) got[t] = (got[t] || 0) + 1;
    const want = Object.fromEntries(Object.entries(tiers.missense).map(([k, v]) => [k.toLowerCase().replace('_', '-'), v]));
    assert.deepEqual(got, want, d);
  }
});

test('phenomeprint organ systems per disease', () => {
  for (const [d, organs] of Object.entries(ref.phenomeprint.organ_counts)) {
    for (const [o, expected] of Object.entries(organs)) assert.deepEqual(n(`dis:${quoted(d)} with ${o}`), [expected], `${d} ${o}`);
  }
});
