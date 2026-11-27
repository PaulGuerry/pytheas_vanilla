// Analyses: overview, phenomeprint, survival, onset, symptoms, term card.
// run(q) -> { html, figures: [{svg, name}], csv: {name, rows}, notes: [text] }; q = {ast, ctx, L}
import { km, logrank, describe, fisher2x2, bh, chi2test } from '../stats/stats.js';
import { stepChart, hbars, heatmap } from '../charts/charts.js';
import { phenomeprints } from '../charts/phenomeprint.js';
import { pct } from '../charts/svg.js';
import { buildSeries, drawn, table, swatch, share, fmt, pval, seriesNotes, statsNote, pEq, termState, esc, T, MIN_N } from './common.js';

const GENERIC = new Set(['HP:0000001', 'HP:0000118']);

// ---- helpers --------------------------------------------------------------------------------
function survivalOf(members) {
  const d = members.filter((pp) => pp.p.status && pp.p.age_y != null);
  return { k: km(d.map((pp) => pp.p.age_y), d.map((pp) => pp.p.status === 'dead')), n: d.length, times: d.map((pp) => pp.p.age_y), events: d.map((pp) => pp.p.status === 'dead') };
}
const atYears = (k, y) => k.at(y);
const sOf = (st) => (st ? `${pct(st.s)} [${pct(st.lo)}–${pct(st.hi)}]` : '–');

/** Patients carrying each term of the layout (true-path rule) for a list of members. */
export function nodeCounts(members, layout) {
  const counts = new Map();
  const codes = [...new Set(layout.nodes.map((n) => n.hpo))];
  for (const c of codes) {
    let k = 0;
    for (const pp of members) if (pp.present.has(c)) k++;
    if (k) counts.set(c, k);
  }
  return counts;
}

function topDirectTerms(members, n, ctx, sub) {
  const cnt = new Map();
  for (const pp of members) for (const c of pp.exact) if (!GENERIC.has(c)) cnt.set(c, (cnt.get(c) || 0) + 1);
  return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)
    .map(([c]) => ({ code: c, present: members.filter((pp) => termState(pp, c, ctx, sub) === 'present').length }));
}

function ppPanels(info, layout) {
  return info.series.map((s) => ({ label: s.label, n: s.n, counts: nodeCounts(s.members, layout) }));
}

const PP_NOTE = () => T(
  'Phenomeprint: one layout for the whole release; angle = organ system, clockwise from 12 o’clock (digestive system: a quarter of the circle); ring = HPO level. Bubble area = share of patients carrying the term or one of its subterms; terms reported absent are not used.',
  'Phenomeprint : une même disposition pour toute la version ; angle = système d’organes, dans le sens horaire depuis midi (appareil digestif : un quart du cercle) ; anneau = niveau HPO. Aire des bulles = part des patients porteurs du terme ou d’un de ses sous-termes ; les termes rapportés absents ne sont pas utilisés.');

