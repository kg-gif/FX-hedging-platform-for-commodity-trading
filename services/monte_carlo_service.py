import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
class RiskMetric(str, Enum):
VAR_95 = "var_95"
VAR_99 = "var_99"
EXPECTED_LOSS = "expected_loss"
MAX_LOSS = "max_loss"
MAX_GAIN = "max_gain"
PROBABILITY_LOSS = "prob_loss"
@dataclass
class SimulationResult:
"""Result of Monte Carlo simulation for a single exposure"""
exposure_id: int
currency_pair: str
current_rate: float
amount: float
num_scenarios: int
time_horizon_days: int
volatility: float
simulated_rates: List[float]
simulated_values_usd: List[float]
simulated_pnl: List[float]
var_95: float
var_99: float
expected_loss: float
max_loss: float
max_gain: float
probability_of_loss: float
percentile_5: float
percentile_25: float
percentile_50: float
percentile_75: float
percentile_95: float
class MonteCarloService:
"""
Monte Carlo simulation engine for FX exposure risk analysis
Uses Geometric Brownian Motion (GBM) to simulate future FX rate paths
"""
def __init__(self, default_scenarios: int = 10000):
    self.default_scenarios = default_scenarios

def estimate_volatility_from_pair(self, currency_pair: str) -> float:
    """Estimate volatility based on currency pair characteristics"""
    major_pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD']
    em_pairs = ['USDBRL', 'USDMXN', 'USDZAR', 'USDINR', 'USDTRY']
    commodity_pairs = ['AUDUSD', 'NZDUSD', 'USDCAD', 'USDNOK']
    
    pair_upper = currency_pair.upper()
    
    if pair_upper in major_pairs:
        return 0.08
    elif any(em in pair_upper for em in ['BRL', 'MXN', 'ZAR', 'INR', 'TRY']):
        return 0.15
    elif any(comm in pair_upper for comm in ['AUD', 'NZD', 'CAD', 'NOK']):
        return 0.12
    else:
        return 0.10

def run_simulation(
    self,
    current_rate: float,
    amount: float,
    time_horizon_days: int,
    volatility: Optional[float] = None,
    num_scenarios: Optional[int] = None,
    drift: float = 0.0,
    currency_pair: str = "UNKNOWN"
) -> Dict:
    """Run Monte Carlo simulation for a single exposure"""
    num_scenarios = num_scenarios or self.default_scenarios
    volatility = volatility or self.estimate_volatility_from_pair(currency_pair)
    
    dt = 1 / 252
    num_steps = time_horizon_days
    
    rate_paths = np.zeros((num_scenarios, num_steps + 1))
    rate_paths[:, 0] = current_rate
    
    np.random.seed(42)
    shocks = np.random.normal(0, 1, (num_scenarios, num_steps))
    
    for t in range(num_steps):
        rate_paths[:, t + 1] = rate_paths[:, t] * np.exp(
            (drift - 0.5 * volatility**2) * dt +
            volatility * np.sqrt(dt) * shocks[:, t]
        )
    
    final_rates = rate_paths[:, -1]
    initial_value_usd = amount * current_rate
    final_values_usd = amount * final_rates
    pnl = final_values_usd - initial_value_usd
    
    var_95 = np.percentile(pnl, 5)
    var_99 = np.percentile(pnl, 1)
    
    losses = pnl[pnl < 0]
    expected_loss = np.mean(losses) if len(losses) > 0 else 0.0
    
    max_loss = np.min(pnl)
    max_gain = np.max(pnl)
    probability_of_loss = len(losses) / num_scenarios
    
    percentile_5 = np.percentile(final_rates, 5)
    percentile_25 = np.percentile(final_rates, 25)
    percentile_50 = np.percentile(final_rates, 50)
    percentile_75 = np.percentile(final_rates, 75)
    percentile_95 = np.percentile(final_rates, 95)
    
    return {
        'simulation_params': {
            'current_rate': current_rate,
            'amount': amount,
            'time_horizon_days': time_horizon_days,
            'volatility': volatility,
            'num_scenarios': num_scenarios,
            'drift': drift,
            'currency_pair': currency_pair
        },
        'outcomes': {
            'simulated_rates': final_rates.tolist()[:100],
            'simulated_values_usd': final_values_usd.tolist()[:100],
            'simulated_pnl': pnl.tolist()[:100],
        },
        'risk_metrics': {
            'var_95': float(var_95),
            'var_99': float(var_99),
            'expected_loss': float(expected_loss),
            'max_loss': float(max_loss),
            'max_gain': float(max_gain),
            'probability_of_loss': float(probability_of_loss)
        },
        'distribution': {
            'mean_final_rate': float(np.mean(final_rates)),
            'std_final_rate': float(np.std(final_rates)),
            'percentile_5': float(percentile_5),
            'percentile_25': float(percentile_25),
            'percentile_50': float(percentile_50),
            'percentile_75': float(percentile_75),
            'percentile_95': float(percentile_95)
        },
        'summary': {
            'expected_rate': float(np.mean(final_rates)),
            'expected_value_usd': float(np.mean(final_values_usd)),
            'expected_pnl': float(np.mean(pnl)),
            'downside_risk_95': float(abs(var_95)),
            'upside_potential_95': float(max_gain * 0.95)
        }
    }

