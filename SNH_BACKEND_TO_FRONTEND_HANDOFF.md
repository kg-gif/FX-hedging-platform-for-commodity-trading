# SNH — Backend → Frontend Handoff Notices

*Maintained by: Axel · CTO (Backend unit)*
*Read by: Frontend Rebuild unit before each sprint*
*Scope: API changes, deprecations, and coordination items the frontend must act on.*
*Format: Each entry is immutable once recorded. Add new entries; do not edit old ones.*

---

## Session cadence — which unit to open first

**Start each working session in this order:**

1. **Backend unit first** — open `PROMPT_BACKEND_FUNCTIONAL_UNIT.md` and ask for status on any open BF items before the frontend unit starts building. Backend changes (new endpoints, deprecations, schema changes) must be deployed before the frontend can wire against them. Building frontend against an undeployed backend spec wastes the session.

2. **Frontend Rebuild unit second** — once backend confirms what is deployed and what is pending, open the frontend session with the correct `PROMPT_NEXT_SESSION_*.md`. The frontend prompt already lists which BF items are prerequisites.

3. **Exception:** If the session is purely frontend sign-off or documentation (no new API calls), the frontend unit can proceed without a backend check first.

**Current open BF items requiring backend action before frontend can proceed:**
- None — all backend prerequisites deployed.

**Current open BF items requiring frontend action:**
- BF-001 — Condition 9 (value-date PATCH) still to be wired into Execution screen.
- BF-003 — RiskSettingsContext.jsx swap — backend deployed, frontend pending Settings port.
- BF-005 — Risk Engine real-data port — backend deployed, **frontend building now (16/06/2026)**.
- BF-007 — Close account UI — backend deployed, frontend pending Settings port.

**Confirmed complete 16 Jun 2026 (session continuation):**
- BF-002 backend route file fix ✅ — shared_auth.py created, all 9 route files updated, committed and deployed
- BF-012 ✅ — `/api/settings/risk` confirmed deployed (see routing note below)
- BF-013 ✅ — `/api/settings/close-account/request` confirmed deployed (see routing note below)

**Next session:** Backend monitors for 500 on `/exposures` if it recurs. Frontend focuses on BF-005 Risk Engine port. No new backend prerequisites.

---

## How to use this document

Backend raises an item here when a change it is making requires a corresponding frontend change, or when a frontend behaviour is causing a backend compliance or security issue. Frontend picks up items at the start of each sprint or when notified by Aria. Mark items resolved by adding a **Resolved** line — do not delete the entry.

---

## Routing note — 13 Jun 2026

**To: Backend unit · Two items for confirmation**

**1. BF-009 status check**
Execution screen is live at `birk-dashboard.onrender.com/rebuild`. Live order log shows references in `ORD-00427` format (not `ORD-00000`), suggesting `POST /api/audit/order-sent` may already be returning `id`. Please confirm whether `RETURNING id` fix has been deployed. If yes, close BF-009.

**2. BF-010 — "Forecast" tab on Hedges screen**
Hedges screen is live. The tab strip shows: Requires action · In progress · Hedged · Settled · **Forecast**. The frontend renders whatever `tab` value the enriched endpoint returns — "Forecast" is not in the original tab spec (`requires_action`, `in_progress`, `hedged`, `awaiting_settlement`, `settled`). Three exposures are landing on this tab. Please confirm: (a) is this an intentional new tab the backend added, or (b) is it a data issue (bad `tab` value on some exposure rows)? Frontend will add tab support once Axel confirms the spec. No action until then.

**Backend response — Axel · CTO, 13 Jun 2026:**

**BF-009:** Fix was NOT previously deployed — code confirmed returning `{"message": "Order logged"}` with no `id`. Fixed now: `RETURNING id` added to the INSERT, response is now `{"message": "Order logged", "id": row_id}`. Deploy branch `backend/bf-009-order-id` — see item BF-009 below for deploy note. The `ORD-00427` references the frontend is seeing must be derived from a different source — frontend to confirm how they are currently constructing that reference and verify it will correctly use `data.id` once the fix is live.

**BF-010:** **This is a data/frontend issue, not an intentional backend tab.** `classify_exposure_tab()` in `services/exposure_utils.py` only ever returns five values: `requires_action`, `in_progress`, `hedged`, `awaiting_settlement`, `settled`. It never returns "forecast" or "Forecast". The word "Forecast" does exist in the response — but in the `confidence` field (values: COMMITTED / PROBABLE / FORECAST), which comes from the AP file upload classification and is entirely separate from `tab`. The frontend appears to be creating a tab from the `confidence` field for those three exposures, or accidentally reading `confidence` where it should read `tab`. Frontend action: for those three exposures, call the enriched endpoint directly and inspect the raw `tab` field value — it will be one of the five valid values, not "Forecast".

**Ball is back in: Frontend unit (BF-010 is a frontend rendering fix).**

---

### ITEM BF-010 — "Forecast" tab appearing on Hedges screen

**Raised by:** Frontend unit (via routing note 13 Jun 2026)
**Confirmed by:** Axel · CTO, 13 Jun 2026
**Priority:** Medium — incorrect tab rendering in production
**Status:** Frontend action required

**Root cause (confirmed by Axel):** The enriched endpoint returns two separate fields per exposure: `tab` (lifecycle tab — one of five valid values) and `confidence` (AP upload classification — COMMITTED / PROBABLE / FORECAST). The backend `tab` field never returns "Forecast". The frontend is rendering a "Forecast" tab, which means it is either (a) creating tabs dynamically from the `confidence` field, or (b) reading `confidence` instead of `tab` for some exposures.

**Valid `tab` values from the backend (exhaustive list):**
- `requires_action`
- `in_progress`
- `hedged`
- `awaiting_settlement`
- `settled`

Any other value appearing as a tab header is a frontend rendering error.

