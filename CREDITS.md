# Credits and data licences

OffSpawn's code and its data are licensed separately, because they came from
different places.

| What | Licence |
| --- | --- |
| Source code (`src/`, `scripts/`, config) | MIT — see [LICENSE](LICENSE) |
| Player data (`src/data/`, and anything the build scripts derive from it) | CC-BY-SA 3.0 — see below |

## Liquipedia

Some content in this project is from the Liquipedia Fortnite wiki,
<https://liquipedia.net/fortnite>, used under the
[Creative Commons Attribution-ShareAlike 3.0 licence](https://creativecommons.org/licenses/by-sa/3.0/).
Liquipedia is a Team Liquid project, written and maintained by its contributors.

What was taken:

- **Player pages** — handle, real name, nationality, region, birth date, career
  and per-year earnings, current team
- **Team pages** — organisation names, regions, founding and disband dates
- **Tournament pages** — name, dates, mode, region, prize pool, Liquipedia tier
- **Placement tables** — who finished where, and alongside whom
- **Transfer tables** — moves between organisations

### The original work has been modified

The export is cleaned and extended before the site reads it. In doing so:

- rows are filtered to people with a competitive record, and players Liquipedia
  records as having died are marked unusable
- a **difficulty tier** is derived from career earnings and tournament results
- **FNCS title counts** are attached per player, matched over from Wikipedia
- nationality names are mapped to ISO 3166-1 alpha-2 country codes for flags
- team page names are shown as organisation display names

Ages are computed in the browser from the published birth date, so they are
correct on the day you play rather than on the day the data was exported.

None of the derived numbers appear on Liquipedia. They are this project's
reading of Liquipedia's data, and any error in them is this project's.

### No images

No photographs, screenshots or other media files were taken from Liquipedia.
Many of those are licensed separately from the wiki text, on terms that may be
incompatible with CC-BY-SA, and would need their own clearance. The site renders
a generated initials avatar instead.

### ShareAlike

Because the data files are a derivative of CC-BY-SA text, they are shared under
the same licence: **CC-BY-SA 3.0**. If you reuse them, credit Liquipedia, say
what you changed, and pass the licence on.

## Wikipedia

FNCS title counts, and the tournament results behind Career Path, Who Are Ya,
Connections and Tenaball, come from the English Wikipedia article
[Competitive Fortnite records and statistics](https://en.wikipedia.org/wiki/Competitive_Fortnite_records_and_statistics),
used under [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Its FNCS winners table lists every grand-final winner in every region since
2019, which is why Higher or Lower can ask about FNCS wins at all — the
Liquipedia export does not publish that as a per-player number. Seven winners in
that table have no Liquipedia page and so do not appear in the roster; the build
script prints their names when it runs.

## Epic Games

Fortnite is a trademark of Epic Games, Inc. OffSpawn is an unofficial,
non-commercial fan project with no affiliation to Epic Games, Liquipedia, Team
Liquid, Wikipedia or any organisation or player named on the site. Player names,
team names and logos appear for identification only.

## Corrections

If you are a rights holder and something here needs correcting or removing, or
if a player's data is simply wrong, open an issue.
