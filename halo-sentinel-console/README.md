# H.A.L.O. Sentinel Console

**Offline cybersecurity investigation interface — public research demo using synthetic data.**

> **Demo only.** No live telemetry, connected backend, active AI model, or remediation execution. Incident records, statistics, users, and evidence are synthetic. This repository is a standalone frontend demonstration, not the production HALO Sentinel security engine.

## Try it

Open [`index.html`](index.html) locally and choose **Open the Sentinel demo**, or run:

```bash
python3 -m http.server 8000
```

Visit `http://localhost:8000`. No install or build step is required to run the demo. The console itself is [`halo-sentinel-console-v12.html`](halo-sentinel-console-v12.html).

## Demonstrated interface

- Twelve navigable views covering command center, incidents, investigation, evidence, timeline, response queue, topology, global activity, behavioral analytics, Ask H.A.L.O., trust/status, and about.
- Incident search and regional filtering, sample event IDs and timelines, network/attack-path visualization, and a rotatable globe.
- Rule-weighted behavioral flags computed from **synthetic** events; scores are **not machine-learning predictions**.
- **Ask H.A.L.O.** uses keyword lookup over bundled evidence, not an LLM. Remediation and approvals are visual simulations only.
- The in-app **Trust and status** view distinguishes implemented UI, simulated functionality, and planned integrations.

## Architecture

```text
Browser (offline-capable static HTML/CSS/JavaScript)
  ├── Landing page (index.html)
  ├── Sentinel Console v12 (single HTML file)
  ├── Embedded synthetic incident/event fixtures
  ├── Client-side filters, charts, topology, globe
  └── Evidence lookup and rule-based flags

No backend / live connectors / external API calls
```

## Tests and limitations

Run the dependency-free core tests:

```bash
HALO_HTML="$PWD/halo-sentinel-console-v12.html" node --test tests/console-core.test.js
```

The bundled browser regression and security suites require Playwright and a Chromium browser. They are **not included in the runtime** and have not been executed as part of this repackaging because Playwright was unavailable in the preparation environment. The negative audit suite intentionally documents **21 known failing checks** in the original v10 review, covering evidence ID validation, timestamps, geolocation, impossible-travel handling, and CSP expectations. See [`docs/REMAINING_AUDIT_FAILURES.md`](docs/REMAINING_AUDIT_FAILURES.md). Do not interpret passing core tests as a complete security audit.

To install browser-test prerequisites in a development environment:

```bash
npm install --no-save playwright
npx playwright install chromium
node --test tests/v12-regression.test.js
```

Known constraints:
- No real ingestion, authentication, multi-tenant authorization, incident persistence, or audit logging.
- Scores, confidence figures, and operational KPIs are samples; they do not measure real detection performance.
- The behavioral-event feed is not fully integrated with the incident evidence model; some links can navigate to an unrelated incident.
- Source includes legacy versions, backups, build tools, and audit suites for reproducibility; the recommended demo is **v12**.

## Publication and privacy

This is a **freshly packaged source snapshot**, with no private repository Git history. Source was inspected for common secret patterns, but automated inspection is not a guarantee. Review every file and confirm you own the code and have rights to publish it before making a public repository. No license is granted by default; choose one intentionally before inviting reuse.

## Roadmap (not implemented here)

Real-format log ingestion, evidence-bound AI assistance, persisted investigation workflows, and approved response actions are future work, not current features.
