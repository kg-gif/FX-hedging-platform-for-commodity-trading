# SUMNOHOW — PRODUCT BACKLOG

## 🔴 NEXT UP (PILOT CRITICAL)
- [ ] Pilot readiness end-to-end test — full customer journey walkthrough as a CFO would see it
- [ ] **File Upload — Exposure Import** *(In progress)* — CSV/Excel upload now parses rows and inserts exposures. Remaining: end-to-end test with real file from pilot customer; review field mapping with Kevin; add error-row download (rows that failed validation). See `routes/data_import_routes_fastapi.py`.

## 🟡 NEEDS SCOPING / IDEATION
- [ ] Exposure register logic — review what fields are shown, how P&L is calculated, what "correct" looks like for pilot customers. Needs design session.
- [ ] Dynamic hedging policy zones — Policy should define three zones: Defensive (minimum hedge %), Base (target %), Opportunistic (maximum % when market moves favourably). Triggers set as % move vs budget rate. Flows through to Recommendations (zone per exposure), Dashboard (zone colour coding), Simulator (model impact of hedging up/down). Requires Policy data model change and design session before building.
- [ ] Tying tabs together — Dashboard, Hedging, Reports and Simulator should share state (e.g. clicking a breach on Dashboard takes you to the relevant hedge recommendation). Needs UX design session.
- [ ] Simulator + Scenario Analysis — build backend endpoints and frontend for what-if modelling: hedge ratio slider, scenario severity, worst/best case P&L comparison. Placeholder cards currently shown on Hedging tab.
- [ ] Active Hedge Portfolio — build backend endpoints and frontend for tracking executed hedge positions, maturity dates, unrealized P&L. Placeholder card currently shown on Hedging tab.
- [ ] Simulator to stop/limit alert corridors — use scenario analysis output to automatically suggest or set take profit and stop loss levels per exposure. Core risk engine differentiator. Needs design session.
- [ ] Execution logging — decision needed on what feeds into reports: auto-log on email open (built) vs manual mark as executed (built) vs bank confirmation upload.
- [ ] Exposure forecasting model — upload 2 years of AP/AR history to forecast next 12 months of FX exposure by currency pair. Output: suggested hedging plan, timing, and amounts. Feeds directly into simulator corridors. Core IP — needs dedicated design session.
- [ ] Start/end date + historical rate on exposures — rate should reflect rate at trade inception, calculate take profit and stop loss from there. Needs design session.
- [ ] MC-derived corridor defaults — Run Monte Carlo simulation per exposure to derive default TP/SL corridor widths based on historical volatility and exposure tenor, rather than flat percentages. Output: 95th-percentile expected move as suggested corridor width, per currency pair and time horizon.
- [ ] Weekend market hours flag — rate API returns interpolated/cached rates on Saturday and Sunday (markets closed Fri 5pm NY → Sun 5pm NY). Add market status check: if weekend or public holiday, show "Market Closed" indicator on dashboard and digest email, and suppress rate refresh to avoid misleading P&L movements.

## 🟡 FEATURE FLAGS / TIERED MODULE ACCESS

**Priority:** Post-pilot
**Description:** Gate Risk Engine modules (Sensitivity Analysis, Cash Flow-at-Risk, VaR, Revenue Impact, Hedge Optimisation) and future Reports modules behind a per-company feature flag. Allows phased rollout: pilot customers see full suite; free/lower tiers see Coming Soon.

**Approach:**
- Add `feature_flags` JSONB column to `companies` table (e.g. `{ "risk_engine": ["scenario", "sensitivity"] }`)
- Backend: expose flags on company settings endpoint
- Frontend: RiskEngine and Reports read flags from company context; modules not in flags show Coming Soon card
- Admin: toggle flags per company in Admin Panel

**Status:** Needs design session — define tier structure before building

---

## 🟡 RISK ENGINE ROADMAP

The Risk Engine tab currently has Scenario Analysis live and five modules as Coming Soon. Planned build order:

| Module | Priority | Notes |
|--------|----------|-------|
| Sensitivity Analysis | High | Which exposures are most exposed to rate moves — table + heatmap |
| Cash Flow-at-Risk | High | Stress-test cash positions under adverse scenarios |
| Revenue Impact | Medium | FX drag on P&L by currency pair and quarter |
| VaR | Medium | Portfolio-level Value-at-Risk for board packs |
| Hedge Optimisation | Low | AI-generated portfolio-wide hedge strategy |

