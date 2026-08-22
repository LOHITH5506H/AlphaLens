import os
from transformers import BertTokenizer, BertForSequenceClassification

# Target directory matching your structure
save_directory = "./models/finbert"

# Create the folder if it doesn't exist
os.makedirs(save_directory, exist_ok=True)

print("Downloading weights from Hugging Face...")

# Use explicit BERT classes to help the linter
tokenizer = BertTokenizer.from_pretrained("ProsusAI/finbert")
model = BertForSequenceClassification.from_pretrained("ProsusAI/finbert")

# Type assertions: this explicitly tells Pyrefly that these are NOT None
assert tokenizer is not None, "Tokenizer failed to initialize"
assert model is not None, "Model failed to initialize"

# Save them locally
tokenizer.save_pretrained(save_directory)
model.save_pretrained(save_directory)

print(f"Success! Model and weights are saved in {save_directory}")