#!/usr/bin/env python3
"""Build halo-landing-v12.html from the unchanged halo-landing.html: shared colors with Sentinel v12, a clear path to the
Sentinel demo, a Content-Security-Policy, and honest Working / Simulated / Planned labels. The original file is only read."""
import hashlib, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(ROOT, "halo-landing.html"), encoding="utf-8").read()
DEMO = "halo-sentinel-console-v12.html#/command-center"
TRUST = "halo-sentinel-console-v12.html#/trust"
def r(old, new):
    global s
    assert s.count(old) == 1, (old[:70], s.count(old)); s = s.replace(old, new)

r('<meta name="claude:viewport-fit-sides" content="cover">', '<meta name="claude:viewport-fit-sides" content="cover">\n<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; font-src \'none\'; frame-src \'none\'; object-src \'none\'; form-action \'none\'; base-uri \'none\'">')
# shared palette with Sentinel v12 (dark teal-green), purple only for AI
for a, b in [("--bg: #04080c;", "--bg: #040b0b;"), ("--bg-2: #070d13;", "--bg-2: #061211;"), ("--panel: #0a121a;", "--panel: #0a1918;"), ("--line: #14222d;", "--line: #153431;"),
             ("--line-2: #1f3341;", "--line-2: #1f4a45;"), ("--fg: #e1ecf2;", "--fg: #e3f1ee;"), ("--dim: #8a9ca8;", "--dim: #86a39e;"), ("--signal: #5ce1f2;", "--signal: #2fd8c0;\n  --cyan: #5ce1f2;\n  --ai: #a78bfa;"),
             ("--signal-soft: rgba(92,225,242,.10);", "--signal-soft: rgba(47,216,192,.10);")]:
    r(a, b)
# path to the demo
r('<a href="#trust">Trust rules</a>\n    </nav>', '<a href="#trust">Trust rules</a>\n      <a href="%s">Sentinel demo</a>\n    </nav>' % DEMO)
r('<a class="btn primary" href="#incident">See an example incident</a>', '<a class="btn primary" href="%s">Open the Sentinel demo</a>\n          <a class="btn" href="#incident">See an example incident</a>' % DEMO)
# honest copy
i = s.index('<p class="lede">'); j = s.index('</p>', i)
s = s[:i] + '<p class="lede">H.A.L.O. is being built to read alerts from endpoint, cloud, scanner, SIEM and firewall tools, add context, and recommend an action. It never blocks anything on its own. Your analysts approve. Today it is a research demo that runs on synthetic data and connects to no live system.' + s[j:]
r('Confidence: 94%', 'Sample confidence: 94% (fixed value, not calculated)')
r("In production this is logged and, if approved, sent for execution. Nothing ran here.", "Simulated: nothing was logged, saved or sent, and no action ran.")
r('<div class="result" id="res" role="status" aria-live="polite"></div>', '<div class="result" id="res" role="status" aria-live="polite"></div>\n          <p class="note">Illustration with fixed sample text. These buttons only show a message. The <a href="%s">Sentinel demo</a> shows the same simulated approval step.</p>' % DEMO)
r("Signals flow in. Nothing flows back out to your network except an action a person approved or a policy pre-approved.", "The intended design. Signals flow in. Nothing flows back out to your network except an action a person approved. The status of each layer today is shown below each card.")
r('<div class="where">Queue and log shipper</div>', '<div class="where">Planned. No connectors exist yet. Event format validator built and tested separately.</div>')
r('<div class="where">Database, no AI yet</div>', '<div class="where">Planned. Not built.</div>')
r('<div class="where">Sandboxed model call</div>', '<div class="where">Planned. A local model adapter exists only as a disabled stub. The demo uses fixed text.</div>')
r('A policy engine lets only narrow, reversible actions run automatically. Every step is logged.', 'The intended design adds a policy engine for narrow, reversible actions and a log of every step.')
r('<div class="where">Human approval and audit log</div>', '<div class="where">Simulated in the Sentinel demo. No remediation, policy engine or audit log exists.</div>')
r('<p class="sub">Log text can be written by an attacker, so the system treats it as data and never as instructions.</p>', '<p class="sub">Log text can be written by an attacker, so the system treats it as data and never as instructions. These are design rules. Which parts work today is listed on the <a href="%s">Trust and status page</a>.</p>' % TRUST)
r('Automatic actions are limited to pre-agreed, reversible steps, such as isolating a non-critical host.', 'Today nothing runs automatically. The design allows only pre-agreed, reversible steps.')
r('Each prompt and response is recorded for review. Raw log content is escaped before it reaches the model, to block prompt injection.', 'The design records each prompt and response for review. Today no model is connected. The demo escapes all event text before display and answers only from sample evidence.')
r('<p class="sub">H.A.L.O. does not replace your tools. It reads what they already produce.</p>', '<p class="sub">H.A.L.O. is meant to sit beside your tools and read what they already produce. This describes the intended role. The demo connects to none of them.</p>')
r('<span>H.A.L.O. AI security triage. Sandbox build with sample data.</span>', '<span>H.A.L.O. AI security triage. Research build with sample data. <a href="%s">Open the Sentinel demo</a>.</span>' % DEMO)
r("</style>", """.note { font-size: 12.5px; color: var(--dim); margin: 10px 0 0; }
.flow .where { color: var(--dim); }
.flow li.ai { border-color: rgba(167,139,250,.4); }
.flow li.ai h3 { color: var(--ai); }
.flow li.ai::before { border-color: var(--ai); color: var(--ai); box-shadow: 0 0 0 4px rgba(167,139,250,.12); }
</style>""")
out = os.path.join(ROOT, "halo-landing-v12.html")
open(out, "w", encoding="utf-8").write(s)
print("wrote", out, len(s.splitlines()), "lines")
