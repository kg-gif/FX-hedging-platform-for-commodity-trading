// ExposureRegister.jsx
// Drop-in replacement for the register table inside Dashboard.jsx
// Shows: Total | Hedged | Open | Locked P&L | Floating P&L | Combined P&L | Corridor | Status

import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Edit2, Trash2, ChevronDown, ChevronUp, RefreshCw, Archive, ArchiveRestore } from 'lucide-react'
import { CurrencyPairFlags } from './CurrencyFlag'
import LoadingAnimation from './LoadingAnimation'
import { useCompany } from '../contexts/CompanyContext'
import { COLUMN_TOOLTIPS } from '../utils/constants'

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

// ── Portal tooltip infrastructure ──────────────────────────────────────────
// Renders tooltip into document.body via a React portal so it is never
// clipped by overflow:hidden on any ancestor (table container, etc.).
// Supports a small hide-delay so the user can mouse into the tooltip to
// click the "Learn more" link before it disappears.

function usePortalTooltip() {
  const [state, setState]  = useState({ visible: false, top: 0, left: 0 })
  const triggerRef         = useRef(null)
  const hideTimer          = useRef(null)

  function show() {
    clearTimeout(hideTimer.current)
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setState({ visible: true, top: r.bottom + 6, left: r.left + r.width / 2 })
  }

  function scheduleHide() {
    hideTimer.current = setTimeout(() => setState(s => ({ ...s, visible: false })), 150)
  }

  function cancelHide() { clearTimeout(hideTimer.current) }

  return { triggerRef, show, scheduleHide, cancelHide, ...state }
}

function TooltipPortal({ visible, top, left, onEnter, onLeave, children }) {
  if (!visible || typeof document === 'undefined') return null
  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed', top, left,
        transform: 'translateX(-50%)',
        background: NAVY, color: '#fff',
        borderRadius: 8, padding: '10px 14px',
        fontSize: 12, lineHeight: 1.6,
        maxWidth: 300, whiteSpace: 'normal',
        zIndex: 9999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
    </div>,
    document.body
  )
}

// Column header with ⓘ icon. Tooltip content comes from COLUMN_TOOLTIPS in constants.js.
// Uses a portal so the tooltip is never clipped by the table's overflow container.
function ColHeader({ label }) {
  const tt  = usePortalTooltip()
  const entry = COLUMN_TOOLTIPS[label.toUpperCase()]

  if (!entry) return <span>{label}</span>

  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <span
        ref={tt.triggerRef}
        style={{ color: GOLD, cursor: 'pointer', fontSize: 11, userSelect: 'none' }}
        onMouseEnter={tt.show}
        onMouseLeave={tt.scheduleHide}
        aria-label={`${label} — what does this mean?`}
      >ⓘ</span>
      <TooltipPortal
        visible={tt.visible} top={tt.top} left={tt.left}
        onEnter={tt.cancelHide} onLeave={tt.scheduleHide}
      >
        <div style={{ fontWeight: 700, color: GOLD, marginBottom: 5, fontSize: 11 }}>
          {label}
        </div>
        <div style={{ marginBottom: 4 }}>{entry.short}</div>
        <div style={{ color: '#8DA4C4', fontSize: 11, marginBottom: 8 }}>{entry.detail}</div>
        <a
          href={`/glossary#${entry.glossary}`}
          style={{ color: GOLD, fontSize: 11, textDecoration: 'none', display: 'block' }}
          onClick={e => e.stopPropagation()}
        >
          Learn more in glossary →
        </a>
      </TooltipPortal>
    </span>
  )
}

