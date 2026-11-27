// Pages besides the query page: Browse (what the release holds, with a query for each entry), Syntax (the
// query language, generated from the vocabulary and the registry) and About. Links with data-q run a query.
import { parse } from '../query/parse.js';
import { canonical } from '../query/format.js';
import { quoteIfNeeded, norm } from '../query/text.js';
import { FIELDS, FACETS, OPTIONS, FRENCH, OPERATORS } from '../query/vocab.js';
import { ANALYSES } from '../analyses/registry.js';
import { getLang } from '../i18n/strings.js';
import { esc } from './describe.js';

const T = (en, fr) => (getLang() === 'fr' ? fr : en);
const fmtN = (n) => Number(n).toLocaleString(getLang() === 'fr' ? 'fr-FR' : 'en-GB');

/** Link that runs a query: shown in the language of the page, canonical in the URL. */
export function qlink(text, L, label = null) {
  const ast = parse(text, L);
  if (!ast.ok) return esc(label || text);
  const q = canonical(ast, L);
  return `<a href="?q=${encodeURIComponent(q)}" data-q="${esc(q)}">${esc(label || canonical(ast, L, getLang()))}</a>`;
}

const tableHTML = (head, rows, cls = '') => `<div class="table-wrap"><table class="data ${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr data-text="${esc(norm(r.text || ''))}">${r.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// ---- Browse ---------------------------------------------------------------------------------------
function browse({ ctx, L }) {
  const lex = ctx.release.lexicon;
  const sorted = (o) => Object.entries(o).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  const top = (by, n = 4) => Object.entries(by || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  const dis = (d) => `dis:${quoteIfNeeded(d)}`;
  const dRows = sorted(lex.diseases).map(([d, v]) => ({ text: `${d} ${Object.keys(v.by || {}).join(' ')}`, cells: [
    esc(d), fmtN(v.n), top(v.by).map(([g, n]) => `<i>${esc(g)}</i> ${n}`).join(', ') || '–',
    [qlink(dis(d), L, T('overview', 'aperçu')), qlink(`survival ${dis(d)} by gene`, L, T('survival', 'survie')),
      qlink(`symptoms ${dis(d)}`, L, T('symptoms', 'symptômes')), qlink(`patients ${dis(d)}`, L, T('patients', 'patients'))].join(' · ')] }));
  const gRows = sorted(lex.genes).map(([g, v]) => ({ text: `${g} ${Object.keys(v.by || {}).join(' ')}`, cells: [
    `<i>${esc(g)}</i>`, fmtN(v.n), top(v.by).map(([d, n]) => `${esc(d)} ${n}`).join(', ') || '–',
    [qlink(`gene:${g}`, L, T('overview', 'aperçu')), qlink(`survival gene:${g}`, L, T('survival', 'survie')), qlink(`variants gene:${g}`, L, T('variants', 'variants')),
      qlink(`cadd gene:${g}`, L, 'CADD')].join(' · ')] }));
  const pRows = Object.entries(lex.pfic_aliases || {}).map(([k, v]) => ({ text: `${k} ${v.gene}`, cells: [esc(k), `<i>${esc(v.gene)}</i>`,
    [qlink(k, L, T('overview', 'aperçu')), qlink(`survival ${k}`, L, T('survival', 'survie')), qlink(`symptoms ${k}`, L, T('symptoms', 'symptômes'))].join(' · ')] }));
  const runs = [...(ctx.runs || [])].sort((a, b) => a.n - b.n);
  const aRows = runs.map((r) => ({ text: `${r.label.en} ${r.genes.join(' ')}`, cells: [esc(r.label[getLang()] || r.label.en),
    r.genes.length > 6 ? `${r.genes.length} ${T('genes', 'gènes')}` : r.genes.map((g) => `<i>${esc(g)}</i>`).join(', '), fmtN(r.n), r.ranks.map((k) => k.k).join(', '),
    [qlink(`clusters gene:${r.genes.join(',')}`, L, T('clusters', 'groupes')), qlink(`survival gene:${r.genes.join(',')} by cluster`, L, T('survival by cluster', 'survie par groupe'))].join(' · ')] }));
  const lRows = Object.entries(lex.labs).sort((a, b) => b[1].patients - a[1].patients).map(([v, x]) => ({ text: v, cells: [esc(v), esc(x.unit || ''), fmtN(x.patients), fmtN(x.points),
    [qlink(`${v} all by disease`, L, T('by disease', 'par maladie')), qlink(`${v} PFIC by gene`, L, T('PFIC by gene', 'PFIC par gène'))].join(' · ')] }));
  const tRows = Object.entries(lex.treatments).sort((a, b) => b[1].patients - a[1].patients || a[0].localeCompare(b[0])).map(([t, x]) => ({ text: `${t} ${x.class}`,
    cells: [esc(t), esc(x.class || ''), fmtN(x.patients), [qlink(`tx:${quoteIfNeeded(t)} by gene`, L, T('by gene', 'par gène')), qlink(`tx:${quoteIfNeeded(t)} by disease`, L, T('by disease', 'par maladie'))].join(' · ')] }));
  const sec = (id, title, intro, head, rows) => rows.length ? `<section class="browse-part" id="b-${id}"><h3>${title} <span class="muted">(${rows.length})</span></h3>${intro ? `<p class="small muted">${intro}</p>` : ''}${tableHTML(head, rows)}</section>` : '';
  const nav = [['diseases', T('Diseases', 'Maladies')], ['genes', T('Genes', 'Gènes')], ['pfic', 'PFIC'], ['alphi', T('ALPHI cohorts', 'Cohortes ALPHI')],
    ['labs', T('Laboratory values', 'Valeurs biologiques')], ['tx', T('Treatments', 'Traitements')]].map(([id, t]) => `<a href="#b-${id}">${t}</a>`).join(' · ');
  return `<h2>${T('Browse', 'Parcourir')}</h2>
    <p>${T('What the release holds, with the queries that open it. Every link opens a card on the query page; the query can then be edited.',
      'Contenu de la version, avec les requêtes qui y donnent accès. Chaque lien ouvre une carte sur la page des requêtes ; la requête peut ensuite être modifiée.')}</p>
    <p class="small">${nav}</p>
    <input type="search" id="browse-filter" class="browse-filter" placeholder="${T('Filter the tables…', 'Filtrer les tableaux…')}" aria-label="${T('Filter', 'Filtrer')}">
    ${sec('diseases', T('Diseases', 'Maladies'), T('Disease labels as reported (no merging); a patient can have two labels.', 'Libellés de maladie tels que rapportés (sans regroupement) ; un patient peut avoir deux libellés.'),
      [T('Disease', 'Maladie'), T('Patients', 'Patients'), T('Genes', 'Gènes'), T('Queries', 'Requêtes')], dRows)}
    ${sec('genes', T('Genes', 'Gènes'), '', [T('Gene', 'Gène'), T('Patients', 'Patients'), T('Diseases', 'Maladies'), T('Queries', 'Requêtes')], gRows)}
    ${sec('pfic', T('PFIC types', 'Types de PFIC'), T('PFIC1–10: PFIC with the gene of the type.', 'PFIC1–10 : PFIC avec le gène du type.'), [T('Type', 'Type'), T('Gene', 'Gène'), T('Queries', 'Requêtes')], pRows)}
    ${sec('alphi', T('ALPHI cohorts', 'Cohortes ALPHI'), T('Cohorts clustered by ALPHI for this release; k: eligible numbers of clusters, ALPHI’s choice first.', 'Cohortes regroupées par ALPHI pour cette version ; k : nombres de groupes éligibles, le choix d’ALPHI en premier.'),
      [T('Cohort', 'Cohorte'), T('Genes', 'Gènes'), T('Patients', 'Patients'), 'k', T('Queries', 'Requêtes')], aRows)}
    ${sec('labs', T('Laboratory values', 'Valeurs biologiques'), T('Units converted at the build.', 'Unités converties à la construction.'),
      [T('Variable', 'Variable'), T('Unit', 'Unité'), T('Patients', 'Patients'), T('Values', 'Valeurs'), T('Queries', 'Requêtes')], lRows)}
    ${sec('tx', T('Treatments', 'Traitements'), '', [T('Treatment', 'Traitement'), T('Class', 'Classe'), T('Patients', 'Patients'), T('Queries', 'Requêtes')], tRows)}`;
}

// ---- Syntax ---------------------------------------------------------------------------------------
const ANALYSIS_TEXT = {
  overview: ['Patients, articles, sex, onset, deaths, survival at 5 years and most reported symptoms, under a phenomeprint of each cohort. Written as the cohort alone.',
    'Patients, articles, sexe, début, décès, survie à 5 ans et symptômes les plus rapportés, sous un phénomeprint de chaque cohorte. S’écrit par la cohorte seule.', 'PFIC vs MVID'],
  phenomeprint: ['Symptoms by organ system (angle) and HPO level (ring); bubble area = share of patients.', 'Symptômes par système d’organes (angle) et niveau HPO (anneau) ; aire des bulles = part des patients.', 'phenomeprint MVID vs MVID+PFIC'],
  survival: ['Kaplan-Meier survival on age at death or at the last report.', 'Survie de Kaplan-Meier sur l’âge au décès ou aux dernières nouvelles.', 'survival PFIC by gene'],
  onset: ['Age at first symptoms: cumulative curve, median and onset periods.', 'Âge aux premiers symptômes : courbe cumulée, médiane et périodes de début.', 'onset MYO5B by zygosity'],
  symptoms: ['The symptoms most often present, with those reported absent.', 'Les symptômes les plus souvent présents, avec ceux rapportés absents.', 'symptoms THES1 vs THES2'],
  variants: ['Variant types per allele.', 'Types de variants par allèle.', 'variants ABCB11 vs ABCB4'],
  zygosity: ['Homozygous, compound heterozygous and heterozygous patients.', 'Patients homozygotes, hétérozygotes composites et hétérozygotes.', 'zygosity PFIC by gene'],
  cadd: ['CADD tiers (ClinGen PP3/BP4) of missense alleles, and CADD scores.', 'Classes CADD (ClinGen PP3/BP4) des allèles faux-sens, et scores CADD.', 'cadd PFIC by gene'],
  sex: ['Boys and girls.', 'Garçons et filles.', 'sex ARC syndrome vs THES2'],
  birth: ['Birth weight, gestational age, length and head circumference.', 'Poids, terme, taille et périmètre crânien de naissance.', 'birth PFIC by gene'],
  treatments: ['The treatments given most often, with their reported effect.', 'Les traitements les plus souvent donnés, avec leur effet rapporté.', 'treatments PFIC'],
  patients: ['The patient records, with their articles.', 'Les fiches des patients, avec leurs articles.', 'patients MVID year:2015-2026'],
  articles: ['The articles reporting the patients.', 'Les articles rapportant les patients.', 'articles MYO5B'],
  clusters: ['The ALPHI clustering of the cohort: UMAP map, phenomeprints, stability and genes by cluster.', 'La partition ALPHI de la cohorte : carte UMAP, phénomeprints, stabilité et gènes par groupe.', 'clusters MYO5B'],
  help: ['A short reminder of the syntax.', 'Un court rappel de la syntaxe.', 'help'],
};
// [English text, French text, English example, French example]: examples are shown as written, prefixes included
const FIELD_TEXT = {
  disease: ['disease label', 'libellé de maladie', 'dis:"ARC syndrome"', 'maladie:"ARC syndrome"'],
  gene: ['gene', 'gène', 'gene:ABCB11,ABCB4', 'gène:ABCB11,ABCB4'],
  sex: ['boys, girls', 'garçons, filles', 'PFIC among girls', 'PFIC parmi filles'],
  zyg: ['homozygous, compound, heterozygous', 'homozygotes, composites, hétérozygotes', 'MYO5B among homozygous', 'MYO5B parmi homozygotes'],
  var: ['variant type of an allele', 'type de variant d’un allèle', 'PFIC among var:nonsense,frameshift', 'PFIC parmi var:non-sens,frameshift'],
  cadd: ['CADD tier of a missense allele (pp3, bp4 or one tier)', 'classe CADD d’un allèle faux-sens (pp3, bp4 ou une classe)', 'ABCB11 among cadd:pp3', 'ABCB11 parmi cadd:pp3'],
  onset: ['onset period', 'période de début', 'PFIC among onset:infancy', 'PFIC parmi début:nourrissons'],
  status: ['dead, alive', 'décédés, vivants', 'MVID among dead', 'MVID parmi décédés'],
  cons: ['consanguinity', 'consanguinité', 'PFIC among cons:yes', 'PFIC parmi consanguinité:oui'],
  tx: ['treated with', 'traités par', 'PFIC among tx:odevixibat', 'PFIC parmi traitement:odevixibat'],
  cluster: ['ALPHI cluster (with k= for another clustering)', 'groupe ALPHI (avec k= pour une autre partition)', 'MYO5B cluster:1', 'MYO5B groupe:1'],
  year: ['year of publication, or a range', 'année de publication, ou un intervalle', 'MVID year:2015-2026', 'MVID année:2015-2026'],
  doi: ['article', 'article', 'patients doi:10.1038/ng.225', 'patients doi:10.1038/ng.225'],
  term: ['HPO term by its code', 'terme HPO par son code', 'PFIC with hp:0000989', 'PFIC avec hp:0000989'],
};
const OPTION_TEXT = {
  k: ['number of clusters: another eligible ALPHI clustering', 'nombre de groupes : une autre partition ALPHI éligible', 'clusters MYO5B k=6'],
  x: ['x axis of laboratory values: age (default) or onset (time since first symptoms)', 'axe x des valeurs biologiques : âge (par défaut) ou onset (temps depuis les premiers symptômes)', 'ALT PFIC by gene x=onset'],
  top: ['number of symptoms shown (default 20)', 'nombre de symptômes affichés (20 par défaut)', 'symptoms PFIC top=40'],
  sub: ['off: count a term as reported, without its subterms', 'off : compter un terme tel que rapporté, sans ses sous-termes', 'symptoms PFIC sub=off'],
  stats: ['on: tests (log-rank, Fisher with Benjamini-Hochberg, chi-square)', 'on : tests (log-rank, Fisher avec Benjamini-Hochberg, khi-deux)', 'survival PFIC2 vs PFIC3 stats=on'],
  style: ['phenomeprint drawn as bubbles (default) or arcs', 'phénomeprint en bulles (par défaut) ou en arcs', 'phenomeprint PFIC2 style=arc'],
  layout: ['phenomeprint layout (reserved)', 'disposition du phénomeprint (réservé)', ''],
  mark: ['HPO terms outlined and numbered on the phenomeprint', 'termes HPO entourés et numérotés sur le phénomeprint', 'phenomeprint PFIC2 mark=HP:0001396'],
};

function syntax({ L }) {
  const fr = getLang() === 'fr';
  const ex = (q) => (q ? qlink(q, L) : '');
  const word = (en) => (fr ? (FRENCH.operators[en] || en) : en);
  const aRows = ANALYSES.filter((a) => !a.implicit && ANALYSIS_TEXT[a.id]).map((a) => {
    const [ten, tfr, q] = ANALYSIS_TEXT[a.id];
    return { cells: [`<code>${esc(a.names.en[0])}</code>`, `<code>${esc(FRENCH.analyses[a.id] || a.names.fr?.[0] || '')}</code>`, esc(T(ten, tfr)),
      a.options.map((o) => `<code>${o}=</code>`).join(' ') || '–', ex(q)] };
  });
  const fRows = Object.entries(FIELDS).map(([id, f]) => {
    const [ten, tfr, qen, qfr] = FIELD_TEXT[id] || ['', '', '', ''];
    const q = fr ? qfr : qen;
    const pre = [...new Set([f.prefixes[0], FRENCH.prefixes[id]].filter(Boolean))].map((x) => `<code>${esc(x)}:</code>`).join(' ');
    return { cells: [pre, esc(T(ten, tfr)), f.bare?.length ? T('yes', 'oui') : T('no', 'non'), q ? qlink(q, L, q) : ''] };
  });
  const facets = Object.entries(FACETS).map(([id, w]) => `<code>${esc(fr ? FRENCH.facets[id] : w[0])}</code>`).join(' ');
  const oRows = Object.keys(OPTIONS).filter((k) => OPTION_TEXT[k] && k !== 'layout').map((k) => ({ cells: [`<code>${k}=</code>`, esc(T(OPTION_TEXT[k][0], OPTION_TEXT[k][1])), ex(OPTION_TEXT[k][2])] }));
  return `<h2>${T('Query syntax', 'Syntaxe des requêtes')}</h2>
  <pre class="grammar">${T('[analysis] cohort {vs cohort} [among filters] [by facet] {option=value}', '[analyse] cohorte {contre cohorte} [parmi filtres] [par facette] {option=valeur}')}</pre>
  <p>${T('A query names what is shown (the analysis), for which patients (one or more cohorts), and how they are split. Everything but the cohort can be left out: a cohort alone gives its overview. English and French keywords are both read; a query is always stored in one canonical form, which goes into the link of its card.',
    'Une requête indique ce qui est montré (l’analyse), pour quels patients (une ou plusieurs cohortes) et comment ils sont répartis. Tout sauf la cohorte peut être omis : une cohorte seule donne son aperçu. Les mots-clés anglais et français sont lus ; une requête est toujours enregistrée sous une forme canonique, qui figure dans le lien de sa carte.')}</p>
  <h3>${T('Cohorts and filters', 'Cohortes et filtres')}</h3>
  <ul>
    <li>${T('Diseases, genes, PFIC types (PFIC1–10) and symptoms (HPO labels) are written as they are:', 'Maladies, gènes, types de PFIC (PFIC1–10) et symptômes (libellés HPO) s’écrivent tels quels :')} ${ex('MYO5B')}, ${ex('PFIC2')}, ${ex('dis:"ARC syndrome"')}, ${ex('cholestasis by gene')}.</li>
    <li>${T('A space joins filters (and); a comma joins values of the same field (or):', 'Une espace joint des filtres (et) ; une virgule joint des valeurs d’un même champ (ou) :')} ${ex('PFIC among boys')}, ${ex('gene:ABCB11,ABCB4')}.</li>
    <li><code>${word('with')}</code> / <code>${word('without')}</code>: ${T('a symptom reported present (the term or one of its subterms) or absent:', 'un symptôme rapporté présent (le terme ou un de ses sous-termes) ou absent :')} ${ex('PFIC with pruritus without jaundice')}.</li>
    <li><code>${word('vs')}</code>: ${T('two or more cohorts, side by side:', 'deux cohortes ou plus, côte à côte :')} ${ex('survival THES1 vs THES2')}. <code>${fr ? FRENCH.all : 'all'}</code>: ${T('every patient of the release', 'tous les patients de la version')}.</li>
    <li><code>${word('among')}</code>: ${T('filters applied to every cohort:', 'filtres appliqués à chaque cohorte :')} ${ex('survival PFIC2 vs PFIC3 among boys')}.</li>
    <li><code>${word('by')}</code>: ${T('split into groups by a facet or a symptom:', 'répartition en groupes selon une facette ou un symptôme :')} ${ex('survival MYO5B by cholestasis')}. ${T('Facets:', 'Facettes :')} ${facets}.</li>
  </ul>
  <h3>${T('Fields', 'Champs')}</h3>
  <p class="small">${T('A value is written with its prefix (gene:MYO5B) when it would otherwise be read as something else; values marked “bare” are also read alone.', 'Une valeur s’écrit avec son préfixe (gene:MYO5B) quand elle serait sinon lue autrement ; les valeurs marquées « seules » sont aussi lues sans préfixe.')}</p>
  ${tableHTML([T('Prefix', 'Préfixe'), T('Field', 'Champ'), T('Bare values', 'Valeurs seules'), T('Example', 'Exemple')], fRows, 'syntax')}
  <h3>${T('Analyses', 'Analyses')}</h3>
  ${tableHTML(['English', 'Français', T('Shows', 'Montre'), T('Options', 'Options'), T('Example', 'Exemple')], aRows, 'syntax')}
  <p>${T('Three more analyses are named by their subject, written first:', 'Trois autres analyses sont désignées par leur sujet, écrit en premier :')}
    ${T('a laboratory variable (its values over age)', 'une variable biologique (ses valeurs selon l’âge)')} ${ex('ALT PFIC by gene')};
    ${T('a symptom (its share by group; by disease when no cohort is given)', 'un symptôme (sa part par groupe ; par maladie sans cohorte)')} ${ex('cholestasis')};
    ${T('a treatment (its reported effect; by gene when no facet is given)', 'un traitement (son effet rapporté ; par gène sans facette)')} ${ex('odevixibat by gene')}.</p>
  <h3>${T('Options', 'Options')}</h3>
  ${tableHTML([T('Option', 'Option'), T('Effect', 'Effet'), T('Example', 'Exemple')], oRows, 'syntax')}
  <h3>${T('Links', 'Liens')}</h3>
  <p>${T('The address of the page holds its cards: ?q= once per card, &lang=fr for French and &r= for a release other than the latest. “Copy link” on a card gives the link to that card alone.',
    'L’adresse de la page contient ses cartes : ?q= une fois par carte, &lang=fr pour le français et &r= pour une version autre que la dernière. « Copier le lien » sur une carte donne le lien de cette seule carte.')}</p>
  <p class="small muted">${T('Unknown words stop the query, with suggestions; nothing is replaced silently. Words recognised:', 'Les mots inconnus arrêtent la requête, avec des suggestions ; rien n’est remplacé en silence. Mots reconnus :')}
    ${Object.entries(OPERATORS).map(([, w]) => w.filter((x) => x !== '|').map((x) => `<code>${esc(x)}</code>`).join(' ')).join(' · ')}</p>`;
}

// ---- About ----------------------------------------------------------------------------------------
function about({ ctx }) {
  const rel = ctx.release;
  const rRows = rel.releases.map((r) => ({ cells: [r.id === rel.id ? `<strong>${esc(r.id)}</strong>` : `<a href="?r=${esc(r.id)}">${esc(r.id)}</a>`, esc(r.date || ''), fmtN(r.n_patients),
    fmtN(r.n_articles), r.alphi ? `${esc(r.alphi.version || '–')} (${r.alphi.runs} ${T('cohorts', 'cohortes')})` : '–'] }));
  return `<h2>${T('About PytheasDB', 'À propos de PytheasDB')}</h2>
  <p>${T('PytheasDB is an open-access database of the clinical data of patients reported in the literature on rare paediatric digestive diseases. Each patient of each article is recorded with the disease, the gene and the variants, the symptoms (HPO terms, present or absent, with their age at onset), laboratory values, treatments and their effect, and the outcome.',
    'PytheasDB est une base de données en accès libre des données cliniques des patients rapportés dans la littérature sur les maladies digestives rares de l’enfant. Chaque patient de chaque article y est enregistré avec la maladie, le gène et les variants, les symptômes (termes HPO, présents ou absents, avec leur âge de début), les valeurs biologiques, les traitements et leur effet, et l’évolution.')}</p>
  <p>${T('Please cite', 'Merci de citer')} <a href="https://pubmed.ncbi.nlm.nih.gov/39628627/" target="_blank" rel="noopener">Percheron, Guerry &amp; Fabre (2024)</a>.</p>
  <h3>${T('Data releases', 'Versions des données')}</h3>
  ${tableHTML([T('Release', 'Version'), T('Date', 'Date'), T('Patients', 'Patients'), T('Articles', 'Articles'), 'ALPHI'], rRows, 'releases')}
  <h3>${T('How the figures are computed', 'Calcul des figures')}</h3>
  <ul class="methods">
    <li>${T('All analyses are computed in the browser from the patient records of the release; only the ALPHI clusterings are computed beforehand.', 'Toutes les analyses sont calculées dans le navigateur à partir des fiches de la version ; seules les partitions ALPHI sont calculées à l’avance.')}</li>
    <li>${T('Symptoms: a patient carries a term when the term or one of its subterms is reported present (true-path rule); a term is absent when it, or a broader term, is reported absent and it is not present. Symptoms that resolved count as present.',
      'Symptômes : un patient porte un terme si le terme ou un de ses sous-termes est rapporté présent (règle du chemin vrai) ; un terme est absent s’il est rapporté absent, lui ou un terme plus large, et qu’il n’est pas présent. Les symptômes résolus comptent comme présents.')}</li>
    <li>${T('Disease labels are kept as reported, without merging.', 'Les libellés de maladie sont conservés tels que rapportés, sans regroupement.')}</li>
    <li>${T('CADD tiers: ClinGen PP3/BP4 thresholds for CADD v1.6 (Pejaver et al., 2022), applied to missense alleles.', 'Classes CADD : seuils ClinGen PP3/BP4 pour CADD v1.6 (Pejaver et al., 2022), appliqués aux allèles faux-sens.')}</li>
    <li>${T('Survival: Kaplan-Meier estimate with Greenwood variance and 95% confidence intervals on the log(−log) scale; log-rank test. Comparisons of shares: Fisher exact test with Benjamini-Hochberg correction, or chi-square test. Tests are given on request only (stats=on): literature cohorts are selected samples, and p-values are descriptive.',
      'Survie : estimateur de Kaplan-Meier, variance de Greenwood et intervalles de confiance à 95 % sur l’échelle log(−log) ; test du log-rank. Comparaison de proportions : test exact de Fisher avec correction de Benjamini-Hochberg, ou test du khi-deux. Les tests ne sont donnés que sur demande (stats=on) : les cohortes de la littérature sont des échantillons sélectionnés, et les valeurs de p sont descriptives.')}</li>
    <li>${T('Phenomeprints: one layout for the whole release (organ system by angle, HPO level by ring, the digestive system on a quarter of the circle).', 'Phénomeprints : une même disposition pour toute la version (système d’organes selon l’angle, niveau HPO selon l’anneau, l’appareil digestif sur un quart du cercle).')}</li>
    <li>${T('ALPHI (agnostic latent phenotype identification) clusters the patients of a cohort by their symptoms:', 'ALPHI (agnostic latent phenotype identification) regroupe les patients d’une cohorte selon leurs symptômes :')} <a href="https://github.com/PaulGuerry/ALPHI" target="_blank" rel="noopener">github.com/PaulGuerry/ALPHI</a>.</li>
  </ul>
  <h3>${T('Contact and support', 'Contact et soutien')}</h3>
  <p><a href="mailto:contact.pytheasdb@gmail.com">contact.pytheasdb@gmail.com</a></p>
  <p>${T('PytheasDB is supported by', 'PytheasDB est soutenue par')}</p>
  <p class="sponsors"><a href="https://mirumpharma.com/" target="_blank" rel="noopener"><img src="img/mirum_logo.svg" alt="Mirum"></a>
    <a href="https://www.ipsen.com/" target="_blank" rel="noopener"><img src="img/ipsen_logo.png" alt="Ipsen" class="ipsen"></a></p>`;
}

export const PAGES = { browse, syntax, about };

/** Fills the page container; wires the filter of Browse. */
export function renderPage(name, el, env) {
  el.innerHTML = `<article class="page page-${name}">${PAGES[name](env)}</article>`;
  const f = el.querySelector('#browse-filter');
  if (f) f.addEventListener('input', () => {
    const v = norm(f.value.trim());
    el.querySelectorAll('tbody tr').forEach((tr) => { tr.hidden = v && !tr.dataset.text.includes(v); });
    el.querySelectorAll('.browse-part').forEach((s) => { s.hidden = v && !s.querySelector('tbody tr:not([hidden])'); });
  });
}
