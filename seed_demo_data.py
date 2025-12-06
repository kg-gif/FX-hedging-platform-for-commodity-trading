"""
Seed database with demo data for Birk platform
Scenario: $100M commodity trader with multi-currency exposures
"""

import sys
import requests
from datetime import datetime, timedelta
import random

API_BASE = "http://localhost:8000"

def create_demo_company():
    """Create GlobalTrade Commodities demo company"""
    company_data = {
        "name": "GlobalTrade Commodities Ltd",
        "base_currency": "USD",
        "company_type": "commodity_trader",
        "trading_volume_monthly": 100_000_000  # $100M
    }
    
    response = requests.post(f"{API_BASE}/companies", json=company_data)
    if response.status_code == 201:
        company = response.json()
        print(f"✓ Created company: {company['name']} (ID: {company['id']})")
        return company['id']
    elif response.status_code == 400 and "already exists" in response.text:
        # Get existing company
        companies = requests.get(f"{API_BASE}/companies").json()
        for c in companies:
            if c['name'] == company_data['name']:
                print(f"✓ Using existing company: {c['name']} (ID: {c['id']})")
                return c['id']
    else:
        print(f"✗ Failed to create company: {response.text}")
        sys.exit(1)


def create_demo_exposures(company_id):
    """Create realistic commodity trading exposures"""
    
    exposures = [
        {
            "from_currency": "BRL",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 15_000_000,  # $15M Brazilian soybean purchase
            "settlement_period": "21_days",
            "settlement_date": (datetime.now() + timedelta(days=21)).isoformat(),
            "instrument_type": "spot",
            "description": "Brazilian soybean purchase - Q1 2025",
            "counterparty": "Agro Brasil SA",
            "upward_risk_threshold": 35.0,
            "downward_risk_threshold": 75.0
        },
        {
            "from_currency": "CNY",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 25_000_000,  # $25M Chinese copper sale
            "settlement_period": "14_days",
            "settlement_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "instrument_type": "forward",
            "description": "Copper concentrate shipment to Shandong",
            "counterparty": "Shandong Metals Corp",
            "upward_risk_threshold": 40.0,
            "downward_risk_threshold": 80.0
        },
        {
            "from_currency": "EUR",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 12_000_000,  # $12M European wheat purchase
            "settlement_period": "7_days",
            "settlement_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "instrument_type": "spot",
            "description": "Ukrainian wheat via Rotterdam",
            "counterparty": "EuroGrain BV",
            "upward_risk_threshold": 45.0,
            "downward_risk_threshold": 85.0
        },
        {
            "from_currency": "MXN",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 8_000_000,  # $8M Mexican silver purchase
            "settlement_period": "14_days",
            "settlement_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "instrument_type": "spot",
            "description": "Silver ore from Zacatecas mines",
            "counterparty": "Minera Mexicana",
            "upward_risk_threshold": 40.0,
            "downward_risk_threshold": 80.0
        },
        {
            "from_currency": "AUD",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 18_000_000,  # $18M Australian iron ore
            "settlement_period": "21_days",
            "settlement_date": (datetime.now() + timedelta(days=21)).isoformat(),
            "instrument_type": "forward",
            "description": "Iron ore shipment - Pilbara region",
            "counterparty": "Aussie Mining Corp",
            "upward_risk_threshold": 35.0,
            "downward_risk_threshold": 75.0
        },
        {
            "from_currency": "ZAR",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 10_000_000,  # $10M South African platinum
            "settlement_period": "21_days",
            "settlement_date": (datetime.now() + timedelta(days=25)).isoformat(),
            "instrument_type": "spot",
            "description": "Platinum group metals - Rustenburg",
            "counterparty": "SA Precious Metals",
            "upward_risk_threshold": 30.0,
            "downward_risk_threshold": 70.0
        },
        {
            "from_currency": "CAD",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 7_000_000,  # $7M Canadian canola
            "settlement_period": "14_days",
            "settlement_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "instrument_type": "spot",
            "description": "Canola seed - Saskatchewan harvest",
            "counterparty": "Prairie Agro Ltd",
            "upward_risk_threshold": 40.0,
            "downward_risk_threshold": 80.0
        },
        {
            "from_currency": "INR",
            "to_currency": "USD",
            "settlement_currency": "USD",
            "amount": 5_000_000,  # $5M Indian cotton
            "settlement_period": "30_days",
            "settlement_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "instrument_type": "forward",
            "description": "Cotton shipment - Gujarat mills",
            "counterparty": "Mumbai Textiles Ltd",
            "upward_risk_threshold": 35.0,
            "downward_risk_threshold": 75.0
        }
    ]
    
    created_ids = []
    total_exposure = 0
    
    print(f"\n📊 Creating exposures for company {company_id}...")
    for exp in exposures:
        response = requests.post(
            f"{API_BASE}/companies/{company_id}/exposures",
            json=exp
        )
        if response.status_code == 200:
            exposure = response.json()
            created_ids.append(exposure['id'])
            total_exposure += exp['amount']
            print(f"  ✓ {exp['from_currency']}/{exp['to_currency']}: ${exp['amount']:,.0f} - {exp['description'][:40]}")
        else:
            print(f"  ✗ Failed to create exposure: {response.text}")
    
    print(f"\n💰 Total exposure created: ${total_exposure:,.0f}")
    return created_ids


