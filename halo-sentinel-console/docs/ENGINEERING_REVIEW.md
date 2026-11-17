# H.A.L.O. Sentinel Console: engineering review

Scope: `halo-sentinel-console.html` (dashboard) and `halo-landing.html` (landing page), plus the test suite.
Status: review only. No application code was changed. Two test files and one browser audit script were added under `tests/`.
Date of review: 2026-10-25 (workspace clock).

## 1. Test results (exact numbers)

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `tests/console-core.test.js` (existing) | 13 | 13 | 0 |
| `tests/audit-negative.test.js` (new) | 74 | 44 | 30 |
| Both together | 87 | 57 | 30 |

Run with: `node --test tests/console-core.test.js tests/audit-negative.test.js`

Every one of the 30 failures is a confirmed gap in the application, not a flaw in the test. While writing the new tests I found two mistakes in my own tests (a wrong expected time for a `-04:00` offset, and an array comparison across the Node sandbox boundary). I fixed those two tests and left the application code alone. Each of the 30 failures was read individually to confirm its cause.

Browser audit (`node tests/render-audit.js`, needs Playwright) is not a pass/fail suite. It reports:
- Network requests attempted by the dashboard while exercising region filter, evidence panel, Ask, Refresh and containment queue: one, a stylesheet from `fonts.googleapis.com`.
- Network requests attempted by the landing page: one, the same kind of Google Fonts stylesheet.
- Script injection through event text: **executed** (a planted `<img onerror>` in one event description ran when the evidence panel opened). The probe used a temporary copy.
- Script injection through the Ask box and the search box: did not execute.

## 2. Which existing tests were too weak

Method: mutation testing. I broke the code on purpose in 28 temporary copies (21 in the tested HaloCore block, 7 elsewhere in the page) and ran the suite against each. A good suite fails on every mutation.

| Result | Existing suite | Existing + new tests |
|---|---|---|
| Mutants caught | 18 of 28 | 21 of 28 |
| HaloCore block | 17 of 21 | 20 of 21 |
| Rest of the page | 1 of 7 | 1 of 7 |

Mutants the original suite missed, and why:
- **Summary event count off by one.** Test 9 checked that cited IDs exist but never checked the numbers or sentences. Now caught by a new test.
- **Speed threshold lowered from 900 to 9 km/h, and the 500 km minimum removed.** Test 11 had one positive example and no negative case. Now caught.
- **Earth radius changed from 6371 to 6000.** The distance test accepted anything between 9,000 and 11,000 km. **Still survives.** Tighten the range to about 10,200 to 10,400 km.
- **Six mutants outside the tested block** (region click no longer filtering, incident click no longer selecting the graph host, wrong behavior-score weights, wrong High threshold, Ask answering from the wrong host, Critical badge shown as Low). **All survive.** No test touches the UI layer or the behavioral scoring.

Tests that pass without proving much:
- Test 12 ("marked synthetic"): the negative assertion searches for the phrase "live attack in progress", which appears nowhere, so it can never fail. The positive assertions only check that a string exists somewhere in the file, not that a user would see it.
- Test 13 ("no network call"): scans only the HaloCore block, so it says nothing about the other 90% of the file.
- Test 9 (summaries): compares a summary against the same events it was generated from, so it cannot find a wrong event, only a wrong ID.
- Test 6: confirms a host name appears as SVG text, not that clicking it works.
- All tests: run against the logic block extracted from the HTML, so rendering, event handlers and the globe are never executed by the suite.

## 3. Verification of specific requirements

**Every evidence reference in a summary belongs to that incident.** True for the current data (verified for all six incidents, including hypothesis basis IDs and IDs inside the text; no event is shared between incidents, and none is orphaned). **Not enforced in code.** If a dataset change adds a foreign ID, `summarize` cites it without warning. Three tests demonstrate this and fail.

**Impossible-travel detector.**
- Handles out-of-order events correctly (sorts by UTC; shuffled input gives identical output).
- Does not compare different actors or actorless events.
- Does not flag plausible travel or very short hops.
- Marks any leg touching IP geolocation as `approximate`, and never marks it verified.
- Does **not** flag two events at the same instant on different continents. It computes 10,277 km in 0 minutes as 0 km/h and reports `flag: false`.
- Does not model VPNs. The evidence panel hedges in text ("may be VPN, proxy or IP geolocation error"), but the data returned is just a boolean with no certainty value.
- The Behavioral Analytics section shows "Impossible travel +32" and a plain "Location: Frankfurt, DE" with no approximation caveat.

