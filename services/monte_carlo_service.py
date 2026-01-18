"""
Monte Carlo Simulation Service for FX Risk Analysis
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional
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
    
    def __init__(self, default_scenarios: int = 10000):
        self.default_scenarios = default_scenarios
    
    def estimate_volatility_from_pair(self, currency_pair: str) -> float:
        major_pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD']
        em_pairs = ['USDBRL', 'USDMXN', 'USDZAR', 'USDINR', 'USDTRY']
        commodity_pairs = ['AUDUSD', 'NZDUSD', 'USDCAD', 'USDNOK']
        
        pair_upper = currency_pair.upper()
        
        if pair_upper in major_pairs:
            return 0.08
        elif any(em in pair_upper for em in ['BRL', 'MXN', 'ZAR', 'INR', 'TRY']):
            return 0.15
        elif any(comm in pair_upper for comm in ['AUD', 'NZD', 'CAD', 'NOK']):