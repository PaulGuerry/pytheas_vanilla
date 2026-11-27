#!/usr/local/bin/python3.14
"""Build a PytheasDB website release from a database export.

    build/build_release.py -f 261013_pytheasDB.json
    build/build_release.py -f 261013_pytheasDB.json --hpo-json ~/HPO/260623_hp_pg.json

Reads the export, the curation tables in build/tables/ and an HPO graph, and writes
data/<release>/: patients.json.gz, lexicon.json, hpo.json.gz, reference.json,
build_report.md and build_report.json; data/releases.json is updated. The release id
is taken from the leading digits of the export file name unless --release is given.

HPO input: --hpo-json (an obographs file such as hp.json), or by default the site's
data/hpo_dag.json.gz, data/id_to_term.json.gz and data/term_to_id.json.gz. The edges
listed in build/tables/hpo_edges.tsv are then added or removed.

Patient record in patients.json.gz (a key is left out when its value is empty):
  id       record id of the export
  dis      disease labels, as in the export (no merging; spelling fixes of disease_labels.tsv)
  gene     gene symbols (markers removed as listed in exclusions.tsv)
  sex      "M" or "F"
  cons     consanguinity, true or false
  zyg      "homozygous", "compound" or "heterozygous"
  al       the two alleles, each {type, p, cadd, revel, clinvar}
  onset_m  age at first symptoms, months
  status   "alive" or "dead"
  age_y    age at death or at the last report, years (alivedeadage)
  birth    {w_g, w_sds, ga_w, len_cm, hc_cm}
  hp       terms reported present: ["HP:0001396", onset in months or null]
  tr       present terms that resolved (transientsymptoms: present, later reported absent)
  abs      terms reported absent and never present (other present-and-absent terms count as present)
  tx       treatments: {name, class, start_m, dur_m, eff}; "src": "text" when read from free text
  lab      series: {var, unit, t_m: [months], v: [values]}
  art      articles: {doi, year, label}
"""
import argparse
import csv
import datetime
import gzip
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROOT_TERM = "HP:0000001"
PHENOTYPIC_ABNORMALITY = "HP:0000118"
MISSING = {"Not Found", "Not Provided", "API Error", "unknown", ""}

# ClinGen PP3/BP4 thresholds for CADD v1.6 (Pejaver et al., 2022): the first tier whose lower bound the score reaches
CADD_TIERS = [
    {"tier": "PP3_Moderate", "min": 28.1, "min_inclusive": True},
    {"tier": "PP3_Supporting", "min": 25.3, "min_inclusive": True},
    {"tier": "Indeterminate", "min": 22.7, "min_inclusive": False},
    {"tier": "BP4_Supporting", "min": 17.3, "min_inclusive": False},
    {"tier": "BP4_Moderate", "min": 0.15, "min_inclusive": False},
    {"tier": "BP4_Strong", "min": None, "min_inclusive": True},
]

# Onset periods, in months (lower bound inclusive, upper bound exclusive)
ONSET_PERIODS = [
    {"key": "newborn", "label": "newborn period (0-2 months)", "from_m": 0, "to_m": 3},
    {"key": "infancy", "label": "infancy (3-11 months)", "from_m": 3, "to_m": 12},
    {"key": "toddler", "label": "toddler (1-2 years)", "from_m": 12, "to_m": 36},
    {"key": "preschool", "label": "preschool (3-5 years)", "from_m": 36, "to_m": 72},
    {"key": "childhood", "label": "middle childhood (6-11 years)", "from_m": 72, "to_m": 144},
    {"key": "adolescence", "label": "adolescence (12-19 years)", "from_m": 144, "to_m": 240},
    {"key": "adult", "label": "adult (20 years and over)", "from_m": 240, "to_m": None},
]


def parse_args():
    ap = argparse.ArgumentParser(description="Build a PytheasDB website release from a database export.")
    ap.add_argument("-f", "--export", required=True, help="export JSON (list of patient records)")
    ap.add_argument("--release", help="release id (default: leading digits of the export file name)")
    ap.add_argument("--tables", default=str(ROOT / "build" / "tables"), help="folder of the curation tables")
    ap.add_argument("--out", default=str(ROOT / "data"), help="data folder of the site")
    ap.add_argument("--hpo-json", help="HPO graph in obographs JSON (hp.json); overrides the three files below")
    ap.add_argument("--hpo-dag", default=str(ROOT / "data" / "hpo_dag.json.gz"))
    ap.add_argument("--hpo-labels", default=str(ROOT / "data" / "id_to_term.json.gz"))
    ap.add_argument("--hpo-synonyms", default=str(ROOT / "data" / "term_to_id.json.gz"))
    return ap.parse_args()


