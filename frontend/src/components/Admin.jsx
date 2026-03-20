import { useState, useEffect } from 'react'
import {
  UserPlus, Users, Trash2, Edit2, CheckCircle, AlertTriangle,
  Building2, Plus, ChevronDown, ChevronRight, RotateCcw
} from 'lucide-react'
import { NAVY, GOLD } from '../brand'
import { useCompany } from '../contexts/CompanyContext'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
    <div className="px-6 py-4 flex items-center gap-3" style={{ background: NAVY }}>
      <Icon size={16} color={GOLD} />
      <h3 className="font-semibold text-white text-sm">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

const Field = ({ label, hint, children, className = '' }) => (
  <div className={className}>
    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
)

const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-300"
const btnPrimary = { background: NAVY, color: 'white' }

const CURRENCIES = ['USD','EUR','GBP','NOK','SEK','CHF','JPY','AUD','CAD','NZD','MXN','BRL','CNY','ZAR','INR']
const CURRENCY_PAIRS = [
  'EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD',
  'EUR/GBP','EUR/JPY','EUR/CHF','GBP/JPY','USD/MXN','USD/BRL','USD/CNY',
  'USD/ZAR','USD/INR','USD/TRY','USD/NOK','USD/SEK','EUR/NOK','EUR/SEK','NOK/SEK',
  // Inverted pairs used by some clients
  'JPY/USD','CHF/USD','CAD/USD','GBP/NOK','GBP/SEK','NOK/USD','SEK/USD',
]

function useToast() {
  const [message, setMessage] = useState(null)
  const show = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }
  const Toast = message ? (
    <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold ${
      message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {message.text}
    </div>
  ) : null
  return { show, Toast }
}

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

