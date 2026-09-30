"""Builds the migration that loads the official annexes (parsed by
parse_annexes.py into supabase/rulebook-data) into a new draft rulebook
version. Every entry starts unverified: an admin signs it off before the
version is published.

Usage: python3 scripts/rulebook/build_migration.py <version> <cloned from> <migration file>
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "supabase" / "rulebook-data"

LIST_TYPE = {"II": "prohibited", "IV": "colourant", "V": "preservative", "VI": "uv_filter"}
ANNEX_TITLE = {
    "II": "Annex II (prohibited substances)",
    "III": "Annex III (restricted substances)",
    "IV": "Annex IV (colourants)",
    "V": "Annex V (preservatives)",
    "VI": "Annex VI (UV filters)",
}

ALLERGEN = re.compile(r"0[,.]001\s*%\s*in leave-on", re.I)
LABEL_NAME = re.compile(r"indicated (?:as )?‘([^’]+)’")
# Entries that already had to be named on the label before Regulation
# (EU) 2023/1545 (its recital 5: entries 45 and 67 to 92 of Annex III).
EU_ALLERGENS_BEFORE_2023_1545 = {"45"} | {str(n) for n in range(67, 93)}
# 2023/1545: products placed on the EU market from 1 August 2026 must name
# the new allergens; products already on the market may be sold until
# 31 July 2028.
EU_NEW_ALLERGENS_FROM = "2026-08-01"
EU_NEW_ALLERGENS_SELL_THROUGH = "2028-07-31"

TAG = re.compile(r"\s*\((?:INN|ISO|INCI|XAN|JAN|USAN|BAN|INNM|INN/XAN)(?:[ /][A-Z]+)*\)", re.I)
EXCEPTION = re.compile(r"\b(with the exception|except|unless|other than|excluding|provided that)\b", re.I)
GROUP = re.compile(r",?\s+(?:and (?:its|their)|its|their)\s+(?:salts|esters|ethers|compounds|isomers|derivatives)", re.I)


def plain(name: str) -> str:
    return re.sub(r"\s+", " ", TAG.sub("", name)).strip(" ,;")


def split_chemical(name: str) -> list[str]:
    return [plain(p) for p in name.split(" / ") if plain(p)]


CHEMISTRY_WORDS = {
    "sulfate", "sulphate", "acetate", "chloride", "nitrate", "phosphate", "carbonate", "hydroxide", "oxide",
    "bromide", "iodide", "fluoride", "citrate", "stearate", "oleate", "benzoate", "salicylate", "silicate",
    "formate", "lactate", "tartrate", "oxalate", "sodium", "potassium", "calcium", "magnesium", "ammonium",
    "anhydrous", "hydrate", "monohydrate", "dihydrate", "technical", "mixture", "isomers", "racemic",
}


def derived_terms(name: str) -> list[str]:
    """Shorter names a chemical name implies, e.g. "Hydroquinone" from
    "1,4-Dihydroxybenzene (Hydroquinone), with the exception of ..."."""
    terms = []
    # A name in brackets, e.g. "(Hydroquinone)" or "(HICC)": starts with a
    # capital and isn't a counter-ion or chemistry word like "(sulfate)".
    for m in re.finditer(r"\(([A-Z][A-Za-z0-9 \-]{3,40})\)", name):
        t = m.group(1).strip()
        if not re.fullmatch(r"(?i)(INN|ISO|INCI|XAN|CAS|EC|E \d+|and its salts|free acid)", t) and t.lower() not in CHEMISTRY_WORDS:
            terms.append(t)
    # "X and its salts" / "X, its salts and esters" -> "X"
    group = GROUP.search(name)
    if group:
        core = plain(name[: group.start()])
        if len(core) >= 5 and "," not in core and "(" not in core:
            terms.append(core)
    return [t for t in dict.fromkeys(terms) if len(t) >= 5]


def eu_version_date(celex: str) -> str:
    d = date.fromisoformat(f"{celex[-8:-4]}-{celex[-4:-2]}-{celex[-2:]}")
    return f"{d.day} {d.strftime('%B %Y')}"


def sources_for(jurisdiction: str, annex: str, ref: str, manifest: dict, new_allergen: bool) -> list[dict]:
    clause = f"Annex {annex}, entry {ref}"
    if jurisdiction == "GB":
        valid = manifest["gb_annexes"][annex]["valid_from"]
        return [{
            "market": "GB",
            "title": f"Regulation (EC) No 1223/2009 as it applies in Great Britain (text valid from {valid})",
            "url": f"https://www.legislation.gov.uk/eur/2009/1223/annex/{annex}",
            "clause": clause,
        }]
    title = f"Regulation (EC) No 1223/2009 (consolidated text of {eu_version_date(manifest['eu_consolidated']['celex'])})"
    out = []
    for market in ("EU", "NI"):
        out.append({"market": market, "title": title, "url": "https://eur-lex.europa.eu/eli/reg/2009/1223/oj", "clause": clause})
        if new_allergen:
            out.append({
                "market": market,
                "title": "Commission Regulation (EU) 2023/1545 (fragrance allergen labelling)",
                "url": "https://eur-lex.europa.eu/eli/reg/2023/1545/oj",
                "clause": "Annex",
            })
    return out


def load_annex(jurisdiction: str, annex: str) -> list[dict]:
    return json.loads((DATA / jurisdiction.lower() / f"annex_{annex}.json").read_text())


def cosing_inci() -> dict[str, list[str]]:
    """Annex entry ('II/1666') -> INCI names CosIng links to it."""
    links: dict[str, list[str]] = {}
    for ing in json.loads((DATA / "cosing_links.json").read_text())["ingredients"]:
        for ref in ing["annex_refs"]:
            links.setdefault(ref, []).append(ing["inci"])
    return links


def same_substance(a: dict, b: dict) -> bool:
    norm = lambda s: re.sub(r"\s+", " ", s).strip().lower()
    return norm(a["chemical_name"]) == norm(b["chemical_name"]) or bool(set(a["cas"]) & set(b["cas"]))


def rows_for(jurisdiction: str, manifest: dict, links: dict[str, list[str]]) -> list[dict]:
    rows = []
    markets = ["GB"] if jurisdiction == "GB" else ["EU", "NI"]
    for annex in ("II", "III", "IV", "V", "VI"):
        eu_by_ref = {x["ref"]: x for x in load_annex("EU", annex)}
        for e in load_annex(jurisdiction, annex):
            chem = split_chemical(e["chemical_name"])
            # CosIng links INCI names to EU entries; a GB entry reuses them
            # only when it is the same substance as the EU entry.
            eu_twin = eu_by_ref.get(e["ref"])
            linked = links.get(f"{annex}/{e['ref']}", []) if eu_twin and same_substance(e, eu_twin) else []
            conditions = " ".join(e.get("other", []))
            warnings = " ".join(e.get("warnings", []))
            allergen = annex == "III" and bool(ALLERGEN.search(f"{conditions} {warnings}"))
            new_allergen = allergen and jurisdiction == "EU" and e["ref"] not in EU_ALLERGENS_BEFORE_2023_1545

            if annex == "IV":
                ci = [c for c in e["colour_index"] if c]
                primary = f"CI {ci[0]}" if ci and re.fullmatch(r"\d{5}", ci[0]) else (ci[0] if ci else chem[0])
                names = [f"CI {c}" if re.fullmatch(r"\d{5}", c) else c for c in ci] + linked + chem
            else:
                label_name = LABEL_NAME.search(f"{conditions} {warnings}")
                label_name = re.sub(r"\s*/\s*", "/", label_name.group(1)).strip() if label_name else None
                names = ([label_name] if label_name else []) + [plain(n) for n in e["inci"]] + linked + chem
                names = [n for n in dict.fromkeys(names) if n]
                primary = names[0]
            synonyms = [n for n in dict.fromkeys(names) if n != primary]
            terms = [t for n in [e["chemical_name"]] for t in derived_terms(n) if t not in names]

            if annex == "II":
                exception = EXCEPTION.search(e["chemical_name"])
                other = e["chemical_name"][exception.start():].strip() if exception else None
            else:
                other = conditions or None

            rows.append({
                "list_type": "fragrance_allergen" if allergen else LIST_TYPE.get(annex, "restricted"),
                "jurisdiction": jurisdiction,
                "annex_ref": f"{annex}/{e['ref']}",
                "inci_name": primary,
                "synonyms": synonyms,
                "match_terms": terms,
                "chemical_name": e["chemical_name"] or None,
                "cas_number": ", ".join(e["cas"]) or None,
                "colour_index": [c for c in e.get("colour_index", []) if c],
                "markets": markets,
                "product_type": "; ".join(e.get("product_type", [])) or None,
                "max_concentration": "; ".join(e.get("max_concentration", [])) or None,
                "other_conditions": other,
                "label_warnings": warnings or None,
                "leave_on_threshold_pct": 0.001 if allergen else None,
                "rinse_off_threshold_pct": 0.01 if allergen else None,
                "applies_from": EU_NEW_ALLERGENS_FROM if new_allergen else None,
                "sell_through_until": EU_NEW_ALLERGENS_SELL_THROUGH if new_allergen else None,
                "sources": sources_for(jurisdiction, annex, e["ref"], manifest, new_allergen),
            })
    return rows


def main(version: str, cloned_from: str, out_file: str):
    manifest = json.loads((DATA / "sources.json").read_text())
    links = cosing_inci()
    rows = rows_for("GB", manifest, links) + rows_for("EU", manifest, links)
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    assert "$annexes$" not in payload
    counts = {}
    for r in rows:
        key = f"{r['jurisdiction']} {r['list_type']}"
        counts[key] = counts.get(key, 0) + 1

    eu = manifest["eu_consolidated"]
    cosing_date = json.loads((DATA / "cosing_links.json").read_text())["fetched"]
    gb_valid = manifest["gb_annexes"]["II"]["valid_from"]
    summary = "\n".join(f"--   {k}: {v}" for k, v in sorted(counts.items()))
    sql = f"""-- Generated by scripts/rulebook/build_migration.py; do not edit by hand.