# ---------------------------------------------------------------- helpers
def read_json(path):
    path = Path(path).expanduser()
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def read_table(path):
    """TSV with optional leading '#' comment lines, then a header line."""
    with open(path, encoding="utf-8", newline="") as fh:
        lines = [ln for ln in fh if not ln.startswith("#") and ln.strip("\n")]
    return list(csv.DictReader(lines, delimiter="\t"))


def num(x):
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def lead_num(x):
    """Leading number of a value such as '42(10ep)' or '42 cm'."""
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return float(x)
    m = re.match(r"\s*(-?\d+(?:[.,]\d+)?)", str(x or ""))
    return float(m.group(1).replace(",", ".")) if m else None


def hp_code(x):
    digits = re.sub(r"\D", "", str(x if x is not None else ""))
    if not digits or len(digits) > 7:
        return None
    return "HP:" + digits.zfill(7)


def rnd(x, nd=2):
    return None if x is None else round(x, nd)


def compact(d):
    return {k: v for k, v in d.items() if v not in (None, [], {}, "")}


def cadd_tier(score):
    for t in CADD_TIERS:
        if t["min"] is None or score > t["min"] or (t["min_inclusive"] and score == t["min"]):
            return t["tier"]
    return None


# ---------------------------------------------------------------- HPO
class HPO:
    def __init__(self):
        self.labels, self.synonyms, self.parents, self.obsolete = {}, defaultdict(set), defaultdict(set), set()
        self._anc = {}

    @classmethod
    def from_obographs(cls, path):
        h = cls()
        graph = read_json(path)["graphs"][0]
        for node in graph.get("nodes", []):
            code = hp_code(node.get("id", "").rsplit("HP_", 1)[-1]) if "HP_" in node.get("id", "") else None
            if not code:
                continue
            h.labels[code] = node.get("lbl", "")
            meta = node.get("meta", {}) or {}
            for syn in meta.get("synonyms", []) or []:
                if syn.get("val"):
                    h.synonyms[code].add(syn["val"])
            if meta.get("deprecated"):
                h.obsolete.add(code)
        for e in graph.get("edges", []):
            if e.get("pred") not in ("is_a", "http://www.w3.org/2000/01/rdf-schema#subClassOf"):
                continue
            sub, obj = e.get("sub", ""), e.get("obj", "")
            if "HP_" in sub and "HP_" in obj:
                h.parents[hp_code(sub.rsplit("HP_", 1)[-1])].add(hp_code(obj.rsplit("HP_", 1)[-1]))
        return h

    @classmethod
    def from_site_files(cls, dag_path, labels_path, synonyms_path):
        h = cls()
        for digits, node in read_json(dag_path).items():
            h.parents["HP:" + digits].update("HP:" + p for p in node.get("p", []))
        h.labels.update(read_json(labels_path))
        try:
            for term, code in read_json(synonyms_path).items():
                h.synonyms[code].add(term)
        except FileNotFoundError:
            pass
        return h

    def apply_edges(self, rows, report):
        for r in rows:
            child, parent, action = hp_code(r["child"]), hp_code(r["parent"]), r["action"].strip()
            if action == "remove":
                found = parent in self.parents.get(child, set())
                self.parents[child].discard(parent)
                report["hpo_edges"].append(f"removed {child} -> {parent}" + ("" if found else " (was not in the graph)"))
            elif action == "add":
                self.parents[child].add(parent)
                report["hpo_edges"].append(f"added {child} -> {parent}")
        self._anc.clear()

    def ancestors(self, code):
        """All ancestors of a term, the term itself excluded."""
        if code in self._anc:
            return self._anc[code]
        out, stack = set(), list(self.parents.get(code, ()))
        while stack:
            c = stack.pop()
            if c in out:
                continue
            out.add(c)
            if c in self._anc:
                out |= self._anc[c]
            else:
                stack.extend(self.parents.get(c, ()))
        self._anc[code] = out
        return out

    def closure(self, codes):
        out = set(codes)
        for c in codes:
            out |= self.ancestors(c)
        return out


