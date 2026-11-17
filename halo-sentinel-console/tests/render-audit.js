// Browser audit (needs Playwright). Usage: node tests/render-audit.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const out = {};
  async function requests(file) {
    const p = await b.newPage(); const seen = [];
    await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue(); seen.push(r.request().resourceType() + ' ' + u); r.abort(); });
    await p.goto('file://' + file); await p.waitForTimeout(600);
    // exercise the interactive features that might phone home
    if (file.includes('console')) {
      await p.locator('#glList .glr').nth(1).click(); await p.locator('#rows tr').nth(0).locator('[data-ev]').click();
      await p.fill('#askq', 'Why is FIN-SRV flagged?'); await p.press('#askq', 'Enter'); await p.click('#refresh');
      await p.locator('#invBody #invAct').click().catch(() => {}); await p.waitForTimeout(300);
    }
    await p.close(); return seen;
  }
  out.consoleRequests = await requests(path.join(ROOT, 'halo-sentinel-console.html'));
  out.landingRequests = await requests(path.join(ROOT, 'halo-landing.html'));

  // XSS probe on a temporary copy: plant attacker-controlled text in an event description.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-xss-')); const f = path.join(tmp, 'c.html');
  let src = fs.readFileSync(path.join(ROOT, 'halo-sentinel-console.html'), 'utf8');
  const needle = "desc: 'service-install name=svchelp path=C:/Temp'";
  if (src.split(needle).length !== 2) throw new Error('probe target not found');
  fs.writeFileSync(f, src.replace(needle, "desc: '<img src=x onerror=window.__xss=1>'"));
  const p = await b.newPage(); await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await p.goto('file://' + f); await p.waitForTimeout(500);
  await p.locator('#rows tr').nth(0).locator('[data-ev]').click(); await p.waitForTimeout(400);
  out.xssViaEventText_scriptRan = await p.evaluate(() => window.__xss === 1);
  out.xssViaEventText_imgInDom = await p.locator('#fevBody img').count();
  // user-typed input probes (should be inert)
  await p.fill('#askq', '<img src=x onerror=window.__xss2=1>'); await p.press('#askq', 'Enter');
  await p.fill('#q', '<img src=x onerror=window.__xss3=1>'); await p.waitForTimeout(300);
  out.userInputProbes_scriptRan = await p.evaluate(() => window.__xss2 === 1 || window.__xss3 === 1);
  await p.close();
  console.log(JSON.stringify(out, null, 1)); await b.close(); fs.rmSync(tmp, { recursive: true, force: true });
})();
