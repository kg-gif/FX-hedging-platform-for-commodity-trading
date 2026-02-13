"""
B2 FX Risk Management Platform - Main API
FastAPI application with Monte Carlo simulation and AP exposure management
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import monte_carlo_routes_fastapi, exposure_routes
from models import Base
from database import engine

# Create database tables on startup
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="B2 FX Risk Management API",
    description="AI-powered FX exposure forecasting and hedge strategy platform for corporates",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware - allows frontend to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/")
def read_root():
    """API health check"""
    return {
        "message": "B2 FX Risk Management API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "docs": "/docs",
            "monte_carlo": "/api/monte-carlo",
            "exposures": "/api/exposures"
        }
    }

# Register API routes
app.include_router(monte_carlo_routes_fastapi.router, tags=["Monte Carlo Simulation"])
app.include_router(exposure_routes.router, tags=["AP Exposure Management"])

# Startup event
@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    print("=" * 50)
    print("B2 FX Risk Management API Starting...")
    print("API Docs: http://localhost:8000/docs")
    print("=" * 50)

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    print("B2 FX Risk Management API Shutting Down...")