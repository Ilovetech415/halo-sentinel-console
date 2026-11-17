#!/usr/bin/env python3
"""Build halo-sentinel-console-v12.html from the unchanged v10 file.
v10 is only read. Every card, element id, style rule and script from v10 is reused; v12 adds a view shell, a hash router,
two small renderers (priority cards, simulated response queue), purple AI accents and responsive layout rules.
Each anchor below must match exactly once, so a changed v10 makes this fail loudly instead of producing a wrong page."""
import hashlib, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "halo-sentinel-console-v10.html")
OUT = os.path.join(ROOT, "halo-sentinel-console-v12.html")
V10_SHA = "a04a745801e361534fc1e96d081821ad41885f9a763ab275cb5e71af8425e0c6"

s = open(SRC, encoding="utf-8").read()
if hashlib.sha256(s.encode()).hexdigest() != V10_SHA:
    sys.exit("v10 does not match the expected hash; refusing to build")

def idx(a, start=0):
    assert s.count(a) == 1, ("anchor not unique", a[:50], s.count(a))
    return s.index(a, start)

def piece(a, b):
    i = idx(a); j = s.index(b, i + len(a)); return s[i:j]

def sub(text, old, new):
    assert text.count(old) == 1, ("replace target not unique", old[:60], text.count(old))
    return text.replace(old, new)

# ---- reused v10 pieces (byte-identical markup) ----
gauge = piece('<div class="card">\n          <div class="ct">Incident Health Score', '        <div class="card">\n          <div class="ct">AI Investigation')
ai = piece('<div class="card">\n          <div class="ct">AI Investigation', '      </div>\n\n      <div class="col">\n        <div class="card topo">')
topo = piece('<div class="card topo">', "        <div class='card inv'")
inv = piece("<div class='card inv' id='inv'>", "\n\n        <div class='card fev'")
fev = piece("<div class='card fev' id='fev'>", "\n\n        <div class=\"tiles\">")
tiles = piece('<div class="tiles">', '        <div class="card">\n          <div class="ct">Global Threat Radar')
radar = piece('<div class="card">\n          <div class="ct">Global Threat Radar', '      </div>\n\n      <div class="col c3">')
timeline = piece('<div class="card">\n          <div class="ct">Incident Timeline', '        <div class="card trend">')
trend = piece('<div class="card trend">', "<div class='card ask' id='ask'>")
ask = piece("<div class='card ask' id='ask'>", "\n        </div>\n      </div>\n    </div>\n\n    <section class='gl'") + "\n        </div>"
globe = piece("<section class='gl' aria-labelledby='glH'>", "    <section class='ba'") 
behav = piece("<section class='ba' aria-labelledby='baH'>", '    <div class="foot">')
foot = piece('<div class="foot">', '  </div>\n</div>\n</div>\n\n<script>')
bar_html = piece('<div class="bar">', '    <div class="head">')
refresh = '<button class="btn teal" type="button" title="Generates new random sample numbers. It does not fetch any data." id="refresh">Randomize Sample Data</button>'
assert refresh in s

# compact topology for the Command Center: same drawing, smaller; no duplicate ids exist inside the svg
topo_compact = topo.replace('<div class="card topo">', '<div class="card topo topo-mini">', 1)

