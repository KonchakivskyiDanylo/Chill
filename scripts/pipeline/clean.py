"""
Raw LiquipediaDB rows -> the clean files.

One function per table, each the transformations of its cleaning notebook
(players_cleaning, teams_cleaning, tournaments_cleaning, transfers_cleaning,
placements_cleaning) in the same order, minus the cells that only looked.

Two things the notebooks did not need to do:

- Rows are sorted by pagename first. The first dump came back in pagename
  order and every clean file inherited it; an incremental sync appends new rows
  at the end, so without the sort the files would reshuffle on every run.
- Every drop tolerates a missing column and every table ends on an explicit
  column list, so a column Liquipedia adds or stops sending changes nothing.
"""

import json
from pathlib import Path

import pandas as pd

# Column lists the clean files have always had, in their order.
PLAYER_COLUMNS = [
    "pageid", "pagename", "id", "alternateid_list", "name", "type", "status",
    "nationalities", "region", "birthdate", "teampagename", "teamtemplate", "earnings",
]
TEAM_COLUMNS = [
    "pageid", "pagename", "name", "region", "status", "createdate", "disbanddate", "earnings", "template",
]
TOURNAMENT_COLUMNS = [
    "pageid", "pagename", "name", "seriespage", "mode", "type", "organizers", "startdate", "enddate",
    "prizepool", "participantsnumber", "liquipediatier", "liquipediatiertype", "region",
]
TRANSFER_COLUMNS = ["player", "nationality", "fromteam", "toteam", "date", "role_from", "role_to", "year"]
PLACEMENT_COLUMNS = [
    "tournament", "date", "placement", "prizemoney", "individualprizemoney", "opponenttype", "participants",
]


def load_raw(path):
    """A raw file as a list of rows, in pagename order, one row per object."""
    path = Path(path)
    if path.suffix == ".jsonl":
        with path.open(encoding="utf-8") as lines:
            rows = [json.loads(line) for line in lines if line.strip()]
    else:
        rows = json.loads(path.read_text(encoding="utf-8"))
    seen, unique = set(), []
    for row in rows:
        key = (row.get("pageid"), row.get("objectname")) if row.get("objectname") else json.dumps(row, sort_keys=True)
        if key not in seen:
            seen.add(key)
            unique.append(row)
    unique.sort(key=lambda r: (str(r.get("pagename") or ""), str(r.get("objectname") or "")))
    return unique


def drop(df, columns):
    df.drop(columns=[c for c in columns if c in df.columns], inplace=True)


def write(df, path, **options):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    df.to_json(path, orient="records", indent=2, date_format="iso", **options)


# ----------------------------------------------------------------- players --

def clean_players(raw):
    df = pd.json_normalize(raw)
    drop(df, ["namespace", "objectname"])

    # alternateid: comma-separated -> a list, for search by old tags.
    df["alternateid_list"] = df["alternateid"].fillna("").apply(
        lambda x: [item.strip() for item in x.split(",") if item.strip()]
    )
    drop(df, ["alternateid", "localizedname"])

    df["type"] = df["type"].fillna("unknown").astype(str).str.strip().str.lower()

    # nationality, nationality2, nationality3 -> one ordered list.
    def extract_nationalities(row):
        nats = []
        for col in ["nationality", "nationality2", "nationality3"]:
            val = row.get(col)
            if pd.notna(val) and str(val).strip():
                clean_val = str(val).strip()
                if clean_val not in nats:
                    nats.append(clean_val)
        return nats

    df["nationalities"] = df.apply(extract_nationalities, axis=1)
    drop(df, ["nationality", "nationality2", "nationality3"])

    # Regions: CIS is Europe; fill the few that are missing.
    df["region"] = df["region"].replace({"CIS": "Europe"})
    missing = df["region"].isna() | (df["region"].astype(str).str.strip() == "")
    eu_target_nats = {"czechia", "czech republic", "north macedonia", "northern macedonia", "macedonia"}
    has_eu = df["nationalities"].apply(lambda nats: any(str(n).strip().lower() in eu_target_nats for n in nats))
    df.loc[missing & has_eu, "region"] = "Europe"

    player_overrides = {15630: "North America", 34329: "Europe"}  # roqz, Vibez
    for pid, reg in player_overrides.items():
        df.loc[df["pageid"] == pid, "region"] = reg

    country_to_region = {"hong kong": "Asia", "greenland": "North America", "fiji": "Oceania"}
    missing = df["region"].isna() | (df["region"].astype(str).str.strip() == "")

    def map_country_region(nats):
        for n in nats:
            cleaned = str(n).strip().lower()
            if cleaned in country_to_region:
                return country_to_region[cleaned]
        return None

    mapped = df.loc[missing, "nationalities"].apply(map_country_region)
    df.loc[missing & mapped.reindex(df.index).notna(), "region"] = mapped

    drop(df, ["deathdate"])
    df["birthdate"] = df["birthdate"].replace(["0000-01-01", "0000-00-00", ""], None)
    df["birthdate"] = pd.to_datetime(df["birthdate"], errors="coerce")

    drop(df, ["wiki", "earningsbyyear"])
    drop(df, [c for c in df.columns if "links" in c.lower()])

    year_cols = [c for c in df.columns if c.startswith("earningsbyyear.")]
    for col in year_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df.rename(columns={c: c.replace("earningsbyyear.", "earnings_") for c in year_cols}, inplace=True)

    # extradata (names, banned, second team, earnings copies, roles) and roles.
    drop(df, [c for c in df.columns if c.startswith("extradata") or "role" in c.lower()])

    df = df[PLAYER_COLUMNS + sorted(c for c in df.columns if c.startswith("earnings_"))].copy()
    df["birthdate"] = df["birthdate"].dt.strftime("%Y-%m-%d").where(df["birthdate"].notna(), None)
    for col in ["name", "region", "teampagename", "teamtemplate"]:
        df[col] = df[col].apply(lambda x: None if str(x).strip() == "" else x)
    return df


