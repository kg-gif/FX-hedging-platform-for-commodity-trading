# Sumnohow — Pre-Deploy QA Checklist

## Run this checklist before every commit to main.
## If ANY item fails — fix before deploying.

---

## 1. CURRENCY CONVERSION
- [ ] All EUR totals use conversion function, never raw amounts
- [ ] JPY exposure contributes ~EUR 3-4M not EUR 500M
- [ ] Cross pairs (e.g. CHF/USD with EUR base) use two-step conversion
- [ ] Facility utilisation uses EUR-converted notionals

## 2. DASHBOARD STRIP
- [ ] Total exposure matches sum of register rows (within 1%)
- [ ] Hedged amount matches sum of executed+confirmed tranches
- [ ] Portfolio P&L = Locked P&L + Floating P&L exactly

## 3. FACILITY UTILISATION
- [ ] Utilisation % = EUR utilised / EUR limit × 100
- [ ] No facility shows >100% on clean demo data
- [ ] JPY tranches converted to EUR before summing

## 4. ZONE ALERTS
- [ ] Alerts only fire on genuine zone transitions
- [ ] Opposite-direction pairs don't trigger each other
- [ ] No alerts firing simultaneously across all pairs

## 5. MARGIN CALL
- [ ] Only forward tranches flagged (not spot)
- [ ] Threshold calculation uses EUR-converted MTM loss
- [ ] Maximum 1-2 flags on clean demo data

## 6. DEMO RESET
- [ ] Reset completes without error
- [ ] 7 exposures load correctly
- [ ] Facility shows ~65-70% utilisation after reset
- [ ] No ghost data from previous sessions

## 7. DATA IMPORT
- [ ] Template uploads without error
- [ ] All 6 rows import cleanly
- [ ] Imported exposures appear in register immediately

## 8. MARKET REPORT
- [ ] Generate Report completes without error
- [ ] Only client's currency pairs mentioned
- [ ] Figures match dashboard data

## 9. NAVIGATION
- [ ] All 5 tabs load correctly
- [ ] URL updates on navigation
- [ ] Page refresh stays on current route
- [ ] No blank screens on any route

## 10. AUTHENTICATION
- [ ] Login works on app.sumnohow.com
- [ ] Superadmin sees company switcher
- [ ] Non-admin cannot see other companies
- [ ] Session persists on page refresh

## 11. CALCULATION CONSISTENCY
- [ ] Hedge % matches across: Register, Dashboard, Policy Compliance, Forecasting
- [ ] Combined P&L matches across: Register, Dashboard strip, Dashboard panel, P&L report
- [ ] Zone status matches across: Register, Dashboard banners, Recommendations, Email alerts
- [ ] Scenario coverage % never exceeds 100%; shows — for favourable scenarios
- [ ] All notionals EUR-converted before display (never raw amount × rate inline)
- [ ] All calculations use shared functions from `services/exposure_utils.py`

## 12. CODE STANDARDS
- [ ] No inline `CURRENCY_FLAGS` definitions — import from `utils/currency.js`
- [ ] No inline EUR conversion logic — use `get_rate()` or `to_eur()`
- [ ] No hardcoded `onrender.com` URLs in new code — use `utils/api.js`
- [ ] All dates display in European format (dd/mm/yyyy)
- [ ] Currency flags visible on charts and pair labels

---

## How to use
Before committing any change:
1. Run through relevant sections above
2. Check items affected by your change
3. If unsure — check all sections
4. Only commit when all relevant items pass
