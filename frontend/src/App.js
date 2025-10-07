import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, TrendingUp, DollarSign, BarChart3, Loader2, RefreshCw, Activity, Briefcase, MessageSquare } from 'lucide-react';
import './App.css';

function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [indexes, setIndexes] = useState([]);
  const [topMovers, setTopMovers] = useState([]);
  const [widgetsLoading, setWidgetsLoading] = useState(true);
  const [activeView, setActiveView] = useState('chat');
  const [portfolio, setPortfolio] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeView === 'portfolio') {
      fetchPortfolio();
    }
  }, [activeView]);

  const fetchMarketData = async () => {
    try {
      setWidgetsLoading(true);
      
      const indexesResponse = await axios.get('/api/indexes');
      if (indexesResponse.data.success) {
        setIndexes(indexesResponse.data.indexes);
      }
      
      const moversResponse = await axios.get('/api/top-movers');
      if (moversResponse.data.success) {
        setTopMovers(moversResponse.data.movers);
      }
    } catch (err) {
      console.error('Error fetching market data:', err);
    } finally {
      setWidgetsLoading(false);
    }
  };

  const fetchPortfolio = async () => {
    try {
      setPortfolioLoading(true);
      const response = await axios.get('/api/portfolio');
      if (response.data.success) {
        setPortfolio(response.data.portfolio);
      }
    } catch (err) {
      console.error('Error fetching portfolio:', err);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const handleResearch = async () => {
    if (!query.trim()) return;

    const userQuery = query;
    setQuery('');
    
    const userMessage = {
      type: 'user',
      content: userQuery,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    
    setLoading(true);
    
    try {
      const response = await axios.post('/api/research', {
        query: userQuery,
        conversationHistory: conversationHistory
      });
      
      if (response.data.success) {
        const assistantMessage = {
          type: 'assistant',
          content: response.data.analysis,
          stockData: response.data.stockData,
          allStockData: response.data.allStockData,
          tradeExecuted: response.data.tradeExecuted,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        setConversationHistory(prev => [
          ...prev,
          { role: 'user', content: userQuery },
          response.data.assistantMessage
        ]);
        
        // If a trade was executed, refresh portfolio in background
        if (response.data.tradeExecuted && activeView === 'portfolio') {
          fetchPortfolio();
        }
      }
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = {
        type: 'error',
        content: err.response?.data?.error || 'Failed to connect to server. Make sure your backend is running!',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleResearch();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setConversationHistory([]);
  };

  return (
    <div className="app-container">
      <div className="main-layout">
        <div className="chat-wrapper">
          <div className="chat-header">
            <div className="header-title">
              <TrendingUp className="icon-large" />
              <div>
                <h1>Dane's Domain: Stock Research Center</h1>
                <p className="subtitle">Responses are not binding financial advice, we are not liable for your losses and do not get credit for your gains. Good luck!</p>
              </div>
            </div>
            <div className="header-actions">
              <button 
                onClick={() => setActiveView('chat')} 
                className={`view-toggle ${activeView === 'chat' ? 'active' : ''}`}
              >
                <MessageSquare size={16} />
                Chat
              </button>
              <button 
                onClick={() => setActiveView('portfolio')} 
                className={`view-toggle ${activeView === 'portfolio' ? 'active' : ''}`}
              >
                <Briefcase size={16} />
                Portfolio
              </button>
              {messages.length > 0 && activeView === 'chat' && (
                <button onClick={handleClearChat} className="clear-button">
                  <RefreshCw size={16} />
                  Clear
                </button>
              )}
            </div>
          </div>

          {activeView === 'chat' && (
            <>
              <div className="chat-messages">
                {messages.length === 0 && (
                  <div className="empty-state">
                    <BarChart3 size={64} className="empty-icon" />
                    <p>Start by asking about a stock</p>
                    <div className="example-queries">
                      <button onClick={() => setQuery('Analyze AAPL')} className="example-chip">
                        Analyze AAPL
                      </button>
                      <button onClick={() => setQuery('What is TSLA doing today?')} className="example-chip">
                        What is TSLA doing today?
                      </button>
                      <button onClick={() => setQuery('Buy 100 shares of NVDA')} className="example-chip">
                        Buy 100 shares of NVDA
                      </button>
                    </div>
                  </div>
                )}

                {messages.map((message, index) => (
                  <div key={index} className={`message ${message.type}-message`}>
                    {message.type === 'user' && (
                      <div className="message-content user-content">
                        <div className="message-text">{message.content}</div>
                      </div>
                    )}
                    
                    {message.type === 'assistant' && (
                      <div className="message-content assistant-content">
                        {/* Trade Confirmation Badge */}
                        {message.tradeExecuted && (
                          <div className="trade-badge">
                            <div className="trade-badge-header">
                              ✅ Trade Executed
                            </div>
                            <div className="trade-badge-body">
                              {message.tradeExecuted.type === 'buy_stock' && (
                                <>
                                  <div className="trade-detail">
                                    <span className="trade-label">Action:</span>
                                    <span className="trade-value">BUY {message.tradeExecuted.quantity} shares</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Symbol:</span>
                                    <span className="trade-value">{message.tradeExecuted.symbol}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Price:</span>
                                    <span className="trade-value">${message.tradeExecuted.price.toFixed(2)}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Total Cost:</span>
                                    <span className="trade-value">${message.tradeExecuted.cost.toFixed(2)}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">New Balance:</span>
                                    <span className="trade-value">${message.tradeExecuted.newBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                                  </div>
                                </>
                              )}
                              {message.tradeExecuted.type === 'sell_stock' && (
                                <>
                                  <div className="trade-detail">
                                    <span className="trade-label">Action:</span>
                                    <span className="trade-value">SELL {message.tradeExecuted.shares} shares</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Symbol:</span>
                                    <span className="trade-value">{message.tradeExecuted.symbol}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Exit Price:</span>
                                    <span className="trade-value">${message.tradeExecuted.exitPrice.toFixed(2)}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">P/L:</span>
                                    <span className={`trade-value ${message.tradeExecuted.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                                      {message.tradeExecuted.profitLoss >= 0 ? '+' : ''}${message.tradeExecuted.profitLoss.toFixed(2)} ({message.tradeExecuted.percentReturn.toFixed(2)}%)
                                    </span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">New Balance:</span>
                                    <span className="trade-value">${message.tradeExecuted.newBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                                  </div>
                                </>
                              )}
                              {message.tradeExecuted.type === 'buy_option' && (
                                <>
                                  <div className="trade-detail">
                                    <span className="trade-label">Action:</span>
                                    <span className="trade-value">BUY {message.tradeExecuted.contracts} {message.tradeExecuted.optionType}(s)</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Symbol:</span>
                                    <span className="trade-value">{message.tradeExecuted.symbol} ${message.tradeExecuted.strike}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Premium:</span>
                                    <span className="trade-value">${message.tradeExecuted.premium.toFixed(2)}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">Total Cost:</span>
                                    <span className="trade-value">${message.tradeExecuted.cost.toFixed(2)}</span>
                                  </div>
                                  <div className="trade-detail">
                                    <span className="trade-label">New Balance:</span>
                                    <span className="trade-value">${message.tradeExecuted.newBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Stock Data Card */}
                        {message.stockData && (
                          <div className="stock-card">
                            <div className="stock-header">
                              <div>
                                <div className="stock-symbol">{message.stockData.symbol}</div>
                                <div className="company-name">{message.stockData.companyName}</div>
                              </div>
                              <div className={parseFloat(message.stockData.change) >= 0 ? 'stock-change positive' : 'stock-change negative'}>
                                <div className="stock-price">${message.stockData.price}</div>
                                <div className="stock-change-text">{message.stockData.change} ({message.stockData.changePercent})</div>
                              </div>
                            </div>
                            <div className="stock-metrics">
                              <div className="metric">
                                <span className="metric-label">Market Cap</span>
                                <span className="metric-value">{message.stockData.marketCap}</span>
                              </div>
                              <div className="metric">
                                <span className="metric-label">High</span>
                                <span className="metric-value">${message.stockData.high}</span>
                              </div>
                              <div className="metric">
                                <span className="metric-label">Low</span>
                                <span className="metric-value">${message.stockData.low}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="message-text assistant-text">
                          {message.content}
                        </div>
                      </div>
                    )}
                    
                    {message.type === 'error' && (
                      <div className="message-content error-content">
                        <div className="message-text">⚠️ {message.content}</div>
                      </div>
                    )}
                  </div>
                ))}
                
                {loading && (
                  <div className="message assistant-message">
                    <div className="message-content assistant-content">
                      <div className="loading-indicator">
                        <Loader2 className="icon-spin" />
                        <span>Analyzing...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-container">
                <div className="chat-input-wrapper">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask a question or request analysis..."
                    className="chat-input"
                    disabled={loading}
                  />
                  <button
                    onClick={handleResearch}
                    disabled={loading || !query.trim()}
                    className="send-button"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </>
          )}

          {activeView === 'portfolio' && (
            <div className="portfolio-view">
              {portfolioLoading ? (
                <div className="portfolio-loading">
                  <Loader2 className="icon-spin" size={48} />
                  <p>Loading portfolio...</p>
                </div>
              ) : portfolio ? (
                <>
                  <div className="portfolio-summary">
                    <div className="summary-card">
                      <span className="summary-label">Cash Balance</span>
                      <span className="summary-value">${portfolio.balance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-label">Total Portfolio Value</span>
                      <span className="summary-value">${portfolio.totalPortfolioValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-label">Total Return</span>
                      <span className={`summary-value ${portfolio.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                        {portfolio.totalReturn >= 0 ? '+' : ''}${portfolio.totalReturn.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        <span className="summary-percent"> ({portfolio.totalReturnPercent.toFixed(2)}%)</span>
                      </span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-label">Realized P/L</span>
                      <span className={`summary-value ${portfolio.totalPL >= 0 ? 'positive' : 'negative'}`}>
                        {portfolio.totalPL >= 0 ? '+' : ''}${portfolio.totalPL.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>

                  <div className="portfolio-section">
                    <h2 className="section-title">Open Positions ({portfolio.openPositions.length})</h2>
                    {portfolio.openPositions.length === 0 ? (
                      <div className="empty-portfolio">
                        <Briefcase size={48} className="empty-icon" />
                        <p>No open positions</p>
                        <p className="empty-hint">Use chat to trade: "Buy 100 shares of AAPL"</p>
                      </div>
                    ) : (
                      <div className="positions-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Symbol</th>
                              <th>Type</th>
                              <th>Quantity</th>
                              <th>Entry Price</th>
                              <th>Current Price</th>
                              <th>Current Value</th>
                              <th>P/L</th>
                              <th>Return %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {portfolio.openPositions.map((pos, i) => (
                              <tr key={i}>
                                <td className="symbol-cell">{pos.symbol}</td>
                                <td>{pos.type === 'stock' ? 'Stock' : `${pos.optionType} Option`}</td>
                                <td>{pos.type === 'stock' ? pos.shares : `${pos.contracts}c`}</td>
                                <td>${pos.type === 'stock' ? pos.entryPrice.toFixed(2) : pos.entryPremium.toFixed(2)}</td>
                                <td>${pos.currentPrice ? pos.currentPrice.toFixed(2) : '-'}</td>
                                <td>${pos.currentValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td className={pos.unrealizedPL >= 0 ? 'positive' : 'negative'}>
                                  {pos.unrealizedPL >= 0 ? '+' : ''}${pos.unrealizedPL.toFixed(2)}
                                </td>
                                <td className={pos.unrealizedPercent >= 0 ? 'positive' : 'negative'}>
                                  {pos.unrealizedPercent >= 0 ? '+' : ''}{pos.unrealizedPercent.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="portfolio-section">
                    <h2 className="section-title">Trade History ({portfolio.closedTrades.length})</h2>
                    {portfolio.closedTrades.length === 0 ? (
                      <div className="empty-section">
                        <p>No closed trades yet</p>
                      </div>
                    ) : (
                      <div className="positions-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Symbol</th>
                              <th>Type</th>
                              <th>Quantity</th>
                              <th>Entry</th>
                              <th>Exit</th>
                              <th>P/L</th>
                              <th>Return %</th>
                              <th>Date Closed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {portfolio.closedTrades.slice().reverse().map((trade, i) => (
                              <tr key={i}>
                                <td className="symbol-cell">{trade.symbol}</td>
                                <td>{trade.type === 'stock' ? 'Stock' : `${trade.optionType} Option`}</td>
                                <td>{trade.type === 'stock' ? trade.shares : `${trade.contracts}c`}</td>
                                <td>${trade.type === 'stock' ? trade.entryPrice.toFixed(2) : trade.entryPremium.toFixed(2)}</td>
                                <td>${trade.type === 'stock' ? trade.exitPrice.toFixed(2) : trade.exitPremium.toFixed(2)}</td>
                                <td className={trade.profitLoss >= 0 ? 'positive' : 'negative'}>
                                  {trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}
                                </td>
                                <td className={trade.percentReturn >= 0 ? 'positive' : 'negative'}>
                                  {trade.percentReturn >= 0 ? '+' : ''}{trade.percentReturn.toFixed(2)}%
                                </td>
                                <td className="date-cell">{new Date(trade.exitDate).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="portfolio-error">
                  <p>Failed to load portfolio</p>
                  <button onClick={fetchPortfolio} className="retry-button">Retry</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-widgets">
          <div className="widget">
            <div className="widget-header">
              <Activity size={18} />
              <h3>Market Indexes</h3>
              <button onClick={fetchMarketData} className="refresh-icon" disabled={widgetsLoading}>
                <RefreshCw size={14} className={widgetsLoading ? 'spinning' : ''} />
              </button>
            </div>
            <div className="widget-content">
              {widgetsLoading && indexes.length === 0 ? (
                <div className="widget-loading">Loading...</div>
              ) : (
                indexes.map((index, i) => (
                  <div key={i} className="index-item">
                    <div className="index-info">
                      <span className="index-name">{index.name}</span>
                      <span className="index-price">{index.price}</span>
                    </div>
                    <span className={`index-change ${parseFloat(index.changePercent) >= 0 ? 'positive' : 'negative'}`}>
                      {parseFloat(index.changePercent) >= 0 ? '+' : ''}{index.changePercent}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="widget">
            <div className="widget-header">
              <TrendingUp size={18} />
              <h3>Featured Movers</h3>
              <span className="widget-subtitle">40 Stock Sample</span>
            </div>
            <div className="widget-content">
              {widgetsLoading && topMovers.length === 0 ? (
                <div className="widget-loading">Loading...</div>
              ) : (
                topMovers.map((stock, i) => (
                  <div key={i} className="mover-item" onClick={() => setQuery(`Analyze ${stock.symbol}`)}>
                    <div className="mover-rank">{i + 1}</div>
                    <div className="mover-info">
                      <span className="mover-symbol">{stock.symbol}</span>
                      <span className="mover-price">${stock.price}</span>
                    </div>
                    <span className={`mover-change ${parseFloat(stock.changePercent) >= 0 ? 'positive' : 'negative'}`}>
                      {parseFloat(stock.changePercent) >= 0 ? '+' : ''}{stock.changePercent}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;