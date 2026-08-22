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
    history: Optional[List[Dict[str, Any]]] = None
    sentiment: Optional[Union[SentimentResult, Dict[str, Any]]] = None
    analysis: Optional[AIAnalysis] = None

class VoiceCommandRequest(BaseSchema):
    command: str

class VoiceCommandResponse(BaseSchema):
    action: Optional[str] = None
    target: Optional[str] = None
    response: str
    data: Optional[Dict[str, Any]] = None