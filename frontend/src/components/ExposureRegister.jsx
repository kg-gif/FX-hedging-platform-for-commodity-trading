// ExposureRegister.jsx
// Drop-in replacement for the register table inside Dashboard.jsx
// Shows: Total | Hedged | Open | Locked P&L | Floating P&L | Combined P&L | Corridor | Status

import React, { useState, useEffect, useRef } from 'react'
import { Edit2, Trash2, ChevronDown, ChevronUp, RefreshCw, Archive, ArchiveRestore } from 'lucide-react'
import { CurrencyPairFlags } from './CurrencyFlag'
import LoadingAnimation from './LoadingAnimation'
import { useCompany } from '../contexts/CompanyContext'
import { COLUMN_TOOLTIPS, GLOSSARY } from '../utils/constants'
import { slugify } from './Glossary'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
const NAVY    = '#1A2744'
const GOLD    = '#C9A86C'
const SUCCESS = '#10B981'
const DANGER  = '#EF4444'
const WARNING = '#F59E0B'

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

const fmtAmount = (n, ccy = '') =>
  `${ccy} ${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`.trim()

const fmtPnl = (n) => {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const pnlColor = (n) => n == null ? '#9CA3AF' : n >= 0 ? SUCCESS : DANGER

// Column header with optional ⓘ tooltip linked to the glossary.
// termName comes from COLUMN_TOOLTIPS — looks up the matching glossary entry.
function ColHeader({ label }) {
  const [visible, setVisible] = useState(false)
  const termName = COLUMN_TOOLTIPS[label.toUpperCase()]
  const entry    = termName
    ? Object.values(GLOSSARY).flat().find(t => t.term === termName)
    : null

  if (!entry) return <span>{label}</span>

  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <span className="relative"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        <span style={{ color: GOLD, cursor: 'pointer', fontSize: 11 }}>ⓘ</span>
        {visible && (
          <span style={{
            position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
            background: '#1A2744', color: '#fff', borderRadius: 6, padding: '8px 12px',
            fontSize: 11, lineHeight: 1.5, minWidth: 220, maxWidth: 300,
            whiteSpace: 'normal', zIndex: 100, pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            <strong style={{ color: '#C9A86C', fontSize: 11 }}>{entry.term}</strong>
            <br />
            {entry.plain}
            <br />
            <a
              href={`/glossary#${slugify(entry.term)}`}
              style={{ color: '#8DA4C4', fontSize: 10, pointerEvents: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              Learn more →
            </a>
          </span>
        )}
      </span>
    </span>
  )
}


// Tooltip shown next to P&L values on cross-currency pairs (e.g. CHF/USD, GBP/NOK)
// where neither leg is the company base currency.
function CrossPairTooltip({ baseCurrency = 'EUR' }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-block ml-1 align-middle">
      <span
        style={{ color: GOLD, cursor: 'pointer', fontSize: 13 }}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        aria-label="Cross-pair P&L explanation"
      >ⓘ</span>
      {visible && (
        <span style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: '#1A2744', color: '#fff', borderRadius: 6, padding: '8px 12px',
          fontSize: 12, lineHeight: 1.5, minWidth: 280, maxWidth: 340,
          whiteSpace: 'normal', zIndex: 50, pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
        }}>
          P&L shown in {baseCurrency} (base currency).<br />
          For cross pairs, the settlement currency<br />
          is converted at today's spot rate.
        </span>
      )}
    </span>
  )
}

function ZoneBadge({ zone }) {
  if (!zone || zone === 'base') return null
  const styles = {
    defensive:    { bg: '#FEE2E2', text: '#991B1B', label: 'DEFENSIVE' },
    opportunistic:{ bg: '#D1FAE5', text: '#065F46', label: 'OPPORTUNISTIC' },
  }
  const s = styles[zone]
  if (!s) return null
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold mt-1 inline-block"
      style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  )
}

