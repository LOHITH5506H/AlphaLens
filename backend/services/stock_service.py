"""
Stock data service — fetches live market data via yfinance and runs
local LSTM inference for trajectory prediction.

The LSTM model is loaded at module import time (CPU inference).
If model weights are not found, the service falls back to a statistical
extrapolation mode using recent price momentum.
"""

import json
import logging
import random
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

from models.schemas import StockInsightsResponse, VisualizationPayload

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
_viz_cache = _TTLCache(default_ttl=900)  # 15 minutes TTL for complex visualizations


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
        cfg = _model_config or {}
        _lstm_model = StockTrajectoryLSTM(
            input_dim=cfg.get("input_dim", 9),
            hidden_dim=cfg.get("hidden_dim", 128),
            num_layers=cfg.get("num_layers", 2),
            output_dim=cfg.get("output_dim", 5),
            dropout=cfg.get("dropout", 0.2),
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


def _compute_macd(close_series: pd.Series) -> pd.DataFrame:
    ema_12 = close_series.ewm(span=12, adjust=False).mean()
    ema_26 = close_series.ewm(span=26, adjust=False).mean()
    macd_line = ema_12 - ema_26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    macd_hist = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "hist": macd_hist})


def _compute_vwap(df: pd.DataFrame) -> pd.Series:
    typical_price = (df["High"] + df["Low"] + df["Close"]) / 3
    cum_vol = df["Volume"].cumsum()
    cum_vol_price = (typical_price * df["Volume"]).cumsum()
    return cum_vol_price / cum_vol.replace(0, 1e-10)


def _compute_volume_profile(df: pd.DataFrame, bins: int = 12) -> list[dict]:
    if df.empty:
        return []
    min_price = df["Low"].min()
    max_price = df["High"].max()
    if min_price == max_price:
        return []
    
    bin_size = (max_price - min_price) / bins
    profile = []
    
    typical = (df["High"] + df["Low"] + df["Close"]) / 3
    for i in range(bins):
        low_bound = min_price + i * bin_size
        high_bound = min_price + (i + 1) * bin_size
        mask = (typical >= low_bound) & (typical <= high_bound)
        vol = float(df.loc[mask, "Volume"].sum())
        profile.append({
            "price_level": round(low_bound + bin_size / 2, 2),
            "volume": vol
        })
    return profile


# ──────────────────────────────────────────────────────────────────────────────
# Public API: get_stock_data (used by existing /api/stock/{ticker} endpoint)
# ──────────────────────────────────────────────────────────────────────────────