# ---------------------------------------------------------------- tables
class Tables:
    def __init__(self, folder):
        folder = Path(folder)
        self.exclusions = []
        for r in read_table(folder / "exclusions.tsv"):
            v = r["value"]
            matcher = re.compile(v[3:]) if v.startswith("re:") else v
            self.exclusions.append((r["field"].strip(), matcher, r["action"].strip(), r.get("note", "")))
        self.disease_fix = {r["label"]: r["replacement"].strip() for r in read_table(folder / "disease_labels.tsv")
                            if r.get("replacement", "").strip()}
        self.known_diseases = {r["label"] for r in read_table(folder / "disease_labels.tsv")}
        self.treatments, self.atc = {}, {}
        for r in read_table(folder / "treatments.tsv"):
            entry = {"name": r["canonical"].strip(), "class": r["class"].strip() or "other", "atc": r["atc"].strip()}
            self.treatments[r["raw_name"]] = entry
            if entry["atc"] and entry["atc"] not in self.atc:
                self.atc[entry["atc"]] = entry
        self.efficacy = {r["raw"]: r["category"].strip() for r in read_table(folder / "efficacy.tsv")}
        self.labs = {(r["raw_variable"], r["raw_unit"]): r for r in read_table(folder / "labs.tsv")}
        self.hpo_edges = read_table(folder / "hpo_edges.tsv")
        self.pfic = read_table(folder / "pfic_types.tsv")
        names = sorted((k for k in self.treatments if len(k.strip()) >= 4 and not re.fullmatch(r"[A-Z]\d\d[A-Z]{2}\d\d", k)),
                       key=len, reverse=True)
        self.name_pattern = re.compile(r"(?<![A-Za-z0-9-])(" + "|".join(re.escape(n.strip()) for n in names) + r")(?![A-Za-z0-9-])", re.I)
        self.name_lookup = {k.strip().lower(): v for k, v in self.treatments.items()}

    def rule(self, field, value):
        for f, matcher, action, note in self.exclusions:
            if f != field:
                continue
            if (isinstance(matcher, str) and value == matcher) or (not isinstance(matcher, str) and matcher.search(value)):
                return action, note
        return None, None


# ---------------------------------------------------------------- one patient
CONS = {"y": True, "yes": True, "n": False, "no": False, "non": False}
ONSET_UNIT = {"m": 1, "y": 12, "a": 12, "d": 1 / 30.4375}
SPLICE = re.compile(r"^p\.Splice[ _]site\(s\)[ _]affected$", re.I)


