"""Break v12-specific controls in temp copies and confirm tests/v12-regression.test.js fails. Usage: python3 tools/mutation_v12.py"""
import os, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V12 = os.path.join(ROOT, "halo-sentinel-console-v12.html")
M = [
 ("router accepts any hash", "ids.indexOf(m[1]) >= 0 ? m[1] : 'command-center'", "m ? m[1] : 'command-center'"),
 ("hash route not validated against list", "if (ids.indexOf(id) < 0) return;", ""),
 ("all views stay visible", "s.hidden = s.getAttribute('data-view') !== id;", "s.hidden = false;"),
 ("current nav item not marked", "a.setAttribute('aria-current', 'page');", ";"),
 ("focus not moved to heading", "document.getElementById('viewTitle').focus({ preventScroll: true });", ";"),
 ("incident row no longer opens investigation", "window.HaloNav.go(where === 'fev' ? 'evidence' : 'investigation');", ";"),
 ("topology click no longer opens investigation", "if (n && (e.type === 'click'", "if (false && (e.type === 'click'"),
 ("search no longer jumps to incidents", "if (cur !== 'incidents') window.HaloNav.go('incidents');", ";"),
 ("CSP connect-src opened", "connect-src 'none'", "connect-src *"),
 ("external script added", "<title>H.A.L.O. Sentinel Console v12</title>", "<title>H.A.L.O. Sentinel Console v12</title><script src='https://evil.example/x.js'></script>"),
 ("second innerHTML write", "function show(id, focus) {", "function show(id, focus) { document.body.title = ''; document.getElementById('viewDesc').innerHTML = location.hash;"),
 ("queue claims to execute", "Nothing was saved or sent and no action executed.', 'x');", None),
 ("queue button text loses 'simulated'", "Queue for approval (simulated)</button><\\\"", None),
 ("trust page: live ingestion marked Working", 'Live ingestion from endpoint, cloud, SIEM, scanner, firewall</th><td><span class="st planned">Planned', 'Live ingestion from endpoint, cloud, SIEM, scanner, firewall</th><td><span class="st working">Working'),
 ("trust page: remediation marked Working", 'Automated or approved remediation</th><td><span class="st planned">Planned', 'Automated or approved remediation</th><td><span class="st working">Working'),
 ("demo banner removed", 'Demo mode. All data is synthetic and nothing is connected to a live system. Recommendations only. Analysts approve every action.</div>', '</div>'),
 ("queue shows no simulation label", "Not queued. Simulation only.", "Pending."),
 ("hostile hash echoes into page", "document.getElementById('viewDesc').textContent = v.desc;", "document.getElementById('viewDesc').textContent = v.desc; document.getElementById('viewDesc').appendChild(document.createElement('b')).setAttribute('onclick', location.hash);"),
 ("phone nav stays vertical", ".side { flex-direction: row;", ".side { flex-direction: column;"),
 ("view loses its title text", "document.getElementById('viewTitle').textContent = v.title;", ";"),
]
src = open(V12, encoding="utf-8").read()
bad = 0
for name, old, new in M:
    if new is None: continue
    if src.count(old) != 1:
        print("MISSING TARGET ", name, src.count(old)); bad += 1; continue
    tmp = tempfile.mkdtemp(prefix="mutv12-")
    try:
        f = os.path.join(tmp, "v12.html"); open(f, "w", encoding="utf-8").write(src.replace(old, new, 1))
        r = subprocess.run(["node", "--test", os.path.join(ROOT, "tests", "v12-regression.test.js")], env=dict(os.environ, HALO_V12=f), capture_output=True, text=True, timeout=600)
        caught = r.returncode != 0
        print(("caught   " if caught else "SURVIVED ") + name); bad += 0 if caught else 1
    finally: shutil.rmtree(tmp, ignore_errors=True)
n = len([m for m in M if m[2] is not None])
print("%d of %d mutations caught" % (n - bad, n)); sys.exit(1 if bad else 0)
