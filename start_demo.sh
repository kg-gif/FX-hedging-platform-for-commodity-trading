#!/bin/bash

# Birk Quick Start Script
# This script sets up the complete demo in one command

echo "=========================================="
echo "🌾 BIRK - FX Risk Management Platform"
echo "Quick Start Script"
echo "=========================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.9+"
    exit 1
fi

echo "✓ Python found: $(python3 --version)"

# Check Node
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js not found. Frontend will not be available."
    echo "   Install Node.js 18+ to run the dashboard."
    SKIP_FRONTEND=true
else
    echo "✓ Node.js found: $(node --version)"
    SKIP_FRONTEND=false
fi

echo ""
echo "📦 Installing backend dependencies..."
pip3 install -r requirements.txt --quiet

echo "✓ Backend dependencies installed"
echo ""

# Start API in background
echo "🚀 Starting Birk API..."
python3 birk_api.py &
API_PID=$!

# Wait for API to be ready
echo "⏳ Waiting for API to start..."
sleep 5

# Check if API is running
if curl -s http://localhost:8000/ > /dev/null; then
    echo "✓ API is running at http://localhost:8000"
else
    echo "❌ API failed to start. Check logs above."
    kill $API_PID 2>/dev/null
    exit 1
fi

echo ""
echo "📊 Loading demo data..."
python3 seed_demo_data.py

echo ""
echo "=========================================="
echo "✅ BIRK IS READY!"
echo "=========================================="
echo ""
echo "📍 API Running:"
echo "   http://localhost:8000"
echo "   Documentation: http://localhost:8000/docs"
echo ""

if [ "$SKIP_FRONTEND" = false ]; then
    echo "🎨 Starting frontend..."
    echo ""
    cd frontend 2>/dev/null || mkdir frontend
    npm install --quiet
    npm run dev &
    FRONTEND_PID=$!
    
    echo ""
    echo "📍 Dashboard:"
    echo "   http://localhost:3000"
    echo ""
fi

echo "=========================================="
echo "DEMO SCENARIO"
echo "=========================================="
echo "Company: GlobalTrade Commodities Ltd"
echo "Volume: $100M monthly"
echo "Exposures: 8 positions across multiple currencies"
echo ""
echo "Key Features to Show:"
echo "  1. Volatility increases with settlement period"
echo "  2. Monte Carlo risk simulations"
echo "  3. Payment corridor limits"
echo "  4. Real-time risk metrics"
echo ""
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Keep script running
if [ "$SKIP_FRONTEND" = false ]; then
    wait $API_PID $FRONTEND_PID
else
    wait $API_PID
fi
