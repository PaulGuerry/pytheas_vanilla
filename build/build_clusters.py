#!/usr/local/bin/python3.14
"""Add ALPHI cluster results to a PytheasDB website release.

    build/build_clusters.py --runs ~/alphi_site/261013 --alphi-version "$(git -C ~/GITHUB/ALPHI rev-parse --short HEAD)"

Reads one ALPHI result per cohort in the --runs folder: <key>.json (written by alphi.py --output-json) and, when
present, <key>.args (the command-line options of the run, kept as the settings shown on the site). The key is the
sorted gene symbols joined by "_", as in run_alphi_batch.py; labels of the cohorts come from
build/tables/cluster_cohorts.tsv (the gene list otherwise).

Writes data/<release>/clusters/:
  manifest.json.gz   per cohort: genes, label, settings, patient ids and, for each eligible clustering (rank),
                     the cluster of every patient and the cluster sizes, stability and few-feature flags
                     (read at page load: "by cluster" and "cluster:" work in every analysis)
  <key>.json.gz      per cohort: UMAP coordinates and the symptom lists of ALPHI (read by the cluster card)
  build_report.md    patients of each run, ids not found in the release, patients of the genes not clustered
and adds "alphi" to the release's entry of data/releases.json. The release (patients.json.gz) must be built first.
"""
import argparse
import datetime
import gzip
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOP_PREVALENT = 30


def num(x):
    """98, "98%", "98.0 %" -> 98.0; anything else -> None."""
    if isinstance(x, (int, float)):
        return float(x)
    m = re.match(r"^\s*([\d.]+)\s*%?\s*$", str(x or ""))
    return float(m.group(1)) if m else None


def pvalue(x):
    """Numbers stay numbers; strings such as "< 0.001" are kept as written."""
    if isinstance(x, (int, float)):
        return float(x)
    v = num(x)
    return v if v is not None else (str(x).strip() if x not in (None, "") else None)


def hp(code):
    code = str(code or "").strip()
    if not code:
        return None
    return code if code.startswith("HP:") else "HP:" + code.zfill(7)


def read_labels(path):
    labels = {}
    if not path.exists():
        return labels
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t")
        if cols[0] == "key":
            continue
        labels[cols[0]] = {"en": cols[1] if len(cols) > 1 and cols[1] else None, "fr": cols[2] if len(cols) > 2 and cols[2] else None}
    return labels


def write_gz(path, obj):
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
        json.dump(obj, fh, separators=(",", ":"))


def same_partition(a, b):
    """Cluster map a -> b when the two labellings are the same partition (noise to noise), else None."""
    fwd, back = {}, {}
    for x, y in zip(a, b):
        if (x is None) != (y is None):
            return None
        if x is None:
            continue
        if fwd.setdefault(x, y) != y or back.setdefault(y, x) != x or (x == -1) != (y == -1):
            return None
    return fwd


def merge_duplicates(m_ranks, d_ranks, report):
    """Keep one clustering per partition. The hybrid clustering of the latent class check has no stability of its
    own: when it equals an HDBSCAN clustering (LCA concordant), it takes that clustering's stability."""
    i = 0
    while i < len(m_ranks):
        j = i + 1
        while j < len(m_ranks):
            fwd = same_partition(m_ranks[i]["labels"], m_ranks[j]["labels"])
            if fwd is None:
                j += 1
                continue
            keep, dup = m_ranks[i], m_ranks[j]
            src = {c["id"]: c for c in dup["clusters"]}
            if all(c["stability"] is None for c in keep["clusters"]) and any(c["stability"] is not None for c in dup["clusters"]):
                for c in keep["clusters"]:
                    o = src.get(fwd.get(c["id"]))
                    if o:
                        c["stability"], c["dissolved"] = o["stability"], o["dissolved"]
                keep["stability_k_counts"] = keep["stability_k_counts"] or dup["stability_k_counts"]
                keep["stability_from"] = dup["column"]
            keep.setdefault("same_as", []).append(dup["column"])
            report.setdefault("merged", []).append(f"{dup['column']} = {keep['column']}")
            del m_ranks[j], d_ranks[j]
        i += 1


