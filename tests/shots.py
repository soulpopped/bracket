"""Screenshot the main pages at phone and desktop sizes and collect page errors.
Usage: python3 tests/shots.py http://127.0.0.1:8765 /tmp/shots"""
import sys, os
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
PAGES = sys.argv[3].split(',') if len(sys.argv) > 3 else ['', 'year/4', 'year/4?view=schedule', 'year/4?view=drafters', 'year/3', 'year/1', 'match/4-r1-24', 'match/2-f-1', 'artist/ween', 'people/Joey', 'records', 'search?q=dylan&f=all', 'search?q=&f=never']
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp in (('phone', {'width': 390, 'height': 844}), ('desk', {'width': 1280, 'height': 900})):
        ctx = b.new_context(viewport=vp, device_scale_factor=1, is_mobile=name == 'phone', has_touch=name == 'phone')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append('console: ' + m.text))
        pg.route('**/*', lambda r: r.abort() if not (r.request.url.startswith(BASE)) else r.continue_())
        for path in PAGES:
            pg.goto(f'{BASE}/#/{path}')
            pg.wait_for_timeout(400)
            sw = pg.evaluate('document.documentElement.scrollWidth'); cw = pg.evaluate('document.documentElement.clientWidth')
            if sw > cw + 1: errs.append(f'{name} {path}: page wider than screen ({sw} > {cw})')
            fn = f"{OUT}/{name}-{(path or 'home').replace('/', '_').replace('?', '_').replace('&', '_').replace('=', '-')}.png"
            pg.screenshot(path=fn, full_page=True)
        ctx.close()
    b.close()
print('\n'.join(errs) or 'no errors')