**Claude Code prompt for frontend:**
```
In the Hedges screen, a "Forecast" tab is appearing that should not exist.
The backend `tab` field only ever returns one of five values:
requires_action, in_progress, hedged, awaiting_settlement, settled.

The word "Forecast" exists in a separate field called `confidence`
(values: COMMITTED, PROBABLE, FORECAST) — this is the AP file upload
classification and must never be used as a tab selector.

1. Search the Hedges screen codebase for wherever tabs are constructed
   from exposure data (likely in HedgingRecommendations.jsx or a
   related component). Look for any dynamic tab generation that reads
   from exposure fields rather than a fixed list of known tab names.

2. Ensure tabs are built from a fixed allowlist only:
   const VALID_TABS = ['requires_action', 'in_progress', 'hedged',
                       'awaiting_settlement', 'settled']
   Do not create tabs dynamically from API response values.

3. Any exposure whose `tab` value is not in the allowlist should fall
   back to 'requires_action'. Log a console warning if this occurs so
   it surfaces in testing.

4. Verify that the `confidence` field (COMMITTED/PROBABLE/FORECAST) is
   not being used anywhere in tab routing logic. It is display-only
   metadata for the AP upload feature.

5. After the fix, confirm the five standard tabs render correctly and
   no "Forecast" tab appears. The three exposures that were landing on
   "Forecast" should now appear in whichever of the five valid tabs
   their `tab` field actually returns.
```

---

## Routing note — 5 Jun 2026

**To: Backend unit · Action required on BF-009**

The Execution screen (Phase 3) is signed off and ready to deploy. It calls `POST /api/audit/order-sent` on every execution. The endpoint currently returns `{"message": "Order logged"}` with no row `id`. The frontend derives the order reference (`ORD-XXXXX`) from that `id` for the post-execution confirmation card. Without it the card shows `ORD-00000`.

Fix: add `RETURNING id` to the INSERT in `log_order_sent` (`birk_api.py`) and return `{"message": "Order logged", "id": row_id}`. One line. Frontend requires no changes — it already handles `data.id`.

This does not block the Execution screen staging deploy. Please action before production rollout.

---

## Open items

---

### ITEM BF-001 — Value-date audit logging must move server-side

**Raised by:** Axel · CTO
**Date:** 2026-05-29
**Priority:** High — compliance gap on live production
**Status:** Backend deployed 01/06/2026 — frontend action required

---

**Background**

A compliance review of the audit trail identified the following gap.

When a user overrides the value date on a hedge execution, the frontend currently makes two separate API calls:

1. The tranche update (commits to `hedge_tranches`)
2. A separate call to `POST /api/audit/value-date-change` (commits to `value_date_audit_log`)

Because these are two independent HTTP calls and two independent database transactions, a network failure, timeout, or error between call 1 and call 2 results in a committed value-date change with no audit record. This breaks the regulatory audit trail.

Under MiFID II Article 16(6) and the SNH five-year retention rule (Lex · Legal, confirmed 13 May 2026), every change to a regulated record must have a traceable audit entry. A silent gap here is a compliance issue, not only a data-quality one.

---

**Backend change (to be deployed)**

The audit write will be moved server-side: into the endpoint that actually updates the value date on the tranche, inside the same database transaction. If the audit insert fails, the tranche update rolls back. No committed change without a committed record.

The standalone endpoint `POST /api/audit/value-date-change` will be deprecated and will return HTTP 410 Gone after a short transition window. It will not be silently removed — the 410 will surface immediately if the frontend is still calling it after the transition.

---

**Frontend action required**

After the backend fix is deployed (Axel will update this entry with the deploy date):

1. **Remove the separate call to `POST /api/audit/value-date-change`** from wherever it is made in the frontend codebase (likely in the value-date override flow in `HedgingRecommendations.jsx` or the execution modal — search for `/api/audit/value-date-change`).
2. The tranche update endpoint will return all the information needed to confirm the value-date change succeeded. No replacement call is required.
3. Verify the flow still works end-to-end in staging before merging.

---

**Coordination**

Backend will notify Frontend via this document and via Aria when the fix is deployed. Do not remove the frontend call before the backend fix is live — removing it early would leave the audit log completely empty during the gap.

---

**Resolved (backend):** Fix deployed to production 01/06/2026. `create_tranche` now writes to `order_audit_log` atomically in the same transaction.

**Reconciliation result — Lex · Legal sign-off 01/06/2026:**
Reconciliation query run against live production database. 13 orphaned tranches found. 11 confirmed seed/demo data (excluded from regulatory trail — null created_by, bulk timestamp). 2 real user executions (tranche IDs 118 and 106, kg@sumnohow.com) back-filled with retrospective audit records, approved by Lex · Legal. Post-fill reconciliation count: 11 (seed data only). Regulatory trail for all real client executions is now complete.

**Backend deployed 02/06/2026 — frontend action now required.**

New endpoint: `PATCH /api/tranches/{tranche_id}/value-date`
- Updates the tranche value_date in the database
- Writes to value_date_audit_log atomically in the same transaction
- Requires `new_date` (YYYY-MM-DD) and `reason` in the request body
- Status stays `executed` — Finn · Treasury confirmed

`POST /api/audit/value-date-change` is deprecated — marked in code, will return 410 once frontend confirms migration complete.

**Claude Code prompt for frontend:**
```
In HedgingRecommendations.jsx, replace the logValueDateChange() function and its
call in handleExecute() with a call to the new server-side endpoint.

1. Replace the logValueDateChange() function with:

   async function updateValueDate(trancheId) {
     if (!valueDateChanged || !valueDateReason.trim()) return
     await fetch(`${API_BASE}/api/tranches/${trancheId}/value-date`, {
       method: 'PATCH',
       headers: { ...authHeaders(), 'Content-Type': 'application/json' },
       body: JSON.stringify({
         new_date: valueDate,
         reason: valueDateReason
       })
     })
   }

2. In handleExecute(), find where logValueDateChange() is called:
      if (valueDateChanged) await logValueDateChange()
   
   The tranche ID is available after the order is created. Update the call to:
      if (valueDateChanged && trancheId) await updateValueDate(trancheId)

   Note: if the tranche ID is not available at this point in the flow (orders are
   sent to the bank by email, not auto-created as tranches), then call updateValueDate
   only when the user subsequently marks the order as executed and the tranche ID
   is known. Flag to Axel if the tranche ID is not available here.

3. Remove the old logValueDateChange() function entirely.

4. Search for any other calls to '/api/audit/value-date-change' in the codebase
   and remove them.

5. Verify the value-date override flow works end-to-end — change a value date,
   check the tranche record is updated, check value_date_audit_log has an entry.
```