Each module requires backend endpoints before frontend build. Sensitivity and CFaR share enriched exposure data already available. VaR requires Monte Carlo infrastructure. Hedge Optimisation requires AI integration (ANTHROPIC_API_KEY already in env).

---

## 🤖 AI-GENERATED ZONE TRIGGERS
**Priority:** Pre-scale (Phase 2 — post pilot)
**Description:** Instead of manually setting Defensive/Opportunistic trigger percentages, the system suggests optimal triggers based on customer inputs and market data.

### CUSTOMER INPUTS
- Gross margin % (what rate move they can absorb before meaningful P&L impact)
- Planning horizon (3 / 6 / 12 / 24 months)
- Risk appetite (Conservative / Balanced / Aggressive)
- Currency pairs and volumes

### MARKET DATA
- Historical realised volatility per currency pair (e.g. EUR/NOK 1-year)
- Current implied volatility (options market — indicates near-term market expectation)
- Seasonal patterns derived from customer's own historical exposure data

### OUTPUT
- **Suggested Defensive trigger:** "Based on your 8% gross margin and EUR/NOK volatility, a 2.5% adverse move represents meaningful margin erosion"
- **Suggested Opportunistic trigger:** "A 3% favourable move historically reverts within 6 weeks for EUR/NOK"
- Out-of-the-box defaults by industry vertical

### STANDARD DEFAULTS (OUT OF THE BOX, BEFORE AI PERSONALISATION)
| Profile | Defensive trigger | Opportunistic trigger |
|---------|------------------|-----------------------|
| Conservative | 2% | 3% |
| Balanced | 3% | 4% |
| Aggressive | 5% | 7% |

### DEPENDENCIES
- Volatility data feed (realised: can derive from existing rate history; implied: requires options API)
- AI recommendation engine (ANTHROPIC_API_KEY already in env)
- Policy zones feature must be fully live first

**Status:** Backlog — requires volatility data feed and AI recommendation engine. Validate trigger logic with 2+ pilot customers before building.

---

## 🟡 STRATEGIC FEATURES (NEEDS DESIGN SESSION)

- [ ] **AI Market Analysis** — AI-generated commentary on rate direction, volatility regime and optimal hedge timing per currency pair. Pulls live rates, compares to budget, flags elevated risk conditions. Output: plain-English insight card per pair on dashboard and hedging tab. Core differentiator. Requires design session.
- [ ] **Onside / Offside (MTM Position)** — Mark-to-market valuation of all open forward contracts vs current spot. Shows whether each hedge is in-the-money (onside) or out-of-the-money (offside). Critical for margin call awareness. Required for any client hedging with forwards. Table-stakes for $20M+ ICP. Needs design session.
- [x] **Trading Facility Usage — Phase 1** — ✅ Live. Facilities created/edited/soft-deleted in Settings → Bank Details. Dashboard shows utilisation cards per bank with progress bars (green/amber/red). Critical banner triggers at >90%. Execute modal lets user assign tranche to a facility. Reports → Trading Facilities shows per-facility utilisation table with filters. See `routes/facility_routes.py`.
- [ ] **Trading Facility Usage — Phase 2** — Per-facility margin call threshold (separate from portfolio threshold). Facility expiry dates + renewal alerts. Multi-currency facility limits (not just EUR equivalent). Bank API integration for real-time facility confirmation. Status: Phase 1 live. Phase 2 requires bank relationship data.

