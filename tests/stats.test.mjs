// Statistics against scipy 1.18 (tests/fixtures/scipy_reference.json).   node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fisher2x2, chi2test, chi2sf, km, logrank, bh, describe, loess } from '../js/stats/stats.js';

const ref = JSON.parse(await readFile(new URL('./fixtures/scipy_reference.json', import.meta.url), 'utf8'));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test('Fisher exact, two-sided', () => {
  for (const [[a, b, c, d], p] of ref.fisher) close(fisher2x2(a, b, c, d), p, 1e-9, `${a} ${b} ${c} ${d}`);
});

test('chi-square test of independence and survival function', () => {
  for (const [t, chi2, df, p] of ref.chi2) {
    const r = chi2test(t);
    close(r.chi2, chi2, 1e-9, 'chi2'); assert.equal(r.df, df); close(r.p, p, 1e-8, 'p');
  }
  for (const [x, df, p] of ref.chi2sf) close(chi2sf(x, df), p, 1e-9, `sf(${x}, ${df})`);
});

test('Kaplan-Meier with log(-log) confidence interval', () => {
  for (const c of ref.km) {
    const k = km(c.times, c.events);
    c.at.forEach((t, i) => {
      const s = k.at(t);
      close(s.s, c.s[i], 1e-9, `S(${t})`);
      if (c.lo[i] != null && c.hi[i] != null && c.s[i] < 1 && c.s[i] > 0) {
        close(s.lo, c.lo[i], 1e-6, `lo(${t})`);
        close(s.hi, c.hi[i], 1e-6, `hi(${t})`);
      }
    });
  }
});

test('log-rank test, two groups', () => {
  for (const [groups, chi2, p] of ref.logrank) {
    const r = logrank(groups);
    close(r.chi2, chi2, 1e-8, 'chi2'); close(r.p, p, 1e-8, 'p');
  }
});

test('Benjamini-Hochberg, quantiles, LOESS', () => {
  assert.deepEqual(bh([0.01, 0.04, 0.03, 0.2]).map((x) => +x.toFixed(4)), [0.04, 0.0533, 0.0533, 0.2]);
  assert.deepEqual(describe([5, 1, 3, 2, 4]), { n: 5, median: 3, q1: 2, q3: 4, min: 1, max: 5 });
  const xs = Array.from({ length: 50 }, (_, i) => i), ys = xs.map((x) => 2 * x + 1);
  for (const p of loess(xs, ys)) close(p.y, 2 * p.x + 1, 1e-9, 'loess on a line');
});
