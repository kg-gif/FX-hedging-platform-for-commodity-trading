// FxOverview.jsx — Phase 3 real-data port
import { useState, useEffect } from 'react'
import { useCompany } from '../../contexts/CompanyContext'
import { API_BASE, authHeaders } from '../../utils/api'
import { formatPnL, formatDateMedium } from '../../utils/formatting'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'
import ThinkingIndicator from '../ui/ThinkingIndicator'

function FlagPair({ from, to }) {
  const map = { EUR:'eu',USD:'us',GBP:'gb',NOK:'no',JPY:'jp',CHF:'ch',SEK:'se',DKK:'dk' }
  return (
    <span style={{ display:'inline-flex',alignItems:'center',gap:6 }}>
      <span className={`fi fi-${map[from]||'un'}`} style={{ width:16,height:12,borderRadius:1 }} />
      <span className="mono" style={{ fontWeight:'var(--fw-bold)',color:'var(--snh-navy)' }}>{from}/{to}</span>
      <span className={`fi fi-${map[to]||'un'}`} style={{ width:16,height:12,borderRadius:1 }} />
    </span>
  )
}

const STATUS_DISPLAY = {
  BREACH:      { label:'Breach',   bg:'rgba(239,68,68,0.10)',   color:'var(--snh-danger)'  },
  IN_PROGRESS: { label:'Elevated', bg:'rgba(245,158,11,0.10)',  color:'var(--snh-warning)' },
  HEDGED:      { label:'On track', bg:'rgba(16,185,129,0.10)',  color:'var(--snh-success)' },
  OPEN:        { label:'Open',     bg:'rgba(141,164,196,0.18)', color:'var(--snh-slate)'   },
}

function StatusPill({ status }) {
  const s = STATUS_DISPLAY[status] || STATUS_DISPLAY.OPEN
  return (
    <span style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:'var(--radius-pill)',background:s.bg,color:s.color,fontSize:'var(--fs-eyebrow)',fontWeight:'var(--fw-bold)',letterSpacing:'0.05em',textTransform:'uppercase' }}>
      <span style={{ width:6,height:6,borderRadius:'50%',background:s.color }} />
      {s.label}
    </span>
  )
}

function SubStat({ label, value, valueColour='var(--snh-navy)', mono=true }) {
  return (
    <div>
      <div className="caption" style={{ color:'var(--fg-2)',marginBottom:4 }}>{label}</div>
      <div className={mono ? 'mono tabular' : 'tabular'} style={{ fontSize:'var(--fs-h3)',fontWeight:'var(--fw-regular)',color:valueColour,lineHeight:1.2 }}>{value}</div>
    </div>
  )
}

function portfolioStatus(exposures) {
  if (exposures.some(e => e.status === 'BREACH')) return 'BREACH'
  if (exposures.every(e => e.status === 'HEDGED')) return 'HEDGED'
  return 'IN_PROGRESS'
}

function topRecommendation(exposures, company) {
  const baseCcy = company?.base_currency || 'EUR'
  // Only consider exposures with a configured policy target and a valid EUR amount.
  // Exposures missing target_ratio are excluded — we must not guess a default.
  const active = exposures.filter(e =>
    !e.archived &&
    e.status !== 'HEDGED' &&
    e.target_ratio != null &&
    (e.total_amount_eur || 0) > 0
  )
  if (!active.length) return null
  const sorted = [...active].sort((a, b) => {
    // Sort by largest EUR coverage gap. Use hedged_amount_eur only — never fall back
    // to hedged_amount (wrong currency denomination vs total_amount_eur).
    const gapA = (a.total_amount_eur||0) - (a.hedged_amount_eur||0)
    const gapB = (b.total_amount_eur||0) - (b.hedged_amount_eur||0)
    return gapB - gapA
  })
  const top = sorted[0]
  const totalEur  = top.total_amount_eur || 0
  // hedged_amount_eur only — hedged_amount is denominated in the exposure's own
  // currency and must not be used as a EUR substitute.
  const hedgedEur = top.hedged_amount_eur || 0
  const coveragePct = totalEur > 0 ? Math.round((hedgedEur/totalEur)*100) : 0
  const targetPct   = Math.round(top.target_ratio * 100)
  const neededEur   = Math.max(0, totalEur * top.target_ratio - hedgedEur)
  return { pair:`${top.from_currency}/${top.to_currency}`, coveragePct, targetPct, neededEur, currentSpot:top.current_spot, valueDate:top.value_date, pnlProtection:top.locked_pnl||0, baseCcy }
}

