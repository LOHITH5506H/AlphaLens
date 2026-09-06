"""
FinBERT sentiment analysis service — local CPU inference.

Loads ProsusAI/FinBERT from backend/models/finbert/ at startup and
provides both single-text and ticker-aggregate sentiment analysis.

All inference is forced to CPU per the hardware constraint.
"""

import logging
from pathlib import Path

import torch
from transformers import BertTokenizer, BertForSequenceClassification

# Dynamically resolves to backend/models/finbert regardless of execution directory
BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = str(BASE_DIR / "models" / "finbert")

logger = logging.getLogger(__name__)


class FinancialSentimentModel:
    tokenizer: BertTokenizer
    model: BertForSequenceClassification
    labels = {0: "positive", 1: "negative", 2: "neutral"}

    def __init__(self, model_path: str = MODEL_PATH):
        # Force CPU — no GPU on this machine
        self.device = torch.device("cpu")

        if not Path(model_path).exists():
            raise FileNotFoundError(
                f"Model weights not found at {model_path}. Did you run the download script?"
            )

        logger.info("Loading local FinBERT model onto %s...", self.device)

        tokenizer = BertTokenizer.from_pretrained(model_path, local_files_only=True)
        model = BertForSequenceClassification.from_pretrained(model_path, local_files_only=True)

        assert tokenizer is not None, "Failed to load tokenizer"
        assert model is not None, "Failed to load model"

        self.tokenizer = tokenizer
        self.model = model.to(self.device)
        self.model.eval()

    def predict(self, text: str) -> dict:
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        ).to(self.device)

        with torch.no_grad():
            outputs = self.model(**inputs)
            probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]

        probs_list: list[float] = probabilities.tolist()
        top_class_id: int = int(torch.argmax(probabilities).item())

        pos_score = round(probs_list[0], 4) if len(probs_list) > 0 else 0.0
        neg_score = round(probs_list[1], 4) if len(probs_list) > 1 else 0.0
        neu_score = round(probs_list[2], 4) if len(probs_list) > 2 else 0.0

        label_str = self.labels.get(top_class_id, "unknown")
        max_score = round(probs_list[top_class_id], 4) if top_class_id < len(probs_list) else 0.0

        probs_dict = {
            "positive": pos_score,
            "negative": neg_score,
            "neutral": neu_score,
        }

        return {
            "label": label_str,
            "score": max_score,
            "probabilities": probs_dict,
            "positive": pos_score,
            "negative": neg_score,
            "neutral": neu_score,
        }


# Initialize singleton instance
sentiment_model = FinancialSentimentModel()


def analyze_sentiment(text: str) -> dict:
    """
    Wrapper function expected by main.py to handle sentiment analysis requests.
    """
    return sentiment_model.predict(text)


def _extract_headline_title(item: object) -> str | None:
    """
    Robustly extract a headline title from a yfinance news item.
    Highly fault-tolerant and recursive.
    """
    if isinstance(item, str):
        stripped = item.strip()
        return stripped if len(stripped) > 5 else None

    if isinstance(item, list):
        for i in item:
            res = _extract_headline_title(i)
            if res:
                return res
        return None

    if isinstance(item, dict):
        # Prioritize known keys
        for key in ["title", "headline", "summary"]:
            val = item.get(key)
            if isinstance(val, str) and len(val.strip()) > 5:
                return val.strip()

        # Recurse over values
        for val in item.values():
            res = _extract_headline_title(val)
            if res:
                return res

    return None


def analyze_ticker_sentiment(ticker: str) -> dict:
    """
    Scrape recent headlines for a ticker via yfinance, run batch inference
    through the local FinBERT model, and return an aggregated sentiment payload.

    Returns:
        dict: {
            "sentiment_label": str (BULLISH, NEUTRAL, or BEARISH),
            "sentiment_score": float (confidence percentage),
            "headline_count": int (number of articles analyzed)
        }
    """
    import yfinance as yf

    try:
        stock = yf.Ticker(ticker)
        news_items = stock.news or []
    except Exception as e:
        logger.warning("Failed to fetch news for %s: %s", ticker, e)
        news_items = []

    # Extract headline titles from the news feed
    headlines: list[str] = []
    for item in news_items[:15]:  # Cap at 15 most recent
        title = _extract_headline_title(item)
        if title:
            headlines.append(title)

    if not headlines:
        logger.info("No news headlines found for %s, returning neutral sentiment", ticker)
        return {
            "sentiment_label": "NEUTRAL",
            "sentiment_score": 0.0,
            "headline_count": 0
        }

    # Run FinBERT inference on each headline and aggregate
    scores: list[float] = []
    for headline in headlines:
        try:
            result = sentiment_model.predict(headline)
            pos = result.get("positive", 0.0)
            neg = result.get("negative", 0.0)
            # Map to [-1, 1]: positive contributes positively, negative negatively
            score = pos - neg
            scores.append(score)
        except Exception as e:
            logger.warning("Sentiment inference failed for headline '%s': %s", headline[:50], e)
            continue

    if not scores:
        return {
            "sentiment_label": "NEUTRAL",
            "sentiment_score": 0.0,
            "headline_count": 0
        }

    # Aggregate: mean of all headline scores
    avg_score = sum(scores) / len(scores)
    # Clamp to [-1.0, 1.0]
    avg_score = max(-1.0, min(1.0, avg_score))

    # Classify
    if avg_score >= 0.15:
        label = "BULLISH"
    elif avg_score <= -0.15:
        label = "BEARISH"
    else:
        label = "NEUTRAL"
        
    # Convert score to confidence percentage
    percentage_score = round(avg_score * 100, 2)

    logger.info(
        "Sentiment for %s: %.2f%% (%s) from %d headlines",
        ticker, percentage_score, label, len(scores),
    )
    return {
        "sentiment_label": label,
        "sentiment_score": percentage_score,
        "headline_count": len(scores)
    }