**Synthetic data cannot be mistaken for live telemetry.** Mixed.
- Good: every IP address is a reserved documentation or loopback address, every email is `@example.com`, every hostname is under a reserved example domain, the evidence panel carries a demo banner, and the section headers say "Demo mode".
- Gaps: there is no demo notice on the first screen of the dashboard (the only page-level disclosure is a footer line at the very bottom). The Incident Health Score card is labeled "live". The AI Investigation card presents fixed text as an "AI Summary" with no sample marker. The "Refresh Data" button reads like a fetch but only randomizes numbers. Events have no `synthetic` field, so exported or copied evidence would be indistinguishable from real. Event timestamps are dated the current day, so they look recent.

**Network calls across the whole application.** The file contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, service worker, iframe, `eval` or storage APIs, confirmed by static scan and by recording real browser requests. The single outbound dependency is the Google Fonts stylesheet link in each page (which in turn pulls font files from `fonts.gstatic.com`). Neither page declares a Content-Security-Policy. The Ollama adapter endpoint is loopback only and cannot make a request (it only throws).

## 4. Prioritized findings

**High**
1. **Event text is rendered as HTML without escaping** (`renderFev` and the investigation panel build `innerHTML` from event fields). Proven: a planted `<img onerror>` in an event description executed. Today the data is hard-coded, so this is latent. It becomes exploitable the moment imported or live evidence exists, and imported evidence is exactly attacker-controlled text. Fix before any ingestion: escape on render (or use `textContent`), and add a CSP.
2. **The page makes an outside request on every load** (Google Fonts, both pages). That discloses the viewer's IP address and browser details to a third party, which conflicts with the privacy-focused, no-external-telemetry requirement. Fix: self-host or inline the fonts, or use system fonts.
3. **Simulated data can look live.** No demo notice on the first screen, a "live" label, an "AI Summary" with no AI behind it, and a Refresh button that fabricates numbers. Fix: persistent demo banner, remove "live", label the AI card as sample text, rename Refresh.

**Medium**
4. **HaloCore has no data validation.** Missing evidence IDs are silently dropped, duplicate event IDs resolve to the first match, a repeated ID is counted twice, cross-incident and foreign hypothesis references are cited without warning, and an incident with no evidence crashes `summarize` with a TypeError. The current data is clean, but only by convention.
5. **The timestamp parser accepts invalid input.** February 30 silently becomes March 2, an array containing a valid string is accepted, and a space in place of `T` is accepted. Wrong UTC times corrupt a forensic timeline without any error.
6. **Impossible-travel gaps**: same-instant events not flagged; boolean flag with no certainty; VPN not modeled in the data; Behavioral Analytics has no approximation caveat.
7. **Two disjoint evidence models.** Behavioral Analytics events (`EVT-22xx`) do not exist in HaloCore, so "Open in incident" cannot trace them to evidence.
8. **No coordinate validation.** Latitude 91, longitude 181, numeric strings and nulls all return finite distances, and a NaN coordinate produces a leg with `flag: false` instead of an error.
9. **Test coverage stops at the HaloCore block.** The UI, the behavioral scoring and Ask logic are unverified.

**Low**
10. No Content-Security-Policy on either page.
11. The label "Ransomware Activity" on INC-2847 is not supported by its evidence (the evidence shows exfiltration and a persistence service).
12. The distance test tolerance is too wide (see section 2).

## 5. What is real, simulated, deterministic or AI

| Area | Classification |
|---|---|
| Server, API, database, persistence | **None exist.** Everything runs in the browser and nothing survives a reload. |
| AI / machine learning | **None.** "Ask H.A.L.O." is keyword and regular-expression matching plus text templates. "AI Summary" and "Explain" are fixed strings or templates. The Ollama adapter is a disabled stub that throws. |
| Deterministic JavaScript, tested (HaloCore) | Timestamp normalization, region filter and search, incident navigation, evidence lookup and sorting, grounded summaries, distance calculation, impossible-travel legs, geolocation labels, adapter stub |
| Deterministic JavaScript, untested | Behavioral scoring (weights and thresholds), Ask answer rules, globe projection, region panel, host investigation panel |
| Frontend simulation | Health score, KPI tiles and sparklines, trend chart, Refresh Data (random), region counts (22 / 9 / 7 against 6 sample incidents), threat attribution, incident timeline stages, host risk labels, behavioral events, timeline and action counts, globe arcs, attack-path graph, "Operational" status |
| Actions | "Queue for approval" and the landing-page Approve buttons only write a line of text. No remediation code exists. |
| Landing page | Static marketing page with a sample incident card whose buttons only update on-page text |

## 6. Not done, by request
No architectural changes, no fixes to the 30 failing tests' underlying causes, no production changes, and no real remediation. Next step is your decision on which findings to fix and in what order.
