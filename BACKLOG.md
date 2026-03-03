# Sumnohow — Product Backlog

## 🔴 Next Up (Pilot Critical)
- [ ] Fix refresh button errors — console shows hedges/scenarios endpoints returning HTML not JSON, needs investigation
- [ ] Pilot readiness end-to-end test — full customer journey walkthrough

## 🟡 Needs Scoping / Ideation
- [ ] Exposure register logic — review what fields are shown, how P&L is calculated, what "correct" looks like for pilot customers. Needs design session.
- [ ] Dynamic hedging policy zones — Policy should define three zones: Defensive (minimum hedge %), Base (target %), Opportunistic (maximum % when market moves favourably). Triggers set as % move vs budget rate. Flows through to Recommendations (zone per exposure), Dashboard (zone colour coding), Simulator (model impact of hedging up/down). Requires Policy data model change and design session before building.
- [ ] Tying tabs together — Dashboard, Hedging, Reports and Simulator should share state (e.g. clicking a breach on Dashboard takes you to the relevant hedge recommendation). Needs UX design session.
- [ ] Simulator to stop/limit alert corridors — use scenario analysis output to automatically suggest or set take profit and stop loss levels per exposure. Core risk engine differentiator. Needs design session.
- [ ] Execution logging — decision needed on what feeds into reports: auto-log on email open (built) vs manual mark as executed (built) vs bank confirmation upload.
- [ ] Exposure forecasting model — upload 2 years of AP/AR history to forecast next 12 months of FX exposure by currency pair. Output: suggested hedging plan, timing, and amounts. Feeds directly into simulator corridors. Core IP — needs dedicated design session.
- [ ] Start/end date + historical rate on exposures — rate should reflect rate at trade inception, calculate take profit and stop loss from there. Needs design session.
- [ ] Hedge screen scenario analysis — "Unable to load scenario analysis" error, needs investigation.

## 🟡 Post-Pilot / Growth
- [ ] Get started tutorial — onboarding flow for new customers
- [ ] Google / SSO login — sign in with Google in addition to password
- [ ] CSV bulk exposure upload — currently manual entry only
- [ ] Self-service signup — customers create own accounts
- [ ] ERP integration — connect to customer accounting systems
- [ ] Bank execution integration — connect to FX providers directly

- [ ] Multi-provider support — Settings to support multiple banks/providers per company, each with name, contact, email, portal URL, and instrument types handled (Spot/Forward/NDF). Execution modal shows provider dropdown filtered by instrument type. Needs Settings UI redesign and data model change.

## 🟢 Nice to Have
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