ICON = {
 "cc": '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
 "inc": '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
 "inv": '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>',
 "ev": '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>',
 "tl": '<path d="M5 5v14"/><circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="13" r="1.6"/><path d="M10 7h9M10 13h6M10 18h8"/>',
 "net": '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 11l3.5-3.5M14 7.5L17.5 11M17 13l-3.5 3.5M10.5 16.5L7 13"/>',
 "glo": '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
 "beh": '<path d="M4 18l4-6 4 3 5-8 3 4"/><path d="M4 20h16"/>',
 "ask": '<path d="M5 6h14v9H10l-4 3v-3H5z"/>',
 "que": '<path d="M5 7h14M5 12h14M5 17h9"/><path d="M17 16l2 2 3-4"/>',
 "tru": '<path d="M12 3l8 3v6c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 "set": '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
}
VIEWS = [  # id, label, icon, group, title, description
 ("command-center", "Command Center", "cc", "Overview", "Command Center", "The overview: health, priority incidents, topology and trends. Sample data only."),
 ("incidents", "Incidents", "inc", "Respond", "Incidents", "Filter, search and open incidents. Recommendations only; analysts approve every action."),
 ("investigation", "Investigation", "inv", "Respond", "Investigation", "Connections, suspicious activity, evidence and possible lateral movement for one host."),
 ("evidence", "Evidence", "ev", "Respond", "Forensic evidence", "Original events with timestamps. Every statement lists the log lines it relies on."),
 ("timeline", "Timeline", "tl", "Respond", "Incident timeline", "The stages of the selected incident."),
 ("queue", "Response queue", "que", "Respond", "Response queue (simulated)", "Recommended actions waiting for an analyst. Nothing here runs."),
 ("topology", "Network topology", "net", "Visualize", "Network topology", "An illustrative sample network with one attack path."),
 ("global", "Global activity", "glo", "Visualize", "Global activity", "Synthetic incident regions on a globe. Geolocation is approximate."),
 ("behavior", "Behavioral analytics", "beh", "Visualize", "Behavioral analytics", "Behavior flags and anomalies in sample cloud events."),
 ("ask", "Ask H.A.L.O.", "ask", "AI and trust", "Ask H.A.L.O.", "Answers come only from the sample evidence on this page. No model is called."),
 ("trust", "Trust and status", "tru", "AI and trust", "Trust and status", "What works today, what is simulated, and what is only planned."),
 ("about", "About and demo", "set", "AI and trust", "About and demo controls", "Build information, demo controls and links."),
]
def nav():
    out, last = [], None
    for vid, label, ic, grp, *_ in VIEWS:
        if grp != last:
            out.append("<div class=\"ng\">%s</div>" % grp); last = grp
        out.append('<a class="ni%s" href="#/%s" data-view="%s"><svg viewBox="0 0 24 24" aria-hidden="true">%s</svg><span>%s</span></a>' % (" ai" if vid == "ask" else "", vid, vid, ICON[ic], label))
    return "\n      ".join(out)

def view(vid, body, cls=""):
    return '<section class="view %s" id="v-%s" data-view="%s" aria-labelledby="viewTitle" hidden>\n%s\n    </section>' % (cls, vid, vid, body)

go = lambda v, t: '<a class="jump" href="#/%s">%s</a>' % (v, t)
cc = view("command-center", """      <div class="cc">
        <div class="col">%s%s</div>
        <div class="col">%s
          <div class="card pri"><div class="ct">Priority incidents <span class="chip">sample</span></div><div id="priList" class="pl"></div>%s</div>
          %s
        </div>
        <div class="col">%s
          <div class="card"><div class="ct">Explore</div><div class="jumps">%s%s%s%s%s</div></div>
        </div>
      </div>""" % (gauge, ai, topo_compact, go("incidents", "All incidents &rarr;"), tiles, trend,
                   go("investigation", "Investigation"), go("evidence", "Evidence"), go("global", "Global activity"), go("behavior", "Behavioral analytics"), go("ask", "Ask H.A.L.O.")), "cc-v")
v_inc = view("incidents", "      " + radar)
v_inv = view("investigation", "      " + inv + '\n      <p class="hint mono">Select an incident on the Incidents page or a node on the Network topology page to change the host.</p>')
v_ev = view("evidence", "      " + fev)
v_tl = view("timeline", "      " + timeline)
topo_big = topo.replace('<div class="card topo">', '<div class="card topo topo-big">', 1)
v_net = view("topology", "      " + topo_big + '\n      <p class="hint mono">Illustrative sample topology drawn by hand. It is not discovered from a network. Select a node to open its investigation.</p>')
v_glo = view("global", "      " + globe)
v_beh = view("behavior", "      " + behav)
v_ask = view("ask", "      " + ask + '\n      <p class="hint mono">Working today: a keyword lookup over the sample evidence, with citations. Planned and disabled: a local model through Ollama.</p>', "ask-v")
v_que = view("queue", '      <div class="card"><div class="ct">Recommended actions <span class="chip">simulated</span></div><div id="queList" class="ql"></div>'
             '<p class="hint mono">Queuing here records nothing, sends nothing and runs nothing. There is no remediation code in this build.</p></div>')