**Important note for frontend:** If the tranche doesn't exist yet when the value date is changed (because the order goes to the bank by email first and is marked executed later), flag this to Axel. The endpoint requires a tranche ID — if there's no tranche yet, we need a different approach.

---

**Resolved (frontend): 5 Jun 2026.** `logValueDateChange()` and the standalone `POST /api/audit/value-date-change` call removed from `HedgingRecommendations.jsx`. Ships with Phase 3 Hedges deploy (`rebuild/phase-3-hedges` branch).

**Tranche-ID gap confirmed:** At order-send time in `handleExecute()`, the order goes to the bank by email — no tranche ID exists at that point. `PATCH /api/tranches/{id}/value-date` cannot be called here. Value date is captured in the email body and in `order_audit_log` via the existing `POST /api/audit/order-sent` call. The `PATCH` endpoint must be wired in the **Execution screen Phase 3 port** (Condition 9) when the tranche ID is available after mark-as-executed.

---

---

### ITEM BF-002 — HttpOnly cookie auth migration

**Raised by:** Axel · CTO
**Date:** 2026-05-29
**Priority:** High — must complete before Login screen port goes to production
**Status:** Backend deployed 01/06/2026 — frontend action required before Login screen port goes to staging

---

**Background**

Cipher rated the current `localStorage` JWT auth token a High security finding — readable by any injected script (XSS exfiltration vector). The backend must migrate to HttpOnly secure cookies before the Login screen port goes to production as part of Phase 4 of the frontend rebuild.

The frontend currently reads `localStorage.getItem('auth_token')` and sends `Authorization: Bearer <token>` on every API call. Both of those patterns must change once the backend ships the cookie model.

---

**Backend change (to be deployed)**

1. Login endpoint issues the access token as an `HttpOnly; Secure; SameSite=Strict` cookie.
2. Refresh token issued as a separate HttpOnly cookie with rotation.
3. Token validation middleware reads from the cookie. The `Authorization: Bearer` header path is kept live during the transition window.
4. Security headers added to all responses: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.

Full spec in `PROMPT_BACKEND_FUNCTIONAL_UNIT.md` Item 2.

---

**Frontend action required**

After the backend fix is deployed:

1. **Remove `localStorage.getItem('auth_token')`** from all API call headers across the frontend. The cookie is sent automatically by the browser — no manual token attachment needed.
2. **Remove `localStorage.setItem('auth_token', ...)`** from the Login flow.
3. **Remove `localStorage.removeItem('auth_token')`** from the logout flow — replace with a call to the logout endpoint that clears the cookie server-side.
4. **Update `auth_user`** — confirm whether user identity is still read from `localStorage` as `auth_user` or whether a `/api/auth/me` endpoint will be the source of truth post-migration. Backend to clarify in this document.
5. Verify the Login screen port (`Login.jsx` rebuild) is built against the cookie model, not localStorage.

Do not remove localStorage auth calls before the backend fix is live — the transition window keeps both paths working.

---

**Coordination**

Backend notifies Frontend via this document and Aria when deployed. Frontend rebuild Login port (Phase 3) must not go to staging until this item is resolved.

---

**Claude Code prompt for frontend (run when porting Login screen — Phase 3):**
```
In the frontend codebase, migrate from localStorage JWT auth to HttpOnly cookie auth.
The backend already issues the token as an HttpOnly cookie on login and accepts both
cookie and Bearer header during the transition window.

1. In Login.jsx (or wherever login is handled after the port):
   - Remove localStorage.setItem('auth_token', ...) after successful login
   - Remove localStorage.setItem('auth_user', ...) — replace with a fetch to
     GET /api/auth/me to get the current user, store result in React state or context
   - Add credentials: 'include' to the login fetch call so the cookie is received

2. Across all API call sites (search for 'auth_token'):
   - Remove the Authorization: Bearer header construction
   - Add credentials: 'include' to every fetch call instead — the browser sends
     the HttpOnly cookie automatically

3. In the logout flow:
   - Remove localStorage.removeItem('auth_token')
   - Replace with: POST /api/auth/logout with credentials: 'include'
   - This clears the cookie server-side

4. Add a GET /api/auth/me endpoint call on app load to rehydrate user identity
   instead of reading from localStorage.

Verify login, page refresh (session persistence), and logout all work correctly
before merging. The Bearer header fallback remains live on the backend during testing.
```

**Resolved: 16 Jun 2026.** Frontend migration complete. 18 files migrated from `localStorage` Bearer tokens to HttpOnly cookie (`credentials: 'include'`). Commits `353c837` (BF-002 migration) + build-fix commit (DataImportDashboard.jsx corruption repaired). `GET /api/auth/me` confirmed live and in use by `App.jsx` for session rehydration. `POST /api/auth/logout` confirmed wired in logout and inactivity timer.

**One item deferred — now resolved:** WebSocket auth. See BF-014 entry below.

---

### ITEM BF-003 — Risk settings API endpoint

**Raised by:** Axel · CTO
**Date:** 2026-05-29
**Priority:** Medium — must complete before Phase 3 Settings real-data port
**Status:** Open — backend build pending; frontend context swap required after deploy

---

**Background**

The frontend `RiskSettingsContext` (`src/contexts/RiskSettingsContext.jsx`) currently stores counterparty utilisation thresholds (`atRiskPct`, `warningPct`) in `localStorage`. This is acceptable for the Phase 2 mock-data build but is not acceptable for production — settings must be per-company, stored in the database, and editable by authorised users only.

