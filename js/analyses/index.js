// Analysis modules by registry id.
import * as core from './core.js';
import * as more from './more.js';
import { clusters } from './clusters.js';

export const MODULES = {
  overview: core.overview, phenomeprint: core.phenomeprint, survival: core.survival, onset: core.onset, symptoms: core.symptoms, term: core.term,
  variants: more.variants, zygosity: more.zygosity, cadd: more.cadd, sex: more.sex, birth: more.birth, lab: more.lab,
  treatments: more.treatments, treatment: more.treatment, patients: more.patients, articles: more.articles, clusters,
};

/** Runs the analysis of a parsed query: {html, figures, csv, notes}, or a promise of it (clusters). */
export function runAnalysis(ast, ctx, L) {
  const a = ast.analysis;
  const id = a.kind === 'analysis' ? a.id : a.kind;
  const mod = MODULES[id];
  if (!mod) return null;
  return mod.run({ ast, ctx, L });
}
