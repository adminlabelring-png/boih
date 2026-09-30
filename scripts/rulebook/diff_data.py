"""Compares two copies of supabase/rulebook-data and writes a Markdown
summary of what changed in the official annexes: entries added, removed,
and changed field by field, per jurisdiction and annex.

Usage: python3 scripts/rulebook/diff_data.py <old data dir> <new data dir> [summary.md]
Exit code 0 when no entry changed, 3 when some did (anything else is an error).
"""
import json
import sys
from pathlib import Path

ANNEXES = ["II", "III", "IV", "V", "VI"]
FIELDS = ["chemical_name", "inci", "cas", "colour_index", "product_type", "max_concentration", "other", "warnings"]
LABEL = {
    "chemical_name": "Name", "inci": "INCI", "cas": "CAS", "colour_index": "Colour index",
    "product_type": "Product types", "max_concentration": "Maximum", "other": "Conditions", "warnings": "Label warnings",
}
TITLE = {"II": "prohibited", "III": "restricted", "IV": "colourants", "V": "preservatives", "VI": "UV filters"}


def load(d: Path, jurisdiction: str, annex: str) -> dict[str, dict]:
    f = d / jurisdiction / f"annex_{annex}.json"
    return {e["ref"]: e for e in json.loads(f.read_text())} if f.exists() else {}


def show(v) -> str:
    text = "; ".join(v) if isinstance(v, list) else (v or "")
    text = text.replace("|", "\\|")
    return f"`{text[:300]}{'…' if len(text) > 300 else ''}`" if text else "_(empty)_"


def name(e: dict) -> str:
    return (e.get("inci") or [None])[0] or e.get("chemical_name") or ", ".join(f"CI {c}" for c in e.get("colour_index", []))


def diff(old: Path, new: Path) -> list[str]:
    lines = []
    for jurisdiction, where in (("gb", "GB (legislation.gov.uk)"), ("eu", "EU/NI (consolidated text)")):
        for annex in ANNEXES:
            a, b = load(old, jurisdiction, annex), load(new, jurisdiction, annex)
            added = [r for r in b if r not in a]
            removed = [r for r in a if r not in b]
            changed = [r for r in b if r in a and any(a[r].get(f) != b[r].get(f) for f in FIELDS)]
            if not (added or removed or changed):
                continue
            lines.append(f"### {where}: Annex {annex} ({TITLE[annex]})")
            for r in added:
                lines.append(f"- **Added** entry {r}: {name(b[r])}")
            for r in removed:
                lines.append(f"- **Removed** entry {r}: {name(a[r])}")
            for r in changed:
                lines.append(f"- **Changed** entry {r}: {name(b[r])}")
                for f in FIELDS:
                    if a[r].get(f) != b[r].get(f):
                        lines.append(f"  - {LABEL[f]}: {show(a[r].get(f))} → {show(b[r].get(f))}")
            lines.append("")

    old_links = {i["inci"]: i["annex_refs"] for i in json.loads((old / "cosing_links.json").read_text())["ingredients"]} if (old / "cosing_links.json").exists() else {}
    new_links = {i["inci"]: i["annex_refs"] for i in json.loads((new / "cosing_links.json").read_text())["ingredients"]} if (new / "cosing_links.json").exists() else {}
    link_changes = [
        f"- {inci}: {', '.join(old_links.get(inci, [])) or '—'} → {', '.join(new_links.get(inci, [])) or '—'}"
        for inci in sorted(set(old_links) | set(new_links))
        if old_links.get(inci, []) != new_links.get(inci, [])
    ]
    if link_changes:
        lines.append("### CosIng INCI links")
        lines.extend(link_changes[:200])
        if len(link_changes) > 200:
            lines.append(f"- …and {len(link_changes) - 200} more")
        lines.append("")
    return lines


def main(old: str, new: str, out: str | None = None) -> int:
    lines = diff(Path(old), Path(new))
    old_src = json.loads((Path(old) / "sources.json").read_text()) if (Path(old) / "sources.json").exists() else {}
    new_src = json.loads((Path(new) / "sources.json").read_text())
    header = [
        "## Official annex changes",
        "",
        f"- EU consolidated text: {old_src.get('eu_consolidated', {}).get('celex', '—')} → {new_src['eu_consolidated']['celex']}",
        f"- GB annexes valid from: {old_src.get('gb_annexes', {}).get('III', {}).get('valid_from', '—')} → {new_src['gb_annexes']['III']['valid_from']}",
        "",
    ]
    text = "\n".join(header + (lines or ["No entries changed (only source metadata)."])) + "\n"
    if out:
        Path(out).write_text(text)
    print(text)
    return 3 if lines else 0


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    sys.exit(main(*sys.argv[1:]))
