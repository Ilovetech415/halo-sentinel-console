# H.A.L.O. Sentinel Console v12: what changed, what was verified

Status: for review. Nothing committed, pushed or deployed. v10 is unchanged (SHA-256 `a04a745801e361534fc1e96d081821ad41885f9a763ab275cb5e71af8425e0c6`). No v11 file exists in this workspace.
Files: `halo-sentinel-console-v12.html`, `halo-landing-v12.html`, `tools/build_v12.py`, `tools/build_landing_v12.py`, `tools/mutation_v12.py`, `tests/v12-regression.test.js`.

## How v12 was made
`tools/build_v12.py` reads v10 (and refuses to run if its hash differs) and writes v12. All v10 cards, element ids, styles, scripts, the HaloCore data block and the escaping block are reused byte for byte. v12 adds a left navigation, a hash router (`#/incidents` and so on), two small renderers (priority incident cards and the simulated response queue), purple accents for AI surfaces, glow on topology lines, and responsive rules. The only edits to v10 script lines are three `scrollIntoView` calls, replaced by navigation to the matching view.

## The 12 views
Command Center, Incidents, Investigation, Evidence, Timeline, Response queue (simulated), Network topology, Global activity, Behavioral analytics, Ask H.A.L.O., Trust and status, About and demo. Every v10 feature is on exactly one view. Opening an incident goes to Investigation, "View evidence" goes to Evidence, a topology node goes to Investigation, typing in search goes to Incidents.

## Working vs simulated
The Trust and status view lists each capability as Working, Simulated or Planned. Hardcoded values (health score, SLA 97%, 91% sample confidence, trend numbers), the AI summary, the approval buttons and all incident data remain labelled simulated. Live ingestion, a model, remediation and the audit log are marked Planned. A test fails if any of those is marked Working.

## Verified here (headless Chromium, offline)
- v12 regression suite: 24 tests, passing on repeated runs. Covers security carried over from v10, parity with v10 card contents, navigation, hostile hashes, keyboard, no overflow at 1440, 1024, 768 and 390 px.
- Existing suites on v12: console-core 13 of 13. audit-negative gives the same 21 failures as v10 (the known gaps), none new.
- Landing copy: loads offline with no requests and no CSP violations; its Sentinel link opens v12.

## Not verified
- Your Downloads dashboard (`halo-sentinel-console-v10-2.html`) was not accessible, so v12 follows v10's design, not a diff against that file.
- No real-device or Safari/Firefox testing; Chromium only. Screen readers not tested.
- The 21 known audit gaps (evidence-ID, timestamp, coordinate, impossible-travel checks) are still open. v12 does not fix them.
- The landing story (Frankfurt brute force) and the console's sample incidents still tell different stories.
