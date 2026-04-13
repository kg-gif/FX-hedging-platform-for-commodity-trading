// ============================================================
// SHARED CONSTANTS
// Status badges, colours, zones, labels — all defined here.
// Import from here — never define status colours inline.
// ============================================================

// ── Exposure status ──────────────────────────────────────────
export const EXPOSURE_STATUS = {
  HEDGED:      { label: 'Hedged',               colour: '#10B981', bg: '#D1FAE5' },
  IN_PROGRESS: { label: 'In Progress',           colour: '#F59E0B', bg: '#FEF3C7' },
  OPEN:        { label: 'Open',                  colour: '#9CA3AF', bg: '#F3F4F6' },
  BREACH:      { label: 'Breach',                colour: '#EF4444', bg: '#FEE2E2' },
  AWAITING_SETTLEMENT: {
    label: 'Awaiting Settlement',                colour: '#F59E0B', bg: '#FEF3C7'
  },
}

// ── Tranche status ───────────────────────────────────────────
export const TRANCHE_STATUS = {
  PENDING:   { label: 'Pending',   colour: '#9CA3AF' },
  EXECUTED:  { label: 'Executed',  colour: '#10B981' },
  CONFIRMED: { label: 'Confirmed', colour: '#3B82F6' },
  ARCHIVED:  { label: 'Archived',  colour: '#6B7280' },
}

// ── Policy zones ─────────────────────────────────────────────
export const ZONES = {
  DEFENSIVE:     { label: 'Defensive',     colour: '#EF4444', bg: '#FEE2E2' },
  BASE:          { label: 'Base',          colour: '#1A2744', bg: '#E8EDF5' },
  OPPORTUNISTIC: { label: 'Opportunistic', colour: '#10B981', bg: '#D1FAE5' },
}

// ── Facility utilisation ─────────────────────────────────────
export const getFacilityStatus = (pct) => {
  if (pct < 70) return { label: 'Normal',   colour: '#10B981' }
  if (pct < 90) return { label: 'Warning',  colour: '#F59E0B' }
  return           { label: 'Critical', colour: '#EF4444' }
}

// ── Instrument types ─────────────────────────────────────────
export const INSTRUMENTS = ['Forward', 'Spot', 'Option']

// ── Glossary — plain-English definitions for CFOs ────────────
// Single source of truth. Imported by Glossary.jsx and ColHeader tooltips.
// Structure: { "Category": [ { term, plain, why, example } ] }

