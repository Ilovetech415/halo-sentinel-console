// Regression tests for v12 (view layout): v10 security controls carried over, feature parity with v10, navigation, honest labels.
// Run: node --test tests/v12-regression.test.js
// Needs Playwright (preinstalled in this workspace). Nothing here writes to the v9 backup.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const V9 = path.join(ROOT, 'backups', 'halo-sentinel-console-v9.html');
const V10 = path.join(ROOT, 'halo-sentinel-console-v10.html');
const V12 = process.env.HALO_V12 || path.join(ROOT, 'halo-sentinel-console-v12.html');
const v9src = fs.readFileSync(V9, 'utf8'), v10src = fs.readFileSync(V10, 'utf8'), v12src = fs.readFileSync(V12, 'utf8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-v10-'));

/* ---------- payloads: every one would execute or restructure the page if inserted as HTML ---------- */
const P = {
  img: '<img src=x onerror="window.__pwned=1">',
  script: '<script>window.__pwned=2</script>',
  svg: '"><svg onload="window.__pwned=3">',
  attr: "x' onmouseover='window.__pwned=4' y='",
  href: '<a href="javascript:window.__pwned=5">click</a>',
  iframe: '<iframe srcdoc="<script>parent.__pwned=6</script>"></iframe>',
  click: '<b onclick="window.__pwned=7">bold</b>',
  style: '</td></tr></table><style>body{display:none}</style><base href="https://evil.example/">'
};
// Escape for a single-quoted JS string inside an inline <script>; '<\/' keeps the payload from closing the script element.
const jsq = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/<\//g, '<\\/');
const RAW = [
  ['allow tcp/3389 src=198.51.100.23 rule=rdp-admin-legacy', P.img],
  ['Windows security log', P.script],
  ["'Frankfurt, DE'", "'" + jsq(P.svg) + "'"],
  ['Singapore (hosting provider range)', P.href],
  ['Sarah Chen', P.iframe],
  ['Ransomware Activity', P.click],
  ["sev: 'Critical', time: '02:14 PM'", "sev: '" + jsq(P.attr) + "', time: '02:14 PM'"],
  ['The admin account was reached by password guessing over RDP', P.svg],
  ['41 failed RDP logins from 198.51.100.23 in 6 minutes', P.img],
  ['Finance server (compromised)', P.href],
  ['Isolate FIN-SRV from the network', P.style],
  ['a.reyes@example.com', P.click],
  ['First access key created by this user', P.script],
  ['Previous login: Manila, PH at 03:20 AM', P.img],
  ["city: 'Frankfurt'", "city: '" + jsq(P.iframe) + "'"]
];
const SUBS = RAW.map(([a, b]) => [a, (a.startsWith("'") || a.startsWith('sev:') || a.startsWith('city:')) ? b : jsq(b)]);
function poison(src) {
  return SUBS.reduce((s, [a, b]) => {
    assert.ok(s.includes(a), 'payload target missing from source: ' + a);
    return s.split(a).join(b);
  }, src);
}
function tmpFile(name, src) { const f = path.join(TMP, name); fs.writeFileSync(f, src); return f; }

