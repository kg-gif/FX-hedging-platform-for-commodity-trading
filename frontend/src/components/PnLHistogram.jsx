import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer
} from 'recharts';

export default function PnLHistogram({ pnlData, riskMetrics }) {
  const histogramData = useMemo(() => {
    if (!pnlData || pnlData.length === 0) return [];

    // Create histogram bins
    const numBins = 30;
    const minPnL = Math.min(...pnlData);
    const maxPnL = Math.max(...pnlData);
    const binWidth = (maxPnL - minPnL) / numBins;

    // Initialize bins
    const bins = Array(numBins).fill(0).map((_, i) => ({
      binStart: minPnL + i * binWidth,
      binEnd: minPnL + (i + 1) * binWidth,
      count: 0
    }));

    // Fill bins
    pnlData.forEach(value => {
      const binIndex = Math.min(
        Math.floor((value - minPnL) / binWidth),
        numBins - 1
      );
      bins[binIndex].count++;
    });

    // Format for display
    return bins.map(bin => ({
      range: `${(bin.binStart / 1000).toFixed(0)}K`,
      count: bin.count,
      binMidpoint: (bin.binStart + bin.binEnd) / 2
    }));
  }, [pnlData]);

  const formatCurrency = (value) => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
      <h3 className="text-lg font-semibold mb-4">P&L Distribution</h3>
      
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={histogramData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="range" 
            label={{ value: 'P&L Range', position: 'insideBottom', offset: -5 }}
          />
          <YAxis 
            label={{ value: 'Frequency', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            formatter={(value) => [`${value} scenarios`, 'Count']}
            labelFormatter={(label) => `P&L: ${label}`}
          />
          <Legend />
          
          {/* Reference line at zero */}
          <ReferenceLine 
            x="0K" 
            stroke="red" 
            strokeDasharray="3 3" 
            label="Break-even"
          />
          
          {/* Reference line for VaR 95 */}
          {riskMetrics && (
            <ReferenceLine 
              x={`${(riskMetrics.var_95 / 1000).toFixed(0)}K`}
              stroke="orange" 
              strokeDasharray="3 3" 
              label="VaR 95%"
            />
          )}
          
          <Bar 
            dataKey="count" 
            fill="#3b82f6" 
            name="Scenarios"
          />
        </BarChart>
      </ResponsiveContainer>

      {riskMetrics && (
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Mean:</span>
            <span className="ml-2 font-semibold">
              {formatCurrency(riskMetrics.expected_pnl)}
            </span>
          </div>
          <div>
            <span className="text-gray-600">5th Percentile:</span>
            <span className="ml-2 font-semibold text-red-600">
              {formatCurrency(riskMetrics.var_95)}
            </span>
          </div>
          <div>
            <span className="text-gray-600">95th Percentile:</span>
            <span className="ml-2 font-semibold text-green-600">
              {formatCurrency(riskMetrics.max_gain * 0.95)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
