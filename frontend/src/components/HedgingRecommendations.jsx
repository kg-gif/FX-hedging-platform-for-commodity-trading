import React, { useState, useEffect } from 'react'


const API_BASE = 'https://birk-fx-api.onrender.com'
const NAVY = '#1A2744'
const GOLD = '#C9A86C'

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

// ── Helpers ──────────────────────────────────────────────────────
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
  const vd = new Date(valueDateStr)
  return vd > t2
}

function getDirection(rec, baseCurrency) {
  // Payable = sell base, buy foreign
  // Receivable = buy base, sell foreign
  const [from] = rec.currency_pair.split('/')
  if (rec.exposure_type === 'receivable') {
    return { buy: from, sell: rec.currency_pair.split('/')[1] }
  }
  // payable (default)
  return { sell: from, buy: rec.currency_pair.split('/')[1] }
}

// ── Execution Modal ───────────────────────────────────────────────
function ExecutionModal({ rec, bankEmail, bankName, baseCurrency, companyId, onClose }) {
  const user = JSON.parse(localStorage.getItem('auth_user') || '{}')

  const defaultValueDate = rec.end_date
    ? rec.end_date.split('T')[0]
    : addBusinessDays(new Date().toISOString().split('T')[0], 2)

  const [orderType, setOrderType]         = useState('immediate')
  const [valueDate, setValueDate]         = useState(defaultValueDate)
  const [originalValueDate]               = useState(defaultValueDate)
  const [valueDateReason, setValueDateReason] = useState('')
  const [showReasonBox, setShowReasonBox] = useState(false)
  const [limitRate, setLimitRate]         = useState(rec.limit_rate || '')
  const [stopRate, setStopRate]           = useState(rec.stop_rate || '')
  const [goodTill, setGoodTill]           = useState(addBusinessDays(defaultValueDate, -3))
  const [saving, setSaving]               = useState(false)
  const [sent, setSent]                   = useState(false)

  const direction = getDirection(rec, baseCurrency)
  const [fromCcy] = rec.currency_pair.split('/')
  const amountStr = rec.action.replace(/[^0-9,]/g, '').replace(',', '')
  const displayAmount = parseInt(amountStr).toLocaleString()

  const valueDateChanged = valueDate !== originalValueDate
  const instrumentType = isForward(valueDate) ? 'Forward' : 'Spot'

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
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          company_id: companyId,
          exposure_id: rec.exposure_id,
          currency_pair: rec.currency_pair,
          original_date: originalValueDate,
          new_date: valueDate,
          reason: valueDateReason,
          changed_by: user.email || 'unknown'
        })
      })
    } catch (e) {
      console.error('Audit log failed:', e)
    }
  }

  async function handleExecute() {
    if (valueDateChanged && !valueDateReason.trim()) {
      alert('Please provide a reason for changing the value date.')
      return
    }
    setSaving(true)
    if (valueDateChanged) await logValueDateChange()

    // Build email body
    const subjectImmediate = `FX ${instrumentType} Request — ${rec.action} ${rec.currency_pair}`
    const subjectLimit     = `FX Limit Order — ${rec.action} ${rec.currency_pair}`

    const bodyImmediate = [
      `Dear ${bankName || 'FX Desk'},`,
      '',
      `Please execute the following FX transaction:`,
      '',
      `Direction:     Sell ${direction.sell} / Buy ${direction.buy}`,
      `Amount:        ${fromCcy} ${displayAmount}`,
      `Currency Pair: ${rec.currency_pair}`,
      `Instrument:    ${instrumentType}`,
      `Value Date:    ${toDisplayDate(valueDate)}`,
      `Rate:          At best / market rate`,
      valueDateChanged ? `Note: Value date changed from ${toDisplayDate(originalValueDate)}. Reason: ${valueDateReason}` : '',
      '',
      `Please confirm execution by return.`,
      '',
      `Kind regards`
    ].filter(l => l !== undefined).join('\n')

    const bodyLimit = [
      `Dear ${bankName || 'FX Desk'},`,
      '',
      `Please place the following limit order:`,
      '',
      `Direction:     Sell ${direction.sell} / Buy ${direction.buy}`,
      `Amount:        ${fromCcy} ${displayAmount}`,
      `Currency Pair: ${rec.currency_pair}`,
      `Limit Rate:    ${limitRate} (take profit)`,
      `Stop Rate:     ${stopRate} (stop loss)`,
      `Value Date:    ${toDisplayDate(valueDate)}`,
      `Good Till:     ${toDisplayDate(goodTill)}`,
      `Instructions:  Please cancel automatically if not filled by Good Till date.`,
      valueDateChanged ? `Note: Value date changed from ${toDisplayDate(originalValueDate)}. Reason: ${valueDateReason}` : '',
      '',
      `Please confirm order placement by return.`,
      '',
      `Kind regards`
    ].filter(l => l !== undefined).join('\n')

    const subject = orderType === 'immediate' ? subjectImmediate : subjectLimit
    const body    = orderType === 'immediate' ? bodyImmediate : bodyLimit
    const mailto  = `mailto:${bankEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    window.open(mailto, '_blank')
    setSaving(false)
    setSent(true)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5" style={{ background: NAVY }}>
          <h2 className="text-lg font-bold text-white">{rec.action}</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
            {rec.currency_pair} · Sell {direction.sell} / Buy {direction.buy}
          </p>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📧</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Email draft opened</h3>
            <p className="text-sm text-gray-500 mb-6">
              Your email client should have opened with the order details pre-filled.
              Send it to your bank to execute.
            </p>
            <button onClick={onClose}
              className="w-full py-3 rounded-lg font-semibold text-sm"
              style={{ background: NAVY, color: 'white' }}>
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5">

            {/* Order type toggle */}
            <div className="flex gap-2 p-1 rounded-lg" style={{ background: '#F4F6FA' }}>
              {[
                { id: 'immediate', label: 'Immediate Execution' },
                { id: 'limit',     label: 'Limit Order' }
              ].map(t => (
                <button key={t.id} onClick={() => setOrderType(t.id)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: orderType === t.id ? NAVY : 'transparent',
                    color: orderType === t.id ? GOLD : '#6B7280'
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Order summary */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: '#F4F6FA' }}>
              <Row label="Direction"     value={`Sell ${direction.sell} / Buy ${direction.buy}`} bold />
              <Row label="Amount"        value={`${fromCcy} ${displayAmount}`} />
              <Row label="Instrument"    value={instrumentType}
                   note={instrumentType === 'Forward' ? 'Value date > T+2' : 'T+2 settlement'} />
            </div>

            {/* Limit order fields */}
            {orderType === 'limit' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: NAVY }}>Limit Rate (Take Profit)</label>
                  <input type="number" step="0.0001" value={limitRate}
                    onChange={e => setLimitRate(e.target.value)}
                    placeholder={rec.limit_rate || '1.2600'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: NAVY }}>Stop Rate (Stop Loss)</label>
                  <input type="number" step="0.0001" value={stopRate}
                    onChange={e => setStopRate(e.target.value)}
                    placeholder={rec.stop_rate || '1.2200'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            )}

            {/* Value date */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: NAVY }}>
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

            {/* Reason for value date change — compliance requirement */}
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
                <p className="text-xs text-amber-600 mt-1">
                  This change will be logged for audit purposes.
                </p>
              </div>
            )}

            {/* Good till (limit orders only) */}
            {orderType === 'limit' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: NAVY }}>Good Till Date</label>
                <input type="date" value={goodTill}
                  onChange={e => setGoodTill(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">
                  Defaults to 3 business days before value date. Bank will cancel if not filled.
                </p>
              </div>
            )}

            {/* Bank */}
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(26,39,68,0.04)', border: '1px solid rgba(26,39,68,0.1)' }}>
              {bankEmail
                ? <span style={{ color: NAVY }}>Will open email to <strong>{bankEmail}</strong></span>
                : <span className="text-amber-600">No bank email set — add one in Settings first</span>
              }
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500">
                Cancel
              </button>
              <button onClick={handleExecute} disabled={saving || !bankEmail}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: NAVY, color: 'white' }}>
                {saving ? 'Opening...' : 'Open Email Draft →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
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

// ── Main Component ────────────────────────────────────────────────
function HedgingRecommendations() {
  const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
  const companyId = authUser.company_id || 1

  const [recommendations, setRecommendations] = useState([])
  const [policy, setPolicy]                   = useState('')
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState(null)
  const [downloading, setDownloading]         = useState(false)
  const [activeModal, setActiveModal]         = useState(null)
  const [bankSettings, setBankSettings]       = useState({ email: '', name: '' })
  const [baseCurrency, setBaseCurrency]       = useState('USD')

  useEffect(() => {
    loadAll()
  }, [companyId])

  async function loadAll() {
    setLoading(true)
    try {
      const [recRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/recommendations?company_id=${companyId}`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/settings/${companyId}`, { headers: authHeaders() }).then(r => r.json())
      ])
      if (recRes.error) setError(recRes.error)
      else { setRecommendations(recRes.recommendations); setPolicy(recRes.policy) }

      setBankSettings({
        email: settingsRes.bank?.bank_email || '',
        name:  settingsRes.bank?.bank_name  || ''
      })
      setBaseCurrency(settingsRes.company?.base_currency || 'USD')
    } catch {
      setError('Failed to load recommendations')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`${API_BASE}/api/reports/currency-plan?company_id=${companyId}`, { headers: authHeaders() })
      if (!response.ok) throw new Error('Failed to generate report')
      const blob = await response.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `currency-plan-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Failed to generate report. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: GOLD }}></div>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 rounded-xl p-6 border border-red-200">
      <p className="text-red-700 text-sm">Error: {error}</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl shadow-md p-6" style={{ background: NAVY }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Hedge Recommendations</h2>
            <p className="text-sm mt-1" style={{ color: '#8DA4C4' }}>
              Based on your {policy} policy
            </p>
          </div>
          <button onClick={handleDownloadPDF} disabled={downloading}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
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
        {recommendations.map((rec) => (
          <div key={rec.exposure_id}
            className="bg-white rounded-xl shadow-sm p-6 border-l-4 hover:shadow-md transition-shadow"
            style={{ borderLeftColor: rec.urgency === 'HIGH' ? '#EF4444' : rec.urgency === 'MEDIUM' ? '#F59E0B' : '#10B981' }}>

            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-bold" style={{ color: NAVY }}>{rec.action}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                rec.urgency === 'HIGH'   ? 'bg-red-100 text-red-800' :
                rec.urgency === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }`}>
                {rec.urgency} PRIORITY
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Currency Pair', value: rec.currency_pair, highlight: false },
                { label: 'Target Hedge',  value: rec.target_ratio,  highlight: true  },
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

            <div className="flex justify-end">
              <button onClick={() => setActiveModal(rec)}
                className="px-5 py-2 text-white rounded-lg text-sm font-semibold"
                style={{ background: NAVY }}>
                Execute with Bank
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg p-4 text-sm text-gray-500"
        style={{ background: 'rgba(26,39,68,0.04)', border: '1px solid rgba(26,39,68,0.1)' }}>
        Recommendations are based on your active {policy} policy. Confirm execution with your bank or FX provider.
      </div>

      {/* Execution modal */}
      {activeModal && (
        <ExecutionModal
          rec={activeModal}
          bankEmail={bankSettings.email}
          bankName={bankSettings.name}
          baseCurrency={baseCurrency}
          companyId={companyId}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  )
}

export default HedgingRecommendations