def row(name, status, note):
    return "<tr><th scope=\"row\">%s</th><td><span class=\"st %s\">%s</span></td><td>%s</td></tr>" % (name, status.lower(), status, note)
trust_rows = "".join([
 row("Page renders offline, no outside requests", "Working", "Checked by an automated browser test: no network requests, no policy violations."),
 row("Untrusted text shown as plain text", "Working", "Hostile event, name and IP strings render inert in tests. Unsafe HTML insertion is refused by the code."),
 row("Evidence citations in Ask H.A.L.O. and summaries", "Working", "Each statement lists the event IDs it came from. Known gaps in ID checking are documented."),
 row("Region filter, search, globe, charts, navigation", "Working", "Run in your browser over sample data."),
 row("Incident, event and host data", "Simulated", "All synthetic. Nothing is ingested."),
 row("Health score, SLA 97%, 91% sample confidence, trend numbers", "Simulated", "Fixed or random sample values. Not calculated from any detection."),
 row("AI Investigation summary", "Simulated", "Fixed text. No model is called."),
 row("Queue for approval", "Simulated", "Shows a message only. No audit record is written. No action runs."),
 row("Randomize Sample Data", "Simulated", "Generates random numbers locally."),
 row("Live ingestion from endpoint, cloud, SIEM, scanner, firewall", "Planned", "No connectors exist."),
 row("Model-written explanations (local Ollama)", "Planned", "The adapter is a disabled stub that throws if enabled."),
 row("Automated or approved remediation", "Planned", "Not implemented. Recommendations only."),
 row("Audit log and policy engine", "Planned", "Not implemented."),
 row("Event validator (separate module)", "Working", "Tested in isolation. Not yet connected to this console."),
])
v_tru = view("trust", '      <div class="card"><div class="ct">Working, simulated and planned</div><div class="tw"><table class="trust"><thead><tr><th>Capability</th><th>Status</th><th>Notes</th></tr></thead><tbody>%s</tbody></table></div>'
             '<p class="hint mono">Working means it runs in this page and is covered by a test. Simulated means the screen exists but the numbers or actions are fixed or invented. Planned means it does not exist yet.</p></div>' % trust_rows)
v_about = view("about", '''      <div class="two">
        <div class="card"><div class="ct">Demo controls</div>
          <p class="hint">Sample numbers change only on this page. Nothing is fetched.</p>
          <button class="btn teal" type="button" id="refresh2">Randomize Sample Data</button>
        </div>
        <div class="card"><div class="ct">About this build</div>
          <div class="kvl"><div>Version <b>v12 (view layout)</b></div><div>Derived from <b>v10, unchanged</b></div><div>Data <b>Synthetic</b></div><div>Network use <b>None</b></div><div>Backend <b>None connected</b></div></div>
          <p class="hint"><a class="jump" href="halo-landing.html">Back to the H.A.L.O. Security Triage overview</a></p>
        </div>
      </div>''')

BODY = '''<div class="outer">
<div class="app v12">
  <nav class="side" aria-label="Sentinel views">
    <div class="brand"><div class="logo" aria-hidden="true">H</div><div><b>H.A.L.O.</b><small>Sentinel</small></div></div>
    <div class="nl">
      %s
    </div>
    <div class="sf"><span class="demo-pill">Demo mode</span><a class="jump" href="halo-landing.html">Overview page</a></div>
  </nav>

  <div class="main">
    %s
    <div class="head">
      <div>
        <h1 id="viewTitle" tabindex="-1">Command Center</h1>
        <p id="viewDesc">The overview.</p>
      </div>
      <div class="hbtn">
        %s
      </div>
    </div>
    <div class="demo banner" role="note">Demo mode. All data is synthetic and nothing is connected to a live system. Recommendations only. Analysts approve every action.</div>

    <main id="views">
    %s
    </main>

    %s
  </div>
</div>
</div>

''' % (nav(), bar_html.rstrip(), refresh, "\n    ".join([cc, v_inc, v_inv, v_ev, v_tl, v_que, v_net, v_glo, v_beh, v_ask, v_tru, v_about]), foot.rstrip())

