// Regression tests for the v10 hardening: XSS, outside requests, parity with v9, honest labels.
// Run: node --test tests/v10-security.test.js
// Needs Playwright (preinstalled in this workspace). Nothing here writes to the v9 backup.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const V9 = path.join(ROOT, 'backups', 'halo-sentinel-console-v9.html');
const V10 = process.env.HALO_V10 || path.join(ROOT, 'halo-sentinel-console-v10.html');
const v9src = fs.readFileSync(V9, 'utf8'), v10src = fs.readFileSync(V10, 'utf8');
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

/* ---------- static checks ---------- */
test('v10 makes no reference to an outside host', () => {
  const urls = (v10src.match(/https?:\/\/[^\s'"<>)]+/g) || []).filter(u => !/^http:\/\/(www\.w3\.org\/2000\/svg|127\.0\.0\.1:11434)$/.test(u));
  assert.deepStrictEqual(urls, []);
  assert.ok(!/<link\b/i.test(v10src), 'no <link> elements');
  assert.ok(!/googleapis|gstatic|@import/i.test(v10src));
  assert.ok(/Content-Security-Policy/.test(v10src) && /connect-src 'none'/.test(v10src));
});
test('v10 has exactly one innerHTML write, inside the guarded put()', () => {
  const hits = v10src.split('\n').filter(l => /\.innerHTML\s*=/.test(l));
  assert.strictEqual(hits.length, 1);
  assert.ok(/function put\(/.test(hits[0]));
  assert.ok(!/insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/.test(v10src));
});
test('html`` escapes by default and put() refuses plain strings', () => {
  const block = /\/\* SAFE:START \*\/([\s\S]*?)\/\* SAFE:END \*\//.exec(v10src)[1];
  const sb = {}; vm.createContext(sb); vm.runInContext(block + ';this.html=html;this.put=put;this.esc=esc;', sb);
  const out = s => sb.html`<td>${s}</td>`.s;
  assert.strictEqual(out('<img src=x onerror=1>'), '<td>&#60;img src=x onerror=1&#62;</td>');
  assert.strictEqual(out('"x" \'y\' `z` & <'), '<td>&#34;x&#34; &#39;y&#39; &#96;z&#96; &#38; &#60;</td>');
  assert.strictEqual(sb.html`<i>${[sb.html`<b>${'<'}</b>`, '<u>']}</i>`.s, '<i><b>&#60;</b>&#60;u&#62;</i>');
  assert.strictEqual(out(null), '<td></td>'); assert.strictEqual(out(undefined), '<td></td>'); assert.strictEqual(out(42), '<td>42</td>');
  assert.throws(() => sb.put({}, '<b>raw</b>'), /Refusing/);
  assert.throws(() => sb.put({}, { s: '<b>forged</b>' }), /Refusing/);
});

/* ---------- control: the same payloads really do run in v9, so the harness can detect a failure ---------- */
test('control: payloads execute in the original v9 (proves the harness is sensitive)', async () => {
  const m = await drive(browser, tmpFile('v9-poisoned.html', poison(v9src)), { tolerant: true });
  const last = m.scans[m.scans.length - 1];
  assert.ok(last.pwned !== undefined || last.onAttrs > 0 || last.bad > 0 || m.dialogs.length > 0, 'v9 should be exploitable: ' + JSON.stringify(last));
});

/* ---------- v10 under attack ---------- */
test('v10: hostile event, evidence, IP, name and model text renders as inert text', async () => {
  const clean = await drive(browser, V10);
  const m = await drive(browser, tmpFile('v10-poisoned.html', poison(v10src)));
  const base = clean.scans[clean.scans.length - 1];
  for (const s of m.scans) {
    assert.strictEqual(s.pwned, undefined, 'script executed at ' + s.tag);
    assert.strictEqual(s.onAttrs, 0, 'event-handler attribute injected at ' + s.tag);
    assert.strictEqual(s.bad, base.bad, 'element injected at ' + s.tag);
    assert.strictEqual(s.styles, base.styles, 'style injected at ' + s.tag);
    assert.strictEqual(s.scripts, base.scripts, 'script element injected at ' + s.tag);
    assert.strictEqual(s.jsUrls, 0); assert.strictEqual(s.bodyHidden, false);
  }
  assert.deepStrictEqual(m.dialogs, []);
  assert.deepStrictEqual(m.errors, []);
  // the payload text is shown literally rather than dropped
  for (const k of ['img', 'script', 'svg', 'href', 'iframe', 'click', 'style']) assert.ok(m.text.includes(P[k]), 'payload not shown as text: ' + k);
  assert.ok(m.text.includes(P.attr), 'attribute-breaking payload not shown as text');
});

/* ---------- offline, labels, and parity ---------- */
test('v10 works offline: no requests, no CSP violations, no errors, globe paints, every section renders', async () => {
  const m = await drive(browser, V10, { paint: true });
  assert.deepStrictEqual(m.requests, []);
  assert.deepStrictEqual(m.csp, []);
  assert.deepStrictEqual(m.errors, []);
  assert.ok(m.canvas > 50000, 'globe canvas painted: ' + m.canvas);
  assert.ok(m.sections.every(x => x[1]), 'sections: ' + JSON.stringify(m.sections));
});
test('v9 control: the original did request an outside host', async () => {
  const m = await drive(browser, V9);
  assert.ok(m.requests.some(u => /fonts\.googleapis\.com/.test(u)), JSON.stringify(m.requests));
});
test('v10 labels synthetic data, the hardcoded confidence and the simulated action', () => {
  assert.ok(/Demo mode: all data is synthetic/.test(v10src));
  assert.ok(/hardcoded sample value, not calculated/.test(v10src));
  assert.ok(/Sample summary \(fixed text, no model\)/.test(v10src));
  assert.ok(/Randomize Sample Data/.test(v10src));
  assert.ok(!/<span class="chip">live<\/span>/.test(v10src));
  assert.ok(!/>Operational</.test(v10src));
  assert.ok(/Queue for approval \(simulated\)/.test(v10src));
  assert.ok(/no audit record was written/.test(v10src));
  assert.ok(!/Queued for analyst approval/.test(v10src));
  assert.ok(/Audit log \(not connected in this demo\)/.test(v10src));
});
test('v10 renders the same DOM as v9 for clean data, except the intentional label changes', async () => {
  const a = await drive(browser, V9, { parity: true }), b = await drive(browser, V10, { parity: true });
  const norm = (k, s) => {
    s = s.split('Queue for approval: ').join('Queue for approval (simulated): ');
    s = s.split('Recommendation only. Real remediation is disabled in this prototype.').join('Simulated action. Recommendation only: nothing is saved or sent, and real remediation is disabled in this prototype.');
    s = s.split('Rule-based: weighted flags, capped at 100. No model.').join('Rule-based: weighted flags, capped at 100. No model. Scores are computed from fixed weights on synthetic events.');
    return s;
  };
  for (const k of Object.keys(a.dom)) assert.strictEqual(b.dom[k], norm(k, a.dom[k]), 'DOM differs in #' + k);
});
