# Release build

`build_release.py` turns a PytheasDB export into a release of the website: `data/<release>/`.

```bash
# from the root of the site repository
build/build_release.py -f ~/GITHUB/ALPHI/261013_pytheasDB.json
# with the curator's HPO graph (obographs JSON) instead of data/hpo_dag.json.gz
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

A new value in a later export (a treatment, a lab unit, a disease label) appears in the build report; it is
added to the table and the build is run again.

## Rules applied

- Symptom terms: duplicates within a patient merged, earliest onset kept; onsets in months (the export gives
  years in `symptoms`, and `code(14m)` forms in `symptoms_age`).
- `transientsymptoms` are present terms later reported absent: kept as present and listed in `tr`.
  Other terms both present and absent are counted present and listed in the report.
- Laboratory values converted to one unit per variable; times in months.
- CADD tiers: ClinGen PP3/BP4 thresholds for CADD v1.6 (Pejaver et al., 2022), stored in `lexicon.json`.
