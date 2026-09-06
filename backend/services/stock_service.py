"""
Stock data service — fetches live market data via yfinance and runs
local LSTM inference for trajectory prediction.

The LSTM model is loaded at module import time (CPU inference).
If model weights are not found, the service falls back to a statistical
extrapolation mode using recent price momentum.
"""

import json
import logging
import time
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import yfinance as yf

from models.schemas import StockInsightsResponse

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# TTL Cache — lightweight time-based cache to avoid Yahoo Finance rate limits
# ──────────────────────────────────────────────────────────────────────────────

class _TTLCache:
    """Thread-safe in-memory cache with per-key TTL expiration."""

    def __init__(self, default_ttl: int = 300):
        self._store: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()
        self._default_ttl = default_ttl  # seconds

    def get(self, key: str) -> Optional[object]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.time() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: object, ttl: Optional[int] = None) -> None:
        with self._lock:
            ttl = ttl if ttl is not None else self._default_ttl
            self._store[key] = (time.time() + ttl, value)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)


# 5-minute TTL (300 seconds) for both quote info and historical data
_info_cache = _TTLCache(default_ttl=300)
_history_cache = _TTLCache(default_ttl=300)


def _get_ticker_info(symbol: str) -> dict:
    """Fetch ticker info with caching."""
    cached = _info_cache.get(symbol)
    if cached is not None:
        logger.debug("Cache HIT for %s info", symbol)
        return cached  # type: ignore
    logger.debug("Cache MISS for %s info, fetching from yfinance", symbol)
    info = yf.Ticker(symbol).info or {}
    _info_cache.set(symbol, info)
    return info


def _get_historical_data(symbol: str, period: str = "3mo", interval: str = "1d") -> pd.DataFrame:
    """Fetch historical OHLCV with caching."""
    cache_key = f"{symbol}_{period}_{interval}"
    cached = _history_cache.get(cache_key)
    if cached is not None:
        logger.debug("Cache HIT for %s history", symbol)
        return cached  # type: ignore
    logger.debug("Cache MISS for %s history, fetching from yfinance", symbol)
    hist = yf.download(symbol, period=period, interval=interval, progress=False)
    if isinstance(hist.columns, pd.MultiIndex):
        hist.columns = hist.columns.droplevel(1)
    _history_cache.set(cache_key, hist)
    return hist


# ──────────────────────────────────────────────────────────────────────────────
# LSTM Model Definition (must match the Colab training notebook exactly)
# ──────────────────────────────────────────────────────────────────────────────