// ---- overview -------------------------------------------------------------------------------
export const overview = {
  run(q) {
    const info = buildSeries(q);
    const { ctx, ast } = q;
    const sub = info.sub;
    const rows = [], csv = [];
    for (const s of info.series) {
      const m = s.members;
      const dois = new Set(m.flatMap((pp) => (pp.p.art || []).map((a) => a.doi)).filter(Boolean));
      const boys = m.filter((pp) => pp.p.sex === 'M').length, girls = m.filter((pp) => pp.p.sex === 'F').length;
      const on = describe(m.map((pp) => pp.p.onset_m));
      const sv = survivalOf(m);
      const deaths = m.filter((pp) => pp.p.status === 'dead').length, withStatus = m.filter((pp) => pp.p.status).length;
      const s5 = sv.n ? atYears(sv.k, 5) : null;
      const top = topDirectTerms(m, 5, ctx, sub);
      rows.push([`${swatch(s)}${esc(s.label)}`, s.n, dois.size, `${boys} / ${girls}`,
        on.n ? `${fmt(on.median, 1)} [${fmt(on.q1, 1)}–${fmt(on.q3, 1)}] (${on.n})` : '–',
        `${deaths}/${withStatus}`, sOf(s5),
        top.map((t) => `${esc(q.L.termLabel(t.code))} ${pct(t.present / s.n)}`).join('<br>')]);
      csv.push({ series: s.label, patients: s.n, articles: dois.size, boys, girls, onset_median_months: on.median ?? '', onset_q1: on.q1 ?? '',
        onset_q3: on.q3 ?? '', onset_n: on.n, deaths, with_status: withStatus, survival_5y: s5?.s ?? '', survival_5y_lo: s5?.lo ?? '', survival_5y_hi: s5?.hi ?? '',
        top_terms: top.map((t) => `${q.L.termLabel(t.code)} (${t.present})`).join('; ') });
    }
    const figures = [];
    const layout = ctx.release.layout;
    if (layout) {
      const { list, note } = drawn(info.series);
      figures.push({ name: 'phenomeprint', svg: phenomeprints({ layout, panels: ppPanels({ series: list.slice(0, 6) }, layout), size: info.series.length > 1 ? 240 : 300, title: 'Phenomeprint' }),
        note: list.length > 6 ? T('Phenomeprints of the 6 largest groups.', 'Phénomeprints des 6 plus grands groupes.') : note });
    }
    const headers = [T('Cohort', 'Cohorte'), 'n', T('Articles', 'Articles'), T('Boys / girls', 'Garçons / filles'),
      T('Onset, months: median [IQR] (n)', 'Début, mois : médiane [EIQ] (n)'), T('Deaths / with status', 'Décès / avec statut'), T('Survival at 5 years [95% CI]', 'Survie à 5 ans [IC 95 %]'),
      T('Most reported symptoms (with subterms)', 'Symptômes les plus rapportés (avec sous-termes)')];
    return { figures, figuresFirst: true, html: table(headers, rows, 'overview'), csv: { name: 'overview', rows: csv },
      notes: [...seriesNotes(info), PP_NOTE(), T('Survival: Kaplan-Meier on age at death or at the last report, 95% CI on the log(-log) scale.', 'Survie : Kaplan-Meier sur l’âge au décès ou aux dernières nouvelles, IC 95 % sur l’échelle log(-log).')] };
  },
};

// ---- phenomeprint ---------------------------------------------------------------------------
export const phenomeprint = {
  run(q) {
    const layout = q.ctx.release.layout;
    if (!layout) return { html: `<p class="muted">${T('No phenomeprint layout in this release.', 'Pas de disposition de phénomeprint dans cette version.')}</p>` };
    const info = buildSeries(q);
    const { list, note } = drawn(info.series);
    const marks = (q.ast.options.mark || '').split(',').filter(Boolean).map((c) => 'HP:' + c.replace(/^hp:/i, '').padStart(7, '0'));
    const panels = ppPanels({ series: list }, layout);
    const svg = phenomeprints({ layout, panels, style: q.ast.options.style || 'bubble', marks, size: list.length === 1 ? 420 : list.length === 2 ? 420 : 290, title: 'Phenomeprint' });
    const csv = [];
    const panelsAll = ppPanels(info, layout);
    const organ = new Map(layout.organs.map((o) => [o.hpo, o.name]));
    panelsAll.forEach((p) => {
      for (const nd of layout.nodes) {
        const k = p.counts.get(nd.hpo) || 0;
        csv.push({ set: p.label, n: p.n, node: nd.node, organ: nd.organ, organ_name: organ.get(nd.organ), hpo: nd.hpo, term: nd.term, level: nd.level,
          parent: nd.parent, xmin: nd.xmin, xmax: nd.xmax, x: nd.x, slot: nd.slot, leaf: nd.leaf, count: k, freq: p.n ? k / p.n : 0 });
      }
    });
    const markList = marks.length ? `<p class="small">${marks.map((m, i) => `${i + 1}. ${esc(q.L.termLabel(m))}`).join(' · ')}</p>` : '';
    return { figures: [{ name: 'phenomeprint', svg, note }], html: markList, csv: { name: 'phenomeprint', rows: csv }, notes: [...seriesNotes(info), PP_NOTE()] };
  },
};

