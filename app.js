'use strict';
/* Tub Talk presents: The Best Songs in History. View-only site built from data/bracket.json and data/songs.json. */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const base = (s) => fold(s).replace(/\s*\(.*?\)\s*/g, ' ').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');

const ROUNDS = ['PI', 'R1', 'R2', 'S16', 'E8', 'F4', 'F'];
const ROUND_NAME = { PI: 'Play-in', R1: 'Round 1', R2: 'Round 2', S16: 'Sweet 16', E8: 'Elite 8', F4: 'Final Four', F: 'Final' };
const SLOT = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
const POS = {}; SLOT.forEach((s, i) => { POS[s] = i >> 1; });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let DATA = null, SONGS = {}, IDX = null, FROM_CACHE = false;

/* ---------- helpers ---------- */
function d(iso, long) {
  if (!iso) return '';
  const [y, m, dd] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  const s = `${DAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${dd}`;
  return long ? `${s}, ${y}` : s;
}
const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const color = (p) => (DATA.people.find((x) => x.name === p) || {}).color || '#C9C6BD';
const dot = (p, cls) => `<span class="dot ${cls || ''}" style="background:${p ? color(p) : '#C9C6BD'}" aria-hidden="true"></span>`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const mins = (s) => `${Math.round(s / 60)} min`;
const sideName = (side) => side.artists.map((a) => a.name || 'TBD').join(' / ');
const sideOwner = (side) => side.artists[0] && side.artists[0].owner;
const sideSeed = (side) => side.artists[0] && side.artists[0].seed;
const artistLink = (a, cls) => a.name ? `<a href="#/artist/${slug(a.name)}" class="${cls || ''}">${esc(a.name)}</a>` : '<span class="faint">TBD</span>';
const plUrl = (side) => side.playlist ? `https://open.spotify.com/playlist/${side.playlist}` : side.url;
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  years: '<path d="M3 4h5v6h5M3 20h5v-6h5M13 7v10h8"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  records: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const svg = (n, sz) => `<svg width="${sz || 20}" height="${sz || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const chev = () => `<span class="chev">${svg('chev', 16)}</span>`;

function winnerIdx(m) { return typeof m.winner === 'number' ? m.winner : null; }
function decided(m) { return m.winner !== null && m.winner !== undefined; }
function votesText(m) {
  if (!m.votes) return '';
  return `${m.votes[0]}-${m.votes[1]}` + (m.votes[2] ? `-${m.votes[2]}` : '') + '*'.repeat(m.stars || 0);
}
function scoreFor(m, i) { // votes for side i (the sheet lists the winner's votes first)
  if (!m.votes || m.sides.length !== 2) return null;
  const w = winnerIdx(m);
  return w === null ? m.votes[i] : (i === w ? m.votes[0] : m.votes[1]);
}

/* ---------- index ---------- */
function buildIndex() {
  const artists = {}; // slug -> {name, emoji, years:{y:{owner, seed, region, matches:[]}}}
  const matchById = {};
  const playlistUse = {}; // playlist id -> [{match, side}]
  for (const yr of DATA.years) {
    for (const m of yr.matches) {
      m.year = yr.n;
      matchById[m.id] = m;
      m.sides.forEach((s, si) => {
        if (s.playlist) (playlistUse[s.playlist] = playlistUse[s.playlist] || []).push({ m, si });
        for (const a of s.artists) {
          if (!a.name) continue;
          const k = slug(a.name);
          const A = artists[k] = artists[k] || { name: a.name, slug: k, emoji: '', years: {} };
          if (a.emoji && !A.emoji) A.emoji = a.emoji;
          const Y = A.years[yr.n] = A.years[yr.n] || { owner: a.owner, seed: a.seed, region: a.region, matches: [] };
          if (!Y.owner && a.owner) Y.owner = a.owner;
          if (!Y.seed && a.seed) Y.seed = a.seed;
          Y.matches.push({ m, si });
        }
      });
    }
  }
  // per-year outcome for each artist
  for (const A of Object.values(artists)) {
    for (const [y, Y] of Object.entries(A.years)) {
      const yr = DATA.years.find((x) => x.n === +y);
      Y.matches.sort((a, b) => ROUNDS.indexOf(a.m.round) - ROUNDS.indexOf(b.m.round) || (a.m.game || 0) - (b.m.game || 0));
      let out = null, best = 'PI', w = 0, l = 0;
      for (const { m, si } of Y.matches) {
        if (ROUNDS.indexOf(m.round) > ROUNDS.indexOf(best)) best = m.round;
        const wi = winnerIdx(m);
        if (wi === null) continue;
        if (wi === si) w++; else { l++; if (m.round !== 'F' || !m.game) out = out || m; }
      }
      Y.w = w; Y.l = l; Y.best = best;
      Y.champion = yr.champion && base(yr.champion) === base(A.name);
      if (yr.champion && m_isFinalist(Y) && !Y.champion) out = Y.matches[Y.matches.length - 1].m;
      Y.out = out;
      Y.alive = !out && !Y.champion && !yr.champion;
    }
  }
  function m_isFinalist(Y) { return Y.matches.some(({ m }) => m.round === 'F'); }
  // drafted base names, for "never drafted"
  const drafted = new Set(Object.values(artists).map((A) => base(A.name)));
  for (const yr of DATA.years) for (const u of yr.unused || []) u.name.split(/\s*\/\s*/).forEach((n) => drafted.add(base(n)));
  const umb = {};
  for (const [band, who] of Object.entries(DATA.umbrella || {})) umb[base(band)] = who;
  const dlist = [...drafted].filter((x) => x.length >= 5);
  drafted.has_ = (n) => { const b = base(n); return drafted.has(b) || !!umb[b] || dlist.some((x) => b.startsWith(x)); };
  // songs
  const tracks = []; // {id,title,artists:[...],dur,pl}
  const credited = {}; // base -> {name, n, lists:Set}
  for (const [pid, P] of Object.entries(SONGS)) {
    for (const t of P.t) {
      const names = t[2].split(/,\s*/).filter(Boolean);
      tracks.push({ id: t[0], title: t[1], artists: names, dur: t[3], pl: pid });
      for (const n of names) {
        const b = base(n);
        const C = credited[b] = credited[b] || { name: n, songs: 0, lists: new Set() };
        C.songs++; C.lists.add(pid);
      }
    }
  }
  IDX = { artists, matchById, playlistUse, drafted, tracks, credited };
}

function songsFor(pid) { return (SONGS[pid] && SONGS[pid].t) || null; }
function plMinutes(pid) { const t = songsFor(pid); return t ? t.reduce((a, x) => a + x[3], 0) : null; }

/* ---------- shell ---------- */
const TABS = [['#/', 'Home', 'home'], ['#/year', 'Years', 'years'], ['#/people', 'Drafters', 'people'], ['#/records', 'Records', 'records'], ['#/search', 'Search', 'search']];
function shell(active) {
  $('#nav').innerHTML = TABS.map(([h, t]) => `<a href="${h}" class="${active === t ? 'on' : ''}">${t}</a>`).join('');
  $('#tabbar').innerHTML = TABS.map(([h, t, i]) => `<a href="${h}" class="${active === t ? 'on' : ''}">${svg(i)}${t}</a>`).join('');
}