def run_portfolio_simulation(
    self,
    exposures: List[Dict],
    time_horizon_days: int = 90,
    num_scenarios: Optional[int] = None
) -> Dict:
    """Run Monte Carlo simulation for entire portfolio"""
    num_scenarios = num_scenarios or self.default_scenarios
    
    individual_results = []
    portfolio_pnl = np.zeros(num_scenarios)
    
    for exp in exposures:
        result = self.run_simulation(
            current_rate=exp['current_rate'],
            amount=exp['amount'],
            time_horizon_days=time_horizon_days,
            num_scenarios=num_scenarios,
            currency_pair=exp.get('currency_pair', 'UNKNOWN')
        )
        
        individual_results.append({
            'exposure_id': exp.get('id'),
            'currency_pair': exp.get('currency_pair'),
            'result': result
        })
        
        portfolio_pnl += np.array(result['outcomes']['simulated_pnl'])
    
    portfolio_var_95 = np.percentile(portfolio_pnl, 5)
    portfolio_var_99 = np.percentile(portfolio_pnl, 1)
    portfolio_max_loss = np.min(portfolio_pnl)
    portfolio_max_gain = np.max(portfolio_pnl)
    
    portfolio_losses = portfolio_pnl[portfolio_pnl < 0]
    portfolio_expected_loss = np.mean(portfolio_losses) if len(portfolio_losses) > 0 else 0.0
    portfolio_prob_loss = len(portfolio_losses) / num_scenarios
    
    return {
        'portfolio_metrics': {
            'total_exposures': len(exposures),
            'time_horizon_days': time_horizon_days,
            'num_scenarios': num_scenarios,
            'var_95': float(portfolio_var_95),
            'var_99': float(portfolio_var_99),
            'expected_loss': float(portfolio_expected_loss),
            'max_loss': float(portfolio_max_loss),
            'max_gain': float(portfolio_max_gain),
            'probability_of_loss': float(portfolio_prob_loss),
            'expected_pnl': float(np.mean(portfolio_pnl))
        },
        'distribution': {
            'mean': float(np.mean(portfolio_pnl)),
            'std': float(np.std(portfolio_pnl)),
            'percentile_5': float(np.percentile(portfolio_pnl, 5)),
            'percentile_25': float(np.percentile(portfolio_pnl, 25)),
            'percentile_50': float(np.percentile(portfolio_pnl, 50)),
            'percentile_75': float(np.percentile(portfolio_pnl, 75)),
            'percentile_95': float(np.percentile(portfolio_pnl, 95))
        },
        'individual_exposures': individual_results,
        'sample_portfolio_pnl': portfolio_pnl.tolist()[:100]
    }