function StatusBadge({ status, archived }) {
  if (archived) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
        ARCHIVED
      </span>
    )
  }
  const map = {
    BREACH:      'bg-red-100 text-red-700',
    OPEN:        'bg-gray-100 text-gray-600',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    WELL_HEDGED: 'bg-green-100 text-green-700',
    NO_BUDGET:   'bg-gray-100 text-gray-400',
  }
  const labels = {
    BREACH: 'BREACH', OPEN: 'OPEN', IN_PROGRESS: 'IN PROGRESS',
    WELL_HEDGED: 'HEDGED', NO_BUDGET: 'NO BUDGET'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || map.OPEN}`}>
      {labels[status] || status}
    </span>
  )
}

function HedgeBar({ pct }) {
  const color = pct >= 70 ? SUCCESS : pct >= 40 ? WARNING : DANGER
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-0.5">
        <span style={{ color: NAVY }} className="font-semibold">{pct.toFixed(0)}%</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ background: '#E5E7EB', height: 5 }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

// Format a MTM value in EUR — green (#10B981) if positive, red if negative, grey dash if null
function MtmCell({ value }) {
  if (value == null) return <td className="px-3 py-2 text-gray-300">—</td>
  const n     = Number(value)   // coerce: guards against string values from API
  if (isNaN(n)) return <td className="px-3 py-2 text-gray-300">—</td>
  const color = n >= 0 ? '#10B981' : DANGER   // explicit hex — never GOLD/orange
  const sign  = n >= 0 ? '+' : ''
  return (
    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap" style={{ color }}
      title="Mark-to-market value of this forward at today's spot rate (EUR)">
      {sign}€{Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}
    </td>
  )
}

function TrancheRow({ tranche, ccy, mtm, onConfirm }) {
  const statusColor = tranche.status === 'confirmed' ? SUCCESS : tranche.status === 'executed' ? GOLD : '#9CA3AF'

  // MTM only shown for forward instruments that are executed/confirmed
  const isForward = (tranche.instrument || '').toLowerCase() === 'forward'
  const hasMtm    = isForward && (tranche.status === 'executed' || tranche.status === 'confirmed')

  return (
    <tr className="text-xs border-t border-gray-100">
      <td className="px-3 py-2 text-gray-400">{tranche.instrument || 'Forward'}</td>
      <td className="px-3 py-2 font-mono text-gray-600">{fmtAmount(tranche.amount, ccy)}</td>
      <td className="px-3 py-2 font-mono text-gray-600">{tranche.rate ? parseFloat(tranche.rate).toFixed(4) : '—'}</td>
      <td className="px-3 py-2 text-gray-500">{tranche.value_date || '—'}</td>
      <td className="px-3 py-2">
        {tranche.status === 'executed' ? (
          // Executed tranches show a Confirm button — bank_reference required to proceed
          <button
            onClick={() => onConfirm(tranche)}
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ background: '#FEF9C3', color: '#92400E', border: '1px solid #FDE68A' }}
            title="Add bank reference number to confirm this tranche"
          >
            EXECUTED · Confirm →
          </button>
        ) : (
          <span className="font-semibold" style={{ color: statusColor }}>
            {tranche.status?.toUpperCase()}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-gray-400">{tranche.executed_by || '—'}</td>
      <td className="px-3 py-2 text-gray-400">
        {tranche.executed_at ? new Date(tranche.executed_at).toLocaleDateString('en-GB') : '—'}
      </td>
      {/* Bank reference — shown for confirmed tranches */}
      <td className="px-3 py-2 font-mono text-gray-500">
        {tranche.status === 'confirmed'
          ? (tranche.bank_reference || <span className="text-gray-300">—</span>)
          : <span className="text-gray-200">—</span>
        }
      </td>
      {/* MTM columns — only meaningful for executed/confirmed Forwards */}
      {hasMtm
        ? <MtmCell value={mtm?.mtm_vs_inception_eur ?? null} />
        : <td className="px-3 py-2 text-gray-300">—</td>
      }
      {hasMtm
        ? <MtmCell value={mtm?.mtm_vs_budget_eur ?? null} />
        : <td className="px-3 py-2 text-gray-300">—</td>
      }
    </tr>
  )
}


// Modal to record bank reference number and move tranche status to 'confirmed'
function ConfirmTrancheModal({ tranche, ccy, onClose, onConfirmed }) {
  const [bankRef, setBankRef]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit() {
    if (!bankRef.trim()) { setError('Bank reference number is required.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/tranches/${tranche.id}/confirm`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ bank_reference: bankRef.trim() })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Confirmation failed.'); return }
      onConfirmed()
      onClose()
    } catch (e) {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const trnLabel = `TRN-${String(tranche.id).padStart(5, '0')}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5" style={{ background: NAVY }}>
          <h2 className="text-base font-bold text-white">Confirm Trade — {trnLabel}</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
            {ccy} {fmtAmount(tranche.amount)} · Rate {parseFloat(tranche.rate || 0).toFixed(4)} · {tranche.value_date || '—'}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Enter the bank's trade reference number from the confirmation note.
            This is required to move the tranche to <strong>CONFIRMED</strong> status
            and creates an audit log entry.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Bank Reference Number <span style={{ color: DANGER }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. FX-2024-009341"
              value={bankRef}
              onChange={e => { setBankRef(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono
                         focus:outline-none focus:border-blue-400"
              style={{ background: '#F9FAFB' }}
            />
            {error && <p className="text-xs mt-1" style={{ color: DANGER }}>{error}</p>}
          </div>
          <div className="rounded-lg p-3 text-xs text-gray-500" style={{ background: '#F4F6FA' }}>
            <strong>Audit trail:</strong> Confirmation will be logged with your email, the bank
            reference, and a timestamp. This record cannot be edited.
          </div>
        </div>
        <div className="px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !bankRef.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: saving ? '#9CA3AF' : NAVY, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Confirming…' : 'Confirm Trade'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CorridorResetModal({ exposure, onClose, onReset }) {
  const [reason, setReason]           = useState('')
  const [tpPct, setTpPct]   = useState('2')
  const [slPct, setSlPct]   = useState('3')
  const [saving, setSaving] = useState(false)

  const spot       = exposure.current_spot
  const tp         = parseFloat(tpPct) / 100
  const sl         = parseFloat(slPct) / 100
  const takeProfit = spot ? (spot * (1 + tp)).toFixed(4) : '—'
  const stopLoss   = spot ? (spot * (1 - sl)).toFixed(4) : '—'

  async function handleReset() {
    if (!reason.trim()) { alert('Please provide a reason for the corridor reset.'); return }
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/exposures/${exposure.id}/reset-corridor`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          current_spot:    spot,
          take_profit_pct: tp,
          stop_loss_pct:   sl,
          reason
        })
      })
      const data = await res.json()
      onReset(data)
      onClose()
    } catch (e) { alert('Failed to reset corridor') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5" style={{ background: NAVY }}>
          <h2 className="text-base font-bold text-white">Reset Hedge Corridor</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
            {exposure.currency_pair} · Open: {fmtAmount(exposure.open_amount, exposure.from_currency)}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: '#F4F6FA' }}>
            <div className="flex justify-between">
              <span className="text-gray-500">Today's Spot</span>
              <span className="font-semibold" style={{ color: NAVY }}>{spot?.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Original Budget Rate</span>
              <span className="font-mono text-gray-600">{exposure.budget_rate?.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Open Amount</span>
              <span className="font-mono text-gray-600">{fmtAmount(exposure.open_amount, exposure.from_currency)}</span>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Take Profit (%)</label>
                <input type="number" value={tpPct} min="0.5" max="20" step="0.5"
                  onChange={e => setTpPct(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stop Loss (%)</label>
                <input type="number" value={slPct} min="0.5" max="20" step="0.5"
                  onChange={e => setSlPct(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3 text-center" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
              <p className="text-xs text-gray-500 mb-1">Take Profit</p>
              <p className="font-bold text-green-700">{takeProfit}</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="text-xs text-gray-500 mb-1">Stop Loss</p>
              <p className="font-bold text-red-700">{stopLoss}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: '#92660A' }}>Reason for reset *</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Market moved favourably, resetting corridor on remaining open position"
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-amber-50" />
            <p className="text-xs text-amber-600 mt-1">Logged to audit trail with timestamp.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500">
              Cancel
            </button>
            <button onClick={handleReset} disabled={saving || !reason.trim()}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: NAVY, color: 'white' }}>
              {saving ? 'Saving...' : 'Reset Corridor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ArchiveModal({ exposure, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/exposures/${exposure.id}/archive`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ reason })
      })
      if (!res.ok) throw new Error('Archive failed')
      onConfirm()
      onClose()
    } catch (e) { alert('Failed to archive exposure') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5" style={{ background: NAVY }}>
          <h2 className="text-base font-bold text-white">Archive Exposure</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
            {exposure.currency_pair} · {fmtAmount(exposure.total_amount, exposure.from_currency)}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Archive this exposure? It will be hidden from your active register but fully preserved for audit and reporting.
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Fully settled, matured, no longer active"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 bg-gray-600 text-white">
              {saving ? 'Archiving...' : 'Archive Exposure'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ExposureRegister({ companyId, onEdit, onDelete, onHedgeNow }) {
  const { getSelectedCompany } = useCompany()
  const baseCurrency = getSelectedCompany()?.base_currency || 'EUR'

  const [exposures, setExposures]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [expanded, setExpanded]           = useState({})
  const [mtmData, setMtmData]             = useState({})   // { [exposureId]: { [trancheId]: mtmRow } }
  const [corridorModal, setCorridorModal] = useState(null)
  const [confirmModal, setConfirmModal]   = useState(null)  // { tranche, ccy }
  const [archiveModal, setArchiveModal]   = useState(null)
  const [searchText, setSearchText]       = useState('')
  const [filterCcy, setFilterCcy]         = useState('')
  const [page, setPage]                   = useState(1)
  const [viewMode, setViewMode]           = useState('active') // 'active' | 'archived' | 'all'
  const [highlightId, setHighlightId]     = useState(null)
  const highlightRef                      = useRef(null)
  const PAGE_SIZE = 10

  useEffect(() => { if (companyId) load() }, [companyId, viewMode])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const includeArchived = viewMode !== 'active'
      const res = await fetch(
        `${API_BASE}/api/exposures/enriched?company_id=${companyId}&include_archived=${includeArchived}`,
        { headers: authHeaders() }
      )
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setExposures(Array.isArray(data) ? data : (data.items || []))
      setPage(1)
    } catch (e) {
      setError('Failed to load exposure register')
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id) {
    const nowExpanding = !expanded[id]
    setExpanded(prev => ({ ...prev, [id]: nowExpanding }))

    // Fetch MTM data the first time an exposure row is expanded (lazy load)
    if (nowExpanding && !mtmData[id]) {
      fetch(`${API_BASE}/api/tranches/mtm/${id}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data || !data.tranches) return
          // Index by tranche_id for fast lookup in TrancheRow
          const byId = {}
          data.tranches.forEach(t => { byId[t.tranche_id] = t })
          setMtmData(prev => ({ ...prev, [id]: byId }))
        })
        .catch(() => {/* MTM fetch failed — cells will show — */})
    }
  }

  async function handleUnarchive(exp) {
    try {
      const res = await fetch(`${API_BASE}/api/exposures/${exp.id}/unarchive`, {
        method: 'POST', headers: authHeaders()
      })
      if (!res.ok) throw new Error('Unarchive failed')
      load()
    } catch (e) { alert('Failed to unarchive exposure') }
  }

  // Auto-archive suggestion: past maturity OR 100% hedged with all tranches confirmed
  const today = new Date().toISOString().split('T')[0]
  const archiveSuggestions = (viewMode === 'active' ? exposures : []).filter(e => {
    const pastMaturity = e.end_date && e.end_date < today
    const fullyConfirmed = e.hedge_pct >= 100 &&
      e.tranches?.length > 0 &&
      e.tranches.every(t => t.status === 'confirmed')
    return pastMaturity || fullyConfirmed
  })

  function scrollToSuggestion() {
    const first = archiveSuggestions[0]
    if (!first) return
    // Find the page that contains this exposure in the filtered list
    const idx = filtered.findIndex(e => e.id === first.id)
    if (idx >= 0) {
      setPage(Math.floor(idx / PAGE_SIZE) + 1)
      setHighlightId(first.id)
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }

  // Filter based on viewMode
  const modeFiltered = viewMode === 'active'
    ? exposures.filter(e => !e.archived)
    : viewMode === 'archived'
    ? exposures.filter(e => e.archived)
    : exposures

  const filtered = modeFiltered.filter(e => {
    if (filterCcy && e.currency_pair !== filterCcy) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!e.description?.toLowerCase().includes(s) && !e.reference?.toLowerCase().includes(s)) return false
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Portfolio totals (active only — archived excluded regardless of view)
  const activeExposures  = exposures.filter(e => !e.archived)
  const totalLockedPnl   = activeExposures.reduce((s, e) => s + (e.locked_pnl || 0), 0)
  const totalFloatingPnl = activeExposures.reduce((s, e) => s + (e.floating_pnl || 0), 0)
  const totalCombinedPnl = activeExposures.reduce((s, e) => s + (e.combined_pnl || 0), 0)

  const isReadOnly = viewMode === 'archived'

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <LoadingAnimation text="Loading exposures…" size="medium" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
  )

  return (
    <div className="space-y-4">

      {/* Portfolio P&L Summary — always shows active totals */}
      <div className="rounded-xl p-5 grid grid-cols-3 gap-4" style={{ background: NAVY }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#8DA4C4' }}>
            Locked P&L
          </p>
          <p className="text-xl font-bold" style={{ color: pnlColor(totalLockedPnl) }}>
            {fmtPnl(totalLockedPnl)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>Crystallised from executed hedges</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#8DA4C4' }}>
            Floating P&L
          </p>
          <p className="text-xl font-bold" style={{ color: pnlColor(totalFloatingPnl) }}>
            {fmtPnl(totalFloatingPnl)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>Open portion vs today's spot</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#8DA4C4' }}>
            Combined P&L
          </p>
          <p className="text-xl font-bold" style={{ color: pnlColor(totalCombinedPnl) }}>
            {fmtPnl(totalCombinedPnl)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>Total portfolio position</p>
        </div>
      </div>

      {/* Auto-archive suggestion banner */}
      {archiveSuggestions.length > 0 && viewMode === 'active' && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border"
          style={{ background: '#FFFBEB', borderColor: '#FCD34D' }}>
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{archiveSuggestions.length} exposure{archiveSuggestions.length > 1 ? 's' : ''}</span>
            {' '}are fully hedged or past maturity. Consider archiving to keep your register clean.
          </p>
          <button onClick={scrollToSuggestion}
            className="ml-4 text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
            style={{ background: WARNING, color: 'white' }}>
            Review &amp; Archive
          </button>
        </div>
      )}

      {/* View toggle + Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 space-y-3">
        {/* View toggle */}
        <div className="flex items-center gap-1">
          {['active', 'archived', 'all'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors"
              style={viewMode === mode
                ? { background: NAVY, color: 'white' }
                : { background: '#F4F6FA', color: '#6B7280' }}>
              {mode === 'active' ? 'Active' : mode === 'archived' ? 'Archived' : 'All'}
            </button>
          ))}
        </div>

        {/* Search + currency filter + pagination */}
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Search description or reference..."
            className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          <select value={filterCcy} onChange={e => setFilterCcy(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Currencies</option>
            {[...new Set(exposures.map(e => e.currency_pair))].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: NAVY, color: 'white' }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <span className="text-sm text-gray-400">
            {filtered.length} exposures · Page {page} of {totalPages || 1}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 rounded border border-gray-200 text-sm disabled:opacity-40">
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className="px-3 py-1.5 rounded border text-sm font-semibold"
                style={{
                  background: p === page ? NAVY : 'white',
                  color: p === page ? 'white' : '#6B7280',
                  borderColor: p === page ? NAVY : '#E5E7EB'
                }}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}
              className="px-3 py-1.5 rounded border border-gray-200 text-sm disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Register */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4" style={{ background: NAVY }}>
          <h3 className="font-semibold text-white text-sm">
            Exposure Register
            {viewMode === 'archived' && <span className="ml-2 text-xs font-normal opacity-60">(Archived)</span>}
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead style={{ background: '#F4F6FA' }}>
              <tr>
                {['Pair', 'Description', 'Total', 'Hedged', 'Open', 'Hedge %',
                  'Locked P&L', 'Floating P&L', 'Combined P&L',
                  'Corridor', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <ColHeader label={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(exp => {
                const isHighlighted = exp.id === highlightId
                const isArchived    = exp.archived
                return (
                  <React.Fragment key={exp.id}>
                    <tr
                      ref={isHighlighted ? highlightRef : null}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      style={isHighlighted ? { background: '#FFFBEB', outline: '2px solid #FCD34D' } : isArchived ? { opacity: 0.6 } : {}}
                      onClick={() => toggleExpand(exp.id)}>

                      {/* Pair */}
                      <td className="px-3 py-3 font-semibold whitespace-nowrap" style={{ color: NAVY }}>
                        <div className="flex items-center gap-1.5">
                          {expanded[exp.id]
                            ? <ChevronUp size={13} className="text-gray-400" />
                            : <ChevronDown size={13} className="text-gray-400" />}
                          <CurrencyPairFlags pair={exp.currency_pair} size="sm" />
                          {exp.currency_pair}
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-3 py-3 text-gray-500 max-w-xs truncate">
                        <div>{exp.description || '—'}</div>
                        {isArchived && exp.archived_at && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            Archived {new Date(exp.archived_at).toLocaleDateString('en-GB')}
                            {exp.archive_reason && ` · ${exp.archive_reason}`}
                          </div>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-3 py-3 font-mono text-right text-gray-700 whitespace-nowrap">
                        {fmtAmount(exp.total_amount, exp.from_currency)}
                        {exp.amount_currency && exp.amount_currency !== exp.from_currency && (
                          <div className="text-xs text-gray-400 font-normal">
                            {exp.amount_currency} {(exp.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} entered
                          </div>
                        )}
                      </td>

                      {/* Hedged */}
                      <td className="px-3 py-3 font-mono text-right whitespace-nowrap"
                        style={{ color: exp.hedged_amount > 0 ? SUCCESS : '#9CA3AF' }}>
                        {exp.hedged_amount > 0 ? fmtAmount(exp.hedged_amount, exp.from_currency) : '—'}
                        {exp.tranche_count > 0 && (
                          <span className="ml-1 text-xs text-gray-400">({exp.tranche_count})</span>
                        )}
                      </td>

                      {/* Open */}
                      <td className="px-3 py-3 font-mono text-right whitespace-nowrap"
                        style={{ color: exp.open_amount > 0 ? WARNING : '#9CA3AF' }}>
                        {fmtAmount(exp.open_amount, exp.from_currency)}
                      </td>

                      {/* Hedge % bar */}
                      <td className="px-3 py-3" style={{ minWidth: 100 }}>
                        <HedgeBar pct={exp.hedge_pct} />
                      </td>

                      {/* Locked P&L — shown in base currency (EUR) */}
                      <td className="px-3 py-3 font-semibold text-right whitespace-nowrap"
                        style={{ color: pnlColor(exp.locked_pnl) }}>
                        {fmtPnl(exp.locked_pnl)}
                        {exp.is_cross_pair && exp.locked_pnl !== 0 && <CrossPairTooltip baseCurrency={baseCurrency} />}
                      </td>

                      {/* Floating P&L — shown in base currency (EUR) */}
                      <td className="px-3 py-3 font-semibold text-right whitespace-nowrap"
                        style={{ color: pnlColor(exp.floating_pnl) }}>
                        {exp.open_amount > 0 ? (
                          <>
                            {fmtPnl(exp.floating_pnl)}
                            {exp.is_cross_pair && <CrossPairTooltip baseCurrency={baseCurrency} />}
                          </>
                        ) : '—'}
                      </td>

                      {/* Combined P&L — shown in base currency (EUR) */}
                      <td className="px-3 py-3 font-bold text-right whitespace-nowrap"
                        style={{ color: pnlColor(exp.combined_pnl) }}>
                        {fmtPnl(exp.combined_pnl)}
                        {exp.is_cross_pair && <CrossPairTooltip baseCurrency={baseCurrency} />}
                      </td>

                      {/* Corridor */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {exp.corridor ? (
                          <div className="text-xs space-y-0.5">
                            <div style={{ color: SUCCESS }}>▲ {exp.corridor.take_profit_rate?.toFixed(4)}</div>
                            <div style={{ color: DANGER }}>▼ {exp.corridor.stop_loss_rate?.toFixed(4)}</div>
                          </div>
                        ) : isArchived ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setCorridorModal(exp) }}
                            className="text-xs px-2 py-1 rounded border text-gray-500 border-gray-300 hover:border-gray-400">
                            Set
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge status={exp.status} archived={isArchived} />
                          {!isArchived && exp.budget_rate > 0 && <ZoneBadge zone={exp.current_zone} />}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {isArchived ? (
                            <button onClick={() => handleUnarchive(exp)}
                              className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                              <ArchiveRestore size={12} /> Unarchive
                            </button>
                          ) : (
                            <>
                              {onHedgeNow && exp.open_amount > 0 && (
                                <button onClick={() => onHedgeNow(exp)}
                                  className="text-xs px-2 py-1 rounded text-white font-semibold"
                                  style={{ background: exp.status === 'BREACH' ? DANGER : NAVY }}>
                                  Hedge Now
                                </button>
                              )}
                              {exp.corridor && (
                                <button onClick={() => setCorridorModal(exp)}
                                  title="Reset corridor"
                                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50">
                                  ↺
                                </button>
                              )}
                              {onEdit && (
                                <button onClick={() => onEdit(exp)} style={{ color: NAVY }}>
                                  <Edit2 size={14} />
                                </button>
                              )}
                              {onDelete && (
                                <button onClick={() => onDelete(exp)} className="text-red-400">
                                  <Trash2 size={14} />
                                </button>
                              )}
                              <button onClick={() => setArchiveModal(exp)}
                                title="Archive exposure"
                                className="text-gray-400 hover:text-gray-600">
                                <Archive size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded tranche detail */}
                    {expanded[exp.id] && (
                      <tr>
                        <td colSpan={14} className="px-6 py-0 bg-gray-50">
                          <div className="py-3">
                            {exp.tranches?.length > 0 ? (
                              <>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-2"
                                  style={{ color: NAVY }}>Hedge Tranches</p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-400">
                                      <th className="px-3 py-1.5 text-left">Instrument</th>
                                      <th className="px-3 py-1.5 text-left">Amount</th>
                                      <th className="px-3 py-1.5 text-left">Rate</th>
                                      <th className="px-3 py-1.5 text-left">Value Date</th>
                                      <th className="px-3 py-1.5 text-left">Status</th>
                                      <th className="px-3 py-1.5 text-left">By</th>
                                      <th className="px-3 py-1.5 text-left">Date</th>
                                      <th className="px-3 py-1.5 text-left"><ColHeader label="Bank Ref" /></th>
                                      <th className="px-3 py-1.5 text-left"><ColHeader label="MTM vs Inception" /></th>
                                      <th className="px-3 py-1.5 text-left"><ColHeader label="MTM vs Budget" /></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {exp.tranches.map(t => (
                                      <TrancheRow
                                        key={t.id}
                                        tranche={t}
                                        ccy={exp.from_currency}
                                        mtm={mtmData[exp.id]?.[t.id]}
                                        onConfirm={(tranche) => setConfirmModal({ tranche, ccy: exp.from_currency })}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            ) : (
                              <p className="text-xs text-gray-400 py-2">
                                No hedges recorded yet. Use "Execute with Bank" on the Hedging tab to place orders.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              {viewMode === 'archived' ? 'No archived exposures.' : 'No exposures found.'}
            </div>
          )}
        </div>
      </div>

      {confirmModal && (
        <ConfirmTrancheModal
          tranche={confirmModal.tranche}
          ccy={confirmModal.ccy}
          onClose={() => setConfirmModal(null)}
          onConfirmed={() => load()}
        />
      )}

      {corridorModal && (
        <CorridorResetModal
          exposure={corridorModal}
          onClose={() => setCorridorModal(null)}
          onReset={() => load()}
        />
      )}

      {archiveModal && (
        <ArchiveModal
          exposure={archiveModal}
          onClose={() => setArchiveModal(null)}
          onConfirm={() => load()}
        />
      )}
    </div>
  )
}
