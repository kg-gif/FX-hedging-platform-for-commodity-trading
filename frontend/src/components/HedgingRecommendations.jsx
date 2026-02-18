
import React from 'react'

const DEMO_RECOMMENDATIONS = [
  {
    id: 1,
    currency_pair: "EUR/USD",
    action: "Hedge EUR 1,750,000",
    current_hedge: "50%",
    target_ratio: "85%",
    instrument: "3-month Forward",
    urgency: "HIGH",
    reason: "Policy target: 85% hedge for exposures >$5M",
    estimated_cost: "$8,750"
  },
  {
    id: 2,
    currency_pair: "EUR/USD", 
    action: "Hedge EUR 1,500,000",
    current_hedge: "20%",
    target_ratio: "70%",
    instrument: "3-month Forward",
    urgency: "HIGH",
    reason: "Policy target: 70% hedge for exposures $1-5M",
    estimated_cost: "$7,500"
  },
  {
    id: 3,
    currency_pair: "GBP/USD",
    action: "Hedge GBP 750,000",
    current_hedge: "60%",
    target_ratio: "85%",
    instrument: "Forward",
    urgency: "MEDIUM",
    reason: "Policy target: 85% hedge for exposures >$5M",
    estimated_cost: "$4,125"
  },
  {
    id: 4,
    currency_pair: "CAD/USD",
    action: "Hedge CAD 750,000",
    current_hedge: "20%",
    target_ratio: "70%",
    instrument: "Forward",
    urgency: "MEDIUM",
    reason: "Policy target: 70% hedge for exposures $1-5M",
    estimated_cost: "$2,850"
  },
  {
    id: 5,
    currency_pair: "JPY/USD",
    action: "Hedge JPY 250,000,000",
    current_hedge: "80%",
    target_ratio: "85%",
    instrument: "Forward",
    urgency: "LOW",
    reason: "Policy target: 85% hedge for exposures >$5M",
    estimated_cost: "$1,250"
  }
]

function HedgingRecommendations() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 border border-indigo-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">📋 Hedge Recommendations</h2>
        <p className="text-gray-600">Based on your Conservative policy (85% target for large exposures)</p>
      </div>

      {/* Recommendations */}
      <div className="space-y-4">
        {DEMO_RECOMMENDATIONS.map((rec) => (
          <div 
            key={rec.id}
            className="bg-white rounded-lg shadow-md p-6 border-l-4 hover:shadow-lg transition-shadow"
            style={{
              borderLeftColor: rec.urgency === 'HIGH' ? '#ef4444' : rec.urgency === 'MEDIUM' ? '#f59e0b' : '#10b981'
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xl font-bold text-gray-800">{rec.action}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    rec.urgency === 'HIGH' ? 'bg-red-100 text-red-800' :
                    rec.urgency === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {rec.urgency} PRIORITY
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Currency Pair</p>
                    <p className="font-semibold text-gray-800">{rec.currency_pair}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Current Hedge</p>
                    <p className="font-semibold text-gray-800">{rec.current_hedge}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Target Hedge</p>
                    <p className="font-semibold text-blue-600">{rec.target_ratio}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Instrument</p>
                    <p className="font-semibold text-gray-800">{rec.instrument}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-700">{rec.reason}</p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Estimated Cost</p>
                    <p className="text-lg font-bold text-gray-800">{rec.estimated_cost}</p>
                  </div>
                  <a 
                    href={`https://wise.com/send/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Execute with Bank →
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Note */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <p className="text-sm text-gray-700">
          💡 <strong>Note:</strong> These recommendations are based on your active Conservative policy. 
          Actual execution should be confirmed with your bank or FX provider.
        </p>
      </div>
    </div>
  )
}

export default HedgingRecommendations
