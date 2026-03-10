# CLAUDE.md — Sumnohow FX Risk Platform

This file gives you the context you need before touching any code.
Read it fully before making changes.

---

## What this product does

Sumnohow is a B2B SaaS FX risk management platform. It helps CFOs and treasurers at companies with $20M+ annual FX exposure manage currency risk — tracking exposures, executing hedges, monitoring P&L vs budget rates, and ensuring compliance with internal hedging policies.

The founder is non-technical. Code must be clean, well-commented, and maintainable by future hires.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python), SQLAlchemy, PostgreSQL |
| Frontend | React + Vite, Tailwind CSS |
| Hosting | Render (both frontend and backend) |
| Email | Resend |
| FX Rates | exchangerate-api.com |
| Auth | JWT (HTTPBearer) |
| Cron | cron-job.org → `/api/alerts/send-daily` |

---

## URLs

- **Frontend:** https://birk-dashboard.onrender.com
- **Backend API:** https://birk-fx-api.onrender.com
- **GitHub:** https://github.com/kg-gif/FX-hedging-platform-for-commodity-trading

---

## Key files

```
backend/
  birk_api.py                        # Main FastAPI app, all routers, startup migrations
  routes/
    auth_routes.py                   # Login, create-user, forgot/reset password
    admin_routes.py                  # Company/exposure/user management (admin only)
    settings_routes.py               # Company settings, bank details, policy cascade
    hedging_routes_fastapi.py        # Hedge recommendations engine
    hedge_tranche_routes.py          # Tranche architecture, enriched exposure endpoint

frontend/src/
  App.jsx                            # Routing, nav, auth gate
  brand.js                           # Brand tokens — NAVY, GOLD, DANGER, WARNING, SUCCESS
  components/
    Dashboard.jsx                    # Main dashboard — self-contained, no propsExposures
    ExposureRegister.jsx             # Exposure table with tranches, P&L, corridor
    HedgingRecommendations.jsx       # Recommendations + execution modal
    ManualEntry.jsx                  # Add new exposures
    Admin.jsx                        # Admin panel
    Settings.jsx                     # Company + bank settings
    Reports.jsx                      # Execution history, audit logs
    Login.jsx                        # Login page
    ForgotPasswordModal.jsx
    ResetPassword.jsx
  contexts/
    CompanyContext.jsx
```

---

## Brand

```javascript
NAVY    = '#1A2744'   // primary background, headers
GOLD    = '#C9A86C'   // accents, highlights
DANGER  = '#EF4444'   // red — breaches, negative P&L
WARNING = '#F59E0B'   // amber — warnings, partial coverage
SUCCESS = '#10B981'   // green — hedged, positive P&L
```

Always import from `../brand` — never hardcode colours.

---

## Auth pattern

- JWT stored in `localStorage` as `auth_token`
- Auth user object stored as `auth_user` (contains `email`, `company_id`, `is_admin`)
- Every API call needs: `Authorization: Bearer ${localStorage.getItem('auth_token')}`
- Backend: `resolve_company_id(company_id, payload)` enforces multi-tenancy — admins see all, viewers restricted to own company

---

## Database — key tables

| Table | Purpose |
|-------|---------|
| `companies` | One row per client company |
| `exposures` | FX exposures — soft deleted via `is_active` |
| `hedge_tranches` | Individual hedge executions per exposure |
| `hedging_policies` | Named policies (Conservative/Balanced/Aggressive) |
| `order_audit_log` | Every order sent to bank |
| `value_date_audit_log` | Value date changes with reason |
| `hedge_corridor_log` | Take profit / stop loss changes |

**Soft delete is mandatory** — never hard delete exposures. Set `is_active = false`.

**Tranche statuses:** `pending` → `executed` → `confirmed`
- Only `executed` and `confirmed` count toward hedge coverage and locked P&L
- `pending` is ignored everywhere

---

## Critical business logic

### Hedge coverage
Coverage % = sum of executed/confirmed tranche amounts ÷ total exposure amount.
Never include pending tranches in coverage calculations.

### P&L split
- **Locked P&L** — crystallised from executed hedges: `(hedge_rate - budget_rate) × hedged_amount`
- **Floating P&L** — open portion vs spot: `(current_spot - budget_rate) × open_amount`
- **Combined** — locked + floating

### Recommendations engine
Reads actual executed tranches from `hedge_tranches` table — NOT the `unhedged_amount` field on exposures (that field is stale). Recommended amount = `(total × target_ratio) - actual_hedged`.

### Status labels
- `OPEN` — 0% hedged
- `IN PROGRESS` — partially hedged, within corridor
- `HEDGED` — at or above policy target
- `BREACH` — outside corridor (rate has moved beyond take profit or stop loss)

---

## Non-negotiables (fintech compliance)

- ✅ All API endpoints must have authentication
- ✅ Financial calculations must have audit logs
- ✅ Customer data encrypted at rest and in transit (Render handles this)
- ✅ No hardcoded credentials — use environment variables
- ✅ Errors must be loud — financial data must never fail silently
- ✅ Soft delete only — never destroy financial records
- ❌ Never expose sensitive data in error messages or logs

---

## Environment variables (backend — set in Render)

```
DATABASE_URL
JWT_SECRET_KEY
ADMIN_SECRET
CRON_SECRET
RESEND_API_KEY
FRONTEND_URL
EXCHANGERATE_API_KEY
ANTHROPIC_API_KEY
FX_API_KEY
```

---

## Deployment

Both frontend and backend auto-deploy from GitHub `main` branch via Render.
- Push to `main` → Render picks it up automatically
- Backend deploy takes ~2 minutes
- Frontend deploy takes ~3 minutes
- Check Render dashboard if something looks wrong after deploy

---

## Common mistakes to avoid

1. **Don't use `Promise.all` for enriched + basic fetches** — if enriched fails it kills the whole dashboard. Always fetch independently.
2. **Don't read `unhedged_amount` from exposures for recommendations** — always query `hedge_tranches` directly.
3. **Don't hardcode `company_id = 1`** — always use `resolve_company_id()`.
4. **Don't save tranches without a status field** — default must be `executed` when created from Mark as Executed flow, `pending` when created as an order.
5. **Don't remove audit log calls** — every execution, value date change, and corridor change must be logged.
6. **Dashboard.jsx is self-contained** — it does not accept `propsExposures`. It fetches its own data.

---

## Current admin credentials (dev/test only)

- Email: kg@sumnohow.com
- The app is live with real pilot data — be careful with any destructive operations.

---

## Conversation context

Architecture decisions and feature strategy are discussed in a separate Claude chat (acting as CTO).
When in doubt on product direction, check `BACKLOG.md` in the project root.