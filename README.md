# AlphaLens

AlphaLens is a WebAR AI Investment Assistant. It uses Augmented Reality to overlay real-time financial data and AI-driven analysis over physical company logos or stock markers.

## Prerequisites

- Node.js (v18+)
- Python (3.10+)
- A webcam (or smartphone camera)

## Getting Started

### 1. Start the Backend

The backend is a FastAPI application that serves stock data, AI analysis (powered by Gemini), and processes voice commands.

1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Activate your virtual environment (if you have one):
   ```powershell
   # Windows
   .\venv\Scripts\Activate.ps1
   ```
   ```bash
   # macOS/Linux
   source venv/bin/activate
   ```
3. Install dependencies (if you haven't already):
   ```bash
   pip install -r requirements.txt
   ```
4. Start the server:
   ```bash
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   *The backend will run on `http://localhost:8000`.*

### 2. Start the Frontend

The frontend is a Next.js application that renders the AR experience using MindAR and React Three Fiber.

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies (if you haven't already):
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:3000` (or `http://localhost:3001` if 3000 is taken).*

## How to Use the App

1. Open the frontend URL (`http://localhost:3000`) in your browser.
2. Grant camera permissions when prompted.
3. **The app will not show any data immediately.** To see the AR dashboard and data, you must point your camera at one of the recognized target images (e.g., Apple logo, Tesla logo, or Reliance logo, depending on how your `targets.mind` file was compiled).
4. Once a marker is detected, the frontend will automatically fetch the stock data and AI analysis from the backend and display it over the marker!
5. Use the microphone button in the bottom right corner to ask questions about the stock (e.g., "What is the PE ratio?").
# AlphaLens
