"""
Raw Liquipedia dump -> every data file the site reads. Run it after
scripts/liquipedia_api.py:

    .venv/Scripts/python scripts/build_data.py

    --from players    start later: reuse the clean files already there
    --from derived    (players = FNCS titles, tiers, orgs; derived = rankings,
                       pools, teammates, career path, facts)
    --skip-check      do not run `npm run check:games` on the result first
    --out DIR         build somewhere else and leave the real files alone

The steps, each in scripts/pipeline/:

    clean.py     raw -> players, teams, tournaments, transfers, placements
                 (the five cleaning notebooks)
    enrich.py    FNCS titles, tiers, orgs.json (was players_optimize.ipynb)
    derived.py   rankings, pools, teammates, career_path, facts
                 (was the cells of notebook_cells.md)

Everything is built in a staging folder and checked with `npm run check:games`.
Only then are the files in liquipedia_data/clean_data/fortnite/ replaced, all
together - a step that fails leaves the site's data exactly as it was. Other
files in that folder are never touched.

Content from Liquipedia (https://liquipedia.net/fortnite), CC-BY-SA 3.0; FNCS
titles from Wikipedia, CC-BY-SA 4.0. See CREDITS.md.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from pipeline import clean, derived, enrich  # noqa: E402

RAW = ROOT / "liquipedia_data" / "raw_data" / "fortnite"
CLEAN = ROOT / "liquipedia_data" / "clean_data" / "fortnite"
ROSTER_TS = ROOT / "src" / "data" / "liquipedia" / "roster.ts"

CLEAN_FILES = ["players.json", "teams.json", "tournaments.json", "transfers.json", "placements.json"]
OUTPUTS = CLEAN_FILES + ["orgs.json", "rankings.json", "pools.json", "teammates.json", "career_path.json", "facts.json"]
STEPS = ["clean", "players", "derived"]


def rows_in(path):
    """How many rows a data file holds, for the before/after summary."""
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return len(data)
    for key in ("players", "boards", "pools", "orgs", "tournaments"):
        if isinstance(data.get(key), list):
            return len(data[key])
    return None


def export_date():
    """The day the raw dump was last brought up to date, from the sync's state."""
    state = RAW / "sync_state.json"
    if not state.exists():
        return None
    synced = json.loads(state.read_text(encoding="utf-8")).get("synced") or {}
    return min(synced.values())[:10] if synced else None


def set_export_date(day):
    """EXPORT_DATE in roster.ts is the "last update" every game shows."""
    text = ROSTER_TS.read_text(encoding="utf-8")
    new, count = re.subn(r"export const EXPORT_DATE = '[\d-]+';", f"export const EXPORT_DATE = '{day}';", text)
    if count == 1 and new != text:
        ROSTER_TS.write_text(new, encoding="utf-8")
        return True
    return False


def check_games(folder):
    """The site's own playability checks, against the new files."""
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        print("  npm not found - skipping the game checks")
        return True
    env = dict(os.environ, OFFSPAWN_DATA=str(folder))
    result = subprocess.run([npm, "run", "check:games"], cwd=ROOT, env=env,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = [line for line in result.stdout.splitlines() if "PROBLEM" in line or line.strip().startswith(("✗", "✓"))]
    for line in tail[:30]:
        print(f"  {line.strip()}")
    return result.returncode == 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build every data file the site reads from the raw dump.")
    parser.add_argument("--from", dest="start", choices=STEPS, default="clean", help="the step to start at")
    parser.add_argument("--skip-check", action="store_true", help="do not run npm run check:games first")
    parser.add_argument("--out", type=Path, help="build here instead of replacing the site's files")
    args = parser.parse_args(argv)

    target = args.out.resolve() if args.out else CLEAN
    stage = target.parent / f".{target.name}-build"
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    todo = STEPS[STEPS.index(args.start):]

    # A later start works on the files already there.
    if args.start != "clean":
        for name in OUTPUTS:
            source = target / name if (target / name).exists() else CLEAN / name
            if source.exists():
                shutil.copy2(source, stage / name)

    started = time.time()
    if "clean" in todo:
        if not (RAW / "players.json").exists():
            sys.exit(f"No raw dump in {RAW} - run scripts/liquipedia_api.py first.")
        print("clean - raw rows into the clean files")
        clean.run(RAW, stage)
    if "players" in todo:
        print("players - FNCS titles, tiers, organisations")
        enrich.run(stage)
    if "derived" in todo:
        print("derived - rankings, pools, teammates, career path, facts")
        derived.build(str(stage).replace("\\", "/"))

    if not args.skip_check:
        print("\ncheck - npm run check:games on the new files")
        if not check_games(stage):
            print(f"\nThe game checks failed, so nothing was replaced. The new files are in {stage}.")
            print("Look at the problems above; --skip-check replaces the files anyway.")
            return 1

    print(f"\n{'file':<18} {'before':>10} {'after':>10}")
    for name in OUTPUTS:
        print(f"{name:<18} {rows_in(target / name) or '-':>10} {rows_in(stage / name) or '-':>10}")

    target.mkdir(parents=True, exist_ok=True)
    for name in OUTPUTS:
        if (stage / name).exists():
            os.replace(stage / name, target / name)
    shutil.rmtree(stage, ignore_errors=True)

    if target == CLEAN:
        day = export_date()
        if day and set_export_date(day):
            print(f"\nEXPORT_DATE in roster.ts is now {day}.")
    print(f"\nDone in {time.time() - started:.0f}s - {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
