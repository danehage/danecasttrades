// Import required packages
require('dotenv').config(); // Loads .env file
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const cors = require('cors');
const portfolio = require('./portfolioManager');

// Initialize Express app (your web server)
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Claude API client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Middleware (these run before your routes)
app.use(cors()); // Allows frontend to connect
app.use(express.json()); // Parses JSON from requests

// ROUTE 1: Fetch stock data from Finnhub (REAL-TIME!)
async function fetchStockData(symbol) {
  try {
    // Fetch real-time quote
    const quoteResponse = await axios.get('https://finnhub.io/api/v1/quote', {
      params: {
        symbol: symbol,
        token: process.env.FINNHUB_API_KEY
      }
    });
    
    const quote = quoteResponse.data;
    
    // Check if we got valid data
    if (quote.c === 0 || !quote.c) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }
    
    // Fetch company profile for additional info
    const profileResponse = await axios.get('https://finnhub.io/api/v1/stock/profile2', {
      params: {
        symbol: symbol,
        token: process.env.FINNHUB_API_KEY
      }
    });
    
    const profile = profileResponse.data;
    
    // Calculate change and change percent
    const change = (quote.c - quote.pc).toFixed(2);
    const changePercent = ((change / quote.pc) * 100).toFixed(2);
    
    // Return formatted data
    return {
      symbol: symbol,
      companyName: profile.name || symbol,
      price: quote.c, // current price
      change: change,
      changePercent: `${changePercent}%`,
      high: quote.h, // day high
      low: quote.l, // day low
      open: quote.o, // day open
      previousClose: quote.pc, // previous close
      timestamp: quote.t, // Unix timestamp
      marketCap: profile.marketCapitalization ? `$${(profile.marketCapitalization / 1000).toFixed(2)}B` : 'N/A',
      industry: profile.finnhubIndustry || 'N/A'
    };
  } catch (error) {
    console.error('Error fetching stock data:', error.message);
    if (error.response?.status === 429) {
      throw new Error('API rate limit exceeded. Please wait a moment and try again.');
    }
    throw new Error(error.message || 'Failed to fetch stock data. Check that the symbol is valid.');
  }
}

// Helper function to extract stock symbols from text
function extractSymbols(text) {
  const symbolMatches = text.match(/\b[A-Z]{1,5}\b/g);
  return symbolMatches || [];
}

// Fetch market movers from Finnhub
async function getMarketMovers() {
  try {
    // Get top gainers/losers from US market
    // Note: Finnhub free tier has limited access to screener endpoint
    // Alternative: fetch data for major stocks and calculate ourselves
    
    const sp500Symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ', 
                          'V', 'XOM', 'WMT', 'JPM', 'PG', 'MA', 'CVX', 'HD', 'ABBV', 'LLY'];
    
    const stocksData = [];
    
    for (const symbol of sp500Symbols) {
      try {
        const quote = await axios.get('https://finnhub.io/api/v1/quote', {
          params: { symbol, token: process.env.FINNHUB_API_KEY }
        });
        
        if (quote.data.c && quote.data.c > 0) {
          const change = quote.data.c - quote.data.pc;
          const changePercent = (change / quote.data.pc) * 100;
          
          stocksData.push({
            symbol,
            price: quote.data.c,
            change: change.toFixed(2),
            changePercent: changePercent.toFixed(2)
          });
        }
        
        // Rate limiting - wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.log(`Skipping ${symbol}: ${err.message}`);
      }
    }
    
    // Sort by absolute change percent
    return stocksData.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  } catch (error) {
    throw new Error('Failed to fetch market movers');
  }
}

// Detect if query is asking for market screening/analysis
function needsMarketData(query) {
  const lowerQuery = query.toLowerCase();
  const triggers = [
    'top movers', 'biggest gainers', 'biggest losers', 'market movers',
    'stocks moving', 'highest volume', 'most active', 'primed for',
    'identify stocks', 'find stocks', 'which stocks', 'what stocks'
  ];
  return triggers.some(trigger => lowerQuery.includes(trigger));
}

