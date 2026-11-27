// French form of queries (display) and the Browse, Syntax and About pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWithClusters } from './release.mjs';
import { parse } from '../js/query/parse.js';
import { canonical } from '../js/query/format.js';
import { setLang } from '../js/i18n/strings.js';
import { POOL } from '../js/ui/examples.js';
import { PAGES } from '../js/ui/pages.js';

const { L, ctx } = await loadWithClusters();

const MORE = ['survival PFIC2 vs PFIC3 among boys', 'onset MYO5B among homozygous by sex', 'sex all vs MVID', 'survival PFIC among dead',
  'variants PFIC among var:missense,nonsense by cadd', 'symptoms PFIC among onset:toddler', 'PFIC among cons:no', 'PFIC among consanguineous',
  'MYO5B cluster:1 by decade', 'help survival', 'help', 'example', 'tx:UDCA PFIC', 'patients doi:10.1038/ng.225', 'PFIC year:2015-2020 by status',
  'phenomeprint PFIC2 style=arc mark=HP:0001396', 'clusters MYO5B k=6', 'PFIC among infancy,newborn by consanguinity', 'zygosity MVID by variant'];

test('the French form of a query reads back to the same canonical form', () => {
  for (const q of [...POOL, ...MORE]) {
    const a = parse(q, L);
    assert.ok(a.ok, q);
    const en = canonical(a, L);
    const fr = canonical(a, L, 'fr');
    const b = parse(fr, L);
    assert.ok(b.ok, `${q} -> ${fr}: ${b.diagnostics.map((d) => d.code)}`);
    assert.equal(canonical(b, L), en, `${q} -> ${fr}`);
  }
});

for (const lang of ['en', 'fr']) {
  test(`pages render, and every link of a page is a valid query (${lang})`, () => {
    setLang(lang);
    for (const [name, page] of Object.entries(PAGES)) {
      const html = page({ ctx, L });
      assert.ok(html.length > 500, name);
      assert.ok(!/undefined|NaN|\[object/.test(html), `${name}: undefined, NaN or [object]`);
      const qs = [...html.matchAll(/data-q="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
      if (name !== 'about') assert.ok(qs.length > 10, name);
      for (const q of qs) assert.ok(parse(q, L).ok, `${name}: ${q}`);
    }
    setLang('en');
  });
}
