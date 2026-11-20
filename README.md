# The Best Songs in History

Tub Talk presents: The Best Songs in History (with no exceptions). A public, view-only history of the March Madness-style artist bracket Joey, Bob, Matt and Tom have run since 2023. Live at bracket.margaretandjoey.com (Cloudflare Pages, no build step, no login, no database).

## Files

- `index.html`, `app.js`, `styles.css`: the whole site. Routes live in the hash (`#/year/4?view=bracket`, `#/match/4-r1-12`, `#/artist/ween`, `#/people/Joey`, `#/records`, `#/search?q=dylan`).
- `sw.js`: the offline copy. Network first; with no connection it serves the last copy and the app shows a banner.
- `data/bracket.json`: every year, matchup, seed, drafter, vote, tiebreak, draft board and final series. Built by `tools/build.py`.
- `data/songs.json`: every playlist's tracks (title, credited artists, length), keyed by Spotify playlist id. Built by `tools/songs.py`.
- `source/`: the inputs to `build.py`.
  - `matches.json`: the four Schedule tabs as parsed by `tools/parse.py` from a Sheets API grid dump (values, links, cell colors, notes).
  - `brackets_raw.json`: formatted values of the Bracket, Bracket 2 and Bracket 3 tabs (seeds, regions, emoji).
  - `drafts.json`: the year 3 and 4 draft tabs, with struck-through swaps.
  - `overrides.json`: corrections from Joey (missing links, year 1 drafters, color typos, notes).
  - `extra.json`: year 4's bracket layout, name aliases, the year 1 finals series, draft fixes, and band names that count as a drafted artist.

## Updating after a matchup

The Google Sheet is retired (Nov 20, 2026); this repo is the record. Matchups start Mondays and Thursdays; votes usually come in the night before. Check-ins are Sunday and Wednesday at 7pm ET in the build chat.

1. Joey pastes who voted for whom (and the average ratings when it's 2-2), plus new playlist links. Emoji stay the same for an artist all year.
2. Add the votes to `source/results.json`, keyed by year and date: `{"4|2026-11-19": {"voters": {"Bob": "Ty Segall", "Joey": "Elliott Smith", ...}, "tiebreak": {"Elliott Smith": 8.2, "Ty Segall": 8.1}}}`. The build works out the count (winner first), the winner, and the asterisks (a list's maker voting for the other list). Optional: `"winner"` (an artist, `"tie"` or `"both"`), `"stars"` (for same-drafter matchups), `"note"`.
3. Add new playlist links to `links` in `source/overrides.json` (`year`, `date` as written in the old sheet, e.g. "Monday, November 23", `artist`, `url`). For matchups the build creates itself, use the ISO date (e.g. "2027-02-04").
4. Read the new playlists from Spotify embed pages through the Claude app's browser on Joey's Mac, save them to a JSON file and merge with `python3 tools/songs.py <file> data/songs.json`.
5. `python3 tools/build.py source data`. When a matchup is decided, the winner goes into the next open matchup: the bracket decides the opponent, and a bracket game takes the next open date in its round as soon as its first artist is known (the open dates are the empty rows that were in the sheet, through the final on Apr 12, 2027).
6. Test (`python3 tests/shots.py http://127.0.0.1:8765 /tmp/shots`), bump `?v=` in index.html and the cache name in sw.js if app.js or styles.css changed, commit, push, and check the live site.

A 2-2 final goes to a best-of-7 category series: add it under `finalSeries` in `source/extra.json` (see year 1).

Next year (draft in April or May 2027): the draft, seeds, regions and schedule will need a new way in, since there's no sheet. Build that when Joey is ready.
