"""
AlphaLens — FastAPI Backend

Provides REST endpoints for stock data, AI analysis, and voice command processing.
Designed to be lightweight and run on hardware without a dedicated GPU.

Usage:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models.schemas import StockData, AIAnalysis, VoiceCommandRequest, VoiceCommandResponse
from services.stock_service import get_stock_data
from services.ai_service import analyze_stock, process_voice_command

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 AlphaLens backend starting up")
    yield
    logger.info("🛑 AlphaLens backend shutting down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AlphaLens API",
    description="WebAR AI Investment Assistant — Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins during development.
# In production, lock this down to your frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "alphalens-api"}


@app.get("/api/stock/{ticker}", response_model=StockData)
async def get_stock(ticker: str):
    """
    Fetch real-time stock data for a given ticker symbol.

    Returns current price, market cap, PE ratio, EPS, and 1-month
    daily price history for charting.

    **Examples:** AAPL, TSLA, RELIANCE.NS
    """
    try:
        data = get_stock_data(ticker)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Unexpected error fetching stock data: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while fetching stock data.",
        )


@app.get("/api/analyze/{ticker}", response_model=AIAnalysis)
async def analyze(ticker: str):
    """
    Get AI-powered investment analysis for a given ticker.

    Fetches the latest stock data, sends it to Google Gemini for analysis,
    and returns a Buy/Hold/Sell recommendation with a confidence score
    and explanation.
    """
    # Step 1: Fetch stock data
    try:
        stock_data = get_stock_data(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Step 2: Send to AI for analysis
    try:
        analysis = await analyze_stock(stock_data)
        return analysis
    except Exception as e:
        logger.error("AI analysis failed for %s: %s", ticker, e)
        raise HTTPException(
            status_code=500,
            detail="AI analysis service is temporarily unavailable.",
        )


@app.post("/api/voice", response_model=VoiceCommandResponse)
async def handle_voice_command(request: VoiceCommandRequest):
    """
    Process a voice command from the AR interface.

    Takes the raw speech-to-text transcript and the currently active ticker,
    parses the user's intent, and returns a structured response to update
    the AR dashboard.
    """
    if not request.transcript.strip():
        raise HTTPException(
            status_code=400,
            detail="Transcript is empty. Please speak a command.",
        )

    try:
        result = await process_voice_command(request.transcript, request.ticker)
        return VoiceCommandResponse(
            intent=result.get("intent", "unknown"),
            message=result.get("message", "Command processed."),
            data=result.get("data"),
        )
    except Exception as e:
        logger.error("Voice command processing error: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Error processing voice command.",
        )


# ---------------------------------------------------------------------------
# Entry point (for direct execution)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