---

**Backend change (to be deployed)**

New endpoints in `routes/settings_routes.py`:

```
GET  /api/settings/risk   → returns { counterparty_at_risk_pct, counterparty_warning_pct }
PATCH /api/settings/risk  → validates and saves updated thresholds, returns updated object
```

Full spec including validation rules, multi-tenancy, and audit logging in `PROMPT_BACKEND_FUNCTIONAL_UNIT.md` Item 5.

---

**Frontend action required**

After the backend endpoints are deployed, update `RiskSettingsContext.jsx`:

1. Replace `loadFromStorage()` (localStorage read) with a fetch to `GET /api/settings/risk` on mount.
2. Replace `localStorage.setItem(...)` in `updateSettings()` with a `PATCH /api/settings/risk` call.
3. Handle loading state — the context should expose an `isLoading` flag while the initial fetch is in flight. `Counterparties.jsx` and `Settings.jsx` consume the context and need no other changes.
4. Handle error state — if the fetch fails, fall back to defaults (80% / 60%) and surface a caption in the Settings screen.

The consuming components (`Counterparties.jsx`, `Settings.jsx`) require no changes — they read from the context only. This is by design.

---

**Coordination**

Backend notifies Frontend via this document and Aria when endpoints are deployed. Aligns with Phase 3 Settings real-data port.

---

**Claude Code prompt for frontend (run when Phase 3 Settings screen is ready):**
```
In src/contexts/RiskSettingsContext.jsx, replace localStorage with backend API calls.

1. On mount, replace loadFromStorage() with:
   fetch('/api/settings/risk', { credentials: 'include' })
     .then(r => r.json())
     .then(data => setSettings({
       atRiskPct: data.counterparty_at_risk_pct,
       warningPct: data.counterparty_warning_pct
     }))
     .catch(() => setSettings({ atRiskPct: 80, warningPct: 60 })) // fallback defaults

2. Add isLoading state — set true before fetch, false after. Expose via context.

3. In updateSettings(), replace localStorage.setItem with:
   fetch('/api/settings/risk', {
     method: 'PATCH',
     credentials: 'include',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       counterparty_at_risk_pct: newSettings.atRiskPct,
       counterparty_warning_pct: newSettings.warningPct
     })
   })

4. Handle error state — if PATCH fails, surface a caption in Settings.jsx.

Counterparties.jsx and Settings.jsx require no changes — they read from context only.
```

**Resolved (backend):** Endpoints deployed and verified 02/06/2026.
- `GET /api/settings/risk` → returns `{"counterparty_at_risk_pct": 80, "counterparty_warning_pct": 60}`
- `PATCH /api/settings/risk` → validates and saves, writes audit record
- Defaults (80/60) applied automatically if no value set for the company
Frontend action still outstanding — RiskSettingsContext.jsx swap per Claude Code prompt above.

---

---

### ITEM BF-004 — Confirm localhost:3000 in CORS allowed origins

**Raised by:** Axel · CTO
**Date:** 2026-06-01
**Priority:** Medium — blocks local integration testing for Phase 3
**Status:** Closed — confirmed 02/06/2026

---

**Background**

The frontend rebuild runs locally at `localhost:3000/rebuild`. From Phase 3 onwards it makes real API calls to `https://birk-fx-api.onrender.com`. If `localhost:3000` is not in the CORS `allow_origins` list in `birk_api.py`, every API call from the local rebuild will be blocked with a CORS error — making local integration testing impossible.

---

**Backend action required**

Check `birk_api.py` CORS middleware `allow_origins` list. Confirm `http://localhost:3000` is included. If not, add it. This is a development-only entry — it does not affect production security.

---

**Frontend action**

None — this is purely a backend config check.

---

**Resolved:** `http://localhost:3000` confirmed present in `birk_api.py` CORS `allow_origins` list. No action required. Verified 02/06/2026 — Axel · CTO.

---

## Standing pattern — audit trail documentation

Every endpoint that writes to `order_audit_log`, `value_date_audit_log`, or `hedge_corridor_log` must include an inline comment block directly above the audit INSERT explaining:
- Why the audit write exists
- What compliance requirement it satisfies
- That it must remain in the same transaction as the primary write

This is not optional documentation — it is a compliance requirement. Future developers must not remove or move these writes without a Lex sign-off.

Frontend note: if you ever see an audit write being called as a separate HTTP request rather than happening server-side, raise it with Axel immediately — that is the pattern that caused the BF-001 gap.

---

---

### ITEM BF-005 — Risk engine calculation outputs for Phase 3

**Raised by:** Axel · CTO · Finn · Treasury (FX calculation review)
**Date:** 2026-06-01
**Priority:** Medium — required before Phase 3 Risk engine real-data port
**Status:** Open — backend to build / verify

---

**Background**

The Risk engine Phase 2 screen uses mock data. Phase 3 connects to the live backend. The frontend chart and KPI tiles need structured outputs from the backend. The existing `/api/monte-carlo/simulate/exposure` endpoint may already produce some of this — backend to confirm what is already correct and what needs to be added or changed.

---

**What the frontend needs — per exposure simulation call**

The frontend `RiskEngine.jsx` consumes the following. Any endpoint redesign should return this structure (or a compatible superset):

```json
{
  "pair": "EUR/USD",
  "spot": 1.0847,
  "budget_rate": 1.0700,
  "simulation_date": "2026-06-01",
  "horizon_days": 90,

  "forward_path": [
    { "day": 0,  "rate": 1.0847 },
    { "day": 10, "rate": 1.0862 },
    ...
    { "day": 90, "rate": 1.0950 }
  ],

  "confidence_bands": [
    { "day": 0,  "p10": 1.0847, "p25": 1.0847, "p75": 1.0847, "p90": 1.0847 },
    { "day": 10, "p10": 1.0724, "p25": 1.0780, "p75": 1.0942, "p90": 1.0990 },
    ...
  ],

  "var_95_pct": -0.0187,
  "expected_shortfall_95_pct": -0.0241,

  "historical_rates": [
    { "day": -90, "rate": 1.0550 },
    { "day": -89, "rate": 1.0563 },
    ...
    { "day": -1,  "rate": 1.0839 }
  ],

  "narrative": "string — AI-generated, wrapped in disclosure"
}
```

