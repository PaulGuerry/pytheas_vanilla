// Analyses: variants, zygosity, CADD, sex, birth, laboratory values, treatments, one treatment, patients, articles, clusters.
import { describe, chi2test, loess, quantile } from '../stats/stats.js';
import { hbars, rangeChart, scatter } from '../charts/charts.js';
import { pct } from '../charts/svg.js';
import { buildSeries, drawn, table, swatch, share, fmt, pval, seriesNotes, statsNote, pEq, esc, T, MIN_N } from './common.js';
import { tierKey } from '../cohort/prepare.js';

const counts = (items, keys) => keys.map((k) => items.filter((x) => x === k).length);

/** Distribution of a categorical variable per series, as 100% stacked bars and a table. */
function distribution(q, { name, title, keys, labels, colours, valuesOf, unitLabel, note, denominator }) {
  const info = buildSeries(q);
  const data = info.series.map((s) => {
    const vals = s.members.flatMap(valuesOf);
    return { s, c: counts(vals, keys), tot: vals.filter((v) => keys.includes(v)).length, unknown: vals.filter((v) => !keys.includes(v)).length };
  });
  const { list, note: dnote } = drawn(info.series);
  const svg = hbars({ mode: 'stacked', rows: data.filter((d) => list.includes(d.s)).map((d) => ({ label: `${d.s.label} (${d.tot})`,
    bars: d.c.map((k, i) => ({ v: d.tot ? k / d.tot : 0, colour: colours[i], title: `${labels[i]}: ${k}/${d.tot}` })) })),
    legendItems: keys.map((k, i) => ({ label: labels[i], colour: colours[i] })), xLabel: unitLabel, title });
  let test = '';
  if (q.ast.options.stats === 'on' && data.length > 1) {
    const r = chi2test(data.map((d) => d.c));
    test = `<p class="test">χ² = ${fmt(r.chi2, 2)}, ${T('df', 'ddl')} = ${r.df}, ${pEq(r.p)}</p>`;
  }
  const headers = [T('Cohort', 'Cohorte'), denominator, ...labels, T('not known', 'inconnu')];
  const rows = data.map((d) => [`${swatch(d.s)}${esc(d.s.label)}`, d.tot, ...d.c.map((k) => share(k, d.tot)), d.unknown]);
  const csv = data.flatMap((d) => keys.map((k, i) => ({ series: d.s.label, category: k, count: d.c[i], total: d.tot })));
  return { figures: [{ name, svg, note: dnote }], html: table(headers, rows) + test, csv: { name, rows: csv }, notes: [...seriesNotes(info), note, statsNote()] };
}

export const variants = {
  run(q) {
    const keys = q.ctx.release.lexicon.variant_types.filter((k) => k !== 'unknown');
    return distribution(q, {
      name: 'variant_types', title: T('Variant types', 'Types de variants'), keys, labels: keys,
      colours: ['#1f77b4', '#d62728', '#ff7f0e', '#9467bd', '#2ca02c', '#8c564b', '#7f7f7f'],
      valuesOf: (pp) => (pp.p.al || []).map((a) => a.type || 'unknown'), unitLabel: T('Alleles', 'Allèles'), denominator: T('Alleles typed', 'Allèles typés'),
      note: T('Per allele: two alleles per patient.', 'Par allèle : deux allèles par patient.'),
    });
  },
};

export const zygosity = {
  run(q) {
    const keys = ['homozygous', 'compound', 'heterozygous'];
    return distribution(q, {
      name: 'zygosity', title: T('Zygosity', 'Zygotie'), keys,
      labels: [T('homozygous', 'homozygote'), T('compound heterozygous', 'hétérozygote composite'), T('heterozygous', 'hétérozygote')],
      colours: ['#1f77b4', '#ff7f0e', '#2ca02c'], valuesOf: (pp) => [pp.p.zyg || 'unknown'], unitLabel: T('Patients', 'Patients'),
      denominator: T('Patients with zygosity', 'Patients avec zygotie'), note: T('Per patient.', 'Par patient.'),
    });
  },
};