// Tooltip for cross-pair P&L cells — explains the currency conversion.
// settlementCurrency = the "to" currency of the pair (e.g. NOK for GBP/NOK).
// For direct base-currency pairs pass isDirectPair=true.
function CrossPairTooltip({ baseCurrency = 'EUR', settlementCurrency, isDirectPair = false }) {
  const tt = usePortalTooltip()

  const message = isDirectPair || !settlementCurrency
    ? `P&L calculated directly in ${baseCurrency}.`
    : `P&L converted from ${settlementCurrency} to ${baseCurrency} at today's spot rate.`

  return (
    <span
      ref={tt.triggerRef}
      className="inline-block ml-1 align-middle"
      style={{ color: GOLD, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}
      onMouseEnter={tt.show}
      onMouseLeave={tt.scheduleHide}
      aria-label="P&L currency conversion explanation"
    >
      ⓘ
      <TooltipPortal
        visible={tt.visible} top={tt.top} left={tt.left}
        onEnter={tt.cancelHide} onLeave={tt.scheduleHide}
      >
        <div style={{ marginBottom: 8 }}>{message}</div>
        <a
          href="/glossary#floating-p-l"
          style={{ color: GOLD, fontSize: 11, textDecoration: 'none', display: 'block' }}
          onClick={e => e.stopPropagation()}
        >
          Learn more in glossary →
        </a>
      </TooltipPortal>
    </span>
  )
}

// ── Confidence badge — editable inline ───────────────────────────────────────
const CONFIDENCE_CYCLE = ['COMMITTED', 'PROBABLE', 'ESTIMATED']
const CONFIDENCE_STYLE = {
  COMMITTED: { bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
  PROBABLE:  { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  ESTIMATED: { bg: 'rgba(156,163,175,0.12)', color: '#9CA3AF' },
}

function ConfidenceBadge({ exposureId, value, onChange }) {
  const [saving, setSaving] = useState(false)
  const current = value || 'COMMITTED'
  const s = CONFIDENCE_STYLE[current] || CONFIDENCE_STYLE.COMMITTED

  async function cycle(e) {
    e.stopPropagation()
    const next = CONFIDENCE_CYCLE[(CONFIDENCE_CYCLE.indexOf(current) + 1) % CONFIDENCE_CYCLE.length]
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/exposures/${exposureId}/confidence`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ confidence: next }),
      })
      if (res.ok) onChange(next)
    } finally { setSaving(false) }
  }

  return (
    <button
      onClick={cycle}
      disabled={saving}
      title="Click to change confidence level"
      className="px-2 py-0.5 rounded-full text-xs font-semibold transition-opacity disabled:opacity-50"
      style={{ background: s.bg, color: s.color, cursor: 'pointer' }}
    >
      {current}
    </button>
  )
}

// ── Data source icon ──────────────────────────────────────────────────────────
const DATA_SOURCE_ICONS = {
  manual:     '📋',
  csv_import: '📤',
  erp:        '🔗',
  bank_feed:  '🏦',
  ai:         '🤖',
}
const DATA_SOURCE_LABELS = {
  manual:     'Manual entry',
  csv_import: 'CSV import',
  erp:        'ERP integration',
  bank_feed:  'Bank feed',
  ai:         'AI generated',
}

function DataSourceIcon({ source }) {
  const key   = source || 'manual'
  const icon  = DATA_SOURCE_ICONS[key]  || '📋'
  const label = DATA_SOURCE_LABELS[key] || 'Manual entry'
  return (
    <span title={`Data source: ${label}`}
      className="ml-1 opacity-70 hover:opacity-100 transition-opacity cursor-default"
      style={{ fontSize: 13 }}>
      {icon}
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
    BREACH: 'Breach', OPEN: 'Open', IN_PROGRESS: 'In Progress',
    WELL_HEDGED: 'Hedged', NO_BUDGET: 'No Budget'
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

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'requires_action',     label: 'Requires Action',     emoji: '⚠️', badgeColor: DANGER  },
  { id: 'in_progress',         label: 'In Progress',         emoji: '🔄', badgeColor: WARNING },
  { id: 'hedged',              label: 'Hedged',              emoji: '✅', badgeColor: SUCCESS },
  { id: 'awaiting_settlement', label: 'Awaiting Settlement', emoji: '🕐', badgeColor: WARNING },
  { id: 'settled',             label: 'Settled',             emoji: '📁', badgeColor: null    },
]

// Columns shown per lifecycle tab — each tab surfaces the most relevant data
const TAB_COLUMNS = {
  requires_action:     ['Pair', 'Description', 'Total', 'Open', 'Hedge %', 'Combined P&L', 'Zone', 'Status', 'Actions'],
  in_progress:         ['Pair', 'Description', 'Total', 'Hedged', 'Open', 'Hedge %', 'Locked P&L', 'Floating P&L', 'Zone', 'Actions'],
  hedged:              ['Pair', 'Description', 'Total', 'Hedged', 'Hedge %', 'Locked P&L', 'Value Date', 'Status'],
  awaiting_settlement: ['Pair', 'Description', 'Total', 'Hedged', 'Value Date', 'Days Overdue', 'Bank Ref', 'Actions'],
  settled:             ['Pair', 'Description', 'Total', 'Final Hedge %', 'Settlement Date', 'Final P&L'],
}

export default function ExposureRegister({
  companyId,
  onEdit,
  onDelete,
  onHedgeNow,
  // Optional: when provided, HedgingPage drives the tab selection externally
  externalTab      = null,
  onTabDataLoaded  = null,  // callback(tabData) so parent can compute P&L strip
  hideChrome       = false, // when true: skip P&L strip + tab nav (parent renders them)
}) {
  const { getSelectedCompany } = useCompany()
  const baseCurrency = getSelectedCompany()?.base_currency || 'EUR'

  const storageKey = `exposure_tab_${companyId}`
  // When externally controlled, use externalTab; otherwise read from localStorage
  const [internalTab, setInternalTab] = useState(
    () => externalTab || localStorage.getItem(storageKey) || 'requires_action'
  )
  const activeTab = externalTab || internalTab
  const [tabData, setTabData]             = useState({})
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [expanded, setExpanded]           = useState({})
  const [mtmData, setMtmData]             = useState({})   // { [exposureId]: { [trancheId]: mtmRow } }
  const [corridorModal, setCorridorModal] = useState(null)
  const [confirmModal, setConfirmModal]   = useState(null)  // { tranche, ccy }
  const [archiveModal, setArchiveModal]   = useState(null)

  useEffect(() => {
    if (!companyId) return
    load()
    // Refresh when another component (e.g. HedgingRecommendations) executes a trade
    const handler = () => load()
    window.addEventListener('portfolio-updated', handler)
    return () => window.removeEventListener('portfolio-updated', handler)
  }, [companyId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Fetch enriched exposures (include_archived=true so settled tab is populated)
      const res = await fetch(
        `${API_BASE}/api/exposures/enriched?company_id=${companyId}&include_archived=true`,
        { headers: authHeaders() }
      )
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const items = data.items || []

      // Group by the backend-assigned 'tab' field — this is set by classify_exposure_tab
      // and accounts for zone, hedge %, breach status, and maturity. It is the single
      // source of truth for which tab an exposure belongs in.
      const TAB_IDS = ['requires_action', 'in_progress', 'hedged', 'awaiting_settlement', 'settled']
      const grouped = {}
      TAB_IDS.forEach(t => { grouped[t] = { count: 0, exposures: [] } })
      items.forEach(exp => {
        const t = exp.tab || 'requires_action'
        if (grouped[t]) {
          grouped[t].exposures.push(exp)
          grouped[t].count++
        }
      })

      setTabData(grouped)
      if (onTabDataLoaded) onTabDataLoaded(grouped)
      // Auto-select requires_action on first load if it has items and no saved preference
      if (!externalTab && !localStorage.getItem(storageKey)) {
        const defaultTab = (grouped.requires_action?.count || 0) > 0 ? 'requires_action' : 'in_progress'
        setInternalTab(defaultTab)
      }
    } catch (e) {
      setError('Failed to load exposure register')
    } finally {
      setLoading(false)
    }
  }

  function switchTab(tabId) {
    setInternalTab(tabId)
    localStorage.setItem(storageKey, tabId)
  }

  function toggleExpand(id) {
    const nowExpanding = !expanded[id]
    setExpanded(prev => ({ ...prev, [id]: nowExpanding }))
    // Lazy-load MTM data the first time a row is expanded
    if (nowExpanding && !mtmData[id]) {
      fetch(`${API_BASE}/api/tranches/mtm/${id}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.tranches) return
          const byId = {}
          data.tranches.forEach(t => { byId[t.tranche_id] = t })
          setMtmData(prev => ({ ...prev, [id]: byId }))
        })
        .catch(() => {/* MTM fetch failed — cells will show — */})
    }
  }

  async function handleMarkSettled(exp) {
    try {
      const res = await fetch(`${API_BASE}/api/exposures/${exp.id}/archive`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ reason: 'Settlement complete' })
      })
      if (!res.ok) throw new Error('Failed')
      load()
    } catch (e) { alert('Failed to mark as settled') }
  }

  async function handleUnarchive(exp) {
    try {
      const res = await fetch(`${API_BASE}/api/exposures/${exp.id}/unarchive`, {
        method: 'POST', headers: authHeaders()
      })
      if (!res.ok) throw new Error('Failed')
      load()
    } catch (e) { alert('Failed to unarchive exposure') }
  }

  // Portfolio P&L totals — active tabs only (excludes awaiting_settlement + settled)
  const activeTabsForPnl = ['requires_action', 'in_progress', 'hedged']
  const allActiveExposures = activeTabsForPnl.flatMap(t => tabData[t]?.exposures || [])
  const totalLockedPnl   = allActiveExposures.reduce((s, e) => s + (e.locked_pnl   || 0), 0)
  const totalFloatingPnl = allActiveExposures.reduce((s, e) => s + (e.floating_pnl || 0), 0)
  const totalCombinedPnl = allActiveExposures.reduce((s, e) => s + (e.combined_pnl || 0), 0)

  const currentExposures = tabData[activeTab]?.exposures || []
  const columns = TAB_COLUMNS[activeTab] || []

  // ── Cell renderer — returns a <td> for each column key ─────────────────────
  function renderCell(col, exp) {
    const today = new Date()
    switch (col) {

      case 'Pair':
        return (
          <td key="Pair" className="px-3 py-3 font-semibold whitespace-nowrap" style={{ color: NAVY }}>
            <div className="flex items-center gap-1.5">
              {expanded[exp.id]
                ? <ChevronUp size={13} className="text-gray-400" />
                : <ChevronDown size={13} className="text-gray-400" />}
              <CurrencyPairFlags pair={exp.currency_pair} size="sm" />
              {exp.currency_pair}
            </div>
          </td>
        )

      case 'Description':
        return (
          <td key="Description" className="px-3 py-3 text-gray-500 max-w-xs truncate">
            <div className="flex items-center gap-0.5">
              <span>{exp.description || '—'}</span>
              <DataSourceIcon source={exp.data_source} />
            </div>
          </td>
        )

      case 'Total':
        return (
          <td key="Total" className="px-3 py-3 font-mono text-right text-gray-700 whitespace-nowrap">
            {fmtAmount(exp.total_amount, exp.from_currency)}
          </td>
        )

      case 'Hedged':
        return (
          <td key="Hedged" className="px-3 py-3 font-mono text-right whitespace-nowrap"
            style={{ color: exp.hedged_amount > 0 ? SUCCESS : '#9CA3AF' }}>
            {exp.hedged_amount > 0 ? fmtAmount(exp.hedged_amount, exp.from_currency) : '—'}
            {exp.tranche_count > 0 && (
              <span className="ml-1 text-xs text-gray-400">({exp.tranche_count})</span>
            )}
          </td>
        )

      case 'Open':
        return (
          <td key="Open" className="px-3 py-3 font-mono text-right whitespace-nowrap"
            style={{ color: exp.open_amount > 0 ? WARNING : '#9CA3AF' }}>
            {fmtAmount(exp.open_amount, exp.from_currency)}
          </td>
        )

      case 'Hedge %':
        return (
          <td key="Hedge %" className="px-3 py-3" style={{ minWidth: 100 }}>
            <HedgeBar pct={exp.hedge_pct} />
          </td>
        )

      case 'Final Hedge %':
        return (
          <td key="Final Hedge %" className="px-3 py-3 font-mono text-right whitespace-nowrap">
            <span style={{ color: (exp.hedge_pct || 0) >= 80 ? SUCCESS : WARNING }}>
              {(exp.hedge_pct || 0).toFixed(0)}%
            </span>
          </td>
        )

      case 'Locked P&L':
        return (
          <td key="Locked P&L" className="px-3 py-3 font-semibold text-right whitespace-nowrap"
            style={{ color: pnlColor(exp.locked_pnl) }}>
            {fmtPnl(exp.locked_pnl)}
            {exp.is_cross_pair && exp.locked_pnl !== 0 && (
              <CrossPairTooltip baseCurrency={baseCurrency} settlementCurrency={exp.to_currency} />
            )}
          </td>
        )

      case 'Floating P&L':
        return (
          <td key="Floating P&L" className="px-3 py-3 font-semibold text-right whitespace-nowrap"
            style={{ color: pnlColor(exp.floating_pnl) }}>
            {exp.open_amount > 0 ? (
              <>
                {fmtPnl(exp.floating_pnl)}
                {exp.is_cross_pair && (
                  <CrossPairTooltip baseCurrency={baseCurrency} settlementCurrency={exp.to_currency} />
                )}
              </>
            ) : '—'}
          </td>
        )

      case 'Combined P&L':
        return (
          <td key="Combined P&L" className="px-3 py-3 font-bold text-right whitespace-nowrap"
            style={{ color: pnlColor(exp.combined_pnl) }}>
            {fmtPnl(exp.combined_pnl)}
            {exp.is_cross_pair && (
              <CrossPairTooltip baseCurrency={baseCurrency} settlementCurrency={exp.to_currency} />
            )}
          </td>
        )

      case 'Final P&L':
        return (
          <td key="Final P&L" className="px-3 py-3 font-bold text-right whitespace-nowrap"
            style={{ color: pnlColor(exp.combined_pnl) }}>
            {fmtPnl(exp.combined_pnl)}
          </td>
        )

      case 'Zone':
        return (
          <td key="Zone" className="px-3 py-3">
            <ZoneBadge zone={exp.current_zone} />
          </td>
        )

      case 'Status':
        // Workflow status only — zone is shown in the dedicated Zone column.
        return (
          <td key="Status" className="px-3 py-3">
            <StatusBadge status={exp.status} archived={exp.archived} />
          </td>
        )

      case 'Value Date':
        return (
          <td key="Value Date" className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
            {exp.end_date ? new Date(exp.end_date).toLocaleDateString('en-GB') : '—'}
          </td>
        )

      case 'Settlement Date':
        return (
          <td key="Settlement Date" className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
            {exp.archived_at
              ? new Date(exp.archived_at).toLocaleDateString('en-GB')
              : exp.end_date
              ? new Date(exp.end_date).toLocaleDateString('en-GB')
              : '—'}
          </td>
        )

      case 'Days Overdue': {
        const daysOverdue = exp.end_date
          ? Math.floor((today - new Date(exp.end_date)) / (1000 * 60 * 60 * 24))
          : null
        return (
          <td key="Days Overdue" className="px-3 py-3 text-right whitespace-nowrap">
            {daysOverdue != null && daysOverdue > 0
              ? <span className="font-semibold" style={{ color: DANGER }}>{daysOverdue}d</span>
              : <span className="text-gray-400">—</span>}
          </td>
        )
      }

      case 'Bank Ref': {
        const bankRef = exp.tranches?.find(t => t.status === 'confirmed' && t.bank_reference)?.bank_reference
        return (
          <td key="Bank Ref" className="px-3 py-3 font-mono text-sm text-gray-600">
            {bankRef || <span className="text-gray-300">—</span>}
          </td>
        )
      }

      case 'Actions':
        return (
          <td key="Actions" className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {activeTab === 'settled' ? (
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
                  {activeTab === 'awaiting_settlement' && (
                    <button onClick={() => handleMarkSettled(exp)}
                      className="text-xs px-2 py-1 rounded font-semibold text-white"
                      style={{ background: SUCCESS }}>
                      Mark Settled
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
        )

      default:
        return <td key={col} className="px-3 py-3 text-gray-300">—</td>
    }
  }

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

      {/* Portfolio P&L Summary — hidden when HedgingPage renders it above the tabs */}
      {!hideChrome && <div className="rounded-xl p-5 grid grid-cols-3 gap-4" style={{ background: NAVY }}>
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
      </div>}

      {/* Tab bar + table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Tab strip — hidden when HedgingPage renders it externally */}
        {!hideChrome && <div className="flex items-stretch border-b border-gray-100" style={{ background: '#F8FAFC' }}>
          {TABS.map(tab => {
            const count    = tabData[tab.id]?.count || 0
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className="flex-1 flex flex-col items-center py-3 px-2 text-xs font-semibold transition-all relative"
                style={{
                  background:   isActive ? 'white' : 'transparent',
                  color:        isActive ? NAVY : '#9CA3AF',
                  borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
                }}
              >
                <span className="text-base mb-0.5">{tab.emoji}</span>
                <span className="whitespace-nowrap">{tab.label}</span>
                {count > 0 && (
                  <span
                    className="absolute top-2 right-2 font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      fontSize:   10,
                      background: tab.badgeColor ? `${tab.badgeColor}22` : '#E5E7EB',
                      color:      tab.badgeColor || '#6B7280',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
          {/* Refresh button in tab strip */}
          <button
            onClick={load}
            className="flex items-center gap-1 px-4 text-xs text-gray-400 hover:text-gray-600 border-l border-gray-100"
            title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>}

        {/* Table for the active tab */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead style={{ background: '#F4F6FA' }}>
              <tr>
                {columns.map(h => (
                  <th key={h}
                    className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <ColHeader label={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {currentExposures.map(exp => (
                <React.Fragment key={exp.id}>
                  <tr
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(exp.id)}
                  >
                    {columns.map(col => renderCell(col, exp))}
                  </tr>

                  {/* Expanded tranche detail — colSpan adapts to active column count */}
                  {expanded[exp.id] && (
                    <tr>
                      <td colSpan={columns.length} className="px-6 py-0 bg-gray-50">
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
              ))}
            </tbody>
          </table>

          {currentExposures.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              {activeTab === 'settled'             ? 'No settled exposures yet.'              :
               activeTab === 'hedged'              ? 'No fully hedged exposures yet.'         :
               activeTab === 'awaiting_settlement' ? 'No exposures awaiting settlement.'      :
               activeTab === 'in_progress'         ? 'No exposures in progress.'              :
                                                     'No exposures require action right now.'}
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
