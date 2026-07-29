"""
Stock data service — wraps yfinance to fetch and cache financial data.

Uses a time-based cache to avoid hammering Yahoo Finance on repeated requests.
Cache entries expire after 5 minutes.
"""

import time
import logging
from typing import Any

import yfinance as yf

from models.schemas import StockData, PricePoint

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple TTL cache (avoids external dependencies like Redis)
# ---------------------------------------------------------------------------
_cache: dict[str, tuple[float, StockData]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_cached(ticker: str) -> StockData | None:
    """Return cached data if it exists and hasn't expired."""
    if ticker in _cache:
        timestamp, data = _cache[ticker]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            logger.info("Cache HIT for %s", ticker)
            return data
        else:
            del _cache[ticker]
    return None


def _set_cached(ticker: str, data: StockData) -> None:
    """Store data in cache with current timestamp."""
    _cache[ticker] = (time.time(), data)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_stock_data(ticker: str) -> StockData:
    """
    Fetch comprehensive stock data for the given ticker symbol.

    Returns a StockData object with current price, fundamentals, and
    1-month daily price history for charting.

    Raises:
        ValueError: If the ticker is invalid or no data is available.
    """
    ticker = ticker.upper().strip()

    # Check cache first
    cached = _get_cached(ticker)
    if cached is not None:
        return cached

    logger.info("Fetching fresh data for %s from Yahoo Finance", ticker)

    try:
        stock = yf.Ticker(ticker)
        info: dict[str, Any] = stock.info

        # Validate that we got meaningful data back
        name = info.get("longName") or info.get("shortName")
        if not name:
            raise ValueError(
                f"Ticker '{ticker}' not found or returned no data. "
                "Please check the symbol and try again."
            )

        # Extract current price — yfinance uses different keys depending on
        # market state (pre/post/regular)
        current_price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("previousClose")
        )

        # Fetch 1-month daily history for the sparkline chart
        hist = stock.history(period="1mo", interval="1d")
        price_history: list[PricePoint] = []
        if not hist.empty:
            for date_idx, row in hist.iterrows():
                price_history.append(
                    PricePoint(
                        date=date_idx.strftime("%Y-%m-%d"),
                        close=round(row["Close"], 2),
                    )
                )

        stock_data = StockData(
            ticker=ticker,
            name=name,
            current_price=round(current_price, 2) if current_price else None,
            market_cap=info.get("marketCap"),
            pe_ratio=round(info["trailingPE"], 2) if info.get("trailingPE") else None,
            eps=round(info["trailingEps"], 2) if info.get("trailingEps") else None,
            fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
            fifty_two_week_low=info.get("fiftyTwoWeekLow"),
            volume=info.get("volume") or info.get("regularMarketVolume"),
            sector=info.get("sector"),
            price_history=price_history,
        )

        _set_cached(ticker, stock_data)
        return stock_data

    except ValueError:
        raise  # Re-raise our own validation errors
    except Exception as e:
        logger.error("Failed to fetch data for %s: %s", ticker, e)
        raise ValueError(
            f"Error fetching data for '{ticker}': {str(e)}"
        ) from e
