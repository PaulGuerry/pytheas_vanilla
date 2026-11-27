# PytheasDB website

Frontend-only site of [PytheasDB](https://pytheasdb.com): plain HTML, CSS and ES modules, no build step for the
JavaScript, served by GitHub Pages. Every analysis is computed in the browser from the patient records of a data
release; only the ALPHI clusters are precomputed.

## Layout

| Path | Contents |
| --- | --- |
| `index.html`, `css/app.css`, `img/` | the page, its logos |
| `js/query/` | query language: vocabulary, lexicon, tokenizer, parser, canonical form |
| `js/analyses/` | `registry.js` (names EN/FR, options); `core.js` (overview, phenomeprint, survival, onset, symptoms, one symptom) `more.js` (variants, zygosity, CADD, sex, birth, laboratory values, treatments, one treatment, patients, articles) and `clusters.js` (ALPHI clusters); each `run(q)` returns the figures, table, CSV rows and notes of a card |
| `js/stats/stats.js` | Kaplan-Meier, log-rank, Fisher, chi-square, Benjamini-Hochberg, quantiles, LOESS |
| `js/charts/` | SVG figures (step curves, bars, heat map, scatter, ranges, phenomeprints) |
| `js/cohort/` | per-patient sets (true-path rule, CADD tiers, onset periods), cohort selection, `by` splits; `clusters.js`: the ALPHI run of a cohort and the cluster of a patient |
| `js/data/store.js` | release loader (browser and Node) |
| `js/ui/` | query bar, pills, autocomplete, cards, downloads, URL; `pages.js`: Browse, Syntax and About |
| `js/i18n/strings.js` | interface strings, English and French |
| `build/` | release build from a database export, and ALPHI results (`build/README.md`); `build/hpo/`: default HPO graph of the build |
| `data/releases.json`, `data/<release>/` | data releases |
| `tests/` | query, statistics (against scipy) and analysis tests (against `reference.json`) |

## Work on it locally (WSL)

```bash
python3 -m http.server 8000        # from the repository root, then open http://localhost:8000
node --test tests/*.test.mjs       # parser, cohorts, statistics and analyses
```

A new export: `build/build_release.py -f <export>.json`, then run the tests.

## Query syntax

```
query   = [analysis] cohort { "vs" cohort } [ "among" filters ] [ "by" facet ] { option }
cohort  = filter { filter }                     filters combine with AND; a comma joins values (OR)
filter  = word | field ":" value { "," value } | "with" term | "without" term
```

Examples: `PFIC`, `survival PFIC by gene`, `survie PFIC2 contre PFIC3 parmi garçons`, `cholestasis by gene`,
`survival MYO5B by cholestasis`, `ALT PFIC by gene x=onset`. Type `help` on the site for the reference.
