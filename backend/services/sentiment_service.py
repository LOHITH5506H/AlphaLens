import os
import logging
import torch
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification

logger = logging.getLogger(__name__)

class SentimentClassifier:
    def __init__(self):
        self.model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "sentiment_model")
        
        # Fallback to a pre-trained finbert model if local one isn't trained yet
        if not os.path.exists(self.model_path):
            logger.warning(f"Local model not found at {self.model_path}. Falling back to 'ProsusAI/finbert'.")
            self.model_name_or_path = "ProsusAI/finbert"
        else:
            logger.info(f"Loading local sentiment model from {self.model_path}")
            self.model_name_or_path = self.model_path

        # Determine device
        self.device = 0 if torch.cuda.is_available() else -1

        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name_or_path)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name_or_path)
            
            self.pipeline = pipeline(
                "sentiment-analysis", 
                model=self.model, 
                tokenizer=self.tokenizer,
                device=self.device,
                top_k=None # This returns scores for all classes in a consistent format
            )
            logger.info("Sentiment pipeline initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize sentiment pipeline: {e}")
            self.pipeline = None

    def analyze(self, text: str) -> dict:
        """
        Analyzes the sentiment of the provided text.
        Returns a dictionary with 'positive', 'neutral', and 'negative' scores summing to 1.0.
        """
        if not self.pipeline:
            # Safe fallback if pipeline failed to load
            return {"positive": 0.0, "neutral": 1.0, "negative": 0.0}
            
        try:
            # returns something like [[{'label': 'Neutral', 'score': 0.8}, ...]]
            results = self.pipeline(text)[0]
            
            scores = {"positive": 0.0, "neutral": 0.0, "negative": 0.0}
            
            for res in results:
                label = res['label'].lower()
                # Handle different model label formats
                if label in ['positive', 'pos']:
                    scores["positive"] = res['score']
                elif label in ['neutral', 'neu']:
                    scores["neutral"] = res['score']
                elif label in ['negative', 'neg']:
                    scores["negative"] = res['score']
                    
            # Round for cleaner output
            return {
                "positive": round(scores["positive"] * 100, 1),
                "neutral": round(scores["neutral"] * 100, 1),
                "negative": round(scores["negative"] * 100, 1),
            }
        except Exception as e:
            logger.error(f"Error during sentiment inference: {e}")
            return {"positive": 0.0, "neutral": 1.0, "negative": 0.0}

# Global singleton
sentiment_classifier = SentimentClassifier()

def analyze_sentiment(text: str) -> dict:
    return sentiment_classifier.analyze(text)