# ---- assemble ----
i0 = idx('<div class="outer">'); i1 = idx('<script>')
out = s[:i0] + BODY + s[i1:]
out = sub(out, "<title>H.A.L.O. Sentinel Console</title>", "<title>H.A.L.O. Sentinel Console v12</title>")

# navigation hooks: opening an incident or host now switches view instead of scrolling a long page
out = sub(out, "document.getElementById('inv').scrollIntoView({ behavior: 'smooth', block: 'nearest' });\n", "window.HaloNav.go('investigation');\n") if False else out
def swap_all(text, old, new, n):
    assert text.count(old) == n, (old[:60], text.count(old)); return text.replace(old, new)
out = swap_all(out, "document.getElementById('inv').scrollIntoView({ behavior: 'smooth', block: 'nearest' })", "window.HaloNav.go('investigation')", 2)
out = sub(out, "document.getElementById(where === 'fev' ? 'fev' : 'inv').scrollIntoView({ behavior: 'smooth', block: 'nearest' });", "window.HaloNav.go(where === 'fev' ? 'evidence' : 'investigation');")

# new renderers inside the existing IIFE, using its escaping html``/put() helpers
RENDER = r'''
  function drawPriority() {
    var host = document.getElementById('priList'); if (!host) return; host.textContent = '';
    var order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    incidents.slice().sort(function (a, b) { return order[a.sev] - order[b.sev]; }).slice(0, 4).forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pc';
      put(b, html`<span class='sev ${it.sev}'>${it.sev}</span><span class='pt'>${it.type}</span><span class='pm mono'>${it.id} &middot; ${it.host} &middot; ${it.time}</span>`);
      b.addEventListener('click', function () { openIncident(it.id, 'inv'); });
      host.appendChild(b);
    });
  }
  function drawQueue() {
    var host = document.getElementById('queList'); if (!host) return; host.textContent = '';
    Object.keys(HP).filter(function (k) { return HP[k].rec; }).forEach(function (k) {
      var row = document.createElement('div'); row.className = 'qr';
      put(row, html`<div><b>${k}</b> <span class='sev ${HP[k].risk}'>${HP[k].risk}</span></div><div class='qa'>${HP[k].rec}</div><div class='qs mono' role='status' aria-live='polite'>Not queued. Simulation only.</div><button type='button' class='btn teal'>Queue for approval (simulated)</button>`);
      row.querySelector('button').addEventListener('click', function () { row.querySelector('.qs').textContent = 'Simulated at ' + new Date().toLocaleTimeString('en-US') + '. Nothing was saved or sent and no action executed.'; });
      host.appendChild(row);
    });
  }
  document.getElementById('refresh2').addEventListener('click', function () { document.getElementById('refresh').click(); });
  drawPriority(); drawQueue();
})();
</script>
'''
tail = "  drawGauge(90); drawRows(); drawTimeline(); drawChart('24', 0); sparks();\n})();\n</script>"
out = sub(out, tail, "  drawGauge(90); drawRows(); drawTimeline(); drawChart('24', 0); sparks();" + RENDER.rstrip() )

