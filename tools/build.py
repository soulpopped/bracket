#!/usr/bin/env python3
"""Turn the sheet dumps + overrides into the site's data file (data/bracket.json).

Inputs (in SRC dir):
  matches.json        parsed Schedule tabs (from parse.py): links, colors, notes per row
  brackets_raw.json   formatted values of Bracket, Bracket 2, Bracket 3
  overrides.json      corrections from chat
  extra.json          year 4 bracket layout, drafts, finals feats (hand-entered from the sheet)
"""
import json, re, sys, unicodedata, datetime, os
SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'out'
os.makedirs(OUT, exist_ok=True)
J = lambda p: json.load(open(os.path.join(SRC, p)))
M = J('matches.json'); B = J('brackets_raw.json'); O = J('overrides.json'); X = J('extra.json')

PEOPLE = ['Joey', 'Bob', 'Matt', 'Tom']
COLOR_OWNER = {'orange': 'Matt', 'blue': 'Bob', 'red': 'Tom', 'purple': 'Joey'}
START = {1: 2023, 2: 2024, 3: 2025, 4: 2026}
TABS = {1: 'Schedule', 2: 'Schedule 2', 3: 'Schedule 3', 4: 'Schedule 4'}
ROUND_CODE = {'Play-In': 'PI', 'Play-In Round': 'PI', 'Round 1': 'R1', 'Round 2': 'R2', 'Round 3 | Sweet 16': 'S16',
              'Round 4 | Elite 8': 'E8', 'Final Four': 'F4', 'Championship': 'F'}
ROUND_ORDER = ['PI', 'R1', 'R2', 'S16', 'E8', 'F4', 'F']
ROUND_NAME = {'PI': 'Play-in', 'R1': 'Round 1', 'R2': 'Round 2', 'S16': 'Sweet 16', 'E8': 'Elite 8', 'F4': 'Final Four', 'F': 'Final'}
SLOT_SEEDS = [(1, 16), (8, 9), (5, 12), (4, 13), (6, 11), (3, 14), (7, 10), (2, 15)]

def norm(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if c.isalnum())
    return s.replace('the', '') if len(s) > 6 else s

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

EMOJI_TAIL = re.compile(r'[\s]*([^\w\s\(\)\[\]\.,\'’&!/:-][^\w\(\)\[\]]*)$', re.UNICODE)
def split_emoji(raw):
    raw = raw.strip()
    raw = re.sub(r'^\(\d+\)\s*', '', raw)
    # emoji = trailing run of non-word chars (keep letters/digits/punct in name)
    i = len(raw)
    while i > 0 and not (raw[i-1].isalnum() or raw[i-1] in ")]'.!&-’"):
        i -= 1
    name, emo = raw[:i].strip(), raw[i:].strip()
    return name, emo

def parse_date(s, year):
    s = s.strip()
    m = re.match(r'(?:\w+day),?\s+(\w+)\.?\s+(\d+)', s)
    if not m:
        return None
    mon = datetime.datetime.strptime(m.group(1)[:3], '%b').month
    y = START[year] if mon >= 7 else START[year] + 1
    return datetime.date(y, mon, int(m.group(2))).isoformat()

# ---------- artists per year from bracket tabs ----------
def bracket_slots(year):
    """-> list of regions [{name, sub, slots:[{seed, name, emoji}] in SLOT_SEEDS order}] and play-in entries"""
    if year == 4:
        return X['y4']['regions'], X['y4']['playin']
    rows = B['Bracket' if year == 1 else f'Bracket {year}']
    regs = [[], [], [], []]   # R1 left top, R3 right top, R2 left bottom, R4 right bottom
    half = -1
    for r in rows:
        r = r + [''] * (16 - len(r))
        if any(c.startswith('Region') for c in r):
            half += 1
            continue
        if half < 0:
            continue
        L = (r[1], r[2]); R = (r[13], r[12])
        for k, (seed, nm) in enumerate((L, R)):
            if seed.strip().isdigit() and nm.strip() and not nm.startswith('^'):
                regs[half * 2 + k].append((int(seed), nm))
    names = X['regionNames'][str(year)]
    out = []
    for idx, (ri, label) in enumerate(((0, 'Region 1'), (2, 'Region 2'), (1, 'Region 3'), (3, 'Region 4'))):
        lst = regs[ri]
        slots = []
        for s, nm in lst:
            n, e = split_emoji(nm)
            slots.append({'seed': s, 'name': n, 'emoji': e})
        out.append({'name': label, 'sub': names[idx], 'slots': slots})
    return out, None

