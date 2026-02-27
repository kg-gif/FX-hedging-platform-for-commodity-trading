import React, { useState, useEffect } from 'react'
import { UserPlus, Users, Trash2, CheckCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { NAVY, GOLD } from '../brand'

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

export default function Admin({ authUser }) {
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  // New user form
  const [form, setForm] = useState({
    email: '',
    password: '',
    company_id: 1,
    role: 'viewer',
    admin_secret: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, companiesRes] = await Promise.all([
        fetch(`${API_BASE}/api/auth/users`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        }).then(r => r.json()),
        fetch(`${API_BASE}/companies`).then(r => r.json())
      ])
      setUsers(usersRes.users || [])
      setCompanies(Array.isArray(companiesRes) ? companiesRes : [])
    } catch (e) {
      showMsg('error', 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const createUser = async () => {
    if (!form.email || !form.password || !form.admin_secret) {
      showMsg('error', 'Please fill in all fields including Admin Secret')
      return
    }
    if (form.password.length < 8) {
      showMsg('error', 'Password must be at least 8 characters')
      return
    }

    setCreating(true)
    try {
      const r = await fetch(`${API_BASE}/api/auth/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await r.json()
      if (r.ok) {
        showMsg('success', `User ${form.email} created for ${data.company}`)
        setForm({ email: '', password: '', company_id: 1, role: 'viewer', admin_secret: form.admin_secret })
        loadData()
      } else {
        showMsg('error', data.detail || 'Failed to create user')
      }
    } catch {
      showMsg('error', 'Network error')
    } finally {
      setCreating(false)
    }
  }

  const deleteUser = async (userId, email) => {
    if (email === authUser.email) {
      showMsg('error', "You can't delete your own account")
      return
    }
    if (!window.confirm(`Delete user ${email}? This cannot be undone.`)) return

    try {
      const r = await fetch(`${API_BASE}/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      })
      if (r.ok) {
        showMsg('success', `User ${email} deleted`)
        loadData()
      } else {
        showMsg('error', 'Failed to delete user')
      }
    } catch {
      showMsg('error', 'Network error')
    }
  }

  if (loading) return (
    <div className="text-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto" style={{ borderColor: GOLD }}></div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">

      {/* Toast */}
      {message && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="rounded-xl p-6 mb-6" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Admin</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Manage pilot customer accounts — visible to admin only
        </p>
      </div>

      {/* Create user */}
      <Section icon={UserPlus} title="Create New User">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <Field label="Email Address">
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="cfo@clientcompany.com"
            />
          </Field>

          <Field label="Password" hint="Minimum 8 characters">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className={inputClass}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field label="Company">
            <select
              className={inputClass}
              value={form.company_id}
              onChange={e => setForm({ ...form, company_id: parseInt(e.target.value) })}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name} (ID: {c.id})</option>
              ))}
            </select>
          </Field>

          <Field label="Role">
            <select
              className={inputClass}
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="viewer">Viewer — can view dashboard only</option>
              <option value="admin">Admin — full access including this page</option>
            </select>
          </Field>

          <Field label="Admin Secret" hint="Set in your Render environment variables">
            <input
              type="password"
              className={inputClass}
              value={form.admin_secret}
              onChange={e => setForm({ ...form, admin_secret: e.target.value })}
              placeholder="Your ADMIN_SECRET value"
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <button
            onClick={createUser}
            disabled={creating}
            className="flex items-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: NAVY }}
          >
            <UserPlus size={14} />
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </Section>

      {/* Existing users */}
      <Section icon={Users} title={`Active Users (${users.length})`}>
        {users.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No users found</p>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div
                key={u.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100"
                style={{ background: '#F8F9FC' }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>{u.email}</p>
                    {u.email === authUser.email && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,108,0.15)', color: GOLD }}>
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {u.company_name} · {u.role} · Created {new Date(u.created_at).toLocaleDateString()}
                  </p>
                </div>
                {u.email !== authUser.email && (
                  <button
                    onClick={() => deleteUser(u.id, u.email)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Delete user"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