ROUTER = r'''
<script>
(function () {
  'use strict';
  var V = %s;
  var ids = V.map(function (v) { return v.id; }), cur = null;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fromHash() { var m = /^#\/([a-z-]+)$/.exec(location.hash); return m && ids.indexOf(m[1]) >= 0 ? m[1] : 'command-center'; }
  function show(id, focus) {
    var v = V[ids.indexOf(id)];
    document.querySelectorAll('.view').forEach(function (s) { s.hidden = s.getAttribute('data-view') !== id; });
    document.querySelectorAll('.ni').forEach(function (a) { if (a.getAttribute('data-view') === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.getElementById('viewTitle').textContent = v.title;
    document.getElementById('viewDesc').textContent = v.desc;
    document.title = v.title + ' - H.A.L.O. Sentinel v12';
    if (cur !== id) { cur = id; window.scrollTo(0, 0); if (focus) document.getElementById('viewTitle').focus({ preventScroll: true }); }
    var on = document.querySelector('.ni[aria-current="page"]'); if (on && on.scrollIntoView && !reduced) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
  }
  window.HaloNav = { go: function (id) { if (ids.indexOf(id) < 0) return; if (location.hash === '#/' + id) show(id, true); else location.hash = '#/' + id; }, current: function () { return cur; }, views: ids.slice() };
  window.addEventListener('hashchange', function () { show(fromHash(), true); });
  function topoGo(e) { var n = e.target.closest && e.target.closest('.topo g.node'); if (n && (e.type === 'click' || e.key === 'Enter' || e.key === ' ')) window.HaloNav.go('investigation'); }
  document.addEventListener('click', topoGo); document.addEventListener('keydown', topoGo);
  document.getElementById('q').addEventListener('input', function () { if (cur !== 'incidents') window.HaloNav.go('incidents'); });
  show(fromHash(), false);
})();
</script>
''' 
import json
views_js = json.dumps([{"id": v[0], "title": v[4], "desc": v[5]} for v in VIEWS])
out = sub(out, "</script>\n</body>" if out.count("</script>\n</body>") == 1 else "</script>\n", "</script>\n" + ROUTER % views_js) if out.count("</script>\n</body>") == 1 else out.rstrip("\n") + "\n" + ROUTER % views_js + "\n"

