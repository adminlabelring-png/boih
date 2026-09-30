"""Parse Annexes II-VI of the consolidated Regulation (EC) No 1223/2009
(XHTML from the EU Publications Office) into structured JSON, one entry
per reference number, keeping the official wording of every column.

Usage:
  python3 scripts/rulebook/parse_annexes.py eu <consolidated .html> <out dir>
  python3 scripts/rulebook/parse_annexes.py gb <dir with annex_II.xml ... annex_VI.xml> <out dir>

The EU source is the consolidated text from the EU Publications Office;
the GB source is legislation.gov.uk's data.xml for each annex of the
retained regulation. scripts/rulebook/fetch_sources.sh downloads both.

Needs beautifulsoup4 and lxml (pip install beautifulsoup4 lxml).
"""
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ANNEXES = ["II", "III", "IV", "V", "VI"]

# Column layout per annex, after merged cells are expanded.
COLUMNS = {
    "II": ["ref", "chemical_name", "cas", "ec"],
    "III": ["ref", "chemical_name", "inci", "cas", "ec", "product_type", "max_concentration", "other", "warnings"],
    "IV": ["ref", "chemical_name", "colour_index", "cas", "ec", "colour", "product_type", "max_concentration", "other", "warnings"],
    "V": ["ref", "chemical_name", "inci", "cas", "ec", "product_type", "max_concentration", "other", "warnings"],
    "VI": ["ref", "chemical_name", "inci", "cas", "ec", "product_type", "max_concentration", "other", "warnings"],
}

REF = re.compile(r"^\d+[a-z]?$")
FOOTNOTE = re.compile(r"\(\s*\*?\d+\s*\)")
# Amendment markers (▼B, ▼M32, ►M5 ... ◄) and deletion dashes.
MARKER_TEXT = re.compile(r"[▼►][A-Z]\d*|◄")
MARKER_ROW = re.compile(r"^(?:[▼►◄][A-Z]?\d*|—+|\s)*$")


