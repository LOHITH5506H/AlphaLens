import os
import torch
from pathlib import Path
from transformers import BertTokenizer, BertForSequenceClassification

# Dynamically resolves to backend/models/finbert regardless of execution directory
BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = str(BASE_DIR / "models" / "finbert")

class FinancialSentimentModel:
    tokenizer: BertTokenizer
    model: BertForSequenceClassification
    labels = {0: "positive", 1: "negative", 2: "neutral"}

    def __init__(self, model_path: str = MODEL_PATH):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model weights not found at {model_path}. Did you run the download script?")

        print(f"Loading local FinBERT model onto {self.device}...")

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
            max_length=512
        ).to(self.device)

        with torch.no_grad():
            outputs = self.model(**inputs)
            probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]

        probs_list: list[float] = probabilities.tolist()
        top_class_id: int = int(torch.argmax(probabilities).item())

        # Safely extract scores based on FinBERT's output indices
        pos_score = round(probs_list[0], 4) if len(probs_list) > 0 else 0.0
        neg_score = round(probs_list[1], 4) if len(probs_list) > 1 else 0.0
        neu_score = round(probs_list[2], 4) if len(probs_list) > 2 else 0.0

        label_str = self.labels.get(top_class_id, "unknown")
        max_score = round(probs_list[top_class_id], 4) if top_class_id < len(probs_list) else 0.0

        probs_dict = {
            "positive": pos_score,
            "negative": neg_score,
            "neutral": neu_score
        }

        # The Omni-Dictionary: Satisfies any key lookup main.py attempts
        return {
            "label": label_str,
            "score": max_score,
            "probabilities": probs_dict,
            "positive": pos_score,
            "negative": neg_score,
            "neutral": neu_score
        }

# Initialize singleton instance
sentiment_model = FinancialSentimentModel()

# Wrapper function OUTSIDE the class, expected by main.py
def analyze_sentiment(text: str) -> dict:
    """
    Wrapper function expected by main.py to handle sentiment analysis requests.
    """
    return sentiment_model.predict(text)