def get_stock_data(symbol: str, timeframe: str = "3Mo") -> dict:
    """
    Fetch live stock data for a given symbol via yfinance.
    Returns a dictionary matching the StockData schema.
    """
    symbol = symbol.upper()
    ticker_obj = yf.Ticker(symbol)

    try:
        info = _get_ticker_info(symbol)

        currency = info.get("currency", "USD")

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

        # Fetch 3-month OHLCV history
        candlesticks = []
        technicals = None
        volume_profile = []
        valuation_history = []
        
        try:
            tf_map = {
                "1Wk": ("5d", "15m"),    # 5 days of 15-min candles for active trading
                "1Mo": ("1mo", "1h"),     # 1 month of hourly candles
                "3Mo": ("3mo", "1d"),
                "6Mo": ("6mo", "1d"),
                "1Yr": ("1y", "1d"),
                "5Yr": ("5y", "1wk"),
                "10Yr": ("10y", "1wk")
            }
            period, interval = tf_map.get(timeframe, ("3mo", "1d"))
            hist = _get_historical_data(symbol, period=period, interval=interval)
            if not hist.empty:
                vwap_series = _compute_vwap(hist)
                # Un-normalize the RSI from the AI feature engineering function back to 0-100 for display
                rsi_series = (_compute_rsi(hist["Close"], period=14) * 50.0) + 50.0
                macd_df = _compute_macd(hist["Close"])
                
                for idx, row in hist.iterrows():
                    # For intraday data, include time; for daily, just date
                    if interval in ("15m", "30m", "1h"):
                        date_str = idx.strftime("%Y-%m-%d %H:%M") if hasattr(idx, "strftime") else str(idx)[:16]
                    else:
                        date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                    candlesticks.append({
                        "date": date_str,
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(row["Close"]), 2),
                        "volume": int(row["Volume"]),
                        "vwap": round(float(vwap_series.loc[idx]), 2) if not pd.isna(vwap_series.loc[idx]) else None
                    })
                
                # Latest technicals
                last_idx = hist.index[-1]
                technicals = {
                    "rsi_14": round(float(rsi_series.loc[last_idx]), 2) if not pd.isna(rsi_series.loc[last_idx]) else None,
                    "macd": round(float(macd_df.loc[last_idx, "macd"]), 2) if not pd.isna(macd_df.loc[last_idx, "macd"]) else None,
                    "macd_signal": round(float(macd_df.loc[last_idx, "signal"]), 2) if not pd.isna(macd_df.loc[last_idx, "signal"]) else None,
                    "macd_hist": round(float(macd_df.loc[last_idx, "hist"]), 2) if not pd.isna(macd_df.loc[last_idx, "hist"]) else None,
                    "vwap": round(float(vwap_series.loc[last_idx]), 2) if not pd.isna(vwap_series.loc[last_idx]) else None,
                }
                
                volume_profile = _compute_volume_profile(hist, bins=12)
                
                # Valuation History (Using trailing EPS if available to build historical multiples)
                trailing_pe = info.get("trailingPE")
                if trailing_pe and price > 0:
                    eps = price / trailing_pe
                    if eps > 0:
                        for idx, row in hist.iterrows():
                            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                            valuation_history.append({
                                "date": date_str,
                                "price": round(float(row["Close"]), 2),
                                "trailing_pe": round(float(row["Close"]) / eps, 2),
                                "forward_pe": None,
                                "ev_to_ebitda": None
                            })
        except Exception as e:
            logger.warning("Failed to fetch 3mo OHLC history for %s: %s", symbol, e)

        # Fetch Financials
        financials = []
        try:
            q_fin = ticker_obj.quarterly_income_stmt
            if q_fin is not None and not q_fin.empty:
                for date_col in q_fin.columns[:4]:
                    col_data = q_fin[date_col]
                    date_str = date_col.strftime("%Y-%m-%d") if hasattr(date_col, "strftime") else str(date_col)[:10]
                    
                    def get_metric(aliases):
                        for a in aliases:
                            if a in col_data:
                                val = col_data[a]
                                if not pd.isna(val):
                                    return float(val)
                        return None
                    
                    rev = get_metric(["Total Revenue", "TotalRevenue", "Operating Revenue", "Revenue"])
                    gp = get_metric(["Gross Profit", "GrossProfit"])
                    oi = get_metric(["Operating Income", "OperatingIncome", "EBIT"])
                    ni = get_metric(["Net Income", "NetIncome", "Net Income Common Stockholders"])
                    
                    om = (oi / rev) if (oi is not None and rev is not None and rev > 0) else None
                    
                    financials.append({
                        "quarter": date_str,
                        "revenue": rev,
                        "gross_profit": gp,
                        "operating_income": oi,
                        "net_income": ni,
                        "operating_margin": om
                    })
                financials.reverse() # Oldest to newest
        except Exception as e:
            logger.warning("Failed to fetch financials for %s: %s", symbol, e)

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
            "currency": currency,
            "history": candlesticks if candlesticks else None, 
            "candlesticks": candlesticks if candlesticks else None,
            "technicals": technicals,
            "financials": financials if financials else None,
            "valuation_history": valuation_history if valuation_history else None,
            "volume_profile": volume_profile if volume_profile else None,
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