# ---------- schedule rows -> matches ----------
def owner_map(year):
    rows = [m for m in M[TABS[year]] if not m.get('empty')]
    own = {}
    if year == 1:
        for k, v in O['year1Owners'].items():
            own[norm(k)] = v
        own[norm('Maiden/STP')] = None
        return own
    for m in rows:
        for a, c in ((m['a1'], m['c1']), (m['a2'], m['c2'])):
            if c in COLOR_OWNER and a:
                own.setdefault(norm(clean_sched(a)), COLOR_OWNER[c])
    for k, v in O.get('colorTypos', {}).items():
        own[norm(k)] = v
    for _ in range(3):
        for m in rows:
            w, l = m.get('win'), m.get('lose')
            if not w or w == 'Tie':
                continue
            a1, a2 = norm(clean_sched(m['a1'])), norm(clean_sched(m['a2']))
            for a, o in ((a1, a2), (a2, a1)):
                if a and a not in own:
                    if w == l: own[a] = w
                    elif own.get(o) == w: own[a] = l
                    elif own.get(o) == l: own[a] = w
    return own

def clean_sched(a):
    return re.sub(r'\s*\(\d+-\d+\)\s*$', '', a or '').strip()

def votes_parse(v):
    v = (v or '').strip()
    m = re.match(r'(\d)-(\d)(?:-(\d))?\s*(\*{0,2})', v)
    if not m:
        return None, 0
    return [int(m.group(1)), int(m.group(2))] + ([int(m.group(3))] if m.group(3) else []), len(m.group(4))

