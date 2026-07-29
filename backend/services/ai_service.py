"""
AI analysis service — integrates Google Gemini for financial analysis.

Uses structured output (response_schema) to guarantee valid JSON responses
matching our Pydantic models.
"""

import os
import json
import logging

from google import genai
from dotenv import load_dotenv

from models.schemas import StockData, AIAnalysis

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini client initialization
# ---------------------------------------------------------------------------

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Lazy-initialize the Gemini client."""
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key or api_key == "your_gemini_api_key_here":
            raise RuntimeError(
                "GEMINI_API_KEY is not configured. "
                "Copy .env.example to .env and add your key."
            )
        _client = genai.Client(api_key=api_key)
    return _client


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

ANALYST_SYSTEM_PROMPT = """You are an expert financial analyst AI assistant called AlphaLens.

You will receive structured financial data for a stock ticker. Analyze the data and provide:

1. **sentiment_score**: An integer from 0 to 100 representing your overall confidence.
   - 0-30: Very bearish / Sell signal
   - 31-50: Bearish / Lean Sell
   - 51-65: Neutral / Hold
   - 66-80: Bullish / Lean Buy
   - 81-100: Very bullish / Strong Buy

2. **recommendation**: Exactly one of "Buy", "Hold", or "Sell".

3. **explanation**: A concise 2-3 sentence explanation of your reasoning. Reference specific metrics (PE ratio, EPS, price trend) to justify your recommendation. Keep it accessible to a retail investor.

Important rules:
- Base your analysis ONLY on the provided data. Do not hallucinate additional information.
- If key metrics are missing (null), note this uncertainty and be more conservative.
- Consider the 1-month price trend direction (rising/falling/flat).
- Compare PE ratio to general market benchmarks (~20-25 for S&P 500 average).
"""

VOICE_SYSTEM_PROMPT = """You are AlphaLens, an AR investment assistant. The user has spoken a voice command while viewing financial data for a stock.

Parse the user's intent and respond with a JSON object containing:
- "intent": one of ["show_pe", "show_eps", "show_market_cap", "show_price", "show_chart", "show_news", "ai_analysis", "show_volume", "show_sector", "show_all", "unknown"]
- "message": a brief, friendly response to the user (1-2 sentences)
- "data": null (or relevant extra data if needed)

Be flexible with natural language — "What's the PE?" and "Show me price to earnings" should both map to "show_pe".
If the intent is unclear, use "unknown" and ask for clarification in the message.
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def analyze_stock(stock_data: StockData) -> AIAnalysis:
    """
    Send stock data to Gemini and get a structured AI analysis.

    Uses Gemini's structured output mode (response_schema) to guarantee
    the response matches our AIAnalysis Pydantic model exactly.
    """
    client = _get_client()

    # Format the stock data as a readable prompt
    price_trend = "N/A"
    if len(stock_data.price_history) >= 2:
        first_price = stock_data.price_history[0].close
        last_price = stock_data.price_history[-1].close
        change_pct = ((last_price - first_price) / first_price) * 100
        price_trend = f"{change_pct:+.2f}% over 1 month (${first_price:.2f} → ${last_price:.2f})"

    user_prompt = f"""Analyze the following stock data:

Ticker: {stock_data.ticker}
Company: {stock_data.name}
Current Price: ${stock_data.current_price}
Market Cap: ${stock_data.market_cap:,} if stock_data.market_cap else "N/A"
PE Ratio (Trailing): {stock_data.pe_ratio if stock_data.pe_ratio else "N/A"}
EPS (Trailing): ${stock_data.eps if stock_data.eps else "N/A"}
52-Week High: ${stock_data.fifty_two_week_high}
52-Week Low: ${stock_data.fifty_two_week_low}
Volume: {stock_data.volume:,} if stock_data.volume else "N/A"
Sector: {stock_data.sector or "N/A"}
1-Month Price Trend: {price_trend}

Provide your investment analysis."""

    logger.info("Sending analysis request to Gemini for %s", stock_data.ticker)

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=user_prompt,
            config={
                "system_instruction": ANALYST_SYSTEM_PROMPT,
                "response_mime_type": "application/json",
                "response_schema": AIAnalysis,
                "temperature": 0.3,
            },
        )

        if response.text is None:
            raise ValueError("No text returned from Gemini API")
            
        # The response is guaranteed to be valid JSON matching AIAnalysis
        result = AIAnalysis.model_validate_json(response.text)
        logger.info(
            "Gemini analysis for %s: %s (score: %d)",
            stock_data.ticker,
            result.recommendation,
            result.sentiment_score,
        )
        return result

    except Exception as e:
        logger.error("Gemini API error for %s: %s", stock_data.ticker, e)
        # Return a safe fallback rather than crashing the endpoint
        return AIAnalysis(
            sentiment_score=50,
            recommendation="Hold",
            explanation=f"AI analysis is temporarily unavailable ({type(e).__name__}). "
            "Please try again shortly. Based on available data, a Hold stance is recommended "
            "until a full analysis can be performed.",
        )


async def process_voice_command(transcript: str, ticker: str) -> dict:
    """
    Parse a voice command transcript using Gemini and return a structured response.

    Args:
        transcript: Raw speech-to-text output from the user.
        ticker: The currently active ticker in the AR view.

    Returns:
        Dict with keys: intent, message, data.
    """
    client = _get_client()

    user_prompt = f"""The user is currently viewing financial data for {ticker}.
They said: "{transcript}"

Parse their intent and respond."""

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=user_prompt,
            config={
                "system_instruction": VOICE_SYSTEM_PROMPT,
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        )

        if response.text is None:
            raise ValueError("No text returned from Gemini API")
            
        result = json.loads(response.text)
        logger.info("Voice command parsed: '%s' → intent=%s", transcript, result.get("intent"))
        return result

    except Exception as e:
        logger.error("Voice command processing error: %s", e)
        return {
            "intent": "unknown",
            "message": "Sorry, I couldn't understand that. Try saying something like 'Show me the PE ratio'.",
            "data": None,
        }


async def recognize_logo(base64_image: str) -> str:
    """
    Uses Gemini Vision to identify a company logo from a base64 image string.
    Returns the stock ticker symbol, or 'NONE' if no logo is detected.
    """
    import base64
    from google.genai import types

    # Clean up base64 string if it contains the data URI prefix
    if "," in base64_image:
        base64_image = base64_image.split(",")[1]

    try:
        image_bytes = base64.b64decode(base64_image)
    except Exception as e:
        logger.error("Failed to decode base64 image: %s", e)
        return "NONE"

    client = _get_client()
    
    prompt = """Analyze this image carefully. If you see a prominent company logo (like Apple, Tesla, Microsoft, Nike, etc), return ONLY the official stock ticker symbol for that company (e.g., AAPL, TSLA, MSFT). 
If it is an Indian company like Reliance, return RELIANCE.NS. 
If you see multiple logos, return the most prominent one.
If no clear company logo is found, return exactly the word NONE. Do not provide any other explanation or text."""

    logger.info("Sending image to Gemini Vision for logo recognition...")

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                prompt
            ],
            config={
                "temperature": 0.0, # Zero temp for deterministic factual output
            }
        )

        if not response.text:
            return "NONE"
            
        ticker = response.text.strip().upper()
        # Clean up any extra formatting Gemini might accidentally include
        ticker = ticker.replace('"', '').replace("'", "").replace("`", "")
        
        logger.info("Vision API detected logo: %s", ticker)
        return ticker
        
    except Exception as e:
        logger.error("Vision API error during logo recognition: %s", e)
        return "NONE"

