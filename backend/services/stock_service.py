import random

def get_stock_data(symbol: str) -> dict:
    """
    Fetches stock data for a given symbol. 
    Returns a dictionary that matches the StockData schema in main.py.
    """
    symbol = symbol.upper()
    
    # Generate some realistic-looking dummy data for the AR dashboard
    base_price = random.uniform(100.0, 500.0)
    change = random.uniform(-10.0, 10.0)
    current_price = base_price + change
    
    return {
        "symbol": symbol,
        "name": f"{symbol} Corporation",
        "price": round(current_price, 2),
        "change": round(change, 2),
        "changePercent": round((change / base_price) * 100, 2),
        "high": round(current_price + random.uniform(2.0, 15.0), 2),
        "low": round(current_price - random.uniform(2.0, 15.0), 2),
        "open": round(base_price, 2),
        "previousClose": round(base_price, 2),
        "volume": random.randint(1_000_000, 5_000_000),
        "marketCap": random.randint(1_000_000_000, 50_000_000_000),
        "peRatio": round(random.uniform(10.0, 30.0), 2)
    }

import random

def get_stock_data(symbol: str) -> dict:
    """
    Fetches stock data for a given symbol. 
    Returns a dictionary that matches the StockData schema in main.py.
    """
    symbol = symbol.upper()
    
    # Generate some realistic-looking dummy data for the AR dashboard
    base_price = random.uniform(100.0, 500.0)
    change = random.uniform(-10.0, 10.0)
    current_price = base_price + change
    
    return {
        "symbol": symbol,
        "name": f"{symbol} Corporation",
        "price": round(current_price, 2),
        "change": round(change, 2),
        "changePercent": round((change / base_price) * 100, 2),
        "high": round(current_price + random.uniform(2.0, 15.0), 2),
        "low": round(current_price - random.uniform(2.0, 15.0), 2),
        "open": round(base_price, 2),
        "previousClose": round(base_price, 2),
        "volume": random.randint(1_000_000, 5_000_000),
        "marketCap": random.randint(1_000_000_000, 50_000_000_000),
        "peRatio": round(random.uniform(10.0, 30.0), 2)
    }

def search_company_ticker(query: str) -> str:
    """
    Mock function to resolve a company name to a stock ticker symbol.
    Expected by main.py for the search endpoint.
    """
    query = query.lower().strip()
    
    # A simple mock database for common tests
    mock_db = {
        "apple": "AAPL",
        "google": "GOOGL",
        "microsoft": "MSFT",
        "amazon": "AMZN",
        "tesla": "TSLA",
        "meta": "META",
        "netflix": "NFLX"
    }
    
    # Return the mapped ticker, or automatically generate a fallback 4-letter ticker
    if query in mock_db:
        return mock_db[query]
        
    fallback = query.upper()[:4] if len(query) >= 4 else query.upper()
    return fallback