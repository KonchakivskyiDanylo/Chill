"""
The clean players file, finished: FNCS titles, difficulty tiers and the
organisations file. What players_optimize.ipynb (now deleted) did by hand, in
its order.

FNCS titles
-----------
Liquipedia publishes no per-player FNCS title count, so the count has always
come from Wikipedia's "Competitive Fortnite records and statistics", as it was
imported into this repo (wikipedia_fncs.json, read out of git before dce12ea).
That table stops at FNCS 2026 Major 2. Every regional grand final after it is
counted from Liquipedia's own results instead - the 1st-placed team of each
final - so new titles land without waiting on anyone to update a table.

Tiers
-----
Top 2% of career earners easy, the next 18% medium, the rest hard; the same cut
again inside each region for `region_tier`. Players with no prize money or who
have passed away are `unused` and never reach a game.
"""

import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent

EASY_PCT, MEDIUM_PCT = 0.02, 0.20

# The last round wikipedia_fncs.json covers, as Liquipedia dates it: the FNCS
# 2026 Major 2 grand finals, 1 August 2026. Finals starting after it count
# from Liquipedia.
WIKIPEDIA_THROUGH = "2026-08-01"


# ------------------------------------------------------------- FNCS titles --

def norm(s):
    """Match key for a handle: fold accents, keep a-z0-9."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def base(s):
    """'Speedy (BH)' -> 'speedy'"""
    return norm(re.sub(r"[_ ]*\(.*", "", (s or "").replace("_", " ")))


CODE_TO_NAT = {
    "US": "United States", "CA": "Canada", "GB": "United Kingdom", "AU": "Australia",
    "JP": "Japan", "BR": "Brazil", "FR": "France", "DE": "Germany", "SA": "Saudi Arabia",
    "MX": "Mexico", "PL": "Poland", "RU": "Russia", "AT": "Austria", "SE": "Sweden",
    "DK": "Denmark", "NL": "Netherlands", "NO": "Norway", "IE": "Ireland", "IT": "Italy",
    "ES": "Spain", "PT": "Portugal", "LT": "Lithuania", "LV": "Latvia", "SI": "Slovenia",
    "RS": "Serbia", "HR": "Croatia", "BA": "Bosnia and Herzegovina", "UA": "Ukraine",
    "KR": "South Korea", "SG": "Singapore", "MY": "Malaysia", "IN": "India",
    "ID": "Indonesia", "PK": "Pakistan", "AE": "United Arab Emirates", "BH": "Bahrain",
    "KW": "Kuwait", "JO": "Jordan", "OM": "Oman", "SY": "Syria", "CL": "Chile",
    "AR": "Argentina", "CU": "Cuba", "NZ": "New Zealand",
}

# Wikipedia names that Liquipedia spells differently, checked by hand.
ALIASES = {
    "Kalgamer": "Kalgamer710",
    "Kiryache": "Kiryache32",
    "Speedy (AU)": "SpeedyND",  # the Oceania Speedy; without it both Speedys landed on the Bahraini page
    "Speedy (BH)": "Speedy",
    "Bobi": "Bobik1ng",         # id is 'BOBY', page is 'Bobik1ng'
    "Buyuriro": "Buyuriru",
    "Drobban": "Drobbаn",       # NB: Cyrillic 'а'
    "Kucha": "Kocha",
    "Mansoor": "Mansour",
    "Murlox": "Murloc",
    "Takamura": "Ruri",
}


def is_epic(t):
    return any("epic games" in str(o).lower() for o in (t.get("organizers") or []))


def is_fncs_final(t):
    return (t["liquipediatier"] == 1 and t["liquipediatiertype"] is None and is_epic(t)
            and "FNCS" in t["name"] and not re.search(r"console|mobile|twitch", t["name"], re.I))


def is_regional_final(t):
    """An FNCS title: a regional grand final, not a LAN or a Global Championship."""
    return (is_fncs_final(t) and t.get("type") != "Offline"
            and "Global Championship" not in t["name"]
            and not re.search(r"challenge", t["name"], re.I))


def won_first(row):
    return re.match(r"^1(\D|$)", str(row.get("placement") or "")) is not None


def fncs_titles(rows, tournaments, placements):
    """pagename -> the finals they won, and a report of anything that needs a look."""
    page_of = {r["pagename"].replace("_", " "): r["pagename"] for r in rows}
    by_id = {}
    for r in rows:
        by_id.setdefault(r["id"], r["pagename"])

    def page_for(name):
        return page_of.get(name) or by_id.get(name)

    fncs_names = {t["name"] for t in tournaments if is_fncs_final(t)}
    # Who Liquipedia itself has winning an FNCS - the tiebreak between namesakes.
    # Both FHDs are Saudi, so nationality could not split them.
    lp_winners = set()
    for row in placements:
        if row.get("tournament") in fncs_names and won_first(row):
            lp_winners.update(page_for(p.get("player") or "") for p in row.get("participants") or [])

    index = defaultdict(list)
    for r in rows:
        for k in {norm(r["id"]), norm(r["pagename"]), *(norm(a) for a in (r.get("alternateid_list") or []))}:
            if k:
                index[k].append(r)

    def resolve(handle, country=None):
        hits = index.get(norm(handle)) or index.get(base(handle))
        if not hits:
            return None
        if len(hits) > 1 and country:
            same = [r for r in hits if CODE_TO_NAT.get(country) in (r.get("nationalities") or [])]
            if same:
                hits = same
        if len(hits) > 1:
            won = [r for r in hits if r["pagename"] in lp_winners]
            if won:
                hits = won
        return max(hits, key=lambda r: r.get("earnings") or 0)

    wikipedia = json.loads((HERE / "wikipedia_fncs.json").read_text(encoding="utf-8"))
    titles, landed, unmatched = defaultdict(set), defaultdict(list), []
    for winner in wikipedia["winners"]:
        handle = winner["handle"]
        r = resolve(ALIASES.get(handle, handle), winner["country"])
        if r is None:
            unmatched.append(handle)
        else:
            titles[r["pagename"]] |= set(winner["events"])
            landed[r["pagename"]].append(handle)

    # After the Wikipedia table: Liquipedia's regional finals, winners by page.
    later = {t["name"] for t in tournaments
             if is_regional_final(t) and str(t.get("startdate") or "") > WIKIPEDIA_THROUGH}
    added = defaultdict(set)
    for row in placements:
        if row.get("tournament") in later and won_first(row):
            for p in row.get("participants") or []:
                page = page_for(p.get("player") or "")
                if page:
                    titles[page].add(row["tournament"])
                    added[row["tournament"]].add(page)

    report = []
    if unmatched:
        report.append("Wikipedia names with no Liquipedia page: " + ", ".join(sorted(unmatched)))
    for page, handles in sorted(landed.items()):
        # Two Wikipedia names on one page is either one person under two handles
        # (Takamura/Ruri, in ALIASES) or two people the matching confused.
        # Anything here that is not in ALIASES needs a look.
        if len(handles) > 1:
            report.append(f"one page, several Wikipedia names: {page} <- {handles}")
    for final, pages in sorted(added.items()):
        report.append(f"new title from Liquipedia: {final} -> {', '.join(sorted(pages))}")
    return titles, report


# ------------------------------------------------------------------ tiers --

def unusable(r):
    """Rows the games must never touch."""
    return (r.get("status") or "").lower() == "passed away" or (r.get("earnings") or 0) <= 0


def cut(members, key):
    """easy / medium / hard by earnings, the richest first."""
    members.sort(key=lambda r: (-(r.get("earnings") or 0), r["id"].lower()))
    easy_cut, med_cut = len(members) * EASY_PCT, len(members) * MEDIUM_PCT
    for i, r in enumerate(members, start=1):
        r[key] = "easy" if i <= easy_cut else "medium" if i <= med_cut else "hard"


def finish_players(base_dir):
    base_dir = Path(base_dir)
    rows = json.loads((base_dir / "players.json").read_text(encoding="utf-8"))
    tournaments = json.loads((base_dir / "tournaments.json").read_text(encoding="utf-8"))
    placements = json.loads((base_dir / "placements.json").read_text(encoding="utf-8"))

    titles, report = fncs_titles(rows, tournaments, placements)
    for r in rows:
        r["fncs_wins"] = len(titles.get(r["pagename"], ()))

    for r in rows:
        r["tier"] = "unused"
    cut([r for r in rows if not unusable(r)], "tier")

    for r in rows:
        if r.get("pagename") == "FoCuS":
            r["region"] = "Europe"
        if (r.get("region") or "").strip().lower() == "africa":
            r["region"] = "Middle East"

    by_region = defaultdict(list)
    for r in rows:
        r["region_tier"] = "unused"
        if r["tier"] != "unused":
            by_region[r.get("region") or "Unknown"].append(r)
    for members in by_region.values():
        cut(members, "region_tier")

    with open(base_dir / "players.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2, separators=(",", ":"))

    print(f"  players.json       {sum(1 for r in rows if r['fncs_wins']):,} with an FNCS title, "
          f"tiers {dict(Counter(r['tier'] for r in rows))}")
    for line in report:
        print(f"    {line}")


# ------------------------------------------------------------------- orgs --

MIN_PLAYERS = 4  # a criterion nobody can fill is not a criterion
NOT_A_TEAM = {"free agent", "retired", "retirement", "inactive", "none", "unknown", ""}


def build_orgs(base_dir):
    base_dir = Path(base_dir)
    players_rows = json.loads((base_dir / "players.json").read_text(encoding="utf-8"))
    teams_rows = json.loads((base_dir / "teams.json").read_text(encoding="utf-8"))
    transfers = json.loads((base_dir / "transfers.json").read_text(encoding="utf-8"))

    by_page = {p["pagename"].replace("_", " "): p["pagename"] for p in players_rows}
    by_id = {}
    for p in players_rows:
        by_id.setdefault(p["id"], p["pagename"])
    tier = {p["pagename"]: p["tier"] for p in players_rows}

    def resolve(name):
        """A transfer's player name -> a playable players.json pagename, or None."""
        page = by_page.get(name) or by_id.get(name)
        return page if page and tier.get(page) != "unused" else None

    page_of = {t["name"]: t["pagename"] for t in teams_rows}
    team_meta = {t["pagename"]: t for t in teams_rows}

    def org_key(name):
        """Transfers spell orgs by display name; teams.json and players.json by
        page name. Falls back to the raw string for orgs with no team page."""
        if not name or name.strip().lower() in NOT_A_TEAM:
            return None
        return page_of.get(name, name)

    ever = defaultdict(set)
    for row in transfers:
        page = resolve(row.get("player") or "")
        if not page:
            continue
        # Per side: `role_from` is what they were at `fromteam`, `role_to` what
        # they became at `toteam`.
        for side, role in (("fromteam", "role_from"), ("toteam", "role_to")):
            if row.get(role) != "Player":
                continue
            key = org_key(row.get(side))
            if key:
                ever[key].add(page)

    # players.json is the authority on who is there now.
    current = defaultdict(set)
    for p in players_rows:
        if p["tier"] != "unused" and p.get("teampagename"):
            current[p["teampagename"]].add(p["pagename"])
    for key, members in current.items():
        ever[key] |= members

    orgs = []
    for key, members in ever.items():
        if len(members) < MIN_PLAYERS:
            continue
        meta = team_meta.get(key)
        orgs.append({
            "id": key,
            "name": meta["name"] if meta else key,
            "hasPage": meta is not None,
            "region": (meta or {}).get("region"),
            "status": (meta or {}).get("status"),
            "earnings": round(float((meta or {}).get("earnings") or 0)),
            "current": sorted(current.get(key, ())),
            "ever": sorted(members),
        })
    orgs.sort(key=lambda o: (-o["earnings"], o["name"].lower()))  # richest first

    payload = {"generated": date.today().isoformat(), "minPlayers": MIN_PLAYERS, "orgs": orgs}
    with open(base_dir / "orgs.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  orgs.json          {len(orgs)} orgs with {MIN_PLAYERS}+ players, "
          f"{sum(1 for o in orgs if o['hasPage'])} with a Liquipedia team page")


def run(base_dir):
    finish_players(base_dir)
    build_orgs(base_dir)