def build_patient(p, T, R):
    pid = p["id"]
    for field, values in (("disease", p.get("disease") or []), ("gene", p.get("gene") or [])):
        for v in values:
            action, note = T.rule(field, str(v).strip())
            if action == "drop_patient":
                R["excluded"].append({"id": pid, "field": field, "value": v, "note": note})
                return None
    for k in ("diseases", "undefined", "ttt", "biology"):
        if k in p:
            R["unused_fields"][k] += 1

    dis = []
    for d in p.get("disease") or []:
        d = str(d).strip()
        d = T.disease_fix.get(d, d)
        if d not in T.known_diseases:
            R["new_disease_labels"][d] += 1
        if d and d not in dis:
            dis.append(d)
    genes = []
    for g in p.get("gene") or []:
        g = str(g).strip()
        action, _ = T.rule("gene", g)
        if action == "remove_value":
            R["gene_values_removed"][g] += 1
            continue
        if g and g not in genes:
            genes.append(g)

    sex = (p.get("sex") or "").strip().upper()
    if sex not in ("M", "F"):
        if sex:
            R["sex_unread"][sex] += 1
        sex = None
    cons_raw = str(p.get("consanguinity") or "").strip().lower()
    cons = CONS.get(cons_raw)
    if cons is None and cons_raw not in ("", "na", "none"):
        R["consanguinity_unread"][cons_raw] += 1
    zyg = p.get("zygosity") if p.get("zygosity") in ("homozygous", "compound", "heterozygous") else None

    alleles = []
    types, cadds, clin = p.get("protvartypes") or [], p.get("cadd_scores") or [], p.get("clinvartypes") or []
    dbn = p.get("dbnsfp_scores") or []
    for i in range(2):
        pv = p.get(f"protvariant{i + 1}") or {}
        prot = pv.get("clean_p") if isinstance(pv, dict) else None
        if prot and SPLICE.match(prot):
            prot = "p.Splice site(s) affected"
        revel = dbn[i].get("revel") if i < len(dbn) and isinstance(dbn[i], dict) else None
        alleles.append(compact({
            "type": types[i] if i < len(types) and types[i] not in MISSING else None,
            "p": prot,
            "cadd": num(cadds[i]) if i < len(cadds) and cadds[i] not in MISSING else None,
            "revel": num(revel) if revel not in MISSING else None,
            "clinvar": clin[i] if i < len(clin) and clin[i] not in MISSING else None,
        }))

    # present terms with onset (months): symptoms[i][2] is in years; symptoms_age holds "code(14m)"
    onset = {}
    for s in p.get("symptoms") or []:
        code = hp_code(s[0] if isinstance(s, list) else s)
        if not code or T.rule("symptom", code[3:])[0] == "remove_value":
            R["symptom_codes_removed"][str(s[0] if isinstance(s, list) else s)] += 1
            continue
        y = num(s[2]) if isinstance(s, list) and len(s) > 2 else None
        m = rnd(y * 12) if y is not None else None
        if code in onset:
            R["duplicate_terms"] += 1
            if m is not None and (onset[code] is None or m < onset[code]):
                onset[code] = m
        else:
            onset[code] = m
    for item in p.get("symptoms_age") or []:
        mt = re.match(r"\s*(\d{6,7})[^\d(]*(?:\((.*?)\))?", str(item))
        if not mt:
            R["symptoms_age_unread"][str(item)] += 1
            continue
        code, paren = hp_code(mt.group(1)), mt.group(2)
        months = None
        if paren:
            ma = re.match(r"\s*(<)?\s*(\d+(?:[.,]\d+)?)\s*([mayd])\b", paren)
            if ma:
                months = rnd(float(ma.group(2).replace(",", ".")) * ONSET_UNIT[ma.group(3)])
                if ma.group(1):
                    R["onset_upper_bounds"] += 1
            else:
                R["symptoms_age_unread"][str(item)] += 1
        if code not in onset:
            onset[code] = months
            R["terms_from_symptoms_age"] += 1
        elif months is not None and (onset[code] is None or months < onset[code]):
            onset[code] = months
    transient = {hp_code(t) for t in p.get("transientsymptoms") or []} - {None}
    for code in transient - set(onset):
        R["transient_not_present"].append(f"{pid} {code}")
    resolved = sorted(transient & set(onset))
    absent, seen = [], set()
    for s in p.get("absentsymptoms") or []:
        code = hp_code(s[0] if isinstance(s, list) else s)
        if not code or code in seen:
            continue
        seen.add(code)
        if code in onset:
            if code not in transient:
                R["present_and_absent"].append(f"{pid} {code}")
            continue
        if code not in absent:
            absent.append(code)

    tx = build_treatments(pid, p.get("treatments"), T, R)
    labs = build_labs(pid, p.get("longitudinal") or [], T, R)

    birth = compact({
        "w_g": num(p.get("birthweight_grams")),
        "w_sds": num(p.get("birthweight_SDS")),
        "ga_w": num(p.get("term_weeks")),
        "len_cm": in_range(lead_num(p.get("birthheight")), 25, 65, "birth length", pid, R),
        "hc_cm": in_range(lead_num(p.get("birthpc")), 20, 45, "birth head circumference", pid, R),
    })
    arts = []
    for a in p.get("articles") or []:
        doi = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", str(a.get("doi") or "").strip(), flags=re.I)
        year = a.get("publication_year")
        arts.append(compact({"doi": doi or None, "year": int(year) if isinstance(year, (int, float)) else None,
                             "label": str(a["patient"]) if a.get("patient") not in (None, "") else None}))

    return compact({
        "id": pid, "dis": dis, "gene": genes, "sex": sex, "cons": cons, "zyg": zyg,
        "al": alleles if any(alleles) else None,
        "onset_m": rnd(num(p.get("firstsymptomagemonth"))),
        "status": p.get("alivedead") if p.get("alivedead") in ("alive", "dead") else None,
        "age_y": rnd(num(p.get("alivedeadage"))),
        "birth": birth,
        "hp": [[c, m] for c, m in onset.items()],
        "tr": resolved, "abs": absent, "tx": tx, "lab": labs, "art": arts,
    })