// ---- survival -------------------------------------------------------------------------------
export const survival = {
  run(q) {
    const info = buildSeries(q);
    const fits = info.series.map((s) => ({ s, ...survivalOf(s.members) }));
    const rows = fits.map(({ s, k, n }) => [`${swatch(s)}${esc(s.label)}`, `${n}/${s.n}`, k.events, k.median != null ? fmt(k.median, 1) : '–',
      sOf(k.at(1)), sOf(k.at(5)), sOf(k.at(10))]);
    const { list, note } = drawn(info.series);
    const times = fits.flatMap((f) => f.times).sort((a, b) => a - b);
    const p97 = times.length ? times[Math.floor(0.97 * (times.length - 1))] : 10;
    const xMax = Math.max(5, Math.ceil(p97 / 5) * 5);
    const svg = stepChart({ series: fits.filter((f) => list.includes(f.s)).map(({ s, k }) => ({ label: `${s.label} (n = ${k.n})`, colour: s.colour, dash: s.dash, steps: k.steps, last: k.last, band: list.length <= 3 })),
      xLabel: T('Age (years)', 'Âge (années)'), yLabel: T('Alive', 'Vivants'), xMax, title: T('Survival', 'Survie') });
    let test = '';
    if (q.ast.options.stats === 'on' && fits.length > 1) {
      const r = logrank(fits.filter((f) => f.n).map((f) => ({ times: f.times, events: f.events })));
      test = `<p class="test">${T('Log-rank test', 'Test du log-rank')}: χ² = ${fmt(r.chi2, 2)}, ${T('df', 'ddl')} = ${r.df}, ${pEq(r.p)}</p>`;
    }
    const csv = fits.flatMap(({ s, k }) => k.steps.map((st) => ({ series: s.label, age_years: st.t, survival: st.s, lo95: st.lo, hi95: st.hi, at_risk: st.nRisk, deaths: st.d })));
    const headers = [T('Cohort', 'Cohorte'), T('With status and age', 'Avec statut et âge'), T('Deaths', 'Décès'), T('Median survival (years)', 'Survie médiane (années)'),
      T('1 year', '1 an'), T('5 years', '5 ans'), T('10 years', '10 ans')];
    return { figures: [{ name: 'survival', svg, note: `${note}${note ? ' ' : ''}${T(`Axis cut at ${xMax} years.`, `Axe coupé à ${xMax} ans.`)}${list.length > 3 ? ` ${T('95% CI bands are drawn for up to 3 curves.', 'Les bandes d’IC 95 % sont tracées jusqu’à 3 courbes.')}` : ''}` }],
      html: table(headers, rows) + test, csv: { name: 'survival', rows: csv },
      notes: [...seriesNotes(info), T('Kaplan-Meier on age at death or at the last report (years); patients without both are left out. 95% CI on the log(-log) scale.',
        'Kaplan-Meier sur l’âge au décès ou aux dernières nouvelles (années) ; les patients sans l’un ou l’autre sont exclus. IC 95 % sur l’échelle log(-log).'), statsNote()] };
  },
};

// ---- onset ----------------------------------------------------------------------------------
const ONSET_TICKS = [0, 1, 3, 6, 12, 24, 60, 120, 240, 480];
const PERIOD = {
  newborn: ['Newborn (0–2 m)', 'Nouveau-né (0–2 m)'], infancy: ['Infancy (3–11 m)', 'Nourrisson (3–11 m)'], toddler: ['Toddler (1–2 y)', 'Petite enfance (1–2 a)'],
  preschool: ['Preschool (3–5 y)', 'Âge préscolaire (3–5 a)'], childhood: ['Childhood (6–11 y)', 'Enfance (6–11 a)'], adolescence: ['Adolescence (12–19 y)', 'Adolescence (12–19 a)'],
  adult: ['Adult (≥ 20 y)', 'Adulte (≥ 20 a)'],
};
const onsetTick = (m) => (m === 0 ? '0' : m < 12 ? `${m} ${T('m', 'm')}` : `${m / 12} ${T('y', 'a')}`);