class StockTrajectoryLSTM(nn.Module):
    """Dual-head LSTM for stock trajectory + volatility prediction."""

    def __init__(
        self,
        input_dim: int = 9,
        hidden_dim: int = 128,
        num_layers: int = 2,
        output_dim: int = 5,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.fc_trajectory = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, output_dim),
        )
        self.fc_volatility = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, output_dim),
            nn.Softplus(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        out, (hn, cn) = self.lstm(x)
        last_hidden = out[:, -1, :]
        trajectory = self.fc_trajectory(last_hidden)
        volatility = self.fc_volatility(last_hidden)
        return trajectory, volatility


# ──────────────────────────────────────────────────────────────────────────────
# Model & Scaler Initialization
# ──────────────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

_lstm_model: Optional[StockTrajectoryLSTM] = None
_scaler_center: Optional[np.ndarray] = None
_scaler_scale: Optional[np.ndarray] = None
_model_config: Optional[dict] = None
_model_loaded = False

FEATURE_COLUMNS = [
    "Returns", "SMA_20_Ratio", "SMA_50_Ratio",
    "BB_Upper_Ratio", "BB_Lower_Ratio", "RSI_Norm",
    "Volume_Ratio", "High_Low_Ratio", "Open_Close_Ratio",
]


def _load_trajectory_model() -> bool:
    """Load the LSTM model and scaler from disk. Returns True if successful."""
    global _lstm_model, _scaler_center, _scaler_scale, _model_config, _model_loaded

    weights_path = MODELS_DIR / "trajectory_lstm.pt"
    scaler_path = MODELS_DIR / "scaler_config.json"
    config_path = MODELS_DIR / "model_config.json"

    if not weights_path.exists():
        logger.warning(
            "LSTM weights not found at %s. "
            "Run the Colab training notebook and copy artifacts to backend/models/.",
            weights_path,
        )
        return False

    try:
        # Load model config
        if config_path.exists():
            with open(config_path) as f:
                _model_config = json.load(f)
        else:
            _model_config = {
                "input_dim": 9, "hidden_dim": 128, "num_layers": 2,
                "output_dim": 5, "dropout": 0.2,
            }

        # Instantiate and load weights
        _lstm_model = StockTrajectoryLSTM(
            input_dim=_model_config.get("input_dim", 9),
            hidden_dim=_model_config.get("hidden_dim", 128),
            num_layers=_model_config.get("num_layers", 2),
            output_dim=_model_config.get("output_dim", 5),
            dropout=_model_config.get("dropout", 0.2),
        )
        # Ensure CPU loading mapping
        state_dict = torch.load(weights_path, map_location="cpu", weights_only=True)
        _lstm_model.load_state_dict(state_dict)
        _lstm_model.eval()
        torch.set_grad_enabled(False)

        # Load scaler parameters
        if scaler_path.exists():
            with open(scaler_path) as f:
                scaler_data = json.load(f)
            _scaler_center = np.array(scaler_data["center"], dtype=np.float32)
            _scaler_scale = np.array(scaler_data["scale"], dtype=np.float32)
        else:
            logger.warning("Scaler config not found, using identity scaling")
            _scaler_center = np.zeros(9, dtype=np.float32)
            _scaler_scale = np.ones(9, dtype=np.float32)

        _model_loaded = True
        logger.info("✅ LSTM trajectory model loaded from %s", weights_path)
        return True

    except Exception as e:
        logger.error("Failed to load LSTM model: %s", e)
        return False


# Attempt to load on module import
_load_trajectory_model()


# ──────────────────────────────────────────────────────────────────────────────
# Feature Engineering (mirrors the Colab notebook exactly)
# ──────────────────────────────────────────────────────────────────────────────

def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Compute RSI and normalize to [-1.0, 1.0]."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
    rs = gain / loss.replace(0, 1e-10)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return (rsi - 50.0) / 50.0


def _engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute the 9 technical features matching the training pipeline."""
    close = df["Close"].copy()
    high = df["High"].copy()
    low = df["Low"].copy()
    open_ = df["Open"].copy()
    volume = df["Volume"].astype(float).copy()

    features = pd.DataFrame(index=df.index)

    features["Returns"] = close.pct_change()

    sma_20 = close.rolling(window=20).mean()
    sma_50 = close.rolling(window=50).mean()
    features["SMA_20_Ratio"] = sma_20 / close - 1.0
    features["SMA_50_Ratio"] = sma_50 / close - 1.0

    std_20 = close.rolling(window=20).std()
    features["BB_Upper_Ratio"] = (sma_20 + 2.0 * std_20) / close - 1.0
    features["BB_Lower_Ratio"] = (sma_20 - 2.0 * std_20) / close - 1.0

    features["RSI_Norm"] = _compute_rsi(close, period=14)

    vol_sma_20 = volume.rolling(window=20).mean()
    features["Volume_Ratio"] = volume / vol_sma_20.replace(0, 1e-10) - 1.0

    features["High_Low_Ratio"] = (high - low) / close.replace(0, 1e-10)
    features["Open_Close_Ratio"] = (close - open_) / open_.replace(0, 1e-10)

    return features


def _scale_features(features: np.ndarray) -> np.ndarray:
    """Apply the saved RobustScaler transformation: (X - center) / scale."""
    if _scaler_center is not None and _scaler_scale is not None:
        return (features - _scaler_center) / np.where(_scaler_scale == 0, 1.0, _scaler_scale)
    return features


def _get_next_trading_dates(n: int = 5) -> list[str]:
    """Generate the next N trading day date strings (skip weekends)."""
    dates = []
    current = datetime.now()
    while len(dates) < n:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Monday=0 to Friday=4
            dates.append(current.strftime("%Y-%m-%d"))
    return dates


# ──────────────────────────────────────────────────────────────────────────────
# Public API: get_stock_data (used by existing /api/stock/{ticker} endpoint)
# ──────────────────────────────────────────────────────────────────────────────

def get_stock_data(symbol: str) -> dict:
    """
    Fetch live stock data for a given symbol via yfinance.
    Returns a dictionary matching the StockData schema, including
    OHLC history for the PriceChart candlestick view.
    """
    symbol = symbol.upper()

    try:
        info = _get_ticker_info(symbol)

        # Current price — try multiple fields for resilience
        price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("previousClose")
            or 0.0
        )
        prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or price
        change = round(price - prev_close, 2) if price and prev_close else 0.0
        change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0

        # Fetch 1-month OHLCV history for the PriceChart candlestick view
        history_list = []
        try:
            hist = _get_historical_data(symbol, period="1mo", interval="1d")
            if not hist.empty:
                for idx, row in hist.iterrows():
                    date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                    history_list.append({
                        "date": date_str,
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(row["Close"]), 2),
                        "volume": int(row["Volume"]),
                    })
        except Exception as e:
            logger.warning("Failed to fetch OHLC history for %s: %s", symbol, e)

        return {
            "symbol": symbol,
            "name": info.get("shortName") or info.get("longName") or f"{symbol} Corporation",
            "price": round(price, 2),
            "change": change,
            "changePercent": change_pct,
            "high": info.get("dayHigh") or info.get("regularMarketDayHigh"),
            "low": info.get("dayLow") or info.get("regularMarketDayLow"),
            "open": info.get("open") or info.get("regularMarketOpen"),
            "previousClose": prev_close,
            "volume": info.get("volume") or info.get("regularMarketVolume"),
            "marketCap": info.get("marketCap"),
            "peRatio": info.get("trailingPE"),
            "history": history_list if history_list else None,
        }

    except Exception as e:
        logger.error("yfinance error for %s: %s — falling back to minimal data", symbol, e)
        raise ValueError(f"Could not fetch data for ticker '{symbol}': {e}")


# ──────────────────────────────────────────────────────────────────────────────
# Public API: search_company_ticker
# ──────────────────────────────────────────────────────────────────────────────

# Well-known company name → ticker mapping for instant resolution
_KNOWN_COMPANIES = {
    "apple": "AAPL",
    "google": "GOOGL",
    "alphabet": "GOOGL",
    "microsoft": "MSFT",
    "amazon": "AMZN",
    "tesla": "TSLA",
    "meta": "META",
    "facebook": "META",
    "netflix": "NFLX",
    "nvidia": "NVDA",
    "reliance": "RELIANCE.NS",
    "tata": "TCS.NS",
    "infosys": "INFY.NS",
}


def search_company_ticker(query: str) -> str:
    """
    Resolve a company name to a stock ticker symbol.
    Tries the known-companies map first, then yfinance search as fallback.
    """
    query_lower = query.lower().strip()

    # Fast path: known companies
    if query_lower in _KNOWN_COMPANIES:
        return _KNOWN_COMPANIES[query_lower]

    # If query looks like a ticker already (all uppercase, <= 5 chars), return it
    query_stripped = query.strip()
    if query_stripped.isupper() and len(query_stripped) <= 5 and query_stripped.isalpha():
        return query_stripped

    # Try yfinance search dynamically
    try:
        search_results = yf.Search(query_stripped)
        if hasattr(search_results, "quotes") and search_results.quotes:
            for quote in search_results.quotes:
                ticker = quote.get("symbol")
                if ticker:
                    logger.info("yfinance search: '%s' → %s", query, ticker)
                    return ticker
    except Exception as e:
        logger.warning("yfinance search failed for '%s': %s", query, e)

    # Last resort: generate a fallback ticker from the query
    fallback = query_stripped.upper()[:4] if len(query_stripped) >= 4 else query_stripped.upper()
    return fallback


# ──────────────────────────────────────────────────────────────────────────────
# Public API: get_stock_insights (LSTM inference + fundamentals + sentiment)
# ──────────────────────────────────────────────────────────────────────────────

def get_stock_insights(ticker: str) -> StockInsightsResponse:
    """
    End-to-end stock insights pipeline:
      1. Fetch live fundamentals via yfinance
      2. Fetch 40-day historical OHLCV data
      3. Compute technical features → run LSTM inference
      4. Convert predicted returns to real dollar prices
      5. Run local FinBERT sentiment analysis on recent news
      6. Assemble and return StockInsightsResponse
    """
    ticker = ticker.upper()

    # ── 1. Fetch Fundamentals ──────────────────────────────────────────────
    try:
        info = _get_ticker_info(ticker)
    except Exception as e:
        logger.error("yfinance info error for %s: %s", ticker, e)
        info = {}

    current_price = (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or info.get("previousClose")
        or 0.0
    )
    pe_ratio = info.get("trailingPE")
    market_cap = info.get("marketCap")
    profit_margins = info.get("profitMargins")
    debt_to_equity = info.get("debtToEquity")

    # ── 2. Fetch Historical Data (6 months for indicator warm-up) ──────────
    # Need 6mo because SMA_50 consumes 50 rows, leaving enough for lookback=30
    try:
        hist = _get_historical_data(ticker, period="6mo", interval="1d")
    except Exception as e:
        logger.error("yfinance history error for %s: %s", ticker, e)
        hist = pd.DataFrame()

    if hist.empty or len(hist) < 55:
        logger.warning("Insufficient history for %s (%d rows), using fallback", ticker, len(hist))
        return _fallback_insights(ticker, current_price, pe_ratio, market_cap,
                                  profit_margins, debt_to_equity)

    # Use the last available close as the anchor price
    latest_close = float(hist["Close"].iloc[-1])
    if current_price == 0.0:
        current_price = latest_close

    # ── 3. Feature Engineering ─────────────────────────────────────────────
    features_df = _engineer_features(hist)
    features_df = features_df.dropna()

    lookback = _model_config.get("lookback", 30) if _model_config else 30

    if len(features_df) < lookback:
        logger.warning("Not enough feature rows for %s (%d < %d)", ticker, len(features_df), lookback)
        return _fallback_insights(ticker, current_price, pe_ratio, market_cap,
                                  profit_margins, debt_to_equity)

    # Take the last `lookback` rows
    feature_values = features_df[FEATURE_COLUMNS].iloc[-lookback:].values.astype(np.float32)
    scaled_features = _scale_features(feature_values)

    # ── 4. LSTM Inference ──────────────────────────────────────────────────
    if _model_loaded and _lstm_model is not None:
        input_tensor = torch.from_numpy(scaled_features).unsqueeze(0)  # (1, 30, 9)
        with torch.no_grad():
            pred_returns, pred_volatility = _lstm_model(input_tensor)
        pred_returns = pred_returns.squeeze(0).numpy()        # (5,)
        pred_volatility = pred_volatility.squeeze(0).numpy()  # (5,)
    else:
        # Fallback: simple momentum extrapolation
        logger.info("LSTM model not loaded, using momentum fallback for %s", ticker)
        recent_returns = features_df["Returns"].iloc[-5:].values
        avg_return = float(np.mean(recent_returns)) if len(recent_returns) > 0 else 0.0
        pred_returns = np.array([avg_return * (i + 1) for i in range(5)], dtype=np.float32)
        avg_vol = float(np.std(recent_returns)) if len(recent_returns) > 0 else 0.01
        pred_volatility = np.full(5, avg_vol, dtype=np.float32)

    # ── 5. Convert Returns → Real Dollar Prices ───────────────────────────
    predicted_prices = []
    running_price = float(current_price)
    
    for ret in pred_returns:
        running_price = running_price * (1.0 + float(ret))
        predicted_prices.append(round(running_price, 2))
    volatility_upper = [
        round(float(predicted_prices[i] * (1.0 + pred_volatility[i])), 2)
        for i in range(5)
    ]
    volatility_lower = [
        round(float(predicted_prices[i] * (1.0 - pred_volatility[i])), 2)
        for i in range(5)
    ]

    # ── 6. Local FinBERT Sentiment ─────────────────────────────────────────
    try:
        from services.sentiment_service import analyze_ticker_sentiment
        sentiment_data = analyze_ticker_sentiment(ticker)
        sentiment_score = sentiment_data.get("sentiment_score", 0.0)
        sentiment_label = sentiment_data.get("sentiment_label", "NEUTRAL")
        headline_count = sentiment_data.get("headline_count", 0)
    except Exception as e:
        logger.warning("Sentiment analysis failed for %s: %s", ticker, e)
        sentiment_score = 0.0
        sentiment_label = "NEUTRAL"
        headline_count = 0

    # ── 7. Prediction Dates ────────────────────────────────────────────────
    prediction_dates = _get_next_trading_dates(5)

    return StockInsightsResponse(
        ticker=ticker,
        current_price=round(current_price, 2),
        pe_ratio=round(pe_ratio, 2) if pe_ratio is not None else None,
        market_cap=market_cap,
        profit_margins=round(profit_margins, 4) if profit_margins is not None else None,
        debt_to_equity=round(debt_to_equity, 2) if debt_to_equity is not None else None,
        predicted_prices=predicted_prices,
        volatility_upper=volatility_upper,
        volatility_lower=volatility_lower,
        sentiment_score=sentiment_score,
        sentiment_label=sentiment_label,
        prediction_dates=prediction_dates,
        headline_count=headline_count,
    )


def _fallback_insights(
    ticker: str,
    current_price: float,
    pe_ratio: Optional[float],
    market_cap: Optional[float],
    profit_margins: Optional[float],
    debt_to_equity: Optional[float],
) -> StockInsightsResponse:
    """Generate a flat-line fallback when LSTM inference is not possible."""
    if current_price == 0.0:
        current_price = 100.0  # Absolute last resort

    predicted_prices = [round(current_price, 2)] * 5
    vol_spread = current_price * 0.02  # ±2% default corridor
    volatility_upper = [round(current_price + vol_spread, 2)] * 5
    volatility_lower = [round(current_price - vol_spread, 2)] * 5

    return StockInsightsResponse(
        ticker=ticker,
        current_price=round(current_price, 2),
        pe_ratio=round(pe_ratio, 2) if pe_ratio is not None else None,
        market_cap=market_cap,
        profit_margins=round(profit_margins, 4) if profit_margins is not None else None,
        debt_to_equity=round(debt_to_equity, 2) if debt_to_equity is not None else None,
        predicted_prices=predicted_prices,
        volatility_upper=volatility_upper,
        volatility_lower=volatility_lower,
        sentiment_score=0.0,
        sentiment_label="NEUTRAL",
        prediction_dates=_get_next_trading_dates(5),
        headline_count=0,
    )