---

**Calculation standards — what best practice looks like**

Finn · Treasury notes the following. These are the methods a institutional treasury team would expect:

**Rate model:** Geometric Brownian Motion (GBM) calibrated from historical daily returns. Not a linear drift. Daily volatility σ should be estimated from the actual last 90 days of closing rates for the pair. A simple rolling 90-day historical vol is acceptable; GARCH is better but not required for Phase 3.

**Confidence bands:** Run N simulations (minimum 5,000 paths). At each time step extract the P10, P25, P50, P75, P90 percentiles across all paths. The central path is the P50. The existing linear drift in the mock is clearly not real — the bands should fan out symmetrically as √t (GBM property).

**Historical rates:** Source from `exchangerate-api.com` (already integrated). The endpoint should accept a `history_days` parameter (default 90). Return daily closing rates for the pair going back that many calendar days. The frontend joins this line to the fan at Today's spot.

**VaR 95%:** The worst P5 outcome at the horizon — i.e. `P05 rate - spot` expressed as a signed number. Negative means adverse move. If the simulation returns the P10/P90 bands, VaR can be interpolated or re-extracted from the path distribution directly.

**Expected shortfall (ES) 95%:** The average of all paths that fall in the worst 5% at the horizon. This is the mean of all paths below the VaR threshold — more conservative than VaR and better for tail risk. Required for the Expected shortfall tab in Phase 3.

**What to check on the existing endpoint:**
- Does `/api/monte-carlo/simulate/exposure` currently use GBM or linear drift?
- Does it return percentile bands or a single path?
- Does it return historical rates alongside the simulation?
- Does it return VaR and ES, or just the narrative?

Confirm answers in this entry before Phase 3 begins.

---

**Backend status — 02/06/2026:**
New endpoint deployed: `GET /api/monte-carlo/simulate/exposure/{exposure_id}`
- ✅ Returns full BF-005 shape — all 15 keys confirmed
- ✅ `forward_path` and `confidence_bands` — 23 data points each
- ✅ `var_95_pct` and `expected_shortfall_95_pct` calculated correctly
- ✅ `ai_generated` and `fallback_used` flags present per Ada contract
- ✅ `historical_rates` — returns data when pair has history in `fx_rate_history` table; returns `[]` when not yet seeded — handle gracefully (hide line, no error)
- ✅ `vol_calibrated: true` when ≥10 days of history exist; `false` uses static vol fallback

**Historical rate data status:**
- EUR/USD: 34 days seeded (Apr–Jun 2026) ✅
- All other pairs: empty until seeded or built up via daily cron
- Daily cron `POST /api/admin/fx-history/snapshot` captures all 15 standard pairs — being wired to cron-job.org

**How to seed a new pair (Kevin — superadmin only):**
Download closing prices from investing.com, then call:
`POST /api/admin/fx-history/upload` with `{ "currency_pair": "GBP/USD", "rows": [{"date": "Jun 04, 2026", "price": 1.2750}, ...] }`
Accepts investing.com format ("Jun 04, 2026") or ISO ("2026-06-04"). Duplicates ignored.

**Frontend is unblocked for Phase 3 Risk Engine port.** Empty `historical_rates` is valid — hide the line gracefully, no crash.

---

**Frontend action required**

**Claude Code prompt:**
```
In RiskEngine.jsx Phase 3, replace MOCK_SIMULATION and MOCK_HISTORY with live API data.

1. In monteCarloService.js, update runSimulation() to call:
   GET /api/monte-carlo/simulate/exposure/{exposureId}?horizon_days=90&history_days=90
   with credentials: 'include'

2. Map the response to chart components:
   - forward_path        → central path line
   - confidence_bands    → P10/P25/P75/P90 fan
   - historical_rates    → historical line (may be empty — handle gracefully, hide line if empty)
   - var_95_pct          → VaR KPI tile
   - expected_shortfall_95_pct → ES KPI tile
   - vol_calibrated      → show "calibrated" or "estimated" label on vol display

3. Handle loading state while fetch is in flight.
4. Handle error state — show "Simulation unavailable" rather than crashing.
5. historical_rates length 0 is valid — do not error, just hide the historical line.
```

---

**Resolved (backend):** Deployed 02/06/2026. Historical rates served from internal `fx_rate_history` table — no external API dependency. EUR/USD seeded with 34 days. Daily cron populates all pairs going forward. Frontend port unblocked.

---

## Resolved items

---

### ITEM BF-004 — Confirm localhost:3000 in CORS allowed origins
**Resolved:** `http://localhost:3000` confirmed present. No action required. 02/06/2026.

---

---

---

### ITEM BF-006 — Phase 3 Exposure screen integration status

**Raised by:** Axel · CTO
**Date:** 2026-06-04
**Priority:** Info — no backend action required
**Status:** Frontend integration in progress

---

**Status update for backend unit:**

The FxOverview Phase 3 real-data port is underway. The screen now calls `GET /api/exposures/enriched?company_id={id}&include_archived=false` and renders live data. Two bugs fixed this session:

1. `useCompany()` API mismatch — corrected to use `selectedCompanyId` + `getSelectedCompany()` from CompanyContext
2. `CompanyProvider` was not wrapping the `/rebuild` route — fixed in `App.jsx`

BF-004 CORS is confirmed clear. Integration testing begins now.

**What backend should expect from the frontend in coming days:**

- FxOverview on real data — confirmed working (testing in progress)
- Next Phase 3 ports: Hedges screen, Execution screen (both will call existing enriched + tranche endpoints)
- BF-001 value-date server-side fix — frontend is waiting on backend to confirm completion before removing `POST /api/audit/value-date-change` call
- BF-005 Monte Carlo endpoint — frontend will call `monteCarloService.runSimulation()` once backend confirms the endpoint returns the structured output in BF-005