def read_run(path, release_ids, report):
    """One ALPHI result -> (manifest entry, detail payload)."""
    J = json.loads(path.read_text(encoding="utf-8"))
    results = J.get("clustering_results") or {}
    if not results:
        raise ValueError("no clustering_results")
    ranks = list(results.items())
    primary = next((i for i, (_, r) in enumerate(ranks) if r.get("is_primary_optimal_result")), 0)
    ranks.insert(0, ranks.pop(primary))

    # patients and coordinates: the embedding is shared by the clusterings of a run
    ids, xy, seen = [], {}, set()
    for rk, r in ranks:
        for c in r.get("clusters", []):
            pts = c.get("patients") or []
            xs, ys = c.get("x") or [], c.get("y") or []
            for i, p in enumerate(pts):
                pid = str(p.get("id"))
                if pid not in seen:
                    seen.add(pid)
                    ids.append(pid)
                if pid not in xy and i < len(xs):
                    xy[pid] = [round(float(xs[i]), 3), round(float(ys[i]), 3) if i < len(ys) else 0.0]
    missing = [i for i in ids if i not in release_ids]
    ids = [i for i in ids if i in release_ids]
    pos = {pid: j for j, pid in enumerate(ids)}
    report["n_file"] = len(seen)
    report["missing"] = missing

    m_ranks, d_ranks = [], []
    for rk, r in ranks:
        labels = [None] * len(ids)
        m_cl, d_cl = [], []
        empty = True
        for c in r.get("clusters", []):
            cid = int(c.get("cluster_id"))
            pts = [str(p.get("id")) for p in (c.get("patients") or [])]
            empty &= not pts
            for pid in pts:
                if pid in pos:
                    labels[pos[pid]] = cid
            m_cl.append({"id": cid, "n": sum(1 for pid in pts if pid in pos),
                         "stability": c.get("stability_jaccard_mean"), "dissolved": c.get("stability_dissolved"),
                         "few_features": c.get("flag_few_features"), "closest": c.get("closest_cluster")})
            d_cl.append({
                "id": cid,
                "prevalent": [[hp(s.get("hpo_code")), s.get("count"), num(s.get("prevalence_percent"))]
                              for s in (c.get("prevalent_symptoms") or [])[:TOP_PREVALENT]],
                "archetypal": [[hp(s.get("hpo_code")), num(s.get("prevalence_percent")), s.get("representation_level")]
                               for s in c.get("archetypal_symptoms") or []],
                "associated": [[hp(s.get("hpo_code")), num(s.get("cluster_prevalence")), num(s.get("rest_cohort_prevalence")),
                                pvalue(s.get("p_value"))] for s in c.get("associated_symptoms") or []],
                "discriminating": [[hp(s.get("hpo_code")), s.get("cluster"), s.get("closest_cluster")]
                                   for s in c.get("top_discriminating") or []],
            })
        if empty:
            report.setdefault("skipped_ranks", []).append(rk)
            continue
        m_ranks.append({"rank": rk, "k": r.get("num_clusters_k"), "primary": bool(r.get("is_primary_optimal_result")),
                        "column": r.get("clustering_column"), "labels": labels,
                        "stability_k_counts": r.get("stability_k_counts"), "any_few_features": r.get("any_few_feature_cluster"),
                        "clusters": sorted(m_cl, key=lambda c: c["id"])})
        d_ranks.append({"clusters": sorted(d_cl, key=lambda c: c["id"])})
    if not m_ranks:
        raise ValueError("no clustering lists its patients")
    merge_duplicates(m_ranks, d_ranks, report)
    m_ranks[0]["primary"] = True
    archetypal = [[hp(s.get("hpo_code") or s.get("HPO Code")), num(s.get("prevalence_percent") or s.get("Cohort Prevalence"))]
                  for s in J.get("cohort_archetypal_symptoms") or J.get("cohort_archetypal_signatures") or []]
    detail = {"xy": [xy.get(pid) for pid in ids], "cohort_archetypal": archetypal, "ranks": d_ranks}
    return {"ids": ids, "ranks": m_ranks}, detail


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", required=True, help="folder of ALPHI results: <key>.json and <key>.args")
    ap.add_argument("--release", help="release id (default: the latest in data/releases.json)")
    ap.add_argument("--out", default=str(ROOT / "data"), help="data folder of the site")
    ap.add_argument("--labels", default=str(ROOT / "build" / "tables" / "cluster_cohorts.tsv"), help="cohort labels")
    ap.add_argument("--alphi-version", default="", help="ALPHI version or commit, shown on the site")
    ap.add_argument("--exclude-disease", default="Aagenaes syndrome",
                    help="disease left out of the ALPHI input (for the report of patients not clustered)")
    args = ap.parse_args()

    out = Path(args.out)
    rel_path = out / "releases.json"
    releases = json.loads(rel_path.read_text(encoding="utf-8"))
    release = args.release or releases[0]["id"]
    entry = next((r for r in releases if r["id"] == release), None)
    if entry is None:
        sys.exit(f"Release {release} is not in {rel_path}; build it first.")
    patients = json.loads(gzip.open(out / release / "patients.json.gz", "rt", encoding="utf-8").read())
    patients = patients["patients"] if isinstance(patients, dict) else patients
    by_id = {p["id"]: p for p in patients}
    labels = read_labels(Path(args.labels))

    files = sorted(Path(args.runs).expanduser().glob("*.json"))
    if not files:
        sys.exit(f"No ALPHI result (*.json) in {args.runs}.")
    dest = out / release / "clusters"
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("*.json.gz"):
        old.unlink()

    runs, lines = [], []
    for f in files:
        key = f.stem
        genes = key.split("_")
        rep = {}
        try:
            m, detail = read_run(f, by_id, rep)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
            print(f"  {key}: left out ({e})")
            lines.append(f"| {key} | left out: {e} | | | | |")
            continue
        args_file = f.with_suffix(".args")
        settings = args_file.read_text(encoding="utf-8").strip() if args_file.exists() else ""
        lab = labels.get(key, {})
        default = " + ".join(genes)
        run = {"key": key, "genes": genes, "label": {"en": lab.get("en") or default, "fr": lab.get("fr") or lab.get("en") or default},
               "settings": settings, "n": len(m["ids"]), "file": f"clusters/{key}.json.gz", **m}
        write_gz(dest / f"{key}.json.gz", {"key": key, **detail})
        runs.append(run)
        gene_set = set(genes)
        of_genes = [p["id"] for p in patients if gene_set & set(p.get("gene", [])) and args.exclude_disease not in p.get("dis", [])]
        not_clustered = len(set(of_genes) - set(m["ids"]))
        ks = ", ".join(str(r["k"]) for r in m["ranks"])
        miss = ", ".join(rep["missing"][:5]) + (" …" if len(rep["missing"]) > 5 else "")
        lines.append(f"| {key} | {len(m['ids'])} | {ks} | {len(rep['missing'])}{f' ({miss})' if miss else ''} | {not_clustered} of {len(of_genes)} | "
                     f"{', '.join(rep.get('skipped_ranks', [])) or '–'} | {'; '.join(rep.get('merged', [])) or '–'} |")
        print(f"  {key}: {len(m['ids'])} patients, k = {ks}" + (f"; {len(rep['missing'])} ids not in the release" if rep["missing"] else ""))

    built = datetime.datetime.now().isoformat(timespec="seconds")
    manifest = {"release": release, "alphi": args.alphi_version, "built": built, "runs": runs}
    write_gz(dest / "manifest.json.gz", manifest)
    (dest / "build_report.md").write_text(
        f"# ALPHI results of release {release}\n\nBuilt {built} from {Path(args.runs).expanduser()}"
        f"{f' (ALPHI {args.alphi_version})' if args.alphi_version else ''}.\n\n"
        "| Cohort | Patients | k of the eligible clusterings (first: shown by default) | Ids not in the release | "
        f"Patients of the genes not clustered (without {args.exclude_disease}) | Clusterings left out (no patient list) | "
        "Identical clusterings merged |\n"
        "| --- | --- | --- | --- | --- | --- | --- |\n" + "\n".join(lines) + "\n", encoding="utf-8")
    entry["alphi"] = {"version": args.alphi_version, "runs": len(runs), "built": built}
    rel_path.write_text(json.dumps(releases, indent=1), encoding="utf-8")
    size = sum(p.stat().st_size for p in dest.glob("*.gz"))
    print(f"Release {release}: {len(runs)} ALPHI cohorts -> {dest} ({size / 1024:.0f} kB); report: {dest / 'build_report.md'}")


if __name__ == "__main__":
    main()
