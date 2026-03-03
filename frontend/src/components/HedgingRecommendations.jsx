import React, { useState, useEffect } from 'react'

const API_BASE = 'https://birk-fx-api.onrender.com'
const NAVY = '#1A2744'
const GOLD = '#C9A86C'

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr)
  let count = 0
  while (count < Math.abs(days)) {
    d.setDate(d.getDate() + (days > 0 ? 1 : -1))
    if (d.getDay() !== 0 && d.getDay() !== 6) count++
  }
  return d.toISOString().split('T')[0]
}

function toDisplayDate(isoStr) {
  if (!isoStr) return ''
  const [y, m, d] = isoStr.split('-')
  return `${d}/${m}/${y}`
}

function isForward(valueDateStr) {
  const today = new Date()
  today.setHours(0,0,0,0)
  const t2 = new Date(today)
  t2.setDate(t2.getDate() + 2)
  return new Date(valueDateStr) > t2
}

function getDirection(rec) {
  const [from, to] = rec.currency_pair.split('/')
  if (rec.exposure_type === 'receivable') return { buy: from, sell: to }
  return { sell: from, buy: to }
}

function nowDisplay() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function Row({ label, value, bold, note }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span style={{ color: '#1A2744', fontWeight: bold ? 700 : 500 }}>
        {value}
        {note && <span className="ml-2 text-xs text-gray-400">({note})</span>}
      </span>
    </div>
  )
}

