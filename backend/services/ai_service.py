"""
AI analysis service — integrates Google Gemini for financial analysis.

Uses structured output (response_schema) to guarantee valid JSON responses
matching our Pydantic models.
"""

import os
import json
import logging
import asyncio
import typing

from google import genai
from dotenv import load_dotenv

from models.schemas import StockData, AIAnalysis

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini client initialization
# ---------------------------------------------------------------------------

_client: genai.Client | None = None

FALLBACK_MODELS = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

async def generate_with_fallback(client: genai.Client, contents, config: typing.Any, max_retries_per_model: int = 2):
    """
    Attempts to generate content using a list of fallback models.
    If a rate limit (429) or quota error is encountered, it immediately falls back to the next model.
    Other errors are retried up to `max_retries_per_model` times before falling back.
    """
    last_exception = None
    for model in FALLBACK_MODELS:
        for attempt in range(max_retries_per_model):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                text = response.text
                if text is None:
                    raise ValueError(f"No text returned from {model} API")
                return response
            except Exception as e:
                last_exception = e
                error_str = str(e).lower()
                is_rate_limit = (
                    (hasattr(e, 'code') and e.code == 429) or
                    '429' in error_str or
                    'quota' in error_str or
                    'exhausted' in error_str or
                    'rate limit' in error_str
                )

                if is_rate_limit:
                    logger.warning("Rate limit/Quota hit for model %s: %s. Falling back to next model.", model, e)
                    break  # Break retry loop, proceed to next model
                
                if attempt < max_retries_per_model - 1:
                    logger.warning("API error for %s (attempt %d/%d): %s. Retrying in 2s...", model, attempt + 1, max_retries_per_model, e)
                    await asyncio.sleep(2)
                else:
                    logger.warning("Max retries reached for model %s. Falling back to next model.", model)
    
    logger.error("All fallback models failed. Last exception: %s", last_exception)
    raise last_exception if last_exception else RuntimeError("All fallback models failed.")


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

VOICE_SYSTEM_PROMPT = """You are AlphaLens, an AR investment assistant and spatial financial terminal. The user has spoken a voice command while viewing financial data for a stock.

Parse the user's intent and respond with a JSON object containing:
- "intent": one of [
    "show_pe", "show_eps", "show_market_cap", "show_price", "show_chart", "show_news", "ai_analysis", "show_volume", "show_sector", "show_all",
    "stress_test_bear", "stress_test_bull", "stress_test_base",
    "show_dcf", "show_peers", "show_dupont", "show_vpvr", "show_contagion_graph",
    "switch_trader", "switch_investor", "pitch_mode", "compare_ticker",
    "unknown"
  ]
- "message": a brief, friendly response to the user (1-2 sentences)
- "data": null (or relevant extra data if needed, e.g. {"action": "compare_ticker", "target": "AAPL"})

Examples of mappings:
- "stress test bear case", "bear case", "test downside" -> "stress_test_bear"
- "stress test bull case", "bull case", "test upside" -> "stress_test_bull"
- "base case", "reset scenario", "reset stress test" -> "stress_test_base"
- "show dcf terrain", "discounted cash flow", "dcf model", "show dcf" -> "show_dcf"
- "show peer scatter", "compare peers", "show peers", "peer analysis" -> "show_peers"
- "show dupont tree", "dupont decomposition", "dupont" -> "show_dupont"
- "show volume profile", "show vpvr", "volume shelves", "poc" -> "show_vpvr"
- "show contagion graph", "supply chain", "ecosystem network", "tsmc suppliers" -> "show_contagion_graph"
- "switch to trader", "trader mode", "timing mode", "show candlesticks" -> "switch_trader"
- "switch to investor", "investor mode", "valuation mode", "thesis lab" -> "switch_investor"
- "pitch mode", "broadcast mode", "presentation mode", "studio mode" -> "pitch_mode"
- "compare with apple", "battle mode against tesla", "vs msft" -> "compare_ticker" with data: {"action": "compare_ticker", "target": "AAPL"}
- "exit battle mode", "stop battle", "compare off" -> "compare_ticker" with data: {"action": "compare_ticker", "target": "OFF"}

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
    hist_list = stock_data.candlesticks or stock_data.history or stock_data.price_history or []
    if len(hist_list) >= 2:
        first = hist_list[0]
        last = hist_list[-1]
        first_price = getattr(first, 'close', None) or (first.get('close') if isinstance(first, dict) else None) or 0
        last_price = getattr(last, 'close', None) or (last.get('close') if isinstance(last, dict) else None) or 0
        if first_price:
            change_pct = ((last_price - first_price) / first_price) * 100
            price_trend = f"{change_pct:+.2f}% over 1 month (${first_price:.2f} → ${last_price:.2f})"

    sym = stock_data.symbol or stock_data.ticker or "N/A"
    curr_px = stock_data.price if stock_data.price is not None else (stock_data.current_price or 0.0)
    eps_val = getattr(stock_data, "eps", None) or "N/A"
    hi_val = stock_data.high if stock_data.high is not None else (getattr(stock_data, "fifty_two_week_high", None) or "N/A")
    lo_val = stock_data.low if stock_data.low is not None else (getattr(stock_data, "fifty_two_week_low", None) or "N/A")
    vol_val = f"{stock_data.volume:,}" if stock_data.volume else "N/A"
    mcap_val = f"${stock_data.market_cap:,}" if stock_data.market_cap else "N/A"
    sec_val = getattr(stock_data, "sector", None) or "N/A"

    user_prompt = f"""Analyze the following stock data:

Ticker: {sym}
Company: {stock_data.name}
Current Price: ${curr_px}
Market Cap: {mcap_val}
PE Ratio (Trailing): {stock_data.pe_ratio if stock_data.pe_ratio else "N/A"}
EPS (Trailing): ${eps_val}
52-Week High: ${hi_val}
52-Week Low: ${lo_val}
Volume: {vol_val}
Sector: {sec_val}
1-Month Price Trend: {price_trend}

Provide your investment analysis."""

    logger.info("Sending analysis request to Gemini for %s", sym)

    try:
        response = await generate_with_fallback(
            client=client,
            contents=user_prompt,
            config={
                "system_instruction": ANALYST_SYSTEM_PROMPT,
                "response_mime_type": "application/json",
                "response_schema": AIAnalysis,
                "temperature": 0.3,
            }
        )
        text = response.text
        if not text:
            raise ValueError("No text returned from Gemini API")

        # The response is guaranteed to be valid JSON matching AIAnalysis
        result = AIAnalysis.model_validate_json(text)
        score_val = result.sentiment_score if result.sentiment_score is not None else (result.score or 50.0)
        logger.info(
            "Gemini analysis for %s: %s (score: %s)",
            sym,
            result.recommendation,
            score_val,
        )
        return result

    except Exception as e:
        logger.error("Gemini API error for %s after all fallbacks: %s", sym, e)
        # Return a safe fallback rather than crashing the endpoint
        return AIAnalysis(
            sentiment_score=50,
            score=50.0,
            sentiment="Neutral",
            recommendation="Hold",
            explanation="AI analysis temporarily unavailable due to server demand. Displaying raw financial data.",
            summary="AI analysis temporarily unavailable due to server demand. Displaying raw financial data."
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
    # Fast-path deterministic parsing for high-value analyst workflows
    t_lower = transcript.lower().strip()
    if any(k in t_lower for k in ["contagion", "supply chain", "ecosystem", "tsmc", "suppliers"]):
        return {
            "intent": "show_contagion_graph",
            "action": "show_contagion_graph",
            "target": "contagion_graph",
            "message": f"Opening 3D Supply-Chain & Ecosystem Contagion Graph for {ticker}",
            "data": {"action": "show_contagion_graph", "target": "contagion_graph"},
        }
    if any(k in t_lower for k in ["bear case", "stress test bear", "downside scenario"]):
        return {"intent": "stress_test_bear", "message": f"Stress-testing Bear Case for {ticker}: WACC +1.5%, Growth -1.0%, Margins -2.5%", "data": None}
    if any(k in t_lower for k in ["bull case", "stress test bull", "upside scenario"]):
        return {"intent": "stress_test_bull", "message": f"Stress-testing Bull Case for {ticker}: WACC -1.0%, Growth +1.0%, Margins +2.0%", "data": None}
    if any(k in t_lower for k in ["base case", "reset scenario", "reset stress test", "normal case"]):
        return {"intent": "stress_test_base", "message": f"Resetting {ticker} to Base Case scenario", "data": None}
    if any(k in t_lower for k in ["show dcf", "dcf terrain", "discounted cash flow", "valuation surface"]):
        return {"intent": "show_dcf", "message": f"Opening 3D DCF Sensitivity Terrain for {ticker}", "data": None}
    if any(k in t_lower for k in ["show peer", "peer scatter", "compare peers", "peer cloud"]):
        return {"intent": "show_peers", "message": f"Opening 3D Peer Pareto Scatter Cloud for {ticker}", "data": None}
    if any(k in t_lower for k in ["dupont", "dupont tree", "roe tree"]):
        return {"intent": "show_dupont", "message": f"Opening 3D DuPont ROE Decomposition for {ticker}", "data": None}
    if any(k in t_lower for k in ["volume profile", "show vpvr", "vpvr", "volume shelves", "poc"]):
        return {"intent": "show_vpvr", "message": f"Opening VPVR Institutional Volume Shelves for {ticker}", "data": None}
    if any(k in t_lower for k in ["switch to trader", "trader mode", "timing mode", "show candlesticks"]):
        return {"intent": "switch_trader", "message": "Switching to Technical & Catalyst Timing Mode", "data": None}
    if any(k in t_lower for k in ["switch to investor", "investor mode", "valuation mode", "thesis lab"]):
        return {"intent": "switch_investor", "message": "Switching to Valuation & Thesis Lab Mode", "data": None}
    if any(k in t_lower for k in ["pitch mode", "broadcast mode", "presentation mode", "studio mode"]):
        return {"intent": "pitch_mode", "message": "Toggling Presentation & Pitch Studio Mode", "data": None}
    if any(k in t_lower for k in ["iv surface", "implied vol", "volatility surface", "options surface", "gamma surface"]):
        return {"intent": "show_iv_surface", "message": f"Opening 3D Options Implied Volatility & Gamma Surface for {ticker}", "data": None}
    if any(k in t_lower for k in ["auto tour", "start tour", "pitch tour", "presentation tour", "run tour"]):
        return {"intent": "auto_pitch_tour", "message": "Launching autonomous 4-stage Pitch Studio tour", "data": None}
    if any(k in t_lower for k in ["debate", "bull bear", "bull vs bear", "ic debate", "committee debate"]):
        return {"intent": "bull_bear_debate", "message": "Convening Investment Committee Bull versus Bear Debate", "data": None}

    # Dual-Ticker 3D Battle Mode Voice Commands
    if any(k in t_lower for k in ["exit battle mode", "close battle mode", "exit battle", "stop compare", "compare off", "turn off battle"]):
        return {
            "intent": "compare_ticker",
            "action": "compare_ticker",
            "target": "OFF",
            "message": "Exiting 3D Head-to-Head Battle Mode",
            "data": {"action": "compare_ticker", "target": "OFF"}
        }

    peer_map = {
        "AAPL": ["apple", "aapl"],
        "NVDA": ["nvidia", "nvda"],
        "TSLA": ["tesla", "tsla"],
        "MSFT": ["microsoft", "msft"],
        "GOOGL": ["google", "alphabet", "googl", "goog"]
    }
    for peer, names in peer_map.items():
        if any(
            f"compare with {n}" in t_lower or
            f"compare to {n}" in t_lower or
            f"battle mode against {n}" in t_lower or
            f"battle against {n}" in t_lower or
            f"battle mode {n}" in t_lower or
            f"battle {n}" in t_lower or
            f"vs {n}" in t_lower or
            f"versus {n}" in t_lower or
            f"compare {ticker.lower()} and {n}" in t_lower
            for n in names
        ):
            return {
                "intent": "compare_ticker",
                "action": "compare_ticker",
                "target": peer,
                "message": f"Entering 3D Head-to-Head Battle Mode: {ticker} vs {peer}",
                "data": {"action": "compare_ticker", "target": peer}
            }

    # Search / Switch ticker voice commands with typo tolerance (e.g. "switch to epp" -> AAPL)
    for prefix in ["switch to ", "show ", "open ", "search for ", "search ", "look up ", "load "]:
        if t_lower.startswith(prefix):
            target_query = t_lower[len(prefix):].strip()
            # Ignore mode switches like "switch to trader" or "switch to investor"
            if target_query not in ["trader", "investor", "pitch mode"]:
                from services.stock_service import search_company_ticker
                resolved = search_company_ticker(target_query)
                if resolved:
                    return {
                        "intent": "switch_ticker",
                        "action": "switch_ticker",
                        "target": resolved,
                        "message": f"Switching to {resolved}",
                        "data": {"action": "switch_ticker", "target": resolved}
                    }

    client = _get_client()

    user_prompt = f"""The user is currently viewing financial data for {ticker}.
They said: "{transcript}"

Parse their intent and respond."""

    try:
        response = await generate_with_fallback(
            client=client,
            contents=user_prompt,
            config={
                "system_instruction": VOICE_SYSTEM_PROMPT,
                "response_mime_type": "application/json",
                "temperature": 0.2,
            }
        )
        text = response.text
        if not text:
            raise ValueError("No text returned from Gemini API")
            
        result = json.loads(text)
        logger.info("Voice command parsed: '%s' → intent=%s", transcript, result.get("intent"))
        return result

    except Exception as e:
        logger.warning("Gemini voice parsing failed, using rule-based fallback for '%s': %s", transcript, e)
        # Fallback keyword checks
        if "pe" in t_lower or "ratio" in t_lower:
            return {"intent": "show_pe", "message": f"Displaying P/E multiple analysis for {ticker}.", "data": None}
        if "chart" in t_lower or "price" in t_lower:
            return {"intent": "show_chart", "message": f"Displaying interactive price action for {ticker}.", "data": None}
        return {
            "intent": "unknown",
            "message": "Try commands like 'stress test bull case', 'show DCF terrain', or 'pitch mode'.",
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
        response = await generate_with_fallback(
            client=client,
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