function route() {
  if (!DATA) return;
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const q = new URLSearchParams(qs || '');
  const p = path.split('/').filter(Boolean);
  let html = '', tab = 'Home', title = 'The Best Songs in History';
  try {
    if (!p.length) { html = pageHome(); }
    else if (p[0] === 'year') { tab = 'Years'; const y = +(p[1] || DATA.years[DATA.years.length - 1].n); html = pageYear(y, q.get('view')); title = `Year ${y}`; }
    else if (p[0] === 'match') { tab = 'Years'; html = pageMatch(decodeURIComponent(p[1])); title = 'Matchup'; }
    else if (p[0] === 'artist') { tab = ''; html = pageArtist(p[1]); title = (IDX.artists[p[1]] || {}).name || 'Artist'; }
    else if (p[0] === 'people') { tab = 'Drafters'; html = p[1] ? pagePerson(decodeURIComponent(p[1])) : pagePeople(); title = p[1] ? decodeURIComponent(p[1]) : 'Drafters'; }
    else if (p[0] === 'records') { tab = 'Records'; html = pageRecords(); title = 'Records'; }
    else if (p[0] === 'search') { tab = 'Search'; html = pageSearch(q.get('q') || '', q.get('f') || 'all'); title = 'Search'; }
    else html = notFound();
  } catch (e) { console.error(e); html = `<div class="card">Something went wrong drawing this page. <a href="#/">Go home</a></div>`; }
  shell(tab);
  $('#app').innerHTML = html;
  document.title = title === 'The Best Songs in History' ? title : `${title} · The Best Songs in History`;
  if (!route.keepScroll) window.scrollTo(0, 0);
  route.keepScroll = false;
  if (p[0] === 'search') wireSearch();
}
const notFound = () => `<div class="card">That page doesn't exist. <a href="#/">Go home</a></div>`;

/* ---------- components ---------- */
function sideLine(m, si, opts) {
  const s = m.sides[si];
  const wi = winnerIdx(m);
  const lost = wi !== null && wi !== si;
  const won = wi === si;
  const names = s.artists.map((a) => a.name ? esc(a.name) : '<span class="faint">TBD</span>').join(' / ');
  const seed = sideSeed(s);
  const v = opts && opts.showVotes && m.votes && m.sides.length === 2 ? `<span class="v num">${scoreFor(m, si)}</span>` : (opts && opts.right ? `<span class="v">${opts.right}</span>` : '');
  return `<span class="mline ${lost ? 'lose' : ''} ${won ? 'win' : ''}">${dot(lost ? null : sideOwner(s), 'sm')}<span class="seed">${seed || ''}</span><span class="nm">${names}</span>${v}</span>`;
}
function matchCard(m, opts) {
  opts = opts || {};
  const right = decided(m) ? `<span class="num">${esc(votesText(m))}</span>` : (m.date ? `<span class="muted">${esc(d(m.date))}</span>` : '');
  return `<a class="row-link" href="#/match/${m.id}" style="align-items:flex-start">
    <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
      ${opts.kicker ? `<span class="tiny muted">${opts.kicker}</span>` : ''}
      ${sideLine(m, 0)}${m.sides[1] ? sideLine(m, 1) : ''}
    </span>
    <span class="small" style="text-align:right;min-width:56px">${right}</span>${chev()}
  </a>`;
}
function yearPills(cur, view) {
  return `<div class="pills" role="group" aria-label="Year">${DATA.years.map((y) => `<a class="pill ${y.n === cur ? 'on' : ''}" href="#/year/${y.n}${view ? '?view=' + view : ''}" ${y.n === cur ? 'aria-current="page"' : ''}>Year ${y.n}</a>`).join('')}</div>`;
}
function legend() {
  return `<div class="pills small" style="gap:14px">${DATA.people.map((p) => `<a href="#/people/${p.name}" class="nowrap" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">${dot(p.name)}${p.name}</a>`).join('')}</div>`;
}
function starNote(m) {
  if (!m.stars) return '';
  const wi = winnerIdx(m);
  if (m.stars === 2) return '** Both list makers voted against their own lists.';
  if (m.votes && m.sides.length === 2 && wi !== null) {
    const lo = m.sides[1 - wi], wo = sideOwner(m.sides[wi]), loo = sideOwner(lo);
    if (wo === loo) return `* ${wo} voted against one of his own lists.`;
    if (scoreFor(m, 1 - wi) === 0) return `* ${loo} voted against his own list.`;
  }
  return '* One list maker voted against his own list.';
}

