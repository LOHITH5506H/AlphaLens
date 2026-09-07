from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict

class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

class SentimentRequest(BaseSchema):
    text: str

class SentimentResult(BaseSchema):
    label: str
    score: float
    probabilities: Optional[Dict[str, float]] = None

class AIAnalysis(BaseSchema):
    summary: Optional[str] = None
    sentiment: Optional[str] = None
    score: Optional[float] = None
    recommendation: Optional[str] = None
    key_points: Optional[List[str]] = None
    raw_analysis: Optional[str] = None

class CandlePoint(BaseSchema):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    vwap: Optional[float] = None

class TechnicalIndicators(BaseSchema):
    rsi_14: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    vwap: Optional[float] = None

class FinancialBreakdown(BaseSchema):
    quarter: str
    revenue: Optional[float] = None
    gross_profit: Optional[float] = None
    operating_income: Optional[float] = None
    net_income: Optional[float] = None
    operating_margin: Optional[float] = None

class ValuationMultiplePoint(BaseSchema):
    date: str
    price: float
    trailing_pe: Optional[float] = None
    forward_pe: Optional[float] = None
    ev_to_ebitda: Optional[float] = None

class StockData(BaseSchema):
    symbol: str
    name: Optional[str] = None
    price: float
    change: float
    change_percent: Optional[float] = Field(default=None, alias="changePercent")
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    previous_close: Optional[float] = Field(default=None, alias="previousClose")
    volume: Optional[Union[int, float]] = None
    market_cap: Optional[Union[int, float]] = Field(default=None, alias="marketCap")
    pe_ratio: Optional[float] = Field(default=None, alias="peRatio")
    currency: str = "USD"
    history: Optional[List[Dict[str, Any]]] = None
    candlesticks: Optional[List[CandlePoint]] = None
    technicals: Optional[TechnicalIndicators] = None
    financials: Optional[List[FinancialBreakdown]] = None
    valuation_history: Optional[List[ValuationMultiplePoint]] = None
    volume_profile: Optional[List[Dict[str, float]]] = None
    sentiment: Optional[Union[SentimentResult, Dict[str, Any]]] = None
    analysis: Optional[AIAnalysis] = None


class StockInsightsResponse(BaseSchema):
    """Response schema for the /api/stock-insights endpoint.

    Contains LSTM-predicted trajectory, volatility bounds, fundamentals,
    and local FinBERT sentiment scoring.
    """
    ticker: str
    current_price: float
    pe_ratio: Optional[float] = None
    market_cap: Optional[float] = None
    profit_margins: Optional[float] = None
    debt_to_equity: Optional[float] = None
    predicted_prices: List[float]       # Length 5: Real predicted dollar prices
    volatility_upper: List[float]       # Length 5: Upper boundary dollar values
    volatility_lower: List[float]       # Length 5: Lower boundary dollar values
    sentiment_score: float              # [-1.0 to 1.0] from local FinBERT
    sentiment_label: str                # "BULLISH", "NEUTRAL", or "BEARISH"
    prediction_dates: List[str]         # ISO date strings for the next 5 trading days


class VoiceCommandRequest(BaseSchema):
    transcript: str
    ticker: Optional[str] = None

class VoiceCommandResponse(BaseSchema):
    intent: Optional[str] = None
    message: str
    data: Optional[Dict[str, Any]] = None