# ------------------------------------------------------------------- teams --

def clean_teams(raw):
    df = pd.json_normalize(raw)
    yearly = sorted(c for c in df.columns if c.startswith("earningsbyyear."))
    clean_df = df[[c for c in TEAM_COLUMNS + yearly if c in df.columns]].copy()
    rename_map = {c: c.replace("earningsbyyear.", "earnings_") for c in yearly}
    clean_df.rename(columns=rename_map, inplace=True)

    clean_df["pageid"] = pd.to_numeric(clean_df["pageid"], errors="coerce")
    for col in ["earnings"] + list(rename_map.values()):
        clean_df[col] = pd.to_numeric(clean_df[col], errors="coerce").fillna(0)
    for col in ["name", "region", "status", "template"]:
        clean_df[col] = clean_df[col].fillna("")

    clean_df.drop_duplicates(subset=["pageid"], inplace=True)
    clean_df.sort_values(by="earnings", ascending=False, inplace=True)
    clean_df["createdate"] = pd.to_datetime(clean_df["createdate"], errors="coerce")
    clean_df["disbanddate"] = pd.to_datetime(clean_df["disbanddate"], errors="coerce")
    return clean_df


# ------------------------------------------------------------- tournaments --

MODE_MAPPING = {
    "solos": "Solo", "solo": "Solo", "duos": "Duo", "duo": "Duo",
    "trios": "Trio", "trio": "Trio", "squads": "Squad", "squad": "Squad",
}


def clean_mode(val):
    val_clean = str(val).strip().lower()
    return MODE_MAPPING.get(val_clean, val if val_clean != "" else None)


def clean_type(val):
    """Explicit LAN/Hybrid designations; everything else is Online."""
    v = str(val).strip().lower()
    if "offline" in v and "online" in v:
        return "Hybrid"
    if "offline" in v or "lan" in v:
        return "Offline"
    return "Online"


def parse_organizers(val):
    if isinstance(val, dict):
        return [v.strip() for v in val.values() if isinstance(v, str) and v.strip()]
    if isinstance(val, list):
        return [v.strip() for v in val if isinstance(v, str) and v.strip()]
    if val is None or (isinstance(val, float) and pd.isna(val)) or not val:
        return []
    val_str = str(val).strip()
    if val_str in ("", "[]", "{}", "nan", "None"):
        return []
    try:
        parsed = json.loads(val_str)
        if isinstance(parsed, dict):
            return [v.strip() for v in parsed.values() if isinstance(v, str) and v.strip()]
        if isinstance(parsed, list):
            return [v.strip() for v in parsed if isinstance(v, str) and v.strip()]
    except (json.JSONDecodeError, TypeError):
        pass
    return [val_str]


def clean_tournaments(raw):
    df = pd.json_normalize(raw)
    df["seriespage"] = df["seriespage"].apply(lambda x: None if str(x).strip() == "" else str(x).strip())

    # `format` wins over `mode` where it is filled in.
    raw_mode = df["format"].where(df["format"].str.strip() != "", df["mode"])
    df["mode"] = raw_mode.apply(clean_mode)
    df["type"] = df["type"].apply(clean_type)
    df["organizers"] = df["organizers"].apply(parse_organizers)

    df["startdate"] = pd.to_datetime(df["startdate"], errors="coerce").dt.strftime("%Y-%m-%d").where(df["startdate"].notna(), None)
    df["enddate"] = pd.to_datetime(df["enddate"], errors="coerce").dt.strftime("%Y-%m-%d").where(df["enddate"].notna(), None)
    df["enddate"] = df["enddate"].fillna(df["startdate"])  # single-day events often omit it

    df["prizepool"] = pd.to_numeric(df["prizepool"], errors="coerce").fillna(0.0)
    df["participantsnumber"] = pd.to_numeric(df["participantsnumber"], errors="coerce")
    # Whole numbers or null. `Int64` says so outright: a plain apply returning
    # ints and None comes back as floats (5.0) under pandas 3 when a row is null.
    df["participantsnumber"] = df["participantsnumber"].where(df["participantsnumber"] > 0).astype("Int64")

    df["liquipediatier"] = pd.to_numeric(df["liquipediatier"], errors="coerce")
    df["liquipediatier"] = df["liquipediatier"].where(df["liquipediatier"] > 0).astype("Int64")
    df["liquipediatiertype"] = df["liquipediatiertype"].apply(
        lambda x: str(x).strip() if pd.notna(x) and str(x).strip() != "" else None
    )

    df = df[df["status"].str.lower().str.strip() != "cancelled"].copy()
    df.rename(columns={"locations.region1": "region"}, inplace=True)
    if "region" not in df.columns:
        df["region"] = None
    return df[TOURNAMENT_COLUMNS]


