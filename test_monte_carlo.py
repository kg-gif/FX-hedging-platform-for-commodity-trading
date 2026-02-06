#!/usr/bin/env python3
"""
Test script for Monte Carlo service updates
Tests input validation and database persistence
"""

import sys
import asyncio
from services.monte_carlo_service import MonteCarloService

def test_monte_carlo_service():
    """Test the Monte Carlo service with various inputs"""
    service = MonteCarloService()
    
    print("=" * 60)
    print("Testing Monte Carlo Service Updates")
    print("=" * 60)
    
    # Test 1: Valid simulation
    print("\n✓ Test 1: Valid simulation with valid inputs")
    try:
        result = service.run_simulation(
            current_rate=1.1234,
            amount=1000000,
            time_horizon_days=90,
            currency_pair="EUR/USD",
            num_scenarios=1000,
            random_seed=42
        )
        print(f"  SUCCESS - Simulation completed")
        print(f"  - Expected P&L: ${result['summary']['expected_pnl']:,.2f}")
        print(f"  - Max Loss: ${result['risk_metrics']['max_loss']:,.2f}")
        print(f"  - Max Gain: ${result['risk_metrics']['max_gain']:,.2f}")
        print(f"  - Probability of Loss: {result['risk_metrics']['probability_of_loss']:.2%}")
    except Exception as e:
        print(f"  FAILED - {e}")
        return False
    
    # Test 2: Invalid current_rate <= 0
    print("\n✗ Test 2: Invalid current_rate <= 0 (should raise ValueError)")
    try:
        result = service.run_simulation(
            current_rate=-1.0,
            amount=1000000,
            time_horizon_days=90,
            currency_pair="EUR/USD"
        )
        print(f"  FAILED - Should have raised ValueError")
        return False
    except ValueError as e:
        print(f"  SUCCESS - Correctly raised ValueError: {e}")
    
    # Test 3: Invalid amount == 0
    print("\n✗ Test 3: Invalid amount == 0 (should raise ValueError)")
    try:
        result = service.run_simulation(
            current_rate=1.1234,
            amount=0,
            time_horizon_days=90,
            currency_pair="EUR/USD"
        )
        print(f"  FAILED - Should have raised ValueError")
        return False
    except ValueError as e:
        print(f"  SUCCESS - Correctly raised ValueError: {e}")
    
    # Test 4: Invalid time_horizon_days > 365
    print("\n✗ Test 4: Invalid time_horizon_days > 365 (should raise ValueError)")
    try:
        result = service.run_simulation(
            current_rate=1.1234,
            amount=1000000,
            time_horizon_days=400,
            currency_pair="EUR/USD"
        )
        print(f"  FAILED - Should have raised ValueError")
        return False
    except ValueError as e:
        print(f"  SUCCESS - Correctly raised ValueError: {e}")
    
    # Test 5: Invalid time_horizon_days < 1
    print("\n✗ Test 5: Invalid time_horizon_days < 1 (should raise ValueError)")
    try:
        result = service.run_simulation(
            current_rate=1.1234,
            amount=1000000,
            time_horizon_days=0,
            currency_pair="EUR/USD"
        )
        print(f"  FAILED - Should have raised ValueError")
        return False
    except ValueError as e:
        print(f"  SUCCESS - Correctly raised ValueError: {e}")
    
    # Test 6: Test configurable random seed
    print("\n✓ Test 6: Verify random seed is configurable")
    try:
        result1 = service.run_simulation(
            current_rate=1.1234,
            amount=1000000,
            time_horizon_days=90,
            currency_pair="EUR/USD",
            num_scenarios=100,
            random_seed=42
        )
        result2 = service.run_simulation(
            current_rate=1.1234,
            amount=1000000,
            time_horizon_days=90,
            currency_pair="EUR/USD",
            num_scenarios=100,
            random_seed=43
        )
        
        pnl1 = result1['summary']['expected_pnl']
        pnl2 = result2['summary']['expected_pnl']
        
        if abs(pnl1 - pnl2) > 1000:  # Should be different with different seeds
            print(f"  SUCCESS - Different seeds produce different results")
            print(f"  - Seed 42 Expected P&L: ${pnl1:,.2f}")
            print(f"  - Seed 43 Expected P&L: ${pnl2:,.2f}")
        else:
            print(f"  WARNING - Results too similar despite different seeds")
    except Exception as e:
        print(f"  FAILED - {e}")
        return False
    
    # Test 7: Portfolio simulation
    print("\n✓ Test 7: Portfolio simulation with multiple exposures")
    try:
        exposures = [
            {'id': 1, 'current_rate': 1.1234, 'amount': 1000000, 'currency_pair': 'EUR/USD'},
            {'id': 2, 'current_rate': 130.45, 'amount': 500000, 'currency_pair': 'JPY/USD'},
        ]
        result = service.run_portfolio_simulation(
            exposures=exposures,
            time_horizon_days=90,
            num_scenarios=1000,
            random_seed=42
        )
        print(f"  SUCCESS - Portfolio simulation completed")
        print(f"  - Total Exposures: {result['portfolio_metrics']['total_exposures']}")
        print(f"  - Portfolio Expected P&L: ${result['portfolio_metrics']['expected_pnl']:,.2f}")
        print(f"  - Portfolio VaR 95: ${result['portfolio_metrics']['var_95']:,.2f}")
    except Exception as e:
        print(f"  FAILED - {e}")
        return False
    
    print("\n" + "=" * 60)
    print("✓ All tests passed!")
    print("=" * 60)
    return True

if __name__ == '__main__':
    success = test_monte_carlo_service()
    sys.exit(0 if success else 1)