/* ---------- driving the real UI ---------- */
async function drive(browser, file, opts = {}) {
  const T = opts.tolerant ? 1500 : 30000;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, offline: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(T);
  const m = { errors: [], requests: [], dialogs: [], csp: [], scans: [], seen: '' };
  page.on('pageerror', e => m.errors.push(e.message));
  page.on('console', c => { if (c.type() === 'error') m.errors.push(c.text()); });
  page.on('dialog', d => { m.dialogs.push(d.message()); d.dismiss(); });
  await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:')) r.continue(); else { m.requests.push(u); r.abort(); } });
  if (opts.showAll) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.view[hidden]{display:flex !important}'; document.head.appendChild(s); }));
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await page.goto('file://' + file);
  const scan = async tag => {
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({
      pwned: window.__pwned,
      onAttrs: [...document.querySelectorAll('*')].filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).length,
      bad: document.querySelectorAll('img,iframe,object,embed,a,link,base,video,audio').length,
      styles: document.querySelectorAll('style').length,
      scripts: document.querySelectorAll('script').length,
      jsUrls: [...document.querySelectorAll('[href],[src]')].filter(e => /^\s*javascript:/i.test(e.getAttribute('href') || e.getAttribute('src'))).length,
      bodyHidden: getComputedStyle(document.body).display === 'none'
    }));
    r.tag = tag; m.scans.push(r);
    m.seen += await page.evaluate(() => document.body.textContent);
  };
  await scan('load');
  const steps = async () => {
  const n = async sel => page.locator(sel).count();
  // every incident: open its investigation and its evidence, then every evidence filter
  for (let i = 0, c = await n('#rows tr'); i < c; i++) {
    await page.locator('#rows tr').nth(i).click();
    await page.locator('#rows tr').nth(i).locator('[data-ev]').click();
    for (let k = 0, f = await n('#fevBody .fchips .cn'); k < f; k++) await page.locator('#fevBody .fchips .cn').nth(k).click();
    await scan('incident ' + i);
  }
  // every topology host
  for (let i = 0, c = await n('.topo g.node'); i < c; i++) { await page.locator('.topo g.node').nth(i).dispatchEvent('click'); if (await n('#invAct')) await page.click('#invAct'); await scan('host ' + i); }
  // behavioral analytics rows and top users
  for (let i = 0, c = await n('#baRows tr'); i < c; i++) await page.locator('#baRows tr').nth(i).click();
  for (let i = 0, c = await n('#baTop button'); i < c; i++) await page.locator('#baTop button').nth(i).click();
  await scan('behavior');
  // globe regions and region filter
  for (let i = 0, c = await n('#glList .glr'); i < c; i++) await page.locator('#glList .glr').nth(i).click();
  if (await n('#rfClear')) await page.click('#rfClear');
  await scan('globe');
  // Ask H.A.L.O. and search with hostile text typed by a user
  for (const q of [P.img, P.script, P.attr, 'INC-2847', 'INC-2848', 'FIN-SRV', 'Show suspicious logins']) { await page.fill('#askq', q); await page.press('#askq', 'Enter'); }
  await page.fill('#q', P.img); await page.fill('#q', '');
  await page.click('#refresh');
  await scan('ask+refresh');
  };
  if (opts.tolerant) { try { await steps(); } catch (e) { m.errors.push('stopped: ' + e.message.split('\n')[0]); } await scan('final'); } else await steps();
  m.csp = await page.evaluate(() => window.__csp);
  m.text = m.seen;
  if (opts.parity) {
    // deterministic state, then capture the containers
    await page.reload();
    await page.locator('#rows tr').first().locator('[data-ev]').click();
    await page.locator('.topo g.node').nth(5).dispatchEvent('click');
    await page.locator('#baRows tr').nth(2).click();
    await page.locator('#glList .glr').nth(1).click();
    m.dom = await page.evaluate(() => Object.fromEntries(['rows', 'tl', 'invTitle', 'invSev', 'invBody', 'fevTitle', 'fevBody', 'baRows', 'baAlert', 'baTop', 'baActs', 'glList', 'glStats', 'rfBar', 'askl', 'count', 'jxU', 'jxD', 'jxA'].map(id => [id, document.getElementById(id).innerHTML])));
  }
  if (opts.paint) {
    m.canvas = await page.evaluate(() => { const c = document.getElementById('globe'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) k++; return k; });
    m.sections = await page.evaluate(() => ['globe', 'inv', 'fev', 'baRows', 'askl', 'rows', 'glList', 'topo', 'chart'].map(id => [id, !!(document.getElementById(id) || document.querySelector('.' + id))]));
  }
  await ctx.close();
  return m;
}

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const SHOW = { showAll: true };  // lets the v10-style harness reach every card; navigation itself is tested separately below
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); assert.ok(i >= 0 && j > i, 'markers missing: ' + a); return s.slice(i, j + b.length); };