export const onset = {
  run(q) {
    const info = buildSeries(q);
    const periods = q.ctx.release.lexicon.onset_periods;
    const fits = info.series.map((s) => {
      const v = s.members.map((pp) => pp.p.onset_m).filter((x) => x != null);
      return { s, v, d: describe(v), k: km(v, v.map(() => true)) };
    });
    const rows = fits.map(({ s, v, d }) => [`${swatch(s)}${esc(s.label)}`, `${d.n}/${s.n}`,
      d.n ? `${fmt(d.median, 1)} [${fmt(d.q1, 1)}–${fmt(d.q3, 1)}]` : '–', d.n ? `${fmt(d.min, 1)}–${fmt(d.max, 0)}` : '–',
      ...periods.map((p) => (d.n ? pct(v.filter((x) => x >= p.from_m && (p.to_m === null || x < p.to_m)).length / d.n) : '–'))]);
    const { list, note } = drawn(info.series);
    const xMax = Math.max(24, ...fits.map((f) => f.d.max || 0));
    const svg = stepChart({ series: fits.filter((f) => list.includes(f.s)).map(({ s, k, d }) => ({ label: `${s.label} (n = ${d.n})`, colour: s.colour, dash: s.dash, steps: k.steps, last: d.max, band: false })),
      rising: true, xScale: 'log1p', xMax, xTicks: ONSET_TICKS, xFormat: onsetTick, xLabel: T('Age at first symptoms', 'Âge aux premiers symptômes'),
      yLabel: T('With symptoms', 'Symptomatiques'), title: T('Age at first symptoms', 'Âge aux premiers symptômes') });
    let test = '';
    if (q.ast.options.stats === 'on' && fits.length > 1) {
      const r = logrank(fits.filter((f) => f.d.n).map((f) => ({ times: f.v, events: f.v.map(() => true) })));
      test = `<p class="test">${T('Log-rank test', 'Test du log-rank')}: χ² = ${fmt(r.chi2, 2)}, ${T('df', 'ddl')} = ${r.df}, ${pEq(r.p)}</p>`;
    }
    const headers = [T('Cohort', 'Cohorte'), T('With onset age', 'Avec âge de début'), T('Months: median [IQR]', 'Mois : médiane [EIQ]'), T('Range (months)', 'Étendue (mois)'),
      ...periods.map((p) => esc(PERIOD[p.key] ? T(...PERIOD[p.key]) : p.label))];
    const csv = fits.flatMap(({ s }) => s.members.filter((pp) => pp.p.onset_m != null).map((pp) => ({ series: s.label, id: pp.p.id, onset_months: pp.p.onset_m })));
    return { figures: [{ name: 'onset', svg, note }], html: table(headers, rows) + test, csv: { name: 'onset', rows: csv },
      notes: [...seriesNotes(info), T('Age at first symptoms as reported (months); axis on a log(1 + age) scale.', 'Âge aux premiers symptômes tel que rapporté (mois) ; axe en log(1 + âge).'), statsNote()] };
  },
};

