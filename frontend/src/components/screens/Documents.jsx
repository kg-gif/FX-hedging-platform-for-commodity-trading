// Documents.jsx — Phase 3 real-data port
//
// Screen: Reports Hub — two tabs
//   Tab 1: Reports — latest AI market brief + report history + maturity schedule
//   Tab 2: Audit trail — unified hedge trail (tranches + orders + value-date changes) + CSV export
//
// Endpoints (all in utils/api.js):
//   GET  /api/reports/market/{cid}          → { report: { content, generated_at, ... } }
//   GET  /api/reports/market/{cid}/history  → { history: [{ id, headline, report_date, generated_at }] }
//   GET  /api/reports/market/{cid}/pdf      → PDF download (authenticated link)
//   POST /api/reports/market/generate/{cid} → generate new report (admin only)
//   GET  /api/reports/maturity/{cid}        → { tranches: [], by_month: [], summary: {} }
//   GET  /api/audit/hedge-trail?company_id  → { events: [...] } — unified trail
//   GET  /api/audit/hedge-trail/csv?...     → CSV file download
//
// CEO MiniMe sign-off: SIGNOFF_CEO_MINIME_DOCUMENTS_SCOPE.md — 16 Jun 2026
// Frameworks / Plans / Compliance cut — no backend exists for these.
//
// Conditions carried forward:
//   L-E1 — Lex reviews CSV export field set before external rollout
//   C-D1 — Cara confirms no pilot client expects document store before external rollout
//   I-D1 — Iris confirms document hosting not committed in investor materials
//
// AI disclosure: Lex two-tier pattern — short inline tag on screen, full copy at /legal
// BF-002: Cookie auth — credentials: 'include' on all fetches. CSV download (line ~587)
//   uses ?token= param (open condition M-1 — needs Axel sign-off before changing).

import { useState, useEffect } from 'react'
import { useCompany }                                            from '../../contexts/CompanyContext'
import { API }                                                   from '../../utils/api'
import { formatDateMedium, formatDateTime, formatNotional }      from '../../utils/formatting'
import Card                                                      from '../ui/Card'
import Button                                                    from '../ui/Button'
import EyebrowLabel                                              from '../ui/EyebrowLabel'
import Icon                                                      from '../ui/Icon'
import Tabs                                                      from '../ui/Tabs'

// ── Currency flag + pair — Pixel F-D1, spec item 11, founder decision ─────────
// 16px flag + three-letter code, institutional styling.
// Defined locally per Phase 3 screen convention (FxOverview, Hedges pattern).
const FLAG_MAP = {
  EUR:'eu', USD:'us', GBP:'gb', NOK:'no', JPY:'jp',
  CHF:'ch', SEK:'se', DKK:'dk', AUD:'au', CAD:'ca',
}
function FlagPair({ pair }) {
  // Accepts "EUR/USD" string or separate from/to props
  const [from, to] = (pair ?? '').split('/')
  if (!from || !to) return <span style={{ fontFamily:'var(--font-mono)', color:'var(--fg-2)' }}>{pair ?? '—'}</span>
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <span className={`fi fi-${FLAG_MAP[from]||'un'}`} style={{ width:16, height:12, borderRadius:1 }} />
      <span style={{ fontFamily:'var(--font-mono)', fontWeight:'var(--fw-bold)', color:'var(--snh-navy)' }}>{from}/{to}</span>
      <span className={`fi fi-${FLAG_MAP[to]||'un'}`} style={{ width:16, height:12, borderRadius:1 }} />
    </span>
  )
}

