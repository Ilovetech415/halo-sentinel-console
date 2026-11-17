// Negative and audit tests for HaloCore and the whole console file.
// These assert the behavior a careful reviewer would expect. A failing test here is a confirmed
// defect or missing control in the current code, not a test bug. The code under test is NOT modified.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = process.env.HALO_HTML || path.join(ROOT, 'halo-sentinel-console.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const landing = fs.readFileSync(path.join(ROOT, 'halo-landing.html'), 'utf8');
const coreSrc = /\/\* CORE:START \*\/([\s\S]*?)\/\* CORE:END \*\//.exec(html)[1];
function load() { const ctx = vm.createContext({}); vm.runInContext(coreSrc + '\nthis.HaloCore = HaloCore;', ctx); return ctx.HaloCore; }
function attempt(fn) { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e }; } }
const arr = (x) => Array.from(x);

// ---------- A. malformed timestamps ----------
const BAD_TS = [
  ['empty string', ''], ['date only', '2026-10-24'], ['no timezone', '2026-10-24T03:42:01'], ['garbage text', 'not a date'],
  ['month 13', '2026-13-01T00:00:00Z'], ['day 32', '2026-10-32T00:00:00Z'], ['Feb 30', '2026-02-30T10:00:00Z'],
  ['hour 25', '2026-10-24T25:00:00Z'], ['offset +25:00', '2026-10-24T03:42:01+25:00'], ['offset minutes 75', '2026-10-24T03:42:01+08:75'],
  ['offset hours only', '2026-10-24T03:42:01+08'], ['null', null], ['undefined', undefined], ['a number', 1729740000], ['an object', {}],
  ['an array holding a valid string', ['2026-10-24T03:42:01Z']], ['padded with spaces', ' 2026-10-24T03:42:01Z '],
  ['lowercase z', '2026-10-24T03:42:01z'], ['space instead of T', '2026-10-24 03:42:01Z'], ['trailing text', '2026-10-24T03:42:01Z garbage']
];
BAD_TS.forEach(([label, v]) => test('A: toUtc rejects ' + label, () => {
  const C = load();
  const r = attempt(() => C.toUtc(v));
  assert.ok(!r.ok, 'accepted and returned ' + JSON.stringify(r.value && r.value.utc));
}));
test('A: toUtc still accepts valid offsets and Z', () => {
  const C = load();
  ['2026-10-24T03:42:01Z', '2026-10-24T11:42:01+08:00', '2026-10-23T23:42:01-04:00', '2026-10-24T03:42:01+00:00'].forEach(t => assert.strictEqual(C.toUtc(t).utc, '2026-10-24T03:42:01Z'));
});

// ---------- B. invalid geolocation coordinates ----------
const BAD_GEO = [['lat 91', 91, 0], ['lat -91', -91, 0], ['lon 181', 0, 181], ['lon -181', 0, -181], ['NaN lat', NaN, 0], ['NaN lon', 0, NaN],
  ['Infinity', Infinity, 0], ['numeric strings', '50.1', '8.7'], ['nulls', null, null], ['undefined lat', undefined, 5]];
BAD_GEO.forEach(([label, la, lo]) => test('B: haversineKm rejects ' + label, () => {
  const C = load();
  const r = attempt(() => C.haversineKm({ lat: la, lon: lo }, { lat: 0, lon: 0 }));
  assert.ok(!r.ok || !Number.isFinite(r.value), 'returned a finite distance: ' + r.value);
}));
test('B: geoTimeline does not silently emit a leg with an invalid distance', () => {
  const C = load();
  const mk = (id, ts, geo) => ({ id, type: 'authentication', host: null, source: 't', ts, desc: 'x', actor: 'u', geo, u: C.toUtc(ts) });
  const r = attempt(() => C.geoTimeline([mk('EVT-A', '2026-10-24T03:00:00Z', { lat: 14.6, lon: 121 }), mk('EVT-B', '2026-10-24T03:10:00Z', { lat: NaN, lon: 8.7 })]));
  assert.ok(!r.ok || r.value.legs.every(l => Number.isFinite(l.km) && Number.isFinite(l.kmh)), 'emitted a leg with non-finite values and flag=false');
});
test('B: every coordinate in the dataset is in range and has a known method', () => {
  const C = load();
  C.EVENTS.filter(e => e.geo).forEach(e => {
    assert.ok(e.geo.lat >= -90 && e.geo.lat <= 90 && e.geo.lon >= -180 && e.geo.lon <= 180, e.id);
    assert.ok(['ip', 'badge'].includes(e.geo.method), e.id + ' method ' + e.geo.method);
  });
});

