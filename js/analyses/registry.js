// Analysis registry: names, accepted options and facets of each analysis.
// Phase 2 holds the vocabulary only; phase 3 adds compute(), render() and csv() to each entry.
// lab, term and treatment are reached through a laboratory variable, an HPO term or a treatment
// written first in the query (e.g. "ALT PFIC by gene", "cholestasis by gene").

export const ANALYSES = [
  { id: 'overview', names: { en: ['overview', 'summary'], fr: ['apercu', 'resume'] }, options: ['sub'] },
  { id: 'phenomeprint', names: { en: ['phenomeprint', 'phenomeprints'], fr: ['phenomeprint', 'empreinte phenotypique'] },
    options: ['style', 'mark', 'layout'] },
  { id: 'survival', names: { en: ['survival', 'kaplan-meier', 'km'], fr: ['survie'] }, options: ['stats'] },
  { id: 'onset', names: { en: ['onset', 'age at onset', 'first symptoms'], fr: ['debut', 'age de debut', 'premiers symptomes'] },
    options: ['stats'] },
  { id: 'symptoms', names: { en: ['symptoms', 'phenotype', 'prevalence'], fr: ['symptomes', 'phenotype', 'prevalence'] },
    options: ['top', 'sub', 'stats'] },
  { id: 'variants', names: { en: ['variants', 'variant types'], fr: ['types de variants'] }, options: ['stats'] },
  { id: 'zygosity', names: { en: ['zygosity'], fr: ['zygotie'] }, options: ['stats'] },
  { id: 'cadd', names: { en: ['cadd', 'cadd scores', 'cadd score'], fr: ['scores cadd', 'score cadd'] }, options: ['stats'] },
  { id: 'sex', names: { en: ['sex', 'sex ratio'], fr: ['sexe', 'sex-ratio'] }, options: ['stats'] },
  { id: 'birth', names: { en: ['birth', 'birth weight'], fr: ['naissance', 'poids de naissance'] }, options: ['stats'] },
  { id: 'treatments', names: { en: ['treatments'], fr: ['traitements'] }, options: [] },
  { id: 'patients', names: { en: ['patients', 'cases'], fr: ['cas'] }, options: [] },
  { id: 'articles', names: { en: ['articles', 'references'], fr: ['references'] }, options: [] },
  { id: 'clusters', names: { en: ['clusters', 'alphi'], fr: ['groupes alphi'] }, options: ['k'] },
  { id: 'help', names: { en: ['help', '?'], fr: ['aide'] }, options: [] },
  // reached through the first word of the query, not through a keyword
  // a laboratory variable written first; 'longitudinal ALT' is also read as 'ALT'
  { id: 'lab', implicit: true, names: { en: ['longitudinal', 'trend'], fr: ['evolution', 'courbe'] }, options: ['x', 'stats'] },
  { id: 'term', implicit: true, options: ['sub', 'stats'] },
  { id: 'treatment', implicit: true, options: ['stats'] },
];

export const ANALYSIS_BY_ID = Object.fromEntries(ANALYSES.map((a) => [a.id, a]));
