"""
Pydantic models for AlphaLens API request/response schemas.
"""

from pydantic import BaseModel, Field
from typing import Literal


class PricePoint(BaseModel):
    """A single data point in the price history time series."""
    date: str = Field(description="Date in YYYY-MM-DD format")
    close: float = Field(description="Closing price on this date")


class StockData(BaseModel):
    """Complete stock data payload returned by /api/stock/{ticker}."""
    ticker: str = Field(description="Stock ticker symbol (e.g. AAPL)")
    name: str = Field(description="Full company name")
    current_price: float | None = Field(default=None, description="Current/latest price")
    market_cap: int | None = Field(default=None, description="Market capitalization in USD")
    pe_ratio: float | None = Field(default=None, description="Trailing P/E ratio")
    eps: float | None = Field(default=None, description="Trailing earnings per share")
    fifty_two_week_high: float | None = Field(default=None, description="52-week high price")
    fifty_two_week_low: float | None = Field(default=None, description="52-week low price")
    volume: int | None = Field(default=None, description="Current trading volume")
    sector: str | None = Field(default=None, description="Company sector")
    price_history: list[PricePoint] = Field(
        default_factory=list,
        description="1-month daily closing prices for charting"
    )


class AIAnalysis(BaseModel):
    """AI-generated investment analysis returned by /api/analyze/{ticker}."""
    sentiment_score: int = Field(
        description="Confidence score from 0 (very bearish) to 100 (very bullish)",
        ge=0,
        le=100,
    )
    recommendation: Literal["Buy", "Hold", "Sell"] = Field(
        description="Investment recommendation"
    )
    explanation: str = Field(
        description="Concise 2-3 sentence explanation of the recommendation"
    )


class VoiceCommandRequest(BaseModel):
    """Request body for the /api/voice endpoint."""
    transcript: str = Field(description="Raw speech-to-text transcript from the user")
    ticker: str = Field(description="Currently active ticker symbol in the AR view")


class VoiceCommandResponse(BaseModel):
    """Response from the /api/voice endpoint."""
    intent: str = Field(description="Parsed user intent (e.g. 'show_pe', 'show_news', 'ai_analysis')")
    message: str = Field(description="Human-readable response to display")
    data: dict | None = Field(default=None, description="Optional structured data for the intent")
