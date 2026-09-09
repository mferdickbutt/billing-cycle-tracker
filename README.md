# Billing Cycle Tracker

Static page that loads sample invoice events and reports how long each billing stage takes: **quote → sent → approved → paid**.

GitHub Pages is intended from the repository root on `main` (relative paths only).

## Day counting

**UTC calendar days**, not elapsed 24-hour periods.

- A timestamp is reduced to its `YYYY-MM-DD` prefix (ISO date or datetime). `Date` objects use the UTC calendar date.
- Stage days = calendar date of the later stamp minus calendar date of the earlier stamp.
- Same calendar day is **0** days (a quote sent the same day it was issued).
- Time of day is ignored. `2026-01-02T23:00:00Z` → `2026-01-03T01:00:00Z` is **1** day, not ~2 hours.
- Missing, empty, or unparseable stamps return **`null`** (never `NaN` or `Infinity`). The UI shows **—**. Those invoices are **excluded** from that stage’s total, count, and average. Later stages that lack both endpoints are likewise `null`.
- Overall cycle is quote → paid and is only defined when both dates exist.

Targets (days) default to:

| Stage | Default target |
| --- | --- |
| Quote → sent | 2 |
| Sent → approved | 5 |
| Approved → paid | 14 |

Override them in `data/invoices.json` under `targets`, or pass a targets object as the second argument to `summarize`.

**Bottleneck:** the stage whose **average − target** is largest (most over, or least under if every stage beats its target). Stages with no samples are skipped. Ties break in pipeline order (quote→sent, then sent→approved, then approved→paid).

## Run tests

```bash
bash scripts/test.sh
```

Requires Node. The runner (`scripts/run-tests.js`) asserts calendar-day math, incomplete stages, averages, bottleneck selection, and the sample file. Green output ends with `Summary: N passed, 0 failed` and exit code 0.

## Serve locally

`fetch('./data/invoices.json')` does not work from `file://`. From the repo root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/

## Module

`js/cycle.js` is a zero-dependency UMD file:

- Browser: global `BillingCycle`
- Node: `require('./js/cycle.js')`

Exports: `daysBetween`, `stageDays`, `summarize`, `findBottleneck`, `DEFAULT_TARGETS`, `STAGE_DEFS`.

## Suggested next improvements

- Persist live invoices (API or spreadsheet) instead of a static JSON fixture.
- Filter by client, amount, or open vs paid; export CSV.
- Configurable targets in the UI without editing JSON.
- Business-day counting as an optional mode.
- Charts of stage mix over time and aging of unpaid invoices.
