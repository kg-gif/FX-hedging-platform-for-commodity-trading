"""
BIRK FX Phase 2B - Hedging Service
Provides forward contract recommendations, scenario analysis, and P&L calculations
"""

import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import statistics


class HedgingService:
    """
    Service class for hedging recommendations and scenario analysis
    """
    
    # Standard hedge ratios to evaluate
    HEDGE_RATIOS = [0.25, 0.50, 0.75, 1.00]
    
    # Scenario rate movements (percentage changes)
    SCENARIOS = {
        'conservative': [-0.05, -0.03, 0, 0.03, 0.05],
        'moderate': [-0.10, -0.05, 0, 0.05, 0.10],
        'aggressive': [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15]
    }
    
    def __init__(self, db_connection=None):
        self.db = db_connection
        
    def calculate_optimal_hedge_ratio(
        self, 
        exposure_amount: float,
        current_rate: float,
        historical_volatility: float,
        time_horizon_days: int = 90,
        risk_tolerance: str = 'moderate'
    ) -> Dict:
        """
        Calculate optimal hedge ratio based on exposure and risk profile
        
        Args:
            exposure_amount: Total exposure in base currency
            current_rate: Current spot rate
            historical_volatility: Historical volatility (annualized %)
            time_horizon_days: Days until payment
            risk_tolerance: 'low', 'moderate', 'high'
            
        Returns:
            Dictionary with recommended hedge ratio and analysis
        """
        
        # Adjust volatility for time horizon
        time_factor = np.sqrt(time_horizon_days / 365)
        adjusted_volatility = historical_volatility * time_factor
        
        # Calculate potential loss at different confidence levels
        var_95 = current_rate * adjusted_volatility * 1.645  # 95% VaR
        var_99 = current_rate * adjusted_volatility * 2.326  # 99% VaR
        
        # Determine recommended hedge ratio based on risk tolerance
        if risk_tolerance == 'low':
            recommended_ratio = 1.0  # 100% hedge for low risk tolerance
            confidence_level = 99
        elif risk_tolerance == 'moderate':
            # Hedge enough to cover 95% VaR
            recommended_ratio = min(0.75, (var_95 * exposure_amount) / exposure_amount)
            confidence_level = 95
        else:  # high risk tolerance
            recommended_ratio = 0.5  # 50% hedge
            confidence_level = 90
            
        # Calculate expected costs/benefits for each hedge ratio
        hedge_analysis = []
        for ratio in self.HEDGE_RATIOS:
            analysis = self._analyze_hedge_ratio(
                ratio=ratio,
                exposure_amount=exposure_amount,
                current_rate=current_rate,
                adjusted_volatility=adjusted_volatility
            )
            hedge_analysis.append(analysis)
        
        return {
            'recommended_ratio': round(recommended_ratio, 2),
            'confidence_level': confidence_level,
            'var_95': round(var_95, 6),
            'var_99': round(var_99, 6),
            'time_horizon_days': time_horizon_days,
            'adjusted_volatility': round(adjusted_volatility, 4),
            'hedge_analysis': hedge_analysis,
            'rationale': self._generate_rationale(
                recommended_ratio, 
                risk_tolerance, 
                adjusted_volatility
            )
        }
    
    def _analyze_hedge_ratio(
        self,
        ratio: float,
        exposure_amount: float,
        current_rate: float,
        adjusted_volatility: float
    ) -> Dict:
        """
        Analyze a specific hedge ratio
        """
        hedged_amount = exposure_amount * ratio
        unhedged_amount = exposure_amount * (1 - ratio)
        
        # Calculate potential outcomes
        downside_move = current_rate * (1 - adjusted_volatility)
        upside_move = current_rate * (1 + adjusted_volatility)
        
        # P&L scenarios
        worst_case_pnl = (
            (hedged_amount * 0) +  # Hedged portion: no gain/loss
            (unhedged_amount * current_rate * -adjusted_volatility)  # Unhedged loss
        )
        
        best_case_pnl = (
            (hedged_amount * 0) +  # Hedged portion: no gain/loss
            (unhedged_amount * current_rate * adjusted_volatility)  # Unhedged gain
        )
        
        expected_pnl = (worst_case_pnl + best_case_pnl) / 2
        
        return {
            'ratio': ratio,
            'ratio_pct': f"{ratio * 100:.0f}%",
            'hedged_amount': round(hedged_amount, 2),
            'unhedged_amount': round(unhedged_amount, 2),
            'worst_case_pnl': round(worst_case_pnl, 2),
            'best_case_pnl': round(best_case_pnl, 2),
            'expected_pnl': round(expected_pnl, 2),
            'downside_protection': round(ratio * 100, 1)
        }
    
    def _generate_rationale(
        self,
        ratio: float,
        risk_tolerance: str,
        volatility: float
    ) -> str:
        """
        Generate human-readable rationale for recommendation
        """
        ratio_pct = int(ratio * 100)
        vol_pct = int(volatility * 100)
        
        if ratio >= 0.9:
            return (
                f"Full hedge ({ratio_pct}%) recommended due to {risk_tolerance} risk "
                f"tolerance and {vol_pct}% expected volatility. This provides maximum "
                f"protection against adverse rate movements."
            )
        elif ratio >= 0.65:
            return (
                f"Substantial hedge ({ratio_pct}%) recommended to balance protection "
                f"with flexibility. With {vol_pct}% volatility, this covers most "
                f"downside risk while allowing some upside participation."
            )
        elif ratio >= 0.4:
            return (
                f"Moderate hedge ({ratio_pct}%) recommended for balanced approach. "
                f"Provides partial protection against the {vol_pct}% expected "
                f"volatility while maintaining upside potential."
            )
        else:
            return (
                f"Minimal hedge ({ratio_pct}%) recommended due to high risk tolerance "
                f"and willingness to accept volatility exposure for potential gains."
            )
    
    def run_scenario_analysis(
        self,
        exposure_amount: float,
        current_rate: float,
        hedge_ratio: float = 0.0,
        scenario_type: str = 'moderate'
    ) -> Dict:
        """
        Run scenario analysis for different rate movements
        
        Args:
            exposure_amount: Total exposure in base currency
            current_rate: Current spot rate
            hedge_ratio: Current or proposed hedge ratio (0-1)
            scenario_type: 'conservative', 'moderate', or 'aggressive'
            
        Returns:
            Dictionary with scenario analysis results
        """
        
        scenarios = self.SCENARIOS.get(scenario_type, self.SCENARIOS['moderate'])
        results = []
        
        for rate_change in scenarios:
            new_rate = current_rate * (1 + rate_change)
            
            # Calculate P&L without hedge
            unhedged_pnl = exposure_amount * (new_rate - current_rate)
            
            # Calculate P&L with hedge
            hedged_amount = exposure_amount * hedge_ratio
            unhedged_amount = exposure_amount * (1 - hedge_ratio)
            
            # Hedged portion: locked at current_rate, so P&L = 0
            # Unhedged portion: exposed to rate change
            hedged_pnl = unhedged_amount * (new_rate - current_rate)
            
            # Calculate benefit of hedging
            hedge_benefit = unhedged_pnl - hedged_pnl
            
            results.append({
                'rate_change_pct': round(rate_change * 100, 1),
                'new_rate': round(new_rate, 6),
                'unhedged_pnl': round(unhedged_pnl, 2),
                'hedged_pnl': round(hedged_pnl, 2),
                'hedge_benefit': round(hedge_benefit, 2),
                'scenario': self._classify_scenario(rate_change)
            })
        
        return {
            'scenario_type': scenario_type,
            'hedge_ratio': hedge_ratio,
            'hedge_ratio_pct': f"{hedge_ratio * 100:.0f}%",
            'current_rate': current_rate,
            'exposure_amount': exposure_amount,
            'scenarios': results,
            'summary': self._summarize_scenarios(results)
        }
    
    def _classify_scenario(self, rate_change: float) -> str:
        """
        Classify scenario based on rate change magnitude
        """
        if rate_change <= -0.10:
            return "Severe Adverse"
        elif rate_change <= -0.05:
            return "Moderate Adverse"
        elif rate_change < 0:
            return "Mild Adverse"
        elif rate_change == 0:
            return "No Change"
        elif rate_change <= 0.05:
            return "Mild Favorable"
        elif rate_change <= 0.10:
            return "Moderate Favorable"
        else:
            return "Severe Favorable"
    
    def _summarize_scenarios(self, results: List[Dict]) -> Dict:
        """
        Create summary statistics for scenario analysis
        """
        hedged_pnls = [r['hedged_pnl'] for r in results]
        unhedged_pnls = [r['unhedged_pnl'] for r in results]
        
        return {
            'worst_case_hedged': round(min(hedged_pnls), 2),
            'best_case_hedged': round(max(hedged_pnls), 2),
            'worst_case_unhedged': round(min(unhedged_pnls), 2),
            'best_case_unhedged': round(max(unhedged_pnls), 2),
            'avg_hedged': round(statistics.mean(hedged_pnls), 2),
            'avg_unhedged': round(statistics.mean(unhedged_pnls), 2),
            'total_scenarios': len(results)
        }
    
    def calculate_pnl_impact(
        self,
        exposure_amount: float,
        contract_rate: float,
        current_rate: float,
        hedge_ratio: float
    ) -> Dict:
        """
        Calculate P&L impact of current hedge position
        
        Args:
            exposure_amount: Total exposure
            contract_rate: Hedged forward contract rate
            current_rate: Current market spot rate
            hedge_ratio: Proportion hedged (0-1)
            
        Returns:
            Dictionary with P&L breakdown
        """
        
        hedged_amount = exposure_amount * hedge_ratio
        unhedged_amount = exposure_amount * (1 - hedge_ratio)
        
        # P&L on hedged portion
        hedged_pnl = hedged_amount * (current_rate - contract_rate)
        
        # P&L if position was unhedged
        unhedged_pnl = exposure_amount * (current_rate - contract_rate)
        
        # Opportunity cost/benefit
        opportunity_impact = hedged_pnl - unhedged_pnl
        
        return {
            'hedged_amount': round(hedged_amount, 2),
            'unhedged_amount': round(unhedged_amount, 2),
            'contract_rate': contract_rate,
            'current_rate': current_rate,
            'rate_difference': round(current_rate - contract_rate, 6),
            'rate_difference_pct': round((current_rate - contract_rate) / contract_rate * 100, 2),
            'hedged_pnl': round(hedged_pnl, 2),
            'unhedged_pnl': round(unhedged_pnl, 2),
            'opportunity_impact': round(opportunity_impact, 2),
            'hedge_effectiveness': self._calculate_hedge_effectiveness(
                hedged_pnl, unhedged_pnl
            )
        }
    
    def _calculate_hedge_effectiveness(
        self,
        hedged_pnl: float,
        unhedged_pnl: float
    ) -> str:
        """
        Calculate and categorize hedge effectiveness
        """
        if unhedged_pnl == 0:
            return "Neutral"
        
        effectiveness_pct = abs(hedged_pnl / unhedged_pnl) * 100
        
        if hedged_pnl * unhedged_pnl < 0:
            # Hedge worked (opposite signs)
            if effectiveness_pct >= 90:
                return "Highly Effective"
            elif effectiveness_pct >= 70:
                return "Effective"
            else:
                return "Partially Effective"
        else:
            # Hedge didn't help (same sign)
            return "Ineffective"
    
    def recommend_rollover(
        self,
        maturity_date: datetime,
        current_exposure: float,
        market_outlook: str = 'neutral'
    ) -> Dict:
        """
        Recommend whether to roll over expiring hedge
        
        Args:
            maturity_date: When current hedge expires
            current_exposure: Current exposure amount
            market_outlook: 'bullish', 'neutral', or 'bearish'
            
        Returns:
            Rollover recommendation
        """
        
        days_to_maturity = (maturity_date - datetime.now()).days
        
        if days_to_maturity > 30:
            recommendation = "Monitor"
            action = "Review 30 days before maturity"
        elif days_to_maturity > 7:
            if market_outlook == 'bearish':
                recommendation = "Roll Over Early"
                action = "Lock in current rates before further deterioration"
            elif market_outlook == 'bullish':
                recommendation = "Let Mature"
                action = "Wait for potential rate improvement"
            else:
                recommendation = "Prepare to Roll"
                action = "Assess market conditions and decide next week"
        else:
            recommendation = "Take Action Now"
            if current_exposure > 0:
                action = "Roll over to maintain hedge protection"
            else:
                action = "Allow to mature if exposure has reduced"
        
        return {
            'days_to_maturity': days_to_maturity,
            'maturity_date': maturity_date.strftime('%Y-%m-%d'),
            'recommendation': recommendation,
            'action': action,
            'market_outlook': market_outlook,
            'urgency': 'High' if days_to_maturity <= 7 else 'Medium' if days_to_maturity <= 30 else 'Low'
        }


