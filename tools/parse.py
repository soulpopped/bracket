import json, re, sys
d = json.load(open('raw.json')); d = d.get('content', d)
COL = {'orange': 'Matt', 'blue': 'Bob', 'red': 'Tom', 'purple': 'Joey', 'gray': 'gray(lost)'}

def color(c):
    fc = (c.get('effectiveFormat', {}).get('textFormat', {}).get('foregroundColorStyle', {}) or {}).get('rgbColor', {})
    r, g, b = fc.get('red', 0), fc.get('green', 0), fc.get('blue', 0)
    if r == g == b == 0: return None
    if abs(r - .9) < .05 and abs(g - .57) < .05: return 'orange'
    if abs(r - .29) < .05 and abs(b - .91) < .05: return 'blue'
    if abs(r - .65) < .05 and g < .2 and b < .1: return 'red'
    if abs(r - .6) < .05 and g < .1 and b > .9: return 'purple'
    if abs(r - g) < .02 and abs(g - b) < .02 and .5 < r < .9: return 'gray'
    if r == g == b == 1: return 'white'
    return f'rgb({r:.2f},{g:.2f},{b:.2f})'

def links(c):
    out = []
    if c.get('hyperlink'): out.append(c['hyperlink'])
    for run in c.get('textFormatRuns', []) or []:
        u = run.get('format', {}).get('link', {}).get('uri')
        if u and u not in out: out.append(u)
    return out

def val(c): return c.get('formattedValue', '')

sheets = {s['properties']['title']: s['data'][0].get('rowData', []) for s in d['sheets']}
out = {}
for t in ['Schedule', 'Schedule 2', 'Schedule 3', 'Schedule 4']:
    rows = sheets[t]; rnd = None; ms = []
    for i, r in enumerate(rows):
        v = r.get('values', [])
        cells = v + [{}] * (10 - len(v))
        a = val(cells[0])
        if a and not re.match(r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun)', a):
            if a not in ('Date',): rnd = a
            continue
        if not a: continue
        A, B = cells[1], cells[3]
        if not val(A) and not val(B):
            ms.append(dict(row=i+1, round=rnd, date=a, empty=True)); continue
        if t == 'Schedule':
            m = dict(row=i+1, round=rnd, date=a, a1=val(A), a2=val(B), c1=color(A), c2=color(B),
                     l1=links(A), l2=links(B), result=val(cells[5]), note=cells[5].get('note') or cells[4].get('note'))
        else:
            m = dict(row=i+1, round=rnd, date=a, a1=val(A), a2=val(B), c1=color(A), c2=color(B),
                     l1=links(A), l2=links(B), votes=val(cells[4]), note=cells[4].get('note'),
                     tb=val(cells[5]), matchup=val(cells[6]), win=val(cells[7]), lose=val(cells[8]))
        ms.append(m)
    out[t] = ms
json.dump(out, open('matches.json', 'w'), indent=1, ensure_ascii=False)
for t, ms in out.items():
    real = [m for m in ms if not m.get('empty')]
    nolink = [(m['date'], m['a1'] if not m['l1'] else '', m['a2'] if not m['l2'] else '') for m in real if not m['l1'] or not m['l2']]
    print(f'== {t}: {len(real)} matchups, rounds:', sorted(set(m["round"] for m in real), key=str))
    print('  missing links:', nolink)
    print('  colors:', sorted(set(str(m['c1']) for m in real) | set(str(m['c2']) for m in real)))
    # all-songs style links elsewhere in the sheet
for t, rows in sheets.items():
    for i, r in enumerate(rows):
        for j, c in enumerate(r.get('values', [])):
            if 'all songs' in val(c).lower() or 'playlist' in val(c).lower():
                print('ALLSONGS?', t, i+1, j, val(c), links(c))
