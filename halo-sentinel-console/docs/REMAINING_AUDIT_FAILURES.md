# H.A.L.O. Sentinel Console v10: remaining audit failures

Status: review only. v10 (`halo-sentinel-console-v10.html`, SHA-256 `a04a745801e361534fc1e96d081821ad41885f9a763ab275cb5e71af8425e0c6`) is unchanged by this report.
Run: `HALO_HTML=$PWD/halo-sentinel-console-v10.html node --test tests/console-core.test.js tests/audit-negative.test.js`
Result: 87 tests, 66 pass, 21 fail. All 13 core tests pass. v9 has 58 pass and 29 fail on the same suite.

The 21 failures are known gaps, each confirmed in the original review. None is a regression from v10. Counts by group: timestamp 3, coordinate 7, evidence-ID 6, impossible-travel 4, landing CSP 1.

## Priority order

| Rank | Group | Failing | Why this rank |
|---|---|---|---|
| 1 | Evidence-ID integrity | 6 | A summary can cite the wrong evidence, or crash. This is the product's core claim, "every statement cites its evidence". It matters most once real data arrives. |
| 2 | Timestamp validation | 3 | A wrong UTC time silently corrupts a forensic timeline. |
| 3 | Coordinate validation | 7 | Invalid coordinates give finite but wrong distances, and one case hides a flag. |
| 4 | Impossible-travel detection | 4 | One missed detection, one missing certainty field, one wording gap, one data-model split. |
| 5 | Landing-page CSP | 1 | Low risk today. It must be solved differently from how the test expects (see below). |

Groups 1 to 3 live in the HaloCore block and share one fix pattern: validate the dataset when it loads, and fail closed with a visible error instead of rendering anything. That matches the original "fail closed" requirement and is a small, contained change.

## 1. Evidence-ID integrity (tests 34 to 39), highest priority

Current behavior: the data is clean today only by convention. `HaloCore` does not check it.

| # | Test | What happens now | Minimal fix |
|---|---|---|---|
| 34 | Missing evidence ID is rejected or reported | An incident that lists an ID with no event drops it silently | Dataset validation reports every unresolved ID |
| 35 | Duplicate event ID rejected | Lookup returns the first match, so a second event with the same ID is invisible | Reject duplicate event IDs at load |
| 36 | Same ID listed twice not double counted | The event is counted twice in the "N events" sentence | De-duplicate or reject within an incident |
| 37 | Evidence owned by another incident cannot be cited quietly | An incident can list another incident's event and cite it without warning | Each event belongs to one incident unless explicitly marked shared |
| 38 | Hypothesis cannot cite evidence outside its incident | `basis` can reference any ID | Require `hypothesis.basis` to be a subset of `evidenceIds` |
| 39 | Incident with no evidence does not crash | `summarize` throws a TypeError | Return "No evidence attached" with no claims |

Effort: small. One `validateDataset()` function and one guard in `summarize`. Risk to existing behavior: none for the current data, which already satisfies every rule.

## 2. Timestamp validation (tests 7, 16, 19)

| # | Test | What happens now | Minimal fix |
|---|---|---|---|
| 7 | Rejects Feb 30 | `Date.parse` rolls it to March 2 and reports a wrong UTC time | Strict ISO-8601 pattern, plus a round-trip check that the parsed parts equal the input parts |
| 16 | Rejects an array holding a valid string | The array is coerced to a string and accepted | Require `typeof ts === 'string'` |
| 19 | Rejects a space instead of `T` | Accepted | The strict pattern requires `T` |

Effort: small, one function (`toUtc`). The existing offset handling and the "original timestamp is kept beside the UTC value" behavior stay as they are.

## 3. Coordinate validation (tests 22 to 25, 29, 30, 32)