- [ ] **Margin Call Awareness — Phase 2** — Bank credit line + ISDA margin calculation. Inputs: client's facility limit per bank, ISDA Initial Margin schedule, VM threshold. Output: actual margin call amount if bank called today, facility headroom consumed, countdown to breach. Requires bank API integration (Phase 2) or manual facility limit entry (interim). See `routes/margin_call_routes.py` for Phase 1 detection logic.
- [ ] **Budget Rate Calculation (AI-Assisted)** — AI suggests a defensible budget rate per currency pair based on forward curve, historical volatility, and hedge tenor. Clearly labelled as a suggestion — final rate set by the CFO. Reduces manual research time. Must not be positioned as a recommendation or it creates liability.
- [ ] **Multi-Company (Parent/Daughter)** — Parent entity sees consolidated group exposure + P&L across all subsidiaries. Daughter entities see only their own data. Group-level hedging can offset subsidiary positions before execution (netting). Architecture change required — design session before building. High enterprise value.
- [ ] **Exposure Forecasting (AI)** — Upload 12-24 months of AP/AR history to forecast next 12 months of FX exposure by currency pair. Output: projected exposure by month, suggested hedge plan, timing and amounts. AI layer requires sufficient historical data — capture data now, build forecasting after 2-3 pilots have 6+ months of data.
- [ ] **Forward Rate Projections** — Show 30/60/90-day forward rates for each currency pair on the dashboard and exposure register. Use forward curve (interest rate differential method) as a proxy. Helps CFO understand where rates are "priced to go" vs current budget rate, supporting hedging timing decisions. Prerequisite for Forecasting feature.
- [ ] **Hedge Accounting (IAS 39 / IFRS 9)** — Formal hedge designation, effectiveness testing (80-125% rule), and documentation pack. Allows listed/regulated clients to apply hedge accounting treatment and reduce P&L volatility. High complexity, high value for larger corporates. Series A feature — scope now, build later.
- [ ] **FX Netting (Multi-Entity)** — For parent/daughter clients: identify offsetting exposures across entities before hedging. Net GBP payable in one entity against GBP receivable in another. Reduces transaction costs and facility usage. Linked to multi-company feature.

## 💰 REVENUE FORECASTING
**Priority:** Post-pilot
**Description:** Forward-looking FX impact on revenues and costs.
**Inputs:** budget rates, exposure schedule, rate forecasts (manual + API)
**Outputs:** Forecasted P&L, cash flow projections, variance vs budget
**Dependency:** Cash Flow-at-Risk module (Risk Engine)
**Status:** Backlog

---

## 🏢 PARENT/DAUGHTER COMPANY RELATIONSHIPS
**Priority:** Pre-scale
**Description:** UI to link subsidiary companies to a parent. Parent company admin sees consolidated view across all children. Daughter entities see only their own data.
**DB column:** `parent_company_id` already added to `companies` table (migration runs on startup).
**Status:** DB ready, UI in backlog

---

## 📧 MARGIN CALL — PHASE 2 ENHANCEMENTS
**Priority:** Pre-pilot
**Status:** Core fix deployed (BCC, grouped email, weekend suppression, acknowledgement link). Enhancements backlogged.

Phase 1 fixes deployed:
- ✅ BCC on all alert emails — recipients cannot see each other
- ✅ Grouped margin call — ONE email per company with all at-risk tranches
- ✅ Email subject shows count ("3 positions") not pair name
- ✅ Weekend suppression — no alerts on Saturday/Sunday
- ✅ One-click acknowledge link in email body
- ✅ Acknowledged alerts extend cooldown to 48h
- ✅ MTM Report shows Acknowledged column

Phase 2 enhancements (backlogged):
- [ ] Configurable cooldown period in Settings (default 24h; default after ack 48h)
- [ ] Escalation: if unacknowledged after 48h, escalate to company admin
- [ ] Per-tranche acknowledge from MTM Report (not just email link)
- [ ] Margin call summary in daily digest (if any active, consolidate into digest rather than separate email)
- [ ] Severity tiers: Warning (threshold%) vs Critical (2× threshold%) with different email styling

---

## 🔀 PARTIAL HEDGE — REMAINING OPEN EXPOSURE WORKFLOW
**Priority:** Pre-pilot
**Description:** When an exposure is partially hedged (e.g. EUR/NOK 75% hedged, 25% open), the system should surface the open remainder clearly and prompt for a decision: hedge remainder, leave open, or mark as intentional. Currently falls into In Progress with no clear next action. Needs workflow guidance and recommendation logic for the open portion.
**Status:** Backlog

---

## 💱 OPEN REMAINDER — SETTLEMENT PURCHASE PROMPT
**Priority:** Pre-pilot (critical for workflow completeness)
**Description:** Once an exposure is hedged to policy target (e.g. 75%), the remaining open amount (e.g. 25%) still needs to be transacted before value date — either as a forward or at spot.

System must:
1. Flag the open remainder on approach to value date
2. Prompt user to either: (a) hedge remainder as additional forward, (b) mark as "will transact at spot", or (c) leave open with reason
3. Once all tranches + remainder are accounted for → mark exposure as fully concluded
4. Maturity Schedule must show upcoming remainder actions

This is standard FX workflow — hedge protects the rate, but the physical currency transaction still needs to complete.
**Status:** Backlog — validate exact workflow with pilot customer

---