// ── AI disclosure tag — Lex two-tier pattern ─────────────────────────────────
// Inline tag on screen; full 21-word disclosure at /legal
function AIDisclosureTag({ fallback = false }) {
  if (fallback) {
    return (
      <span style={{ fontSize: 'var(--fs-eyebrow)', color: 'var(--snh-slate)', fontStyle: 'italic' }}>
        Static content. AI service unavailable.
      </span>
    )
  }
  return (
    <span style={{ fontSize: 'var(--fs-eyebrow)', color: 'var(--snh-slate)' }}>
      AI-generated decision support —{' '}
      <a href="/legal" style={{ color: 'var(--snh-gold)', textDecoration: 'underline', fontWeight: 'var(--fw-bold)' }}>
        full disclosure.
      </a>
    </span>
  )
}

// ── Event type pill for audit trail ──────────────────────────────────────────
function EventTypePill({ type }) {
  const map = {
    tranche:           { label: 'Execution',    colour: 'var(--snh-navy)'    },
    order:             { label: 'Order sent',   colour: 'var(--snh-gold)'    },
    value_date_change: { label: 'Value date',   colour: 'var(--snh-slate)'   },
  }
  const { label, colour } = map[type] || { label: type, colour: 'var(--snh-slate)' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px',
      borderRadius: 'var(--radius-pill)', background: 'transparent',
      border: `1px solid ${colour}`, color: colour,
      fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      {label}
    </span>
  )
}

// ── Tranche status pill ───────────────────────────────────────────────────────
function TrancheStatusPill({ status }) {
  if (!status) return null
  const colours = {
    executed:  'var(--snh-success)',
    confirmed: 'var(--snh-success)',
    pending:   'var(--snh-warning)',
  }
  const colour = colours[status] || 'var(--snh-slate)'
  return (
    <span style={{
      fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
      letterSpacing: '0.05em', textTransform: 'uppercase', color: colour,
    }}>
      {status}
    </span>
  )
}

// ── Loading skeleton row ──────────────────────────────────────────────────────
function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '14px 8px' }}>
          <div style={{
            height: 14, borderRadius: 4,
            background: 'var(--border-1)', opacity: 0.6,
            width: i === 0 ? '60%' : '40%',
          }} />
        </td>
      ))}
    </tr>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      color: 'var(--snh-slate)', fontFamily: 'var(--font-body)',
      fontSize: 'var(--fs-body-sm)',
    }}>
      {message}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — REPORTS
// ─────────────────────────────────────────────────────────────────────────────

