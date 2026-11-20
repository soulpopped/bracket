"""Open the search dropdown on phone and desktop, type, and screenshot the viewport."""
import sys
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp in (('phone', {'width': 390, 'height': 844}), ('desk', {'width': 1280, 'height': 900})):
        ctx = b.new_context(viewport=vp, is_mobile=name == 'phone', has_touch=name == 'phone')
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(BASE) else r.continue_())
        pg.goto(BASE + '/#/year/4'); pg.wait_for_timeout(500)
        if name == 'phone': pg.click('.tabbar [data-open-search]')
        else: pg.click('#sq')
        pg.keyboard.type('weyes'); pg.wait_for_timeout(400)
        pg.screenshot(path=f'{OUT}/{name}-dropdown.png')
        pg.click('#search-pills [data-f="never"]'); pg.wait_for_timeout(200)
        pg.fill('#sq', ''); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{name}-dropdown-never.png')
        pg.click('#search-results a.row-link >> nth=0'); pg.wait_for_timeout(300)
        q = pg.input_value('#sq')
        pg.screenshot(path=f'{OUT}/{name}-dropdown-drill.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        print(name, 'drill query:', q, 'panel hidden after Esc:', pg.is_hidden('#search'), 'url:', pg.url)
        ctx.close()
    b.close()
print('\n'.join(errs) or 'no errors')