// ---------- C. evidence integrity and references ----------
test('C: an incident that lists a missing evidence ID is rejected or reported', () => {
  const C = load(); C.INCIDENTS[1].evidenceIds.push('EVT-9999');
  const r = attempt(() => C.summarize('INC-2848'));
  assert.ok(!r.ok || (r.value.missing && arr(r.value.missing).includes('EVT-9999')), 'silently dropped EVT-9999 and summarized the rest');
});
test('C: a duplicate event ID is rejected instead of resolving to the first match', () => {
  const C = load(); const dup = Object.assign({}, C.EVENTS[0], { desc: 'tampered copy' });
  C.EVENTS.push(dup);
  const r = attempt(() => C.eventById('EVT-1001'));
  assert.ok(!r.ok || r.value === null, 'resolved EVT-1001 to: ' + (r.value && r.value.desc));
});
test('C: the same evidence ID listed twice in one incident is not double counted', () => {
  const C = load(); C.INCIDENTS[0].evidenceIds.push('EVT-1004');
  const r = attempt(() => C.eventsFor('INC-2847'));
  assert.ok(!r.ok || r.value.length === 7, 'returned ' + (r.ok && r.value.length) + ' events for 7 distinct pieces of evidence');
});
test('C: evidence owned by another incident cannot be quietly cited', () => {
  const C = load(); C.INCIDENTS[1].evidenceIds.push('EVT-1004'); // EVT-1004 belongs to INC-2847
  const r = attempt(() => C.summarize('INC-2848'));
  assert.ok(!r.ok || !arr(r.value.refs).includes('EVT-1004') || (r.value.foreign && arr(r.value.foreign).includes('EVT-1004')), 'INC-2848 summary cites EVT-1004 with no warning');
});
test('C: a hypothesis cannot cite evidence that is not part of its own incident', () => {
  const C = load(); C.INCIDENTS[1].hypothesis.basis = ['EVT-1004'];
  const r = attempt(() => C.summarize('INC-2848'));
  assert.ok(!r.ok || !arr(r.value.refs).includes('EVT-1004'), 'hypothesis cited EVT-1004 from another incident');
});
test('C: an incident with no evidence does not crash and makes no claims', () => {
  const C = load(); C.INCIDENTS[3].evidenceIds = [];
  const r = attempt(() => C.summarize('INC-2850'));
  if (r.ok) assert.ok(!/First observed/.test(r.value.text), 'made claims with no evidence');
  else assert.notStrictEqual(r.error.name, 'TypeError', 'crashed with an unhandled TypeError: ' + r.error.message);
});
test('C (real data): every cited ID belongs to the incident being summarized', () => {
  const C = load();
  C.INCIDENTS.forEach(i => {
    const s = C.summarize(i.id), own = arr(i.evidenceIds);
    arr(s.refs).forEach(r => assert.ok(own.includes(r), i.id + ' cites ' + r));
    (s.text.match(/EVT-\d+/g) || []).forEach(r => assert.ok(own.includes(r), i.id + ' text cites ' + r));
    arr(i.hypothesis.basis).forEach(r => assert.ok(own.includes(r), i.id + ' hypothesis basis ' + r));
  });
});
test('C (real data): no evidence event is shared between two incidents', () => {
  const C = load(); const seen = {};
  C.INCIDENTS.forEach(i => arr(i.evidenceIds).forEach(id => { assert.ok(!seen[id], id + ' is in ' + seen[id] + ' and ' + i.id); seen[id] = i.id; }));
});
test('C (real data): every event is referenced by an incident, so nothing is orphaned', () => {
  const C = load(); const used = new Set(); C.INCIDENTS.forEach(i => arr(i.evidenceIds).forEach(x => used.add(x)));
  C.EVENTS.forEach(e => assert.ok(used.has(e.id), e.id + ' is not part of any incident'));
});
test('C (real data): summary statements match the underlying events', () => {
  const C = load();
  C.INCIDENTS.forEach(i => {
    const ev = C.eventsFor(i.id), s = C.summarize(i.id);
    assert.strictEqual(Number(/^(\d+) events/.exec(s.observed[0].text)[1]), ev.length, i.id + ' event count');
    assert.deepStrictEqual(arr(s.observed[0].refs), arr(ev.map(e => e.id)));
    assert.ok(s.observed[1].text.includes(ev[0].desc) && s.observed[1].refs[0] === ev[0].id, i.id + ' first observed');
    assert.ok(s.observed[2].text.includes(ev[ev.length - 1].desc) && s.observed[2].refs[0] === ev[ev.length - 1].id, i.id + ' last observed');
  });
});
test('C (real data): hypothesis text is marked as unconfirmed in the output', () => {
  const C = load(); C.INCIDENTS.forEach(i => assert.ok(/Hypothesis \(unconfirmed\)/.test(C.summarize(i.id).text)));
});