def create_payment_corridors(company_id):
    """Create payment corridors with limits"""
    
    corridors = [
        {
            "from_currency": "USD",
            "to_currency": "BRL",
            "from_country": "US",
            "to_country": "BR",
            "daily_limit": 5_000_000,
            "monthly_limit": 100_000_000,
            "per_transaction_limit": 2_000_000,
            "average_settlement_days": 21
        },
        {
            "from_currency": "USD",
            "to_currency": "CNY",
            "from_country": "US",
            "to_country": "CN",
            "daily_limit": 10_000_000,
            "monthly_limit": 200_000_000,
            "per_transaction_limit": 5_000_000,
            "average_settlement_days": 14
        },
        {
            "from_currency": "USD",
            "to_currency": "EUR",
            "from_country": "US",
            "to_country": "EU",
            "daily_limit": 15_000_000,
            "monthly_limit": 300_000_000,
            "per_transaction_limit": 10_000_000,
            "average_settlement_days": 7
        },
        {
            "from_currency": "USD",
            "to_currency": "MXN",
            "from_country": "US",
            "to_country": "MX",
            "daily_limit": 8_000_000,
            "monthly_limit": 150_000_000,
            "per_transaction_limit": 3_000_000,
            "average_settlement_days": 14
        },
        {
            "from_currency": "USD",
            "to_currency": "AUD",
            "from_country": "US",
            "to_country": "AU",
            "daily_limit": 12_000_000,
            "monthly_limit": 250_000_000,
            "per_transaction_limit": 7_000_000,
            "average_settlement_days": 21
        }
    ]
    
    print(f"\n🌍 Creating payment corridors...")
    for corridor in corridors:
        response = requests.post(
            f"{API_BASE}/companies/{company_id}/corridors",
            json=corridor
        )
        if response.status_code == 200:
            print(f"  ✓ {corridor['from_currency']} → {corridor['to_currency']}: ${corridor['monthly_limit']:,.0f}/month")
        elif response.status_code == 400 and "already exists" in response.text:
            print(f"  ⚠ {corridor['from_currency']} → {corridor['to_currency']}: Already exists")
        else:
            print(f"  ✗ Failed to create corridor: {response.text}")


def run_monte_carlo_simulations(exposure_ids):
    """Run Monte Carlo simulations for key exposures"""
    print(f"\n🎲 Running Monte Carlo simulations...")
    
    # Run simulations for first 3 exposures (largest ones)
    for exp_id in exposure_ids[:3]:
        response = requests.post(
            f"{API_BASE}/exposures/{exp_id}/monte-carlo",
            json={"exposure_id": exp_id, "num_simulations": 10000, "confidence_level": 0.95}
        )
        if response.status_code == 200:
            result = response.json()
            print(f"  ✓ Exposure {exp_id}:")
            print(f"     Expected outcome: ${result['mean_outcome']:,.0f}")
            print(f"     95th percentile: ${result['percentile_95']:,.0f}")
            print(f"     Worst case: ${result['worst_case']:,.0f}")
            print(f"     Probability of loss: {result['probability_of_loss']*100:.1f}%")
        else:
            print(f"  ✗ Failed simulation for exposure {exp_id}")


def main():
    """Run full demo data seeding"""
    print("=" * 70)
    print("🌾 BIRK DEMO DATA SEEDING")
    print("Scenario: $100M Commodity Trader - GlobalTrade Commodities")
    print("=" * 70)
    
    try:
        # Check if API is running
        response = requests.get(f"{API_BASE}/")
        if response.status_code != 200:
            print("✗ API is not running. Please start it first:")
            print("  python birk_api.py")
            sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to API at", API_BASE)
        print("  Please start the API first: python birk_api.py")
        sys.exit(1)
    
    # Create demo data
    company_id = create_demo_company()
    exposure_ids = create_demo_exposures(company_id)
    create_payment_corridors(company_id)
    run_monte_carlo_simulations(exposure_ids)
    
    print("\n" + "=" * 70)
    print("✅ DEMO DATA SEEDED SUCCESSFULLY!")
    print("=" * 70)
    print(f"🏢 Company ID: {company_id}")
    print(f"📊 Exposures created: {len(exposure_ids)}")
    print(f"💵 Total exposure: ~$100M across 8 currency pairs")
    print(f"\n🌐 Access the API: {API_BASE}/docs")
    print("=" * 70)


if __name__ == "__main__":
    main()