function CompaniesTab({ toast, authUser }) {
  const isSuperAdmin = ['superadmin', 'admin'].includes(authUser?.role)
  const { refreshCompanies } = useCompany()

  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [exposuresByCompany, setExposuresByCompany] = useState({})
  const [showCreateCompany, setShowCreateCompany] = useState(false)
  const [showAddExposure, setShowAddExposure] = useState(null)
  const [saving, setSaving] = useState(false)
  const [companyForm, setCompanyForm] = useState({ name: '', base_currency: 'USD', trading_volume_monthly: '' })
  const [expForm, setExpForm] = useState({ pair: 'EUR/USD', amount: '', instrument_type: 'Forward', exposure_type: 'payable', budget_rate: '', description: '', end_date: '' })
  const [editingExp, setEditingExp] = useState(null)   // exposure being edited
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)

  // Inline rename state
  const [renamingId,  setRenamingId]  = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null)   // { id, name }

  // Demo reset modal
  const [resetTarget,  setResetTarget]  = useState(null)   // { id, name }
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => { loadCompanies() }, [])

  const loadCompanies = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/admin/companies`, { headers: authHeaders() })
      const data = await r.json()
      setCompanies(data.companies || [])
    } catch { toast.show('error', 'Failed to load companies') }
    finally { setLoading(false) }
  }

  const loadExposures = async (companyId) => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/companies/${companyId}/exposures`, { headers: authHeaders() })
      const data = await r.json()
      setExposuresByCompany(prev => ({ ...prev, [companyId]: data.exposures || [] }))
    } catch { toast.show('error', 'Failed to load exposures') }
  }

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null) }
    else { setExpandedId(id); loadExposures(id) }
  }

  const createCompany = async () => {
    if (!companyForm.name.trim()) { toast.show('error', 'Company name required'); return }
    setSaving(true)
    try {
      const r = await fetch(`${API_BASE}/api/admin/companies`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...companyForm, trading_volume_monthly: parseFloat(companyForm.trading_volume_monthly) || 0 })
      })
      const data = await r.json()
      if (r.ok) { toast.show('success', `"${data.name}" created`); setCompanyForm({ name: '', base_currency: 'USD', trading_volume_monthly: '' }); setShowCreateCompany(false); loadCompanies() }
      else { toast.show('error', data.detail || 'Failed') }
    } catch { toast.show('error', 'Network error') }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { id, name } = deleteTarget
    // Optimistic remove from list before the request completes
    setCompanies(prev => prev.filter(c => c.id !== id))
    setDeleteTarget(null)
    try {
      const r = await fetch(`${API_BASE}/api/admin/companies/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (r.ok) {
        toast.show('success', `"${name}" deactivated`)
        // Refresh the nav dropdown — removes deleted company and auto-switches
        // selection if the deleted company was the currently active one
        refreshCompanies()
      } else {
        // Rollback optimistic update on failure
        const d = await r.json()
        toast.show('error', d.detail || 'Delete failed')
        loadCompanies()
      }
    } catch {
      toast.show('error', 'Network error')
      loadCompanies()
    }
  }

  const renameCompany = async (id) => {
    const trimmed = renameValue.trim()
    if (!trimmed) { toast.show('error', 'Name cannot be empty'); return }
    setRenameSaving(true)
    try {
      const r = await fetch(`${API_BASE}/api/admin/companies/${id}/rename`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ name: trimmed }),
      })
      const d = await r.json()
      if (r.ok) {
        setCompanies(prev => prev.map(c => c.id === id ? { ...c, name: d.name } : c))
        setRenamingId(null)
        toast.show('success', `Renamed to "${d.name}"`)
      } else {
        toast.show('error', d.detail || 'Rename failed')
      }
    } catch { toast.show('error', 'Network error') }
    finally { setRenameSaving(false) }
  }

  const performReset = async () => {
    if (!resetTarget) return
    const { id, name } = resetTarget
    setResetLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/admin/companies/${id}/demo-reset`, {
        method: 'POST', headers: authHeaders()
      })
      const d = await r.json()
      if (r.ok) {
        toast.show('success', `Demo reset complete — ${d.exposures_inserted} exposures loaded`)
        setResetTarget(null)
        loadCompanies()
        if (expandedId === id) loadExposures(id)
        refreshCompanies()
      } else {
        toast.show('error', d.detail || 'Reset failed')
      }
    } catch { toast.show('error', 'Network error') }
    finally { setResetLoading(false) }
  }

  const addExposure = async (companyId) => {
    if (!expForm.amount) { toast.show('error', 'Amount required'); return }
    setSaving(true)
    const [from, to] = expForm.pair.split('/')
    try {
      const r = await fetch(`${API_BASE}/api/admin/exposures`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ company_id: companyId, from_currency: from, to_currency: to, amount: parseFloat(expForm.amount), instrument_type: expForm.instrument_type, exposure_type: expForm.exposure_type, budget_rate: expForm.budget_rate ? parseFloat(expForm.budget_rate) : null, description: expForm.description, end_date: expForm.end_date || null })
      })
      const data = await r.json()
      if (r.ok) { toast.show('success', `${data.pair} added`); setExpForm({ pair: 'EUR/USD', amount: '', instrument_type: 'Forward', exposure_type: 'payable', budget_rate: '', description: '', end_date: '' }); setShowAddExposure(null); loadExposures(companyId); loadCompanies() }
      else { toast.show('error', data.detail || 'Failed') }
    } catch { toast.show('error', 'Network error') }
    finally { setSaving(false) }
  }

  const openEditExposure = (exp, companyId) => {
    setEditForm({
      pair:            exp.pair,
      amount:          exp.amount,
      instrument_type: exp.instrument_type || 'Forward',
      exposure_type:   exp.exposure_type   || 'payable',
      budget_rate:     exp.budget_rate     || '',
      end_date:        exp.end_date ? exp.end_date.split('T')[0] : '',
      description:     exp.description     || '',
      reference:       exp.reference       || '',
    })
    setEditingExp({ ...exp, company_id: companyId })
  }

  const saveEditExposure = async () => {
    setEditSaving(true)
    const [from, to] = editForm.pair.split('/')
    try {
      const r = await fetch(`${API_BASE}/api/exposure-data/exposures/${editingExp.id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          from_currency:   from,
          to_currency:     to,
          amount:          parseFloat(editForm.amount),
          instrument_type: editForm.instrument_type,
          exposure_type:   editForm.exposure_type,
          budget_rate:     editForm.budget_rate ? parseFloat(editForm.budget_rate) : null,
          end_date:        editForm.end_date || null,
          description:     editForm.description,
          reference:       editForm.reference,
        })
      })
      if (r.ok) {
        toast.show('success', `${editForm.pair} updated`)
        setEditingExp(null)
        loadExposures(editingExp.company_id)
      } else {
        const d = await r.json()
        toast.show('error', d.detail || 'Update failed')
      }
    } catch { toast.show('error', 'Network error') }
    finally { setEditSaving(false) }
  }

  const deleteExposure = async (exposureId, companyId, pair) => {
    if (!window.confirm(`Delete ${pair} exposure?`)) return
    try {
      const r = await fetch(`${API_BASE}/api/admin/exposures/${exposureId}`, { method: 'DELETE', headers: authHeaders() })
      if (r.ok) { toast.show('success', `${pair} deleted`); loadExposures(companyId); loadCompanies() }
    } catch { toast.show('error', 'Network error') }
  }

  if (loading) return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: GOLD }} /></div>

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreateCompany(!showCreateCompany)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={btnPrimary}>
          <Plus size={14} /> New Company
        </button>
      </div>

      {showCreateCompany && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h3 className="font-semibold text-sm mb-4" style={{ color: NAVY }}>New Company</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Field label="Company Name"><input className={inputClass} placeholder="Acme Corp Ltd" value={companyForm.name} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} /></Field>
            <Field label="Base Currency"><select className={inputClass} value={companyForm.base_currency} onChange={e => setCompanyForm({ ...companyForm, base_currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Monthly FX Volume" hint="Used to calibrate risk"><input type="number" className={inputClass} placeholder="5000000" value={companyForm.trading_volume_monthly} onChange={e => setCompanyForm({ ...companyForm, trading_volume_monthly: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCreateCompany(false)} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
            <button onClick={createCompany} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50" style={btnPrimary}>{saving ? 'Creating…' : 'Create Company'}</button>
          </div>
        </div>
      )}

      {/* Edit Exposure Modal */}
      {editingExp && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="px-6 py-5" style={{ background: NAVY }}>
              <h2 className="text-base font-bold text-white">Edit Exposure</h2>
              <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>{editingExp.pair} · ID {editingExp.id}</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-5">
                <Field label="Currency Pair">
                  <select className={inputClass} value={editForm.pair} onChange={e => setEditForm({ ...editForm, pair: e.target.value })}>
                    {CURRENCY_PAIRS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Amount">
                  <input type="number" className={inputClass} value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} />
                </Field>
                <Field label="Instrument">
                  <select className={inputClass} value={editForm.instrument_type} onChange={e => setEditForm({ ...editForm, instrument_type: e.target.value })}>
                    <option>Forward</option><option>Spot</option><option>Option</option><option>NDF</option><option>Swap</option>
                  </select>
                </Field>
                <Field label="Type">
                  <select className={inputClass} value={editForm.exposure_type} onChange={e => setEditForm({ ...editForm, exposure_type: e.target.value })}>
                    <option value="payable">Payable</option>
                    <option value="receivable">Receivable</option>
                  </select>
                </Field>
                <Field label="Budget Rate" hint="Optional">
                  <input type="number" step="0.0001" className={inputClass} placeholder="1.0850" value={editForm.budget_rate} onChange={e => setEditForm({ ...editForm, budget_rate: e.target.value })} />
                </Field>
                <Field label="Maturity Date" hint="Optional">
                  <input type="date" className={inputClass} value={editForm.end_date} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })} />
                </Field>
                <Field label="Reference" className="col-span-2" hint="Optional">
                  <input className={inputClass} placeholder="e.g. INV-2024-001" value={editForm.reference} onChange={e => setEditForm({ ...editForm, reference: e.target.value })} />
                </Field>
                <Field label="Description" className="col-span-2" hint="Optional">
                  <input className={inputClass} placeholder="e.g. Q2 supplier payment" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                </Field>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setEditingExp(null)} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                <button onClick={saveEditExposure} disabled={editSaving} className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50" style={btnPrimary}>
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Demo reset confirmation modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4">
            <div className="px-6 py-5" style={{ background: NAVY }}>
              <h2 className="text-base font-bold text-white">Reset Demo Data</h2>
              <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>This will replace all existing exposures</p>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-1">
                Reset <span className="font-semibold" style={{ color: NAVY }}>{resetTarget.name}</span> to the standard demo dataset?
              </p>
              <p className="text-xs text-gray-400 mb-6">
                All existing exposures and tranches will be archived. 7 curated seed exposures (~EUR 41M) will be loaded fresh.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setResetTarget(null)} disabled={resetLoading} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg disabled:opacity-50">Cancel</button>
                <button onClick={performReset} disabled={resetLoading} className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: NAVY }}>
                  {resetLoading ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />Resetting…</> : <><RotateCcw size={14} />Reset Demo</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4">
            <div className="px-6 py-5" style={{ background: NAVY }}>
              <h2 className="text-base font-bold text-white">Deactivate Company</h2>
              <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>This action cannot be undone</p>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-1">
                Are you sure you want to deactivate <span className="font-semibold" style={{ color: NAVY }}>{deleteTarget.name}</span>?
              </p>
              <p className="text-xs text-gray-400 mb-6">All users and exposures will be deactivated. Financial records are preserved.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                <button onClick={confirmDelete} className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-red-500 hover:bg-red-600 transition-colors">Deactivate</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {companies.map(company => (
          <div key={company.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-all" onClick={() => toggleExpand(company.id)}>
              <div className="flex items-center gap-3">
                {expandedId === company.id ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <div>
                  {renamingId === company.id ? (
                    // Inline rename input — click on row still propagates, stop it here
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        className="px-2 py-1 border border-blue-300 rounded text-sm font-semibold focus:outline-none"
                        style={{ color: NAVY, minWidth: 180 }}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameCompany(company.id); if (e.key === 'Escape') setRenamingId(null) }}
                      />
                      <button onClick={() => renameCompany(company.id)} disabled={renameSaving} className="px-2 py-1 text-xs font-semibold text-white rounded disabled:opacity-50" style={{ background: NAVY }}>
                        {renameSaving ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setRenamingId(null)} className="px-2 py-1 text-xs text-gray-400 border border-gray-200 rounded">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm" style={{ color: NAVY }}>{company.name}</p>
                      {company.is_demo && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">demo</span>}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{company.base_currency} · {company.exposure_count} exposure{company.exposure_count !== 1 ? 's' : ''} · {company.user_count} user{company.user_count !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {/* Pencil / rename */}
                  <button
                    onClick={() => { setRenamingId(company.id); setRenameValue(company.name) }}
                    className="p-2 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                    title="Rename"
                  ><Edit2 size={15} /></button>
                  {/* Reset — only shown on demo companies */}
                  {company.is_demo && (
                    <button
                      onClick={() => setResetTarget({ id: company.id, name: company.name })}
                      className="p-2 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                      title="Reset demo data"
                    ><RotateCcw size={15} /></button>
                  )}
                  {/* Delete — not available for demo companies */}
                  {!company.is_demo && (
                    <button
                      onClick={() => setDeleteTarget({ id: company.id, name: company.name })}
                      className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Deactivate"
                    ><Trash2 size={15} /></button>
                  )}
                </div>
              )}
            </div>

            {expandedId === company.id && (
              <div className="border-t border-gray-100 px-5 py-4" style={{ background: '#F8F9FC' }}>
                {(exposuresByCompany[company.id] || []).length === 0
                  ? <p className="text-xs text-gray-400 mb-3">No exposures yet</p>
                  : (
                    <div className="mb-4 space-y-2">
                      {(exposuresByCompany[company.id] || []).map(exp => (
                        <div key={exp.id} className="flex items-center justify-between bg-white px-4 py-2.5 rounded-lg border border-gray-100">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(201,168,108,0.1)', color: GOLD }}>{exp.pair}</span>
                            <span className="text-sm font-semibold" style={{ color: NAVY }}>{Number(exp.amount).toLocaleString()}</span>
                            <span className="text-xs text-gray-400">{exp.instrument_type}</span>
                            {exp.budget_rate && <span className="text-xs text-gray-400">Budget: {exp.budget_rate}</span>}
                            {exp.end_date && <span className="text-xs text-gray-400">Matures: {new Date(exp.end_date).toLocaleDateString()}</span>}
                            {exp.description && <span className="text-xs text-gray-400 italic">{exp.description}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditExposure(exp, company.id)} className="p-1.5 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all" title="Edit"><Edit2 size={13} /></button>
                            <button onClick={() => deleteExposure(exp.id, company.id, exp.pair)} className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }

                {showAddExposure === company.id ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: NAVY }}>Add Exposure</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <Field label="Currency Pair"><select className={inputClass} value={expForm.pair} onChange={e => setExpForm({ ...expForm, pair: e.target.value })}>{CURRENCY_PAIRS.map(p => <option key={p}>{p}</option>)}</select></Field>
                      <Field label="Amount"><input type="number" className={inputClass} placeholder="1000000" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} /></Field>
                      <Field label="Instrument"><select className={inputClass} value={expForm.instrument_type} onChange={e => setExpForm({ ...expForm, instrument_type: e.target.value })}><option>Forward</option><option>Spot</option><option>Option</option><option>NDF</option><option>Swap</option></select></Field>
                      <Field label="Type"><select className={inputClass} value={expForm.exposure_type} onChange={e => setExpForm({ ...expForm, exposure_type: e.target.value })}><option value="payable">Payable</option><option value="receivable">Receivable</option></select></Field>
                      <Field label="Budget Rate" hint="Optional"><input type="number" step="0.0001" className={inputClass} placeholder="1.0850" value={expForm.budget_rate} onChange={e => setExpForm({ ...expForm, budget_rate: e.target.value })} /></Field>
                      <Field label="Maturity Date" hint="Optional"><input type="date" className={inputClass} value={expForm.end_date} onChange={e => setExpForm({ ...expForm, end_date: e.target.value })} /></Field>
                      <Field label="Description" className="md:col-span-2" hint="Optional"><input className={inputClass} placeholder="e.g. Q2 supplier payment" value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} /></Field>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddExposure(null)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                      <button onClick={() => addExposure(company.id)} disabled={saving} className="px-4 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={btnPrimary}>{saving ? 'Adding…' : 'Add Exposure'}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddExposure(company.id)} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-all">
                    <Plus size={13} /> Add Exposure
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── UsersTab — password removed, system generates it and emails customer ──
function UsersTab({ authUser, toast }) {
  const { selectedCompanyId } = useCompany()
  const isSuperAdmin = ['superadmin', 'admin'].includes(authUser?.role)

  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Default company_id from context so the form pre-selects the company currently being viewed
  const [form, setForm] = useState({ email: '', company_id: selectedCompanyId || authUser?.company_id || '', role: 'viewer' })

  // Keep form in sync when admin switches company in the top-nav selector
  useEffect(() => {
    if (selectedCompanyId) setForm(f => ({ ...f, company_id: selectedCompanyId }))
  }, [selectedCompanyId])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [uRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/users`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/companies`, { headers: authHeaders() }).then(r => r.json())
      ])
      setUsers(uRes.users || [])
      setCompanies(cRes.companies || [])
    } catch { toast.show('error', 'Failed to load') }
    finally { setLoading(false) }
  }

  const createUser = async () => {
    if (!form.email) { toast.show('error', 'Email required'); return }
    setSaving(true)
    try {
      const r = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(form)
      })
      const data = await r.json()
      if (r.ok) {
        toast.show('success', `${form.email} created — welcome email sent`)
        // Reset to the currently-viewed company, not always company[0]
        setForm({ email: '', company_id: selectedCompanyId || companies[0]?.id || '', role: 'viewer' })
        loadData()
      } else {
        toast.show('error', data.detail || 'Failed')
      }
    } catch { toast.show('error', 'Network error') }
    finally { setSaving(false) }
  }

  const deleteUser = async (userId, email) => {
    if (email === authUser.email) { toast.show('error', "Can't delete your own account"); return }
    if (!window.confirm(`Delete ${email}?`)) return
    try {
      const r = await fetch(`${API_BASE}/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() })
      if (r.ok) { toast.show('success', `${email} deleted`); loadData() }
      else { const d = await r.json(); toast.show('error', d.detail || 'Delete failed') }
    } catch { toast.show('error', 'Network error') }
  }

  // Friendly display labels for roles
  const roleLabel = (role) => {
    if (role === 'superadmin') return 'super admin'
    if (role === 'admin')      return 'company admin'
    return 'viewer'
  }
  const roleBadgeClass = (role) => {
    if (role === 'superadmin') return 'bg-red-50 text-red-600'
    if (role === 'admin')      return 'bg-purple-50 text-purple-600'
    return 'bg-gray-100 text-gray-500'
  }

  if (loading) return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: GOLD }} /></div>

  return (
    <div>
      <Section icon={UserPlus} title="Create New User">
        <p className="text-xs text-gray-400 mb-5">
          A temporary password will be generated and emailed to the customer automatically.
          They can set their own password using "Forgot your password?" after first login.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <Field label="Email Address">
            <input type="email" className={inputClass} value={form.email}
              placeholder="cfo@clientcompany.com"
              onChange={e => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Company" hint={!isSuperAdmin ? 'Fixed to your company' : undefined}>
            <select className={inputClass} value={form.company_id}
              disabled={!isSuperAdmin}
              onChange={e => setForm({ ...form, company_id: parseInt(e.target.value) })}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Role" hint="Super Admin role is never assignable here — set in DB only">
            <select className={inputClass} value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="viewer">Viewer — read and operate</option>
              <option value="admin">Company Admin — manage users and settings</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end">
          <button onClick={createUser} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            style={btnPrimary}>
            <UserPlus size={14} />{saving ? 'Creating…' : 'Create & Send Welcome Email'}
          </button>
        </div>
      </Section>

      <Section icon={Users} title={`Active Users (${users.length})`}>
        {users.length === 0
          ? <p className="text-sm text-gray-400 text-center py-4">No users yet</p>
          : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100" style={{ background: '#F8F9FC' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: NAVY }}>{u.email}</p>
                      {u.email === authUser.email && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,108,0.15)', color: GOLD }}>You</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadgeClass(u.role)}`}>
                        {roleLabel(u.role)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{u.company_name} · {new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                  {u.email !== authUser.email && (
                    <button onClick={() => deleteUser(u.id, u.email)} className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={15} /></button>
                  )}
                </div>
              ))}
            </div>
          )
        }
      </Section>
    </div>
  )
}

export default function Admin({ authUser }) {
  const [tab, setTab] = useState('companies')
  const toast = useToast()

  return (
    <div className="max-w-4xl mx-auto">
      {toast.Toast}
      <div className="rounded-xl p-6 mb-6" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Admin</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>Manage pilot companies, exposures and user accounts</p>
      </div>
      <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
        {[{ id: 'companies', label: 'Companies', Icon: Building2 }, { id: 'users', label: 'Users', Icon: Users }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === t.id ? NAVY : 'transparent', color: tab === t.id ? GOLD : '#6B7280' }}>
            <t.Icon size={14} />{t.label}
          </button>
        ))}
      </div>
      {tab === 'companies' && <CompaniesTab toast={toast} authUser={authUser} />}
      {tab === 'users' && <UsersTab authUser={authUser} toast={toast} />}
    </div>
  )
}