## 🔄 FORWARD ROLL FUNCTIONALITY
**Priority:** Pre-scale
**Description:** Roll a maturing forward to a new value date.

**Mechanics:**
- Close existing tranche at current spot + open new forward at new maturity
- Capture roll cost/gain as separate P&L line item
- Link rolled tranches via `parent_tranche_id` FK on `hedge_tranches`
- Show roll history in Hedge Audit Trail (Reports tab)
- Email notification to company admin on roll execution
- Audit log: original tranche, new tranche, roll rate, roll cost/gain, `executed_by`, timestamp

**Note:** Requires bank confirmation workflow — roll must be agreed with counterparty bank first before logging in the platform.

**DB change:** `ALTER TABLE hedge_tranches ADD COLUMN IF NOT EXISTS parent_tranche_id INTEGER REFERENCES hedge_tranches(id)`

**Status:** Backlog — validate workflow with pilot customer before building

---

## 🔁 ROLLOVER COST CALCULATOR
**Priority:** Pre-pilot
**Description:** When a forward approaches maturity and the underlying exposure continues, calculate the cost of rolling the position forward rather than closing and re-hedging.

**Inputs:**
- Existing forward rate
- Current spot rate
- New value date
- Forward points for new tenor

**Outputs:**
- Cost/benefit of rolling vs closing and re-hedging
- Break-even rate on the new forward
- P&L impact of the roll (close-out gain/loss + new hedge cost)

**Display:** "Calculate Rollover" button on each Maturity Schedule tranche row (appears when ≤60 days to maturity) → modal with full calculation breakdown.

**Useful for:** Customers running continuous rolling forwards (e.g. 3-month EUR/NOK forwards rolled every quarter). Rollover prompt already surfaces in Maturity Schedule for eligible tranches — this modal is the natural next step.

**Status:** Backlog — validate calculation methodology with pilot customers before building

---

## ✅ TRADE CONFIRMATION — AUDIT TRAIL
**Priority:** Pre-pilot

### PHASE 1 (BUILD NEXT): TRADE REFERENCE NUMBER
- Add `bank_reference` field to `hedge_tranches`
- Editable field on executed tranches in register
- Required to move status from `executed` → `confirmed`
- Audit log: reference number, added by, timestamp
- Display in MTM report and Hedge Audit Trail

### PHASE 2 (PRE-SCALE): CONTRACT NOTE UPLOAD
- Upload PDF/image of bank confirmation per tranche
- Store securely, link to tranche record
- Paperclip icon on confirmed tranches
- Downloadable in audit trail export
- Compliance requirement for $20M+ ICP

### PHASE 3 (POST-PILOT): FULL CONFIRMATION WORKFLOW
- Structured confirmation: date, counterparty, agreed rate vs executed rate, value date match
- Rate tolerance check: flag if confirmed rate differs from executed rate by more than 2 pips
- Four-eyes principle option: execute and confirm must be different users

### CURRENT ISSUE TO FIX ALONGSIDE PHASE 1
Tranches showing `confirmed` without a recorded confirmation event. Find where `confirmed` status is set in codebase — ensure it requires explicit user action and audit log entry.

**Status:** Phase 1 ready to build when fix queue cleared

---

## 📐 FORWARD POINTS DISPLAY
**Priority:** Pre-pilot
**Description:** Show forward points on all forward tranches. Forward points = difference between the forward rate and spot rate, expressed in pips. Positive = forward premium; negative = forward discount. Helps treasurers understand the cost of hedging further out vs near-dated forwards.

**Formula:** `forward_points = (forward_rate − spot_rate) × 10,000`

**Display on:**
- Execute modal — show before confirming the rate
- Maturity Schedule — cost of carry to value date
- MTM Report — inception forward points vs current

**Reporting:**
- Cost of carry in EUR per annum on each forward
- Aggregate carry cost across portfolio in MTM Report — important for CFO board packs and auditor review

**Data source (decision needed before building):**
- Requires actual forward rate data from a pricing provider (not derivable from spot alone)
- Phase 1 fallback: derive from interest rate parity — `Spot × (1 + base_rate × days/360) / (1 + quote_rate × days/360)` — but needs interest rates per currency (manual input in Settings or ECB feed)
- Phase 2: direct forward rate feed from FX pricing provider

**Status:** Backlog — requires forward rate data from pricing provider (not just spot); data source decision needed before scoping

---

## ℹ️ HELP SYSTEM — THREE LAYERS

