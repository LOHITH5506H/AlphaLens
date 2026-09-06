"""
AlphaLens — LSTM Trajectory Model Training Script
===================================================
Designed to run in Google Colab (GPU runtime).

Produces three artifacts to copy to backend/models/:
  1. trajectory_lstm.pt       — Model state_dict
  2. scaler_config.json       — RobustScaler center/scale arrays
  3. model_config.json        — Architecture hyperparameters
  4. scaler.joblib             — Full RobustScaler object (joblib, protocol 4)

Usage (Colab):
  1. Set runtime to GPU (Runtime → Change runtime type → T4 GPU)
  2. Run all cells (or `!python alphalens_lstm_training.py`)
  3. Download the 4 artifacts from the output directory
  4. Place them in your local `backend/models/` directory
"""

# ── 0. Install Dependencies ─────────────────────────────────────────────────
# (Uncomment these lines when running in Colab)
# !pip install -q yfinance torch scikit-learn joblib pandas numpy

import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import RobustScaler

warnings.filterwarnings("ignore")

# ── 1. Configuration ────────────────────────────────────────────────────────

TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX"]
LOOKBACK = 30        # Input sequence length (trading days)
HORIZON = 5          # Predict 5 days into the future
EPOCHS = 50
BATCH_SIZE = 64
LR = 1e-3
WEIGHT_DECAY = 1e-4
PATIENCE = 8         # Early stopping patience

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
OUTPUT_DIR = Path("./alphalens_model_output")
OUTPUT_DIR.mkdir(exist_ok=True)

print(f"🔧 Device: {DEVICE}")
print(f"📊 Tickers: {TICKERS}")
print(f"📐 Lookback: {LOOKBACK}, Horizon: {HORIZON}")

# ── 2. Data Fetching ────────────────────────────────────────────────────────

import yfinance as yf