# --------------------------------------------------------------- transfers --

def clean_transfers(raw):
    df = pd.json_normalize(raw)

    for col in ["fromteam", "toteam", "role1", "role2"]:
        df[col] = df[col].astype(str).str.strip().replace({"": None, "nan": None, "None": None})
    df["role_from"] = df["role1"].fillna("Player")
    df["role_to"] = df["role2"].fillna("Player")

    is_retiring = df["role_to"].str.lower() == "retired"
    df.loc[is_retiring & df["toteam"].isna(), "toteam"] = "Retired"
    df["fromteam"] = df["fromteam"].fillna("Free Agent")
    df["toteam"] = df["toteam"].fillna("Free Agent")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["year"] = df["date"].dt.year.astype("Int16")

    df["player"] = df["player"].astype(str).str.strip()
    df["nationality"] = df["nationality"].astype(str).str.strip().replace({"None": None, "nan": None})
    df["fromteam"] = df["fromteam"].astype(str).str.strip()
    df["toteam"] = df["toteam"].astype(str).str.strip()
    df["role_from"] = df["role_from"].astype("category")
    df["role_to"] = df["role_to"].astype("category")

    df = df[TRANSFER_COLUMNS].copy()
    df.sort_values(by=["date", "player"], ascending=[True, True], inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# -------------------------------------------------------------- placements --

def participants_of(row):
    """Up to four named players, each with their team or Free Agent."""
    players = row.get("opponentplayers")
    if not isinstance(players, dict):
        return []
    roster = []
    for i in range(1, 5):
        player = players.get(f"p{i}")
        if player is not None and str(player).strip():
            team = players.get(f"p{i}team")
            roster.append({
                "player": str(player).strip(),
                "team": str(team).strip() if team is not None and str(team).strip() else "Free Agent",
            })
    return roster


def clean_placements(raw):
    """
    The notebook flattened all 110 columns and dropped 103. This keeps the
    seven it kept, which is the same result in a fraction of the memory.
    """
    df = pd.DataFrame({
        "tournament": [r.get("tournament") for r in raw],
        "date": [r.get("date") for r in raw],
        "placement": [r.get("placement") for r in raw],
        "prizemoney": [r.get("prizemoney") for r in raw],
        "individualprizemoney": [r.get("individualprizemoney") for r in raw],
        "opponenttype": [r.get("opponenttype") for r in raw],
        "participants": [participants_of(r) for r in raw],
    })
    df["opponenttype"] = df["opponenttype"].astype(str).str.strip().str.capitalize().astype("category")
    df["prizemoney"] = pd.to_numeric(df["prizemoney"], errors="coerce").fillna(0.0)
    df["individualprizemoney"] = pd.to_numeric(df["individualprizemoney"], errors="coerce").fillna(0.0)

    clean_dates = (
        df["date"].astype(str).str.strip()
        .replace({"0000-00-00": None, "": None, "nan": None, "None": None, "<NA>": None})
    )
    clean_dates = clean_dates.mask(clean_dates.str.startswith("0000", na=False))
    # Day precision, as the notebook's strftime('%Y-%m-%d') left it.
    df["date"] = pd.to_datetime(pd.to_datetime(clean_dates, errors="coerce").dt.strftime("%Y-%m-%d"), errors="coerce")
    return df[PLACEMENT_COLUMNS]


# --------------------------------------------------------------------- run --

TABLES = [
    ("players.json", "players.json", clean_players, {"force_ascii": False}),
    ("teams.json", "teams.json", clean_teams, {}),
    ("tournaments.json", "tournaments.json", clean_tournaments, {}),
    ("transfers.json", "transfers.json", clean_transfers, {}),
    ("placements.jsonl", "placements.json", clean_placements, {"force_ascii": False}),
]


def run(raw_dir, out_dir):
    for source, target, clean, options in TABLES:
        raw = load_raw(Path(raw_dir) / source)
        df = clean(raw)
        write(df, Path(out_dir) / target, **options)
        print(f"  {target:<18} {len(raw):>9,} raw rows -> {len(df):>9,}")