function useEnrichedExposures() {
  const { selectedCompanyId, companyLoading, getSelectedCompany } = useCompany()
  const [exposures, setExposures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  useEffect(() => {
    if (companyLoading || !selectedCompanyId) return
    let cancelled = false
    setLoading(true); setError(null)
    fetch(`${API_BASE}/api/exposures/enriched?company_id=${selectedCompanyId}&include_archived=false`, { headers: authHeaders() })
      .then(res => { if (!res.ok) throw new Error(`API error ${res.status}`); return res.json() })
      .then(data => { if (cancelled) return; setExposures(Array.isArray(data) ? data : (data.items||data.exposures||[])); setLastRefresh(new Date()); setLoading(false) })
      .catch(err => { if (cancelled) return; console.error('[FxOverview] fetch failed:', err); setError(err.message); setLoading(false) })
    return () => { cancelled = true }
  }, [selectedCompanyId, companyLoading])
  return { exposures, loading, error, lastRefresh, company: getSelectedCompany() }
}

export default function FxOverview() {
  const { exposures, loading, error, lastRefresh, company } = useEnrichedExposures()
  const totalEur    = exposures.reduce((s,e) => s+(e.total_amount_eur||0), 0)
  const combinedPnl = exposures.reduce((s,e) => s+(e.combined_pnl||0), 0)
  // hedged_amount_eur only — hedged_amount is in the exposure's own currency, not EUR.
  const hedgedEur   = exposures.reduce((s,e) => s+(e.hedged_amount_eur||0), 0)
  const coveragePct = totalEur > 0 ? Math.round((hedgedEur/totalEur)*100) : 0
  const unhedgedEur = totalEur - hedgedEur
  const baseCcy     = company?.base_currency || 'EUR'
  const pStatus     = exposures.length ? portfolioStatus(exposures) : 'OPEN'
  const recommendation = !loading ? topRecommendation(exposures, company) : null
  const refreshLabel = lastRefresh ? lastRefresh.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})+' CET' : '—'

  return (
    <>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop:8 }}>FX exposure overview</h2>
          <div style={{ marginTop:8,display:'flex',alignItems:'center',gap:12 }}>
            <span className="caption" style={{ color:'var(--fg-2)' }}>{company?.name||'—'} · 90-day forward window · last refresh {refreshLabel}</span>
            {loading && <ThinkingIndicator size={12} />}
          </div>
        </div>
        <div style={{ display:'flex',gap:12 }}>
          <Button variant="ghost"><span style={{ display:'inline-flex',alignItems:'center',gap:8 }}><Icon name="file-text" size={16} /> Export brief</span></Button>
          <Button variant="primary"><span style={{ display:'inline-flex',alignItems:'center',gap:8 }}><Icon name="shield" size={16} /> New hedge</span></Button>
        </div>
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.08)',border:'1px solid var(--snh-danger)',borderRadius:'var(--radius-3)',padding:'16px 20px',marginBottom:16,display:'flex',alignItems:'center',gap:12,color:'var(--snh-danger)',fontSize:'var(--fs-body-sm)',fontWeight:'var(--fw-bold)' }}>
          <Icon name="alert-circle" size={18} />
          Failed to load exposure data — {error}. Refresh to retry.
        </div>
      )}

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
          <div style={{ flex:1 }}>
            <EyebrowLabel>Total FX exposure · 90-day forward</EyebrowLabel>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:'var(--fw-bold)',fontSize:56,color:'var(--snh-gold)',lineHeight:1.05,letterSpacing:'-0.02em',fontVariantNumeric:'tabular-nums',marginTop:12 }}>
              {loading ? '—' : `${baseCcy} ${Math.round(totalEur).toLocaleString('en-GB')}`}
            </div>
            <p className="caption" style={{ marginTop:8,color:'var(--fg-2)' }}>Across {exposures.length} exposure{exposures.length!==1?'s':''} · last refresh {refreshLabel}</p>
          </div>
          <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:16 }}>
            <StatusPill status={pStatus} />
            <div style={{ textAlign:'right' }}>
              <div className="caption" style={{ color:'var(--fg-2)',marginBottom:4 }}>Combined P&L</div>
              <div className="mono tabular" style={{ fontSize:'var(--fs-body)',fontWeight:'var(--fw-regular)',lineHeight:1.2,color:combinedPnl>=0?'var(--snh-success)':'var(--snh-danger)' }}>
                {loading ? '—' : formatPnL(combinedPnl, baseCcy)}
              </div>
            </div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid var(--border-1)',marginTop:24,paddingTop:20,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:24 }}>
          <SubStat label="Hedged"             value={loading?'—':`${coveragePct}%`} />
          <SubStat label="Unhedged notional"  value={loading?'—':`${baseCcy} ${Math.round(unhedgedEur).toLocaleString('en-GB')}`} />
          <SubStat label="Margin protected"   value={loading?'—':formatPnL(combinedPnl,baseCcy)} valueColour={combinedPnl>=0?'var(--snh-success)':'var(--snh-danger)'} />
          <SubStat label="Open positions"     value={loading?'—':String(exposures.filter(e=>e.status!=='HEDGED').length)} />
        </div>
      </Card>

      <Card style={{ marginBottom:16 }}>
        {loading || !recommendation ? (
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 0',gap:12 }}>
            {loading
              ? <><ThinkingIndicator size={14} /><p className="caption" style={{ color:'var(--fg-2)',marginTop:8 }}>Loading recommendations…</p></>
              : <p style={{ color:'var(--fg-2)',fontSize:'var(--fs-body-sm)' }}>All exposures are at policy target. No action required.</p>}
          </div>
        ) : (
          <>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <EyebrowLabel>Policy action required</EyebrowLabel>
                <h3 style={{ marginTop:8 }}>{recommendation.pair} · 90-day forward</h3>
                <p style={{ marginTop:12,maxWidth:640 }}>
                  Your policy targets {recommendation.targetPct}% cover on {recommendation.pair}; current cover is {recommendation.coveragePct}%. To meet policy: {baseCcy} {Math.round(recommendation.neededEur).toLocaleString('en-GB')} on {recommendation.pair} forward.
                  {recommendation.pnlProtection>0 ? ` Locked P&L at policy target: ${formatPnL(recommendation.pnlProtection,baseCcy)}.` : ''}
                </p>
                <p style={{ marginTop:12,fontSize:'var(--fs-eyebrow)',color:'var(--snh-slate)',lineHeight:1.6 }}>
                  Generated by Sumnohow's AI risk engine. This is decision support, not regulated investment advice. Validate against your own assessment before action.{' '}
                  <a href="/legal" style={{ color:'var(--snh-slate)',textDecoration:'underline' }}>AI-generated decision support — full disclosure.</a>
                </p>
              </div>
              <span style={{ fontSize:'var(--fs-eyebrow)',fontWeight:'var(--fw-bold)',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--snh-slate)' }}>Policy action</span>
            </div>
            <div style={{ borderTop:'1px solid var(--border-1)',marginTop:24,paddingTop:20,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:24 }}>
              <SubStat label="Notional"     value={`${baseCcy} ${Math.round(recommendation.neededEur).toLocaleString('en-GB')}`} />
              <SubStat label="Current spot" value={recommendation.currentSpot?recommendation.currentSpot.toFixed(4):'—'} />
              <SubStat label="Value date"   value={recommendation.valueDate?formatDateMedium(recommendation.valueDate):'—'} mono={false} />
              <SubStat label="Locked P&L"   value={formatPnL(recommendation.pnlProtection,baseCcy)} valueColour={recommendation.pnlProtection>=0?'var(--snh-success)':'var(--snh-danger)'} />
            </div>
            <div style={{ display:'flex',gap:12,marginTop:24,alignItems:'center' }}>
              {/* TODO Phase 3 — wire Execute hedge to hedge execution modal */}
              <Button variant="gold" disabled><span style={{ display:'inline-flex',alignItems:'center',gap:8 }}>Execute hedge <Icon name="arrow-right" size={16} /></span></Button>
              <Button variant="ghost">Review framework</Button>
              <button
                aria-label={`Decline policy recommendation for ${recommendation.pair}`}
                style={{ background:'transparent',border:'none',color:'var(--snh-slate)',fontFamily:'var(--font-body)',fontSize:'var(--fs-body-sm)',cursor:'pointer' }}
              >Decline</button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16 }}>
          <div><EyebrowLabel>Exposure by pair</EyebrowLabel><h3 style={{ marginTop:8 }}>Open positions</h3></div>
          <button style={{ background:'transparent',border:'none',color:'var(--snh-navy)',fontFamily:'var(--font-body)',fontSize:'var(--fs-body-sm)',fontWeight:'var(--fw-bold)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6 }}>View all <Icon name="arrow-right" size={14} /></button>
        </div>
        {loading ? (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'center',padding:'32px 0' }}>
            <ThinkingIndicator size={14} />
          </div>
        ) : (
          <table style={{ width:'100%',borderCollapse:'collapse' }} aria-label="FX exposure positions">
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border-1)' }}>
                {['Pair',`Notional (${baseCcy})`,'Cover','P&L','Value date','Status'].map(h => (
                  <th key={h} scope="col" style={{ textAlign:'left',padding:'12px 8px',fontSize:'var(--fs-eyebrow)',fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--snh-slate)' }}>{h}</th>
                ))}
                <th scope="col" style={{ width:24 }} />
              </tr>
            </thead>
            <tbody>
              {exposures.map((e,i) => {
                const eur = Math.round(e.total_amount_eur||0)
                const cov = e.total_amount_eur>0 ? Math.round(((e.hedged_amount_eur||0)/e.total_amount_eur)*100) : 0
                return (
                  <tr key={e.id||i} style={{ borderBottom:'1px solid var(--border-1)' }}>
                    <td style={{ padding:'14px 8px' }}><FlagPair from={e.from_currency} to={e.to_currency} /></td>
                    <td className="mono tabular" style={{ padding:'14px 8px',color:'var(--snh-navy)' }}>{eur.toLocaleString('en-GB')}</td>
                    <td className="mono tabular" style={{ padding:'14px 8px' }}>{cov}%</td>
                    <td className="mono tabular" style={{ padding:'14px 8px',color:(e.combined_pnl||0)>=0?'var(--snh-success)':'var(--snh-danger)' }}>{formatPnL(e.combined_pnl||0,baseCcy)}</td>
                    <td style={{ padding:'14px 8px',color:'var(--fg-2)' }}>{e.value_date?formatDateMedium(e.value_date):'—'}</td>
                    <td style={{ padding:'14px 8px' }}><StatusPill status={e.status} /></td>
                    <td style={{ padding:'14px 8px',textAlign:'right' }}><Icon name="chevron-right" size={16} style={{ color:'var(--snh-slate)' }} aria-hidden="true" /></td>
                  </tr>
                )
              })}
              {exposures.length===0 && (
                <tr><td colSpan={7} style={{ padding:'24px 8px',textAlign:'center',color:'var(--fg-2)',fontSize:'var(--fs-body-sm)' }}>No active exposures found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

export function FxOverviewRightColumn() {
  const { exposures, loading, company } = useEnrichedExposures()
  const breaches = exposures.filter(e => e.status === 'BREACH')
  const baseCcy  = company?.base_currency || 'EUR'
  return (
    <>
      {loading && (
        <div style={{ background:'var(--snh-card)',border:'1px solid var(--border-1)',borderRadius:'var(--radius-3)',padding:24,boxShadow:'var(--shadow-1)',display:'flex',justifyContent:'center' }}>
          <ThinkingIndicator size={12} />
        </div>
      )}
      {!loading && breaches.map(e => (
        <div key={e.id} style={{ background:'var(--snh-card)',border:'1px solid var(--snh-warning)',borderRadius:'var(--radius-3)',padding:16,boxShadow:'var(--shadow-1)' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8 }}>
            <div style={{ display:'inline-flex',alignItems:'center',gap:8 }}>
              <Icon name="alert-triangle" size={18} style={{ color:'var(--snh-warning)' }} />
              <span style={{ fontSize:'var(--fs-eyebrow)',letterSpacing:'0.14em',textTransform:'uppercase',fontWeight:'var(--fw-bold)',color:'var(--snh-warning)' }}>{e.from_currency}/{e.to_currency} · Breach</span>
            </div>
            <button style={{ background:'transparent',border:'1px solid var(--border-1)',borderRadius:'var(--radius-3)',padding:'4px 10px',fontSize:'var(--fs-eyebrow)',color:'var(--snh-navy)',cursor:'pointer' }}>Open position</button>
          </div>
          <p className="caption" style={{ marginTop:8,color:'var(--fg-1)' }}>Your policy sets a cover floor on {e.from_currency}/{e.to_currency}; current cover is {e.total_amount_eur>0?Math.round(((e.hedged_amount_eur||0)/e.total_amount_eur)*100):0}%. Policy requires action.</p>
        </div>
      ))}
      {!loading && exposures.length>0 && (
        <div style={{ background:'var(--snh-card)',border:'1px solid var(--border-1)',borderRadius:'var(--radius-3)',padding:16,boxShadow:'var(--shadow-1)' }}>
          <EyebrowLabel style={{ marginBottom:12 }}>Portfolio P&L</EyebrowLabel>
          {[
            { label:'Locked P&L',   value:exposures.reduce((s,e)=>s+(e.locked_pnl||0),0) },
            { label:'Floating P&L', value:exposures.reduce((s,e)=>s+(e.floating_pnl||0),0) },
            { label:'Combined P&L', value:exposures.reduce((s,e)=>s+(e.combined_pnl||0),0) },
          ].map(row => (
            <div key={row.label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border-1)' }}>
              <div className="caption" style={{ color:'var(--fg-2)' }}>{row.label}</div>
              <div className="mono tabular" style={{ fontWeight:'var(--fw-bold)',color:row.value>=0?'var(--snh-success)':'var(--snh-danger)' }}>{formatPnL(row.value,baseCcy)}</div>
            </div>
          ))}
        </div>
      )}
      {!loading && exposures.length>0 && (
        <div style={{ background:'var(--snh-card)',border:'1px solid var(--border-1)',borderRadius:'var(--radius-3)',padding:16,boxShadow:'var(--shadow-1)' }}>
          <EyebrowLabel style={{ marginBottom:12 }}>Coverage by pair</EyebrowLabel>
          {exposures.map((e,i) => {
            const cov = e.total_amount_eur>0 ? Math.round(((e.hedged_amount_eur||0)/e.total_amount_eur)*100) : 0
            return (
              <div key={e.id||i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border-1)' }}>
                <div>
                  <div style={{ fontWeight:'var(--fw-bold)',color:'var(--snh-navy)' }}>{e.from_currency}/{e.to_currency}</div>
                  <div className="caption" style={{ color:'var(--fg-2)' }}>{baseCcy} {Math.round(e.total_amount_eur||0).toLocaleString('en-GB')}</div>
                </div>
                <div className="mono tabular" style={{ fontWeight:'var(--fw-bold)',color:e.status==='BREACH'?'var(--snh-danger)':e.status==='HEDGED'?'var(--snh-success)':'var(--snh-warning)' }}>{cov}%</div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