def clean(el) -> str:
    """Cell text; paragraphs and line breaks become newlines."""
    for br in el.find_all("br"):
        br.replace_with("\n")
    # XHTML (EU) and legislation.gov.uk XML (GB) paragraph elements.
    for p in el.find_all(["p", "div", "Para", "Text", "P", "ListItem"]):
        p.insert_after("\n")
    text = MARKER_TEXT.sub(" ", el.get_text("").replace(" ", " "))
    lines = [re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def is_marker_row(cells) -> bool:
    """Amendment markers sit in rows of their own, which still count
    towards the rowspans around them."""
    return all(MARKER_ROW.match(td.get_text(" ", strip=True).replace(" ", " ")) for td in cells)


def grid(table):
    """Expands rowspan/colspan into a list of rows of cell texts."""
    rows = []
    pending = {}  # column -> (text, rows still to fill)
    body = table.find("tbody") or table
    width = len([c for c in table.find_all("col") if c.find_parent("table") is table]) or None

    def consume(col):
        text, left = pending[col]
        if left <= 1:
            del pending[col]
        else:
            pending[col] = (text, left - 1)
        return text

    for tr in body.find_all("tr", recursive=False):
        cells = tr.find_all("td", recursive=False)
        if cells and is_marker_row(cells):
            for col in list(pending):
                consume(col)
            continue
        if width and sum(int(td.get("colspan", 1)) for td in cells) >= width:
            # A row whose own cells fill the table can't sit under a
            # rowspan; the source over-counts a few (e.g. Annex V entry 35).
            pending.clear()
        row, col, ci = [], 0, 0
        while ci < len(cells) or col in pending:
            if col in pending:
                row.append(consume(col))
                col += 1
                continue
            td = cells[ci]
            ci += 1
            text = clean(td)
            rowspan = int(td.get("rowspan", 1))
            for _ in range(int(td.get("colspan", 1))):
                row.append(text)
                if rowspan > 1:
                    pending[col] = (text, rowspan - 1)
                col += 1
        rows.append(row)
    return rows


def gb_tables(soup):
    return [t for t in soup.find_all("table") if t.find_parent("table") is None]


def annex_tables(soup, annex):
    title = next(
        (p for p in soup.find_all("p", class_="title-annex-1") if p.get_text(" ", strip=True) == f"ANNEX {annex}"),
        None,
    )
    if title is None:
        raise SystemExit(f"Annex {annex} not found")
    tables = []
    for el in title.find_all_next():
        if el.name == "p" and "title-annex-1" in (el.get("class") or []) and el is not title:
            break
        if el.name == "table" and el.find_parent("table") is None:
            tables.append(el)
    return tables


def tidy(text: str) -> str:
    return re.sub(r"\s+", " ", FOOTNOTE.sub(" ", text)).strip(" ;,")


def split_names(text: str, commas: bool = False) -> list[str]:
    """One name per line or ';' in a names cell (and, for INCI names, per
    ', ' before a letter: INCI names don't contain that, chemical names do)."""
    out = []
    sep = r"\n|;|,\s+(?=[A-Za-z])" if commas else r"\n|;"
    for part in re.split(sep, FOOTNOTE.sub(" ", text)):
        part = re.sub(r"\s+", " ", part).strip(" ,")
        if part and part not in out:
            out.append(part)
    return out


def split_ids(text: str) -> list[str]:
    parts = re.split(r"\s*/\s*|\s*;\s*|,\s*|\s+", FOOTNOTE.sub(" ", text))
    return [p for p in (x.strip() for x in parts) if re.fullmatch(r"\d{2,7}-\d{2}-\d", p)]


def structure(annex, rows):
    """Groups expanded rows into one entry per reference number. Returns
    (entries, rows that don't fit the table layout)."""
    cols = COLUMNS[annex]
    grouped, skipped = {}, []
    for row in rows:
        if len(row) != len(cols):
            skipped.append(row)
            continue
        rec = dict(zip(cols, row))
        ref = rec.pop("ref").strip().rstrip(".")
        if not REF.match(ref):
            continue  # headers, column letters, footnotes
        grouped.setdefault(ref, []).append(rec)

    entries, dropped = [], {}
    for ref, recs in grouped.items():
        def uniq(field):
            seen = []
            for r in recs:
                v = tidy(r.get(field, ""))
                if v and v not in seen:
                    seen.append(v)
            return seen

        def names(field):
            seen = []
            for r in recs:
                for n in split_names(r.get(field, ""), commas=field == "inci"):
                    if n not in seen:
                        seen.append(n)
            return seen

        chem = uniq("chemical_name")
        if not chem and not uniq("inci") and not uniq("colour_index"):
            dropped[ref] = "blank"  # deleted: row left empty
            continue
        if chem and all(re.match(r"^(moved or )?deleted", n, re.I) for n in chem):
            dropped[ref] = "deleted"
            continue
        if not chem:
            dropped[ref] = "NO CHEMICAL NAME"
            continue
        cas = []
        for r in recs:
            for c in split_ids(r.get("cas", "")):
                if c not in cas:
                    cas.append(c)
        entry = {"annex": annex, "ref": ref, "chemical_name": " / ".join(chem), "inci": names("inci"), "cas": cas}
        for f in ("colour_index", "colour", "product_type", "max_concentration", "other", "warnings"):
            if f in cols:
                entry[f] = names(f) if f == "colour_index" else uniq(f)
        entries.append(entry)
    return entries, skipped, dropped


def main(kind, src, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    eu_soup = BeautifulSoup(Path(src).read_text(encoding="utf-8"), "html.parser") if kind == "eu" else None
    for annex in ANNEXES:
        if kind == "eu":
            tables = annex_tables(eu_soup, annex)
        else:
            tables = gb_tables(BeautifulSoup((Path(src) / f"annex_{annex}.xml").read_text(encoding="utf-8"), "xml"))
        rows = [row for table in tables for row in grid(table)]
        entries, skipped, dropped = structure(annex, rows)
        bad = {r: why for r, why in dropped.items() if why not in ("blank", "deleted")}
        if bad:
            raise SystemExit(f"Annex {annex}: entries dropped for an unexpected reason: {bad}")
        (out / f"annex_{annex}.json").write_text(json.dumps(entries, ensure_ascii=False, indent=1) + "\n")
        print(
            f"Annex {annex}: {len(entries)} entries ({len(dropped)} deleted in the source); "
            f"{len(skipped)} rows outside the table layout"
        )
        for r in skipped:
            if any(c.strip() for c in r):
                print("   skipped:", [c[:60] for c in r])


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("eu", "gb"):
        raise SystemExit(__doc__)
    main(*sys.argv[1:4])