# ---- CSS (appended; v10 rules are kept) ----
CSS = r'''
/* ===== v12: view shell, AI accent, responsive ===== */
:root { --ai: #a78bfa; --ai-d: rgba(167,139,250,.12); --cyan: #5ce1f2; }
.app.v12 { grid-template-columns: 208px minmax(0, 1fr); }
.side { border-right: 1px solid var(--line); padding: 14px 10px; display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,.18); min-width: 0; }
.brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 12px; }
.brand .logo { margin: 0; flex: none; }
.brand b { display: block; font-size: 13px; letter-spacing: .08em; } .brand small { color: var(--dim); font-size: 11px; }
.nl { display: flex; flex-direction: column; gap: 2px; }
.ng { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); padding: 12px 8px 4px; }
.ni { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 9px; color: var(--dim); text-decoration: none; border: 1px solid transparent; font-size: 12.5px; }
.ni svg { width: 17px; height: 17px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.ni:hover { color: var(--fg); background: var(--panel); }
.ni[aria-current="page"] { color: var(--teal); background: var(--teal-d); border-color: rgba(47,216,192,.35); }
.ni.ai[aria-current="page"] { color: var(--ai); background: var(--ai-d); border-color: rgba(167,139,250,.4); }
.sf { margin-top: auto; padding: 12px 6px 2px; display: flex; flex-direction: column; gap: 8px; }
.demo-pill { font-family: var(--mono); font-size: 10px; color: var(--amber); border: 1px solid rgba(244,180,60,.5); background: rgba(244,180,60,.08); border-radius: 999px; padding: 2px 10px; align-self: flex-start; }
.jump { color: var(--cyan); text-decoration: none; font-size: 12px; } .jump:hover { text-decoration: underline; }
#viewTitle:focus { outline: none; } #viewTitle:focus-visible { outline: 2px solid var(--teal); outline-offset: 4px; border-radius: 4px; }
.banner { margin: 0 0 12px; }
.view[hidden] { display: none !important; }
.view { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.hint { color: var(--dim); font-size: 12px; margin: 4px 0 0; } .hint.mono { font-size: 11px; }
.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cc { display: grid; grid-template-columns: 250px minmax(0, 1fr) 290px; gap: 12px; }
.jumps { display: flex; flex-direction: column; gap: 8px; }
.pl { display: flex; flex-direction: column; gap: 8px; }
.pc { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; text-align: left; background: var(--panel2); border: 1px solid var(--line); border-radius: 9px; padding: 9px 10px; cursor: pointer; }
.pc:hover { border-color: var(--teal); } .pc .pt { font-size: 12.5px; } .pc .pm { grid-column: 1 / -1; font-size: 10.5px; color: var(--dim); }
.pri .jump { display: inline-block; margin-top: 10px; }
.ql { display: flex; flex-direction: column; gap: 10px; }
.qr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; background: var(--panel2); border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; }
.qr .qa { grid-column: 1; font-size: 12px; } .qr .qs { grid-column: 1; font-size: 11px; color: var(--dim); overflow-wrap: anywhere; } .qr .btn { grid-column: 2; grid-row: 1 / span 3; }
.trust { min-width: 560px; } .trust th, .trust td { vertical-align: top; } .trust th[scope="row"] { font-weight: 500; text-align: left; }
.st { font-family: var(--mono); font-size: 10.5px; padding: 2px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
.st.working { color: #3ddc97; border-color: rgba(61,220,151,.5); background: rgba(61,220,151,.08); }
.st.simulated { color: var(--amber); border-color: rgba(244,180,60,.5); background: rgba(244,180,60,.08); }
.st.planned { color: var(--dim); border-color: var(--line); }
/* AI surfaces get the subtle purple */
.ai b { color: var(--ai); }
#ai { border-left: 2px solid var(--ai); }
.card.ask { border-color: rgba(167,139,250,.35); box-shadow: 0 0 0 1px rgba(167,139,250,.06), 0 0 22px rgba(167,139,250,.07); }
.card.ask .chip { color: var(--ai); border-color: rgba(167,139,250,.4); }
.ask-v .askl { max-height: 55vh; }
/* glowing topology */
.topo svg path { filter: drop-shadow(0 0 3px rgba(47,216,192,.55)); }
.topo svg path.atk { filter: drop-shadow(0 0 4px rgba(255,90,95,.7)); }
.topo-mini svg { max-height: 190px; } .topo-big svg { max-height: 62vh; width: 100%%; }
.topo-big svg text { font-size: 11px; }
@media (max-width: 1180px) { .cc { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .cc > .col:nth-child(2) { grid-column: 1 / -1; order: -1; } }
@media (max-width: 900px) {
  .app.v12 { grid-template-columns: 1fr; }
  .side { flex-direction: row; align-items: center; border-right: 0; border-bottom: 1px solid var(--line); padding: 8px; position: sticky; top: 0; z-index: 5; background: rgba(8,20,19,.96); overflow-x: auto; }
  .brand { padding: 0 8px 0 2px; } .brand small, .ng, .sf { display: none; } .nl { flex-direction: row; gap: 4px; } .ni { white-space: nowrap; }
  .two { grid-template-columns: 1fr; }
}
@media (max-width: 640px) { .trust { min-width: 0; } .trust thead { display: none; } .trust tr { display: block; padding: 10px 0; border-bottom: 1px solid var(--line); } .trust th, .trust td { display: block; padding: 2px 0; border: 0; } .bar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .bar .search { grid-column: 1 / -1; flex: none; } .bar .avatar { display: none; } .bar .sel { min-width: 0; width: 100%%; } .cc { grid-template-columns: 1fr; } .main { padding: 12px; } h1 { font-size: 22px; } .qr { grid-template-columns: 1fr; } .qr .btn { grid-column: 1; grid-row: auto; justify-self: start; } .bar { justify-content: flex-start; } }
'''
out = sub(out, "</style>", CSS.replace("%%", "%") + "</style>")
with open(OUT, "w", encoding="utf-8") as f:
    f.write(out)
print("wrote", OUT, len(out.splitlines()), "lines", hashlib.sha256(out.encode()).hexdigest()[:16])