def in_range(x, lo, hi, what, pid, R):
    if x is None:
        return None
    if lo <= x <= hi:
        return x
    R["out_of_range"].append(f"{pid} {what} {x}")
    return None


def treatment_entry(raw, T, R):
    e = T.treatments.get(raw) or T.treatments.get(raw.strip()) or T.name_lookup.get(raw.strip().lower())
    if e is None:
        R["treatments_unclassified"][raw] += 1
        return {"name": raw.strip(), "class": "unclassified"}
    return {"name": e["name"], "class": e["class"]}


def build_treatments(pid, raw, T, R):
    out = []
    if isinstance(raw, list):
        for t in raw:
            if isinstance(t, dict):
                e = treatment_entry(str(t.get("name") or ""), T, R)
                eff_raw = t.get("efficacy") or ""
                eff = T.efficacy.get(eff_raw)
                if eff is None:
                    R["efficacy_unread"][eff_raw] += 1
                    eff = "unclear"
                out.append(compact({**e, "start_m": rnd(num(t.get("ageatstart_m"))),
                                    "dur_m": rnd(num(t.get("duration_m"))), "eff": eff}))
            elif re.fullmatch(r"\s*\d{6,7}\s*", str(t)):
                R["hpo_codes_in_treatments"].append(f"{pid} {t}")
            else:
                R["treatments_unclassified"][str(t)] += 1
    elif isinstance(raw, (str, int)) and str(raw).strip() not in ("", "0", "NA", "non"):
        text = str(raw)
        found = []
        for code in re.findall(r"(?<![A-Z0-9])[A-Z]\d{2}[A-Z]{2}\d{2}(?![0-9])", text):
            e = T.treatments.get(code) or T.atc.get(code)
            if e:
                found.append(e)
            else:
                R["legacy_atc_unknown"][code] += 1
        for m in T.name_pattern.finditer(text):
            e = T.name_lookup.get(m.group(1).lower())
            if e:
                found.append(e)
        names = []
        for e in found:
            if e["name"] not in names:
                names.append(e["name"])
                out.append({"name": e["name"], "class": e["class"], "eff": "unclear", "src": "text"})
        R["legacy_treatments"].append({"id": pid, "text": text.strip(), "read": names})
    return out


def build_labs(pid, series, T, R):
    merged = defaultdict(list)
    units = {}
    for s in series:
        var, unit = str(s.get("variable") or "").strip(), str(s.get("variable_unit") or "").strip()
        row = T.labs.get((var, unit))
        if row is None or not row["variable"].strip():
            R["labs_left_out"][f"{var} [{unit}]"] += 1
            continue
        tu = s.get("time_unit")
        tf = {"months": 1, "years": 12}.get(tu)
        times, values = s.get("times") or [], s.get("values")
        if tf is None or values is None or len(times) != len(values):
            R["lab_series_unread"].append(f"{pid} {var}: " + ("no values" if values is None else
                                                              f"time unit {tu}" if tf is None else "times and values differ in length"))
            continue
        factor = float(row["factor"] or 1)
        for t, v in zip(times, values):
            t, v = num(t), lead_num(v) if isinstance(v, str) else num(v)
            if t is None or v is None:
                R["lab_points_dropped"] += 1
                continue
            merged[row["variable"]].append((rnd(t * tf), round(v * factor, 4)))
        units[row["variable"]] = row["unit"]
    out = []
    for var, pts in merged.items():
        pts.sort()
        out.append(compact({"var": var, "unit": units[var], "t_m": [t for t, _ in pts], "v": [v for _, v in pts]}))
    return out


# ---------------------------------------------------------------- release-level outputs
def term_states(rec, hpo):
    present = hpo.closure([c for c, _ in rec.get("hp", [])])
    absent_direct = set(rec.get("abs", []))
    return present, absent_direct