/* ---------- home ---------- */
function pageHome() {
  const cur = DATA.years[DATA.years.length - 1];
  const t = today();
  const upcoming = cur.matches.filter((m) => !decided(m) && m.date && m.date >= t && m.sides.every((s) => s.artists.some((a) => a.name))).slice(0, 2);
  const pending = cur.matches.filter((m) => !decided(m) && m.date && m.date < t && m.sides.every((s) => s.artists.some((a) => a.name)));
  const recent = cur.matches.filter(decided).slice(-4).reverse();
  const played = cur.matches.filter((m) => decided(m) && m.round !== 'PI').length;
  const total = 63;
  const roundNow = (upcoming[0] || pending[0] || recent[0] || {}).round;
  const next = upcoming[0];
  return `
  <section class="hero" style="display:flex;flex-direction:column;gap:4px">
    <span class="kick">Tub Talk presents</span>
    <h1>The Best Songs in History</h1>
    <span class="muted">(with no exceptions) · ${DATA.years.length} years, ${DATA.years.reduce((a, y) => a + y.matches.length, 0)} matchups</span>
  </section>
  <div class="grid2">
    <section class="card dark" style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="kick">Next up · Year ${cur.n}${roundNow ? ' · ' + ROUND_NAME[roundNow] : ''}</span><span class="small muted">${next ? esc(d(next.date)) : ''}</span></div>
      ${next ? next.sides.map((s) => `<a href="#/match/${next.id}" style="text-decoration:none;display:flex;align-items:center;gap:10px">
          <span class="seed" style="color:#C9C6BD">${sideSeed(s) ? '(' + sideSeed(s) + ')' : ''}</span>
          <span class="emoji" style="font-size:22px">${esc(s.artists[0].emoji || '')}</span>
          <span style="flex:1;font-family:var(--display);font-weight:700;font-size:22px">${esc(sideName(s))}</span>
          ${dot(sideOwner(s))}<span class="small" style="color:#C9C6BD;min-width:34px">${esc(sideOwner(s) || '')}</span></a>`).join('') : '<span>No matchups scheduled.</span>'}
      ${upcoming[1] ? `<a href="#/match/${upcoming[1].id}" class="small" style="color:#C9C6BD">Then ${esc(d(upcoming[1].date))}: ${esc(sideName(upcoming[1].sides[0]))} vs ${esc(sideName(upcoming[1].sides[1]))}</a>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px"><a class="btn light" href="#/year/${cur.n}">Year ${cur.n} bracket</a><a class="btn light" href="https://open.spotify.com/playlist/${cur.allSongs}" target="_blank" rel="noopener">All Songs #${cur.n}</a></div>
      <div class="small muted">${played} of ${total} matchups played this year</div>
    </section>
    <section class="card">
      <h2>Latest</h2>
      ${pending.map((m) => matchCard(m, { kicker: `${d(m.date)} · ${ROUND_NAME[m.round]} · votes not in yet` })).join('')}
      ${recent.map((m) => matchCard(m, { kicker: `${d(m.date)} · ${ROUND_NAME[m.round]}` }) + (m.stars ? `<div class="tiny muted" style="padding:0 2px 6px">${esc(starNote(m))}</div>` : '')).join('')}
    </section>
  </div>
  <section style="display:flex;flex-direction:column;gap:8px">
    <span class="kick">Champions</span>
    <div class="grid3">${DATA.years.map((y) => {
      const A = y.champion ? IDX.artists[slug(y.champion)] : null;
      const o = A && A.years[y.n] ? A.years[y.n].owner : null;
      return `<a class="card" href="${A ? '#/artist/' + A.slug : '#/year/' + y.n}" style="text-decoration:none;border-top:4px solid ${o ? color(o) : 'var(--line)'};display:flex;flex-direction:column;gap:2px">
        <span class="tiny muted">Year ${y.n} · ${esc(y.season)}</span>
        <span style="font-family:var(--display);font-weight:700;font-size:20px">${A ? esc(A.emoji + ' ' + A.name) : 'In progress'}</span>
        <span class="tiny muted">${o ? esc(o) + "'s pick" : 'Final on ' + esc(d((y.matches.find((m) => m.round === 'F') || {}).date) || 'TBD')}</span></a>`;
    }).join('')}</div>
  </section>
  <section class="card"><h2>Drafters</h2>${pagePeopleTable()}</section>`;
}

/* ---------- year ---------- */
function pageYear(y, view) {
  const yr = DATA.years.find((x) => x.n === y);
  if (!yr) return notFound();
  let v = view;
  if (!v) { try { v = localStorage.getItem('yearView') || 'bracket'; } catch (e) { v = 'bracket'; } }
  else { try { localStorage.setItem('yearView', v); } catch (e) { /* private mode */ } }
  const first = yr.matches.find((m) => m.date), last = [...yr.matches].reverse().find((m) => m.date);
  const nonPI = yr.matches.filter((m) => m.round !== 'PI' && !m.game || m.game === 1);
  const status = yr.champion ? `Champion: ${yr.champion}` : `${nonPI.filter(decided).length} of 63 played`;
  const views = [['bracket', 'Bracket'], ['schedule', 'Schedule'], ['both', 'Both'], ['drafters', 'By drafter']];
  let body = '';
  if (v === 'schedule') body = yearSchedule(yr);
  else if (v === 'drafters') body = yearDrafters(yr);
  else if (v === 'both') body = yearBracket(yr) + yearSchedule(yr);
  else body = yearBracket(yr);
  return `
  <section style="display:flex;flex-wrap:wrap;gap:12px 24px;align-items:flex-end">
    <div style="display:flex;flex-direction:column;gap:8px">
      ${yearPills(y, view)}
      <h1 style="font-weight:800;font-size:clamp(32px,6vw,46px);line-height:1">Year ${y}</h1>
      <span class="muted small">${esc(yr.season)} · ${yr.champion ? `${esc(d(first && first.date))} to ${esc(d(last && last.date))}` : `Started ${esc(d(first && first.date))}`} · ${esc(status)}</span>
    </div>
    <div style="margin-left:auto;display:flex;flex-direction:column;gap:8px;align-items:flex-start">
      ${legend()}
      <a class="small" href="https://open.spotify.com/playlist/${yr.allSongs}" target="_blank" rel="noopener" style="font-weight:600">All Songs #${y} on Spotify ${svg('ext', 14)}</a>
    </div>
  </section>
  <div class="pills" role="group" aria-label="View">${views.map(([k, t]) => `<a class="pill ${v === k ? 'on' : ''}" href="#/year/${y}?view=${k}" aria-pressed="${v === k}">${t}</a>`).join('')}</div>
  ${yr.note ? `<div class="note">${esc(yr.note)}</div>` : ''}
  ${body}
  ${yearFinals(yr)}
  ${yearDraft(yr)}`;
}

function regionGames(yr, ri) {
  // returns {R1:[8], R2:[4], S16:[2], E8:[1]} of {m, sides:[names]} with TBD derivation
  const rounds = ['R1', 'R2', 'S16', 'E8'];
  const out = {};
  const byRound = {};
  for (const m of yr.matches) {
    if (!rounds.includes(m.round)) continue;
    const a = m.sides.flatMap((s) => s.artists).find((x) => x.seed && x.region === ri);
    if (!a) continue;
    const g = POS[a.seed];
    const gi = m.round === 'R1' ? g : m.round === 'R2' ? g >> 1 : m.round === 'S16' ? g >> 2 : 0;
    (byRound[m.round] = byRound[m.round] || {})[gi] = m;
  }
  rounds.forEach((r, k) => {
    const n = 8 >> k;
    out[r] = [];
    for (let i = 0; i < n; i++) {
      const m = (byRound[r] || {})[i];
      if (m) { out[r].push({ m }); continue; }
      // derive from previous round winners
      const prev = k ? out[rounds[k - 1]] : null;
      const sides = [0, 1].map((j) => {
        const pm = prev && prev[i * 2 + j];
        if (pm && pm.m && winnerIdx(pm.m) !== null) return pm.m.sides[winnerIdx(pm.m)];
        return null;
      });
      out[r].push({ m: null, sides });
    }
  });
  return out;
}
function tbdBox(sides) {
  return sides.map((s) => s ? `<span class="mline">${dot(sideOwner(s), 'sm')}<span class="seed">${sideSeed(s) || ''}</span><span class="nm">${esc(sideName(s))}</span></span>` : `<span class="mline faint"><span class="dot sm" style="background:var(--line)"></span><span class="seed"></span><span class="nm">TBD</span></span>`).join('');
}
function yearBracket(yr) {
  const regions = yr.regions.map((rg, ri) => {
    const G = regionGames(yr, ri);
    const cols = [['R1', 1, 2], ['R2', 2, 4], ['S16', 3, 8], ['E8', 4, 16]];
    let cells = cols.map(([r, c]) => `<div class="bhead" style="grid-column:${c};grid-row:1">${ROUND_NAME[r]}</div>`).join('');
    for (const [r, c, span] of cols) {
      G[r].forEach((g, i) => {
        const row = `${2 + i * span} / span ${span}`;
        if (g.m) {
          const m = g.m;
          const right = decided(m) ? null : d(m.date).replace(/^\w+, /, '');
          cells += `<a class="bbox" href="#/match/${m.id}" style="grid-column:${c};grid-row:${row}" title="${esc(sideName(m.sides[0]))} vs ${esc(sideName(m.sides[1] || { artists: [] }))}">
            ${sideLine(m, 0, { showVotes: true })}${m.sides[1] ? sideLine(m, 1, decided(m) ? { showVotes: true } : { right: esc(right || '') }) : ''}</a>`;
        } else {
          cells += `<div class="bbox tbd" style="grid-column:${c};grid-row:${row}">${tbdBox(g.sides)}</div>`;
        }
      });
    }
    return `<section class="card" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 style="margin:0">${esc(rg.name)}</h2>${rg.sub ? `<span class="small muted">${esc(rg.sub)}</span>` : ''}</div>
      <div class="scroll"><div class="btree" style="grid-template-rows:auto repeat(16, 30px)">${cells}</div></div>
    </section>`;
  }).join('');
  // play-in + final four + final
  const pi = yr.matches.filter((m) => m.round === 'PI');
  const f4 = yr.matches.filter((m) => m.round === 'F4');
  const fin = yr.matches.filter((m) => m.round === 'F');
  const e8w = [0, 1, 2, 3].map((ri) => { const G = regionGames(yr, ri).E8[0]; return G.m && winnerIdx(G.m) !== null ? G.m.sides[winnerIdx(G.m)] : null; });
  const f4cards = [0, 1].map((k) => {
    const m = f4[k];
    if (m) return `<a class="bbox" style="padding:8px 10px;font-size:14px" href="#/match/${m.id}">${sideLine(m, 0, { showVotes: true })}${sideLine(m, 1, { showVotes: true })}</a>`;
    return `<div class="bbox tbd" style="padding:8px 10px;font-size:14px">${tbdBox([e8w[k * 2], e8w[k * 2 + 1]])}</div>`;
  }).join('');
  const fm = fin[0];
  const fcard = fm ? `<a class="bbox" style="padding:8px 10px;font-size:14px" href="#/match/${fm.id}">${sideLine(fm, 0, { showVotes: true })}${sideLine(fm, 1, { showVotes: true })}</a>` : `<div class="bbox tbd" style="padding:8px 10px;font-size:14px">${tbdBox([0, 1].map((k) => f4[k] && winnerIdx(f4[k]) !== null ? f4[k].sides[winnerIdx(f4[k])] : null))}</div>`;
  return `<div class="regions">${regions}</div>
  <section class="finals">
    <div class="card"><h2>Final Four</h2><div style="display:flex;flex-direction:column;gap:8px">${f4cards}</div><p class="tiny muted" style="margin:8px 0 0">Region 1 vs Region 2, Region 3 vs Region 4.</p></div>
    <div class="card"><h2>Final</h2>${fcard}${yr.champion ? `<p style="margin:10px 0 0;font-weight:700">Champion: ${artistLink({ name: yr.champion })}</p>` : ''}</div>
    <div class="card"><h2>Play-in</h2>${pi.map((m) => matchCard(m, { kicker: d(m.date) })).join('') || '<span class="muted small">None</span>'}</div>
  </section>`;
}
function yearSchedule(yr) {
  const groups = ROUNDS.map((r) => [r, yr.matches.filter((m) => m.round === r)]).filter(([, l]) => l.length);
  return `<section class="grid2">${groups.map(([r, l]) => `<div class="card"><h2>${ROUND_NAME[r]}</h2>${l.map((m) => matchCard(m, { kicker: `${d(m.date)}${m.note ? ' · ' + esc(m.note) : ''}` })).join('')}</div>`).join('')}</section>`;
}
function yearDrafters(yr) {
  const by = {};
  for (const A of Object.values(IDX.artists)) {
    const Y = A.years[yr.n]; if (!Y) continue;
    (by[Y.owner] = by[Y.owner] || []).push({ A, Y });
  }
  const cols = DATA.people.map((p) => {
    const list = (by[p.name] || []).sort((a, b) => (a.Y.seed || 99) - (b.Y.seed || 99));
    const alive = list.filter((x) => x.Y.alive).length;
    const w = list.reduce((a, x) => a + x.Y.w, 0), l = list.reduce((a, x) => a + x.Y.l, 0);
    return `<div class="card" style="border-top:4px solid ${p.color}">
      <h2><a href="#/people/${p.name}" style="text-decoration:none">${p.name}</a></h2>
      <div class="small muted" style="margin-bottom:6px">${list.length} artists · ${w}-${l}${yr.champion ? '' : ` · ${alive} still in`}</div>
      ${list.map(({ A, Y }) => {
        let st;
        if (Y.champion) st = '<strong>Champion</strong>';
        else if (Y.out) { const opp = Y.out.sides.find((s, i) => i !== Y.matches.find((x) => x.m === Y.out).si); st = `Out in ${ROUND_NAME[Y.out.round]}${opp ? ' to ' + esc(sideName(opp)) : ''}`; }
        else st = yr.champion ? '' : `<strong>Still in</strong> · ${ROUND_NAME[Y.best]}`;
        return `<a class="row-link" href="#/artist/${A.slug}" style="${Y.alive || Y.champion ? '' : 'opacity:.75'}">
          <span class="seed">${Y.seed || ''}</span><span style="flex:1;min-width:0;display:flex;flex-direction:column"><span style="font-weight:600">${esc(A.emoji)} ${esc(A.name)}</span><span class="tiny muted">${st}</span></span></a>`;
      }).join('')}
    </div>`;
  }).join('');
  return `<div class="scroll"><div class="drafters">${cols}</div></div>`;
}
function yearFinals(yr) {
  const fs = yr.finalSeries;
  if (!fs || !fs.games) return '';
  return `<section class="card"><h2>The final series: ${esc(fs.a)} vs ${esc(fs.b)}</h2>
    <p class="small muted" style="margin:0 0 10px">${esc(fs.note || '')} ${esc(fs.winner)} won ${esc(fs.score)}.</p>
    <div class="scroll"><table class="t" style="min-width:720px"><thead><tr><th>Game</th><th>Category</th><th>${esc(fs.a)}</th><th>${esc(fs.b)}</th><th>Result</th></tr></thead><tbody>
    ${fs.games.map((g, i) => g.cats.map((c, k) => `<tr>${k === 0 ? `<td rowspan="${g.cats.length}" class="nowrap"><strong>Game ${i + 1}</strong><br><span class="tiny muted">${esc(d(g.date))}</span></td>` : ''}<td class="muted">${esc(c[0])}</td><td>${esc(c[1])}</td><td>${esc(c[2])}</td>${k === 0 ? `<td rowspan="${g.cats.length}"><strong>${esc(g.winner)}</strong>${g.votes ? ' ' + esc(g.votes) : ''}</td>` : ''}</tr>`).join('')).join('')}
    </tbody></table></div></section>`;
}
function yearDraft(yr) {
  if (!yr.draft) return `<section class="card"><h2>Draft board</h2><p class="muted small" style="margin:0">Not recorded for Year ${yr.n}.</p></section>`;
  const P = yr.draft.people;
  return `<section class="card"><h2>Draft board</h2>
    <p class="small muted" style="margin:0 0 8px">Struck through: swapped out. Gray italic: drafted but never played.</p>
    <div class="scroll"><table class="t" style="min-width:720px"><thead><tr><th class="n">#</th>${P.map((p) => `<th style="border-bottom:3px solid ${color(p)}">${esc(p)}</th>`).join('')}</tr></thead><tbody>
    ${yr.draft.rows.map((row, i) => `<tr><td class="n muted">${i + 1}</td>${row.map((c) => `<td>${(c.old || []).map((o) => `<s class="faint">${esc(o)}</s> `).join('')}${c.unused ? `<em class="faint">${esc(c.name)}</em>` : (c.artist ? `<a href="#/artist/${slug(c.artist)}">${esc(c.name)}</a>` : esc(c.name))}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    ${yr.unused.length ? `<p class="small" style="margin:10px 0 0"><strong>Drafted, never used:</strong> ${yr.unused.map((u) => `${esc(u.name)} (${esc(u.owner)})`).join(', ')}</p>` : ''}
  </section>`;
}

/* ---------- match ---------- */
function trackList(pid, hl) {
  const t = songsFor(pid);
  if (!t) return `<p class="small muted" style="margin:0">Track list not loaded yet.</p>`;
  const total = t.reduce((a, x) => a + x[3], 0);
  return `<div class="tiny muted" style="margin-bottom:4px">${t.length} songs · ${mins(total)}</div><ol class="tracks">${t.map((x, i) => `<li><span class="i">${i + 1}</span><span style="min-width:0"><span class="ti">${hl ? hl(x[1]) : esc(x[1])}</span><br><span class="ar">${hl ? hl(x[2]) : esc(x[2])}</span></span><span class="d">${mmss(x[3])}</span></li>`).join('')}</ol>`;
}
function pageMatch(id) {
  const m = IDX.matchById[id];
  if (!m) return notFound();
  const yr = DATA.years.find((y) => y.n === m.year);
  const wi = winnerIdx(m);
  const regionName = (() => { const a = m.sides.flatMap((s) => s.artists).find((x) => x.region != null); return a && !['F4', 'F'].includes(m.round) ? yr.regions[a.region].name : ''; })();
  const two = m.sides.length === 2;
  const sideBlock = (s, i) => `
    <div style="display:flex;flex-direction:column;gap:4px;${i ? 'align-items:flex-end;text-align:right' : ''};${wi !== null && wi !== i ? 'opacity:.6' : ''}">
      <span class="emoji">${esc(s.artists.map((a) => a.emoji).join(' '))}</span>
      <span class="small muted">${i ? '' : (sideSeed(s) ? '(' + sideSeed(s) + ') · ' : '')}${esc(s.artists.map((a) => a.owner).filter((x, k, arr) => x && arr.indexOf(x) === k).join(' / '))}${i && sideSeed(s) ? ' · (' + sideSeed(s) + ')' : ''}</span>
      <span class="side-name" style="${wi === i ? `border-bottom:3px solid ${color(sideOwner(s))}` : ''}">${s.artists.map((a) => artistLink(a)).join(' / ')}</span>
    </div>`;
  const notes = [];
  if (two && wi !== null) {
    const ws = sideSeed(m.sides[wi]), ls = sideSeed(m.sides[1 - wi]);
    if (ws && ls && ws - ls >= 4) notes.push(`<span><strong>Upset:</strong> a ${ws} seed over a ${ls}.</span>`);
  }
  if (m.tiebreak) notes.push(`<span><strong>Tiebreak:</strong> 2-2 on votes, decided on average rating, ${m.tiebreak[0].toFixed(3)} to ${m.tiebreak[1].toFixed(3)}.</span>`);
  if (m.stars) notes.push(`<span>${esc(starNote(m))}</span>`);
  if (m.winner === 'both') notes.push('<span>Tie. Both advanced.</span>');
  if (m.winner === 'tie') notes.push('<span>Tie. Both advanced.</span>');
  if (m.note) notes.push(`<span>${esc(m.note)}</span>`);
  if (m.voters) notes.push(`<span><strong>Votes:</strong> ${Object.entries(m.voters).map(([p, si]) => `${esc(p)}: ${esc(sideName(m.sides[si]))}`).join(' · ')}</span>`);
  else if (decided(m) && m.year >= 4) notes.push('<span class="muted">Who voted for whom is tracked from late Nov 2026 on.</span>');
  const list = yr.matches;
  const k = list.indexOf(m);
  const prev = list[k - 1], next = list[k + 1];
  const series = m.round === 'F' && yr.finalSeries && yr.finalSeries.games ? `<a class="btn light" href="#/year/${yr.n}">See the final series</a>` : '';
  return `
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <a class="pill" href="#/year/${yr.n}">Year ${yr.n}</a>
    <span class="small muted">${ROUND_NAME[m.round]}${m.game ? ' · Game ' + m.game : ''}${regionName ? ' · ' + esc(regionName) : ''} · ${esc(d(m.date, true))}</span>
  </div>
  <section class="card">
    ${two ? `<div class="vs">${sideBlock(m.sides[0], 0)}<div style="display:flex;flex-direction:column;align-items:center">${m.votes ? `<span class="score">${scoreFor(m, 0)}-${scoreFor(m, 1)}</span><span class="tiny muted">votes${m.stars ? ' ' + '*'.repeat(m.stars) : ''}</span>` : `<span class="small muted">${decided(m) ? '' : 'Not voted yet'}</span>`}</div>${sideBlock(m.sides[1], 1)}</div>` : m.sides.map((s, i) => sideBlock(s, 0)).join('')}
  </section>
  ${notes.length ? `<div class="note">${notes.join('')}</div>` : ''}
  ${series}
  <section class="grid2">${m.sides.map((s) => `
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        ${s.playlist && SONGS[s.playlist] && SONGS[s.playlist].c ? `<img class="cover" src="${esc(SONGS[s.playlist].c)}" alt="" loading="lazy">` : ''}
        <div style="flex:1;min-width:0"><h2 style="margin:0">${esc(sideName(s))}</h2>${s.playlist && SONGS[s.playlist] ? `<div class="tiny muted">“${esc(SONGS[s.playlist].n)}”</div>` : ''}</div>
      </div>
      ${s.playlist ? trackList(s.playlist) : (s.url ? '<p class="small muted" style="margin:0">This playlist is outside Spotify.</p>' : '<p class="small muted" style="margin:0">No playlist yet.</p>')}
      ${plUrl(s) ? `<a class="btn" style="margin-top:10px;width:100%" href="${esc(plUrl(s))}" target="_blank" rel="noopener">Open in ${s.url && s.url.includes('youtube') ? 'YouTube Music' : 'Spotify'}</a>` : ''}
    </div>`).join('')}
  </section>
  <nav style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap" aria-label="More matchups">
    ${prev ? `<a class="btn light" href="#/match/${prev.id}">← ${esc(d(prev.date))}</a>` : '<span></span>'}
    ${next ? `<a class="btn light" href="#/match/${next.id}">${esc(d(next.date))} →</a>` : ''}
  </nav>`;
}

/* ---------- artist ---------- */
function pageArtist(s) {
  const A = IDX.artists[s];
  if (!A) return notFound();
  const yrs = Object.keys(A.years).map(Number).sort();
  const b = base(A.name);
  const others = IDX.tracks.filter((t) => t.artists.some((n) => base(n) === b) && !(IDX.playlistUse[t.pl] || []).some(({ m, si }) => m.sides[si].artists.some((a) => base(a.name) === b)));
  const related = Object.values(IDX.artists).filter((x) => x !== A && base(x.name) === b);
  return `
  <section style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <span style="font-size:52px;line-height:1">${esc(A.emoji)}</span>
    <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
      <h1 style="font-weight:800;font-size:clamp(32px,6vw,52px);line-height:.95">${esc(A.name)}</h1>
      <span class="muted small">${yrs.map((y) => { const Y = A.years[y]; return `${dot(Y.owner, 'sm')} ${esc(Y.owner || '?')}'s pick · Year ${y}${Y.seed ? ' · (' + Y.seed + ') seed' : ''}`; }).join('<br>')}</span>
    </div>
    ${yrs.some((y) => A.years[y].champion) ? `<span class="card dark" style="margin-left:auto;text-align:center"><span class="kick">Year ${yrs.find((y) => A.years[y].champion)}</span><br><span style="font-family:var(--display);font-weight:800;font-size:22px">Champion</span></span>` : ''}
  </section>
  ${related.length ? `<div class="note">Other eras: ${related.map((r) => `<a href="#/artist/${r.slug}">${esc(r.name)}</a>`).join(', ')}</div>` : ''}
  ${yrs.map((y) => {
    const Y = A.years[y];
    return `<section class="card"><h2>Year ${y}: ${Y.champion ? 'Champion' : Y.alive ? 'Still in' : 'Out in ' + ROUND_NAME[(Y.out || {}).round || Y.best]}</h2>
      <div class="scroll"><table class="t" style="min-width:560px"><thead><tr><th>Round</th><th>Date</th><th>Opponent</th><th class="n">Votes</th><th>Playlist</th></tr></thead><tbody>
      ${Y.matches.map(({ m, si }) => {
        const opp = m.sides.filter((x, i) => i !== si);
        const wi = winnerIdx(m);
        const res = wi === null ? (m.winner === 'both' || m.winner === 'tie' ? 'Tie' : '') : (wi === si ? 'W' : 'L');
        const sc = m.votes && m.sides.length === 2 ? `${res} ${scoreFor(m, si)}-${scoreFor(m, 1 - si)}${'*'.repeat(m.stars || 0)}` : res;
        const side = m.sides[si];
        return `<tr><td class="nowrap"><a href="#/match/${m.id}">${ROUND_NAME[m.round]}${m.game ? ' G' + m.game : ''}</a></td><td class="nowrap muted">${esc(d(m.date))}</td><td>${opp.map((o) => o.artists.map((a) => (a.seed ? `(${a.seed}) ` : '') + artistLink(a)).join(' / ')).join(', ')}</td><td class="n nowrap">${esc(sc)}</td><td class="small">${side.playlist ? `${songsFor(side.playlist) ? songsFor(side.playlist).length + ' songs, ' + mins(plMinutes(side.playlist)) : ''} <a href="https://open.spotify.com/playlist/${side.playlist}" target="_blank" rel="noopener">Spotify</a>` : ''}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      ${Y.matches.filter(({ m, si }) => m.sides[si].playlist && songsFor(m.sides[si].playlist)).map(({ m, si }) => `<details style="margin-top:8px"><summary style="cursor:pointer;min-height:36px;display:flex;align-items:center" class="small"><strong>${ROUND_NAME[m.round]}${m.game ? ' G' + m.game : ''} playlist</strong>&nbsp;<span class="muted">· ${songsFor(m.sides[si].playlist).length} songs</span></summary>${trackList(m.sides[si].playlist)}</details>`).join('')}
    </section>`;
  }).join('')}
  <section class="card"><h2>Shows up on other lists</h2>
    ${others.length ? `<div class="scroll"><table class="t"><thead><tr><th>Song</th><th>Artists</th><th>On</th></tr></thead><tbody>${others.slice(0, 80).map((t) => `<tr><td>${esc(t.title)}</td><td class="small">${esc(t.artists.join(', '))}</td><td class="small">${listRef(t.pl)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="small muted" style="margin:0">${Object.keys(SONGS).length ? 'Not on anyone else\'s playlist.' : 'Appears once the track lists are loaded.'}</p>`}
  </section>`;
}
function listRef(pid) {
  const u = (IDX.playlistUse[pid] || [])[0];
  if (!u) return '';
  const s = u.m.sides[u.si];
  return `<a href="#/match/${u.m.id}">${esc(sideName(s))}</a> <span class="muted">Y${u.m.year} ${ROUND_NAME[u.m.round]}</span>`;
}

/* ---------- people ---------- */
function personStats(p) {
  const st = { w: 0, l: 0, t: 0, self: 0, titles: [], years: {}, h2h: {} };
  for (const yr of DATA.years) {
    const Y = st.years[yr.n] = { w: 0, l: 0, artists: 0 };
    for (const m of yr.matches) {
      if (m.sides.length !== 2) continue;
      const o = m.sides.map(sideOwner);
      if (!o.includes(p)) continue;
      if (o[0] === o[1]) { st.self++; continue; }
      const me = o.indexOf(p), them = o[1 - me];
      const H = st.h2h[them] = st.h2h[them] || { w: 0, l: 0 };
      const wi = winnerIdx(m);
      if (wi === null) { if (decided(m)) st.t++; continue; }
      if (wi === me) { st.w++; Y.w++; H.w++; } else { st.l++; Y.l++; H.l++; }
    }
    for (const A of Object.values(IDX.artists)) if (A.years[yr.n] && A.years[yr.n].owner === p) { Y.artists++; if (A.years[yr.n].champion) st.titles.push({ y: yr.n, A }); }
  }
  return st;
}
function pagePeopleTable() {
  const rows = DATA.people.map((p) => ({ p, s: personStats(p.name) }));
  return `<div class="scroll"><table class="t"><thead><tr><th>Drafter</th><th class="n">W</th><th class="n">L</th><th class="n">Win %</th><th>Titles</th></tr></thead><tbody>
  ${rows.map(({ p, s }) => `<tr><td><a href="#/people/${p.name}" style="text-decoration:none;display:inline-flex;align-items:center;gap:8px">${dot(p.name)}<strong>${p.name}</strong></a></td><td class="n">${s.w}</td><td class="n">${s.l}</td><td class="n">${s.w + s.l ? Math.round(100 * s.w / (s.w + s.l)) + '%' : ''}</td><td>${s.titles.map((t) => `<a href="#/artist/${t.A.slug}">${esc(t.A.name)}</a> <span class="muted small">Y${t.y}</span>`).join(', ')}</td></tr>`).join('')}
  </tbody></table></div><p class="tiny muted" style="margin:6px 0 0">Matchups between two of the same person's artists don't count.</p>`;
}
function pagePeople() {
  return `<h1 style="font-weight:800;font-size:clamp(30px,5vw,44px)">Drafters</h1><section class="card">${pagePeopleTable()}</section>
  <div class="grid2">${DATA.people.map((p) => `<a class="card" href="#/people/${p.name}" style="text-decoration:none;border-top:4px solid ${p.color}"><h2>${p.name}</h2><span class="small muted">Every artist, year by year, and head to head.</span></a>`).join('')}</div>`;
}
function pagePerson(p) {
  const P = DATA.people.find((x) => x.name === p);
  if (!P) return notFound();
  const s = personStats(p);
  return `
  <section style="display:flex;flex-direction:column;gap:6px"><span class="kick">Drafter</span><h1 style="font-weight:800;font-size:clamp(34px,6vw,52px);display:flex;align-items:center;gap:12px"><span class="dot" style="width:22px;height:22px;background:${P.color}"></span>${esc(p)}</h1></section>
  <div class="grid3">
    <div class="card stat"><span class="kick">All-time</span><span class="big">${s.w}-${s.l}</span><span class="small muted">${s.w + s.l ? Math.round(100 * s.w / (s.w + s.l)) : 0}% · ${s.self} vs himself</span></div>
    <div class="card stat"><span class="kick">Titles</span><span class="big">${s.titles.length}</span><span class="small muted">${s.titles.map((t) => `${esc(t.A.name)} (Y${t.y})`).join(', ') || '—'}</span></div>
    <div class="card"><span class="kick">Head to head</span>${Object.entries(s.h2h).map(([o, h]) => `<div class="mline small" style="padding:3px 0">${dot(o, 'sm')}<span style="flex:1">vs ${esc(o)}</span><span class="num"><strong>${h.w}-${h.l}</strong></span></div>`).join('')}</div>
  </div>
  ${DATA.years.slice().reverse().map((yr) => {
    const list = Object.values(IDX.artists).filter((A) => A.years[yr.n] && A.years[yr.n].owner === p).sort((a, b) => (a.years[yr.n].seed || 99) - (b.years[yr.n].seed || 99));
    const Y = s.years[yr.n];
    const unused = (yr.unused || []).filter((u) => u.owner === p);
    const swaps = yr.draft ? yr.draft.rows.map((r) => r[yr.draft.people.indexOf(p)]).filter((c) => c && c.old && c.old.length) : [];
    return `<section class="card"><h2><a href="#/year/${yr.n}?view=drafters" style="text-decoration:none">Year ${yr.n}</a> <span class="small muted" style="font-family:Inter">${Y.w}-${Y.l} · ${list.length} artists</span></h2>
      <div class="grid3" style="gap:0 16px">${list.map((A) => { const y = A.years[yr.n]; return `<a class="row-link" href="#/artist/${A.slug}"><span class="seed">${y.seed || ''}</span><span style="flex:1;min-width:0"><strong>${esc(A.emoji)} ${esc(A.name)}</strong><br><span class="tiny muted">${y.champion ? 'Champion' : y.alive ? 'Still in · ' + ROUND_NAME[y.best] : 'Out in ' + ROUND_NAME[(y.out || {}).round || y.best]} · ${y.w}-${y.l}</span></span></a>`; }).join('')}</div>
      ${swaps.length ? `<p class="small" style="margin:8px 0 0"><strong>Swaps:</strong> ${swaps.map((c) => `${c.old.map(esc).join(', ')} → ${esc(c.name)}`).join('; ')}</p>` : ''}
      ${unused.length ? `<p class="small" style="margin:4px 0 0"><strong>Drafted, never used:</strong> ${unused.map((u) => esc(u.name)).join(', ')}</p>` : ''}
    </section>`;
  }).join('')}`;
}

/* ---------- records ---------- */
function pageRecords() {
  const all = DATA.years.flatMap((y) => y.matches);
  const two = all.filter((m) => m.sides.length === 2 && winnerIdx(m) !== null);
  const upsets = two.map((m) => { const w = winnerIdx(m); return { m, ws: sideSeed(m.sides[w]), ls: sideSeed(m.sides[1 - w]) }; }).filter((x) => x.ws && x.ls && x.ws > x.ls && x.m.round !== 'PI').sort((a, b) => (b.ws - b.ls) - (a.ws - a.ls) || ROUNDS.indexOf(b.m.round) - ROUNDS.indexOf(a.m.round)).slice(0, 12);
  const close = all.filter((m) => m.tiebreak).sort((a, b) => Math.abs(a.tiebreak[0] - a.tiebreak[1]) - Math.abs(b.tiebreak[0] - b.tiebreak[1])).slice(0, 12);
  const pls = [];
  for (const m of all) if (!(m.game > 1)) m.sides.forEach((s, si) => { if (s.playlist && songsFor(s.playlist)) pls.push({ m, si, n: songsFor(s.playlist).length, sec: plMinutes(s.playlist) }); });
  const longest = pls.slice().sort((a, b) => b.sec - a.sec).slice(0, 10);
  const shortest = pls.slice().sort((a, b) => a.sec - b.sec).slice(0, 10);
  const most = pls.slice().sort((a, b) => b.n - a.n).slice(0, 10);
  const fewest = pls.slice().sort((a, b) => a.n - b.n).slice(0, 10);
  const byYear = DATA.years.map((y) => { const l = pls.filter((p) => p.m.year === y.n); return { y: y.n, n: l.length, avg: l.length ? l.reduce((a, p) => a + p.sec, 0) / l.length : 0, songs: l.length ? l.reduce((a, p) => a + p.n, 0) / l.length : 0 }; });
  const maxAvg = Math.max(1, ...byYear.map((x) => x.avg));
  const songCount = {};
  for (const t of IDX.tracks) { const k = fold(t.title).replace(/\s*[-(].*$/, '') + '|' + base(t.artists[0]); const S = songCount[k] = songCount[k] || { t, lists: new Set() }; S.lists.add(t.pl); }
  const repeats = Object.values(songCount).filter((x) => x.lists.size > 1).sort((a, b) => b.lists.size - a.lists.size).slice(0, 15);
  const sweeps = DATA.years.map((y) => ({ y: y.n, n: y.matches.filter((m) => m.votes && Math.max(m.votes[0], m.votes[1]) === 4).length, of: y.matches.filter((m) => m.votes).length, stars: y.matches.filter((m) => m.stars).length }));
  const plRow = (x, val) => `<tr><td><a href="#/match/${x.m.id}">${esc(sideName(x.m.sides[x.si]))}</a></td><td class="small muted nowrap">Y${x.m.year} ${ROUND_NAME[x.m.round]}</td><td class="n nowrap">${val}</td></tr>`;
  const noSongs = !Object.keys(SONGS).length ? '<p class="small muted" style="margin:0">Appears once the track lists are loaded.</p>' : '';
  return `
  <h1 style="font-weight:800;font-size:clamp(30px,5vw,44px)">Records</h1>
  <div class="grid2">
    <section class="card"><h2>Champions</h2>${DATA.years.map((y) => { const A = y.champion && IDX.artists[slug(y.champion)]; const o = A && A.years[y.n].owner; return `<a class="row-link" href="${A ? '#/artist/' + A.slug : '#/year/' + y.n}">${dot(o)}<span style="flex:1"><strong>Year ${y.n}:</strong> ${A ? esc(A.name) + ' <span class="muted small">(' + esc(o) + ', ' + A.years[y.n].seed + ' seed)</span>' : '<span class="muted">in progress</span>'}</span>${chev()}</a>`; }).join('')}</section>
    <section class="card"><h2>Drafters</h2>${pagePeopleTable()}</section>
    <section class="card"><h2>Biggest upsets</h2><div class="scroll"><table class="t"><thead><tr><th>Winner</th><th>Over</th><th>When</th></tr></thead><tbody>${upsets.map((x) => { const w = winnerIdx(x.m); return `<tr><td><a href="#/match/${x.m.id}">(${x.ws}) ${esc(sideName(x.m.sides[w]))}</a></td><td>(${x.ls}) ${esc(sideName(x.m.sides[1 - w]))}</td><td class="small muted nowrap">Y${x.m.year} ${ROUND_NAME[x.m.round]}</td></tr>`; }).join('')}</tbody></table></div></section>
    <section class="card"><h2>Closest tiebreaks</h2><div class="scroll"><table class="t"><thead><tr><th>Matchup</th><th class="n">Ratings</th><th>When</th></tr></thead><tbody>${close.map((m) => { const w = winnerIdx(m); return `<tr><td><a href="#/match/${m.id}">${w !== null ? esc(sideName(m.sides[w])) + ' over ' + esc(sideName(m.sides[1 - w])) : esc(sideName(m.sides[0])) + ' / ' + esc(sideName(m.sides[1]))}</a></td><td class="n nowrap">${m.tiebreak[0].toFixed(3)} to ${m.tiebreak[1].toFixed(3)}</td><td class="small muted nowrap">Y${m.year} ${ROUND_NAME[m.round]}</td></tr>`; }).join('')}</tbody></table></div></section>
    <section class="card"><h2>Sweeps and self-votes</h2><table class="t"><thead><tr><th>Year</th><th class="n">4-0 sweeps</th><th class="n">With * or **</th></tr></thead><tbody>${sweeps.map((s) => `<tr><td>Year ${s.y}</td><td class="n">${s.n} of ${s.of}</td><td class="n">${s.stars}</td></tr>`).join('')}</tbody></table><p class="tiny muted" style="margin:6px 0 0">* a list's maker voted against it. ** both makers did.</p></section>
    <section class="card"><h2>Playlist length by year</h2>${noSongs || byYear.map((x) => `<div style="padding:6px 0"><div class="small" style="display:flex;justify-content:space-between"><span>Year ${x.y}</span><span class="muted">${x.n ? mins(x.avg) + ' avg · ' + x.songs.toFixed(1) + ' songs' : 'not loaded'}</span></div><div class="bar"><span style="width:${100 * x.avg / maxAvg}%;background:var(--ink)"></span></div></div>`).join('')}</section>
    <p class="tiny muted" style="grid-column:1/-1;margin:0">Playlist records leave out the short best-of-3 lists from Year 2's final series.</p>
    <section class="card"><h2>Longest playlists</h2>${noSongs || `<table class="t"><tbody>${longest.map((x) => plRow(x, mins(x.sec))).join('')}</tbody></table>`}</section>
    <section class="card"><h2>Shortest playlists</h2>${noSongs || `<table class="t"><tbody>${shortest.map((x) => plRow(x, mins(x.sec))).join('')}</tbody></table>`}</section>
    <section class="card"><h2>Most songs on a playlist</h2>${noSongs || `<table class="t"><tbody>${most.map((x) => plRow(x, x.n + ' songs')).join('')}</tbody></table>`}</section>
    <section class="card"><h2>Fewest songs on a playlist</h2>${noSongs || `<table class="t"><tbody>${fewest.map((x) => plRow(x, x.n + ' songs')).join('')}</tbody></table>`}</section>
    <section class="card"><h2>Songs used more than once</h2>${noSongs || (repeats.length ? `<table class="t"><tbody>${repeats.map((r) => `<tr><td>${esc(r.t.title)}<br><span class="tiny muted">${esc(r.t.artists.join(', '))}</span></td><td class="n">${r.lists.size} lists</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">None yet.</p>')}</section>
  </div>`;
}

/* ---------- search ---------- */
function pageSearch(q, f) {
  const filters = [['all', 'All'], ['artists', 'Drafted artists'], ['songs', 'Songs'], ['never', 'Never drafted']];
  return `<h1 style="font-weight:800;font-size:clamp(30px,5vw,44px)">Search</h1>
  <label class="sr" for="q">Search artists and songs</label>
  <div class="searchbox">${svg('search', 18)}<input id="q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Artist or song" value="${esc(q)}"></div>
  <div class="pills" role="group" aria-label="Show">${filters.map(([k, t]) => `<button type="button" class="pill ${f === k ? 'on' : ''}" data-f="${k}" aria-pressed="${f === k}">${t}</button>`).join('')}</div>
  <div id="results">${searchResults(q, f)}</div>`;
}
function searchResults(q, f) {
  const qq = fold(q.trim());
  const terms = qq.split(/\s+/).filter(Boolean);
  const match = (s) => { const x = fold(s); return terms.every((t) => x.includes(t)); };
  const hl = (s) => { let h = esc(s); for (const t of terms) { if (t.length < 2) continue; const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); h = h.replace(re, '<mark>$1</mark>'); } return h; };
  const noSongs = !IDX.tracks.length;
  let out = '';
  if (f === 'never') {
    const list = Object.values(IDX.credited).filter((c) => !IDX.drafted.has_(c.name) && (!terms.length || match(c.name))).sort((a, b) => b.lists.size - a.lists.size || b.songs - a.songs);
    out += `<section class="card"><h2>Never drafted</h2><p class="small muted" style="margin:0 0 6px">Artists credited on someone's playlist (a feature, a cover, a side project) who have never had a bracket spot. Sorted by how many lists they're on.</p>
      ${noSongs ? '<p class="small muted">Appears once the track lists are loaded.</p>' : list.slice(0, 150).map((c) => `<a class="row-link" href="#/search?q=${encodeURIComponent(c.name)}&f=songs"><span style="flex:1"><strong>${hl(c.name)}</strong></span><span class="small muted">${c.lists.size} list${c.lists.size > 1 ? 's' : ''} · ${c.songs} song${c.songs > 1 ? 's' : ''}</span>${chev()}</a>`).join('') || '<p class="muted small">No matches.</p>'}</section>`;
    return out;
  }
  if (!terms.length) return `<p class="muted small">Search every artist we've drafted and every song on every playlist. Try a band, a song title, or someone who only shows up as a feature.</p>`;
  if (f === 'all' || f === 'artists') {
    const arts = Object.values(IDX.artists).filter((A) => match(A.name)).sort((a, b) => a.name.localeCompare(b.name));
    out += `<section class="card"><h2>Drafted artists <span class="small muted">${arts.length}</span></h2>${arts.slice(0, 60).map((A) => {
      const ys = Object.keys(A.years).map(Number);
      return `<a class="row-link" href="#/artist/${A.slug}">${dot(A.years[ys[0]].owner)}<span style="flex:1;min-width:0"><strong>${esc(A.emoji)} ${hl(A.name)}</strong><br><span class="tiny muted">${ys.map((y) => { const Y = A.years[y]; return `Year ${y} · ${Y.owner} · ${Y.champion ? 'Champion' : Y.alive ? 'Still in' : 'Out in ' + ROUND_NAME[(Y.out || {}).round || Y.best]}`; }).join(' · ')}</span></span>${chev()}</a>`;
    }).join('') || '<p class="muted small" style="margin:0">None.</p>'}</section>`;
  }
  if (f === 'all' || f === 'songs') {
    if (noSongs) out += `<section class="card"><h2>Songs</h2><p class="small muted" style="margin:0">Appears once the track lists are loaded.</p></section>`;
    else {
      const hits = IDX.tracks.filter((t) => match(t.title + ' ' + t.artists.join(' ')));
      const byKey = {};
      for (const t of hits) { const k = t.id; (byKey[k] = byKey[k] || { t, pls: [] }).pls.push(t.pl); }
      const list = Object.values(byKey).sort((a, b) => b.pls.length - a.pls.length);
      out += `<section class="card"><h2>Songs <span class="small muted">${list.length}</span></h2>${list.slice(0, 120).map(({ t, pls }) => `<div class="row-link" style="align-items:flex-start;flex-direction:column;gap:2px"><span><strong>${hl(t.title)}</strong> <span class="tiny muted">${mmss(t.dur)}</span></span><span class="small muted">${hl(t.artists.join(', '))}</span><span class="tiny">${pls.map(listRef).join(' · ')}</span></div>`).join('') || '<p class="muted small" style="margin:0">None.</p>'}${list.length > 120 ? '<p class="tiny muted">Showing 120. Narrow the search for more.</p>' : ''}</section>`;
      if (f === 'all') {
        const cred = Object.values(IDX.credited).filter((c) => !IDX.drafted.has_(c.name) && match(c.name));
        if (cred.length) out += `<section class="card"><h2>Credited, never drafted</h2>${cred.slice(0, 30).map((c) => `<a class="row-link" href="#/search?q=${encodeURIComponent(c.name)}&f=songs"><span style="flex:1"><strong>${hl(c.name)}</strong></span><span class="small muted">${c.lists.size} list${c.lists.size > 1 ? 's' : ''}</span>${chev()}</a>`).join('')}</section>`;
      }
    }
  }
  return out;
}
function wireSearch() {
  const inp = $('#q');
  const state = () => { const qs = new URLSearchParams((location.hash.split('?')[1]) || ''); return { q: qs.get('q') || '', f: qs.get('f') || 'all' }; };
  let t = null;
  const update = (q, f) => {
    $('#results').innerHTML = searchResults(q, f);
    const nh = `#/search?q=${encodeURIComponent(q)}&f=${f}`;
    history.replaceState(null, '', nh);
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => update(inp.value, state().f), 120); });
  document.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-f]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    update(inp.value, b.dataset.f);
  }));
  if (!inp.value && matchMedia('(hover:hover)').matches) inp.focus();
}

/* ---------- boot ---------- */
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  if (r.headers.get('x-from-cache')) FROM_CACHE = r.headers.get('x-from-cache');
  return r.json();
}
async function boot() {
  try {
    DATA = await getJSON('data/bracket.json');
  } catch (e) {
    $('#app').innerHTML = '<div class="card">Couldn\'t load the bracket. Check your connection and reload.</div>';
    return;
  }
  try { SONGS = await getJSON('data/songs.json'); } catch (e) { SONGS = {}; }
  buildIndex();
  if (FROM_CACHE) { const o = $('#offline'); o.hidden = false; o.textContent = `No connection. Showing your saved copy from ${new Date(+FROM_CACHE).toLocaleDateString()}.`; }
  route();
}
window.addEventListener('hashchange', route);
window.addEventListener('online', () => { $('#offline').hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