export const sex = {
  run(q) {
    const out = distribution(q, {
      name: 'sex', title: T('Sex', 'Sexe'), keys: ['M', 'F'], labels: [T('boys', 'garçons'), T('girls', 'filles')], colours: ['#1f77b4', '#e377c2'],
      valuesOf: (pp) => [pp.p.sex || 'unknown'], unitLabel: T('Patients', 'Patients'), denominator: T('Patients with sex', 'Patients avec sexe'),
      note: T('Sex ratio = boys / girls.', 'Sex-ratio = garçons / filles.'),
    });
    return out;
  },
};

export const cadd = {
  run(q) {
    const tiers = q.ctx.release.lexicon.cadd_tiers.map((t) => tierKey(t.tier));
    const out = distribution(q, {
      name: 'cadd_tiers', title: T('CADD tiers of missense alleles', 'Classes CADD des allèles faux-sens'), keys: tiers,
      labels: q.ctx.release.lexicon.cadd_tiers.map((t) => t.tier.replace('_', ' ')),
      colours: ['#b2182b', '#ef8a62', '#e0e0e0', '#9ecae1', '#4393c3', '#2166ac'],
      valuesOf: (pp) => pp.tiers.filter(Boolean), unitLabel: T('Missense alleles with a score', 'Allèles faux-sens avec un score'),
      denominator: T('Missense alleles scored', 'Allèles faux-sens avec score'),
      note: T('ClinGen PP3/BP4 thresholds for CADD v1.6 (Pejaver et al., 2022): PP3 moderate ≥ 28.1, supporting [25.3, 28.1), indeterminate (22.7, 25.3), BP4 supporting (17.3, 22.7], moderate (0.15, 17.3], strong ≤ 0.15; missense alleles only.',
        'Seuils ClinGen PP3/BP4 pour CADD v1.6 (Pejaver et al., 2022) : PP3 modéré ≥ 28,1, en faveur [25,3 ; 28,1), indéterminé (22,7 ; 25,3), BP4 en faveur (17,3 ; 22,7], modéré (0,15 ; 17,3], fort ≤ 0,15 ; allèles faux-sens seulement.'),
    });
    const info = buildSeries(q);
    const svg = rangeChart({ rows: info.series.map((s) => ({ label: `${s.label}`, colour: s.colour,
      stats: describe(s.members.flatMap((pp) => (pp.p.al || []).map((a) => a.cadd).filter((x) => x != null))) })), xLabel: T('CADD score, all scored alleles', 'Score CADD, tous allèles avec score') });
    out.figures.push({ name: 'cadd_scores', svg, note: T('Median, interquartile range and range.', 'Médiane, écart interquartile et étendue.') });
    return out;
  },
};

export const birth = {
  run(q) {
    const info = buildSeries(q);
    const vars = [
      ['w_g', T('Birth weight (g)', 'Poids de naissance (g)')], ['w_sds', T('Birth weight (SDS)', 'Poids de naissance (DS)')],
      ['ga_w', T('Gestational age (weeks)', 'Terme (semaines)')], ['len_cm', T('Birth length (cm)', 'Taille de naissance (cm)')], ['hc_cm', T('Head circumference at birth (cm)', 'Périmètre crânien de naissance (cm)')],
    ];
    const figures = [];
    const rows = [];
    for (const [k, label] of vars) {
      const st = info.series.map((s) => ({ s, d: describe(s.members.map((pp) => pp.p.birth?.[k]).filter((x) => x != null)) }));
      if (!st.some((x) => x.d.n)) continue;
      figures.push({ name: `birth_${k}`, svg: rangeChart({ rows: st.map((x) => ({ label: `${x.s.label} (${x.d.n})`, colour: x.s.colour, stats: x.d })), xLabel: label }) });
      for (const x of st) rows.push([`${swatch(x.s)}${esc(x.s.label)}`, label, `${x.d.n}/${x.s.n}`, x.d.n ? `${fmt(x.d.median, 2)} [${fmt(x.d.q1, 2)}–${fmt(x.d.q3, 2)}]` : '–']);
    }
    const csv = info.series.flatMap((s) => s.members.filter((pp) => pp.p.birth).map((pp) => ({ series: s.label, id: pp.p.id, ...pp.p.birth })));
    return { figures, html: table([T('Cohort', 'Cohorte'), T('Variable', 'Variable'), 'n', T('Median [IQR]', 'Médiane [EIQ]')], rows), csv: { name: 'birth', rows: csv },
      notes: [...seriesNotes(info), T('As reported; values out of range were left out at the build.', 'Tels que rapportés ; les valeurs aberrantes ont été écartées à la construction.')] };
  },
};