def fetch_ticker_data(ticker: str, period: str = "5y") -> pd.DataFrame:
    """Fetch historical OHLCV data for a single ticker."""
    print(f"  📥 Fetching {ticker}...", end=" ")
    df = yf.download(ticker, period=period, interval="1d", progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    print(f"({len(df)} rows)")
    return df


print("\n── Fetching Historical Data ──")
all_data = {}
for ticker in TICKERS:
    df = fetch_ticker_data(ticker)
    if len(df) >= LOOKBACK + HORIZON + 60:  # Need enough for indicators + sequences
        all_data[ticker] = df
    else:
        print(f"  ⚠️ Skipping {ticker}: insufficient data ({len(df)} rows)")

print(f"\n✅ Loaded data for {len(all_data)} tickers")

# ── 3. Feature Engineering ──────────────────────────────────────────────────
# These 9 features MUST match stock_service.py exactly.

FEATURE_COLUMNS = [
    "Returns", "SMA_20_Ratio", "SMA_50_Ratio",
    "BB_Upper_Ratio", "BB_Lower_Ratio", "RSI_Norm",
    "Volume_Ratio", "High_Low_Ratio", "Open_Close_Ratio",
]


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Compute RSI and normalize to [-1.0, 1.0]."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
    rs = gain / loss.replace(0, 1e-10)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return (rsi - 50.0) / 50.0


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute the 9 technical features matching the inference pipeline."""
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

    features["RSI_Norm"] = compute_rsi(close, period=14)

    vol_sma_20 = volume.rolling(window=20).mean()
    features["Volume_Ratio"] = volume / vol_sma_20.replace(0, 1e-10) - 1.0

    features["High_Low_Ratio"] = (high - low) / close.replace(0, 1e-10)
    features["Open_Close_Ratio"] = (close - open_) / open_.replace(0, 1e-10)

    return features


def create_targets(df: pd.DataFrame, horizon: int = 5) -> pd.Series:
    """
    Compute forward returns as targets.
    target[t] = (close[t+horizon] - close[t]) / close[t]
    """
    close = df["Close"]
    future_returns = close.shift(-horizon) / close - 1.0
    return future_returns


print("\n── Engineering Features ──")
feature_frames = []
target_frames = []

for ticker, df in all_data.items():
    feats = engineer_features(df)
    targets = create_targets(df, horizon=HORIZON)

    # Combine and drop NaN rows
    combined = feats.copy()
    combined["target"] = targets
    combined = combined.dropna()

    feature_frames.append(combined[FEATURE_COLUMNS])
    target_frames.append(combined["target"])
    print(f"  {ticker}: {len(combined)} valid samples")

all_features = pd.concat(feature_frames)
all_targets = pd.concat(target_frames)
print(f"\n✅ Total samples: {len(all_features)}")

# ── 4. Scaling ──────────────────────────────────────────────────────────────

print("\n── Fitting RobustScaler ──")
scaler = RobustScaler()
scaled_features = scaler.fit_transform(all_features.values)

# Add this to satisfy the strict linter:
assert scaler.center_ is not None and scaler.scale_ is not None

print(f"  Center: {scaler.center_[:3]}...")
print(f"  Scale:  {scaler.scale_[:3]}...")

# ── 5. Sequence Creation ────────────────────────────────────────────────────


class TrajectoryDataset(Dataset):
    """Creates (lookback, 9) input sequences → (horizon,) target sequences."""

    def __init__(self, features: np.ndarray, targets: np.ndarray,
                 lookback: int, horizon: int):
        self.features = features
        self.targets = targets
        self.lookback = lookback
        self.horizon = horizon

        # Build valid indices where we can form complete sequences
        self.valid_indices = []
        for i in range(lookback, len(features) - horizon + 1):
            self.valid_indices.append(i)

    def __len__(self) -> int:
        return len(self.valid_indices)

    def __getitem__(self, index: int):
        center = self.valid_indices[index]
        x = self.features[center - self.lookback: center]  # (lookback, 9)
        # Multi-step targets: returns at t+1, t+2, ..., t+horizon
        y = self.targets[center: center + self.horizon]    # (horizon,)

        return (
            torch.tensor(x, dtype=torch.float32),
            torch.tensor(y, dtype=torch.float32),
        )


# Split: 85% train, 15% validation (time-ordered, no shuffle for temporal integrity)
split_idx = int(len(scaled_features) * 0.85)

train_dataset = TrajectoryDataset(
    scaled_features[:split_idx],
    all_targets.values[:split_idx],
    lookback=LOOKBACK,
    horizon=HORIZON,
)
val_dataset = TrajectoryDataset(
    scaled_features[split_idx:],
    all_targets.values[split_idx:],
    lookback=LOOKBACK,
    horizon=HORIZON,
)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

print(f"\n✅ Train samples: {len(train_dataset)}, Val samples: {len(val_dataset)}")

# ── 6. Model Definition ────────────────────────────────────────────────────
# This MUST match stock_service.py's StockTrajectoryLSTM exactly.


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

    def forward(self, x: torch.Tensor):
        out, (hn, cn) = self.lstm(x)
        last_hidden = out[:, -1, :]
        trajectory = self.fc_trajectory(last_hidden)
        volatility = self.fc_volatility(last_hidden)
        return trajectory, volatility


# ── 7. Training Loop ───────────────────────────────────────────────────────

model = StockTrajectoryLSTM(
    input_dim=9,
    hidden_dim=128,
    num_layers=2,
    output_dim=HORIZON,
    dropout=0.2,
).to(DEVICE)

optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
    optimizer, mode="min", factor=0.5, patience=3
)

# Combined loss: MSE on trajectory + regularized volatility
mse_loss = nn.MSELoss()

best_val_loss = float("inf")
patience_counter = 0
final_epoch = 0

print(f"\n{'='*60}")
print(f"🚀 Training on {DEVICE} for up to {EPOCHS} epochs")
print(f"{'='*60}\n")

for epoch in range(EPOCHS):
    final_epoch = epoch + 1

    # ── Train ──
    model.train()
    train_losses = []
    for batch_x, batch_y in train_loader:
        batch_x = batch_x.to(DEVICE)
        batch_y = batch_y.to(DEVICE)

        pred_returns, pred_vol = model(batch_x)

        # Primary loss: trajectory prediction accuracy
        traj_loss = mse_loss(pred_returns, batch_y)

        # Volatility loss: predicted vol should approximate squared residuals
        residuals = (pred_returns - batch_y).detach()
        vol_target = residuals.pow(2).sqrt()
        vol_loss = mse_loss(pred_vol, vol_target)

        loss = traj_loss + 0.3 * vol_loss

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        train_losses.append(loss.item())

    # ── Validate ──
    model.eval()
    val_losses = []
    with torch.no_grad():
        for batch_x, batch_y in val_loader:
            batch_x = batch_x.to(DEVICE)
            batch_y = batch_y.to(DEVICE)
            pred_returns, pred_vol = model(batch_x)
            val_loss = mse_loss(pred_returns, batch_y)
            val_losses.append(val_loss.item())

    avg_train = np.mean(train_losses)
    avg_val = np.mean(val_losses)
    scheduler.step(avg_val)

    marker = ""
    if avg_val < best_val_loss:
        best_val_loss = avg_val
        patience_counter = 0
        marker = " ✅ (best)"
        # Save best model
        torch.save(model.state_dict(), OUTPUT_DIR / "trajectory_lstm.pt")
    else:
        patience_counter += 1

    print(f"Epoch {epoch+1:3d}/{EPOCHS} | "
          f"Train: {avg_train:.6f} | Val: {avg_val:.6f}{marker}")

    if patience_counter >= PATIENCE:
        print(f"\n⏹ Early stopping at epoch {epoch+1} (patience={PATIENCE})")
        break

print(f"\n{'='*60}")
print(f"🏆 Best validation loss: {best_val_loss:.6f}")
print(f"{'='*60}")

# ── 8. Save Artifacts ──────────────────────────────────────────────────────

# 8a. Model weights (already saved during training as best checkpoint)
print(f"\n💾 Model weights: {OUTPUT_DIR / 'trajectory_lstm.pt'}")

# 8b. Scaler config (JSON — for the lightweight inference path)
scaler_config = {
    "scaler_type": "RobustScaler",
    "center": scaler.center_.tolist(),
    "scale": scaler.scale_.tolist(),
    "feature_columns": FEATURE_COLUMNS,
}
with open(OUTPUT_DIR / "scaler_config.json", "w") as f:
    json.dump(scaler_config, f, indent=2)
print(f"💾 Scaler config: {OUTPUT_DIR / 'scaler_config.json'}")

# 8c. Full scaler object (joblib, protocol 4 — for cross-environment compat)
joblib.dump(scaler, OUTPUT_DIR / "scaler.joblib", protocol=4)
print(f"💾 Scaler (joblib): {OUTPUT_DIR / 'scaler.joblib'}")

# 8d. Model config (architecture + training metadata)
model_config = {
    "model_class": "StockTrajectoryLSTM",
    "input_dim": 9,
    "hidden_dim": 128,
    "num_layers": 2,
    "output_dim": HORIZON,
    "dropout": 0.2,
    "lookback": LOOKBACK,
    "horizon": HORIZON,
    "training": {
        "epochs_completed": final_epoch,
        "best_val_loss": best_val_loss,
        "batch_size": BATCH_SIZE,
        "lr": LR,
        "weight_decay": WEIGHT_DECAY,
        "tickers": TICKERS,
        "total_samples": len(all_features),
        "train_samples": len(train_dataset),
        "val_samples": len(val_dataset),
    },
}
with open(OUTPUT_DIR / "model_config.json", "w") as f:
    json.dump(model_config, f, indent=2)
print(f"💾 Model config: {OUTPUT_DIR / 'model_config.json'}")

print(f"\n{'='*60}")
print(f"✅ All artifacts saved to: {OUTPUT_DIR.resolve()}")
print(f"📋 Copy these files to your local backend/models/ directory:")
print(f"   • trajectory_lstm.pt")
print(f"   • scaler_config.json")
print(f"   • scaler.joblib")
print(f"   • model_config.json")
print(f"{'='*60}")