def build_reference(records, hpo, release):
    by_dis, by_gene, by_pair = Counter(), Counter(), Counter()
    sex, surv, onset = defaultdict(Counter), defaultdict(Counter), defaultdict(list)
    tiers = defaultdict(lambda: {"all": Counter(), "missense": Counter()})
    cohort_terms, direct_terms = defaultdict(Counter), defaultdict(Counter)
    states = {}
    for r in records:
        present, absent = term_states(r, hpo)
        states[r["id"]] = (present, set(c for c, _ in r.get("hp", [])), absent)
        groups = r.get("dis", []) or ["(no label)"]
        for d in groups:
            by_dis[d] += 1
            sex[d][r.get("sex", "unknown")] += 1
            if r.get("status") and r.get("age_y") is not None:
                surv[d]["available"] += 1
                surv[d]["deaths"] += r["status"] == "dead"
            if r.get("onset_m") is not None:
                onset[d].append(r["onset_m"])
            for a in r.get("al", []):
                if "cadd" in a:
                    t = cadd_tier(a["cadd"])
                    tiers[d]["all"][t] += 1
                    if a.get("type") == "missense":
                        tiers[d]["missense"][t] += 1
            cohort_terms[d].update(present)
            direct_terms[d].update(states[r["id"]][1])
            for g in r.get("gene", []):
                by_pair[f"{d}|{g}"] += 1
        for g in r.get("gene", []):
            by_gene[g] += 1

    ids_by_dis = defaultdict(list)
    for r in records:
        for d in r.get("dis", []) or ["(no label)"]:
            ids_by_dis[d].append(r["id"])
    top_terms = {}
    for d, cnt in direct_terms.items():
        rows = []
        for code, exact in sorted(cnt.items(), key=lambda x: (-x[1], x[0]))[:10]:
            anc_self = hpo.ancestors(code) | {code}
            absent = sum(1 for i in ids_by_dis[d] if code not in states[i][0] and states[i][2] & anc_self)
            rows.append({"hp": code, "present": cohort_terms[d][code], "present_exact": exact, "absent": absent})
        top_terms[d] = rows
    return {
        "release": release,
        "n_patients": len(records),
        "by_disease": dict(sorted(by_dis.items())),
        "by_gene": dict(sorted(by_gene.items())),
        "by_disease_gene": dict(sorted(by_pair.items())),
        "sex": {d: dict(c) for d, c in sorted(sex.items())},
        "survival": {d: dict(c) for d, c in sorted(surv.items())},
        "onset": {d: {"available": len(v), "median_m": statistics.median(v)} for d, v in sorted(onset.items())},
        "cadd_tiers_alleles": {d: {k: dict(c) for k, c in v.items()} for d, v in sorted(tiers.items())},
        "top_terms": top_terms,
        "rules": "counts per disease label; a patient with two labels counts under both. top_terms = the 10 terms "
                 "most often reported as such. present = term or a "
                 "subterm reported present; present_exact = the term itself; absent = the term or an ancestor "
                 "reported absent, and the term not present",
    }


def build_lexicon(records, hpo, T, release):
    dis, genes = defaultdict(Counter), defaultdict(Counter)
    tx, labs = defaultdict(lambda: [set(), ""]), defaultdict(lambda: {"unit": "", "patients": 0, "points": 0})
    direct, closure, absent = Counter(), Counter(), Counter()
    for r in records:
        for d in r.get("dis", []):
            dis[d]["n"] += 1
            for g in r.get("gene", []):
                dis[d][g] += 1
        for g in r.get("gene", []):
            genes[g]["n"] += 1
            for d in r.get("dis", []):
                genes[g][d] += 1
        for t in r.get("tx", []):
            tx[t["name"]][0].add(r["id"])
            tx[t["name"]][1] = t["class"]
        for s in r.get("lab", []):
            labs[s["var"]]["unit"] = s.get("unit", "")
            labs[s["var"]]["patients"] += 1
            labs[s["var"]]["points"] += len(s["t_m"])
        codes = [c for c, _ in r.get("hp", [])]
        direct.update(codes)
        closure.update(hpo.closure(codes))
        absent.update(r.get("abs", []))
    pack = lambda c: {"n": c["n"], "by": {k: v for k, v in c.most_common() if k != "n"}}
    return {
        "release": release,
        "diseases": {d: pack(c) for d, c in sorted(dis.items())},
        "genes": {g: pack(c) for g, c in sorted(genes.items())},
        "pfic_aliases": {r["alias"]: {"disease": r["disease"], "gene": r["gene"]} for r in T.pfic},
        "treatments": {n: {"class": v[1], "patients": len(v[0])} for n, v in sorted(tx.items())},
        "labs": dict(sorted(labs.items())),
        "terms": {c: [direct[c], closure[c], absent[c]] for c in sorted(set(closure) | set(absent))},
        "terms_columns": ["present (term itself)", "present (with subterms)", "reported absent (term itself)"],
        "cadd_tiers": CADD_TIERS,
        "onset_periods": ONSET_PERIODS,
        "variant_types": sorted({a["type"] for r in records for a in r.get("al", []) if "type" in a}),
        "efficacy_categories": sorted(set(T.efficacy.values())),
    }