const LOG_LABS = new Set(['ALT', 'AST', 'GGT', 'ALP', 'TB', 'CB', 'SBA', 'AFP', 'CA 19-9', 'PLT', 'WBC']);

export const lab = {
  run(q) {
    const v = q.ast.analysis.id;
    const info = buildSeries(q);
    const unit = q.ctx.release.lexicon.labs[v]?.unit || '';
    const sinceOnset = q.ast.options.x === 'onset';
    const yLog = LOG_LABS.has(v);
    const data = info.series.map((s) => {
      const pts = [];
      let pats = 0;
      for (const pp of s.members) {
        const ser = (pp.p.lab || []).find((x) => x.var === v);
        if (!ser) continue;
        if (sinceOnset && pp.p.onset_m == null) continue;
        pats++;
        ser.t_m.forEach((t, i) => {
          const x = sinceOnset ? (t - pp.p.onset_m) / 12 : t / 12;
          pts.push({ x, y: ser.v[i], id: pp.p.id, title: `${pp.p.id}: ${ser.v[i]} ${unit} ${T('at', 'à')} ${fmt(x, 2)} ${T('y', 'a')}` });
        });
      }
      let line = [];
      if (pats >= MIN_N && pts.length >= 15) {
        const dx = describe(pts.map((p) => p.x));
        const lo = quantile(pts.map((p) => p.x).sort((a, b) => a - b), 0.05), hi = quantile(pts.map((p) => p.x).sort((a, b) => a - b), 0.95);
        const per = new Map();
        for (const p of pts) per.set(p.id, (per.get(p.id) || 0) + 1);
        line = loess(pts.map((p) => p.x), pts.map((p) => (yLog ? Math.log10(Math.max(p.y, 1e-3)) : p.y)), { weights: pts.map((p) => 1 / per.get(p.id)) })
          .filter((p) => p.x >= lo && p.x <= hi && dx.n).map((p) => ({ x: p.x, y: yLog ? 10 ** p.y : p.y }));
      }
      return { s, pts, pats, line, d: describe(pts.map((p) => p.y)) };
    });
    const { list, note } = drawn(info.series);
    const svg = scatter({ series: data.filter((d) => list.includes(d.s) && d.pts.length).map((d) => ({ label: `${d.s.label} (${d.pats})`, colour: d.s.colour, points: d.pts, line: d.line })),
      xLabel: sinceOnset ? T('Years since first symptoms', 'Années depuis les premiers symptômes') : T('Age (years)', 'Âge (années)'),
      yLabel: `${v}${unit ? ` (${unit})` : ''}`, yLog, title: v });
    const rows = data.map((d) => [`${swatch(d.s)}${esc(d.s.label)}`, `${d.pats}/${d.s.n}`, d.pts.length, d.d.n ? `${fmt(d.d.median, 1)} [${fmt(d.d.q1, 1)}–${fmt(d.d.q3, 1)}]` : '–']);
    const csv = data.flatMap((d) => d.pts.map((p) => ({ series: d.s.label, id: p.id, x_years: p.x, value: p.y, unit })));
    return { figures: [{ name: `lab_${v}`, svg, note }], html: table([T('Cohort', 'Cohorte'), T('Patients with values', 'Patients avec valeurs'), T('Values', 'Valeurs'), `${T('Median [IQR]', 'Médiane [EIQ]')} ${esc(unit)}`], rows),
      csv: { name: `lab_${v.replace(/\s/g, '_')}`, rows: csv },
      notes: [...seriesNotes(info), T(`Each point is one reported value; lines: LOESS (span 0.75)${yLog ? ' on a log scale' : ''}, each patient weighted equally, for groups of at least ${MIN_N} patients and 15 values, between the 5th and 95th centiles of x. Units converted at the build. x=onset: time since first symptoms.`,
        `Chaque point est une valeur rapportée ; courbes : LOESS (span 0,75)${yLog ? ' en échelle log' : ''}, chaque patient ayant le même poids, pour les groupes d’au moins ${MIN_N} patients et 15 valeurs, entre les 5e et 95e centiles de x. Unités converties à la construction. x=onset : temps depuis les premiers symptômes.`)] };
  },
};