// ── Order Status Banner shown on card after order is sent ─────────
function OrderStatusBanner({ order, exposureId, companyId, onSendAgain }) {
  const [confirming, setConfirming] = useState(false)
  const [executing, setExecuting]   = useState(false)
  const [executed, setExecuted]     = useState(false)

  async function handleMarkExecuted() {
    setExecuting(true)
    try {
      // 1. Existing audit log (unchanged)
      await fetch(`${API_BASE}/api/audit/mark-executed`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          company_id: companyId,
          exposure_id: exposureId,
          executed_at: new Date().toISOString(),
          confirmed_by: JSON.parse(localStorage.getItem('auth_user') || '{}').email || 'unknown'
        })
      })

      // 2. Create tranche record — links execution to register
      await fetch(`${API_BASE}/api/exposures/${exposureId}/tranches`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          amount:     order.amount,
          rate:       order.currentSpot || null,
          instrument: order.instrument,
          value_date: order.valueDate
            ? order.valueDate.split('/').reverse().join('-')
            : null,
          notes: `Order type: ${order.orderType}.`
        })
      })

      setExecuted(true)
    } catch (e) { console.error('Mark executed failed:', e) }
    finally { setExecuting(false) }
  }

  if (executed) {
    return (
      <div className="mt-4 rounded-xl px-4 py-3 flex items-center gap-3"
        style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
        <span className="text-green-600 text-lg">✓</span>
        <div>
          <p className="text-sm font-semibold text-green-800">Marked as executed</p>
          <p className="text-xs text-green-600">Recorded for reporting - {nowDisplay()}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl px-4 py-3"
      style={{ background: '#FFF8EC', border: '1px solid #F0D9A8' }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#92660A' }}>
            Order sent to bank
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {order.orderType === 'limit' ? 'Limit order' : 'Immediate execution'} - {order.instrument} - Value date {order.valueDate}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            {order.sentBy} - {order.timestamp}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={handleMarkExecuted}
            disabled={executing}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: '#16A34A' }}>
            {executing ? 'Saving...' : 'Mark as Executed'}
          </button>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400 text-amber-700">
              Send Again
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => { setConfirming(false); onSendAgain() }}
                className="px-2 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ background: NAVY }}>
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-2 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-200">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Execution Modal ───────────────────────────────────────────────
function ExecutionModal({ rec, bankEmail, bankName, companyId, onClose, onSent }) {
  const user = JSON.parse(localStorage.getItem('auth_user') || '{}')
  const defaultValueDate = rec.end_date
    ? rec.end_date.split('T')[0]
    : addBusinessDays(new Date().toISOString().split('T')[0], 2)

  const [orderType, setOrderType]             = useState('immediate')
  const [valueDate, setValueDate]             = useState(defaultValueDate)
  const [originalValueDate]                   = useState(defaultValueDate)
  const [valueDateReason, setValueDateReason] = useState('')
  const [showReasonBox, setShowReasonBox]     = useState(false)
  const [limitRate, setLimitRate]             = useState('')
  const [stopRate, setStopRate]               = useState('')
  const [goodTill, setGoodTill]               = useState(addBusinessDays(defaultValueDate, -3))
  const [saving, setSaving]                   = useState(false)
  const [sent, setSent]                       = useState(false)
  const [copied, setCopied]                   = useState(false)
  const [currentSpot, setCurrentSpot]         = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/fx-rates?pairs=${rec.currency_pair}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCurrentSpot(data.rates?.[0]?.rate || null))
      .catch(() => {})
  }, [])

  const direction        = getDirection(rec)
  const [fromCcy]        = rec.currency_pair.split('/')
  const amountStr        = rec.action.replace(/[^0-9,]/g, '').replace(',', '')
  const displayAmount    = parseInt(amountStr).toLocaleString()
  const valueDateChanged = valueDate !== originalValueDate
  const instrumentType   = isForward(valueDate) ? 'Forward' : 'Spot'

  function handleValueDateChange(newDate) {
    setValueDate(newDate)
    setGoodTill(addBusinessDays(newDate, -3))
    if (newDate !== originalValueDate) setShowReasonBox(true)
    else { setShowReasonBox(false); setValueDateReason('') }
  }

  async function logValueDateChange() {
    if (!valueDateChanged || !valueDateReason.trim()) return
    try {
      await fetch(`${API_BASE}/api/audit/value-date-change`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          company_id: companyId, exposure_id: rec.exposure_id,
          currency_pair: rec.currency_pair, original_date: originalValueDate,
          new_date: valueDate, reason: valueDateReason,
          changed_by: user.email || 'unknown'
        })
      })
    } catch (e) { console.error('Audit log failed:', e) }
  }

  const subjectImmediate = `FX ${instrumentType} Request - ${rec.action} ${rec.currency_pair}`
  const subjectLimit     = `FX Limit Order - ${rec.action} ${rec.currency_pair}`

  const bodyImmediate = [
    `Dear ${bankName || 'FX Desk'},`,
    '',
    'Please execute the following FX transaction:',
    '',
    `Direction:     Sell ${direction.sell} / Buy ${direction.buy}`,
    `Amount:        ${fromCcy} ${displayAmount}`,
    `Currency Pair: ${rec.currency_pair}`,
    `Instrument:    ${instrumentType}`,
    `Value Date:    ${toDisplayDate(valueDate)}`,
    'Rate:          At best / market rate',
    valueDateChanged ? `Note: Value date changed from ${toDisplayDate(originalValueDate)}. Reason: ${valueDateReason}` : null,
    '',
    'Please confirm execution by return.',
    '',
    'Kind regards'
  ].filter(l => l !== null).join('\n')

  const bodyLimit = [
    `Dear ${bankName || 'FX Desk'},`,
    '',
    'Please place the following limit order:',
    '',
    `Direction:     Sell ${direction.sell} / Buy ${direction.buy}`,
    `Amount:        ${fromCcy} ${displayAmount}`,
    `Currency Pair: ${rec.currency_pair}`,
    `Limit Rate:    ${limitRate} (take profit)`,
    `Stop Rate:     ${stopRate} (stop loss)`,
    `Value Date:    ${toDisplayDate(valueDate)}`,
    `Good Till:     ${toDisplayDate(goodTill)}`,
    'Instructions:  Please cancel automatically if not filled by Good Till date.',
    valueDateChanged ? `Note: Value date changed from ${toDisplayDate(originalValueDate)}. Reason: ${valueDateReason}` : null,
    '',
    'Please confirm order placement by return.',
    '',
    'Kind regards'
  ].filter(l => l !== null).join('\n')

  async function handleExecute() {
    if (valueDateChanged && !valueDateReason.trim()) {
      alert('Please provide a reason for changing the value date.')
      return
    }
    setSaving(true)
    if (valueDateChanged) await logValueDateChange()

    try {
      await fetch(`${API_BASE}/api/audit/order-sent`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          company_id: companyId, exposure_id: rec.exposure_id,
          currency_pair: rec.currency_pair, order_type: orderType,
          action: rec.action, value_date: valueDate, instrument: instrumentType,
          limit_rate: limitRate || null, stop_rate: stopRate || null,
          good_till: goodTill || null,
          sent_by: user.email || 'unknown',
          sent_at: new Date().toISOString()
        })
      })
    } catch (e) { console.error('Order audit log failed:', e) }

    const subject = orderType === 'immediate' ? subjectImmediate : subjectLimit
    const body    = orderType === 'immediate' ? bodyImmediate    : bodyLimit
    const mailto  = `mailto:${bankEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    const a = document.createElement('a')
    a.href = mailto
    a.click()

    setSaving(false)
    setSent(true)
    onSent(rec.exposure_id, {
      timestamp: nowDisplay(),
      sentBy: user.email || 'unknown',
      orderType,
      instrument: instrumentType,
      valueDate: toDisplayDate(valueDate),
      limitRate: limitRate || null,
      stopRate: stopRate || null,
      amount: parseFloat(amountStr) || 0,
      currentSpot,
      action: rec.action,
    })
  }

  async function handleCopy() {
    const text = orderType === 'immediate' ? bodyImmediate : bodyLimit
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-5" style={{ background: NAVY }}>
          <h2 className="text-lg font-bold text-white">{rec.action}</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
            {rec.currency_pair} - Sell {direction.sell} / Buy {direction.buy}
          </p>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📧</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Order sent to bank</h3>
            <p className="text-sm text-gray-500 mb-2">Email draft opened with full order details.</p>
            <p className="text-xs text-gray-400 mb-6">
              Once your bank confirms, use "Mark as Executed" on the recommendation card.
            </p>
            <button onClick={onClose} className="w-full py-3 rounded-lg font-semibold text-sm"
              style={{ background: NAVY, color: 'white' }}>
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex gap-2 p-1 rounded-lg" style={{ background: '#F4F6FA' }}>
              {[{ id: 'immediate', label: 'Immediate Execution' }, { id: 'limit', label: 'Limit Order' }].map(t => (
                <button key={t.id} onClick={() => setOrderType(t.id)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: orderType === t.id ? NAVY : 'transparent', color: orderType === t.id ? GOLD : '#6B7280' }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl p-4 space-y-2" style={{ background: '#F4F6FA' }}>
              <Row label="Direction"  value={`Sell ${direction.sell} / Buy ${direction.buy}`} bold />
              <Row label="Amount"     value={`${fromCcy} ${displayAmount}`} />
              <Row label="Instrument" value={instrumentType}
                note={instrumentType === 'Forward' ? 'Value date > T+2' : 'T+2 settlement'} />
            </div>

            {orderType === 'limit' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                    Limit Rate (Take Profit)
                  </label>
                  <input type="number" step="0.0001" value={limitRate}
                    onChange={e => setLimitRate(e.target.value)} placeholder="1.2600"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                    Stop Rate (Stop Loss)
                  </label>
                  <input type="number" step="0.0001" value={stopRate}
                    onChange={e => setStopRate(e.target.value)} placeholder="1.2200"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                Value Date
                {valueDateChanged && (
                  <span className="ml-2 text-xs font-normal text-amber-600">
                    (changed from {toDisplayDate(originalValueDate)})
                  </span>
                )}
              </label>
              <input type="date" value={valueDate}
                onChange={e => handleValueDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>

            {showReasonBox && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: '#92660A' }}>
                  Reason for changing value date *
                </label>
                <input type="text" value={valueDateReason}
                  onChange={e => setValueDateReason(e.target.value)}
                  placeholder="e.g. Cash flow timing changed, awaiting supplier confirmation"
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-amber-50" />
                <p className="text-xs text-amber-600 mt-1">This change will be logged for audit purposes.</p>
              </div>
            )}

            {orderType === 'limit' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                  Good Till Date
                </label>
                <input type="date" value={goodTill}
                  onChange={e => setGoodTill(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">
                  Defaults to 3 business days before value date. Bank will cancel if not filled.
                </p>
              </div>
            )}

            <div className="rounded-lg px-4 py-3 text-sm"
              style={{ background: 'rgba(26,39,68,0.04)', border: '1px solid rgba(26,39,68,0.1)' }}>
              {bankEmail
                ? <span style={{ color: NAVY }}>Will open email to <strong>{bankEmail}</strong></span>
                : <span className="text-amber-600">No bank email set - add one in Settings first</span>
              }
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500">
                  Cancel
                </button>
                <button onClick={handleExecute} disabled={saving || !bankEmail}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ background: NAVY, color: 'white' }}>
                  {saving ? 'Opening...' : 'Open Email Draft'}
                </button>
              </div>
              <button onClick={handleCopy}
                className="w-full py-2.5 border border-gray-200 rounded-lg text-sm font-semibold"
                style={{ color: NAVY }}>
                {copied ? 'Copied to clipboard' : 'Copy order details'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────
function HedgingRecommendations() {
  const authUser  = JSON.parse(localStorage.getItem('auth_user') || '{}')
  const companyId = authUser.company_id || 1

  const [recommendations, setRecommendations] = useState([])
  const [policy, setPolicy]                   = useState('')
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState(null)
  const [downloading, setDownloading]         = useState(false)
  const [activeModal, setActiveModal]         = useState(null)
  const [bankSettings, setBankSettings]       = useState({ email: '', name: '' })
  const [baseCurrency, setBaseCurrency]       = useState('USD')
  const [sentOrders, setSentOrders]           = useState({})

  useEffect(() => { loadAll() }, [companyId])

  async function loadAll() {
    setLoading(true)
    try {
      const [recRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/recommendations?company_id=${companyId}`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/settings/${companyId}`, { headers: authHeaders() }).then(r => r.json())
      ])
      if (recRes.error) setError(recRes.error)
      else { setRecommendations(recRes.recommendations); setPolicy(recRes.policy) }
      setBankSettings({ email: settingsRes.bank?.bank_email || '', name: settingsRes.bank?.bank_name || '' })
      setBaseCurrency(settingsRes.company?.base_currency || 'USD')
    } catch { setError('Failed to load recommendations') }
    finally { setLoading(false) }
  }

  function handleOrderSent(exposureId, orderSummary) {
    setSentOrders(prev => ({ ...prev, [exposureId]: orderSummary }))
    setActiveModal(null)
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`${API_BASE}/api/reports/currency-plan?company_id=${companyId}`, { headers: authHeaders() })
      if (!response.ok) throw new Error('Failed')
      const blob = await response.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `currency-plan-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch { alert('Failed to generate report.') }
    finally { setDownloading(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: GOLD }} />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 rounded-xl p-6 border border-red-200">
      <p className="text-red-700 text-sm">Error: {error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="rounded-xl shadow-md p-6" style={{ background: NAVY }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Hedge Recommendations</h2>
            <p className="text-sm mt-1" style={{ color: '#8DA4C4' }}>Based on your {policy} policy</p>
          </div>
          <button onClick={handleDownloadPDF} disabled={downloading}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
            style={{ background: GOLD, color: NAVY }}>
            {downloading ? 'Generating...' : 'Download Currency Plan'}
          </button>
        </div>
      </div>

      {recommendations.length === 0 && (
        <div className="bg-green-50 rounded-xl p-6 border border-green-200">
          <p className="text-green-700 font-semibold text-sm">
            All exposures are within policy targets. No action required.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {recommendations.map((rec) => {
          const sentOrder = sentOrders[rec.exposure_id]
          return (
            <div key={rec.exposure_id}
              className="bg-white rounded-xl shadow-sm p-6 border-l-4 hover:shadow-md transition-shadow"
              style={{ borderLeftColor: rec.urgency === 'HIGH' ? '#EF4444' : rec.urgency === 'MEDIUM' ? '#F59E0B' : '#10B981' }}>

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-bold" style={{ color: NAVY }}>{rec.action}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    rec.urgency === 'HIGH'   ? 'bg-red-100 text-red-800' :
                    rec.urgency === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {rec.urgency} PRIORITY
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'Currency Pair', value: rec.currency_pair, highlight: false },
                  { label: 'Target Hedge', value: typeof rec.target_ratio === 'string' && rec.target_ratio.includes('%') ? rec.target_ratio : `${rec.target_ratio}%`, highlight: true },
                  { label: 'Instrument',    value: rec.instrument,    highlight: false },
                ].map(({ label, value, highlight }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="font-semibold text-sm" style={{ color: highlight ? GOLD : NAVY }}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-600">{rec.reason}</p>
              </div>

              {!sentOrder && (
                <div className="flex justify-end">
                  <button onClick={() => setActiveModal(rec)}
                    className="px-5 py-2 text-white rounded-lg text-sm font-semibold"
                    style={{ background: NAVY }}>
                    Execute with Bank
                  </button>
                </div>
              )}

              {sentOrder && (
                <OrderStatusBanner
                  order={sentOrder}
                  exposureId={rec.exposure_id}
                  companyId={companyId}
                  onSendAgain={() => setActiveModal(rec)}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-lg p-4 text-sm text-gray-500"
        style={{ background: 'rgba(26,39,68,0.04)', border: '1px solid rgba(26,39,68,0.1)' }}>
        Recommendations are based on your active {policy} policy. Confirm execution with your bank or FX provider.
      </div>

      {activeModal && (
        <ExecutionModal
          rec={activeModal}
          bankEmail={bankSettings.email}
          bankName={bankSettings.name}
          baseCurrency={baseCurrency}
          companyId={companyId}
          onClose={() => setActiveModal(null)}
          onSent={handleOrderSent}
        />
      )}
    </div>
  )
}

export default HedgingRecommendations