// ROUTE 2: Main research endpoint with conversation history
app.post('/api/research', async (req, res) => {
  try {
    const { query, conversationHistory } = req.body;
    
    console.log(`New query: ${query}`);
    
    // Check if query needs market screening data
    const needsScreening = needsMarketData(query);
    
    // Extract stock symbols from the current query
    const symbols = extractSymbols(query);
    console.log(`Detected symbols: ${symbols.join(', ') || 'none'}`);
    
    let stockContext = '';
    let stockDataArray = [];
    let tradeExecuted = null;
    
    // Check if this is a trade command
    const tradeMatch = query.match(/buy\s+(\d+)\s+(?:shares?\s+of\s+)?([A-Z]{1,5})/i);
    const sellMatch = query.match(/sell\s+(?:my\s+)?([A-Z]{1,5})(?:\s+position)?/i);
    const optionMatch = query.match(/buy\s+(\d+)\s+([A-Z]{1,5})\s+(\d+)\s+(call|put)s?\s+(?:at\s+)?\$?(\d+(?:\.\d+)?)/i);
    
    if (tradeMatch) {
      // BUY STOCK command detected
      const [, quantity, symbol] = tradeMatch;
      console.log(`Trade detected: BUY ${quantity} ${symbol}`);
      
      try {
        const stockData = await fetchStockData(symbol);
        const result = await portfolio.buyStock(symbol, parseInt(quantity), stockData.price);
        
        tradeExecuted = {
          type: 'buy_stock',
          symbol,
          quantity: parseInt(quantity),
          price: stockData.price,
          cost: result.position.costBasis,
          newBalance: result.newBalance
        };
        
        stockDataArray.push(stockData);
        stockContext = `\n\nTRADE EXECUTED: Bought ${quantity} shares of ${symbol} at ${stockData.price} (Total: ${result.position.costBasis.toFixed(2)}). New cash balance: ${result.newBalance.toFixed(2)}`;
        
      } catch (error) {
        stockContext = `\n\nTRADE FAILED: ${error.message}`;
      }
      
    } else if (sellMatch) {
      // SELL STOCK command detected
      const [, symbol] = sellMatch;
      console.log(`Trade detected: SELL ${symbol}`);
      
      try {
        const stockData = await fetchStockData(symbol);
        const result = await portfolio.sellStock(symbol, stockData.price);
        
        tradeExecuted = {
          type: 'sell_stock',
          symbol,
          shares: result.trade.shares,
          entryPrice: result.trade.entryPrice,
          exitPrice: result.trade.exitPrice,
          profitLoss: result.trade.profitLoss,
          percentReturn: result.trade.percentReturn,
          newBalance: result.newBalance
        };
        
        stockDataArray.push(stockData);
        stockContext = `\n\nTRADE EXECUTED: Sold ${result.trade.shares} shares of ${symbol} at ${stockData.price}. P/L: ${result.trade.profitLoss >= 0 ? '+' : ''}${result.trade.profitLoss.toFixed(2)} (${result.trade.percentReturn >= 0 ? '+' : ''}${result.trade.percentReturn.toFixed(2)}%). New cash balance: ${result.newBalance.toFixed(2)}`;
        
      } catch (error) {
        stockContext = `\n\nTRADE FAILED: ${error.message}`;
      }
      
    } else if (optionMatch) {
      // BUY OPTION command detected
      const [, contracts, symbol, strike, optionType, premium] = optionMatch;
      console.log(`Trade detected: BUY ${contracts} ${symbol} ${strike} ${optionType} at ${premium}`);
      
      try {
        const result = await portfolio.buyOption(
          symbol, 
          optionType.toLowerCase(), 
          parseFloat(strike), 
          '2026-01-01', // Default expiration
          parseFloat(premium), 
          parseInt(contracts)
        );
        
        tradeExecuted = {
          type: 'buy_option',
          symbol,
          contracts: parseInt(contracts),
          strike: parseFloat(strike),
          optionType: optionType.toLowerCase(),
          premium: parseFloat(premium),
          cost: result.position.costBasis,
          newBalance: result.newBalance
        };
        
        stockContext = `\n\nTRADE EXECUTED: Bought ${contracts} ${symbol} ${strike} ${optionType}(s) at ${premium} premium (Total: ${result.position.costBasis.toFixed(2)}). New cash balance: ${result.newBalance.toFixed(2)}`;
        
      } catch (error) {
        stockContext = `\n\nTRADE FAILED: ${error.message}`;
      }
      
    } else if (needsScreening && symbols.length === 0) {
      // Market screening query
      console.log('Query requires market screening data...');
      const movers = await getMarketMovers();
      
      stockContext = '\n\nCurrent Top Market Movers (S&P 500 Sample):\n';
      movers.slice(0, 10).forEach(stock => {
        stockContext += `${stock.symbol}: ${stock.price} (${stock.changePercent > 0 ? '+' : ''}${stock.changePercent}%)\n`;
      });
      
      if (movers.length > 0) {
        const topMover = movers[0];
        const fullData = await fetchStockData(topMover.symbol);
        stockDataArray.push(fullData);
      }
    } else if (!tradeExecuted) {
      // Regular stock query
      for (const symbol of symbols.slice(0, 3)) {
        try {
          const data = await fetchStockData(symbol);
          stockDataArray.push(data);
        } catch (err) {
          console.log(`Could not fetch data for ${symbol}: ${err.message}`);
        }
      }
      
      if (stockDataArray.length > 0) {
        stockContext = '\n\nCurrent Stock Data:\n';
        stockDataArray.forEach(stock => {
          const timestamp = new Date(stock.timestamp * 1000).toLocaleString();
          stockContext += `
${stock.companyName} (${stock.symbol}):
- Current Price: ${stock.price}
- Change: ${stock.change} (${stock.changePercent})
- Day High: ${stock.high} | Day Low: ${stock.low}
- Previous Close: ${stock.previousClose}
- Market Cap: ${stock.marketCap}
- Industry: ${stock.industry}
- Last Updated: ${timestamp}
`;
        });
      }
    }
    
    // Build messages array for Claude
    const messages = [];
    
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    const userMessage = stockContext 
      ? `${query}${stockContext}`
      : query;
    
    messages.push({
      role: 'user',
      content: userMessage
    });
    
    // Call Claude API with full conversation history
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: `You are a knowledgeable financial analyst assistant with access to real-time market data via Finnhub API and a paper trading portfolio system.

When users ask you to find stocks, identify movers, or analyze market trends, you HAVE ACCESS to that data - it will be provided in the stock data context.

When users request trades (buy/sell stocks or options), the system will AUTOMATICALLY execute them and provide you with the results in the context. You should:
- Confirm the trade was executed successfully
- Provide analysis of the trade (is it a good entry point? what to watch for?)
- Give the user relevant information about the stock/option they just traded
- Be encouraging but realistic about the trade

If a trade fails, explain why and suggest alternatives.

You help users research stocks, understand market trends, and manage their paper trading portfolio. When stock data is provided, analyze it carefully. Maintain context from previous questions in the conversation. Be concise but thorough.`,
      messages: messages
    });
    
    // Send response back to frontend
    res.json({
      success: true,
      stockData: stockDataArray.length > 0 ? stockDataArray[0] : null,
      allStockData: stockDataArray,
      analysis: message.content[0].text,
      tradeExecuted: tradeExecuted,
      assistantMessage: {
        role: 'assistant',
        content: message.content[0].text
      }
    });
    
  } catch (error) {
    console.error('Error in /api/research:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cache for widget data to avoid rate limits
let widgetCache = {
  indexes: [],
  movers: [],
  lastUpdated: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ROUTE 3: Get major market indexes
app.get('/api/indexes', async (req, res) => {
  try {
    // Return cached data if less than 5 minutes old
    if (widgetCache.indexes.length > 0 && widgetCache.lastUpdated && Date.now() - widgetCache.lastUpdated < CACHE_DURATION) {
      console.log('Returning cached index data');
      return res.json({ success: true, indexes: widgetCache.indexes, cached: true });
    }

    console.log('Fetching fresh index data...');
    // Finnhub uses different symbols for indexes - these are ETFs that track the indexes
    const indexes = [
      { symbol: 'SPY', name: 'S&P 500' },      // S&P 500 ETF
      { symbol: 'DIA', name: 'Dow Jones' },    // Dow Jones ETF
      { symbol: 'QQQ', name: 'Nasdaq' },       // Nasdaq 100 ETF
      { symbol: 'IWM', name: 'Russell 2000' }  // Russell 2000 ETF
    ];
    
    const indexData = [];
    
    for (const index of indexes) {
      try {
        const quote = await axios.get('https://finnhub.io/api/v1/quote', {
          params: { symbol: index.symbol, token: process.env.FINNHUB_API_KEY }
        });
        
        if (quote.data.c) {
          const change = quote.data.c - quote.data.pc;
          const changePercent = (change / quote.data.pc) * 100;
          
          indexData.push({
            name: index.name,
            symbol: index.symbol,
            price: quote.data.c.toFixed(2),
            change: change.toFixed(2),
            changePercent: changePercent.toFixed(2)
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 200)); // Slower rate
      } catch (err) {
        console.log(`Error fetching ${index.name}: ${err.message}`);
      }
    }
    
    widgetCache.indexes = indexData;
    res.json({ success: true, indexes: indexData, cached: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ROUTE 4: Get top movers from Russell 1000
app.get('/api/top-movers', async (req, res) => {
  try {
    // Return cached data if less than 5 minutes old
    if (widgetCache.lastUpdated && Date.now() - widgetCache.lastUpdated < CACHE_DURATION) {
      console.log('Returning cached movers data');
      return res.json({ success: true, movers: widgetCache.movers, cached: true });
    }

    console.log('Fetching fresh top movers data...');
    
    // Expanded to 40 stocks - mix of mega caps, growth, volatile, and mid-caps
    const russell1000Symbols = [
      // Mega Caps
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B',
      // Tech Growth
      'AMD', 'AVGO', 'INTC', 'QCOM', 'NFLX', 'ADBE', 'CRM', 'ORCL',
      // Finance
      'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C',
      // Healthcare
      'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE',
      // Energy (volatile)
      'XOM', 'CVX', 'COP', 'SLB', 'OXY',
      // Consumer/Retail
      'WMT', 'COST', 'HD', 'NKE', 'SBUX',
      // Meme/Volatile Stocks
      'GME', 'AMC', 'PLTR', 'COIN', 'RIVN'
    ];
    
    const stocksData = [];
    
    for (const symbol of russell1000Symbols) {
      try {
        const quote = await axios.get('https://finnhub.io/api/v1/quote', {
          params: { symbol, token: process.env.FINNHUB_API_KEY }
        });
        
        if (quote.data.c && quote.data.c > 0) {
          const change = quote.data.c - quote.data.pc;
          const changePercent = (change / quote.data.pc) * 100;
          
          stocksData.push({
            symbol,
            price: quote.data.c.toFixed(2),
            change: change.toFixed(2),
            changePercent: changePercent.toFixed(2)
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 200)); // Slower rate
      } catch (err) {
        console.log(`Skipping ${symbol}: ${err.message}`);
      }
    }
    
    // Sort by absolute change percent and get top 10
    const topMovers = stocksData
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 10);
    
    widgetCache.movers = topMovers;
    widgetCache.lastUpdated = Date.now();
    
    res.json({ success: true, movers: topMovers, cached: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint (test if server is running)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running with Finnhub real-time data!' });
});

// PORTFOLIO ROUTES

// Get current portfolio
app.get('/api/portfolio', async (req, res) => {
  try {
    const portfolioData = await portfolio.getPortfolio(async (symbol) => {
      const stockData = await fetchStockData(symbol);
      return stockData.price;
    });
    res.json({ success: true, portfolio: portfolioData });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute a trade (buy stock or option)
app.post('/api/portfolio/trade', async (req, res) => {
  try {
    const { action, symbol, quantity, price, optionDetails } = req.body;
    
    let result;
    
    if (action === 'buy_stock') {
      result = await portfolio.buyStock(symbol, quantity, price);
    } else if (action === 'buy_option') {
      const { type, strike, expiration, premium } = optionDetails;
      result = await portfolio.buyOption(symbol, type, strike, expiration, premium, quantity);
    } else {
      throw new Error('Invalid action');
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error executing trade:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Close a position
app.post('/api/portfolio/close', async (req, res) => {
  try {
    const { symbol, positionId, currentPrice, exitPremium } = req.body;
    
    let result;
    
    if (positionId && exitPremium !== undefined) {
      // Closing an option
      result = await portfolio.closeOption(positionId, exitPremium);
    } else if (symbol && currentPrice) {
      // Closing a stock position
      result = await portfolio.sellStock(symbol, currentPrice);
    } else {
      throw new Error('Invalid close parameters');
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error closing position:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Reset portfolio
app.post('/api/portfolio/reset', async (req, res) => {
  try {
    const newPortfolio = await portfolio.resetPortfolio();
    res.json({ success: true, portfolio: newPortfolio });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Ready to research stocks with REAL-TIME data!`);
  console.log(`💡 Using Finnhub API for live market prices`);
  console.log(`💬 Conversation history enabled!`);
  console.log(`🔍 Market screening enabled!`);
});