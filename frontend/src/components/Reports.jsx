import React, { useState, useEffect } from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { Download, FileText, Clock, CheckCircle, AlertTriangle, Calendar, TrendingUp } from 'lucide-react'
import { NAVY, GOLD } from '../brand'

const API_BASE = 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
    <div className="px-6 py-4 flex items-center gap-3" style={{ background: NAVY }}>
      <Icon size={16} color={GOLD} />
      <h3 className="font-semibold text-white text-sm">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

const ComingSoon = ({ icon: Icon, title, description }) => (
  <div className="flex items-center justify-between py-4 border border-dashed border-gray-200 rounded-xl px-5">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: 'rgba(26,39,68,0.06)' }}>
        <Icon size={16} color={NAVY} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: NAVY }}>{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
    <span className="text-xs px-3 py-1 rounded-full font-semibold"
      style={{ background: 'rgba(201,168,108,0.12)', color: GOLD }}>
      Coming soon
    </span>
  </div>
)

export default function Reports() {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId || 1

  const [downloading, setDownloading] = useState(false)
  const [orders, setOrders]           = useState([])
  const [auditLog, setAuditLog]       = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)

  useEffect(() => {
    if (companyId) loadReportData()
  }, [companyId])

  const loadReportData = async () => {
    setLoadingOrders(true)
    try {
      const [ordersRes, auditRes] = await Promise.all([
        fetch(`${API_BASE}/api/audit/orders?company_id=${companyId}`, { headers: authHeaders() })
          .then(r => r.ok ? r.json() : { orders: [] }),
        fetch(`${API_BASE}/api/audit/value-date-changes?company_id=${companyId}`, { headers: authHeaders() })
          .then(r => r.ok ? r.json() : { changes: [] })
      ])
      setOrders(ordersRes.orders || [])
      setAuditLog(auditRes.changes || [])
    } catch (e) {
      console.error('Failed to load report data', e)
    } finally {
      setLoadingOrders(false)
    }
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const response = await fetch(
        `${API_BASE}/api/reports/currency-plan?company_id=${companyId}`,
        { headers: authHeaders() }
      )
      if (!response.ok) throw new Error('Failed')
      const blob = await response.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `currency-plan-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Failed to generate report. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-0">

      {/* Page header */}
      <div className="rounded-xl p-6 mb-6" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Reports</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Download your currency plan and review execution history
        </p>
      </div>

      {/* Currency Plan */}
      <Section icon={FileText} title="Automated Currency Plan">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: NAVY }}>
              Full Currency Plan PDF
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Your complete hedging recommendations, exposure register, and policy summary
            </p>
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0"
            style={{ background: NAVY }}>
            <Download size={14} />
            {downloading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </Section>

      {/* Execution History */}
      <Section icon={CheckCircle} title="Execution History">
        {loadingOrders ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto" style={{ borderColor: GOLD }} />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No orders sent yet.</p>
            <p className="text-xs text-gray-300 mt-1">
              Orders appear here once you use Execute with Bank on the Hedging tab.
            </p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-50">
            {orders.map((order, i) => (
              <div key={i} className="py-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {order.action || order.currency_pair}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {order.order_type === 'limit' ? 'Limit Order' : 'Immediate Execution'} ·{' '}
                    {order.instrument} · Value date {order.value_date || '—'}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">
                    Sent by {order.sent_by}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs text-gray-400">{formatDate(order.sent_at)}</p>
                  {order.executed_at ? (
                    <span className="text-xs font-semibold text-green-600">✓ Executed</span>
                  ) : (
                    <span className="text-xs text-amber-500">Pending confirmation</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Audit Log */}
      <Section icon={AlertTriangle} title="Audit Log — Value Date Changes">
        {loadingOrders ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto" style={{ borderColor: GOLD }} />
          </div>
        ) : auditLog.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No value date changes recorded.</p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-50">
            {auditLog.map((log, i) => (
              <div key={i} className="py-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>
                    {log.currency_pair}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {log.original_date} → {log.new_date}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 italic">
                    "{log.reason}"
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs text-gray-400">{formatDate(log.changed_at)}</p>
                  <p className="text-xs text-gray-300">{log.changed_by}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Coming Soon */}
      <Section icon={TrendingUp} title="Coming Soon">
        <div className="space-y-3">
          <ComingSoon
            icon={TrendingUp}
            title="P&L Report"
            description="Realised and unrealised P&L vs budget rate across all exposures and periods"
          />
          <ComingSoon
            icon={CheckCircle}
            title="Hedge Effectiveness Report"
            description="How well your hedges protected against actual market moves"
          />
          <ComingSoon
            icon={Calendar}
            title="Maturity Schedule"
            description="All upcoming hedge maturities with renewal recommendations"
          />
          <ComingSoon
            icon={Clock}
            title="Historical Exposure Report"
            description="Full audit trail of all exposures, changes, and executions over time"
          />
        </div>
      </Section>

    </div>
  )
}