function ReportsTab({ companyId, isAdmin }) {
  const [report,   setReport]   = useState(null)   // latest brief
  const [history,  setHistory]  = useState([])
  const [maturity, setMaturity] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [generating, setGenerating]       = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [section, setSection]   = useState('brief') // 'brief' | 'history' | 'maturity'

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)

    // Fetch all three independently — failure in one must not kill the others.
    // Promise.allSettled never rejects — check individual statuses, then check
    // whether all failed to surface a top-level error (Cipher P-1).
    Promise.allSettled([
      fetch(API.marketReport(companyId),        { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
      fetch(API.marketReportHistory(companyId),  { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
      fetch(API.maturityReport(companyId),       { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
    ]).then(([briefRes, historyRes, maturityRes]) => {
      if (briefRes.status   === 'fulfilled') setReport(briefRes.value.report ?? null)
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value.history ?? [])
      if (maturityRes.status === 'fulfilled') setMaturity(maturityRes.value ?? null)
      // Surface error only if every fetch failed — partial failures degrade gracefully
      if ([briefRes, historyRes, maturityRes].every(r => r.status === 'rejected')) {
        setError('Unable to load reports. Check your connection and try again.')
      }
    }).finally(() => setLoading(false))
  }, [companyId])

  async function handleGenerate() {
    if (!isAdmin) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch(API.generateReport(companyId), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.report) setReport(data.report)
      // Refresh history after successful generation
      const hRes  = await fetch(API.marketReportHistory(companyId), { credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const hData = await hRes.json()
      setHistory(hData.history ?? [])
    } catch (err) {
      // Cipher L-1: surface failure — generation may fail if AI service is unavailable
      setGenerateError('Report generation failed. AI service may be unavailable — try again shortly.')
    } finally {
      setGenerating(false)
    }
  }

  const content = report?.content ?? null

  return (
    <>
      {/* Section selector */}
      <div style={{ marginBottom: 24 }}>
        <Tabs variant="underline" active={section} onChange={setSection} items={[
          { id: 'brief',    label: 'Latest brief'      },
          { id: 'history',  label: 'Report history', count: history.length },
          { id: 'maturity', label: 'Maturity schedule' },
        ]} />
      </div>

      {/* ── Latest brief ─────────────────────────────────────────────────── */}
      {section === 'brief' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              {report && (
                <p style={{ margin: 0, color: 'var(--snh-slate)', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)' }}>
                  Generated {formatDateTime(report.generated_at)}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {report && (
                <a
                  href={API.marketReportPdf(companyId)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Button variant="ghost">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="download" size={16} /> Download PDF
                    </span>
                  </Button>
                </a>
              )}
              {isAdmin && (
                <Button variant="primary" onClick={handleGenerate} disabled={generating}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name={generating ? 'loader' : 'refresh-cw'} size={16} />
                    {generating ? 'Generating…' : 'Generate new'}
                  </span>
                </Button>
              )}
            </div>
          </div>

          {generateError && (
            <div style={{
              marginBottom: 12, padding: '10px 14px',
              background: 'rgba(239,68,68,0.06)', border: '1px solid var(--snh-danger)',
              borderRadius: 'var(--radius-2)', color: 'var(--snh-danger)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)',
            }}>
              {generateError}
            </div>
          )}

          {loading && (
            <Card>
              <div style={{ padding: 32 }}>
                {[80, 60, 70, 50].map((w, i) => (
                  <div key={i} style={{ height: 14, borderRadius: 4, background: 'var(--border-1)', opacity: 0.6, width: `${w}%`, marginBottom: 14 }} />
                ))}
              </div>
            </Card>
          )}

          {!loading && error && (
            <Card><EmptyState message={error} /></Card>
          )}

          {!loading && !error && !report && (
            <Card><EmptyState message="No market brief available. Generate one to get started." /></Card>
          )}

          {!loading && !error && report && content && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Headline */}
              <Card>
                <div style={{ padding: '4px 0 12px' }}>
                  <EyebrowLabel>Market brief</EyebrowLabel>
                  <h3 style={{ marginTop: 8, marginBottom: 12, fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-h3)', color: 'var(--snh-navy)' }}>
                    {content.headline ?? 'Weekly FX Market Report'}
                  </h3>
                  <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body)', color: 'var(--fg-1)', lineHeight: 1.6 }}>
                    {content.portfolio_impact}
                  </p>
                  {content.risk_alert && (
                    <div style={{
                      marginTop: 12, padding: '10px 14px',
                      background: 'rgba(239,68,68,0.06)', border: '1px solid var(--snh-danger)',
                      borderRadius: 'var(--radius-2)', color: 'var(--snh-danger)',
                      fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)',
                    }}>
                      <Icon name="alert-triangle" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                      {content.risk_alert}
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}><AIDisclosureTag /></div>
                </div>
              </Card>

              {/* Pair commentary */}
              {Array.isArray(content.pair_commentary) && content.pair_commentary.length > 0 && (
                <Card>
                  <EyebrowLabel>Pair commentary</EyebrowLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
                    {content.pair_commentary.map((pair, i) => (
                      <div key={i} style={{
                        paddingBottom: i < content.pair_commentary.length - 1 ? 16 : 0,
                        borderBottom: i < content.pair_commentary.length - 1 ? '1px solid var(--border-1)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--fw-bold)', color: 'var(--snh-navy)', fontSize: 'var(--fs-body)' }}>
                            {pair.pair}
                          </span>
                          <span style={{
                            fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
                            color: pair.favourable ? 'var(--snh-success)' : 'var(--snh-danger)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {pair.movement}
                          </span>
                        </div>
                        <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--fg-1)' }}>
                          {pair.client_impact}
                        </p>
                        {pair.action && (
                          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--snh-gold)', fontWeight: 'var(--fw-bold)' }}>
                            {pair.action}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Lex L-D1: AI disclosure adjacent to action language — two-tier pattern.
                      Disclosure must appear in this card as pair.action is advice-adjacent. */}
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-1)' }}>
                    <AIDisclosureTag />
                  </div>
                </Card>
              )}

              {/* Key events */}
              {Array.isArray(content.key_events) && content.key_events.length > 0 && (
                <Card>
                  <EyebrowLabel>Key events</EyebrowLabel>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                        {['Event', 'Date', 'Currency', 'Impact', 'Note'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '8px 8px 10px',
                            fontSize: 'var(--fs-eyebrow)', fontWeight: 700,
                            letterSpacing: '0.14em', textTransform: 'uppercase',
                            color: 'var(--snh-gold)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {content.key_events.map((ev, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-1)' }}>
                          <td style={{ padding: '12px 8px', fontFamily: 'var(--font-body)', fontWeight: 'var(--fw-bold)', color: 'var(--snh-navy)' }}>{ev.event}</td>
                          <td style={{ padding: '12px 8px', fontFamily: 'var(--font-body)', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>{formatDateMedium(ev.date)}</td>
                          <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{ev.currency}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{
                              fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              color: ev.impact === 'High' ? 'var(--snh-danger)' : ev.impact === 'Medium' ? 'var(--snh-warning)' : 'var(--snh-slate)',
                            }}>{ev.impact}</span>
                          </td>
                          <td style={{ padding: '12px 8px', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--fg-2)' }}>{ev.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {/* Week ahead */}
              {content.week_ahead && (
                <Card>
                  <EyebrowLabel>Week ahead</EyebrowLabel>
                  <p style={{ marginTop: 8, marginBottom: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body)', color: 'var(--fg-1)', lineHeight: 1.6 }}>
                    {content.week_ahead}
                  </p>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Report history ───────────────────────────────────────────────── */}
      {section === 'history' && (
        <Card>
          {loading && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={3} />)}</tbody>
            </table>
          )}
          {!loading && history.length === 0 && (
            <EmptyState message="No report history available." />
          )}
          {!loading && history.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                  {['Headline', 'Report date', 'Generated'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '12px 8px',
                      fontSize: 'var(--fs-eyebrow)', fontWeight: 700,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--snh-gold)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={r.id ?? i} style={{ borderBottom: '1px solid var(--border-1)' }}>
                    <td style={{ padding: '14px 8px', fontFamily: 'var(--font-body)', color: 'var(--snh-navy)', fontWeight: 'var(--fw-bold)' }}>
                      {r.headline ?? '—'}
                    </td>
                    <td style={{ padding: '14px 8px', fontFamily: 'var(--font-body)', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.report_date ? formatDateMedium(r.report_date) : '—'}
                    </td>
                    <td style={{ padding: '14px 8px', fontFamily: 'var(--font-body)', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.generated_at ? formatDateTime(r.generated_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Maturity schedule ────────────────────────────────────────────── */}
      {section === 'maturity' && (
        <MaturitySection maturity={maturity} loading={loading} />
      )}
    </>
  )
}

// ── Maturity schedule sub-section ─────────────────────────────────────────────
function MaturitySection({ maturity, loading }) {
  const tranches = maturity?.tranches ?? []
  const summary  = maturity?.summary  ?? {}

  return (
    <>
      {/* Summary buckets */}
      {!loading && Object.keys(summary).length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {[['30d', summary['30d']], ['60d', summary['60d']], ['90d', summary['90d']]].map(([label, val]) => (
            val != null && (
              <Card key={label} style={{ flex: 1 }}>
                <EyebrowLabel>Maturing &lt; {label}</EyebrowLabel>
                <p style={{
                  margin: '6px 0 0', fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-h3)', fontWeight: 'var(--fw-bold)',
                  color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatNotional(val, summary.base_currency ?? 'EUR')}
                </p>
                <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-caption)', color: 'var(--fg-2)' }}>
                  base currency notional
                </p>
              </Card>
            )
          ))}
        </div>
      )}

      <Card>
        {loading && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}</tbody>
          </table>
        )}
        {!loading && tranches.length === 0 && (
          <EmptyState message="No upcoming maturities." />
        )}
        {!loading && tranches.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                {['Exposure', 'Pair', 'Amount', 'Hedge rate', 'Value date', 'Days'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '12px 8px',
                    fontSize: 'var(--fs-eyebrow)', fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: 'var(--snh-gold)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tranches.map((t, i) => (
                <tr key={t.tranche_id ?? i} style={{ borderBottom: '1px solid var(--border-1)' }}>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--fw-bold)', color: 'var(--snh-navy)' }}>
                      {t.description ?? '—'}
                    </div>
                    {t.reference && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--fg-2)' }}>
                        {t.reference}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <FlagPair pair={`${t.from_currency}/${t.to_currency}`} />
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {formatNotional(t.amount, t.amount_currency ?? t.from_currency)}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {Number(t.rate).toFixed(4)}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: 'var(--font-body)', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {t.value_date ? formatDateMedium(t.value_date) : '—'}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{
                      color: t.days_to_maturity <= 7
                        ? 'var(--snh-danger)'
                        : t.days_to_maturity <= 30
                        ? 'var(--snh-warning)'
                        : 'var(--fg-2)',
                      fontWeight: t.days_to_maturity <= 7 ? 'var(--fw-bold)' : 'var(--fw-regular)',
                    }}>
                      {t.days_to_maturity}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — AUDIT TRAIL
// ─────────────────────────────────────────────────────────────────────────────

function AuditTrailTab({ companyId }) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Filter state
  const [typeFilter, setTypeFilter] = useState('all') // all | tranche | order | value_date_change

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    fetch(API.auditHedgeTrail(companyId), { credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => setEvents(data.events ?? []))
      .catch(() => setError('Unable to load audit trail.'))
      .finally(() => setLoading(false))
  }, [companyId])

  // CSV export — authenticated download
  // L-E1: Lex to review field set before external rollout. Button present but labelled
  // with a note in the title attribute until Lex confirms.
  // M-1 (BF-002): CSV download uses ?token= param — cannot use HttpOnly cookie for
  // anchor-tag downloads. Needs Axel sign-off on solution before changing.
  function handleCsvDownload() {
    const url = API.auditHedgeTrailCsv(companyId)
    const a = document.createElement('a')
    a.href = `${url}&token=${localStorage.getItem('auth_token') ?? ''}`
    a.download = 'hedge-trail.csv'
    a.click()
  }

  const filtered = typeFilter === 'all'
    ? events
    : events.filter(e => e.event_type === typeFilter)

  const counts = {
    all:                events.length,
    tranche:            events.filter(e => e.event_type === 'tranche').length,
    order:              events.filter(e => e.event_type === 'order').length,
    value_date_change:  events.filter(e => e.event_type === 'value_date_change').length,
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Tabs variant="pill" active={typeFilter} onChange={setTypeFilter} items={[
          { id: 'all',                label: 'All events',    count: counts.all                },
          { id: 'tranche',            label: 'Executions',    count: counts.tranche            },
          { id: 'order',              label: 'Orders sent',   count: counts.order              },
          { id: 'value_date_change',  label: 'Value dates',   count: counts.value_date_change  },
        ]} />
        <Button
          variant="ghost"
          onClick={handleCsvDownload}
          title="Export field set subject to Lex sign-off (Condition L-E1) before external distribution"
          disabled={loading || events.length === 0}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="download" size={16} /> Export CSV
          </span>
        </Button>
      </div>

      <Card>
        {loading && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}</tbody>
          </table>
        )}
        {!loading && error && <EmptyState message={error} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState message="No events found." />
        )}
        {!loading && !error && filtered.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                {['Date', 'Type', 'Pair', 'Reference', 'Detail', 'Status'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '12px 8px',
                    fontSize: 'var(--fs-eyebrow)', fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: 'var(--snh-gold)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev, i) => (
                // Cipher L-3: stable compound key — event_type + timestamp + entity id
                <AuditRow key={`${ev.event_type}-${ev.event_at ?? i}-${ev.tranche_id ?? ev.exposure_id ?? i}`} ev={ev} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

// ── Audit trail row ───────────────────────────────────────────────────────────
function AuditRow({ ev }) {
  // Detail line — context-dependent by event type
  let detail = '—'
  if (ev.event_type === 'tranche') {
    const amt = ev.amount != null ? Number(ev.amount).toLocaleString('en-GB', { maximumFractionDigits: 0 }) : '—'
    const rate = ev.execution_rate != null ? Number(ev.execution_rate).toFixed(4) : '—'
    detail = `${ev.amount_currency ?? ''} ${amt}  ·  Rate ${rate}`
    if (ev.instrument) detail += `  ·  ${ev.instrument.toUpperCase()}`
  } else if (ev.event_type === 'order') {
    detail = ev.notes ?? ev.order_type ?? '—'
    if (ev.limit_rate != null)  detail += `  ·  Limit ${Number(ev.limit_rate).toFixed(4)}`
    if (ev.stop_rate  != null)  detail += `  ·  Stop ${Number(ev.stop_rate).toFixed(4)}`
  } else if (ev.event_type === 'value_date_change') {
    detail = ev.reason ?? '—'
  }

  const eventDate = ev.event_at ? formatDateTime(ev.event_at) : '—'

  return (
    <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
      <td style={{ padding: '12px 8px', fontFamily: 'var(--font-body)', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {eventDate}
      </td>
      <td style={{ padding: '12px 8px' }}>
        <EventTypePill type={ev.event_type} />
      </td>
      <td style={{ padding: '12px 8px' }}>
        {ev.currency_pair ? <FlagPair pair={ev.currency_pair} /> : <span style={{ color: 'var(--fg-2)' }}>—</span>}
      </td>
      <td style={{ padding: '12px 8px' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--fw-bold)', color: 'var(--snh-navy)', fontSize: 'var(--fs-body-sm)' }}>
          {ev.description ?? '—'}
        </div>
        {ev.reference && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--fg-2)' }}>
            {ev.reference}
          </div>
        )}
      </td>
      <td style={{ padding: '12px 8px', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>
        {detail}
      </td>
      <td style={{ padding: '12px 8px' }}>
        <TrancheStatusPill status={ev.tranche_status} />
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

export default function Documents() {
  const { selectedCompanyId } = useCompany()
  // Admin check — matches App.jsx pattern (auth_user in localStorage)
  const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
  const isAdmin  = ['superadmin', 'admin'].includes(authUser?.role)

  const [tab, setTab] = useState('reports')

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop: 8, fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', color: 'var(--snh-navy)' }}>
            Reports
          </h2>
          <p style={{ marginTop: 6, marginBottom: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--fg-2)' }}>
            Market briefs · maturity schedule · audit trail
          </p>
        </div>
      </div>

      {/* Primary tab strip */}
      <div style={{ marginBottom: 28 }}>
        <Tabs variant="underline" active={tab} onChange={setTab} items={[
          { id: 'reports',      label: 'Reports'     },
          { id: 'audit-trail',  label: 'Audit trail' },
        ]} />
      </div>

      {tab === 'reports'     && <ReportsTab    companyId={selectedCompanyId} isAdmin={isAdmin} />}
      {tab === 'audit-trail' && <AuditTrailTab companyId={selectedCompanyId} />}
    </>
  )
}
