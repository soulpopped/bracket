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
    old[k] = {'n': v['n'], 'c': v.get('c', ''), 't': v['t']}
json.dump(old, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(old), 'playlists', sum(len(v['t']) for v in old.values()), 'tracks')