# Example usage and testing
if __name__ == "__main__":
    # Initialize service
    hedging_service = HedgingService()
    
    # Example 1: Get hedge recommendations
    print("=" * 60)
    print("EXAMPLE 1: Hedge Recommendations")
    print("=" * 60)
    
    recommendation = hedging_service.calculate_optimal_hedge_ratio(
        exposure_amount=1000000,  # $1M exposure
        current_rate=1.0850,  # EUR/USD
        historical_volatility=0.08,  # 8% annualized volatility
        time_horizon_days=90,
        risk_tolerance='moderate'
    )
    
    print(f"\nRecommended Hedge Ratio: {recommendation['recommended_ratio'] * 100}%")
    print(f"Confidence Level: {recommendation['confidence_level']}%")
    print(f"Rationale: {recommendation['rationale']}\n")
    
    print("Analysis of Different Hedge Ratios:")
    for analysis in recommendation['hedge_analysis']:
        print(f"\n{analysis['ratio_pct']} Hedge:")
        print(f"  Hedged Amount: ${analysis['hedged_amount']:,.2f}")
        print(f"  Best Case P&L: ${analysis['best_case_pnl']:,.2f}")
        print(f"  Worst Case P&L: ${analysis['worst_case_pnl']:,.2f}")
    
    # Example 2: Scenario Analysis
    print("\n" + "=" * 60)
    print("EXAMPLE 2: Scenario Analysis")
    print("=" * 60)
    
    scenarios = hedging_service.run_scenario_analysis(
        exposure_amount=1000000,
        current_rate=1.0850,
        hedge_ratio=0.50,  # 50% hedged
        scenario_type='moderate'
    )
    
    print(f"\nCurrent Hedge: {scenarios['hedge_ratio_pct']}")
    print(f"Exposure: ${scenarios['exposure_amount']:,.2f}")
    print(f"\nScenario Results:")
    
    for scenario in scenarios['scenarios']:
        print(f"\n{scenario['scenario']} ({scenario['rate_change_pct']:+.1f}%):")
        print(f"  New Rate: {scenario['new_rate']:.6f}")
        print(f"  Unhedged P&L: ${scenario['unhedged_pnl']:,.2f}")
        print(f"  Hedged P&L: ${scenario['hedged_pnl']:,.2f}")
        print(f"  Hedge Benefit: ${scenario['hedge_benefit']:,.2f}")
    
    print(f"\nSummary:")
    summary = scenarios['summary']
    print(f"  Worst Case (Hedged): ${summary['worst_case_hedged']:,.2f}")
    print(f"  Worst Case (Unhedged): ${summary['worst_case_unhedged']:,.2f}")
    print(f"  Average P&L (Hedged): ${summary['avg_hedged']:,.2f}")
    print(f"  Average P&L (Unhedged): ${summary['avg_unhedged']:,.2f}")
    
    # Example 3: P&L Impact
    print("\n" + "=" * 60)
    print("EXAMPLE 3: Current P&L Impact")
    print("=" * 60)
    
    pnl = hedging_service.calculate_pnl_impact(
        exposure_amount=1000000,
        contract_rate=1.0800,  # Forward rate locked in
        current_rate=1.0950,  # Current market rate
        hedge_ratio=0.75  # 75% hedged
    )
    
    print(f"\nContract Rate: {pnl['contract_rate']:.6f}")
    print(f"Current Rate: {pnl['current_rate']:.6f}")
    print(f"Rate Difference: {pnl['rate_difference_pct']:+.2f}%")
    print(f"\nHedged Amount: ${pnl['hedged_amount']:,.2f}")
    print(f"Hedged P&L: ${pnl['hedged_pnl']:,.2f}")
    print(f"Unhedged P&L (if not hedged): ${pnl['unhedged_pnl']:,.2f}")
    print(f"Opportunity Impact: ${pnl['opportunity_impact']:,.2f}")
    print(f"Hedge Effectiveness: {pnl['hedge_effectiveness']}")
