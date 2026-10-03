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


def links(raw_dir, folder):
    """links.json - each player's YouTube and Twitch links, as their Liquipedia page gives them.

    The site's server looks the counts up itself, once a day, and keeps only
    the latest (server/socials.ts): YouTube lets a count be kept 30 days and
    Twitch 24 hours, so the counts can never be a file in git. The links can -
    they are Liquipedia's, under the same licence as the rest of this folder.

    Every `youtube`, `youtube2`, ... and `twitch`, `twitch2`, ... link of a
    player a game can use. Skipped, with a note, when there is no raw dump.
    """
    import re
    from datetime import date

    raw_players = os.path.join(raw_dir, 'players.json')
    if not os.path.exists(raw_players):
        print('links.json: no raw dump - skipped')
        return
    usable = {p['pagename'] for p in json.load(open(os.path.join(folder, 'players.json'), encoding='utf-8'))
              if p.get('tier') != 'unused'}
    out = {}
    for row in json.load(open(raw_players, encoding='utf-8')):
        page = row.get('pagename')
        found = row.get('links') if isinstance(row.get('links'), dict) else {}
        if page not in usable:
            continue
        entry = {}
        for platform in ('youtube', 'twitch'):
            urls = [value for key, value in sorted(found.items()) if re.fullmatch(rf'{platform}\d*', key) and value]
            if urls:
                entry[platform] = urls
        if entry:
            out[page] = entry
    path = os.path.join(folder, 'links.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'generated': date.today().isoformat(), 'players': dict(sorted(out.items()))}, fh,
                  ensure_ascii=False, separators=(',', ':'))
    print(f'links.json: {len(out):,} players with a YouTube or Twitch link, {os.path.getsize(path) / 1e6:.2f} MB')


def run(folder):
    players = json.load(open(os.path.join(folder, 'players.json'), encoding='utf-8'))
    rows = [_slim(p) for p in players if p.get('tier') != 'unused']
    out = os.path.join(folder, 'roster.json')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'roster.json: {len(rows):,} players, {os.path.getsize(out) / 1e6:.2f} MB '
          f'(players.json {os.path.getsize(os.path.join(folder, "players.json")) / 1e6:.2f} MB)')