def build_hpo_subset(records, hpo, R):
    used = set()
    for r in records:
        used.update(c for c, _ in r.get("hp", []))
        used.update(r.get("abs", []))
    unknown = sorted(c for c in used if c not in hpo.labels)
    R["hpo_unknown"] = unknown
    R["hpo_obsolete"] = sorted(c for c in used if c in hpo.obsolete)
    subset = hpo.closure(used)
    organs = {c for c, ps in hpo.parents.items() if PHENOTYPIC_ABNORMALITY in ps}
    out = {}
    for c in sorted(subset):
        anc = hpo.ancestors(c) | {c}
        out[c] = compact({"l": hpo.labels.get(c), "p": sorted(p for p in hpo.parents.get(c, ()) if p in subset),
                          "o": sorted(anc & organs), "s": sorted(s for s in hpo.synonyms.get(c, ()) if s.lower() != hpo.labels.get(c, "").lower())})
    return out


def write_report(R, path_md, path_json, meta):
    simple = {k: (dict(v.most_common()) if isinstance(v, Counter) else v) for k, v in R.items()}
    path_json.write_text(json.dumps({"meta": meta, **simple}, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
    L = [f"# Build report, release {meta['release']}", "",
         f"Export `{meta['export']}`: {meta['n_export']} records; {meta['n_patients']} patients in the release, "
         f"{len(R['excluded'])} left out. HPO: {meta['hpo_source']}. Built {meta['built']}.", ""]

    def counter(title, c):
        if c:
            L.extend([f"## {title}", "", "| value | n |", "| --- | --- |"]
                     + [f"| `{k}` | {v} |" for k, v in c.most_common()] + [""])

    def items(title, xs, limit=200):
        if xs:
            L.extend([f"## {title} ({len(xs)})", ""] + [f"- {x}" for x in xs[:limit]]
                     + ([f"- ... {len(xs) - limit} more"] if len(xs) > limit else []) + [""])

    items("Records left out", [f"`{e['id']}`: {e['field']} = `{e['value']}` ({e['note']})" for e in R["excluded"]])
    counter("Gene values removed", R["gene_values_removed"])
    counter("Disease labels not in disease_labels.tsv", R["new_disease_labels"])
    counter("Sex values not read", R["sex_unread"])
    counter("Consanguinity values not read", R["consanguinity_unread"])
    items("HPO edge changes", R["hpo_edges"])
    items("HPO codes not in the graph", R["hpo_unknown"])
    items("Obsolete HPO codes", R["hpo_obsolete"])
    counter("Symptom codes removed", R["symptom_codes_removed"])
    L.extend([f"Duplicated terms within a patient: {R['duplicate_terms']}. Terms added from `symptoms_age`: "
              f"{R['terms_from_symptoms_age']}. Onsets given as upper bounds (`<`): {R['onset_upper_bounds']}.", ""])
    counter("symptoms_age items not read", R["symptoms_age_unread"])
    L.extend([f"Resolved terms (listed in `transientsymptoms`, present and later absent): {R['n_resolved']}.", ""])
    items("Terms present and absent but not listed as transient (counted present)", R["present_and_absent"])
    items("Transient terms not among the present terms", R["transient_not_present"])
    counter("Treatment names not in treatments.tsv (class unclassified)", R["treatments_unclassified"])
    counter("Efficacy values not in efficacy.tsv (counted unclear)", R["efficacy_unread"])
    items("HPO codes found in treatment lists (left out)", R["hpo_codes_in_treatments"])
    counter("ATC codes in free-text treatments not in treatments.tsv", R["legacy_atc_unknown"])
    items("Free-text treatment fields", [f"`{e['id']}`: \"{e['text']}\" read as {', '.join(e['read']) or 'nothing'}"
                                         for e in R["legacy_treatments"]])
    counter("Laboratory series left out (variable [unit])", R["labs_left_out"])
    items("Laboratory series not read", R["lab_series_unread"])
    L.extend([f"Laboratory points without time or value, dropped: {R['lab_points_dropped']}.", ""])
    items("Birth values out of range (left out)", R["out_of_range"])
    counter("Fields not carried (records holding them)", R["unused_fields"])
    path_md.write_text("\n".join(L), encoding="utf-8")


def main():
    args = parse_args()
    export = Path(args.export).expanduser()
    release = args.release or (re.match(r"\d+", export.name) or [None])[0]
    if not release:
        sys.exit("No release id: pass --release")
    R = defaultdict(Counter)
    for k in ("excluded", "hpo_edges", "present_and_absent", "transient_not_present", "hpo_codes_in_treatments", "legacy_treatments",
              "lab_series_unread", "out_of_range"):
        R[k] = []
    for k in ("duplicate_terms", "terms_from_symptoms_age", "onset_upper_bounds", "lab_points_dropped"):
        R[k] = 0

    T = Tables(args.tables)
    if args.hpo_json:
        hpo, hpo_source = HPO.from_obographs(args.hpo_json), Path(args.hpo_json).name
    else:
        hpo = HPO.from_site_files(args.hpo_dag, args.hpo_labels, args.hpo_synonyms)
        hpo_source = f"{Path(args.hpo_dag).name} + {Path(args.hpo_labels).name}"
    hpo.apply_edges(T.hpo_edges, R)

    raw = read_json(export)
    records = [r for r in (build_patient(p, T, R) for p in raw) if r]
    R["n_resolved"] = sum(len(r.get("tr", [])) for r in records)

    out = Path(args.out) / release
    out.mkdir(parents=True, exist_ok=True)
    with gzip.open(out / "patients.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(records, fh, separators=(",", ":"), ensure_ascii=False)
    with gzip.open(out / "hpo.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(build_hpo_subset(records, hpo, R), fh, separators=(",", ":"), ensure_ascii=False)
    (out / "lexicon.json").write_text(json.dumps(build_lexicon(records, hpo, T, release), ensure_ascii=False,
                                                 separators=(",", ":")), encoding="utf-8")
    (out / "reference.json").write_text(json.dumps(build_reference(records, hpo, release), indent=1,
                                                   ensure_ascii=False), encoding="utf-8")

    n_articles = len({a["doi"] for r in records for a in r.get("art", []) if "doi" in a})
    built = datetime.datetime.now().isoformat(timespec="seconds")
    meta = {"release": release, "export": export.name, "n_export": len(raw), "n_patients": len(records),
            "n_articles": n_articles, "hpo_source": hpo_source, "built": built}
    write_report(R, out / "build_report.md", out / "build_report.json", meta)

    rel_path = Path(args.out) / "releases.json"
    releases = json.loads(rel_path.read_text(encoding="utf-8")) if rel_path.exists() else []
    releases = [r for r in releases if r["id"] != release]
    date = f"20{release[:2]}-{release[2:4]}-{release[4:6]}" if len(release) == 6 else None
    releases.append({"id": release, "date": date, "export": export.name, "n_patients": len(records),
                     "n_articles": n_articles, "hpo": hpo_source, "built": built})
    releases.sort(key=lambda r: r["id"], reverse=True)
    rel_path.write_text(json.dumps(releases, indent=1), encoding="utf-8")

    print(f"Release {release}: {len(records)} patients ({len(R['excluded'])} left out), {n_articles} articles -> {out}")
    print(f"Report: {out / 'build_report.md'}")


if __name__ == "__main__":
    main()