// ---- symptoms -------------------------------------------------------------------------------
export const symptoms = {
  run(q) {
    const info = buildSeries(q);
    const { ctx, L } = q;
    const sub = info.sub;
    const top = Math.max(1, +(q.ast.options.top || 20));
    const cand = new Set();
    for (const s of info.series) for (const pp of s.members) for (const c of pp.exact) if (!GENERIC.has(c)) cand.add(c);
    const stat = (s, c) => {
      let p = 0, a = 0;
      for (const pp of s.members) { const st = termState(pp, c, ctx, sub); if (st === 'present') p++; else if (st === 'absent') a++; }
      return { p, a, n: s.n };
    };
    const directCount = new Map();
    for (const s of info.series) for (const pp of s.members) for (const c of pp.exact) directCount.set(c, (directCount.get(c) || 0) + 1);
    const ranked = [...cand].sort((x, y) => directCount.get(y) - directCount.get(x)).slice(0, Math.max(top * 3, 60))
      .map((c) => ({ c, st: info.series.map((s) => stat(s, c)) }))
      .map((r) => ({ ...r, score: Math.max(...r.st.map((x) => (x.n ? x.p / x.n : 0))) }))
      .sort((a, b) => b.score - a.score || a.c.localeCompare(b.c)).slice(0, top);
    const { list, note } = drawn(info.series);
    const idx = list.map((s) => info.series.indexOf(s));
    let svg;
    if (list.length === 1) {
      svg = hbars({ mode: 'stacked', rows: ranked.map((r) => {
        const x = r.st[idx[0]];
        return { label: L.termLabel(r.c), bars: [
          { v: x.p / x.n, colour: list[0].colour, title: `${T('present', 'présent')} ${x.p}/${x.n}` },
          { v: x.a / x.n, colour: '#9ca3af', title: `${T('reported absent', 'rapporté absent')} ${x.a}/${x.n}` },
          { v: 1 - (x.p + x.a) / x.n, colour: '#eef0f2', title: `${T('not reported', 'non rapporté')} ${x.n - x.p - x.a}/${x.n}` }] };
      }), legendItems: [{ label: T('present', 'présent'), colour: list[0].colour }, { label: T('reported absent', 'rapporté absent'), colour: '#9ca3af' },
        { label: T('not reported', 'non rapporté'), colour: '#eef0f2' }], xLabel: T('Patients', 'Patients'), title: T('Symptoms', 'Symptômes') });
    } else if (list.length <= 4) {
      svg = hbars({ mode: 'grouped', rows: ranked.map((r) => ({ label: L.termLabel(r.c), bars: idx.map((i) => {
        const x = r.st[i];
        return { v: x.p / x.n, colour: info.series[i].colour, text: pct(x.p / x.n), title: `${info.series[i].label}: ${x.p}/${x.n}` };
      }) })), legendItems: list.map((s) => ({ label: `${s.label} (n = ${s.n})`, colour: s.colour })), xLabel: T('Patients with the symptom', 'Patients avec le symptôme'), barH: 10, title: T('Symptoms', 'Symptômes') });
    } else {
      svg = heatmap({ rows: ranked.map((r) => ({ label: L.termLabel(r.c) })), cols: list.map((s) => ({ label: `${s.label} (${s.n})` })),
        values: ranked.map((r) => idx.map((i) => (r.st[i].n ? r.st[i].p / r.st[i].n : null))), counts: ranked.map((r) => idx.map((i) => r.st[i].p)), title: T('Symptoms', 'Symptômes') });
    }
    let qv = null;
    if (q.ast.options.stats === 'on' && info.series.length === 2) {
      const ps = ranked.map((r) => { const [a, b] = r.st; return fisher2x2(a.p, a.n - a.p, b.p, b.n - b.p); });
      const qs = bh(ps);
      qv = ranked.map((_, i) => [ps[i], qs[i]]);
    }
    const headers = [T('Symptom', 'Symptôme'), ...info.series.map((s) => `${swatch(s)}${esc(s.label)} (n = ${s.n})`), ...(qv ? ['p (Fisher)', 'q (BH)'] : [])];
    const rows = ranked.map((r, i) => [esc(L.termLabel(r.c)), ...r.st.map((x) => `${share(x.p, x.n)}${x.a ? ` <span class="muted">· ${T('absent', 'absent')} ${x.a}</span>` : ''}`),
      ...(qv ? [pval(qv[i][0]), pval(qv[i][1])] : [])]);
    const csv = ranked.flatMap((r) => info.series.map((s, i) => ({ hpo: r.c, term: L.termLabel(r.c), series: s.label, n: s.n, present: r.st[i].p, absent: r.st[i].a, not_reported: s.n - r.st[i].p - r.st[i].a })));
    return { figures: [{ name: 'symptoms', svg, note }], html: table(headers, rows), csv: { name: 'symptoms', rows: csv },
      notes: [...seriesNotes(info), sub
        ? T(`The ${top} symptoms most often present (top=${top}); a patient counts for a term when the term or one of its subterms is reported (sub=off: the term only). Absent: the term or a broader one reported absent.`,
          `Les ${top} symptômes les plus souvent présents (top=${top}) ; un patient compte pour un terme si le terme ou un de ses sous-termes est rapporté (sub=off : le terme seul). Absent : le terme ou un terme plus large rapporté absent.`)
        : T(`The ${top} symptoms most often present, counted as reported (sub=off).`, `Les ${top} symptômes les plus souvent présents, comptés tels que rapportés (sub=off).`),
      ...(qv ? [T('Fisher exact tests, q-values by Benjamini-Hochberg over the terms shown.', 'Tests exacts de Fisher, valeurs q de Benjamini-Hochberg sur les termes affichés.')] : [statsNote()])] };
  },
};

