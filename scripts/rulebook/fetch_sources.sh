#!/usr/bin/env bash
# Downloads the official texts the cosmetics rulebook data is parsed from,
# and records exactly which versions were used in sources.json.
#
#   EU: the latest consolidated Regulation (EC) No 1223/2009 and
#       Regulation (EU) 2023/1545, from the EU Publications Office (EUR-Lex
#       itself blocks automated downloads).
#   GB: Annexes II-VI of the retained regulation, from legislation.gov.uk.
#
# Usage: scripts/rulebook/fetch_sources.sh <download dir>
set -euo pipefail
dir=${1:?download dir}
mkdir -p "$dir/gb"

query='PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> SELECT ?celex WHERE { ?w cdm:resource_legal_id_celex ?celex . FILTER(STRSTARTS(STR(?celex), "02009R1223-")) } ORDER BY DESC(?celex) LIMIT 1'
celex=$(curl -fsS -G --data-urlencode "query=$query" -H "Accept: application/sparql-results+json" \
  https://publications.europa.eu/webapi/rdf/sparql | python3 -c 'import json,sys; print(json.load(sys.stdin)["results"]["bindings"][0]["celex"]["value"])')

fetch_eu() { # celex, file
  curl -fsS -L -o "$dir/$2" -H "Accept: application/xhtml+xml" -H "Accept-Language: eng" \
    "http://publications.europa.eu/resource/celex/$1"
}
fetch_eu "$celex" eu_consolidated.html
fetch_eu 32023R1545 eu_2023_1545.html
for a in II III IV V VI; do
  curl -fsS -o "$dir/gb/annex_$a.xml" "https://www.legislation.gov.uk/eur/2009/1223/annex/$a/data.xml"
done

python3 - "$dir" "$celex" <<'PY'
import hashlib, json, re, sys
from pathlib import Path
d, celex = Path(sys.argv[1]), sys.argv[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
gb_valid = {}
for a in ["II", "III", "IV", "V", "VI"]:
    xml = (d / "gb" / f"annex_{a}.xml").read_text(encoding="utf-8")
    m = re.search(r"<dct:valid>([^<]+)", xml)
    gb_valid[a] = m.group(1) if m else None
manifest = {
    "eu_consolidated": {"celex": celex, "url": f"http://publications.europa.eu/resource/celex/{celex}",
                        "sha256": sha(d / "eu_consolidated.html")},
    "eu_2023_1545": {"celex": "32023R1545", "url": "http://publications.europa.eu/resource/celex/32023R1545",
                     "sha256": sha(d / "eu_2023_1545.html")},
    "gb_annexes": {a: {"url": f"https://www.legislation.gov.uk/eur/2009/1223/annex/{a}/data.xml",
                       "valid_from": gb_valid[a], "sha256": sha(d / "gb" / f"annex_{a}.xml")}
                   for a in gb_valid},
}
(d / "sources.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(json.dumps({"eu": celex, "gb_valid": gb_valid}))
PY