// ---------- D. impossible-travel detector ----------
const MNL = { lat: 14.6, lon: 121.0 }, FRA = { lat: 50.11, lon: 8.68 }, SIN = { lat: 1.35, lon: 103.82 }, BER = { lat: 52.52, lon: 13.4 }, POT = { lat: 52.39, lon: 13.06 };
function evt(C, id, ts, actor, geo, method) { return { id, type: 'authentication', host: null, source: 't', ts, desc: 'x', actor, geo: Object.assign({ place: 'p', method: method || 'ip' }, geo), u: C.toUtc(ts) }; }
test('D: input order does not change the result (out-of-order events)', () => {
  const C = load();
  const a = evt(C, 'E1', '2026-10-24T03:00:00Z', 'u', MNL, 'badge'), b = evt(C, 'E2', '2026-10-24T03:28:00Z', 'u', FRA), c = evt(C, 'E3', '2026-10-24T06:00:00Z', 'u', SIN);
  const sorted = JSON.stringify(C.geoTimeline([a, b, c]).legs);
  [[c, b, a], [b, a, c], [c, a, b]].forEach(o => assert.strictEqual(JSON.stringify(C.geoTimeline(o).legs), sorted));
  assert.ok(JSON.parse(sorted).length === 2);
});
test('D: events at the same instant in different continents are flagged', () => {
  const C = load();
  const r = C.geoTimeline([evt(C, 'E1', '2026-10-24T03:00:00Z', 'u', MNL, 'badge'), evt(C, 'E2', '2026-10-24T03:00:00Z', 'u', FRA)]);
  assert.ok(r.legs.length === 1 && r.legs[0].flag === true, 'same-instant distant events were not flagged: ' + JSON.stringify(r.legs));
});
test('D: plausible travel is not flagged (Manila to Singapore in 10 hours)', () => {
  const C = load();
  const r = C.geoTimeline([evt(C, 'E1', '2026-10-24T00:00:00Z', 'u', MNL, 'badge'), evt(C, 'E2', '2026-10-24T10:00:00Z', 'u', SIN, 'badge')]);
  assert.strictEqual(r.legs[0].flag, false);
});
test('D: very short distances are not flagged even when fast (Berlin to Potsdam in 1 minute)', () => {
  const C = load();
  const r = C.geoTimeline([evt(C, 'E1', '2026-10-24T03:00:00Z', 'u', BER), evt(C, 'E2', '2026-10-24T03:01:00Z', 'u', POT)]);
  assert.strictEqual(r.legs[0].flag, false);
});
test('D: different actors are never compared', () => {
  const C = load();
  assert.strictEqual(C.geoTimeline([evt(C, 'E1', '2026-10-24T03:00:00Z', 'a', MNL, 'badge'), evt(C, 'E2', '2026-10-24T03:01:00Z', 'b', FRA)]).legs.length, 0);
});
test('D: events without an actor produce no legs', () => {
  const C = load();
  assert.strictEqual(C.geoTimeline([evt(C, 'E1', '2026-10-24T03:00:00Z', undefined, MNL), evt(C, 'E2', '2026-10-24T03:01:00Z', undefined, FRA)]).legs.length, 0);
});
test('D: approximate flag follows the evidence quality (ip/ip, ip/badge, badge/badge)', () => {
  const C = load(); const T1 = '2026-10-24T03:00:00Z', T2 = '2026-10-24T03:20:00Z';
  const leg = (m1, m2) => C.geoTimeline([evt(C, 'E1', T1, 'u', MNL, m1), evt(C, 'E2', T2, 'u', FRA, m2)]).legs[0];
  assert.strictEqual(leg('ip', 'ip').approximate, true);
  assert.strictEqual(leg('badge', 'ip').approximate, true);
  assert.strictEqual(leg('ip', 'badge').approximate, true);
  assert.strictEqual(leg('badge', 'badge').approximate, false);
});
test('D: a flagged leg built from IP geolocation never claims to be verified', () => {
  const C = load();
  const l = C.geoTimeline([evt(C, 'E1', '2026-10-24T03:00:00Z', 'u', MNL), evt(C, 'E2', '2026-10-24T03:05:00Z', 'u', FRA)]).legs[0];
  assert.strictEqual(l.flag, true); assert.strictEqual(l.approximate, true);
  assert.ok(!('verified' in l) && !('confirmed' in l));
});
test('D: a VPN-style IP/IP leg carries a machine-readable certainty below "high"', () => {
  const C = load();
  const l = C.geoTimeline([evt(C, 'E1', '2026-10-24T03:00:00Z', 'u', MNL), evt(C, 'E2', '2026-10-24T03:05:00Z', 'u', FRA)]).legs[0];
  assert.ok(['low', 'medium'].includes(l.certainty), 'leg exposes only a boolean flag, certainty=' + l.certainty);
});
test('D: the evidence panel hedges the travel finding (VPN, proxy, geolocation error)', () => {
  assert.ok(html.includes('Not physically plausible if both locations are right'));
  assert.ok(/VPN, proxy or IP geolocation error/.test(html));
  assert.ok(html.includes('Includes approximate IP geolocation'));
});
test('D: the Behavioral Analytics section also states that location is approximate', () => {
  const alertTpl = /document\.getElementById\('baAlert'\)\.innerHTML = `([\s\S]*?)`;/.exec(html)[1];
  assert.ok(/approximate/i.test(alertTpl), 'the anomaly alert shows "Location" and an Impossible travel score with no approximate-geolocation caveat');
});
test('D: Behavioral Analytics evidence IDs resolve in the shared evidence model', () => {
  const C = load(); const ids = Array.from(new Set(html.match(/EVT-22\d\d/g) || []));
  assert.ok(ids.length > 0);
  ids.forEach(id => assert.ok(C.eventById(id), id + ' is shown in Behavioral Analytics but does not exist in HaloCore'));
});

