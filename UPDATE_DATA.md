# Updating the data

Do this once a week, or the day after a big event. It takes about five minutes,
and you can run it any time — a longer gap just means a few more requests.

Everything below runs in a terminal (PowerShell) in the Chill folder.

---

## First time only

Save your Liquipedia API key and a way to contact you. `setx` keeps them for
good, so **open a new terminal afterwards** — the one you ran it in does not
see them yet.

```powershell
setx LIQUIPEDIA_API_KEY "paste-your-key-here"
```

```powershell
setx LIQUIPEDIA_USER_AGENT "OffSpawn/1.0 (your-email@example.com)"
```

Never put the key in a file in this repo, or in a commit.

---

## Every update

### 1. Get what changed on Liquipedia

```powershell
.venv\Scripts\python scripts\liquipedia_api.py
```

About 2–5 minutes, around 20 of the key's 60 requests an hour. It prints one
line per table, for example:

```
player: 5,737 -> 5,741 rows (0 removed)
placement: 443,400 -> 445,012 rows (12 removed)
done - 19 requests this run
```

### 2. Build the site's data

```powershell
.venv\Scripts\python scripts\build_data.py
```

About a minute and a half. It cleans the raw data, adds FNCS titles and tiers,
builds the rankings, pools and the rest, runs every game's checks on the
result, and only then replaces the files. It ends with a before/after table
and `Done`.

### 3. Look at the site (optional)

```powershell
npm run dev
```

Every game's "How to play" shows the new date as *last update*.

### 4. Commit and push

```powershell
git add -A
```

```powershell
git commit -m "Data update"
```

```powershell
git push
```

Only the files the site reads are committed (`roster.json`, `players.json`,
`career_path.json`, `teammates.json`, `orgs.json`, `facts.json`,
`rankings.json`, `pools.json`) plus the date in `src/data/liquipedia/roster.ts`.
The raw dump and the large in-between files stay on your machine — `.gitignore`
handles that.

---

## If something goes wrong

| You see | It means | Do |
| --- | --- | --- |
| `60 requests in the last hour - waiting …` | the key's hourly limit | nothing, leave it running |
| `rate limited (429) - waiting …` | Liquipedia asked it to wait | nothing, leave it running |
| you pressed Ctrl+C | — | run the same command again; it carries on where it stopped |
| `Set LIQUIPEDIA_API_KEY first` | the key is not set in this terminal | do "First time only", then open a new terminal |
| `… - not overwriting` | Liquipedia sent back far fewer rows than we hold | nothing was changed; try again later, and if it repeats send the output |
| `The game checks failed, so nothing was replaced` | the new data breaks a game check | the site's data is unchanged; send the output |

---

## Every few months (optional)

A normal update re-reads players and teams whole, and tournaments, transfers
and placements from 30 days before the last update. A correction Liquipedia
makes to something older is only picked up by reading it all again:

```powershell
.venv\Scripts\python scripts\liquipedia_api.py --full tournament transfer placement
```

Tournaments and transfers take about an hour of the key's allowance;
placements about eight hours, so start it in the evening. It waits for the
limit by itself. Then do steps 2–4.

---

## Once the site is hosted: webhooks (optional)

Liquipedia can tell the site whenever a Fortnite page changes, so those older
corrections arrive without the full re-read.

1. Pick a long random secret and give it to Heroku:
   ```powershell
   heroku config:set LIQUIPEDIA_WEBHOOK_SECRET=a-long-random-string
   ```
2. On your Liquipedia API account, set the webhook URL to
   `https://<your-app>.herokuapp.com/api/liquipedia/a-long-random-string`
3. Tell the update where the site is (once, then open a new terminal):
   ```powershell
   setx OFFSPAWN_URL "https://<your-app>.herokuapp.com"
   ```
   ```powershell
   setx OFFSPAWN_ADMIN_PASSWORD "your-dashboard-password"
   ```

Step 1 of every update then also re-reads the pages Liquipedia said changed.

---

## Changing how the data is built

The build is `scripts/build_data.py`, and each step is a file in
`scripts/pipeline/`: `clean.py` (raw -> clean tables), `enrich.py` (FNCS
titles, tiers, organisations), `derived.py` (rankings, pools, teammates,
career path, facts). [DATA.md](DATA.md) explains what each file holds and why.

After changing one, you do not need Liquipedia again:

```powershell
.venv\Scripts\python scripts\build_data.py --from derived
```

`--from players` redoes titles and tiers too; `--out somewhere` builds into
another folder so you can compare before touching the real files.

**A new season.** Tenaball's average-finish boards find each year's events on
their own: the rounds of FNCS grand finals by date, and Epic's LANs. List's
"played all 5 big events of 2026" still reads the events named in `SEASON_YEAR`
and `SEASON_EVENTS` in `derived.py`. Change those when the year's big events
change, then run `--from derived`.

---

The data is from [Liquipedia](https://liquipedia.net/fortnite) (CC-BY-SA 3.0)
and FNCS titles from Wikipedia (CC-BY-SA 4.0). The committed files are shared
under the same licence — see [CREDITS.md](CREDITS.md).