### LAYER 1: INLINE TOOLTIPS ✅ LIVE
- ⓘ icon on every column header in Exposure Register (Locked P&L, Floating P&L, Combined P&L, Hedge %, Corridor, Status, Bank Ref, MTM vs Inception, MTM vs Budget)
- Plain English explanation on hover with "Learn more →" link to /glossary
- COLUMN_TOOLTIPS and GLOSSARY in `frontend/src/utils/constants.js`

### LAYER 2: GLOSSARY PAGE ✅ LIVE
- Route: `/glossary` — accessible from Settings → Help & Glossary
- 27 terms grouped by category: Rates & Pricing, P&L, Hedging, Risk & Policy, Reporting
- Each term: Name → Plain English → Why it matters → Example
- Real-time search across all terms and definitions
- Print/PDF export via browser print dialog (branded header)

### LAYER 3: HELP BOT (POST-PILOT)
- Embedded AI assistant using Claude API
- Context-aware: knows user's actual portfolio data
- Triggered by floating help button bottom-right
- Example questions: "Why is my EUR/NOK in defensive zone?", "What should I do about the margin call risk?", "Explain my MTM vs budget"
- Always adds disclaimer: not financial advice
- Validate need with 2+ pilot customers before building

**Status:** Layers 1 and 2 live. Layer 3 post-pilot.

---

## ♿ ACCESSIBILITY — WCAG 2.1 AA COMPLIANCE
**Priority:** Pre-pilot
**Description:** Ensure the platform meets WCAG 2.1 AA accessibility standards before external demos. Enterprise procurement teams often require accessibility certification — important for ICP.

**Requirements:**
- Audit and fix colour contrast ratios (minimum 4.5:1)
- Add `aria-label` to all icon-only buttons (pencil, trash, expand, etc.)
- Ensure all form fields have visible labels
- Keyboard navigation support throughout — tab order, focus rings, Enter/Escape for modals
- Never rely on colour alone to convey information (all P&L values already have +/− signs — good)
- Test with screen reader (VoiceOver on Mac / NVDA on Windows)

**Note:** P&L values already have +/− signs so colour-blind users are covered there. Icon-only buttons are the highest-priority gap.

**Status:** Backlog — run audit before first external demo

---

## 🎭 DEMO MODE / DEMO RESET
**Priority:** Pre-pilot
**Description:** One-click "Reset Demo" for sales demos and onboarding. Restores a company's data to a known clean state without affecting other companies.

**Requirements:**
- Superadmin-only endpoint: `POST /api/admin/companies/{id}/reset-demo`
- Replaces all exposures, tranches, and audit logs for the target company with a curated seed dataset
- Seed data: 4–6 exposures (mix of pairs, statuses — OPEN / IN PROGRESS / HEDGED), realistic budget rates, 1–2 executed tranches with corridor set
- Does NOT touch users, settings, or facilities
- Admin UI: "Reset to Demo Data" button on company row (superadmin only), with confirmation modal

