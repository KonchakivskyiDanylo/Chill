"""
roster.json - the players file the site downloads.

players.json keeps every column for the pipeline; this is the part the games
read, so every game opens on a smaller download (2.9 MB -> about 1.3 MB, before
compression). Same column names as players.json, so `roster.ts` reads either:

- only players a game can use (tier != 'unused')
- no page id, row type, team template or real name - nothing shows them
- `id` only when the handle differs from the page name
- empty lists, nulls and zeros left out, `region_tier` only when it differs
  from `tier`, and one nationality (the one every game uses)
"""

import json
import os


def _slim(p):
    row = {'pagename': p['pagename']}
    if p.get('id') and p['id'] != p['pagename']:
        row['id'] = p['id']
    for key in ('alternateid_list', 'status', 'region', 'birthdate', 'teampagename'):
        if p.get(key):
            row[key] = p[key]
    if p.get('nationalities'):
        row['nationalities'] = p['nationalities'][:1]
    for key, value in p.items():
        if (key == 'earnings' or key.startswith('earnings_')) and value:
            # 30500.0 -> 30500; cents stay, or two players a few cents apart
            # would tie in Higher or Lower.
            row[key] = int(value) if float(value).is_integer() else value
    if p.get('fncs_wins'):
        row['fncs_wins'] = p['fncs_wins']
    row['tier'] = p['tier']
    if p.get('region_tier') and p['region_tier'] != p['tier']:
        row['region_tier'] = p['region_tier']
    return row


def run(folder):
    players = json.load(open(os.path.join(folder, 'players.json'), encoding='utf-8'))
    rows = [_slim(p) for p in players if p.get('tier') != 'unused']
    out = os.path.join(folder, 'roster.json')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'roster.json: {len(rows):,} players, {os.path.getsize(out) / 1e6:.2f} MB '
          f'(players.json {os.path.getsize(os.path.join(folder, "players.json")) / 1e6:.2f} MB)')
