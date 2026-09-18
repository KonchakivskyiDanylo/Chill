"""
Builds the Higher or Lower roster from the Liquipedia dump.

    python scripts/build_liquipedia_roster.py

Reads (never writes) `liquipedia_data/clean_data/fortnite/`:

    players.json      one row per Liquipedia player page: handle, real name,
                      nationalities, region, birthdate, career earnings
    tournaments.json  every tournament, with its Liquipedia tier and prize pool
    placements.json   every recorded finish; used only for 1st places
    teams.json        organisation display names

and `src/data/fortnite/{players,events,entries}.ts` for FNCS titles, which the
Liquipedia dump does not publish as a per-player number. Those three files are
the earlier Wikipedia import ("Competitive Fortnite records and statistics"),
whose FNCS winners table lists every grand-final winner in every region since
2019 — so a handle missing from it has no FNCS title, and reads as 0 here.

Writes one file:

    src/data/liquipedia/roster.json

Re-run it whenever the dump changes. Nothing else in the project regenerates,
and no input file is modified.

Liquipedia text content is CC-BY-SA 3.0; see CREDITS.md.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DUMP = ROOT / "liquipedia_data" / "clean_data" / "fortnite"
LEGACY = ROOT / "src" / "data" / "fortnite"
OUT = ROOT / "src" / "data" / "liquipedia" / "roster.json"

# Share of the fame score each half carries. Mirrors fame_calculation.ipynb:
# earnings carry the ranking, weighted titles stop a cup grinder outranking a
# champion who won one enormous event.
EARNINGS_WEIGHT = 0.70
WINS_WEIGHT = 0.30

# Tier cuts, by rank rather than by score: Easy is the names everyone knows,
# Medium the scene's regulars, Hard the rest.
#
# Much tighter than fame_calculation.ipynb's 10/40 split, because this roster is
# eighteen times the size of the one that split was written for. At 10% the Easy
# tier ran 567 deep and bottomed out on players with $50k and no title, which is
# not an easy question. Top 2% lands on the last name a casual viewer would
# recognise, and 20% on the last one a regular viewer would.
EASY_PERCENTILE = 0.02
MEDIUM_PERCENTILE = 0.20


# --------------------------------------------------------------------- helpers


def norm(value: str | None) -> str:
    """Match key for a handle: fold accents, drop everything but a-z0-9."""
    if not value:
        return ""
    folded = unicodedata.normalize("NFKD", value)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", folded.lower())


def base_handle(value: str | None) -> str:
    """`Speedy (BH)` / `Winter_(Australian_player)` -> `speedy` / `winter`."""
    if not value:
        return ""
    return norm(re.sub(r"[_ ]*\(.*", "", value.replace("_", " ")))


def load(name: str):
    with (DUMP / name).open(encoding="utf-8") as handle:
        return json.load(handle)


# ------------------------------------------------------------- country codes

# Every value that appears in players.json `nationalities`, mapped to ISO
# 3166-1 alpha-2 so the flag badge has something to render. The four UK home
# nations collapse to GB; Kosovo uses the user-assigned XK.
COUNTRY_CODES: dict[str, str] = {
    "Albania": "AL", "Algeria": "DZ", "Andorra": "AD", "Argentina": "AR",
    "Australia": "AU", "Austria": "AT", "Azerbaijan": "AZ", "Bahrain": "BH",
    "Belarus": "BY", "Belgium": "BE", "Bolivia": "BO",
    "Bosnia and Herzegovina": "BA", "Brazil": "BR", "Bulgaria": "BG",
    "Cabo Verde": "CV", "Cambodia": "KH", "Canada": "CA",
    "Cayman Islands": "KY", "Chile": "CL", "China": "CN", "Colombia": "CO",
    "Cook Islands": "CK", "Costa Rica": "CR", "Croatia": "HR", "Cuba": "CU",
    "Czechia": "CZ", "Denmark": "DK", "Dominica": "DM",
    "Dominican Republic": "DO", "Ecuador": "EC", "Egypt": "EG",
    "El Salvador": "SV", "England": "GB", "Estonia": "EE", "Fiji": "FJ",
    "Finland": "FI", "France": "FR", "Georgia": "GE", "Germany": "DE",
    "Greece": "GR", "Greenland": "GL", "Guatemala": "GT", "Guinea": "GN",
    "Guyana": "GY", "Honduras": "HN", "Hong Kong": "HK", "Hungary": "HU",
    "Iceland": "IS", "India": "IN", "Indonesia": "ID", "Iran": "IR",
    "Iraq": "IQ", "Ireland": "IE", "Israel": "IL", "Italy": "IT",
    "Jamaica": "JM", "Japan": "JP", "Jordan": "JO", "Kazakhstan": "KZ",
    "Kenya": "KE", "Kosovo": "XK", "Kuwait": "KW", "Latvia": "LV",
    "Lebanon": "LB", "Lithuania": "LT", "Luxembourg": "LU", "Malaysia": "MY",
    "Malta": "MT", "Martinique": "MQ", "Mexico": "MX", "Moldova": "MD",
    "Morocco": "MA", "Namibia": "NA", "Netherlands": "NL",
    "New Zealand": "NZ", "Nicaragua": "NI", "Nigeria": "NG",
    "North Macedonia": "MK", "Northern Ireland": "GB", "Norway": "NO",
    "Oman": "OM", "Pakistan": "PK", "Palestine": "PS", "Panama": "PA",
    "Paraguay": "PY", "Peru": "PE", "Philippines": "PH", "Poland": "PL",
    "Portugal": "PT", "Puerto Rico": "PR", "Qatar": "QA", "Romania": "RO",
    "Russia": "RU", "Saudi Arabia": "SA", "Scotland": "GB", "Serbia": "RS",
    "Singapore": "SG", "Slovakia": "SK", "Slovenia": "SI",
    "South Africa": "ZA", "South Korea": "KR", "Spain": "ES",
    "Sri Lanka": "LK", "Sweden": "SE", "Switzerland": "CH", "Syria": "SY",
    "Taiwan": "TW", "Thailand": "TH", "Trinidad and Tobago": "TT",
    "Tunisia": "TN", "Turkey": "TR", "Uganda": "UG", "Ukraine": "UA",
    "United Arab Emirates": "AE", "United Kingdom": "GB",
    "United States": "US", "Uruguay": "UY", "Venezuela": "VE",
    "Vietnam": "VN", "Wales": "GB", "Yemen": "YE",
}


# ------------------------------------------------------------- win weighting


def win_points(tier: int | None, tier_type: str | None, prizepool: float | None) -> float:
    """
    What one 1st place is worth.

    Liquipedia's own tier is the backbone: tier 1 with no tier type is the real
    top of the sport (FNCS grand finals, the Globals, the World Cup, EWC),
    while tier 5 is a $240 community cup. A qualifier or a weekly cup is worth a
    fraction of a final at the same tier, and inside a tier the prize pool
    separates a $15M World Cup from a $79k regional final.
    """
    base = {1: 60.0, 2: 15.0, 3: 6.0, 4: 2.0, 5: 0.5}.get(tier or 5, 1.0)
    kind = {
        None: 1.0,
        "Qualifier": 0.20,
        "Weekly": 0.10,
        "Monthly": 0.25,
        "Misc": 0.15,
        "Showmatch": 0.25,
    }.get(tier_type, 1.0)
    # log10($100k) / 5 == 1.0, so a median tier-1 final is the reference point.
    scale = min(1.6, max(0.4, math.log10(max(prizepool or 0.0, 1_000.0)) / 5.0))
    return base * kind * scale


# --------------------------------------------------------- legacy FNCS titles


def legacy_fncs_wins() -> dict[str, int]:
    """
    FNCS titles per player handle, from the earlier Wikipedia import.

    The generated `.ts` tables are one record per line, so a line regex is
    enough and the project needs no TypeScript runtime to build data.
    """
    tiers: dict[str, str] = {}
    for line in (LEGACY / "events.ts").read_text(encoding="utf-8").splitlines():
        found = re.search(r"id: '([^']+)'.*?tier: '([^']+)'", line)
        if found:
            tiers[found.group(1)] = found.group(2)

    names: dict[str, str] = {}
    for line in (LEGACY / "players.ts").read_text(encoding="utf-8").splitlines():
        found = re.search(r"id: '([^']+)', name: '([^']*)'", line)
        if found:
            names[found.group(1)] = found.group(2)

    wins: Counter[str] = Counter()
    for line in (LEGACY / "entries.ts").read_text(encoding="utf-8").splitlines():
        found = re.search(
            r"eventId: '([^']+)', placement: (\d+), playerIds: \[([^\]]*)\]", line
        )
        if not found or int(found.group(2)) != 1:
            continue
        if tiers.get(found.group(1)) != "fncs":
            continue
        for player_id in re.findall(r"'([^']+)'", found.group(3)):
            wins[names.get(player_id, player_id)] += 1
    return dict(wins)


# Winners the Wikipedia table and the Liquipedia dump spell differently.
# Verified one by one against the dump (handle, nationality and earnings all
# line up); anything not listed here and not matched by handle is a player
# without a Liquipedia page, so it never reaches the roster.
FNCS_ALIASES = {
    "Kalgamer": "Kalgamer710",
    "Kiryache": "Kiryache32",
    "Speedy (BH)": "Speedy",
}


# ------------------------------------------------------------------- pipeline


def eligible(row: dict) -> bool:
    """
    Whether a Liquipedia page belongs on the roster.

    `type` is kept wide on purpose. Liquipedia files the scene's streamers as
    staff, but Nate Hill, SypherPK, Myth and CouRage have all won real prize
    money and are far more recognisable than most tier-1 competitors — leaving
    them out would gut the Easy tier. The bar is a competitive record instead:
    some prize money, which every actual competitor in the dump has.

    Players Liquipedia records as having died are left out. The game asks how
    old someone is today, and there is no good way to ask that about them.
    """
    if (row.get("status") or "").lower() == "passed away":
        return False
    return (row.get("earnings") or 0) > 0


def main() -> None:
    players = [p for p in load("players.json") if eligible(p)]
    tournaments = load("tournaments.json")
    teams = load("teams.json")

    # --- organisation display names
    team_names = {t["pagename"]: (t.get("name") or t["pagename"]) for t in teams}

    # --- tournament index. 232 names are shared by more than one tournament
    # (recurring community cups); keep the most prestigious, which for those
    # tier 4/5 weeklies changes nothing measurable either way.
    by_name: dict[str, dict] = {}
    for event in tournaments:
        name = event.get("name")
        if not name:
            continue
        seen = by_name.get(name)
        if seen is None or (
            (event.get("liquipediatier") or 9),
            -(event.get("prizepool") or 0),
        ) < ((seen.get("liquipediatier") or 9), -(seen.get("prizepool") or 0)):
            by_name[name] = event
    points_by_event = {
        name: win_points(e.get("liquipediatier"), e.get("liquipediatiertype"), e.get("prizepool"))
        for name, e in by_name.items()
    }

    # --- handle index, so a placement row can find its player page
    index: dict[str, list[dict]] = defaultdict(list)
    for player in players:
        keys = {norm(player["id"]), norm(player["pagename"])}
        keys.update(norm(alt) for alt in (player.get("alternateid_list") or []))
        for key in keys:
            if key:
                index[key].append(player)

    def resolve(handle: str, country: str | None = None) -> dict | None:
        """
        The player page a handle refers to.

        Handles repeat across the scene — 142 of them belong to two or more
        pages ("Aqua" is both the Austrian World Cup winner and a Japanese
        player). Nationality settles it when the caller knows one; otherwise
        the biggest career takes it, which is the one a guesser means.
        """
        found = index.get(norm(handle)) or index.get(base_handle(handle))
        if not found:
            return None
        if len(found) == 1:
            return found[0]
        if country:
            same = [
                p
                for p in found
                if country in {COUNTRY_CODES.get(n) for n in (p.get("nationalities") or [])}
            ]
            if same:
                found = same
        return max(found, key=lambda p: p.get("earnings") or 0)

    # --- prestige from 1st places
    prestige: dict[int, float] = defaultdict(float)
    wins_counted = 0
    for row in load("placements.json"):
        if row.get("placement") != "1":
            continue
        points = points_by_event.get(row.get("tournament") or "")
        if points is None:
            continue
        for participant in row.get("participants") or []:
            page = resolve(participant.get("player") or "")
            if page is not None:
                prestige[page["pageid"]] += points
                wins_counted += 1

    # --- FNCS titles, carried over from the Wikipedia import
    fncs_wins: dict[int, int] = {}
    unmatched: list[str] = []
    for handle, count in legacy_fncs_wins().items():
        page = resolve(FNCS_ALIASES.get(handle, handle))
        if page is None:
            unmatched.append(handle)
            continue
        # Two Wikipedia handles can resolve to one page only if the import had a
        # duplicate; take the larger count rather than silently adding.
        fncs_wins[page["pageid"]] = max(fncs_wins.get(page["pageid"], 0), count)

    # --- fame score
    earnings_logs = [
        math.log10(p["earnings"]) for p in players if (p.get("earnings") or 0) > 0
    ]
    min_log, max_log = min(earnings_logs), max(earnings_logs)
    max_prestige = max(prestige.values()) if prestige else 1.0

    scored = []
    for player in players:
        earnings = float(player["earnings"])
        earnings_score = (math.log10(earnings) - min_log) / (max_log - min_log)
        points = prestige.get(player["pageid"], 0.0)
        # log-compressed: the gap between one regional final and none matters
        # more than the gap between fifteen finals and twenty.
        wins_score = math.log1p(points) / math.log1p(max_prestige)
        scored.append(
            (
                EARNINGS_WEIGHT * earnings_score + WINS_WEIGHT * wins_score,
                player,
                points,
            )
        )
    scored.sort(key=lambda row: (-row[0], row[1]["id"].lower()))

    easy_cut = len(scored) * EASY_PERCENTILE
    medium_cut = len(scored) * MEDIUM_PERCENTILE

    roster = []
    for rank, (score, player, points) in enumerate(scored, start=1):
        nationalities = player.get("nationalities") or []
        country = next(
            (COUNTRY_CODES[n] for n in nationalities if n in COUNTRY_CODES), None
        )
        team_page = player.get("teampagename")
        roster.append(
            {
                "id": player["pagename"],
                "name": player["id"],
                "realName": player.get("name") or None,
                "country": country,
                "countryName": nationalities[0] if nationalities else None,
                "region": player.get("region") or None,
                "birthDate": player.get("birthdate") or None,
                "earnings": round(float(player["earnings"])),
                "team": team_names.get(team_page, team_page) if team_page else None,
                "status": (player.get("status") or "").lower() or None,
                "fncsWins": fncs_wins.get(player["pageid"], 0),
                "fameScore": round(score, 4),
                "tier": "easy" if rank <= easy_cut else "medium" if rank <= medium_cut else "hard",
            }
        )

    payload = {
        "generatedAt": date.today().isoformat(),
        "source": {
            "name": "Liquipedia Fortnite",
            "url": "https://liquipedia.net/fortnite",
            "license": "CC-BY-SA 3.0",
            "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/",
            "note": (
                "Player handles, real names, nationalities, birth dates, career "
                "earnings and tournament results come from Liquipedia and have "
                "been reshaped for this site: rows were filtered to competitors, "
                "nationalities mapped to country codes, and a fame ranking "
                "derived from earnings and weighted titles. FNCS title counts "
                "come from Wikipedia, \"Competitive Fortnite records and "
                "statistics\"."
            ),
        },
        "fame": {
            "earningsWeight": EARNINGS_WEIGHT,
            "winsWeight": WINS_WEIGHT,
            "easyPercentile": EASY_PERCENTILE,
            "mediumPercentile": MEDIUM_PERCENTILE,
        },
        "players": roster,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")

    tiers = Counter(row["tier"] for row in roster)
    print(f"wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size / 1_000_000:.2f} MB)")
    print(f"  players            {len(roster)}")
    print(f"  tiers              easy {tiers['easy']}  medium {tiers['medium']}  hard {tiers['hard']}")
    print(f"  with birth date    {sum(1 for r in roster if r['birthDate'])}")
    print(f"  with FNCS titles   {sum(1 for r in roster if r['fncsWins'])}")
    print(f"  no country code    {sum(1 for r in roster if not r['country'])}")
    print(f"  1st places counted {wins_counted}")
    if unmatched:
        print(f"  FNCS winners with no Liquipedia page: {', '.join(sorted(unmatched))}")
    print("  ranking spot-check")
    for rank in (1, 25, 50, 100, 114, 250, 600, 1136, 2000, 4000, len(roster)):
        row = roster[rank - 1]
        print(
            f"    #{rank:<5} {row['name']:<20} {row['tier']:<7}"
            f" ${row['earnings']:>9,}  {row['fncsWins']} FNCS"
        )


if __name__ == "__main__":
    main()