**Action needed from backend:**

1. Confirm whether the server-side value-date audit fix (second part of BF-001) has been deployed, so frontend can remove the standalone call.
2. Confirm current state of `/api/monte-carlo/simulate/exposure` against the BF-005 spec — does it already return `forward_path`, `confidence_bands`, `historical_rates`, `var_95_pct`, `expected_shortfall_95_pct`?

---

**Backend response — Axel · CTO, 02/06/2026:**

**BF-001 value-date server-side fix:** NOT yet deployed. Frontend must keep the standalone `POST /api/audit/value-date-change` call until backend confirms. This is the next item on the backend work list.

**BF-005 Monte Carlo endpoint — current state:**
- ✅ Uses GBM (Geometric Brownian Motion) — correct model
- ✅ Runs 10,000 scenarios — above the 5,000 minimum
- ✅ Calculates VaR 95% and percentiles (P5, P25, P50, P75, P95)
- ❌ Does NOT return `forward_path` array (day-by-day P50 path)
- ❌ Does NOT return `confidence_bands` array (day-by-day P10/P25/P75/P90)
- ❌ Does NOT return `historical_rates` (90-day lookback from exchangerate-api)
- ❌ Does NOT return `expected_shortfall_95_pct` (ES — mean of worst 5% paths)
- ⚠️ Volatility is currently estimated from a static lookup table, not calibrated from actual historical returns

The service needs the output restructured to match the BF-005 shape. Core simulation logic is sound — this is an output adapter change plus adding historical rates fetch and ES calculation. Backend unit will build this before Phase 3 Risk Engine port begins. Frontend should not start Phase 3 Risk Engine until backend confirms this is ready.

**Resolved:** *(info item — no resolution required)*

---

### ITEM BF-007 — Close account flow

**Raised by:** Axel · CTO
**Date:** 02/06/2026
**Priority:** Medium — required before Settings screen goes external
**Status:** Backend deployed 02/06/2026 — frontend action required

---

**Background**

Lex · Legal approved a two-part account closure pattern on 02/06/2026. Clients request closure via the Settings screen; Kevin closes manually via the admin panel. Data is retained for five years regardless (MiFID II Article 16(6)).

---

**Backend — deployed endpoints**

```
POST /api/settings/close-account/request
```
No body required beyond auth. Optionally accepts `{ "reason": "string" }`.
- Logs the request to `order_audit_log`
- Emails Kevin at kg@sumnohow.com via Resend
- Returns confirmation + Lex-approved data retention notice
- Does NOT close the account — Kevin does that manually

```
DELETE /api/admin/companies/{company_id}
```
Superadmin only. Updated response now includes `data_retention_notice` and `closed_at`.

---

**Frontend action required**

In the Settings screen, add a "Close account" section:

1. A button labelled **"Request account closure"** — not "Delete account" (prohibited term per Lex)
2. On click, show a confirmation modal with an optional reason field and this copy:
   *"Your request will be sent to our team. Your data is retained for a minimum of five years in accordance with our regulatory obligations."*
3. On confirm, call `POST /api/settings/close-account/request` with `credentials: 'include'` and optionally `{ "reason": "..." }`
4. On success, display the `message` field from the response and disable the button

**Claude Code prompt for frontend:**
```
In the Settings screen, add a "Close account" section at the bottom of the page.

1. Add a "Request account closure" button (never "Delete account" — prohibited term).
2. On click, show a confirmation modal with:
   - Optional textarea: "Reason for closing (optional)"
   - Warning copy: "Your request will be sent to our team. Your data is retained
     for a minimum of five years in accordance with our regulatory obligations."
   - Confirm and Cancel buttons
3. On confirm, call:
   POST /api/settings/close-account/request
   with credentials: 'include'
   and body: { "reason": reasonText }
4. On success, show the response.message to the user and disable the button.
5. On error, show a generic error message — do not expose API error details.
```

---

**Resolved:** *(pending — frontend to implement)*

---

---

### ITEM BF-008 — FX Overview Phase 3 deployment — status and findings

**Raised by:** Axel · CTO
**Date:** 2026-06-04
**Priority:** Info + one action item
**Status:** Deployment in progress

---

**What happened today:**

The FX Overview screen (Phase 3 first real-data port) completed the full sign-off chain — Pixel · Cipher · Lex · CEO MiniMe — and has been pushed to the live repo at `birk-dashboard.onrender.com/rebuild`. Build is currently resolving (missing Phase 2 base files being added).

**Integration finding — enriched endpoint response shape:**