def build_year(year):
    tab = TABS[year]
    rows = M[tab]
    own = owner_map(year)
    regions, playin = bracket_slots(year)
    # artist lookup for seeds / emoji / region
    info = {}
    aliases = {norm(k): v for k, v in X['aliases'].get(str(year), {}).items()}
    for ri, reg in enumerate(regions):
        for i, s in enumerate(reg['slots']):
            parts = [p.strip() for p in s['name'].split(' / ')] if ' / ' in s['name'] else [s['name']]
            emos = s['emoji'].split() if len(parts) > 1 else [s['emoji']]
            for j, nm in enumerate(parts):
                nm, e = split_emoji(nm) if len(parts) > 1 else (nm, emos[0])
                ent = {'seed': s['seed'], 'region': ri, 'emoji': e, 'bname': nm}
                info[norm(nm)] = ent
                if norm(nm) in aliases:
                    info[norm(aliases[norm(nm)])] = ent
    def look(name):
        n = norm(name)
        n = norm(aliases.get(n, name)) if n in aliases else n
        if n in info: return info[n]
        for k, v in info.items():
            if k and n and (k.startswith(n[:7]) or n.startswith(k[:7])):
                return v
        return None
    links_extra = {}
    for l in O['links']:
        links_extra[(l['year'], norm(l['artist']), l['date'])] = l['url'] if isinstance(l['url'], list) else [l['url']]
    out = []
    counters = {}
    for m in rows:
        if m.get('empty'):
            continue
        rc = ROUND_CODE.get(m['round'])
        date = parse_date(m['date'], year)
        sides = []
        for k in ('1', '2'):
            raw = clean_sched(m['a' + k])
            names = [raw]
            if '/' in raw and raw not in X['slashNames']:
                names = [p.strip() for p in raw.split('/')]
            names = [aliases.get(norm(n), n) for n in names]
            links = m.get('l' + k, [])
            lk = (year, norm(raw), m['date'])
            if lk in links_extra:
                links = links_extra[lk]
            pls = []; url = None
            for u in links:
                mm = re.search(r'playlist/(\w{22})', u)
                if mm and mm.group(1) not in pls: pls.append(mm.group(1))
                elif 'spotify.link' in u or 'music.youtube' in u: url = url or u
            arts = []
            for j, n in enumerate(names):
                i = look(n)
                a = {'name': n, 'owner': own.get(norm(n)) or (own.get(norm(raw)) if len(names) == 1 else None),
                     'seed': i['seed'] if i else None, 'emoji': i['emoji'] if i else '', 'region': i['region'] if i else None}
                if len(names) > 1 and len(pls) == len(names):
                    a['playlist'] = pls[j]
                arts.append(a)
            side = {'artists': arts, 'playlist': pls[0] if pls else None, 'url': url, 'raw': m['a' + k]}
            if len(pls) > 1:
                side['playlists'] = pls
            sides.append(side)
        rec = {'year': year, 'round': rc, 'date': date, 'sides': sides, 'row': m['row']}
        if year == 1:
            res = m.get('result', '')
            rec['resultText'] = res
            v = re.search(r'\((\d-\d(?:-\d)?)', res)
            vv, ast = votes_parse(v.group(1) + ('*' * len(re.search(r'\)(\**)', res).group(1)) if re.search(r'\)(\**)', res) else '')) if v else (None, 0)
            rec['votes'] = vv; rec['stars'] = ast
            tb = re.search(r'(\d+\.\d+)\s*(?:to|vs\.?)\s*(\d+\.\d+)', res)
            rec['tiebreak'] = [float(tb.group(1)), float(tb.group(2))] if tb else None
            note = re.search(r'\[([^\]]+)\]', res)
            rec['note'] = note.group(1) if note else None
            if 'TIE' in res.upper() and 'BOTH' in res.upper():
                rec['winner'] = 'both'
            else:
                head = res.split('(')[0].strip().lower()
                w = None
                for i, s in enumerate(sides):
                    nm = s['artists'][0]['name'].lower()
                    words = [x for x in re.findall(r'\w+', nm) if len(x) > 2 and x not in ('the', 'bob')]
                    if head and (nm.startswith(head) or head.startswith(nm) or any(x in head for x in words) or ('70s' in head and '70s' in nm)):
                        w = i; break
                rec['winner'] = w
        else:
            vv, ast = votes_parse(m.get('votes'))
            rec['votes'] = vv; rec['stars'] = ast
            tbtxt = (m.get('note') or '') + ' ' + (m.get('tb') or '')
            tb = re.search(r'(\d+\.\d+)\s*to\s*(\d+\.\d+)', tbtxt)
            rec['tiebreak'] = [float(tb.group(1)), float(tb.group(2))] if tb else None
            rec['emojiPair'] = m.get('tb') if m.get('tb') and ' vs ' in (m.get('tb') or '') else None
            rec['note'] = None
            if m.get('tb') and m['tb'].startswith('GAME'):
                rec['game'] = int(re.search(r'GAME (\d)', m['tb']).group(1)); g = re.match(r'GAME (\d): (.*)', m['tb']); rec['note'] = 'Game ' + g.group(1) + ': ' + g.group(2).lower()
            if m.get('tb') and '(' in m['tb'] and ',' in m['tb']:
                rec['note'] = m['tb']
            w, l = m.get('win'), m.get('lose')
            win = None
            if w == 'Tie':
                win = 'tie'
            elif vv:
                c1, c2 = m['c1'], m['c2']
                if c1 != 'gray' and c2 == 'gray': win = 0
                elif c2 != 'gray' and c1 == 'gray': win = 1
                else:
                    o1, o2 = sides[0]['artists'][0]['owner'], sides[1]['artists'][0]['owner']
                    if o1 == w and o2 != w: win = 0
                    elif o2 == w and o1 != w: win = 1
                    else:
                        win = X['winnerFix'].get(f"{year}|{m['date']}")
            elif w and w != 'Tie' and not vv:
                o1, o2 = sides[0]['artists'][0]['owner'], sides[1]['artists'][0]['owner']
                if o1 == w and o2 != w: win = 0
                elif o2 == w and o1 != w: win = 1
                else: win = X['winnerFix'].get(f"{year}|{m['date']}")
            rec['winner'] = win
        fix = X['matchFix'].get(f"{year}|{m['date']}")
        if fix:
            rec.update(fix)
        if rec['round'] is None:
            raise SystemExit(f"unknown round {m['round']}")
        out.append(rec)
    return out, regions, own, playin


