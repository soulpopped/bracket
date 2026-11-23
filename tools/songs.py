#!/usr/bin/env python3
"""Turn the track file read from Spotify (bracket-tracks.json) into data/songs.json.
Keeps playlist name, cover and tracks; drops the Spotify account name of whoever made the list."""
import json, sys
src, out = sys.argv[1], sys.argv[2]
D = json.load(open(src))
old = {}
try:
    old = json.load(open(out))
except Exception:
    pass
for k, v in D.items():
    old[k] = {'n': v['n'], 'c': v.get('c', ''), 't': [[x[0], x[1], ', '.join(x[2]) if isinstance(x[2], list) else x[2], x[3]] for x in v['t']]}
# corrections: songs that ended up on a list after its matchup
try:
    fixes = json.load(open(sys.argv[3] if len(sys.argv) > 3 else 'source/overrides.json')).get('songFixes', {})
except Exception:
    fixes = {}
for pid, f in fixes.items():
    if pid in old:
        old[pid]['t'] = [t for t in old[pid]['t'] if t[1] not in f.get('remove', []) and t[0] not in f.get('remove', [])]
json.dump(old, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(old), 'playlists', sum(len(v['t']) for v in old.values()), 'tracks')
