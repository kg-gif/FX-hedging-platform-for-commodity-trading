# Sumnohow — Product Backlog

## 🔴 Next Up (Pilot Critical)
- [ ] Pilot readiness end-to-end test — full customer journey walkthrough

## 🟡 Needs Scoping / Ideation
- [ ] Execution logging — how do we record that an order was sent/executed for reporting accuracy? Options to explore: (a) manual "mark as executed" button, (b) auto-log when email draft opened, (c) bank confirmation upload. Needs decision before building.
- [ ] Start/end date + historical rate on exposures — rate should reflect rate on start date, then calculate and display take profit and stop loss levels (core risk engine differentiator — needs design session)
- [ ] Hedge screen scenario analysis — "Unable to load scenario analysis" error, needs investigation

## 🟡 Post-Pilot / Growth
- [ ] Get started tutorial — onboarding flow for new customers
- [ ] Google / SSO login — sign in with Google in addition to password
- [ ] CSV bulk exposure upload — currently manual entry only
- [ ] Self-service signup — customers create own accounts
- [ ] ERP integration — connect to customer accounting systems
- [ ] Bank execution integration — connect to FX providers

## 🟢 Nice to Have
- [ ] Live rate ticker in header — scrolling FX rates across top of dashboard
- [ ] News feed — macro FX news relevant to customer's currency pairs

- [ ] Password strength indicator on reset/create
- [ ] Admin dashboard — usage stats across all pilot customers
- [ ] Audit log UI improvements — better filtering and export
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
- [x] Daily digest cron job — branded email, per-company, 7am UTC via cron-job.org
- [x] SPA routing fix — reset password link works from email
- [x] Execute with Bank modal — immediate + limit orders, value date audit log