// ---------- E. synthetic data must not be mistaken for live telemetry ----------
test('E: every IPv4 address in the file is a documentation or loopback address', () => {
  const ips = html.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  ips.forEach(ip => assert.ok(/^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|127\.0\.0\.1$)/.test(ip), 'real-looking address ' + ip));
});
test('E: every email address uses the reserved example.com domain', () => {
  (html.match(/[\w.+-]+@[\w.-]+\.\w+/g) || []).forEach(m => assert.ok(/@example\.com$/.test(m), m));
});
test('E: every hostname in event data is under a reserved example domain', () => {
  const C = load();
  C.EVENTS.forEach(e => (e.desc.match(/[a-z0-9-]+(\.[a-z0-9-]+)+\.(com|net|org)\b/g) || []).forEach(h => assert.ok(/\.example\.(com|net|org)$/.test(h) || /^example\.(com|net|org)$/.test(h), e.id + ' ' + h)));
});
test('E: every event carries an explicit synthetic marker', () => {
  const C = load(); C.EVENTS.forEach(e => assert.strictEqual(e.synthetic, true, e.id + ' has no synthetic flag; it is indistinguishable from real telemetry once exported'));
});
test('E: a demo-mode banner is visible at the top of the dashboard, not only in sections or the footer', () => {
  const i = html.indexOf('<div class="main">'); assert.ok(i > 0);
  assert.ok(/demo mode|synthetic/i.test(html.slice(i, i + 2500)), 'no demo/synthetic notice in the first screen of the dashboard');
});
test('E: nothing in the UI is labeled "live"', () => {
  assert.ok(!/>\s*live\s*</i.test(html), 'found a "live" label on simulated data');
});
test('E: the AI Investigation card is labeled as simulated sample text', () => {
  assert.ok(/AI Investigation[\s\S]{0,500}(simulated|sample|synthetic|demo)/i.test(html), 'static text is presented under an AI label with no sample/simulated marker');
});
test('E: the Refresh control does not imply it fetches live data', () => {
  const m = /id="refresh">([^<]*)</.exec(html); assert.ok(m);
  assert.ok(/sample|simulat|shuffle|demo/i.test(m[1]), 'button reads "' + m[1] + '" but only randomizes numbers');
});
test('E: "Queue for approval" never executes anything', () => {
  assert.ok(html.includes('No action executed'));
  assert.ok(!/execute|remediat\w*\(|isolateHost\(|block\w*\(/.test(html.replace(/Real remediation is disabled|No action executed|no action executed|remediation is disabled/gi, '')), 'unexpected action-like code');
});

// ---------- F. network and unsafe rendering, whole file ----------
const NET = /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|serviceWorker|\bimport\(|window\.open|<iframe|<embed|<object|@import|navigator\.mediaDevices|document\.cookie|localStorage|sessionStorage|indexedDB|eval\(|new Function|document\.write/;
[['console', html], ['landing', landing]].forEach(([n, src]) => {
  test('F: ' + n + ' contains no network-capable or storage APIs anywhere in the file', () => { assert.ok(!NET.test(src), 'matched: ' + NET.exec(src)); });
  test('F: ' + n + ' loads no external resources', () => {
    const urls = (src.match(/https?:\/\/[^\s"'`)<>]+/g) || []).filter(u => u !== 'http://www.w3.org/2000/svg' && !/^http:\/\/127\.0\.0\.1:11434/.test(u));
    assert.deepStrictEqual(urls, [], 'external URLs: ' + urls.join(', '));
  });
  test('F: ' + n + ' declares a Content-Security-Policy that blocks outbound connections', () => {
    assert.ok(/http-equiv="Content-Security-Policy"[^>]*connect-src 'none'/i.test(src) || /http-equiv='Content-Security-Policy'[^>]*connect-src 'none'/i.test(src), 'no CSP meta tag');
  });
});
test('F: the Ollama adapter endpoint is loopback only', () => {
  const C = load(); assert.ok(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(C.OllamaAdapter.endpoint));
});
test('F: event-derived text is HTML-escaped before it is put into innerHTML', () => {
  // v10: html`` escapes every interpolation by default and put() is the only innerHTML write (behavioral proof: tests/v10-security.test.js)
  const writes = html.split('\n').filter(l => /\.innerHTML\s*=/.test(l));
  assert.ok(/function (esc|escapeHtml)\b/.test(html) && /function html\(/.test(html) && writes.length === 1 && /function put\(/.test(writes[0]), 'event fields reach innerHTML without the escaping template helper');
});
test('F: user-typed text is never inserted as HTML', () => {
  assert.ok(/p\.textContent = text/.test(html), 'Ask H.A.L.O. echoes input with textContent');
  assert.ok(!/innerHTML[^;]*askQ\.value/.test(html));
});
