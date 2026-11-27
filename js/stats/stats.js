// Statistics used by the analyses. Checked against scipy in tests/stats.test.mjs.

// ---- descriptive ---------------------------------------------------------------------------
/** Quantile of sorted values, linear interpolation (R type 7). */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)]) - sorted[lo]);
}

export function describe(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  return { n: v.length, median: quantile(v, 0.5), q1: quantile(v, 0.25), q3: quantile(v, 0.75), min: v[0], max: v[v.length - 1] };
}

// ---- special functions ---------------------------------------------------------------------
const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized upper incomplete gamma Q(a, x). */
function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {                                   // series for P
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 500; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;   // continued fraction for Q
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Survival function of the chi-square distribution. */
export const chi2sf = (x, df) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));

// ---- tests ---------------------------------------------------------------------------------
const lnFact = (n) => lnGamma(n + 1);

/** Two-sided Fisher exact test of a 2 x 2 table [[a, b], [c, d]] (as scipy.stats.fisher_exact). */
export function fisher2x2(a, b, c, d) {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const lnp = (x) => lnFact(r1) + lnFact(r2) + lnFact(c1) + lnFact(n - c1) - lnFact(n)
    - lnFact(x) - lnFact(r1 - x) - lnFact(c1 - x) - lnFact(r2 - c1 + x);
  const pObs = lnp(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const lp = lnp(x);
    if (lp <= pObs + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

/** Pearson chi-square test of independence of a table (rows x columns of counts). */
export function chi2test(table) {
  const rows = table.filter((r) => r.some((x) => x > 0));
  const cols = rows[0].map((_, j) => j).filter((j) => rows.some((r) => r[j] > 0));
  const t = rows.map((r) => cols.map((j) => r[j]));
  const n = t.flat().reduce((s, x) => s + x, 0);
  const rs = t.map((r) => r.reduce((s, x) => s + x, 0));
  const cs = cols.map((_, j) => t.reduce((s, r) => s + r[j], 0));
  let chi2 = 0;
  t.forEach((r, i) => r.forEach((x, j) => { const e = (rs[i] * cs[j]) / n; chi2 += ((x - e) ** 2) / e; }));
  const df = (t.length - 1) * (cols.length - 1);
  return { chi2, df, p: df > 0 ? chi2sf(chi2, df) : 1 };
}

/** Benjamini-Hochberg adjusted p-values. */
export function bh(ps) {
  const idx = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  const q = new Array(ps.length);
  let min = 1;
  for (let k = idx.length - 1; k >= 0; k--) {
    min = Math.min(min, (idx[k][0] * ps.length) / (k + 1));
    q[idx[k][1]] = min;
  }
  return q;
}

// ---- survival ------------------------------------------------------------------------------
/** Kaplan-Meier estimate with 95% confidence interval on the log(-log) scale. */
export function km(times, events, z = 1.959963984540054) {
  const data = times.map((t, i) => [t, events[i] ? 1 : 0]).sort((x, y) => x[0] - y[0]);
  let nRisk = data.length, s = 1, gw = 0;
  const steps = [{ t: 0, s: 1, lo: 1, hi: 1, nRisk, d: 0 }];
  for (let i = 0; i < data.length;) {
    const t = data[i][0];
    let d = 0, c = 0;
    while (i < data.length && data[i][0] === t) { if (data[i][1]) d++; else c++; i++; }
    if (d > 0) {
      s *= 1 - d / nRisk;
      if (nRisk > d) gw += d / (nRisk * (nRisk - d));
      let lo = 0, hi = 0;
      if (s > 0 && s < 1) {
        const se = Math.sqrt(gw) / Math.abs(Math.log(s));
        lo = s ** Math.exp(z * se);
        hi = s ** Math.exp(-z * se);
      } else if (s >= 1) { lo = hi = 1; }
      steps.push({ t, s, lo, hi, nRisk, d });
    }
    nRisk -= d + c;
  }
  const last = data.length ? data[data.length - 1][0] : 0;
  const at = (t) => {
    if (t > last) return null;
    let k = 0;
    while (k + 1 < steps.length && steps[k + 1].t <= t) k++;
    return steps[k];
  };
  const median = steps.find((x) => x.s <= 0.5)?.t ?? null;
  return { steps, n: data.length, events: data.filter((x) => x[1]).length, last, at, median };
}

/** Log-rank test of k groups: [{times, events}]. */
export function logrank(groups) {
  const k = groups.length;
  const all = groups.flatMap((g, gi) => g.times.map((t, i) => [t, g.events[i] ? 1 : 0, gi])).sort((a, b) => a[0] - b[0]);
  const nRisk = groups.map((g) => g.times.length);
  const O = new Array(k).fill(0), E = new Array(k).fill(0);
  const V = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < all.length;) {
    const t = all[i][0];
    const d = new Array(k).fill(0), leave = new Array(k).fill(0);
    while (i < all.length && all[i][0] === t) { d[all[i][2]] += all[i][1]; leave[all[i][2]]++; i++; }
    const D = d.reduce((s, x) => s + x, 0), N = nRisk.reduce((s, x) => s + x, 0);
    if (D > 0 && N > 1) {
      for (let a = 0; a < k; a++) {
        O[a] += d[a];
        E[a] += (D * nRisk[a]) / N;
        for (let b = 0; b < k; b++) {
          V[a][b] += ((a === b ? nRisk[a] * (N - nRisk[a]) : -nRisk[a] * nRisk[b]) * D * (N - D)) / (N * N * (N - 1));
        }
      }
    }
    for (let a = 0; a < k; a++) nRisk[a] -= leave[a];
  }
  const m = k - 1;
  const diff = O.slice(0, m).map((o, a) => o - E[a]);
  const inv = invert(V.slice(0, m).map((r) => r.slice(0, m)));
  if (!inv) return { chi2: NaN, df: m, p: NaN };
  let chi2 = 0;
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) chi2 += diff[a] * inv[a][b] * diff[b];
  return { chi2, df: m, p: chi2sf(chi2, m), observed: O, expected: E };
}

function invert(M) {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const div = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}

// ---- smoothing -----------------------------------------------------------------------------
/** LOESS: local linear regression with tricube weights, evaluated on a grid; optional prior weights per point. */
export function loess(xs, ys, { span = 0.75, points = 60, weights = null } = {}) {
  const n = xs.length;
  if (n < 5) return [];
  const order = xs.map((x, i) => [x, ys[i], weights ? weights[i] : 1]).sort((a, b) => a[0] - b[0]);
  const X = order.map((p) => p[0]), Y = order.map((p) => p[1]), Wt = order.map((p) => p[2]);
  const q = Math.max(3, Math.min(n, Math.round(span * n)));
  const lo = X[0], hi = X[n - 1];
  if (hi === lo) return [];
  const out = [];
  for (let g = 0; g < points; g++) {
    const x0 = lo + ((hi - lo) * g) / (points - 1);
    const dist = X.map((x) => Math.abs(x - x0));
    const h = [...dist].sort((a, b) => a - b)[q - 1] || 1e-9;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const u = dist[i] / (h * 1.0000001);
      if (u >= 1) continue;
      const w = Wt[i] * (1 - u ** 3) ** 3;
      sw += w; sx += w * X[i]; sy += w * Y[i]; sxx += w * X[i] * X[i]; sxy += w * X[i] * Y[i];
    }
    if (sw <= 0) continue;
    const mx = sx / sw, my = sy / sw, vx = sxx / sw - mx * mx;
    const slope = vx > 1e-12 ? (sxy / sw - mx * my) / vx : 0;
    out.push({ x: x0, y: my + slope * (x0 - mx) });
  }
  return out;
}
