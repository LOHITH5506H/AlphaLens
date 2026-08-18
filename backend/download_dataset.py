import os
from huggingface_hub import snapshot_download

def download_dataset():
    # Define the repository ID
    repo_id = "dinalzein/stock_market_news"
    
    # Define the local directory where the dataset will be saved
    local_dir = os.path.join(os.path.dirname(__file__), "data")
    
    # Ensure the directory exists
    os.makedirs(local_dir, exist_ok=True)
    
    print(f"Downloading dataset '{repo_id}' to '{local_dir}'...")
    
    # Download the dataset
    snapshot_download(repo_id=repo_id, repo_type="dataset", local_dir=local_dir)
    
    print("Download completed successfully.")

if __name__ == "__main__":
    download_dataset()