| # | Test | What happens now | Minimal fix |
|---|---|---|---|
| 22 to 25 | Latitude beyond ±90 or longitude beyond ±180 | A finite but meaningless distance is returned | Range check |
| 29 | Numeric strings | Coerced and accepted | Require `typeof === 'number'` and finite |
| 30 | Nulls | Coerced to 0 and accepted | Same type check |
| 32 | `geoTimeline` with an invalid distance | A NaN distance produces a leg with `flag: false`, which looks like "checked and fine" | Emit `invalid: true` and never `flag: false`, or throw |

Test 32 matters most here, because it turns a data error into an apparent all-clear. Effort: small.

## 4. Impossible-travel detection (tests 46, 53, 55, 56)

| # | Test | Finding | Minimal fix | Effort |
|---|---|---|---|---|
| 46 | Same instant, different continents | Computes 10,277 km in 0 minutes as 0 km/h and does not flag it | Treat distance above the threshold with time at or below a small epsilon as flagged, with speed shown as "simultaneous" | Small |
| 53 | VPN-style IP/IP leg carries a machine-readable certainty | The result is a boolean and an `approximate` flag only | Add `certainty`: `high` only when both ends are verified (badge reader), `low` for IP-to-IP | Small |
| 55 | Behavioral Analytics also states location is approximate | It shows "Location: Frankfurt, DE" with no caveat, while the evidence panel does carry one | Add "(approximate, from IP)" to the Location line and to the score reason | Small, text only |
| 56 | Behavioral Analytics IDs resolve in the shared evidence model | The EVT-22xx events exist only in the Behavioral Analytics table, not in HaloCore | Either move them into the shared model with an incident link, or label that section as a separate cloud-activity feed | Medium. It is a data-model decision, so decide it together with the integration design. |

Related finding, not covered by a failing test: the "Open in incident" button in Behavioral Analytics always opens FIN-SRV, whatever event is selected. For example, selecting `m.santos@example.com` still jumps to the FIN-SRV investigation. This is misleading and is part of the same data-model split as test 56.

## 5. Landing-page CSP (test 71)

The test requires a `<meta http-equiv="Content-Security-Policy">` in `halo-landing.html`. That is the wrong target, for a reason found while publishing v10:

- A CSP `<meta>` is honored only inside `<head>`. The published-artifact wrapper places the file's contents in `<body>`, so the browser ignores the policy and logs a console error. I confirmed this on the published v10 page. Everything else on the page still works.
- The artifact platform enforces its own CSP on every published page. A `<meta>` policy adds nothing there.
- For the integrated application (served from localhost), the right place is an HTTP response header from the server. That also allows a stricter script policy than `'unsafe-inline'`.

Recommendation: do not "fix" test 71 by adding a meta tag. Change the test to check the response header once there is a server, and decide in the integration design whether the inline scripts move to files so that `script-src 'self'` can replace `'unsafe-inline'`.

The same note applies to v10: its meta CSP is inert when published. It does no harm, but it prints one console error there. Removing it is a one-line change, to be decided with the rest.

## Not covered by the 21 failures

- The audit suite checks source-code patterns in places. Test 73 (escaping) needed an update to recognize the new helper. The behavioral tests in `tests/v10-security.test.js` are the real proof for XSS.
- There are no UI tests for behavioral scoring weights, or for Ask answer routing.

## Implications for the integration

These carry the security work forward:
1. Keep the `html`/`put` helper and `tests/v10-security.test.js` as a required test for both pages. Neither page may use `innerHTML` except through `put`.
2. Keep both pages free of outside requests, with system fonts or locally hosted fonts only.
3. Deliver the CSP from the server header, not a meta tag.
4. Fix groups 1 to 3 first, so the shared evidence data model is validated before the landing page's example incident and the console's incidents share data.
5. Keep the "Sample data" labels, the hardcoded-confidence label and the simulated-action wording on every page that shows sample content, and add them to any new page.

## Decisions needed

1. Approve fixing groups 1, 2 and 3 together (validation at load, fail closed)?
2. For test 56 and the "Open in incident" behavior: merge the Behavioral Analytics events into the shared evidence model, or label that section as a separate feed?
3. Remove the inert meta CSP from v10 in the next version, and move CSP to a server header?
