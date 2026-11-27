// Chart types used by the analyses. Each returns an SVG string.
import { svgDoc, axisX, axisY, legend, linear, logScale, log1pScale, esc, pct, textWidth, truncate, INK, MUTED, GRID, GREY } from './svg.js';

const W = 880;

/** Step curves (Kaplan-Meier survival, or cumulative proportion when rising). series: {label, colour, dash, steps, last}. */
export function stepChart({ series, xLabel, yLabel, xMax, xScale = 'linear', xTicks, xFormat = (v) => v, rising = false, title = '' }) {
  const m = { l: 70, r: 24, t: 14, b: 52 };
  const leg = legend(series.map((s) => ({ label: s.label, colour: s.colour, dash: s.dash })), m.l, 0, W - m.l - m.r);
  const plotH = 300;
  const H = m.t + plotH + m.b + leg.height + 6;
  const x0 = m.l, x1 = W - m.r, y0 = m.t + plotH, yTop = m.t;
  const max = xMax || Math.max(1, ...series.map((s) => s.last || 0));
  const X = xScale === 'log1p' ? log1pScale(max, x0, x1, xTicks) : linear(0, max, x0, x1);
  const Y = linear(0, 1, y0, yTop);
  const val = (v) => (rising ? 1 - v : v);
  let body = axisY(Y, { x: x0, x1, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => pct(v), grid: true, label: yLabel, top: yTop, bottom: y0 });
  body += axisX(X, { y: y0, x0, x1, label: xLabel, format: xFormat, ticks: xTicks?.filter((t) => t <= max), grid: true, gridTop: yTop });
  for (const s of series) {
    const steps = s.steps.filter((st) => st.t <= max);
    const end = Math.min(s.last ?? max, max);
    if (s.band !== false && !s.dash) {
      const up = [], dn = [];
      steps.forEach((st, i) => {
        const next = i + 1 < steps.length ? steps[i + 1].t : end;
        const a = rising ? 1 - st.lo : st.hi, b = rising ? 1 - st.hi : st.lo;
        up.push(`${X(st.t)},${Y(a)} ${X(next)},${Y(a)}`);
        dn.unshift(`${X(next)},${Y(b)} ${X(st.t)},${Y(b)}`);
      });
      body += `<polygon points="${up.join(' ')} ${dn.join(' ')}" fill="${s.colour}" fill-opacity="0.12" stroke="none"/>`;
    }
    let d = `M${X(0)},${Y(val(1))}`;
    steps.forEach((st, i) => { if (i) d += `H${X(st.t)}V${Y(val(st.s))}`; });
    d += `H${X(end)}`;
    body += `<path d="${d}" fill="none" stroke="${s.colour}" stroke-width="2"${s.dash ? ' stroke-dasharray="5 3"' : ''}><title>${esc(s.label)}</title></path>`;
  }
  body += `<g transform="translate(0,${y0 + m.b})">${leg.svg}</g>`;
  return svgDoc(W, H, body, title);
}

/** Horizontal bars. rows: {label, title, bars: [{v, colour, text, title}]}; mode grouped (one bar per series) or stacked. */
export function hbars({ rows, mode = 'grouped', xMax = 1, xFormat = (v) => pct(v), xLabel = '', legendItems = [], labelChars = 46, barH = 12, title = '' }) {
  const labelW = Math.min(330, Math.max(80, ...rows.map((r) => textWidth(truncate(r.label, labelChars), 12)))) + 12;
  const m = { l: labelW, r: 56, t: 8, b: 40 };
  const perRow = mode === 'stacked' ? barH + 8 : Math.max(1, rows[0]?.bars.length || 1) * barH + 8;
  const plotH = rows.length * perRow;
  const leg = legendItems.length ? legend(legendItems.map((l) => ({ ...l, shape: 'box' })), m.l, 0, W - m.l - m.r) : { svg: '', height: 0 };
  const legGap = leg.height ? 18 : 0;
  const H = m.t + plotH + m.b + legGap + leg.height;
  const X = linear(0, xMax, m.l, W - m.r);
  let body = axisX(X, { y: m.t + plotH, x0: m.l, x1: W - m.r, label: xLabel, format: xFormat, grid: true, gridTop: m.t });
  rows.forEach((r, i) => {
    const top = m.t + i * perRow + 4;
    body += `<text x="${m.l - 8}" y="${top + (perRow - 8) / 2 + 4}" text-anchor="end" fill="${INK}" font-size="12">${esc(truncate(r.label, labelChars))}<title>${esc(r.title || r.label)}</title></text>`;
    let acc = 0;
    r.bars.forEach((b, j) => {
      const y = mode === 'stacked' ? top : top + j * barH;
      const xa = mode === 'stacked' ? X(acc) : X(0);
      const w = Math.max(0, X((mode === 'stacked' ? acc : 0) + (b.v || 0)) - xa);
      body += `<rect x="${xa}" y="${y}" width="${w}" height="${barH - 2}" fill="${b.colour}" rx="1.5"><title>${esc(b.title || '')}</title></rect>`;
      if (mode === 'grouped' && b.text) body += `<text x="${xa + w + 4}" y="${y + barH - 3}" fill="${MUTED}" font-size="10">${esc(b.text)}</text>`;
      acc += b.v || 0;
    });
  });
  if (leg.svg) body += `<g transform="translate(0,${m.t + plotH + m.b + legGap})">${leg.svg}</g>`;
  return svgDoc(W, H, body, title);
}

