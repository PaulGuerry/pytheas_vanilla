# Release build

`build_release.py` turns a PytheasDB export into a release of the website: `data/<release>/`.

```bash
# from the root of the site repository
build/build_release.py -f ~/GITHUB/ALPHI/261013_pytheasDB.json
# with the curator's HPO graph (obographs JSON) instead of build/hpo/hpo_dag.json.gz
build/build_release.py -f ~/GITHUB/ALPHI/261013_pytheasDB.json --hpo-json ~/HPO/hp_pg.json
```

The release id is read from the leading digits of the export file name (`261013`), or given with `--release`.
Standard library only; Python 3.11 or later.

## Outputs (`data/<release>/`)

| File | Contents |
| --- | --- |
| `patients.json.gz` | one record per patient; field list at the top of `build_release.py` |
| `lexicon.json` | diseases, genes, treatments, laboratory variables and HPO terms present, with counts; PFICn aliases; CADD tiers; onset periods |
| `hpo.json.gz` | label, parents, organ systems and synonyms of every term used and of its ancestors |
| `reference.json` | counts the site's tests must reproduce (n per disease and gene, sex, survival, onset, CADD tiers, top terms) |
| `phenomeprint_layout.json` | radial layout shared by every phenomeprint of the release: organ systems (order, colour, angles) and nodes (term, level, parent, angular span) |
| `build_report.md`, `build_report.json` | records left out, values not read, conflicts: to be read after each build |

`data/releases.json` lists the releases, latest first.

## Curation tables (`build/tables/`)

| Table | Role |
| --- | --- |
| `exclusions.tsv` | markers that leave a record out or remove a value (`EXCLUDE`, `Exclude(...)`, `Not tested`, ...) |
| `disease_labels.tsv` | every disease label with its count; a `replacement` fixes a spelling (no labels are merged) |
| `treatments.tsv` | raw treatment name or legacy token -> name shown, class, ATC code |
| `efficacy.tsv` | raw efficacy -> category shown |
| `labs.tsv` | raw variable and unit -> variable, unit and conversion factor |
| `hpo_edges.tsv` | is_a edges added to or removed from the HPO graph |
| `pfic_types.tsv` | query aliases PFIC1-PFIC10 |
| `phenomeprint_organs.tsv` | organ systems of the phenomeprints: drawing order, colour, fixed share of the circle |

A new value in a later export (a treatment, a lab unit, a disease label) appears in the build report; it is
added to the table and the build is run again.

## Rules applied

- Symptom terms: duplicates within a patient merged, earliest onset kept; onsets in months (the export gives
  years in `symptoms`, and `code(14m)` forms in `symptoms_age`).
- `transientsymptoms` are present terms later reported absent: kept as present and listed in `tr`.
  Other terms both present and absent are counted present and listed in the report.
- Laboratory values converted to one unit per variable; times in months.
- CADD tiers: ClinGen PP3/BP4 thresholds for CADD v1.6 (Pejaver et al., 2022), stored in `lexicon.json`.
- Phenomeprint layout: the layout of `extract_aars_phenomeprint.py`, computed once for the release. Terms drawn =
  those carried (true-path rule) by at least 3 patients and 25% of one disease of at least 10 patients, levels 1-8
  (the defining digestive terms lie at levels 7-8); order, colours and fixed shares from `phenomeprint_organs.tsv`
  (digestive system: a quarter of the circle, metabolism next to it); the other systems by `setmax`. The
  browser only counts, per cohort, the patients carrying each node. Options: `build_release.py --help`.

## ALPHI results (`data/<release>/clusters/`)

After the release is built and ALPHI has been run on its export (one run per cohort: `<key>.json` from
`alphi.py --output-json`, and the run's options in `<key>.args`):

```bash
cd <folder of the ALPHI results>
~/GITHUB/pytheas_vanilla/build/build_clusters.py --runs . --alphi-version "$(git -C ~/GITHUB/ALPHI rev-parse --short HEAD)"
```

- `manifest.json.gz` (read at page load): per cohort its genes, label (`build/tables/cluster_cohorts.tsv`, else the
  genes), settings (the `.args` text), patient ids and, for every eligible clustering, the cluster of each patient,
  the cluster sizes, stability (mean Jaccard, share dissolved) and few-feature flags. This gives `by cluster`,
  `cluster:` and `k=` in every analysis.
- `<key>.json.gz` (read by the cluster card only): UMAP coordinates and ALPHI's prevalent, archetypal and
  associated symptoms of every cluster.
- `build_report.md`: patients per run, ids of a run not found in the release, patients of the genes left out of the
  run.
- `data/releases.json`: `"alphi": {version, runs, built}` in the release's entry (kept when the release is rebuilt;
  rerun `build_clusters.py` if the export changed).

Run of a cohort on the site: the run whose genes are exactly those of the cohort's gene filter
(`clusters gene:MYO5B,STX3`); otherwise the run holding most of the cohort's patients (smallest on a tie). The
first clustering of a result file (ALPHI's choice) is shown unless `k=` names another eligible one.