export const GLOSSARY = {
  "Rates & Pricing": [
    {
      term: "Budget Rate",
      plain: "The exchange rate your company planned around when setting budgets.",
      why: "All P&L is measured against this. If the market moves against your budget rate, you lose money on unhedged positions.",
      example: "You budgeted GBP/USD at 1.2500. If spot is now 1.3000, you're winning on unhedged GBP receipts.",
    },
    {
      term: "Inception Rate",
      plain: "The rate you locked in when you executed a forward contract with your bank.",
      why: "This is your guaranteed rate for that tranche. MTM vs Inception shows whether the market has moved in your favour since you locked in.",
      example: "You executed a forward at 1.2800. Spot is now 1.3200. Your MTM vs inception is positive.",
    },
    {
      term: "Spot Rate",
      plain: "Today's live market exchange rate between two currencies.",
      why: "Used to calculate floating P&L on unhedged positions and MTM on executed forwards.",
      example: "EUR/USD spot is 1.1580 right now.",
    },
    {
      term: "Forward Rate",
      plain: "The rate agreed today for an exchange that will happen at a future date.",
      why: "Differs from spot due to interest rate differentials between the two currencies. This difference is called forward points.",
      example: "Spot GBP/USD is 1.3200. The 3-month forward rate might be 1.3150 due to interest rate differentials.",
    },
    {
      term: "Forward Points",
      plain: "The difference between today's spot rate and the forward rate for a future date.",
      why: "Represents the cost or benefit of locking in a rate for a future date. Driven by the interest rate differential between the two currencies.",
      example: "If spot is 1.3200 and the 3-month forward is 1.3150, the forward points are -50 pips.",
    },
  ],

  "P&L": [
    {
      term: "Locked P&L",
      plain: "The guaranteed profit or loss already crystallised by your executed forward contracts.",
      why: "This P&L is certain — it won't change regardless of where the market moves, because the rate is fixed.",
      example: "You sold GBP forward at 1.3200 vs a budget of 1.2500. Locked P&L = +€54,000.",
    },
    {
      term: "Floating P&L",
      plain: "The unrealised profit or loss on your open, unhedged positions at today's exchange rate.",
      why: "This number changes every time the market moves. It shows your current exposure if you had to convert at today's rate.",
      example: "You have EUR 1M unhedged. EUR/NOK is 11.1706 vs your budget of 11.2000. Floating P&L = -€26,300.",
    },
    {
      term: "Combined P&L",
      plain: "Locked P&L plus Floating P&L — your total position vs budget.",
      why: "This is the headline number. Are you ahead or behind your budget rate across your whole book?",
      example: "Locked +€54,000 + Floating -€26,300 = Combined +€27,700.",
    },
    {
      term: "MTM (Mark-to-Market)",
      plain: "The current value of your forward contracts if you were to close them at today's market rate.",
      why: "Shows whether your hedges are working in your favour. Negative MTM doesn't mean you've lost money — your budget rate is still protected.",
      example: "You locked in GBP/USD at 1.2800. Spot is 1.3200. Your forward is worth +€32,000 MTM.",
    },
  ],

  "Hedging": [
    {
      term: "Hedge Coverage %",
      plain: "The percentage of your total exposure that is protected by forward contracts.",
      why: "Higher coverage = more certainty on your cash flows. Lower coverage = more exposure to market movements.",
      example: "GBP exposure of £3M with £1.5M hedged = 50% hedge coverage.",
    },
    {
      term: "Executed",
      plain: "A forward contract that has been traded with your bank. The rate is locked.",
      why: "An executed tranche is legally binding. The rate is fixed regardless of where the market moves.",
      example: "You executed a GBP/USD forward at 1.3200 for £800,000 maturing 18 Jun 2026.",
    },
    {
      term: "Confirmed",
      plain: "An executed trade where the bank confirmation has been received and the bank reference number recorded.",
      why: "Confirmation closes the audit loop. Without it, you have a trade instruction but no counterparty confirmation.",
      example: "Bank sends confirmation with reference DNB-2026-4521. You record it in the platform.",
    },
    {
      term: "Bank Reference",
      plain: "The unique reference number on the trade confirmation note sent by your bank.",
      why: "Required for audit trail. Links your internal record to the bank's confirmation.",
      example: "DNB-2026-4521 or FX-2026-009341.",
    },
    {
      term: "Natural Hedge",
      plain: "When you have offsetting exposures in the same currency that partially cancel each other out.",
      why: "Reduces the amount you need to hedge externally — saving on forward contract costs.",
      example: "You have EUR 2M receivable and EUR 800K payable. Net exposure is only EUR 1.2M.",
    },
    {
      term: "Cross Pair",
      plain: "A currency pair where neither currency is your company's base currency.",
      why: "P&L on cross pairs is affected by two exchange rates — the pair itself, and the conversion to your base currency.",
      example: "GBP/NOK for a EUR-base company: P&L in NOK must be converted to EUR at today's EUR/NOK rate.",
    },
    {
      term: "Forward Roll",
      plain: "Extending a maturing forward to a new value date when the underlying exposure hasn't settled yet.",
      why: "Avoids having to deliver currency when your commercial transaction hasn't completed.",
      example: "Your forward matures 30 Jun but the invoice won't be paid until 31 Aug. You roll to the new date.",
    },
    {
      term: "Settlement",
      plain: "The final exchange of currencies on the value date of a forward contract.",
      why: "Once settled, the forward no longer consumes facility headroom and the locked P&L is realised.",
      example: "Forward matures 30 Jun. On that date, currencies are exchanged at the agreed rate and the tranche is settled.",
    },
  ],

  "Risk & Policy": [
    {
      term: "Corridor",
      plain: "The price range within which your exposure is considered acceptable — defined by a take profit and stop loss level.",
      why: "Triggers an alert when the market moves outside acceptable bounds, prompting a hedging decision.",
      example: "Corridor set at 2% take profit / 3% stop loss on EUR/NOK.",
    },
    {
      term: "Defensive Zone",
      plain: "The market has moved against your budget rate beyond your threshold — immediate hedging action recommended.",
      why: "You are losing money on unhedged positions and need to protect what remains.",
      example: "EUR/NOK has moved 4% against your budget. Policy requires 85% hedge coverage in Defensive zone.",
    },
    {
      term: "Base Zone",
      plain: "The market is within your normal operating range — hedge at your standard target ratio.",
      why: "Business as usual. No urgent action required.",
      example: "GBP/USD within 2% of budget. Maintain 70% hedge coverage.",
    },
    {
      term: "Opportunistic Zone",
      plain: "The market has moved in your favour — consider locking in gains by increasing hedge coverage.",
      why: "When rates are favourable, adding hedges crystallises the gain and protects against reversal.",
      example: "GBP/USD is 5% above your budget. Consider hedging more to lock in the favourable rate.",
    },
    {
      term: "Margin Call",
      plain: "A demand from your bank for additional collateral when your forward contracts have moved significantly against you.",
      why: "If your MTM loss exceeds your credit facility threshold, the bank may require cash or collateral to maintain the position.",
      example: "Forward MTM loss of €180,000 exceeds 2% of notional — potential margin call risk flagged.",
    },
    {
      term: "Trading Facility",
      plain: "The credit line your bank has approved for FX forward contracts.",
      why: "Every executed forward consumes facility headroom. If you run out, you cannot execute new forwards until existing ones settle.",
      example: "DNB facility: EUR 15M. Currently EUR 9.5M utilised. EUR 5.5M available.",
    },
  ],

  "Exposure Lifecycle": [
    {
      term: "Requires Action",
      plain: "Exposures where immediate attention is needed. Either the currency has moved into the Defensive zone (adverse vs budget) or hedge coverage is below your policy minimum.",
      why: "These exposures are currently unprotected in a deteriorating market, or their hedge ratio has fallen below the level your policy requires.",
      example: "EUR/NOK has moved 4% against your budget and you have 0% hedge coverage. The exposure sits in Requires Action until a forward is executed.",
    },
    {
      term: "In Progress",
      plain: "Exposures that are partially hedged. Some tranches have been executed but the full policy target has not yet been reached.",
      why: "Tracking partial coverage lets you see which exposures still need top-up hedges to reach your policy target.",
      example: "GBP/USD exposure of £3M with £1.5M hedged = 50% coverage. Shows In Progress until the target ratio is met.",
    },
    {
      term: "Hedged",
      plain: "Exposures where hedge coverage has reached 100% of the exposure amount. No further action needed until value date approaches.",
      why: "Fully covered exposures are protected against market movements. Monitor them as value date approaches for settlement.",
      example: "JPY/USD exposure of ¥500M fully covered by two forward tranches. Sits in Hedged until maturity.",
    },
    {
      term: "Awaiting Settlement",
      plain: "Hedges that have reached or are approaching their value date. The physical currency transaction needs to be completed with your bank.",
      why: "Value date is the day currencies are actually exchanged. Missing it without rolling the contract can create delivery failure.",
      example: "GBP/NOK forward matures 30 Jun. It moves to Awaiting Settlement as the value date approaches.",
    },
    {
      term: "Settled",
      plain: "Completed exposures where the currency transaction has been executed and the position is closed.",
      why: "Settled exposures are archived for audit purposes. The locked P&L is fully realised and the facility headroom is released.",
      example: "Forward settled 30 Jun. Currencies exchanged at the agreed rate. Position archived with final P&L recorded.",
    },
    {
      term: "Forecast",
      plain: "Forward-looking view of expected future FX exposures based on current data and trends.",
      why: "Forecasting ahead lets treasury teams plan hedging programs before exposures crystallise, locking in rates at the right time.",
      example: "Q3 EUR/USD payables estimated at EUR 3M based on last year's purchasing pattern. Added as a forecast exposure.",
    },
  ],

  "Reporting": [
    {
      term: "CFaR (Cash Flow at Risk)",
      plain: "The worst-case impact on your cash flows from adverse currency movements, at a given confidence level.",
      why: "Gives the board a single number summarising the maximum FX loss you could face. Used in risk reporting.",
      example: "95% CFaR of €450,000 means there is a 5% chance of losing more than €450,000 to FX movements.",
    },
    {
      term: "VaR (Value at Risk)",
      plain: "The maximum potential loss on your FX portfolio over a specific time period at a given confidence level.",
      why: "Standard metric used by banks and regulators to quantify market risk.",
      example: "1-day 99% VaR of €85,000 means there is a 1% chance of losing more than €85,000 in a single day.",
    },
    {
      term: "Audit Trail",
      plain: "A complete chronological record of every action taken on your FX portfolio.",
      why: "Required for regulatory compliance and internal governance. Shows who did what, when, and why.",
      example: "Tranche executed by kg@sumnohow.com on 19/03/2026 at rate 1.3200, confirmed with bank ref DNB-2026-4521.",
    },
    {
      term: "Netting",
      plain: "Combining offsetting exposures in the same currency before hedging, to reduce the total amount you need to hedge.",
      why: "Reduces transaction costs and facility usage by only hedging the net position.",
      example: "EUR 2M receivable + EUR 800K payable = EUR 1.2M net to hedge.",
    },
  ],
}