The `/api/exposures/enriched` endpoint returns `{ items: [...], portfolio: {...} }`. The frontend was treating the response as a bare array and falling back to `data.exposures` (which doesn't exist) — resulting in an empty screen. Fixed on the frontend: now reads `data.items`. No backend change required. But flagging so the backend unit is aware of the response shape dependency — if the `items` key ever changes, the frontend breaks.

**Staging architecture — confirmed and documented:**

There is no separate Render staging environment. The frontend deploys directly to production at `birk-dashboard.onrender.com`. The `/rebuild` route is unlisted and invisible to pilot clients. The legacy app at `/dashboard` is unaffected. Kevin has approved this approach with full awareness. A proper staging environment on Render should be constituted before pilot rollout — this is a backend-aware decision as it will need a non-production backend to point at, or a read-only mode.

**Open items for backend from today's session:**

1. **BF-001 value-date audit fix** — frontend is ready to remove the standalone `POST /api/audit/value-date-change` call. Backend to confirm the server-side fix (`PATCH /api/tranches/{id}/value-date`) is fully deployed and tested before frontend removes the old call.

2. **BF-002 HttpOnly cookie migration** — still open. Does not block FX Overview. Blocks Login screen port going to production.

3. **Condition 3 (audit log atomic transaction gap)** — CEO MiniMe gate confirmed this must close before FX Overview goes to production with real pilot data and before the data room opens.

4. **Proper staging environment** — should be scoped before pilot rollout. Frontend cannot safely test against production indefinitely.

**No backend action required on the enriched endpoint.** The `items` key shape is now handled correctly on the frontend.

---

---

## Development pace policy

*Agreed by Kevin (founder), 05/06/2026*

All three units — Backend, Frontend, and Legal (Lex) — must stay in step. No unit builds ahead of a gate that another unit owns.

**Rules:**
- Frontend does not wire execution logic until Lex has signed off the execution flow (Condition 8). Screen structure can be built; the execute button stays unwired.
- Backend does not build endpoints for features that have not been scoped with Frontend. If Frontend mentions a new feature (e.g. file upload), Backend must understand what it is before building anything.
- If Frontend wants to start a new screen or feature, they must confirm with Backend that the required endpoints exist or are in scope before building.
- Lex gates (Condition 8, and any future compliance reviews) are hard stops. Neither Frontend nor Backend may go around them.

**Current status — 09/06/2026:**

| Item | Backend | Frontend | Lex | Status |
|---|---|---|---|---|
| Execution screen — Phase 3 port | ✅ Ready | ✅ Deployed 08/06/2026 | ✅ Signed off | Complete — Condition 8 gate still applies to execute button |
| Execution screen — execute button | ✅ Ready | Hold | ⏳ Must review first (Condition 8) | Blocked on Lex |
| Condition 9 — value-date PATCH in execution screen | ✅ Deployed | ⏳ Wire in execution screen | N/A | Frontend action |
| GDPR data export endpoint | ✅ Deployed 08/06/2026 | N/A — backend only | ✅ Lex signed off 05/06/2026 | Complete |
| Float → Numeric DB migration | ✅ Alembic migration applied 13/06/2026 | N/A | N/A | ✅ Complete |
| File upload feature | ❌ Not scoped | Hold | N/A | Blocked — needs scoping |
| BF-002 — cookie auth | ✅ Deployed | ✅ Deployed 16/06/2026 | N/A | ✅ Complete (WS auth deferred) |
| BF-003 — risk settings | ✅ Deployed | ⏳ Pending Settings port | N/A | Frontend action |
| BF-007 — close account UI | ✅ Deployed | ⏳ Pending Settings port | N/A | Frontend action |

---

---

### ITEM BF-009 — `POST /api/audit/order-sent` must return inserted row `id`

**Raised by:** Axel · CTO (Frontend unit finding)
**Date:** 2026-06-05
**Priority:** Medium — cosmetic issue in production; does not affect audit trail correctness
**Status:** Open — backend action required

---

**Background**

`POST /api/audit/order-sent` currently returns `{"message": "Order logged"}`. The Execution screen Phase 3 port shows a confirmation card after the execute button is pressed. The card displays an order reference derived from the new row's `id` (formatted as `ORD-XXXXX`). Because the `id` is not returned, the card currently shows `ORD-00000`.

The audit record itself is written correctly — this is a display-only issue.

---

**Backend action required**

Add `RETURNING id` to the INSERT statement in `log_order_sent` in `birk_api.py` and include the id in the response:

```python
result = db.execute(_text("""
    INSERT INTO order_audit_log (...) VALUES (...) RETURNING id
"""), {...})
row_id = result.fetchone()[0]
db.commit()
return {"message": "Order logged", "id": row_id}
```

---

**Frontend action**

None — the frontend already handles `data.id`. Will display correctly once backend returns it.

**Resolved (backend): 13 Jun 2026.** `RETURNING id` confirmed deployed. Response is now `{"message": "Order logged", "id": row_id}`. Frontend to verify order reference card shows correct `ORD-XXXXX` format on next execution. No frontend code changes required — frontend already handles `data.id`.

---

---

### GDPR data export — Lex field sign-off

*Lex · Legal, 05/06/2026*

Backend may build `GET /api/admin/companies/{company_id}/export` to the following spec:

**Include:** company profile, users (exclude password hashes), exposures (including soft-deleted), hedge_tranches, order_audit_log, value_date_audit_log, hedge_corridor_log, hedging_policies.

**Exclude:** password hashes, any other company's data, fx_rate_history (market data, not personal data).

**Format:** JSON primary. CSV secondary option acceptable.

**Access:** Superadmin may export any company. Company_admin may export their own company only.

This satisfies GDPR Article 20 data portability. Lex sign-off confirmed.

---

---

## Routing note — 13 Jun 2026 (Session 2)

**To: Backend unit · Three items for confirmation**

**1. BF-011 — Facilities utilisation endpoint: tranche_count and next_maturity confirmed**

Frontend verified that `GET /api/facilities/utilisation/{company_id}` already returns `tranche_count` and `next_maturity` in the response. Counterparties.jsx updated to display both fields. No backend action required — logging for the record.

**2. BF-012 — Confirm /api/settings/risk is deployed on live backend**

Frontend session built `RiskSettingsContext.jsx` against `GET /api/settings/risk` and `PATCH /api/settings/risk` per BF-003 (marked resolved in this doc 02/06/2026). However, these endpoints are NOT present in the backup codebase (`routes/settings_routes.py`). The backup may be behind the live Render deploy.

Please confirm one of:
- (a) These endpoints are deployed on `birk-fx-api.onrender.com` and the backup is simply behind. Frontend context will work as-is once deployed.
- (b) These endpoints were not built. Frontend context falls back to defaults (80/60) gracefully, but threshold edits will not persist until the backend is in place.

If (b): Claude Code prompt is already written in BF-003 entry above.

**3. BF-013 — Confirm /api/settings/close-account/request is deployed on live backend**

Same issue as BF-012. BF-007 marks this as deployed 02/06/2026, but it is not in the backup codebase. Settings.jsx close-account section is fully wired and will work correctly if the endpoint exists. If it does not exist, the modal will show a generic error on submit — no crash.

Please confirm deployment status. If not built, the Claude Code prompt in BF-007 entry above is ready for the backend unit.

**Ball is in: Backend unit (confirmation only — no frontend changes needed either way).**

---

---

## Routing note — 16 Jun 2026 (session continuation)

**To: Frontend unit · Four confirmations**

**1. BF-002 backend route files — all data endpoints now accept cookies**

Post-deploy 401s on data endpoints were caused by 9 route files each having their own Bearer-only auth function. Fixed: `services/shared_auth.py` created as single source of truth (cookie-first, Bearer fallback), all 9 route files updated. Committed and deployed 16/06/2026. All HTTP endpoints now accept HttpOnly cookies correctly.

**2. BF-012 — `/api/settings/risk` confirmed deployed**

Answer is (a): endpoints are live on `birk-fx-api.onrender.com`. The backup codebase was simply behind the live deploy. `RiskSettingsContext.jsx` will work correctly against the live backend. `GET /api/settings/risk` at line 135 and `PATCH /api/settings/risk` at line 164 in `routes/settings_routes.py`.

**3. BF-013 — `/api/settings/close-account/request` confirmed deployed**

Answer is (a): endpoint is live. `POST /api/settings/close-account/request` confirmed present in `routes/settings_routes.py`. The Settings.jsx close-account modal will work correctly.

**4. BF-005 Risk Engine — frontend unblocked, proceed**

Backend deployed 02/06/2026. Endpoint: `GET /api/monte-carlo/simulate/exposure/{exposure_id}?horizon_days=90&history_days=90`. Returns full BF-005 shape including `forward_path`, `confidence_bands`, `historical_rates`, `var_95_pct`, `expected_shortfall_95_pct`. Use `credentials: 'include'` — cookie auth now active.

Empty `historical_rates` (for pairs not yet in `fx_rate_history` table) is valid — hide the historical line gracefully, no error. EUR/USD has 34 days seeded. Other pairs accumulate daily via cron.

**Ball is in: Frontend unit (BF-005 build).**

---

---

### ITEM BF-014 — WebSocket auth migration (localStorage → React state)

**Raised by:** Axel · CTO (deferred from BF-002)
**Date:** 2026-06-17
**Priority:** Medium — security improvement; last localStorage token exposure
**Status:** ✅ Complete — 17/06/2026

**Background**

`useRateTicker.js` was still reading the JWT from `localStorage.getItem('auth_token')` for the WS URL query param — the only remaining `localStorage` token usage after BF-002. WebSocket cannot use HttpOnly cookies or HTTP headers, so a different approach was needed.

**Decision — Option (b) approved by Cipher · Tech DD, 17/06/2026**

- Option (a) short-lived ws-ticket (Redis/in-memory store): more secure, higher complexity — deferred to next Cipher audit
- Option (b) token from React state: adequate for current risk profile, zero infrastructure cost — approved

**Changes deployed 17/06/2026:**

- `routes/auth_routes.py` — `GET /api/auth/me` now returns `ws_token` (raw JWT from cookie/Bearer). Cookie-first; Bearer fallback during transition.
- `App.jsx` — `wsToken` React state added. Captured from `me.ws_token` on page load and from `data.access_token` on login. Cleared on logout (both manual and inactivity). Passed to `AuthenticatedApp` → `AppShell` → `RateTicker`.
- `RateTicker.jsx` — accepts `wsToken` prop, forwards to `useRateTicker`.
- `useRateTicker.js` — signature updated to `(companyId, wsToken = '')`. Replaces `localStorage.getItem('auth_token')` with `wsToken`. Added `wsToken` to `useEffect` deps — effect re-runs when token arrives after mount, upgrading from HTTP polling to WS. If token is empty, falls back to HTTP polling gracefully.

**Security notes (Cipher):**
- Token is in JS memory only — not persistent, not accessible via `localStorage.getItem()`
- Token still appears in WS URL query param — unavoidable for WebSocket; backend logs only `company_id`, never the token
- XSS that can call `/api/auth/me` with `credentials: 'include'` can get the token — but that XSS already has full cookie-bearing API access, so no new attack surface
- Revisit Option (a) at next Cipher audit or first external client onboard

**No further action required.**

---

## Pace policy table — updated 17 Jun 2026

| Item | Backend | Frontend | Lex | Status |
|---|---|---|---|---|
| Execution screen — Phase 3 port | ✅ | ✅ Deployed | ✅ Signed off | Complete |
| Execution screen — execute button | ✅ | Hold | ⏳ Condition 8 | Blocked on Lex |
| Condition 9 — value-date PATCH in execution screen | ✅ | ⏳ Wire in execution screen | N/A | Frontend action |
| GDPR data export endpoint | ✅ | N/A | ✅ | Complete |
| Float → Numeric DB migration | ✅ | N/A | N/A | ✅ Complete |
| BF-002 — cookie auth | ✅ All routes | ✅ 18 files | N/A | ✅ Complete |
| BF-014 — WS auth (localStorage → React state) | ✅ /api/auth/me ws_token | ✅ App.jsx + RateTicker + useRateTicker | N/A | ✅ Complete 17/06/2026 |
| BF-003 — risk settings | ✅ | ⏳ Settings port | N/A | Frontend action |
| BF-005 — risk engine | ✅ | 🔨 Building 16/06/2026 | N/A | In progress |
| BF-007 — close account UI | ✅ | ⏳ Settings port | N/A | Frontend action |
| BF-009 — order ID | ✅ | ✅ Verify in prod | N/A | Frontend to verify |
| BF-010 — Forecast tab | N/A | ✅ Fix deployed | N/A | Verify in prod |
| BF-012 — risk settings deployment | ✅ Confirmed | ✅ Resolved | N/A | ✅ Closed |
| BF-013 — close account deployment | ✅ Confirmed | ✅ Resolved | N/A | ✅ Closed |

---

*Document created: 2026-05-29 — Axel · CTO*
*Pace policy added: 05/06/2026 — Kevin (founder)*
*GDPR export field sign-off: 05/06/2026 — Lex · Legal*