/** Heat map of shares: rows x columns, values in [0, 1] or null. */
export function heatmap({ rows, cols, values, counts, labelChars = 44, title = '' }) {
  const labelW = Math.min(330, Math.max(80, ...rows.map((r) => textWidth(truncate(r.label, labelChars), 12)))) + 12;
  const colLabH = Math.min(140, Math.max(40, ...cols.map((c) => textWidth(c.label, 11) * 0.75))) + 10;
  const cw = Math.max(18, Math.min(56, (W - labelW - 20) / cols.length));
  const ch = 18;
  const H = colLabH + rows.length * ch + 30;
  const colour = (v) => {
    if (v == null) return '#f5f5f5';
    const t = Math.max(0, Math.min(1, v));
    const mix = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${mix(247, 8)},${mix(251, 69)},${mix(255, 148)})`;
  };
  let body = '';
  cols.forEach((c, j) => {
    const x = labelW + j * cw + cw / 2;
    body += `<text transform="translate(${x},${colLabH - 6}) rotate(-45)" fill="${INK}" font-size="11">${esc(truncate(c.label, 24))}<title>${esc(c.title || c.label)}</title></text>`;
  });
  rows.forEach((r, i) => {
    const y = colLabH + i * ch;
    body += `<text x="${labelW - 8}" y="${y + 13}" text-anchor="end" fill="${INK}" font-size="12">${esc(truncate(r.label, labelChars))}<title>${esc(r.title || r.label)}</title></text>`;
    cols.forEach((c, j) => {
      const v = values[i][j];
      const x = labelW + j * cw;
      body += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" fill="${colour(v)}"><title>${esc(`${r.label} · ${c.label}: ${pct(v)}${counts ? ` (${counts[i][j]})` : ''}`)}</title></rect>`;
      if (cw >= 30 && v != null) body += `<text x="${x + cw / 2}" y="${y + 13}" text-anchor="middle" font-size="10" fill="${v > 0.55 ? '#fff' : INK}">${Math.round(100 * v)}</text>`;
    });
  });
  body += `<text x="${labelW}" y="${H - 8}" fill="${MUTED}" font-size="11">% of patients</text>`;
  return svgDoc(Math.min(W, labelW + cols.length * cw + 40), H, body, title);
}

