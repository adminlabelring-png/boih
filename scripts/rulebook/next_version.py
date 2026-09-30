"""Prints the next rulebook version, the version it's cloned from, and the
file name for its migration, based on the official-annex migrations
already in supabase/migrations (e.g. "2026.3 2026.2 20261006073000_rulebook_2026_3_official_annexes.sql").
"""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

versions = sorted(
    (int(m.group(1)), int(m.group(2)))
    for f in MIGRATIONS.glob("*_rulebook_*_official_annexes.sql")
    if (m := re.search(r"_rulebook_(\d{4})_(\d+)_official_annexes\.sql$", f.name))
)
if not versions:
    raise SystemExit("No official-annex migration found to clone from")
year, n = versions[-1]
now = datetime.now(timezone.utc)
# Migrations apply in file-name order, so the new one must sort last.
latest = max(datetime.strptime(f.name[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
             for f in MIGRATIONS.glob("*.sql") if re.match(r"\d{14}_", f.name))
stamp = max(now, latest + timedelta(minutes=1))
new_year, new_n = (year, n + 1) if now.year == year else (now.year, 1)
print(f"{new_year}.{new_n} {year}.{n} {stamp:%Y%m%d%H%M%S}_rulebook_{new_year}_{new_n}_official_annexes.sql")
