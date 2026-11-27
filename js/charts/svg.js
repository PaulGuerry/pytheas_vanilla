// Small SVG chart kit: scales, axes, legend. Charts are built as strings, so they also run in Node.
// Style after ggplot2's theme_minimal: no frame, light grid, axis text in grey.

export const PALETTE = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f'];
export const GREY = '#a3a3a3';
export const INK = '#1f2933';
export const MUTED = '#6b7280';
export const GRID = '#ebebeb';
export const FONT = 'Helvetica, Arial, sans-serif';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const f1 = (x) => (x == null || !Number.isFinite(x) ? '' : Math.round(x * 10) / 10);
export const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : `${(100 * x).toFixed(d)}%`);

/** Rough text width at a font size (Helvetica-like average). */
export const textWidth = (s, size = 12) => String(s).length * size * 0.55;
export function truncate(s, maxChars) {
  s = String(s);
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}

export function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const step0 = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function linear(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.ticks = (n = 5) => niceTicks(d0, d1, n);
  f.domain = [d0, d1];
  return f;
}

/** Log scale for positive values; ticks at 1, 2 and 5 times powers of ten. */
export function logScale(d0, d1, r0, r1) {
  const l0 = Math.log10(d0), l1 = Math.log10(d1);
  const f = (v) => r0 + ((Math.log10(Math.max(v, d0)) - l0) / (l1 - l0 || 1)) * (r1 - r0);
  f.ticks = () => {
    const all = [], ones = [];
    for (let e = Math.floor(l0); e <= Math.ceil(l1); e++) for (const m of [1, 2, 5]) {
      const v = +(m * 10 ** e).toPrecision(6);
      if (v >= d0 * 0.999 && v <= d1 * 1.001) { all.push(v); if (m === 1) ones.push(v); }
    }
    return all.length > 8 ? ones : all;
  };
  f.domain = [d0, d1];
  return f;
}

/** Scale on log(1 + x), for ages in months that start at birth. */
export function log1pScale(d1, r0, r1, ticks) {
  const f = (v) => r0 + (Math.log1p(Math.max(0, v)) / Math.log1p(d1)) * (r1 - r0);
  f.ticks = () => ticks.filter((t) => t <= d1);
  f.domain = [0, d1];
  return f;
}

export function svgDoc(width, height, body, title = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"`
    + ` aria-label="${esc(title)}" font-family="${FONT}" font-size="12" style="max-width:100%;height:auto">`
    + `${title ? `<title>${esc(title)}</title>` : ''}<rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;
}

export function axisX(scale, { y, x0, x1, label, format = (v) => v, ticks, grid, gridTop }) {
  const tv = ticks || scale.ticks();
  let s = '';
  for (const v of tv) {
    const x = scale(v);
    if (grid) s += `<line x1="${x}" x2="${x}" y1="${gridTop}" y2="${y}" stroke="${GRID}"/>`;
    s += `<text x="${x}" y="${y + 16}" text-anchor="middle" fill="${MUTED}" font-size="11">${esc(format(v))}</text>`;
  }
  if (label) s += `<text x="${(x0 + x1) / 2}" y="${y + 34}" text-anchor="middle" fill="${INK}" font-size="12">${esc(label)}</text>`;
  return s;
}

export function axisY(scale, { x, x1, label, format = (v) => v, ticks, grid, top, bottom }) {
  const tv = ticks || scale.ticks();
  let s = '';
  for (const v of tv) {
    const y = scale(v);
    if (grid) s += `<line x1="${x}" x2="${x1}" y1="${y}" y2="${y}" stroke="${GRID}"/>`;
    s += `<text x="${x - 6}" y="${y + 4}" text-anchor="end" fill="${MUTED}" font-size="11">${esc(format(v))}</text>`;
  }
  if (label) {
    const cy = (top + bottom) / 2;
    s += `<text transform="translate(${x - 44},${cy}) rotate(-90)" text-anchor="middle" fill="${INK}" font-size="12">${esc(label)}</text>`;
  }
  return s;
}

/** Legend in rows; returns {svg, height}. items: {label, colour, dash, shape}. */
export function legend(items, x, y, maxWidth) {
  let cx = x, cy = y, s = '';
  for (const it of items) {
    const w = 22 + textWidth(it.label, 12) + 16;
    if (cx + w > x + maxWidth && cx > x) { cx = x; cy += 18; }
    s += it.shape === 'box'
      ? `<rect x="${cx}" y="${cy - 9}" width="12" height="10" rx="2" fill="${it.colour}"/>`
      : `<line x1="${cx}" x2="${cx + 16}" y1="${cy - 4}" y2="${cy - 4}" stroke="${it.colour}" stroke-width="2.5"${it.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
    s += `<text x="${cx + 22}" y="${cy}" fill="${INK}" font-size="12">${esc(it.label)}</text>`;
    cx += w;
  }
  return { svg: s, height: cy - y + 18 };
}
