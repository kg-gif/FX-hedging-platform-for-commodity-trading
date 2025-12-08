import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Main Birk Dashboard Component
function BirkDashboard() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [exposures, setExposures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // Fetch companies on load
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Fetch exposures when company changes
  useEffect(() => {
    if (selectedCompany) {
      fetchExposures(selectedCompany.id);
    }
  }, [selectedCompany]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/companies`);
      if (!response.ok) throw new Error('Failed to fetch companies');
      const data = await response.json();
      setCompanies(data);
      if (data.length > 0) setSelectedCompany(data[0]);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchExposures = async (companyId) => {
    try {
      const response = await fetch(`${API_URL}/companies/${companyId}/exposures`);
      if (!response.ok) throw new Error('Failed to fetch exposures');
      const data = await response.json();
      setExposures(data);
    } catch (err) {
      console.error('Error fetching exposures:', err);
      setExposures([]);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const calculateTotalExposure = () => {
    return exposures.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  };

  const getRiskLevel = (exposure) => {
    const volatility = exposure.volatility || 0;
    if (volatility > 15) return { level: 'High', color: '#ef4444' };
    if (volatility > 8) return { level: 'Medium', color: '#f59e0b' };
    return { level: 'Low', color: '#10b981' };
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading Birk Dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <h2>Error</h2>
          <p>{error}</p>
          <p style={{ fontSize: '14px', marginTop: '10px' }}>
            Make sure the API is running at: {API_URL}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>🌾 Birk</h1>
          <p style={styles.subtitle}>FX Risk Management Platform</p>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Company Selector */}
        <div style={styles.card}>
          <label style={styles.label}>Select Company:</label>
          <select
            style={styles.select}
            value={selectedCompany?.id || ''}
            onChange={(e) => {
              const company = companies.find(c => c.id === parseInt(e.target.value));
              setSelectedCompany(company);
            }}
          >
            {companies.map(company => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {selectedCompany && (
          <>
            {/* Summary Cards */}
            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Total Exposure</div>
                <div style={styles.summaryValue}>
                  {formatCurrency(calculateTotalExposure())}
                </div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Number of Positions</div>
                <div style={styles.summaryValue}>{exposures.length}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Base Currency</div>
                <div style={styles.summaryValue}>{selectedCompany.base_currency}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>Company Type</div>
                <div style={styles.summaryValue}>
                  {selectedCompany.company_type?.replace('_', ' ').toUpperCase() || 'N/A'}
                </div>
              </div>
            </div>

            {/* Exposures List */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>FX Exposures</h2>
              {exposures.length === 0 ? (
                <p style={styles.emptyState}>No exposures found for this company.</p>
              ) : (
                <div style={styles.table}>
                  <div style={styles.tableHeader}>
                    <div style={styles.tableCell}>Currency Pair</div>
                    <div style={styles.tableCell}>Amount</div>
                    <div style={styles.tableCell}>Settlement</div>
                    <div style={styles.tableCell}>Risk Level</div>
                    <div style={styles.tableCell}>Description</div>
                  </div>
                  {exposures.map(exposure => {
                    const risk = getRiskLevel(exposure);
                    return (
                      <div key={exposure.id} style={styles.tableRow}>
                        <div style={styles.tableCell}>
                          <strong>{exposure.from_currency}/{exposure.to_currency}</strong>
                        </div>
                        <div style={styles.tableCell}>
                          {formatCurrency(exposure.amount)}
                        </div>
                        <div style={styles.tableCell}>
                          {exposure.settlement_period?.replace('_', ' ') || 'N/A'}
                        </div>
                        <div style={styles.tableCell}>
                          <span style={{
                            ...styles.badge,
                            backgroundColor: risk.color,
                          }}>
                            {risk.level}
                          </span>
                        </div>
                        <div style={styles.tableCell}>
                          {exposure.description || 'No description'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Risk Analysis */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Risk Analysis</h2>
              <div style={styles.riskGrid}>
                {exposures.slice(0, 4).map(exposure => {
                  const risk = getRiskLevel(exposure);
                  return (
                    <div key={exposure.id} style={styles.riskCard}>
                      <div style={styles.riskPair}>
                        {exposure.from_currency}/{exposure.to_currency}
                      </div>
                      <div style={styles.riskAmount}>
                        {formatCurrency(exposure.amount)}
                      </div>
                      <div style={styles.riskMetric}>
                        <span style={{ color: '#6b7280' }}>Volatility:</span>
                        <span style={{ color: risk.color, fontWeight: 'bold' }}>
                          {(exposure.volatility || 0).toFixed(2)}%
                        </span>
                      </div>
                      {exposure.var_95 && (
                        <div style={styles.riskMetric}>
                          <span style={{ color: '#6b7280' }}>VaR (95%):</span>
                          <span>{formatCurrency(exposure.var_95)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* API Status */}
        <div style={styles.footer}>
          <div style={styles.statusDot}></div>
          <span style={styles.statusText}>Connected to {API_URL}</span>
        </div>
      </main>
    </div>
  );
}

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    backgroundColor: '#1f2937',
    color: 'white',
    padding: '2rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  title: {
    fontSize: '2rem',
    margin: 0,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: '1rem',
    margin: '0.5rem 0 0 0',
    color: '#9ca3af',
  },
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
    color: '#1f2937',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  select: {
    width: '100%',
    padding: '0.5rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  summaryLabel: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '0.5rem',
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  table: {
    width: '100%',
    overflowX: 'auto',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr',
    gap: '1rem',
    padding: '0.75rem',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '0.875rem',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr',
    gap: '1rem',
    padding: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
    alignItems: 'center',
  },
  tableCell: {
    fontSize: '0.875rem',
    color: '#1f2937',
  },
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'white',
  },
  riskGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
  },
  riskCard: {
    padding: '1rem',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  },
  riskPair: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '0.5rem',
  },
  riskAmount: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: '0.5rem',
  },
  riskMetric: {
    fontSize: '0.875rem',
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '1.5rem',
    color: '#6b7280',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
    color: '#ef4444',
  },
  emptyState: {
    textAlign: 'center',
    color: '#6b7280',
    padding: '2rem',
    fontSize: '1rem',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    marginRight: '0.5rem',
  },
  statusText: {
    fontSize: '0.875rem',
  },
};

// Initialize app
const root = createRoot(document.getElementById('root'));
root.render(<BirkDashboard />);