/* ---------- static: v10 security controls are intact ---------- */
test('v12 makes no reference to an outside host and keeps the connect-src none policy', () => {
  const urls = (v12src.match(/https?:\/\/[^\s'"<>)]+/g) || []).filter(u => !/^http:\/\/(www\.w3\.org\/2000\/svg|127\.0\.0\.1:11434)$/.test(u));
  assert.deepStrictEqual(urls, []);
  assert.ok(!/<link\b/i.test(v12src) && !/googleapis|gstatic|@import/i.test(v12src));
  assert.ok(/Content-Security-Policy/.test(v12src) && /connect-src 'none'/.test(v12src) && /frame-src 'none'/.test(v12src) && /object-src 'none'/.test(v12src));
});
test('v12 has exactly one innerHTML write, inside the guarded put(), and no other unsafe primitive', () => {
  const hits = v12src.split('\n').filter(l => /\.innerHTML\s*=/.test(l));
  assert.strictEqual(hits.length, 1); assert.ok(/function put\(/.test(hits[0]));
  assert.ok(!/insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function|localStorage|sessionStorage|XMLHttpRequest|WebSocket|sendBeacon|fetch\(/.test(v12src));
  assert.ok(!/<form[^>]*action=/i.test(v12src));
});
test('v12 keeps the v10 core and escaping blocks byte-identical', () => {
  for (const [a, b] of [['/* CORE:START */', '/* CORE:END */'], ['/* SAFE:START */', '/* SAFE:END */']]) assert.strictEqual(between(v12src, a, b), between(v10src, a, b), a);
});
test('v12 script differs from v10 only by the documented changes', () => {
  const body = s => s.slice(s.indexOf('<script>') + 8, s.indexOf('</script>'));
  let a = body(v10src), b = body(v12src);
  a = a.split("document.getElementById('inv').scrollIntoView({ behavior: 'smooth', block: 'nearest' })").join("window.HaloNav.go('investigation')");
  a = a.split("document.getElementById(where === 'fev' ? 'fev' : 'inv').scrollIntoView({ behavior: 'smooth', block: 'nearest' });").join("window.HaloNav.go(where === 'fev' ? 'evidence' : 'investigation');");
  const anchor = "  drawGauge(90); drawRows(); drawTimeline(); drawChart('24', 0); sparks();";
  const k = b.indexOf(anchor); assert.ok(k > 0);
  assert.strictEqual(b.slice(0, k + anchor.length), a.slice(0, a.indexOf(anchor) + anchor.length), 'v10 script was altered beyond the navigation hooks');
});
test('every v10 element id still exists exactly once in v12, and ids are unique', () => {
  const ids = s => [...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
  const i10 = ids(v10src), i12 = ids(v12src);
  for (const id of new Set(i10)) assert.strictEqual(i12.filter(x => x === id).length, 1, 'id ' + id);
  assert.strictEqual(new Set(i12).size, i12.length, 'duplicate ids in v12');
});
test('v12 keeps every v10 demo label and adds none that claims live behavior', () => {
  assert.ok(/Demo mode\. All data is synthetic and nothing is connected to a live system/.test(v12src));
  for (const re of [/Demo mode: synthetic data, no live ingestion/, /hardcoded sample value, not calculated/, /Sample summary \(fixed text, no model\)/, /Randomize Sample Data/, /Queue for approval \(simulated\)/, /no audit record was written/, /Synthetic evidence/, /Sample data for design review\. No live feeds connected\./]) assert.ok(re.test(v12src), String(re));
  assert.ok(!/<span class="chip">live<\/span>/.test(v12src) && !/>Operational</.test(v12src) && !/Queued for analyst approval/.test(v12src));
});
test('trust page marks live ingestion, models, remediation and audit log as Planned, and none as Working', () => {
  const rows = [...v12src.matchAll(/<tr><th scope="row">([^<]+)<\/th><td><span class="st (\w+)">/g)].map(m => [m[1], m[2]]);
  assert.ok(rows.length >= 12);
  for (const key of ['Live ingestion', 'Model-written', 'Automated or approved remediation', 'Audit log and policy engine']) { const r = rows.find(x => x[0].startsWith(key)); assert.ok(r, key); assert.strictEqual(r[1], 'planned', key); }
  for (const key of ['Incident, event and host data', 'Health score', 'AI Investigation summary', 'Queue for approval']) assert.strictEqual(rows.find(x => x[0].startsWith(key))[1], 'simulated', key);
});

/* ---------- browser: security carried over ---------- */
test('v12: hostile event, evidence, IP, name and model text renders as inert text', async () => {
  const clean = await drive(browser, V12, SHOW);
  const m = await drive(browser, tmpFile('v12-poisoned.html', poison(v12src)), SHOW);
  const base = clean.scans[clean.scans.length - 1];
  for (const s of m.scans) {
    assert.strictEqual(s.pwned, undefined, 'script executed at ' + s.tag);
    assert.strictEqual(s.onAttrs, 0, 'event-handler attribute injected at ' + s.tag);
    assert.strictEqual(s.bad, base.bad, 'element injected at ' + s.tag);
    assert.strictEqual(s.styles, base.styles); assert.strictEqual(s.scripts, base.scripts);
    assert.strictEqual(s.jsUrls, 0); assert.strictEqual(s.bodyHidden, false);
  }
  assert.deepStrictEqual(m.dialogs, []); assert.deepStrictEqual(m.errors, []);
  for (const k of ['img', 'script', 'svg', 'href', 'iframe', 'click', 'style']) assert.ok(m.text.includes(P[k]), 'payload not shown as text: ' + k);
  assert.ok(m.text.includes(P.attr));
});
test('v12 works offline: no requests, no CSP violations, no errors', async () => {
  const m = await drive(browser, V12, SHOW);
  assert.deepStrictEqual(m.requests, []); assert.deepStrictEqual(m.csp, []); assert.deepStrictEqual(m.errors, []);
});
test('v12 renders the same card contents as v10 for clean data (all views shown)', async () => {
  const a = await drive(browser, V10, { parity: true }), b = await drive(browser, V12, { parity: true, ...SHOW });
  for (const k of Object.keys(a.dom)) assert.strictEqual(b.dom[k], a.dom[k], 'content differs in #' + k);
});

/* ---------- browser: navigation and layout ---------- */
const IDS = ['command-center', 'incidents', 'investigation', 'evidence', 'timeline', 'queue', 'topology', 'global', 'behavior', 'ask', 'trust', 'about'];
async function open(width = 1440, hash = '') {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, offline: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', c => { if (c.type() === 'error') errs.push(c.text()); });
  const reqs = []; await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) r.continue(); else { reqs.push(u); r.abort(); } });
  await page.goto('file://' + V12 + hash); await page.waitForTimeout(200);
  return { ctx, page, errs, reqs };
}
const visible = async page => { await page.waitForTimeout(120); return page.evaluate(() => [...document.querySelectorAll('.view')].filter(s => !s.hidden).map(s => s.getAttribute('data-view'))); };

test('12 views, one nav link each, exactly one view visible at a time', async () => {
  const { ctx, page, errs, reqs } = await open();
  assert.deepStrictEqual(await page.evaluate(() => HaloNav.views), IDS);
  assert.strictEqual(await page.locator('.ni').count(), 12);
  assert.deepStrictEqual(await visible(page), ['command-center']);
  for (const [n, id] of IDS.entries()) {
    await page.click(`.ni[data-view="${id}"]`);
    assert.deepStrictEqual(await visible(page), [id], id);
    assert.strictEqual(await page.locator('.ni[aria-current="page"]').count(), 1);
    assert.strictEqual(await page.getAttribute('.ni[aria-current="page"]', 'data-view'), id);
    assert.ok((await page.textContent('#viewTitle')).length > 3);
    assert.ok((await page.title()).includes('H.A.L.O. Sentinel v12'));
    if (n > 0) assert.ok(await page.evaluate(() => document.activeElement.id === 'viewTitle'), 'focus moves to the page heading: ' + id);
    assert.ok(await page.evaluate(i => document.getElementById('v-' + i).getBoundingClientRect().height > 40, id), 'view has content: ' + id);
  }
  assert.deepStrictEqual(errs, []); assert.deepStrictEqual(reqs, []); await ctx.close();
});
test('unknown or hostile hashes fall back to the Command Center, and back/forward work', async () => {
  for (const h of ['#/nope', '#/<img src=x onerror=window.__pwned=1>', '#/../etc', '#/constructor', '#/__proto__', '#', '#/INCIDENTS']) {
    const { ctx, page } = await open(1440, h);
    assert.deepStrictEqual(await visible(page), ['command-center'], h); assert.strictEqual(await page.evaluate(() => window.__pwned), undefined); await ctx.close();
  }
  const { ctx, page } = await open(1440, '#/incidents');
  assert.deepStrictEqual(await visible(page), ['incidents']);
  await page.click('.ni[data-view="timeline"]'); await page.goBack(); await page.waitForTimeout(100);
  assert.deepStrictEqual(await visible(page), ['incidents']);
  await page.goForward(); await page.waitForTimeout(100); assert.deepStrictEqual(await visible(page), ['timeline']); await ctx.close();
});
test('incident row opens Investigation; View evidence opens Evidence with its events', async () => {
  const { ctx, page } = await open(1440, '#/incidents');
  await page.locator('#rows tr').first().click();
  assert.deepStrictEqual(await visible(page), ['investigation']);
  assert.ok((await page.textContent('#invBody')).length > 40);
  await page.click('.ni[data-view="incidents"]');
  await page.locator('#rows tr').first().locator('[data-ev]').click();
  assert.deepStrictEqual(await visible(page), ['evidence']);
  assert.match(await page.textContent('#fevTitle'), /Forensic evidence: INC-/);
  assert.ok(await page.locator('#fevBody .evd').count() > 0);
  await ctx.close();
});
test('topology node, priority card and behavior "open" go to Investigation', async () => {
  const { ctx, page } = await open();
  await page.locator('#priList .pc').first().click();
  assert.deepStrictEqual(await visible(page), ['investigation']);
  await page.click('.ni[data-view="topology"]');
  await page.locator('.topo-big g.node').nth(6).dispatchEvent('click');
  assert.deepStrictEqual(await visible(page), ['investigation']);
  assert.match(await page.textContent('#invTitle'), /FIN-SRV|Investigation/);
  await ctx.close();
});
test('search typed on another view jumps to Incidents and filters', async () => {
  const { ctx, page } = await open(1440, '#/ask');
  await page.fill('#q', 'ransom');
  assert.deepStrictEqual(await visible(page), ['incidents']);
  assert.ok(await page.locator('#rows tr').count() >= 1);
  await ctx.close();
});
test('Ask H.A.L.O. still answers from sample evidence with citations, and calls no model', async () => {
  const { ctx, page, reqs } = await open(1440, '#/ask');
  await page.fill('#askq', 'Why is FIN-SRV flagged?'); await page.press('#askq', 'Enter');
  assert.ok(await page.locator('#askl .msg.a').count() >= 2);
  assert.ok(await page.locator('#askl .cites').count() >= 1, 'answer lists its evidence');
  assert.deepStrictEqual(reqs, []); await ctx.close();
});
test('response queue is simulation only', async () => {
  const { ctx, page, reqs } = await open(1440, '#/queue');
  const n = await page.locator('#queList .qr').count(); assert.ok(n >= 3);
  assert.ok((await page.textContent('#queList')).includes('Not queued. Simulation only.'));
  await page.locator('#queList .qr button').first().click();
  assert.match(await page.locator('#queList .qs').first().textContent(), /Nothing was saved or sent and no action executed/);
  assert.deepStrictEqual(reqs, []); await ctx.close();
});
test('globe paints when its view opens, and Randomize works from the About page', async () => {
  const { ctx, page } = await open(1440, '#/global'); await page.waitForTimeout(500);
  const k = await page.evaluate(() => { const c = document.getElementById('globe'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  assert.ok(k > 50000, 'globe painted: ' + k);
  await page.click('.ni[data-view="about"]'); await page.click('#refresh2'); await ctx.close();
});
for (const w of [1440, 1024, 768, 390]) test('no horizontal page overflow on any view at ' + w + 'px', async () => {
  const { ctx, page, errs } = await open(w);
  for (const id of IDS) {
    await page.evaluate(i => HaloNav.go(i), id); await page.waitForTimeout(120);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(o <= 1, id + ' overflows by ' + o + 'px at ' + w);
  }
  assert.deepStrictEqual(errs, []); await ctx.close();
});
test('at phone width the navigation becomes a horizontal bar and every link stays reachable', async () => {
  const { ctx, page } = await open(390);
  const r = await page.evaluate(() => { const s = document.querySelector('.side').getBoundingClientRect(), a = document.querySelectorAll('.ni'); return { h: s.height, w: s.width, y0: a[0].getBoundingClientRect().top, y11: a[11].getBoundingClientRect().top, scroll: document.querySelector('.side').scrollWidth > document.querySelector('.side').clientWidth }; });
  assert.ok(r.h < 80 && Math.abs(r.y0 - r.y11) < 4 && r.scroll, JSON.stringify(r));
  await ctx.close();
});
test('keyboard: nav links are focusable and Enter navigates', async () => {
  const { ctx, page } = await open();
  await page.focus('.ni[data-view="evidence"]'); await page.keyboard.press('Enter');
  assert.deepStrictEqual(await visible(page), ['evidence']); await ctx.close();
});

test('HaloNav.go ignores unknown view ids', async () => {
  const { ctx, page } = await open(1440, '#/incidents');
  await page.evaluate(() => { HaloNav.go('nope'); HaloNav.go('__proto__'); HaloNav.go('<b>'); });
  assert.strictEqual(await page.evaluate(() => location.hash), '#/incidents'); assert.deepStrictEqual(await visible(page), ['incidents']); await ctx.close();
});
test('each view shows its own heading and description', async () => {
  const { ctx, page } = await open();
  const seen = new Set();
  for (const id of IDS) { await page.evaluate(i => HaloNav.go(i), id); await page.waitForTimeout(80); seen.add(await page.textContent('#viewTitle')); assert.ok((await page.textContent('#viewDesc')).length > 20, id); }
  assert.strictEqual(seen.size, 12, [...seen].join(' | ')); await ctx.close();
});
