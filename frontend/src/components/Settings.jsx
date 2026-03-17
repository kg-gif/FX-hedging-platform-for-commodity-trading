// Settings.jsx
// Sidebar-layout settings page. Left nav: Company Profile / Policy & Zones /
// Bank Details / Notifications / Data Import / Admin Panel (admin-only).

import React, { useState, useEffect } from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { Save, Building2, Landmark, Bell, ShieldCheck, History, AlertTriangle,
  CheckCircle, Layers, Upload, Settings as SettingsIcon } from 'lucide-react'
import { NAVY, GOLD, DANGER, SUCCESS, WARNING } from '../brand'
import DataImportDashboard from './DataImportDashboard'
import Admin from './Admin'

const API_BASE = 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
)

const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"

// ── Zone summary card ───────────────────────────────────────────────────────

function ZoneSummaryCard({ policies, zones }) {
  const activePolicy = policies.find(p => p.is_active)
  const baseRatio = activePolicy
    ? Math.round((activePolicy.hedge_ratio_over_5m ?? activePolicy.hedge_ratio_1m_to_5m ?? 0.5) * 100)
    : '—'
  const defensiveRatio   = zones ? Math.round((zones.defensive_ratio   ?? 0.75) * 100) : '—'
  const opportunisticRatio = zones ? Math.round((zones.opportunistic_ratio ?? 0.25) * 100) : '—'
  const adverseTrigger   = zones ? zones.adverse_trigger_pct    ?? 3 : '—'
  const favourTrigger    = zones ? zones.favourable_trigger_pct ?? 3 : '—'

  const columns = [
    {
      id:      'defensive',
      label:   'Defensive',
      bg:      'rgba(239,68,68,0.06)',
      border:  'rgba(239,68,68,0.2)',
      color:   DANGER,
      hedge:   `${defensiveRatio}%`,
      trigger: `Rate moves ≥${adverseTrigger}% against budget`,
    },
    {
      id:      'base',
      label:   'Base',
      bg:      'rgba(26,39,68,0.04)',
      border:  '#E5E7EB',
      color:   NAVY,
      hedge:   `${baseRatio}%`,
      trigger: 'Normal zone',
    },
    {
      id:      'opportunistic',
      label:   'Opportunistic',
      bg:      'rgba(16,185,129,0.06)',
      border:  'rgba(16,185,129,0.2)',
      color:   SUCCESS,
      hedge:   `${opportunisticRatio}%`,
      trigger: `Rate moves ≥${favourTrigger}% in your favour`,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {columns.map(col => (
        <div key={col.id} className="rounded-xl p-4 border"
          style={{ background: col.bg, borderColor: col.border }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: col.color }}>
            {col.label}
          </p>
          <p className="text-2xl font-bold mb-1" style={{ color: NAVY }}>{col.hedge}</p>
          <p className="text-xs text-gray-400 leading-snug">{col.trigger}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function Settings({ authUser, initialSection }) {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId || 1
  const isAdmin = ['superadmin', 'company_admin', 'admin'].includes(authUser?.role)

  // ── Sidebar sections ─────────────────────────────────────────────────────
  const NAV_ITEMS = [
    { id: 'company',       label: 'Company Profile',  icon: Building2     },
    { id: 'policy',        label: 'Policy & Zones',   icon: ShieldCheck   },
    { id: 'bank',          label: 'Bank Details',     icon: Landmark      },
    { id: 'notifications', label: 'Notifications',    icon: Bell          },
    { id: 'data-import',   label: 'Data Import',      icon: Upload        },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin Panel', icon: SettingsIcon }] : []),
  ]

  const [activeSection, setActiveSection] = useState(initialSection || 'company')

  // Support initialSection prop changes (from App.jsx legacy route redirects)
  useEffect(() => {
    if (initialSection) setActiveSection(initialSection)
  }, [initialSection])

  // ── Data state ───────────────────────────────────────────────────────────
  const [settings, setSettings]         = useState(null)
  const [policies, setPolicies]         = useState([])
  const [auditLog, setAuditLog]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(null)
  const [message, setMessage]           = useState(null)
  const [cascadePreview, setCascadePreview]       = useState(null)
  const [showCascadeConfirm, setShowCascadeConfirm] = useState(false)
  const [pendingPolicyId, setPendingPolicyId]     = useState(null)

  // Form state
  const [company, setCompany] = useState({ name: '', base_currency: '', trading_volume_monthly: '' })
  const [bank, setBank]       = useState({ bank_name: '', bank_contact_name: '', bank_email: '' })
  const [notifs, setNotifs]   = useState({ alert_email: '', daily_digest: true })
  const [zones, setZones]     = useState({
    defensive_ratio:        0.75,
    opportunistic_ratio:    0.25,
    adverse_trigger_pct:    3.0,
    favourable_trigger_pct: 3.0,
    zone_auto_apply:        false,
    zone_notify_email:      true,
    zone_notify_inapp:      true,
  })
  const [alertPrefs, setAlertPrefs] = useState({ mc_alert_threshold_pct: 2.0, mc_alert_recipients: 'all' })

  useEffect(() => { loadAll() }, [companyId])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [sRes, pRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/api/settings/${companyId}`,         { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/policies?company_id=${companyId}`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/settings/${companyId}/audit`,   { headers: authHeaders() }).then(r => r.json()),
      ])
      setSettings(sRes)
      setCompany({
        name:                   sRes.company?.name || '',
        base_currency:          sRes.company?.base_currency || 'USD',
        trading_volume_monthly: sRes.company?.trading_volume_monthly || ''
      })
      setBank({
        bank_name:         sRes.bank?.bank_name         || '',
        bank_contact_name: sRes.bank?.bank_contact_name || '',
        bank_email:        sRes.bank?.bank_email        || '',
      })
      setNotifs({
        alert_email:  sRes.notifications?.alert_email  || '',
        daily_digest: sRes.notifications?.daily_digest ?? true,
      })
      const zc = sRes.zone_config
      if (zc) setZones({
        defensive_ratio:        zc.defensive_ratio        ?? 0.75,
        opportunistic_ratio:    zc.opportunistic_ratio    ?? 0.25,
        adverse_trigger_pct:    zc.adverse_trigger_pct    ?? 3.0,
        favourable_trigger_pct: zc.favourable_trigger_pct ?? 3.0,
        zone_auto_apply:        zc.zone_auto_apply        ?? false,
        zone_notify_email:      zc.zone_notify_email      ?? true,
        zone_notify_inapp:      zc.zone_notify_inapp      ?? true,
      })
      const ap = sRes.alert_prefs
      if (ap) setAlertPrefs({
        mc_alert_threshold_pct: ap.mc_alert_threshold_pct ?? 2.0,
        mc_alert_recipients:    ap.mc_alert_recipients    ?? 'all',
      })
      setPolicies(pRes.policies || [])
      setAuditLog(aRes.audit_log || [])
      // Backend auto-seeded defaults for a new company — surface a soft info message
      if (pRes.auto_created) {
        showMsg('info', 'Default policy applied — Balanced. Customise below.')
      }
    } catch {
      showMsg('error', 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const save = async (section, payload) => {
    setSaving(section)
    try {
      const r = await fetch(`${API_BASE}/api/settings/${companyId}/${section}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (data.success) showMsg('success', `${section.charAt(0).toUpperCase() + section.slice(1)} settings saved`)
      else showMsg('error', data.detail || 'Save failed')
    } catch {
      showMsg('error', 'Network error')
    } finally {
      setSaving(null)
    }
  }

  const handlePolicyClick = async (policyId) => {
    const activePolicy = policies.find(p => p.is_active)
    if (activePolicy?.id === policyId) return
    try {
      const r = await fetch(`${API_BASE}/api/settings/policy/cascade/preview`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ policy_id: policyId, company_id: companyId }),
      })
      const preview = await r.json()
      setCascadePreview(preview)
      setPendingPolicyId(policyId)
      setShowCascadeConfirm(true)
    } catch {
      showMsg('error', 'Failed to preview policy change')
    }
  }

  const confirmCascade = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/settings/policy/cascade`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ policy_id: pendingPolicyId, company_id: companyId, changed_by: 'admin' }),
      })
      const data = await r.json()
      if (data.success) {
        showMsg('success', data.message)
        setShowCascadeConfirm(false)
        loadAll()
      } else {
        showMsg('error', data.detail || 'Policy change failed')
      }
    } catch {
      showMsg('error', 'Network error')
    }
  }

  const CURRENCIES = ['USD','EUR','GBP','NOK','SEK','CHF','JPY','AUD','CAD','NZD']

  // ── Section renderers ────────────────────────────────────────────────────

  const renderCompany = () => (
    <div>
      <h3 className="text-base font-bold mb-5" style={{ color: NAVY }}>Company Profile</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Company Name">
          <input className={inputClass} value={company.name}
            onChange={e => setCompany({ ...company, name: e.target.value })} />
        </Field>
        <Field label="Base Currency">
          <select className={inputClass} value={company.base_currency}
            onChange={e => setCompany({ ...company, base_currency: e.target.value })}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Monthly FX Volume (USD)" hint="Used to calibrate risk thresholds">
          <input type="number" className={inputClass}
            value={company.trading_volume_monthly}
            onChange={e => setCompany({ ...company, trading_volume_monthly: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end mt-6">
        <button onClick={() => save('company', company)} disabled={saving === 'company'}
          className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: NAVY }}>
          <Save size={14} />{saving === 'company' ? 'Saving…' : 'Save Company'}
        </button>
      </div>
    </div>
  )

  const renderPolicy = () => (
    <div>
      <h3 className="text-base font-bold mb-2" style={{ color: NAVY }}>Policy & Zones</h3>
      <p className="text-xs text-gray-400 mb-5">
        Zones shift hedge targets when spot rates move vs your budget rate.
        Defensive increases the target; Opportunistic lowers it.
      </p>

      {/* Visual zone summary */}
      <ZoneSummaryCard policies={policies} zones={zones} />

      {/* Hedging policy selector */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: NAVY }}>Hedging Policy</p>
        <p className="text-xs text-gray-400 mb-3">
          Changing the active policy updates hedge ratios on all exposures without a manual override.
        </p>
        <div className="space-y-2">
          {policies.map(p => (
            <div key={p.id}
              className="flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer transition-all"
              style={{
                borderColor: p.is_active ? GOLD : '#E5E7EB',
                background:  p.is_active ? 'rgba(201,168,108,0.06)' : 'white',
              }}
              onClick={() => handlePolicyClick(p.id)}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm" style={{ color: NAVY }}>{p.policy_name}</span>
                  {p.is_active && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: 'rgba(201,168,108,0.15)', color: GOLD, border: `1px solid ${GOLD}` }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  &gt;$5M: {Math.round(p.hedge_ratio_over_5m * 100)}% ·
                  $1-5M: {Math.round(p.hedge_ratio_1m_to_5m * 100)}% ·
                  &lt;$1M: {Math.round(p.hedge_ratio_under_1m * 100)}%
                </p>
              </div>
              {!p.is_active && (
                <span className="text-xs font-semibold px-4 py-1.5 rounded-lg"
                  style={{ background: '#F4F6FA', color: NAVY }}>
                  Activate
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Zone configuration */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: NAVY }}>Zone Triggers & Targets</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <Field label="Adverse Trigger %" hint="Shift to Defensive when spot moves this % against your budget rate">
            <div className="flex items-center gap-2">
              <input type="number" step="0.1" min="0" max="20" className={inputClass}
                value={zones.adverse_trigger_pct}
                onChange={e => setZones({ ...zones, adverse_trigger_pct: parseFloat(e.target.value) || 0 })} />
              <span className="text-sm text-gray-400 shrink-0">%</span>
            </div>
          </Field>
          <Field label="Favourable Trigger %" hint="Shift to Opportunistic when spot moves this % in your favour">
            <div className="flex items-center gap-2">
              <input type="number" step="0.1" min="0" max="20" className={inputClass}
                value={zones.favourable_trigger_pct}
                onChange={e => setZones({ ...zones, favourable_trigger_pct: parseFloat(e.target.value) || 0 })} />
              <span className="text-sm text-gray-400 shrink-0">%</span>
            </div>
          </Field>
          <Field label="Defensive Hedge Target %" hint="Hedge ratio applied when in Defensive zone">
            <div className="flex items-center gap-2">
              <input type="number" step="1" min="0" max="100" className={inputClass}
                value={Math.round((zones.defensive_ratio || 0) * 100)}
                onChange={e => setZones({ ...zones, defensive_ratio: (parseFloat(e.target.value) || 0) / 100 })} />
              <span className="text-sm text-gray-400 shrink-0">%</span>
            </div>
          </Field>
          <Field label="Opportunistic Hedge Target %" hint="Hedge ratio applied when in Opportunistic zone">
            <div className="flex items-center gap-2">
              <input type="number" step="1" min="0" max="100" className={inputClass}
                value={Math.round((zones.opportunistic_ratio || 0) * 100)}
                onChange={e => setZones({ ...zones, opportunistic_ratio: (parseFloat(e.target.value) || 0) / 100 })} />
              <span className="text-sm text-gray-400 shrink-0">%</span>
            </div>
          </Field>
        </div>

        {/* Auto-apply toggle */}
        <div className="border border-gray-100 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: NAVY }}>Auto-apply zone shifts</p>
              <p className="text-xs text-gray-400 mt-0.5">Apply zone targets automatically when triggers fire</p>
            </div>
            <button
              onClick={() => setZones({ ...zones, zone_auto_apply: !zones.zone_auto_apply })}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
              style={{ background: zones.zone_auto_apply ? DANGER : '#E5E7EB' }}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                zones.zone_auto_apply ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {zones.zone_auto_apply && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle size={13} color={DANGER} />
              <p className="text-xs" style={{ color: DANGER }}>Zone shifts will apply automatically without confirmation</p>
            </div>
          )}
        </div>

        {/* Zone notification toggles */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: NAVY }}>Zone Notifications</p>
          <div className="flex flex-wrap gap-4">
            {[
              { key: 'zone_notify_inapp', label: 'In-app' },
              { key: 'zone_notify_email', label: 'Email'  },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <button
                  onClick={() => setZones({ ...zones, [key]: !zones[key] })}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  style={{ background: zones[key] ? GOLD : '#E5E7EB' }}>
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                    zones[key] ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-gray-600">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => save('zones', {
          defensive_ratio:        zones.defensive_ratio,
          opportunistic_ratio:    zones.opportunistic_ratio,
          adverse_trigger_pct:    zones.adverse_trigger_pct,
          favourable_trigger_pct: zones.favourable_trigger_pct,
          zone_auto_apply:        zones.zone_auto_apply,
          zone_notify_email:      zones.zone_notify_email,
          zone_notify_inapp:      zones.zone_notify_inapp,
        })} disabled={saving === 'zones'}
          className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: NAVY }}>
          <Save size={14} />{saving === 'zones' ? 'Saving…' : 'Save Zone Config'}
        </button>
      </div>

      {/* Policy Change Audit Log */}
      {auditLog.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <History size={14} color={NAVY} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY }}>Policy Change Audit Log</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {auditLog.slice(0, 10).map(log => (
                <div key={log.id} className="flex items-start justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>{log.policy_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{log.notes}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-xs text-gray-400">
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-gray-400">{log.changed_by}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Alert Preferences ─────────────────────────────────────────── */}
      <div className="rounded-xl p-5 mt-6" style={{ background: '#F8F9FC', border: '1px solid #E2E8F0' }}>
        <h4 className="text-sm font-bold mb-1" style={{ color: NAVY }}>Alert Preferences</h4>
        <p className="text-xs text-gray-400 mb-4">Configure when margin call risk alerts are triggered and who receives them.</p>
        <div className="grid grid-cols-1 gap-4 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Margin Call Alert Threshold (% of notional)
            </label>
            <input
              type="number" min="0.1" max="50" step="0.1"
              value={alertPrefs.mc_alert_threshold_pct}
              onChange={e => setAlertPrefs(p => ({ ...p, mc_alert_threshold_pct: parseFloat(e.target.value) || 2.0 }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">Alert fires when unrealised MTM loss exceeds this % of forward notional (default: 2%).</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Alert Recipients</label>
            <select
              value={alertPrefs.mc_alert_recipients}
              onChange={e => setAlertPrefs(p => ({ ...p, mc_alert_recipients: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="all">All company users</option>
              <option value="admins_only">Admins only</option>
            </select>
          </div>
        </div>
        <button
          onClick={async () => {
            setSaving('alert-prefs')
            try {
              const r = await fetch(`${API_BASE}/api/settings/${companyId}/alerts`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify(alertPrefs),
              })
              if (r.ok) showMsg('success', 'Alert preferences saved')
              else showMsg('error', 'Failed to save alert preferences')
            } catch { showMsg('error', 'Failed to save alert preferences') }
            finally { setSaving(null) }
          }}
          disabled={saving === 'alert-prefs'}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all"
          style={{ background: NAVY, opacity: saving === 'alert-prefs' ? 0.6 : 1 }}
        >
          <Save size={14} />{saving === 'alert-prefs' ? 'Saving…' : 'Save Alert Preferences'}
        </button>
      </div>
    </div>
  )

  const renderBank = () => (
    <div>
      <h3 className="text-base font-bold mb-2" style={{ color: NAVY }}>Bank Details</h3>
      <p className="text-xs text-gray-400 mb-5">Appears on Currency Plan PDF sent to bank</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Bank Name">
          <input className={inputClass} value={bank.bank_name}
            onChange={e => setBank({ ...bank, bank_name: e.target.value })}
            placeholder="e.g., HSBC, Barclays" />
        </Field>
        <Field label="Relationship Manager">
          <input className={inputClass} value={bank.bank_contact_name}
            onChange={e => setBank({ ...bank, bank_contact_name: e.target.value })}
            placeholder="Full name" />
        </Field>
        <Field label="Bank Contact Email">
          <input type="email" className={inputClass} value={bank.bank_email}
            onChange={e => setBank({ ...bank, bank_email: e.target.value })}
            placeholder="rm@bank.com" />
        </Field>
      </div>
      <div className="flex justify-end mt-6">
        <button onClick={() => save('bank', bank)} disabled={saving === 'bank'}
          className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: NAVY }}>
          <Save size={14} />{saving === 'bank' ? 'Saving…' : 'Save Bank Details'}
        </button>
      </div>
    </div>
  )

  const renderNotifications = () => (
    <div>
      <h3 className="text-base font-bold mb-5" style={{ color: NAVY }}>Notifications</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Alert Email" hint="Breach and warning notifications">
          <input type="email" className={inputClass} value={notifs.alert_email}
            onChange={e => setNotifs({ ...notifs, alert_email: e.target.value })}
            placeholder="cfo@company.com" />
        </Field>
        <Field label="Daily Digest">
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setNotifs({ ...notifs, daily_digest: !notifs.daily_digest })}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: notifs.daily_digest ? GOLD : '#E5E7EB' }}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                notifs.daily_digest ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-sm text-gray-600">
              {notifs.daily_digest ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </Field>
      </div>
      <div className="flex justify-end mt-6">
        <button onClick={() => save('notifications', notifs)} disabled={saving === 'notifications'}
          className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: NAVY }}>
          <Save size={14} />{saving === 'notifications' ? 'Saving…' : 'Save Notifications'}
        </button>
      </div>
    </div>
  )

  const renderDataImport = () => (
    <div>
      <h3 className="text-base font-bold mb-5" style={{ color: NAVY }}>Data Import</h3>
      <DataImportDashboard />
    </div>
  )

  const renderAdminPanel = () => (
    <div>
      <h3 className="text-base font-bold mb-5" style={{ color: NAVY }}>Admin Panel</h3>
      <Admin authUser={authUser} />
    </div>
  )

  const renderContent = () => {
    if (loading) return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: GOLD }} />
      </div>
    )
    switch (activeSection) {
      case 'company':       return renderCompany()
      case 'policy':        return renderPolicy()
      case 'bank':          return renderBank()
      case 'notifications': return renderNotifications()
      case 'data-import':   return renderDataImport()
      case 'admin':         return isAdmin ? renderAdminPanel() : renderCompany()
      default:              return renderCompany()
    }
  }

  return (
    <div>
      {/* Toast */}
      {message && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200'
          : message.type === 'info'  ? 'bg-blue-50 text-blue-800 border border-blue-200'
          :                            'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} />
          : message.type === 'info'   ? <CheckCircle size={16} />
          : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* Page header */}
      <div className="rounded-xl p-6 mb-6" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Settings</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Company, bank, policy, notifications and data configuration
        </p>
      </div>

      {/* Sidebar layout */}
      <div className="flex gap-6 items-start">

        {/* Left sidebar */}
        <div className="shrink-0 w-48 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden sticky top-[73px]">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition-all border-l-2"
                style={{
                  borderLeftColor: active ? GOLD : 'transparent',
                  background:      active ? 'rgba(201,168,108,0.06)' : 'transparent',
                  color:           active ? NAVY : '#6B7280',
                }}
              >
                <Icon size={15} color={active ? GOLD : '#9CA3AF'} />
                {item.label}
              </button>
            )
          })}
        </div>

        {/* Right content panel */}
        <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {renderContent()}
        </div>
      </div>

      {/* Policy Cascade Confirm Modal */}
      {showCascadeConfirm && cascadePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={22} color={WARNING} />
              <h2 className="text-lg font-bold" style={{ color: NAVY }}>Confirm Policy Change</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Activating <strong>{cascadePreview.policy_name}</strong> will:
            </p>
            <div className="rounded-xl p-4 mb-5 space-y-2" style={{ background: '#F4F6FA' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: NAVY }}>Exposures updated</span>
                <span className="font-bold" style={{ color: SUCCESS }}>{cascadePreview.will_update}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: NAVY }}>Manual overrides preserved</span>
                <span className="font-bold" style={{ color: GOLD }}>{cascadePreview.will_skip}</span>
              </div>
            </div>
            {cascadePreview.will_skip > 0 && (
              <p className="text-xs text-gray-400 mb-5">
                {cascadePreview.will_skip} exposure{cascadePreview.will_skip > 1 ? 's have' : ' has'} a manual override and will not be changed.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowCascadeConfirm(false); setCascadePreview(null) }}
                className="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Cancel
              </button>
              <button onClick={confirmCascade}
                className="px-5 py-2 text-white rounded-lg text-sm font-semibold"
                style={{ background: NAVY }}>
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
