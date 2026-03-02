# Sumnohow — Product Backlog

## Sumnohow — Product Backlog

## 🔴 Next Up (Pilot Critical)
- [ ] Remove "View Exposures" button from exposure register — confusing for pilots
- [ ] Execute with Bank — pull bank URL from customer Settings, open in new tab
- [ ] Pilot readiness end-to-end test — full customer journey walkthrough

## 🟡 Needs Scoping Before Building
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