--
-- Rulebook {version} (draft, cloned from {cloned_from}): the full Annexes
-- II-VI of the Cosmetics Regulation, parsed from the official texts:
--   GB: legislation.gov.uk, text valid from {gb_valid}
--   EU/NI: consolidated text {eu['celex']} (EU Publications Office),
--          which includes the expanded fragrance allergen list of
--          Regulation (EU) 2023/1545
-- Source files and their SHA-256 are in supabase/rulebook-data/sources.json.
-- INCI names for annex entries come from the Commission's CosIng database
-- (supabase/rulebook-data/cosing_links.json, fetched {cosing_date}).
--
-- Entries loaded:
{summary}
--
-- New and changed entries are unverified until an admin signs them off;
-- entries identical to {cloned_from} keep their sign-off. Hand-entered
-- substances and the "expanded EU allergens not checked yet" advisory are
-- rejected: the official lists replace them.

do $migration$
declare
  v uuid;
begin
  v := public.clone_rulebook_version(
    (select id from public.rulebook_versions where scope = 'cosmetics' and version = '{cloned_from}'),
    '{version}');
  update public.rulebook_versions
    set notes = 'Full Annexes II-VI from the official GB and EU texts (EU {eu['celex']}; GB valid from {gb_valid}).'
  where id = v;

  update public.substances
    set verification_status = 'rejected', verified_by = 'Official annex import', verified_at = now(),
        verification_note = 'Replaced by the full list parsed from the official annexes.'
  where rulebook_version_id = v and jurisdiction is null and verification_status <> 'rejected';

  update public.rules
    set verification_status = 'rejected', verified_by = 'Official annex import', verified_at = now(),
        verification_note = 'The expanded EU allergen list (2023/1545) is now checked directly.'
  where rulebook_version_id = v and rule_key = 'eu_allergens_2026' and verification_status <> 'rejected';

  update public.rules
    set explanation = 'Ingredients on the prohibited list (Annex II) must not be used. Checked by name against every entry of the GB and EU lists.',
        sources = sources || jsonb_build_array(
          jsonb_build_object('market', 'GB', 'title', 'Regulation (EC) No 1223/2009 as it applies in Great Britain',
                             'url', 'https://www.legislation.gov.uk/eur/2009/1223/annex/II', 'clause', 'Annex II'))
  where rulebook_version_id = v and rule_key = 'prohibited_substances'
    and not sources @> '[{{"url": "https://www.legislation.gov.uk/eur/2009/1223/annex/II"}}]';

  update public.rules
    set sources = sources || jsonb_build_array(
          jsonb_build_object('market', 'EU', 'title', 'Commission Regulation (EU) 2023/1545',
                             'url', 'https://eur-lex.europa.eu/eli/reg/2023/1545/oj', 'clause', 'Annex'),
          jsonb_build_object('market', 'NI', 'title', 'Commission Regulation (EU) 2023/1545',
                             'url', 'https://eur-lex.europa.eu/eli/reg/2023/1545/oj', 'clause', 'Annex'))
  where rulebook_version_id = v and rule_key = 'fragrance_allergens'
    and not sources @> '[{{"url": "https://eur-lex.europa.eu/eli/reg/2023/1545/oj"}}]';

  insert into public.rules
    (rulebook_version_id, rule_key, title, markets, field, check_type, params, severity, explanation, fix_hint, sources)
  values
    (v, 'restricted_substances', 'Restricted ingredients: limits and required warnings', array['GB', 'NI', 'EU'],
     'Ingredients', 'restricted_substances', '{{}}', 'legal',
     'Some ingredients are only allowed within limits (product type, maximum concentration) and some require a warning on the label (Annexes III, V and VI).',
     'Confirm the concentrations with your safety assessor and print any required warnings on the label.',
     jsonb_build_array(
       jsonb_build_object('market', 'GB', 'title', 'Regulation (EC) No 1223/2009 as it applies in Great Britain', 'url', 'https://www.legislation.gov.uk/eur/2009/1223/annex/III', 'clause', 'Annexes III, V and VI'),
       jsonb_build_object('market', 'EU', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Annexes III, V and VI'),
       jsonb_build_object('market', 'NI', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Annexes III, V and VI'))),
    (v, 'colourants', 'Colourants on the permitted list', array['GB', 'NI', 'EU'],
     'Ingredients', 'colourants', '{{}}', 'legal',
     'Colourants (CI numbers) must be on the permitted list (Annex IV) and used only in the product types it allows.',
     'Replace any colourant that isn''t on the permitted list, or check its product-type conditions.',
     jsonb_build_array(
       jsonb_build_object('market', 'GB', 'title', 'Regulation (EC) No 1223/2009 as it applies in Great Britain', 'url', 'https://www.legislation.gov.uk/eur/2009/1223/annex/IV', 'clause', 'Annex IV'),
       jsonb_build_object('market', 'EU', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Annex IV'),
       jsonb_build_object('market', 'NI', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Annex IV')))
  on conflict (rulebook_version_id, rule_key) do nothing;

  create temporary table incoming on commit drop as
  select * from jsonb_to_recordset($annexes${payload}$annexes$::jsonb) as r(
    list_type text, jurisdiction text, annex_ref text, inci_name text, synonyms text[], match_terms text[],
    chemical_name text, cas_number text, colour_index text[], markets text[], product_type text,
    max_concentration text, other_conditions text, label_warnings text, leave_on_threshold_pct numeric,
    rinse_off_threshold_pct numeric, applies_from date, sell_through_until date, sources jsonb);

  -- Entries identical to the cloned version keep their sign-off; changed
  -- and removed ones are dropped, and new or changed ones added unverified.
  delete from public.substances s
  where s.rulebook_version_id = v and s.jurisdiction is not null
    and not exists (
      select 1 from incoming r
      where (r.list_type, r.jurisdiction, r.annex_ref, r.inci_name, r.synonyms, r.match_terms, r.chemical_name,
             r.cas_number, r.colour_index, r.markets, r.product_type, r.max_concentration, r.other_conditions,
             r.label_warnings, r.leave_on_threshold_pct, r.rinse_off_threshold_pct, r.applies_from,
             r.sell_through_until, r.sources)
            is not distinct from
            (s.list_type, s.jurisdiction, s.annex_ref, s.inci_name, s.synonyms, s.match_terms, s.chemical_name,
             s.cas_number, s.colour_index, s.markets, s.product_type, s.max_concentration, s.other_conditions,
             s.label_warnings, s.leave_on_threshold_pct, s.rinse_off_threshold_pct, s.applies_from,
             s.sell_through_until, s.sources));

  insert into public.substances (
    rulebook_version_id, list_type, jurisdiction, annex_ref, inci_name, synonyms, match_terms,
    chemical_name, cas_number, colour_index, markets, product_type, max_concentration,
    other_conditions, label_warnings, leave_on_threshold_pct, rinse_off_threshold_pct,
    applies_from, sell_through_until, sources)
  select v, r.list_type, r.jurisdiction, r.annex_ref, r.inci_name, r.synonyms, r.match_terms,
    r.chemical_name, r.cas_number, r.colour_index, r.markets, r.product_type, r.max_concentration,
    r.other_conditions, r.label_warnings, r.leave_on_threshold_pct, r.rinse_off_threshold_pct,
    r.applies_from, r.sell_through_until, r.sources
  from incoming r
  where not exists (
    select 1 from public.substances s
    where s.rulebook_version_id = v and s.list_type = r.list_type and s.jurisdiction = r.jurisdiction
      and s.annex_ref = r.annex_ref and s.inci_name = r.inci_name);
end
$migration$;
"""
    Path(out_file).write_text(sql)
    print(f"{len(rows)} entries -> {out_file} ({len(sql) // 1024} KB)")
    for k, v in sorted(counts.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:4])