D = J('drafts.json')
SEASON = {1: '2023–24', 2: '2024–25', 3: '2025–26', 4: '2026–27'}

# ---------- live year: results from chat, and the next open matchup ----------
RES = J('results.json') if os.path.exists(os.path.join(SRC, 'results.json')) else {}
ROUND_FROM_SHEET = {'Round 2': 'R2', 'Round 3 | Sweet 16': 'S16', 'Round 4 | Elite 8': 'E8', 'Final Four': 'F4', 'Championship': 'F'}
POS = {}
for i, sd in enumerate([1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]):
    POS[sd] = i // 2

def game_key(r):
    arts = [a for s in r['sides'] for a in s['artists'] if a.get('name') and a.get('seed') and a.get('region') is not None]
    if not arts:
        return None
    a = arts[0]
    g = POS[a['seed']]
    rd = r['round']
    if rd == 'R1': return ('R1', a['region'], g)
    if rd == 'R2': return ('R2', a['region'], g // 2)
    if rd == 'S16': return ('S16', a['region'], g // 4)
    if rd == 'E8': return ('E8', a['region'], 0)
    if rd == 'F4': return ('F4', a['region'] // 2, 0)
    if rd == 'F': return ('F', 0, 0)
    return None

def children(key):
    rd, r, g = key
    if rd == 'R2': return [('R1', r, 2 * g), ('R1', r, 2 * g + 1)]
    if rd == 'S16': return [('R2', r, 2 * g), ('R2', r, 2 * g + 1)]
    if rd == 'E8': return [('S16', r, 0), ('S16', r, 1)]
    if rd == 'F4': return [('E8', 2 * r, 0), ('E8', 2 * r + 1, 0)]
    if rd == 'F': return [('F4', 0, 0), ('F4', 1, 0)]

def winners(m):
    if m is None or m.get('winner') is None:
        return None
    if isinstance(m['winner'], int):
        return [dict(a) for a in m['sides'][m['winner']]['artists']]
    return [dict(a) for s in m['sides'] for a in s['artists']]  # tie: both advance

def apply_result(y, r, own_links):
    key = f"{y}|{r['date']}"
    R = RES.get(key)
    # playlist links for this date (new rounds come from chat)
    for s in r['sides']:
        pls = []
        for a in s['artists']:
            for u in own_links.get((y, norm(a['name']), r['date']), []):
                mm = re.search(r'playlist/(\w{22})', u)
                if mm and mm.group(1) not in pls:
                    pls.append(mm.group(1))
                    if len(s['artists']) > 1: a['playlist'] = mm.group(1)
        if pls and not s.get('playlist'):
            s['playlist'] = pls[0]
            if len(pls) > 1: s['playlists'] = pls
    if not R:
        return
    names = [[norm(a['name']) for a in s['artists']] for s in r['sides']]
    def side_of(artist):
        n = norm(artist)
        for i, ns in enumerate(names):
            if n in ns or any(x.startswith(n[:6]) or n.startswith(x[:6]) for x in ns): return i
        raise SystemExit(f'results {key}: "{artist}" is not in this matchup')
    voters = {p: side_of(a) for p, a in R.get('voters', {}).items()}
    cnt = [0, 0]
    for i in voters.values(): cnt[i] += 1
    win = None
    if cnt[0] != cnt[1]:
        win = 0 if cnt[0] > cnt[1] else 1
    elif R.get('tiebreak'):
        tb = R['tiebreak']
        tbs = [tb[a] for a in sorted(tb, key=side_of)] if isinstance(tb, dict) else tb
        r['tiebreak'] = sorted(tbs, reverse=True)
        win = 0 if tbs[0] > tbs[1] else 1 if tbs[1] > tbs[0] else 'tie'
    if 'winner' in R:
        win = R['winner'] if R['winner'] in ('tie', 'both') else side_of(R['winner'])
    r['winner'] = win
    w = win if isinstance(win, int) else 0
    r['votes'] = [cnt[w], cnt[1 - w]]
    r['voters'] = voters
    owners = [r['sides'][i]['artists'][0].get('owner') for i in (0, 1)]
    stars = 0
    if owners[0] != owners[1]:
        for i, o in enumerate(owners):
            if o in voters and voters[o] != i: stars += 1
    r['stars'] = R.get('stars', stars)
    if R.get('note'): r['note'] = R['note']

def live_update(y, matches, regions):
    links = {}
    for l in O['links']:
        links.setdefault((l['year'], norm(l['artist']), l['date']), []).extend(l['url'] if isinstance(l['url'], list) else [l['url']])
    for r in matches:
        apply_result(y, r, links)
    open_dates = {}
    for m in M[TABS[y]]:
        if m.get('empty') and m['round'] in ROUND_FROM_SHEET:
            open_dates.setdefault(ROUND_FROM_SHEET[m['round']], []).append(parse_date(m['date'], y))
    for rd in ('R2', 'S16', 'E8', 'F4', 'F'):
        by = {}
        for r in matches:
            k = game_key(r)
            if k: by.setdefault(k, r)
        n = {'R2': 4, 'S16': 2, 'E8': 1, 'F4': 1, 'F': 1}[rd]
        regs = {'R2': 4, 'S16': 4, 'E8': 4, 'F4': 2, 'F': 1}[rd]
        todo = []
        for ri in range(regs):
            for g in range(n):
                key = (rd, ri, g)
                kids = [by.get(c) for c in children(key)]
                ws = [winners(k) for k in kids]
                m = by.get(key)
                if m is None:
                    # an existing row whose artists are all TBD can't be keyed; skip those
                    if not any(ws): continue
                    first = min(k['date'] for k, w in zip(kids, ws) if w)
                    todo.append((first, key, ws))
                else:
                    present = {norm(a['name']) for sd in m['sides'] for a in sd['artists'] if a.get('name')}
                    for i, sd in enumerate(m['sides']):
                        if any(a.get('name') for a in sd['artists']):
                            continue
                        for w in ws:
                            if w and not any(norm(a['name']) in present for a in w):
                                m['sides'][i] = {'artists': w, 'playlist': None, 'url': None}
                                present |= {norm(a['name']) for a in w}
                                break
        used = {r['date'] for r in matches if r['round'] == rd}
        free = [d for d in open_dates.get(rd, []) if d not in used]
        for first, key, ws in sorted(todo):
            if not free:
                raise SystemExit(f'no open date left in {rd} for {key}')
            dt = free.pop(0)
            sides = [{'artists': w or [{'name': '', 'owner': None, 'seed': None, 'emoji': '', 'region': None}], 'playlist': None, 'url': None} for w in ws]
            r = {'year': y, 'round': rd, 'date': dt, 'sides': sides, 'votes': None, 'stars': 0, 'tiebreak': None, 'note': None, 'winner': None, 'generated': True}
            matches.append(r)
        for r in matches:
            if r['round'] == rd and r.get('generated'):
                apply_result(y, r, links)
        matches.sort(key=lambda r: (r['date'] or '9999', r.get('game', 0)))
LIVE_YEAR = 4

years = []
for y in (1, 2, 3, 4):
    matches, regions, own, playin = build_year(y)
    matches.sort(key=lambda r: (r['date'] or '9999', r.get('game', 0)))
    # play-in: both sides share the slot's seed and region
    for r in matches:
        if r['round'] == 'PI':
            known = [a for s in r['sides'] for a in s['artists'] if a['seed']]
            if known:
                for s in r['sides']:
                    for a in s['artists']:
                        if a['seed'] is None:
                            a['seed'] = known[0]['seed']; a['region'] = known[0]['region']
    if y == LIVE_YEAR:
        live_update(y, matches, regions)
    cnt = {}
    for r in matches:
        cnt[r['round']] = cnt.get(r['round'], 0) + 1
        r['id'] = f"{y}-{r['round'].lower()}-{cnt[r['round']]}"
        for s in r['sides']:
            s.pop('raw', None)
        r.pop('row', None)
        if r['id'] in O.get('votes', {}):
            r['voters'] = O['votes'][r['id']]
    # champion
    finals = [r for r in matches if r['round'] == 'F']
    champ = None
    fs = X['finalSeries'].get(str(y))
    if fs:
        champ = fs['winner']
    elif finals:
        g = [r for r in finals if r.get('game')]
        if g:
            wins = {}
            for r in g:
                if isinstance(r['winner'], int):
                    n = r['sides'][r['winner']]['artists'][0]['name']; wins[n] = wins.get(n, 0) + 1
            champ = max(wins, key=wins.get) if wins and max(wins.values()) >= 4 else None
            if champ:
                lose = [n for n in wins if n != champ]
                fs = {'a': champ, 'b': lose[0] if lose else '', 'winner': champ, 'score': f"{wins[champ]}-{sum(v for k, v in wins.items() if k != champ)}", 'fromMatches': True}
        elif isinstance(finals[-1]['winner'], int):
            champ = finals[-1]['sides'][finals[-1]['winner']]['artists'][0]['name']
    # who drafted every artist in the bracket
    played = {}
    for r in matches:
        for s in r['sides']:
            for a in s['artists']:
                if a['name']:
                    played.setdefault(a['name'], a)
    draft = D.get(str(y))
    unused = []
    if draft:
        pn = {norm(n): n for n in played}
        for row in draft['rows']:
            for i, p in enumerate(row):
                fix = X['draftFix'].get(f"{y}|{p['name']}")
                if fix:
                    p.update(fix)
                nm = X['draftAlias'].get(p['name'], p['name'])
                hit = None
                for k, n in pn.items():
                    base = norm(re.sub(r'\[.*?\]|\(\+.*?\)', '', nm))
                    if base and (k == base or k.startswith(base[:8]) or base.startswith(k[:8])):
                        hit = n; break
                p['artist'] = hit
                if not hit:
                    p['unused'] = True
                    unused.append({'name': nm, 'owner': draft['people'][i]})
    yr = {'n': y, 'season': SEASON[y], 'regions': [{'name': g['name'], 'sub': g['sub']} for g in regions],
          'champion': champ, 'finalSeries': fs, 'note': X.get('notes', {}).get(str(y)),
          'draft': draft, 'unused': unused, 'matches': matches}
    all_songs = {1: '24vfathFaSRamrcR68ygHW', 2: '5xpQ9VNglH05Om9kf7TneZ', 3: '4PDNo83q3A8zqSZi04V5QL', 4: '0HXYVJSc9uQD5jtZA94HYA'}
    yr['allSongs'] = all_songs[y]
    years.append(yr)

data = {'people': [{'name': p, 'color': c} for p, c in (('Joey', '#9900FF'), ('Bob', '#4A86E8'), ('Matt', '#E69138'), ('Tom', '#A61C00'))],
        'title': 'The Best Songs in History', 'kicker': 'Tub Talk presents', 'sub': '(with no exceptions)',
        'updated': datetime.date.today().isoformat(), 'years': years, 'umbrella': X.get('umbrella', {})}
json.dump(data, open(os.path.join(OUT, 'bracket.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('bracket.json', os.path.getsize(os.path.join(OUT, 'bracket.json')))
for yr in years:
    y = yr['n']
    miss_seed = sorted({a['name'] for r in yr['matches'] for s in r['sides'] for a in s['artists'] if a['seed'] is None and a['name']})
    miss_own = sorted({a['name'] for r in yr['matches'] for s in r['sides'] for a in s['artists'] if not a['owner'] and a['name']})
    nowin = [(r['id'], [a['name'] for s in r['sides'] for a in s['artists']]) for r in yr['matches'] if r['winner'] is None and r['votes']]
    print(f'Y{y}: {len(yr["matches"])} matches champ={yr["champion"]} no seed={miss_seed} no owner={miss_own} no winner={nowin} unused={[u["name"] for u in yr["unused"]]}')