const EFF = ['response', 'partial', 'transient', 'mixed', 'none', 'worse', 'unclear', 'planned'];
const EFF_COL = ['#1a9850', '#91cf60', '#d9ef8b', '#fee08b', '#bdbdbd', '#d73027', '#eef0f2', '#9ecae1'];
const effLabel = (e) => ({ response: T('response', 'réponse'), partial: T('partial', 'partielle'), transient: T('transient', 'transitoire'), mixed: T('mixed', 'mixte'),
  none: T('none', 'aucune'), worse: T('worse', 'aggravation'), unclear: T('unclear', 'incertaine'), planned: T('planned', 'prévu') }[e] || e);

function effRow(label, entries) {
  const n = entries.length;
  const c = EFF.map((e) => entries.filter((x) => x.eff === e).length);
  return { label: `${label} (${n})`, bars: c.map((k, i) => ({ v: n ? k / n : 0, colour: EFF_COL[i], title: `${effLabel(EFF[i])}: ${k}/${n}` })), c, n };
}

export const treatments = {
  run(q) {
    const info = buildSeries(q);
    const figures = [];
    const rows = [];
    const csv = [];
    info.series.forEach((s) => {
      const by = new Map();
      for (const pp of s.members) for (const t of pp.p.tx || []) {
        if (!by.has(t.name)) by.set(t.name, { cls: t.class, patients: new Set(), entries: [] });
        const e = by.get(t.name); e.patients.add(pp.p.id); e.entries.push(t);
      }
      const top = [...by.entries()].sort((a, b) => b[1].patients.size - a[1].patients.size).slice(0, 15);
      for (const [name, e] of top) {
        const r = effRow(name, e.entries);
        rows.push([`${swatch(s)}${esc(s.label)}`, esc(name), esc(e.cls), `${e.patients.size}/${s.n}`, r.n, ...r.c]);
        csv.push({ series: s.label, treatment: name, class: e.cls, patients: e.patients.size, n: s.n, ...Object.fromEntries(EFF.map((k, i) => [k, r.c[i]])) });
      }
      if (info.series.length <= 3 && top.length) figures.push({ name: `treatments_${figures.length + 1}`, svg: hbars({ mode: 'stacked', rows: top.map(([name, e]) => effRow(name, e.entries)),
        legendItems: EFF.map((e, i) => ({ label: effLabel(e), colour: EFF_COL[i] })), xLabel: T(`Courses of treatment by reported effect (${s.label})`, `Traitements selon l’effet rapporté (${s.label})`), title: s.label }) });
    });
    return { figures, html: table([T('Cohort', 'Cohorte'), T('Treatment', 'Traitement'), T('Class', 'Classe'), T('Patients', 'Patients'), T('Courses', 'Traitements'), ...EFF.map(effLabel)], rows),
      csv: { name: 'treatments', rows: csv }, notes: [...seriesNotes(info), T('The 15 treatments given to most patients in each cohort; effect per course of treatment, as reported.', 'Les 15 traitements les plus fréquents dans chaque cohorte ; effet par traitement, tel que rapporté.')] };
  },
};

export const treatment = {
  run(q) {
    const name = q.ast.analysis.id;
    const info = buildSeries(q, { kind: 'facet', id: 'gene' });
    const data = info.series.map((s) => {
      const entries = s.members.flatMap((pp) => (pp.p.tx || []).filter((t) => t.name === name));
      const pats = s.members.filter((pp) => (pp.p.tx || []).some((t) => t.name === name)).length;
      return { s, entries, pats, start: describe(entries.map((t) => t.start_m)) };
    }).filter((d) => d.pats > 0);
    const svg = data.length ? hbars({ mode: 'stacked', rows: data.map((d) => effRow(d.s.label, d.entries)), legendItems: EFF.map((e, i) => ({ label: effLabel(e), colour: EFF_COL[i] })),
      xLabel: T('Courses of treatment by reported effect', 'Traitements selon l’effet rapporté'), title: name }) : '';
    const rows = data.map((d) => [`${swatch(d.s)}${esc(d.s.label)}`, `${d.pats}/${d.s.n}`, d.entries.length, d.start.n ? `${fmt(d.start.median, 1)} (${d.start.n})` : '–',
      ...EFF.map((e) => d.entries.filter((x) => x.eff === e).length)]);
    const csv = data.flatMap((d) => d.s.members.flatMap((pp) => (pp.p.tx || []).filter((t) => t.name === name).map((t) => ({ series: d.s.label, id: pp.p.id, start_months: t.start_m ?? '', duration_months: t.dur_m ?? '', effect: t.eff }))));
    return { figures: svg ? [{ name: `treatment_${name}`, svg }] : [], html: data.length ? table([T('Group', 'Groupe'), T('Treated', 'Traités'), T('Courses', 'Traitements'),
      T('Age at start, months: median (n)', 'Âge au début, mois : médiane (n)'), ...EFF.map(effLabel)], rows) : `<p class="muted">${T('No patient of the query received it.', 'Aucun patient de la requête ne l’a reçu.')}</p>`,
      csv: { name: `treatment_${name.replace(/\W+/g, '_')}`, rows: csv },
      notes: [...seriesNotes(info), T('Without “by”, patients are split by gene. Effect per course, as reported.', 'Sans « par », répartition par gène. Effet par traitement, tel que rapporté.')] };
  },
};