// Column tooltip content for inline ⓘ tooltips in the exposure register.
// Key = column header label (uppercase).
// Each entry: { short, detail, glossary } where glossary = anchor ID in /glossary.
// Anchor IDs are generated by slugify() in Glossary.jsx:
//   term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const COLUMN_TOOLTIPS = {
  'HEDGE %': {
    short:   'Percentage of total exposure protected by forward contracts.',
    detail:  'Calculated from executed and confirmed tranches only. Pending tranches are not counted.',
    glossary: 'hedge-coverage',
  },
  'LOCKED P&L': {
    short:   'Guaranteed P&L already crystallised by your executed forwards.',
    detail:  'This figure is fixed — it will not change regardless of market movements.',
    glossary: 'locked-p-l',
  },
  'FLOATING P&L': {
    short:   "Unrealised P&L on open, unhedged positions at today's spot rate.",
    detail:  'Changes every time the market moves. Shown in your base currency.',
    glossary: 'floating-p-l',
  },
  'COMBINED P&L': {
    short:   'Locked P&L plus Floating P&L — your total position vs budget.',
    detail:  'The headline number. Positive = ahead of budget. Negative = behind.',
    glossary: 'combined-p-l',
  },
  'CORRIDOR': {
    short:   'Take profit and stop loss levels set for this exposure.',
    detail:  'Triggers an alert when the market rate moves outside this range.',
    glossary: 'corridor',
  },
  'MTM VS INCEPTION': {
    short:   "Value of this forward at today's rate vs the rate you locked in.",
    detail:  'Positive = market has moved in your favour since the hedge was executed.',
    glossary: 'mtm-mark-to-market',
  },
  'MTM VS BUDGET': {
    short:   "Value of this forward at today's rate vs your budget rate.",
    detail:  'Shows whether your hedge is protecting your budget assumption.',
    glossary: 'mtm-mark-to-market',
  },
  'BANK REF': {
    short:   'The trade reference number issued by your bank on confirmation.',
    detail:  'Required to move a tranche to CONFIRMED status. Creates an immutable audit log entry.',
    glossary: 'bank-reference',
  },
}