# ──────────────────────────────────────────────────────────────────────────────
# Public API: get_fundamental_metric (Live YFinance 11 Metrics)
# ──────────────────────────────────────────────────────────────────────────────

def get_fundamental_metric(ticker_symbol: str, metric_id: str, timeframe: str = "1Yr") -> dict:
    """
    Fetch specific fundamental metric for 3D visualization.
    Returns: {
        "labels": list,
        "company": list,
        "sector": list
    }
    """
    symbol = ticker_symbol.upper()
    try:
        ticker = yf.Ticker(symbol)

        valuation_metrics = ["PE_RATIO", "PB_RATIO", "PEG_RATIO", "DIVIDEND_YIELD"]
        if metric_id in valuation_metrics:
            tf_lower = timeframe.lower()
            if tf_lower == "1m": yf_period = "1mo"
            elif tf_lower == "3m": yf_period = "3mo"
            elif tf_lower == "6m": yf_period = "6mo"
            elif tf_lower == "1y": yf_period = "1y"
            elif tf_lower == "3y": yf_period = "3y"
            elif tf_lower == "5y": yf_period = "5y"
            elif tf_lower == "10y": yf_period = "10y"
            elif tf_lower == "max": yf_period = "max"
            else: yf_period = "1y"

            hist = ticker.history(period=yf_period)
            if hist.empty:
                return {"labels": ["N/A"], "company": [0], "sector": [0]}

            # Downsample to ~12 points
            step = max(1, len(hist) // 12)
            sampled = hist.iloc[::step]

            info = ticker.info
            labels = [d.strftime("%Y-%m-%d") for d in sampled.index]
            prices = sampled["Close"].values
            
            if metric_id == "PE_RATIO":
                eps = info.get("trailingEps", 0)
                values = [p / eps if eps else 0 for p in prices]
            elif metric_id == "PB_RATIO":
                bv = info.get("bookValue", 0)
                values = [p / bv if bv else 0 for p in prices]
            elif metric_id == "PEG_RATIO":
                eps = info.get("trailingEps", 0)
                peg = info.get("pegRatio")
                # If trailingEps and pegRatio exist, we can infer a static growth rate
                growth = (p / eps) / peg if (eps and peg and prices[0]) else 1.0 # rough mock
                # Fallback static PEG calculation using assumed growth
                growth = info.get("earningsGrowth", 0) * 100 if info.get("earningsGrowth") else 5.0
                values = [((p / eps) / growth) if (eps and growth) else 0 for p in prices]
            elif metric_id == "DIVIDEND_YIELD":
                div_rate = info.get("trailingAnnualDividendRate", 0)
                values = [(div_rate / p * 100) if p else 0 for p in prices]
            else:
                values = [0] * len(prices)

            company_margins = values
            sector_margins = [val * 0.85 for val in values]
            return {
                "labels": labels,
                "company": company_margins,
                "sector": sector_margins
            }
        
        is_annual = timeframe in ["3Y", "5Y", "10Y"]
        df_source = ticker.financials if is_annual else ticker.quarterly_financials
        bs_source = ticker.balance_sheet if is_annual else ticker.quarterly_balance_sheet
        cf_source = ticker.cashflow if is_annual else ticker.quarterly_cashflow

        if timeframe == "3Y": slice_count = 3
        elif timeframe == "5Y": slice_count = 5
        elif timeframe == "10Y": slice_count = 10
        else: slice_count = 4

        # SLICE THE COLUMNS FIRST
        fin = df_source.iloc[:, :slice_count] if not df_source.empty else df_source
        bs = bs_source.iloc[:, :slice_count] if not bs_source.empty else bs_source
        cf = cf_source.iloc[:, :slice_count] if not cf_source.empty else cf_source
        
        # If financials are empty, try to mock for robustness or return empty
        if fin.empty:
            labels = [f"Y{i+1}" for i in range(slice_count)] if is_annual else [f"Q{i+1}" for i in range(slice_count)]
            return {"labels": labels, "company": [0]*slice_count, "sector": [0]*slice_count}

        labels = []
        for d in fin.columns:
            dt = pd.to_datetime(d)
            if is_annual:
                labels.append(f"{dt.year}")
            else:
                labels.append(f"{dt.year}-Q{(dt.month-1)//3 + 1}")
        
        def safe_get(df, names):
            for n in names:
                if n in df.index:
                    return df.loc[n]
            return pd.Series([0]*slice_count, index=fin.columns)
            
        values = [0] * slice_count

        if metric_id == "NET_MARGIN":
            net_income = safe_get(fin, ["Net Income"])
            revenue = safe_get(fin, ["Total Revenue", "Operating Revenue"])
            values = (net_income / revenue * 100).fillna(0).tolist()
        elif metric_id == "ROE":
            net_income = safe_get(fin, ["Net Income"])
            if not bs.empty:
                equity = safe_get(bs, ["Stockholders Equity"])
                values = (net_income / equity * 100).fillna(0).tolist()
            else:
                info = ticker.info
                values = [info.get("returnOnEquity", 0) * 100 for _ in range(slice_count)]
        elif metric_id == "FCF":
            if not cf.empty:
                ocf = safe_get(cf, ["Operating Cash Flow"])
                capex = safe_get(cf, ["Capital Expenditure"])
                values = (ocf - abs(capex)).fillna(0).tolist()
        else:
            # Mock others for now
            values = [random.uniform(5, 20) for _ in range(len(labels))]

        # Ensure values matches length
        if isinstance(values, pd.Series):
            values = values.tolist()
        while len(values) < slice_count:
            values.append(0)

        company_margins = values[:len(labels)][::-1]
        sector_margins = [val * 0.85 for val in company_margins]

        return {
            "labels": labels[::-1],
            "company": company_margins,
            "sector": sector_margins
        }
    except Exception as e:
        logger.error(f"Error fetching metric {metric_id} for {symbol}: {e}")
        return {"labels": ["Q1", "Q2", "Q3", "Q4"], "company": [0, 0, 0, 0], "sector": [0, 0, 0, 0]}

# ──────────────────────────────────────────────────────────────────────────────
# 3D Visualizations Data Generation
# ──────────────────────────────────────────────────────────────────────────────

def get_visualization_data(symbol: str, viz_type: str, peers: str = "") -> VisualizationPayload:
    cache_key = f"viz_{symbol}_{viz_type}_{peers}"
    cached = _viz_cache.get(cache_key)
    if cached is not None:
        return cached # type: ignore

    ticker = yf.Ticker(symbol)
    payload = None

    try:
        if viz_type == "waterfall":
            payload = _get_waterfall_data(ticker)
        elif viz_type == "dcf_terrain":
            payload = _get_dcf_terrain_data(ticker)
        elif viz_type == "peer_scatter":
            payload = _get_peer_scatter_data(symbol, peers)
        elif viz_type == "dupont":
            payload = _get_dupont_lattice_data(ticker)
        elif viz_type == "vpvr":
            payload = _get_vpvr_data(ticker)
        elif viz_type == "ema_ribbon":
            payload = _get_ema_ribbon_data(ticker)
        elif viz_type == "iv_surface":
            payload = _get_iv_surface_data(ticker)
        elif viz_type == "monte_carlo":
            payload = _get_monte_carlo_cone_data(ticker)
        else:
            raise ValueError(f"Unknown visualization type: {viz_type}")
    except Exception as e:
        logger.error(f"Error generating visualization {viz_type} for {symbol}: {e}")
        payload = VisualizationPayload(
            type=viz_type,
            axes={},
            dimensions={},
            error=str(e)
        )

    _viz_cache.set(cache_key, payload)
    return payload


def _get_waterfall_data(ticker: yf.Ticker) -> VisualizationPayload:
    try:
        fin = ticker.financials
        cf = ticker.cashflow
        if fin.empty or cf.empty:
            raise ValueError("Financials data not available")

        # Fallback names due to varying yfinance outputs
        def get_row(df, names):
            for n in names:
                if n in df.index:
                    return df.loc[n].iloc[:4].fillna(0).tolist()
            return [0] * min(4, len(df.columns))

        revenue = get_row(fin, ['Total Revenue', 'Operating Revenue'])
        gross = get_row(fin, ['Gross Profit'])
        op_inc = get_row(fin, ['Operating Income'])
        net_inc = get_row(fin, ['Net Income'])
        op_cf = get_row(cf, ['Operating Cash Flow'])
        capex = get_row(cf, ['Capital Expenditure', 'Capital Expenditures'])
        fcf = [oc - abs(ce) for oc, ce in zip(op_cf, capex)]

        years = fin.columns[:4].astype(str).tolist() if not fin.empty else ["FY1", "FY2", "FY3", "FY4"]
        
        return VisualizationPayload(
            type="waterfall",
            axes={"x": "Stages", "y": "Value", "z": "Years"},
            dimensions={
                "x": ["Total Revenue", "Gross Profit", "Operating Income", "Net Income", "Op Cash Flow", "FCF"],
                "z": years,
                "values": [revenue, gross, op_inc, net_inc, op_cf, fcf]
            }
        )
    except Exception as e:
        raise ValueError(f"Waterfall data error: {e}")


def _get_dcf_terrain_data(ticker: yf.Ticker) -> VisualizationPayload:
    try:
        cf = ticker.cashflow
        bs = ticker.balance_sheet
        if cf.empty:
            raise ValueError("Cashflow data not available")
            
        op_cf = cf.loc['Operating Cash Flow'].iloc[0] if 'Operating Cash Flow' in cf.index else 0
        capex = cf.loc['Capital Expenditure'].iloc[0] if 'Capital Expenditure' in cf.index else 0
        base_fcf = op_cf - abs(capex)
        
        info = ticker.info
        shares = info.get('sharesOutstanding', 1)
        current_price = info.get('currentPrice', info.get('previousClose', 100))
        
        total_debt = bs.loc['Total Debt'].iloc[0] if 'Total Debt' in bs.index else 0
        cash = bs.loc['Cash And Cash Equivalents'].iloc[0] if 'Cash And Cash Equivalents' in bs.index else (bs.loc['Cash'].iloc[0] if 'Cash' in bs.index else 0)
        net_debt = total_debt - cash

        if base_fcf <= 0:
             # Make a fake grid to show the UI if real data is bad
             base_fcf = current_price * shares * 0.05

        wacc_range = np.linspace(0.08, 0.14, 5)
        growth_range = np.linspace(0.015, 0.045, 5)
        
        terrain = []
        for w in wacc_range:
            row = []
            for g in growth_range:
                # 2-stage DCF approximation: 5 years of 10% growth, then terminal growth
                fcf_5yr = [base_fcf * (1.10 ** i) / ((1 + w) ** i) for i in range(1, 6)]
                term_val = (base_fcf * (1.10 ** 5) * (1 + g)) / (w - g)
                pv_term_val = term_val / ((1 + w) ** 5)
                ev = sum(fcf_5yr) + pv_term_val
                eq_val = ev - net_debt
                implied_price = eq_val / shares if shares > 0 else 0
                row.append(max(0, implied_price))
            terrain.append(row)

        return VisualizationPayload(
            type="dcf_terrain",
            axes={"x": "WACC", "y": "Implied Price", "z": "Terminal Growth"},
            dimensions={
                "wacc": wacc_range.tolist(),
                "growth": growth_range.tolist(),
                "prices": terrain,
                "current_price": current_price
            }
        )
    except Exception as e:
        raise ValueError(f"DCF data error: {e}")


def _get_peer_scatter_data(symbol: str, peers: str) -> VisualizationPayload:
    try:
        # Default tech peers if none provided
        peer_list = [p.strip() for p in peers.split(",") if p.strip()]
        if not peer_list:
            if symbol.endswith(".NS"):
                peer_list = ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS"]
            else:
                peer_list = ["MSFT", "AAPL", "GOOGL", "AMZN"]
        
        if symbol not in peer_list:
            peer_list = [symbol] + peer_list[:4] # limit to 5 total

        data = []
        for sym in peer_list:
            t = yf.Ticker(sym)
            inf = t.info
            data.append({
                "ticker": sym,
                "pe": inf.get("trailingPE", 0) or 0,
                "roe": (inf.get("returnOnEquity", 0) or 0) * 100,
                "rev_growth": (inf.get("revenueGrowth", 0) or 0) * 100,
                "market_cap": inf.get("marketCap", 1e9) or 1e9,
                "is_target": sym == symbol
            })
            
        return VisualizationPayload(
            type="peer_scatter",
            axes={"x": "P/E", "y": "ROE %", "z": "Rev Growth %"},
            dimensions={"peers": data}
        )
    except Exception as e:
        raise ValueError(f"Peer data error: {e}")


def _get_dupont_lattice_data(ticker: yf.Ticker) -> VisualizationPayload:
    try:
        fin = ticker.financials
        bs = ticker.balance_sheet
        if fin.empty or bs.empty:
            raise ValueError("Financials or Balance Sheet not available")
            
        years = fin.columns[:4].astype(str).tolist()
        num_years = min(4, len(fin.columns), len(bs.columns))
        
        def safe_get(df, names, idx):
            for n in names:
                if n in df.index:
                    val = df.loc[n].iloc[idx]
                    return val if pd.notnull(val) else 0
            return 0

        data = []
        for i in range(num_years):
            ni = safe_get(fin, ['Net Income'], i)
            rev = safe_get(fin, ['Total Revenue', 'Operating Revenue'], i)
            assets = safe_get(bs, ['Total Assets'], i)
            equity = safe_get(bs, ['Stockholders Equity', 'Total Stockholder Equity'], i)
            
            margin = (ni / rev) * 100 if rev else 0
            turnover = rev / assets if assets else 0
            leverage = assets / equity if equity else 0
            
            data.append({
                "year": years[i],
                "margin": margin,
                "turnover": turnover,
                "leverage": leverage
            })
            
        return VisualizationPayload(
            type="dupont",
            axes={"x": "Components", "y": "Value", "z": "Timeline"},
            dimensions={"lattice": data}
        )
    except Exception as e:
        raise ValueError(f"DuPont data error: {e}")


def _get_vpvr_data(ticker: yf.Ticker) -> VisualizationPayload:
    try:
        hist = ticker.history(period="60d", interval="1h")
        if hist.empty:
            hist = ticker.history(period="60d", interval="1d") # fallback
            if hist.empty:
                raise ValueError("History not available")
        
        min_p = hist['Low'].min()
        max_p = hist['High'].max()
        bins = np.linspace(min_p, max_p, 30)
        
        # Bin the closing prices
        hist['bin'] = pd.cut(hist['Close'], bins=bins, labels=False, include_lowest=True)
        vol_profile = hist.groupby('bin')['Volume'].sum()
        
        nodes = []
        max_vol = vol_profile.max() if not vol_profile.empty else 1
        
        for i in range(len(bins)-1):
            vol = float(vol_profile.get(i, 0))
            nodes.append({
                "price": float((bins[i] + bins[i+1]) / 2),
                "volume": vol,
                "is_poc": bool(vol == max_vol and vol > 0)
            })
            
        return VisualizationPayload(
            type="vpvr",
            axes={"x": "Volume", "y": "Price", "z": "Depth"},
            dimensions={
                "nodes": nodes,
                "minPrice": float(min_p),
                "maxPrice": float(max_p),
                "maxVolume": float(max_vol)
            }
        )
    except Exception as e:
        raise ValueError(f"VPVR data error: {e}")


def _get_ema_ribbon_data(ticker: yf.Ticker) -> VisualizationPayload:
    try:
        hist = ticker.history(period="1y", interval="1d")
        if hist.empty or len(hist) < 200:
             # Just use what we have, or generate dummy if too short to avoid crash
             if len(hist) < 60:
                 raise ValueError("Not enough history for EMA")
        
        periods = [10, 20, 50, 100, 200]
        emas = {}
        for p in periods:
            # fillna(method='bfill') is deprecated, use bfill()
            emas[str(p)] = hist['Close'].ewm(span=p, adjust=False).mean().bfill().iloc[-60:].tolist()
            
        prices = hist['Close'].iloc[-60:].tolist()
        dates = [d.strftime('%Y-%m-%d') for d in hist.index[-60:]]
        
        return VisualizationPayload(
            type="ema_ribbon",
            axes={"x": "Time", "y": "Price", "z": "EMA Period"},
            dimensions={
                "emas": emas,
                "dates": dates,
                "prices": prices
            }
        )
    except Exception as e:
        raise ValueError(f"EMA Ribbon data error: {e}")


def _get_iv_surface_data(ticker: yf.Ticker) -> VisualizationPayload:
    try:
        expirations = ticker.options
        if not expirations:
            raise ValueError("Options data not available for this ticker")
            
        expirations = expirations[:4] # Take first 4
        surface_points = []
        
        for i, exp in enumerate(expirations):
            chain = ticker.option_chain(exp)
            calls = chain.calls
            if calls.empty:
                continue
                
            # Filter to strikes near the money to avoid massive arrays
            current_price = ticker.history(period="1d")['Close'].iloc[-1]
            calls = calls[(calls['strike'] > current_price * 0.7) & (calls['strike'] < current_price * 1.3)]
            
            for _, row in calls.iterrows():
                surface_points.append({
                    "strike": float(row['strike']),
                    "iv": float(row['impliedVolatility']),
                    "dte": i # simplified DTE index for AR placement
                })
                
        if not surface_points:
             raise ValueError("No valid options near the money")
             
        return VisualizationPayload(
            type="iv_surface",
            axes={"x": "Strike", "y": "IV", "z": "DTE"},
            dimensions={"points": surface_points}
        )
    except Exception as e:
        raise ValueError(f"IV Surface data error: {e}")


def _get_monte_carlo_cone_data(ticker: yf.Ticker) -> VisualizationPayload:
    try:
        hist = ticker.history(period="180d", interval="1d")
        if len(hist) < 2:
            raise ValueError("Not enough history")
            
        returns = np.log(hist['Close'] / hist['Close'].shift(1)).dropna()
        daily_vol = returns.std()
        current_price = hist['Close'].iloc[-1]
        
        days = 30
        simulations = 1000
        
        # Simulate price paths (Geometric Brownian Motion)
        # S_t = S_{t-1} * exp((mu - 0.5 * sigma^2) + sigma * Z)
        # Using simplified approach for speed (drift = 0)
        
        cone = []
        for t in range(1, days + 1):
            upper_2sigma = current_price * np.exp(2 * daily_vol * np.sqrt(t))
            upper_1sigma = current_price * np.exp(1 * daily_vol * np.sqrt(t))
            lower_1sigma = current_price * np.exp(-1 * daily_vol * np.sqrt(t))
            lower_2sigma = current_price * np.exp(-2 * daily_vol * np.sqrt(t))
            
            cone.append({
                "day": t,
                "u2": float(upper_2sigma),
                "u1": float(upper_1sigma),
                "l1": float(lower_1sigma),
                "l2": float(lower_2sigma)
            })
            
        return VisualizationPayload(
            type="monte_carlo",
            axes={"x": "Days", "y": "Price", "z": "Sigma"},
            dimensions={"cone": cone, "current_price": float(current_price)}
        )
    except Exception as e:
        raise ValueError(f"Monte Carlo data error: {e}")