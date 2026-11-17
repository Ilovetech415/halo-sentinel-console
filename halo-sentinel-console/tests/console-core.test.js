const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(process.env.HALO_HTML || path.join(__dirname, '..', 'halo-sentinel-console.html'), 'utf8');
const m = /\/\* CORE:START \*\/([\s\S]*?)\/\* CORE:END \*\//.exec(html);
assert.ok(m, 'core block not found in the console file');
// No DOM, no fetch, no network globals: anything touching them would throw.
const ctx = vm.createContext({});
vm.runInContext(m[1] + '\nthis.HaloCore = HaloCore;', ctx);
const C = ctx.HaloCore;

test('timestamps normalize to UTC and keep the original and its offset', () => {
  const a = C.toUtc('2026-10-24T11:48:07+08:00');
  assert.strictEqual(a.utc, '2026-10-24T03:48:07Z');
  assert.strictEqual(a.original, '2026-10-24T11:48:07+08:00');
  assert.strictEqual(a.offsetMinutes, 480);
  assert.strictEqual(C.toUtc('2026-10-24T08:40:05-04:00').utc, '2026-10-24T12:40:05Z');
  assert.strictEqual(C.toUtc('2026-10-24T07:12:10+02:00').utc, '2026-10-24T05:12:10Z');
  assert.strictEqual(C.toUtc('2026-10-24T03:42:01Z').offsetMinutes, 0);
  assert.strictEqual(C.offLabel(480), 'UTC+08:00');
  assert.strictEqual(C.offLabel(-240), 'UTC-04:00');
});

test('timestamps without a timezone are rejected', () => {
  assert.throws(() => C.toUtc('2026-10-24T03:42:01'), /no timezone/);
  assert.throws(() => C.toUtc('not-a-date+08:00'), /Invalid/);
});

test('every event has a unique ID, a normalized UTC time and its original timestamp', () => {
  const ids = C.EVENTS.map(e => e.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  C.EVENTS.forEach(e => { assert.ok(e.u.utc.endsWith('Z')); assert.strictEqual(e.u.original, e.ts); });
});

test('region filter returns only incidents in that region', () => {
  for (const r of C.REGIONS) {
    const out = C.filterIncidents(C.INCIDENTS, r, '');
    assert.ok(out.length > 0, r + ' has sample incidents');
    out.forEach(i => assert.strictEqual(i.region, r));
  }
  assert.strictEqual(C.filterIncidents(C.INCIDENTS, null, '').length, C.INCIDENTS.length);
  assert.strictEqual(C.filterIncidents(C.INCIDENTS, 'Antarctica', '').length, 0);
});

test('region filter and search combine, and regions partition the list', () => {
  const emea = C.filterIncidents(C.INCIDENTS, 'EMEA', 'brute');
  assert.deepStrictEqual(Array.from(emea.map(i => i.id)), ['INC-2850']);
  assert.strictEqual(C.filterIncidents(C.INCIDENTS, 'Asia Pacific', 'brute').length, 0);
  const total = C.REGIONS.reduce((n, r) => n + C.filterIncidents(C.INCIDENTS, r, '').length, 0);
  assert.strictEqual(total, C.INCIDENTS.length);
});

test('incident navigation resolves to a host that exists in the attack graph', () => {
  C.INCIDENTS.forEach(i => {
    const nav = C.navigate(i.id);
    assert.strictEqual(nav.host, i.host);
    assert.ok(C.HOSTS.includes(nav.host), nav.host + ' is a known host');
    assert.ok(html.includes('>' + nav.host + '</text>'), nav.host + ' is drawn in the topology SVG');
    assert.ok(C.REGIONS.includes(nav.region));
  });
  assert.strictEqual(C.navigate('INC-0000'), null);
});

test('every incident evidence ID exists and events come back in UTC order', () => {
  C.INCIDENTS.forEach(i => {
    i.evidenceIds.forEach(id => assert.ok(C.eventById(id), id + ' exists'));
    const ev = C.eventsFor(i.id);
    assert.strictEqual(ev.length, i.evidenceIds.length);
    for (let k = 1; k < ev.length; k++) assert.ok(ev[k - 1].u.utcMs <= ev[k].u.utcMs);
  });
  assert.strictEqual(C.eventsFor('INC-0000').length, 0);
});

test('evidence type filter returns only that type', () => {
  const net = C.eventsFor('INC-2847', 'network');
  assert.ok(net.length > 0);
  net.forEach(e => assert.strictEqual(e.type, 'network'));
  assert.strictEqual(C.eventsFor('INC-2847', 'all').length, C.eventsFor('INC-2847').length);
});

test('summaries cite only real evidence IDs and every statement carries a reference', () => {
  C.INCIDENTS.forEach(i => {
    const s = C.summarize(i.id);
    s.observed.concat([s.hypothesis]).forEach(x => { assert.ok(x.refs.length > 0); x.refs.forEach(r => assert.ok(C.eventById(r), r)); });
    s.refs.forEach(r => assert.ok(i.evidenceIds.includes(r), r + ' belongs to ' + i.id));
    const cited = (s.text.match(/EVT-\d+/g) || []);
    cited.forEach(r => assert.ok(C.eventById(r), r));
    assert.ok(/Hypothesis \(unconfirmed\)/.test(s.text));
  });
  assert.strictEqual(C.summarize('INC-0000'), null);
});

test('IP geolocation is labeled approximate and never verified', () => {
  C.EVENTS.filter(e => e.geo && e.geo.method === 'ip').forEach(e => {
    const b = C.geoBadge(e);
    assert.strictEqual(b.kind, 'approximate');
    assert.ok(/Approximate/.test(b.label) && !/Verified/.test(b.label));
  });
  const badge = C.EVENTS.filter(e => e.geo && e.geo.method === 'badge');
  assert.ok(badge.length > 0);
  badge.forEach(e => assert.strictEqual(C.geoBadge(e).kind, 'verified'));
  assert.strictEqual(C.geoBadge(C.eventById('EVT-1004')), null);
});

test('distance calculation and impossible-travel detection', () => {
  const km = C.haversineKm({ lat: 14.6, lon: 121.0 }, { lat: 50.11, lon: 8.68 });
  assert.ok(km > 9000 && km < 11000, 'Manila to Frankfurt is about 10,000 km, got ' + km);
  assert.strictEqual(C.haversineKm({ lat: 1, lon: 1 }, { lat: 1, lon: 1 }), 0);
  const gt = C.geoTimeline(C.eventsFor('INC-2847'));
  assert.strictEqual(gt.legs.length, 1);
  assert.strictEqual(gt.legs[0].flag, true);
  assert.strictEqual(gt.legs[0].approximate, true);
  assert.strictEqual(gt.legs[0].from, 'EVT-1006');
  assert.strictEqual(gt.legs[0].to, 'EVT-1007');
  assert.strictEqual(C.geoTimeline(C.eventsFor('INC-2848')).legs.length, 0);
});

test('all incidents and evidence are marked synthetic in demo mode', () => {
  C.INCIDENTS.forEach(i => assert.strictEqual(i.demo, true));
  assert.ok(html.includes('Demo mode'));
  assert.ok(html.includes('do not represent a live attack'));
  assert.ok(!/live attack in progress/i.test(html));
});

test('the Ollama adapter is disabled by default and makes no network call', () => {
  assert.strictEqual(C.OllamaAdapter.enabled, false);
  assert.throws(() => C.OllamaAdapter.generate('hello'), /disabled/);
  assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket/.test(m[1]), 'core block has no network APIs');
});