// ---- term card ------------------------------------------------------------------------------
export const term = {
  run(q) {
    const code = q.ast.analysis.id;
    const info = buildSeries(q, { kind: 'facet', id: 'disease' });
    const { ctx, L } = q;
    const sub = info.sub;
    const rows0 = info.series.map((s) => {
      let p = 0, a = 0;
      const ons = [];
      for (const pp of s.members) {
        const st = termState(pp, code, ctx, sub);
        if (st === 'present') { p++; const h = (pp.p.hp || []).find((x) => x[0] === code); if (h && h[1] != null) ons.push(h[1]); }
        else if (st === 'absent') a++;
      }
      return { s, p, a, on: describe(ons) };
    });
    const order = [...rows0].sort((x, y) => (x.s.small - y.s.small) || (y.p / y.s.n - x.p / x.s.n) || (y.s.n - x.s.n));
    const shown = order.filter((r) => !r.s.small && (r.p > 0 || info.series.length <= 12)).slice(0, 30);
    const svg = hbars({ mode: 'stacked', rows: shown.map((r) => ({ label: `${r.s.label} (n = ${r.s.n})`, bars: [
      { v: r.p / r.s.n, colour: '#1f77b4', title: `${T('present', 'présent')} ${r.p}/${r.s.n}` },
      { v: r.a / r.s.n, colour: '#9ca3af', title: `${T('reported absent', 'rapporté absent')} ${r.a}/${r.s.n}` },
      { v: 1 - (r.p + r.a) / r.s.n, colour: '#eef0f2', title: `${T('not reported', 'non rapporté')}` }] })),
      legendItems: [{ label: T('present', 'présent'), colour: '#1f77b4' }, { label: T('reported absent', 'rapporté absent'), colour: '#9ca3af' }, { label: T('not reported', 'non rapporté'), colour: '#eef0f2' }],
      xLabel: T('Patients', 'Patients'), title: L.termLabel(code) });
    let test = '';
    if (q.ast.options.stats === 'on' && info.series.length > 1) {
      const r = chi2test(info.series.map((s, i) => [rows0[i].p, s.n - rows0[i].p]));
      test = `<p class="test">χ² = ${fmt(r.chi2, 2)}, ${T('df', 'ddl')} = ${r.df}, ${pEq(r.p)}</p>`;
    }
    const headers = [T('Group', 'Groupe'), 'n', T('Present', 'Présent'), T('Reported absent', 'Rapporté absent'), T('Onset of the symptom, months: median (n)', 'Début du symptôme, mois : médiane (n)')];
    const rows = order.map((r) => [`${swatch(r.s)}${esc(r.s.label)}`, r.s.n, share(r.p, r.s.n), r.a, r.on.n ? `${fmt(r.on.median, 1)} (${r.on.n})` : '–']);
    const csv = order.map((r) => ({ hpo: code, term: L.termLabel(code), group: r.s.label, n: r.s.n, present: r.p, absent: r.a, not_reported: r.s.n - r.p - r.a, onset_median_months: r.on.median ?? '', onset_n: r.on.n }));
    return { figures: [{ name: 'symptom', svg, note: shown.length < order.length ? T(`Figure: the ${shown.length} groups of at least ${MIN_N} patients with the highest share; all groups are in the table.`, `Figure : les ${shown.length} groupes d’au moins ${MIN_N} patients où la part est la plus élevée ; tous les groupes figurent dans le tableau.`) : '' }],
      html: `<p class="code">${esc(code)}</p>` + table(headers, rows) + test, csv: { name: `symptom_${code.replace(':', '')}`, rows: csv },
      notes: [...seriesNotes(info), T('Present: the term or one of its subterms reported (sub=off: the term only). Without “by”, the release is split by disease label; a patient with two labels counts under both.',
        'Présent : le terme ou un de ses sous-termes rapporté (sub=off : le terme seul). Sans « par », la version est répartie par maladie ; un patient à deux libellés compte sous les deux.'), statsNote()] };
  },
};