**Approach:**
- Store seed data as a Python dict in `routes/admin_routes.py` (not a DB table — it's infrequent and should be version-controlled)
- Soft-delete existing exposures (`is_active = false`), insert fresh seed rows
- Write one audit log entry per new tranche so Reports tab shows activity

**Status:** Backlog — needed before first sales demo

---

## 📅 FX EXPOSURE FORECASTING MODULE
**Priority:** Pre-pilot (Phase 1 immediate, Phases 2–4 staged)

### STRATEGIC CONTEXT
Most mid-market CFOs hedge off incomplete exposure data — they hedge what they know about, not what they owe. This module aggregates multiple data sources into a single auditable exposure position, feeding the existing policy engine with better inputs.

### ARCHITECTURE: EIGHT DATA LAYERS (ADDITIVE — CUSTOMERS ONBOARD LAYERS THEY CAN, STARTING SIMPLE)

| Layer | Name | Status |
|-------|------|--------|
| 1 | Historical Baseline — CSV bank statement upload | Phase 2 |
| 2 | Budget Rate Exposure — already built (`budget_rate` field) | ✅ Live |
| 3 | ERP / AP / AR — structured CSV upload | Phase 3 |
| 4 | Open Banking — live bank feed API | Phase 4 |
| 5 | Payroll & CapEx — HR/finance manual input | Phase 2 |
| 6 | CRM Pipeline — Salesforce/HubSpot | Phase 3 |
| 7 | Hedge Book Import — existing derivatives import | Phase 2 |
| 8 | AI Forecast Enhancement — ML + macro signals | Phase 4 |

### DB CHANGES (PHASE 1 — LOW COST, ENABLES EVERYTHING)
```sql
ALTER TABLE exposures ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'manual';
-- Values: manual | csv_import | erp | bank_feed | crm | ai

ALTER TABLE exposures ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'COMMITTED';
-- Values: COMMITTED | PROBABLE | ESTIMATED
```

### PHASE 1 ✅ (BUILT)
- Exposure timeline view: maturity date chart grouped by currency (stacked bar — hedged/open split per month)
- Confidence badges on every exposure row (COMMITTED/PROBABLE/ESTIMATED) — click to cycle, saved via PATCH
- `data_source` field displayed in register and audit trail
- Forecasting section in Risk Engine tab with summary strip (30/90/12-month) + expandable month detail
- Confidence-weighted exposure in hedging recommendations engine (COMMITTED 1.0 / PROBABLE 0.8 / ESTIMATED 0.5)

### PHASE 2 (POST-PILOT 1)
- Layer 1: Historical baseline from CSV bank statement upload — statistical rolling 12-month forecast per currency pair, seasonal index detection
- Layer 5: Payroll & CapEx manual input schedule
- Layer 7: Hedge book import (existing forwards from other banks)

### PHASE 3 (POST-PILOT 2)
- Layer 3: ERP structured CSV with AP/AR committed exposures — template: entity, currency pair, amount, settlement date, counterparty, probability %, document reference
- Layer 6: CRM pipeline integration (Salesforce/HubSpot) — probability-weighted exposure from open deals

### PHASE 4 (SERIES A)
- Layer 4: Open banking live feed
- Layer 8: AI forecast with confidence intervals — minimum 18–24 months customer data before showing to clients; explainability via Claude API; anomaly detection flags deviations from historical patterns

### KEY ARCHITECTURAL DECISIONS
- CSV first, always — no ERP API integrations until post-pilot
- Keep forecasting (data inputs) separate from policy engine (actions)
- Every forecast record gets `data_source` + `confidence` + audit trail
- Multi-entity consolidation via existing `parent_company_id` foundation
- Confidence score surfaced to user on every exposure record

### OPEN QUESTIONS (RESOLVE WITH PILOT CUSTOMERS)
- Do clients prefer weekly CSV refresh or want real-time feeds?
- Which ERP systems are most common in our ICP? (SAP / Business Central)
- What training data volume before AI forecasts shown? (estimate: 18 months)
- Data residency requirements for open banking data?

**Status:** Phase 1 live — Phases 2–4 post-pilot

---

## 💰 MTM-BASED BILLING MODEL
**Priority:** Post-pilot
**Description:** Invoice clients 30% of favourable MTM vs budget rate (monthly or quarterly). Core monetisation idea: align Sumnohow's revenue with value delivered to the CFO.

**Open questions before build:**
- Realised (at settlement) or unrealised (live MTM snapshot)?
- Snapshot date: monthly or quarterly?
- Dispute resolution: what audit trail is required?
- Legal review needed on performance fee structure
- Validate pricing model with at least 1 pilot customer first

**Status:** Awaiting commercial validation

---

## 🔒 FEATURE FLAGS / TIERED MODULE ACCESS
**Priority:** Pre-scale
**Description:** Per-company feature flags for module access control.
**Tiers:** Starter / Growth / Enterprise
**DB:** Add `features JSONB` column to `companies` table — gates Risk Engine modules, Reports sections, and future premium features.
**Status:** Architect DB column now, UI in backlog

---

## 🟡 POST-PILOT / GROWTH
- [ ] Flag emojis in currency mix chart — Windows suppresses flag emojis, showing country code text (CH, GB, JP, EU) instead. Replace with a CSS flag library (e.g. flag-icons) across all components that display currency flags.
- [ ] Policy override audit log — when a user deviates from policy hedge ratio, mandatory reason required before execution. Logs: who, what policy said, what was done, why, timestamp, exposure. Table: policy_override_audit_log. Required for regulatory compliance and board governance.
- [ ] User permission tiers — currently Admin/Viewer only. Add: (1) Trader — can execute but not change policy, (2) Approver — must approve orders above threshold, (3) Read-only — dashboard and reports only. Policy overrides require Approver or Admin.
- [ ] **Client onboarding flow** — guided setup for new customers: (1) set base currency — explain this is the currency all P&L and protection status will be calculated in, matches their accounting currency, (2) set hedging policy, (3) add first exposure, (4) set bank details, (5) execute first hedge. Step-by-step wizard shown on first login. Skippable but resumable. Tracks completion state per company. Critical for self-serve adoption and reducing Kevin's onboarding time per pilot.
- [ ] Google / SSO login — sign in with Google in addition to password
- [ ] CSV bulk exposure upload — currently manual entry only
- [ ] Self-service signup — customers create own accounts
- [ ] ERP integration — connect to customer accounting systems
- [ ] Bank execution integration — connect to FX providers directly
- [ ] **Trade Reconciliation** — Match executed hedge tranches against bank confirmations. Phase 1: manual upload of bank confirmation (PDF/CSV/MT103). Phase 2: auto-match via open banking. Flags unconfirmed trades, rate discrepancies, and missing confirmations. Produces reconciliation report for month-end close. Critical for audit and compliance — reduces manual spreadsheet work that treasury teams currently do. Links to Reports tab.
- [ ] **Open Banking / Bank Account Integration** — Connect to bank accounts via open banking (PSD2 in EU/UK). Auto-reconcile executed trades against bank confirmations, view FX account balances. High compliance burden — FCA/PSD2 regulated. Series A feature, not pre-seed. Do not build until regulatory path is clear.
- [ ] **Counterparty Risk** — Track FX exposure concentration per bank. Flag over-reliance on single counterparty. Required for treasury policy compliance at larger corporates.
- [ ] Multi-provider support — Settings to support multiple banks/providers per company, each with name, contact, email, portal URL, and instrument types handled. Execution modal shows provider dropdown filtered by instrument type.
- [ ] Bank portal redirect — direct link to customer's bank online portal alongside email execution option.

## 🟢 NICE TO HAVE
- [ ] Quote currency entry toggle — amount field toggle between base and quote currency entry. Logic: amount ÷ rate = base currency hedge amount. Add when pilot requests it.
- [ ] Live rate ticker in header — scrolling FX rates across top of dashboard
- [ ] News feed — macro FX news relevant to customer's currency pairs
- [ ] Password strength indicator on reset/create
- [ ] Admin dashboard — usage stats across all pilot customers
- [ ] Audit log UI — filtering, export, and viewer for compliance
- [ ] Email template improvements — branding refinements
- [ ] Mobile optimisation — test and improve on smaller screens

## ✅ COMPLETED
- [x] JWT authentication and login
- [x] Multi-tenancy data isolation — viewers restricted to own company
- [x] Admin page — company, exposure, user management
- [x] Password reset flow — forgot password email + reset page
- [x] Welcome email — auto-generated password emailed on user creation
- [x] Sticky header
- [x] Resend integration — breach alerts
- [x] Daily digest cron job — branded email, per-company, 7am UTC
- [x] SPA routing fix — reset password link works from email
- [x] Execute with Bank modal — immediate + limit orders, value date audit log
- [x] Order confirmation banner — sent timestamp, mark as executed, send again with confirmation
- [x] Refresh rates button — removed dead endpoint, now re-fetches live rates correctly
- [x] Daily digest — live rates at send time (not stale DB values)
- [x] Exposure register — Total/Hedged/Open split with locked/floating/combined P&L
- [x] Hedge tranches — multiple hedges per exposure, mark as executed updates register
- [x] Asymmetric corridors — independent take profit and stop loss percentages with audit trail
- [x] Soft delete exposures — audit trail preserved for compliance
- [x] Currency pair expansion — majors, euro crosses, sterling crosses, emerging markets
- [x] Direction field — Buy/Sell convention replacing payable/receivable label
- [x] Daily digest currency fix — amount shows base currency (EUR/GBP etc.) not $
- [x] Hedging tab errors fixed — removed broken components, replaced with placeholder cards
- [x] Compact recommendation cards — collapsed by default, click to expand
- [x] ManualEntry amount field — base currency label inline, counter-value shown below

## NOTIFICATION MANAGEMENT

- [ ] **Cron zone monitoring** — Add zone status check to the existing 7am UTC cron job. Every morning, check all companies for zone changes since last check. Send zone alert email if zone has changed. This ensures alerts fire even if no one logs in. Add zone summary to daily digest email.

- [ ] **Notification preferences (Phase 2)** — CFO can configure per-notification-type preferences in Settings:
  - Frequency: Immediate / Daily digest only / Weekly summary
  - Quiet hours: e.g. no alerts between 6pm–8am
  - Minimum severity: Only notify on Defensive, not Opportunistic
  - Channels (future): Email (live), SMS, WhatsApp, Slack, MS Teams
  - Per-alert-type toggles: Zone shifts, Breaches, Policy triggers, Daily digest
  Goal: CFO gets exactly the alerts they want, nothing they don't. Critical for adoption.
## NETTING / NATURAL HEDGES
Priority: Pre-scale
Description:
Natural hedge = offsetting exposures in same currency pair
e.g. EUR/NOK receivable + EUR/NOK payable = net position only

Features needed:
- Auto-identify offsetting exposure pairs
- Show gross vs net exposure per currency pair
- Net P&L calculation on combined position
- Hedge recommendations based on NET not gross exposure
  (avoids costly over-hedging)
- Netting report: which exposures offset each other

Triangular currency risk (already tooltipped in UI):
- Cross pairs carry dual rate sensitivity
- CHF/USD with EUR base = exposed to both CHF/USD
  and EUR/USD rate moves simultaneously
- Tooltip explanation live on all cross-pair P&L figures

Commercial note: Netting reduces hedge cost significantly.
CFOs at $50M+ exposure almost always ask about this.
Raises question: do we charge on gross or net exposure?
Validate with pilot customer before building.

Status: Backlog — tooltip live, full netting feature pending

## MARKET REPORT — TIER 2: BANK FORECAST AGGREGATION
Priority: Post-pilot
Description:
Aggregate FX rate forecasts from major investment banks (Goldman Sachs, JP Morgan, Morgan Stanley, Barclays, etc.) and overlay them on the AI-generated weekly market report.

Features needed:
- Scrape or ingest bank forecast data (12-month targets per major pair)
- Show consensus forecast range (low/mid/high) per currency pair
- Flag where current spot is vs consensus range
- Highlight which bank is most bullish / bearish per pair
- Show % of banks forecasting a move in same direction as client's exposure (tail-wind vs head-wind indicator)
- Integrate into existing market report content_json as `bank_forecasts` field

Data sources:
- Phase 1: Manual input by Kevin from weekly bank research emails (paste into admin UI)
- Phase 2: RSS/API feed (Reuters, Bloomberg terminal export, or bank research portals)

Commercial note: Bank forecast aggregation is a differentiator — banks share this data with clients but CFOs rarely have time to read it. Sumnohow contextualises it against their specific positions.

Status: Backlog — requires data source decision before scoping

---

## MARKET REPORT — TIER 3: PROPRIETARY FX VIEW
Priority: Series A / Scale
Description:
Sumnohow develops and publishes its own weekly FX view — a house view on rate direction for the 8–10 currency pairs most common among its client base.

Features needed:
- Internal "view builder" tool: Kevin inputs directional bias (bullish/bearish/neutral) + confidence level + key driver narrative per pair
- Views stored in DB with effective date — auditable history
- Views incorporated into AI report generation as additional context layer: "Sumnohow house view: EUR/NOK mildly bearish near-term on Norwegian rate expectations"
- Clients see "Sumnohow View" badge on pairs where a proprietary view exists
- Over time: accuracy tracking — log actual rate move vs house view at 4-week horizon

Commercial note: Proprietary view creates IP, brand authority, and content marketing opportunity. Positions Sumnohow as an FX advisory platform, not just software. High brand value at Series A.

Status: Backlog — do not build until 10+ pilot companies active (need track record to validate house view credibility)

---

## BUDGET RATE TIME HORIZON
Priority: Pre-scale
Description:
- Allow budget rate to be set per period (Q1/Q2/Q3/Q4 or annual)
- Current single rate becomes default/fallback
- P&L uses rate for the period the exposure matures in
- Budget rate schedule in Settings → Policy
- Affects: P&L, scenario analysis, zone calculations
Validate with pilot customer first — some use annual, some quarterly.

Status: Backlog

---

## RATE TICKER
Priority: Pre-pilot
Description:
- Slim live rate bar between nav and summary strip
- Shows company's active pairs only
- Format: 🇬🇧🇺🇸 GBP/USD 1.3407 ▲+0.12%
- Updates every 5 min from existing rate cache
- Scrolls horizontally if many pairs
- No extra API calls — uses cached rates

Status: Backlog