/** Points and smoothed lines. series: {label, colour, points: [{x, y, title}], line: [{x, y}]}. */
export function scatter({ series, xLabel, yLabel, yLog = false, xMax, title = '' }) {
  const m = { l: 70, r: 24, t: 14, b: 52 };
  const leg = legend(series.map((s) => ({ label: s.label, colour: s.colour })), m.l, 0, W - m.l - m.r);
  const plotH = 320;
  const H = m.t + plotH + m.b + leg.height + 6;
  const xs = series.flatMap((s) => s.points.map((p) => p.x)), ys = series.flatMap((s) => s.points.map((p) => p.y));
  const xHi = xMax || Math.max(1, ...xs), xLo = Math.min(0, ...xs);
  const pos = ys.filter((y) => y > 0);
  const yLo = yLog ? Math.max(1e-3, Math.min(...pos)) : Math.min(0, ...ys), yHi = Math.max(...ys, yLog ? 1 : 0);
  const X = linear(xLo, xHi, m.l, W - m.r);
  const Y = yLog ? logScale(yLo, yHi, m.t + plotH, m.t) : linear(yLo, yHi * 1.05, m.t + plotH, m.t);
  let body = axisY(Y, { x: m.l, x1: W - m.r, grid: true, label: yLabel, top: m.t, bottom: m.t + plotH, format: (v) => +v.toPrecision(3) });
  body += axisX(X, { y: m.t + plotH, x0: m.l, x1: W - m.r, label: xLabel, grid: true, gridTop: m.t, format: (v) => +v.toPrecision(4) });
  for (const s of series) {
    for (const p of s.points) if (!yLog || p.y > 0) body += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="2.6" fill="${s.colour}" fill-opacity="0.35"><title>${esc(p.title || '')}</title></circle>`;
  }
  for (const s of series) {
    if (s.line?.length > 1) body += `<path d="${s.line.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.y)}`).join('')}" fill="none" stroke="${s.colour}" stroke-width="2.5"/>`;
  }
  body += `<g transform="translate(0,${m.t + plotH + m.b})">${leg.svg}</g>`;
  return svgDoc(W, H, body, title);
}

/** Median, interquartile range and range per row. rows: {label, colour, stats: {n, median, q1, q3, min, max}}. */
export function rangeChart({ rows, xLabel, format = (v) => +v.toPrecision(3), title = '' }) {
  const labelW = Math.min(330, Math.max(80, ...rows.map((r) => textWidth(r.label, 12)))) + 12;
  const m = { l: labelW, r: 30, t: 8, b: 42 };
  const rowH = 26;
  const H = m.t + rows.length * rowH + m.b;
  const all = rows.flatMap((r) => (r.stats.n ? [r.stats.min, r.stats.max] : []));
  const lo = Math.min(...all), hi = Math.max(...all);
  const X = linear(lo - (hi - lo) * 0.03, hi + (hi - lo) * 0.03 || 1, m.l, W - m.r);
  let body = axisX(X, { y: m.t + rows.length * rowH, x0: m.l, x1: W - m.r, label: xLabel, format, grid: true, gridTop: m.t });
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + rowH / 2;
    body += `<text x="${m.l - 8}" y="${y + 4}" text-anchor="end" fill="${INK}" font-size="12">${esc(r.label)}</text>`;
    const s = r.stats;
    if (!s.n) return;
    const tip = `<title>${esc(`${r.label}: median ${format(s.median)} [${format(s.q1)}–${format(s.q3)}], range ${format(s.min)}–${format(s.max)}, n = ${s.n}`)}</title>`;
    body += `<line x1="${X(s.min)}" x2="${X(s.max)}" y1="${y}" y2="${y}" stroke="${r.colour}" stroke-width="1.5"/>`;
    body += `<rect x="${X(s.q1)}" y="${y - 6}" width="${Math.max(1, X(s.q3) - X(s.q1))}" height="12" fill="${r.colour}" fill-opacity="0.3" stroke="${r.colour}">${tip}</rect>`;
    body += `<circle cx="${X(s.median)}" cy="${y}" r="4.5" fill="${r.colour}">${tip}</circle>`;
  });
  return svgDoc(W, H, body, title);
}

export { GREY };

/** Patients on a 2-D embedding (UMAP), one series per cluster; labels at the cluster medians. Units are arbitrary: no ticks.
 *  Points with open: true are drawn as rings (e.g. patients of the run outside the query); openLabel names them in the legend. */
export function embedding({ series, xLabel = 'UMAP 1', yLabel = 'UMAP 2', title = '', height = 420, openLabel = '' }) {
  const m = { l: 40, r: 24, t: 14, b: 40 };
  const anyOpen = series.some((s) => s.points.some((p) => p.open));
  const items = series.filter((s) => s.legend !== false).map((s) => ({ label: s.label, colour: s.colour, shape: 'box' }));
  if (anyOpen && openLabel) items.push({ label: openLabel, colour: MUTED, shape: 'ring' });
  const leg = legend(items, m.l, 0, W - m.l - m.r);
  const H = m.t + height + m.b + 14 + leg.height;
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return svgDoc(W, m.t + 40, `<text x="${m.l}" y="${m.t + 20}" fill="${MUTED}" font-size="12">–</text>`, title);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const px = (x1 - x0) * 0.04 || 1, py = (y1 - y0) * 0.04 || 1;
  const X = linear(x0 - px, x1 + px, m.l, W - m.r), Y = linear(y0 - py, y1 + py, m.t + height, m.t);
  let body = `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${height}" fill="none" stroke="${GRID}"/>`;
  body += `<text x="${(m.l + W - m.r) / 2}" y="${m.t + height + 22}" text-anchor="middle" fill="${MUTED}" font-size="12">${esc(xLabel)}</text>`;
  body += `<text transform="translate(${m.l - 14},${m.t + height / 2}) rotate(-90)" text-anchor="middle" fill="${MUTED}" font-size="12">${esc(yLabel)}</text>`;
  for (const s of series) {
    for (const p of s.points) {
      const look = p.open ? `fill="none" stroke="${s.colour}" stroke-width="1.2" stroke-opacity="0.8"` : `fill="${s.colour}" fill-opacity="${s.opacity ?? 0.8}"`;
      body += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${s.r || 3.2}" ${look}><title>${esc(p.title || '')}</title></circle>`;
    }
  }
  const med = (v) => { const a = [...v].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
  for (const s of series) {
    if (s.tag == null || s.points.length < 3) continue;
    const cx = X(med(s.points.map((p) => p.x))), cy = Y(med(s.points.map((p) => p.y)));
    body += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(s.tag)}</text>`;
  }
  body += `<g transform="translate(0,${m.t + height + m.b + 14})">${leg.svg}</g>`;
  return svgDoc(W, H, body, title);
}
