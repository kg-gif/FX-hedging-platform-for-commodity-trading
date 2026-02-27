import React, { useState, useEffect } from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { Save, Building2, Landmark, Bell, ShieldCheck, History, AlertTriangle, CheckCircle } from 'lucide-react'
import { NAVY, GOLD, DANGER, SUCCESS, WARNING } from '../brand'

const API_BASE = 'https://birk-fx-api.onrender.com'

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
    <div className="px-6 py-4 flex items-center gap-3" style={{ background: NAVY }}>
      <Icon size={16} color={GOLD} />
      <h3 className="font-semibold text-white text-sm">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

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

export default function Settings() {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId || 1

  const [settings, setSettings]         = useState(null)
  const [policies, setPolicies]         = useState([])
  const [auditLog, setAuditLog]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(null)
  const [message, setMessage]           = useState(null)
  const [cascadePreview, setCascadePreview] = useState(null)
  const [showCascadeConfirm, setShowCascadeConfirm] = useState(false)
  const [pendingPolicyId, setPendingPolicyId] = useState(null)

  // Form state
  const [company, setCompany]   = useState({ name: '', base_currency: '', trading_volume_monthly: '' })
  const [bank, setBank]         = useState({ bank_name: '', bank_contact_name: '', bank_email: '' })
  const [notifs, setNotifs]     = useState({ alert_email: '', daily_digest: true })

  useEffect(() => { loadAll() }, [companyId])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [sRes, pRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/api/settings/${companyId}`).then(r => r.json()),
        fetch(`${API_BASE}/api/policies?company_id=${companyId}`).then(r => r.json()),
        fetch(`${API_BASE}/api/settings/${companyId}/audit`).then(r => r.json())
      ])

      setSettings(sRes)
      setCompany({
        name: sRes.company?.name || '',
        base_currency: sRes.company?.base_currency || 'USD',
        trading_volume_monthly: sRes.company?.trading_volume_monthly || ''
      })
      setBank({
        bank_name: sRes.bank?.bank_name || '',
        bank_contact_name: sRes.bank?.bank_contact_name || '',
        bank_email: sRes.bank?.bank_email || ''
      })
      setNotifs({
        alert_email: sRes.notifications?.alert_email || '',
        daily_digest: sRes.notifications?.daily_digest ?? true
      })
      setPolicies(pRes.policies || [])
      setAuditLog(aRes.audit_log || [])
    } catch (e) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

    // Get preview first
    try {
      const r = await fetch(`${API_BASE}/api/settings/policy/cascade/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy_id: policyId, company_id: companyId })
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy_id: pendingPolicyId, company_id: companyId, changed_by: 'admin' })
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

  if (loading) return (
    <div className="text-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto" style={{ borderColor: GOLD }}></div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-0">

      {/* Message toast */}
      {message && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success'
            ? <CheckCircle size={16} />
            : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* Page header */}
      <div className="rounded-xl p-6 mb-6" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Settings</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Company, bank, policy and notification configuration
        </p>
      </div>

      {/* Company */}
      <Section icon={Building2} title="Company">
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
        <div className="flex justify-end mt-5">
          <button onClick={() => save('company', company)} disabled={saving === 'company'}
            className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: NAVY }}>
            <Save size={14} />{saving === 'company' ? 'Saving...' : 'Save Company'}
          </button>
        </div>
      </Section>

      {/* Bank */}
      <Section icon={Landmark} title="Bank Details">
        <p className="text-xs text-gray-400 mb-4">Appears on Currency Plan PDF sent to client</p>
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
        <div className="flex justify-end mt-5">
          <button onClick={() => save('bank', bank)} disabled={saving === 'bank'}
            className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: NAVY }}>
            <Save size={14} />{saving === 'bank' ? 'Saving...' : 'Save Bank Details'}
          </button>
        </div>
      </Section>

      {/* Hedging Policy */}
      <Section icon={ShieldCheck} title="Hedging Policy">
        <p className="text-xs text-gray-400 mb-4">
          Changing the active policy will update hedge ratios on all exposures
          without a manual override. Manual overrides are preserved.
        </p>
        <div className="space-y-3">
          {policies.map(p => (
            <div key={p.id}
              className="flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer transition-all"
              style={{
                borderColor: p.is_active ? GOLD : '#E5E7EB',
                background: p.is_active ? 'rgba(201,168,108,0.06)' : 'white'
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
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="Notifications">
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
        <div className="flex justify-end mt-5">
          <button onClick={() => save('notifications', notifs)} disabled={saving === 'notifications'}
            className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: NAVY }}>
            <Save size={14} />{saving === 'notifications' ? 'Saving...' : 'Save Notifications'}
          </button>
        </div>
      </Section>

      {/* Audit Log */}
      {auditLog.length > 0 && (
        <Section icon={History} title="Policy Change Audit Log">
          <div className="space-y-2">
            {auditLog.slice(0, 10).map(log => (
              <div key={log.id} className="flex items-start justify-between py-3 border-b border-gray-50 last:border-0">
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
        </Section>
      )}

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
