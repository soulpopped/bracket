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

The Google Sheet is the source of truth. At each Monday/Thursday check-in:

1. Dump the current year's Schedule tab with the Sheets connector (`includeGridData`, fields `formattedValue`, `hyperlink`, `note`, `textFormatRuns`, `effectiveFormat.textFormat.foregroundColorStyle`) and re-run `tools/parse.py` to refresh `source/matches.json`.
2. Add Joey's corrections and who voted for whom to `source/overrides.json` (`votes`: `{ "<match id>": { "Joey": 0, "Bob": 1, ... } }`, side index 0 or 1).
3. Read any new playlists (Spotify embed pages, through the Claude app's browser on Joey's Mac) and merge them with `tools/songs.py`.
4. `python3 tools/build.py source data`, check its summary line (no missing seeds, drafters or winners), run `python3 tests/shots.py http://127.0.0.1:8765 /tmp/shots`, commit, push. Cloudflare deploys `main` in about a minute.

Colors in the sheet: purple Joey, blue Bob, orange Matt, red Tom, gray eliminated. Votes in the sheet list the winner's count first. `*` means a list's maker voted against it, `**` means both makers did.