const doiLink = (a) => (a?.doi ? `<a href="https://doi.org/${esc(a.doi)}" target="_blank" rel="noopener">${esc(a.doi)}</a>${a.label ? ` <span class="muted">(${esc(a.label)})</span>` : ''}` : '–');

export const patients = {
  run(q) {
    const info = buildSeries(q);
    const all = info.series.flatMap((s) => s.members.map((pp) => ({ s, pp })));
    const LIMIT = 300;
    const rows = all.slice(0, LIMIT).map(({ s, pp }) => {
      const p = pp.p;
      return [`${swatch(s)}${esc(p.id)}`, esc((p.dis || []).join(', ')), `<i>${esc((p.gene || []).join(', '))}</i>`, p.sex || '–', p.onset_m ?? '–',
        p.status ? `${p.status}${p.age_y != null ? ` (${fmt(p.age_y, 1)})` : ''}` : '–', (p.hp || []).length, (p.art || []).map(doiLink).join('<br>')];
    });
    const csv = all.map(({ s, pp }) => ({ series: s.label, id: pp.p.id, diseases: (pp.p.dis || []).join('; '), genes: (pp.p.gene || []).join('; '), sex: pp.p.sex || '', onset_months: pp.p.onset_m ?? '',
      status: pp.p.status || '', age_years: pp.p.age_y ?? '', terms: (pp.p.hp || []).map((h) => h[0]).join('; '), absent: (pp.p.abs || []).join('; '),
      articles: (pp.p.art || []).map((a) => a.doi).join('; ') }));
    return { figures: [], html: table([T('Record', 'Fiche'), T('Disease', 'Maladie'), T('Gene', 'Gène'), T('Sex', 'Sexe'), T('Onset (months)', 'Début (mois)'),
      T('Status (age, years)', 'Statut (âge, années)'), T('Terms', 'Termes'), T('Article (patient label)', 'Article (libellé du patient)')], rows, 'patients'),
      csv: { name: 'patients', rows: csv }, notes: [...seriesNotes(info), ...(all.length > LIMIT ? [T(`First ${LIMIT} of ${all.length} records; all are in the CSV.`, `${LIMIT} premières fiches sur ${all.length} ; toutes figurent dans le CSV.`)] : [])] };
  },
};

export const articles = {
  run(q) {
    const info = buildSeries(q);
    const by = new Map();
    for (const s of info.series) for (const pp of s.members) for (const a of pp.p.art || []) {
      if (!a.doi) continue;
      if (!by.has(a.doi)) by.set(a.doi, { a, ids: new Set() });
      by.get(a.doi).ids.add(pp.p.id);
    }
    const list = [...by.values()].sort((x, y) => y.ids.size - x.ids.size || (y.a.year || 0) - (x.a.year || 0));
    const rows = list.map(({ a, ids }) => [doiLink({ doi: a.doi }), a.year || '–', ids.size]);
    return { figures: [], html: table(['DOI', T('Year', 'Année'), T('Patients of the query', 'Patients de la requête')], rows),
      csv: { name: 'articles', rows: list.map(({ a, ids }) => ({ doi: a.doi, year: a.year ?? '', patients: ids.size })) }, notes: seriesNotes(info) };
  },
};
