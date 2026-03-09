# Sumnohow — Product Backlog

## 🔴 Next Up (Pilot Critical)
- [ ] Pilot readiness end-to-end test — full customer journey walkthrough as a CFO would see it

## 🟡 Needs Scoping / Ideation
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

## 🟡 Post-Pilot / Growth
- [ ] Flag emojis in currency mix chart — Windows suppresses flag emojis, showing country code text (CH, GB, JP, EU) instead. Replace with a CSS flag library (e.g. flag-icons) across all components that display currency flags.
- [ ] Policy override audit log — when a user deviates from policy hedge ratio, mandatory reason required before execution. Logs: who, what policy said, what was done, why, timestamp, exposure. Table: policy_override_audit_log. Required for regulatory compliance and board governance.
- [ ] User permission tiers — currently Admin/Viewer only. Add: (1) Trader — can execute but not change policy, (2) Approver — must approve orders above threshold, (3) Read-only — dashboard and reports only. Policy overrides require Approver or Admin.
- [ ] Get started tutorial — onboarding flow for new customers
- [ ] Google / SSO login — sign in with Google in addition to password
- [ ] CSV bulk exposure upload — currently manual entry only
- [ ] Self-service signup — customers create own accounts
- [ ] ERP integration — connect to customer accounting systems
- [ ] Bank execution integration — connect to FX providers directly
- [ ] Multi-provider support — Settings to support multiple banks/providers per company, each with name, contact, email, portal URL, and instrument types handled. Execution modal shows provider dropdown filtered by instrument type.
- [ ] Bank portal redirect — direct link to customer's bank online portal alongside email execution option.

## 🟢 Nice to Have
- [ ] Quote currency entry toggle — amount field toggle between base and quote currency entry. Logic: amount ÷ rate = base currency hedge amount. Add when pilot requests it.
- [ ] Live rate ticker in header — scrolling FX rates across top of dashboard
- [ ] News feed — macro FX news relevant to customer's currency pairs
- [ ] Password strength indicator on reset/create
- [ ] Admin dashboard — usage stats across all pilot customers
- [ ] Audit log UI — filtering, export, and viewer for compliance
- [ ] Email template improvements — branding refinements
- [ ] Mobile optimisation — test and improve on smaller screens

## ✅ Completed
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
