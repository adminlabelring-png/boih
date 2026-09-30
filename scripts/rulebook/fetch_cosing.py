"""Downloads, from the European Commission's CosIng database, every
ingredient that CosIng links to an annex entry of the Cosmetics
Regulation (e.g. INCI "BUTYLPHENYL METHYLPROPIONAL" -> "II/1666").

The annexes name substances chemically ("2-(4-tert-butylbenzyl)
propionaldehyde"); labels use INCI names. These official links let the
rule engine match one to the other.

Uses the same public search service and key as the CosIng website
(ec.europa.eu/growth/tools-databases/cosing, assets/env-json-config.json).

Usage: python3 scripts/rulebook/fetch_cosing.py supabase/rulebook-data/cosing_links.json
"""
import json
import re
import sys
import time
import urllib.request
import uuid
from datetime import date

CONFIG_URL = "https://ec.europa.eu/growth/tools-databases/cosing/assets/env-json-config.json"
QUERY = {"bool": {"must": [{"term": {"itemType": "ingredient"}}, {"exists": {"field": "cosmeticRestriction"}}]}}
PAGE_SIZE = 200  # the service's maximum
# "II/1380", sometimes followed by notes. Other values are advice such as
# "Please consider whether entry 419 of Annex II ... applies", kept as notes.
REF = re.compile(r"^\s*(?:annex:?\s*)?(II|III|IV|V|VI)\s*/\s*(\d+[a-z]?)\b", re.I)


def split_restrictions(values: list[str]) -> tuple[list[str], list[str]]:
    refs, notes = [], []
    for v in values:
        m = REF.match(v)
        if m:
            refs.append(f"{m.group(1).upper()}/{m.group(2)}")
        elif v.strip():
            notes.append(re.sub(r"\s+", " ", v).strip())
    return sorted(set(refs)), notes


def post(url: str, query: dict) -> dict:
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"query\"; filename=\"blob\"\r\n"
        f"Content-Type: application/json\r\n\r\n{json.dumps(query)}\r\n--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def main(out_file: str):
    with urllib.request.urlopen(CONFIG_URL, timeout=60) as res:
        config = json.load(res)
    base = f"{config['euSearchApiUrl']}?apiKey={config['euSearchApiKey']}&text=*&pageSize={PAGE_SIZE}"

    records, total, page = [], None, 1
    while total is None or len(records) < total:
        data = post(f"{base}&pageNumber={page}", QUERY)
        total = data["totalResults"]
        if data.get("warnings"):
            raise SystemExit(f"CosIng warnings: {data['warnings']}")
        results = data.get("results", [])
        if not results:
            break
        for r in results:
            m = r["metadata"]
            refs, notes = split_restrictions(m.get("cosmeticRestriction", []))
            records.append({
                "inci": (m.get("inciName") or [""])[0].strip(),
                "annex_refs": refs,
                "notes": notes,
                "cas": [c.strip() for c in " / ".join(m.get("casNo", [])).split("/") if c.strip() and c.strip() != "-"],
                "status": (m.get("status") or [""])[0],
            })
        page += 1
        time.sleep(0.5)
    if len(records) != total:
        raise SystemExit(f"Expected {total} records, got {len(records)}")

    records = sorted((r for r in records if r["inci"]), key=lambda r: (r["inci"], r["annex_refs"]))
    with open(out_file, "w") as f:
        json.dump({"fetched": date.today().isoformat(), "source": "European Commission CosIng database",
                   "url": "https://ec.europa.eu/growth/tools-databases/cosing/", "ingredients": records},
                  f, ensure_ascii=False, indent=0)
        f.write("\n")
    print(f"{len(records)} ingredients linked to annex entries -> {out_file}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
