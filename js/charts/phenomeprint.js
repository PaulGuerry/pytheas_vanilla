// Phenomeprints: radial maps of HPO terms (angle = organ system, clockwise from 12 o'clock; ring = HPO level)
// on the layout of the release (phenomeprint_layout.json). Drawing after fig_aars_phenomeprint.R:
// bubble area (style bubble) or radial thickness of the segment (style arc) = share of patients carrying the term.
import { svgDoc, esc, legend, pct, INK } from './svg.js';

const HOLE = 1.2, FILL = 0.88, SCAFFOLD = '#d6d5d0';

function geometry(layout) {
  const maxLevel = Math.max(...layout.nodes.map((n) => n.level));
  const byId = new Map(layout.nodes.map((n) => [n.node, n]));
  const organ = new Map(layout.organs.map((o) => [o.hpo, o]));
  return { maxLevel, rmax: HOLE + maxLevel, byId, organ };
}

const polar = (cx, cy, r, x) => {
  const a = 2 * Math.PI * x;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};
const pt = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

function arcPath(cx, cy, r, xa, xb) {
  const [a, b] = xa <= xb ? [xa, xb] : [xb, xa];
  const large = b - a > 0.5 ? 1 : 0;
  return `M${pt(polar(cx, cy, r, a))}A${r.toFixed(2)},${r.toFixed(2)} 0 ${large} 1 ${pt(polar(cx, cy, r, b))}`;
}

function wedge(cx, cy, r0, r1, a, b) {
  const large = b - a > 0.5 ? 1 : 0;
  return `M${pt(polar(cx, cy, r0, a))}L${pt(polar(cx, cy, r1, a))}A${r1.toFixed(2)},${r1.toFixed(2)} 0 ${large} 1 ${pt(polar(cx, cy, r1, b))}`
    + `L${pt(polar(cx, cy, r0, b))}A${r0.toFixed(2)},${r0.toFixed(2)} 0 ${large} 0 ${pt(polar(cx, cy, r0, a))}Z`;
}

/** panels: [{label, n, counts: Map(hpo -> patients carrying it)}]. marks: HPO codes outlined. */
export function phenomeprints({ layout, panels, style = 'bubble', marks = [], size = 280, width = 880, showLegend = true, title = '' }) {
  const G = geometry(layout);
  const ncol = Math.max(1, Math.min(panels.length, Math.floor(width / size)));
  const cell = width / ncol;
  const labelH = 36;
  const nrow = Math.ceil(panels.length / ncol);
  const R = Math.min(cell, size) / 2 - 8;
  const unit = R / (G.rmax + 0.3);
  const maxR = 0.62 * unit;
  const leg = showLegend
    ? legend(layout.organs.map((o) => ({ label: o.name, colour: o.colour, shape: 'box' })), 12, 0, width - 24)
    : { svg: '', height: 0 };
  const H = nrow * (size + labelH) + leg.height + 10;
  const markSet = new Set(marks);

  // scaffold: shared by every panel, centred on (0, 0)
  let scaffold = '';
  for (const n of layout.nodes) {
    const rc = unit * (HOLE + n.level - 1 + FILL / 2);
    if (style === 'arc') {
      const o = G.organ.get(n.organ);
      const pad = 0.12 * n.slot;
      scaffold += `<path d="${wedge(0, 0, unit * (HOLE + n.level - 1), unit * (HOLE + n.level - 1 + FILL), n.xmin + pad, n.xmax - pad)}" fill="${o.colour}" fill-opacity="0.14"/>`;
    } else if (n.parent) {
      const p = G.byId.get(n.parent);
      const rp = unit * (HOLE + p.level - 1 + FILL / 2);
      scaffold += `<path d="${arcPath(0, 0, rp, p.x, n.x)}M${pt(polar(0, 0, rp, n.x))}L${pt(polar(0, 0, rc, n.x))}" fill="none" stroke="${SCAFFOLD}" stroke-width="0.4"/>`;
    }
  }
  let body = `<defs><g id="pp-scaffold">${scaffold}</g></defs>`;
  panels.forEach((panel, i) => {
    const cx = (i % ncol) * cell + cell / 2;
    const top = Math.floor(i / ncol) * (size + labelH);
    const cy = top + labelH + size / 2;
    body += `<text x="${cx}" y="${top + 14}" text-anchor="middle" fill="${INK}" font-size="12.5" font-weight="600">${esc(panel.label)}</text>`;
    body += `<text x="${cx}" y="${top + 29}" text-anchor="middle" fill="#6b7280" font-size="11.5">n = ${panel.n}</text>`;
    body += `<use href="#pp-scaffold" transform="translate(${cx},${cy})"/>`;
    const hits = layout.nodes.map((nd) => ({ nd, k: panel.counts.get(nd.hpo) || 0 })).filter((h) => h.k > 0);
    hits.sort((a, b) => b.k - a.k);
    for (const { nd, k } of hits) {
      const f = panel.n ? k / panel.n : 0;
      const o = G.organ.get(nd.organ);
      const tip = `<title>${esc(`${nd.term} (${o.name}): ${k}/${panel.n} (${pct(f)})`)}</title>`;
      const r0 = unit * (HOLE + nd.level - 1);
      if (style === 'arc') {
        const pad = 0.12 * nd.slot;
        body += `<path d="${wedge(cx, cy, r0, r0 + unit * FILL * f, nd.xmin + pad, nd.xmax - pad)}" fill="${o.colour}">${tip}</path>`;
      } else {
        const [x, y] = polar(cx, cy, r0 + unit * FILL / 2, nd.x);
        body += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(maxR * Math.sqrt(f)).toFixed(2)}" fill="${o.colour}" fill-opacity="0.85">${tip}</circle>`;
      }
    }
    for (const nd of layout.nodes) {
      if (!markSet.has(nd.hpo)) continue;
      const r0 = unit * (HOLE + nd.level - 1);
      if (style === 'arc') {
        body += `<path d="${wedge(cx, cy, r0, r0 + unit * FILL, nd.xmin + 0.12 * nd.slot, nd.xmax - 0.12 * nd.slot)}" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
      } else {
        const [x, y] = polar(cx, cy, r0 + unit * FILL / 2, nd.x);
        body += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(maxR * 1.05).toFixed(2)}" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
      }
      if (i === 0) {
        const [lx, ly] = polar(cx, cy, unit * (G.rmax + 0.15), nd.x);
        body += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="${INK}">${marks.indexOf(nd.hpo) + 1}</text>`;
      }
    }
  });
  if (leg.svg) body += `<g transform="translate(0,${nrow * (size + labelH) + 14})">${leg.svg}</g>`;
  return svgDoc(width, H, body, title);
}
