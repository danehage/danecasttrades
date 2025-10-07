// Portfolio Management System
const fs = require('fs').promises;
const path = require('path');

const PORTFOLIO_FILE = path.join(__dirname, 'portfolio.json');

// Initialize portfolio structure
const initializePortfolio = () => ({
  balance: 1000000, // Starting with $1M
  openPositions: [],
  closedTrades: [],
  totalPL: 0,
  createdAt: new Date().toISOString()
});

// Load portfolio from file
async function loadPortfolio() {
  try {
    const data = await fs.readFile(PORTFOLIO_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, create new portfolio
    const newPortfolio = initializePortfolio();
    await savePortfolio(newPortfolio);
    return newPortfolio;
  }
}

// Save portfolio to file
async function savePortfolio(portfolio) {
  await fs.writeFile(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
}

// Buy stock
async function buyStock(symbol, shares, price) {
  const portfolio = await loadPortfolio();
  const cost = shares * price;
  
  if (cost > portfolio.balance) {
    throw new Error(`Insufficient funds. Available: $${portfolio.balance.toFixed(2)}, Required: $${cost.toFixed(2)}`);
  }
  
  const position = {
    id: Date.now().toString(),
    type: 'stock',
    symbol,
    shares,
    entryPrice: price,
    entryDate: new Date().toISOString(),
    costBasis: cost
  };
  
  portfolio.balance -= cost;
  portfolio.openPositions.push(position);
  await savePortfolio(portfolio);
  
  return { success: true, position, newBalance: portfolio.balance };
}

// Sell stock
async function sellStock(symbol, currentPrice) {
  const portfolio = await loadPortfolio();
  
  // Find the position
  const positionIndex = portfolio.openPositions.findIndex(
    p => p.type === 'stock' && p.symbol === symbol
  );
  
  if (positionIndex === -1) {
    throw new Error(`No open position found for ${symbol}`);
  }
  
  const position = portfolio.openPositions[positionIndex];
  const proceeds = position.shares * currentPrice;
  const profitLoss = proceeds - position.costBasis;
  const percentReturn = (profitLoss / position.costBasis) * 100;
  
  // Create closed trade record
  const closedTrade = {
    ...position,
    exitPrice: currentPrice,
    exitDate: new Date().toISOString(),
    proceeds,
    profitLoss,
    percentReturn
  };
  
  // Update portfolio
  portfolio.balance += proceeds;
  portfolio.totalPL += profitLoss;
  portfolio.openPositions.splice(positionIndex, 1);
  portfolio.closedTrades.push(closedTrade);
  
  await savePortfolio(portfolio);
  
  return { success: true, trade: closedTrade, newBalance: portfolio.balance };
}

// Buy option
async function buyOption(symbol, type, strike, expiration, premium, contracts) {
  const portfolio = await loadPortfolio();
  const cost = premium * 100 * contracts; // Options are per 100 shares
  
  if (cost > portfolio.balance) {
    throw new Error(`Insufficient funds. Available: $${portfolio.balance.toFixed(2)}, Required: $${cost.toFixed(2)}`);
  }
  
  const position = {
    id: Date.now().toString(),
    type: 'option',
    optionType: type, // 'call' or 'put'
    symbol,
    strike,
    expiration,
    contracts,
    entryPremium: premium,
    entryDate: new Date().toISOString(),
    costBasis: cost
  };
  
  portfolio.balance -= cost;
  portfolio.openPositions.push(position);
  await savePortfolio(portfolio);
  
  return { success: true, position, newBalance: portfolio.balance };
}

// Close option
async function closeOption(positionId, exitPremium) {
  const portfolio = await loadPortfolio();
  
  const positionIndex = portfolio.openPositions.findIndex(
    p => p.id === positionId
  );
  
  if (positionIndex === -1) {
    throw new Error('Position not found');
  }
  
  const position = portfolio.openPositions[positionIndex];
  
  if (position.type !== 'option') {
    throw new Error('Position is not an option');
  }
  
  const proceeds = exitPremium * 100 * position.contracts;
  const profitLoss = proceeds - position.costBasis;
  const percentReturn = (profitLoss / position.costBasis) * 100;
  
  const closedTrade = {
    ...position,
    exitPremium,
    exitDate: new Date().toISOString(),
    proceeds,
    profitLoss,
    percentReturn
  };
  
  portfolio.balance += proceeds;
  portfolio.totalPL += profitLoss;
  portfolio.openPositions.splice(positionIndex, 1);
  portfolio.closedTrades.push(closedTrade);
  
  await savePortfolio(portfolio);
  
  return { success: true, trade: closedTrade, newBalance: portfolio.balance };
}

// Get portfolio with current valuations
async function getPortfolio(getCurrentPrice) {
  const portfolio = await loadPortfolio();
  
  // Calculate current values for open positions
  const openPositionsWithValues = await Promise.all(
    portfolio.openPositions.map(async (position) => {
      try {
        const currentPrice = await getCurrentPrice(position.symbol);
        
        if (position.type === 'stock') {
          const currentValue = position.shares * currentPrice;
          const unrealizedPL = currentValue - position.costBasis;
          const unrealizedPercent = (unrealizedPL / position.costBasis) * 100;
          
          return {
            ...position,
            currentPrice,
            currentValue,
            unrealizedPL,
            unrealizedPercent
          };
        } else {
          // For options, just show cost basis (simple mode)
          return {
            ...position,
            underlyingPrice: currentPrice,
            currentValue: position.costBasis,
            unrealizedPL: 0,
            unrealizedPercent: 0
          };
        }
      } catch (err) {
        console.error(`Error getting price for ${position.symbol}:`, err.message);
        return {
          ...position,
          currentValue: position.costBasis,
          unrealizedPL: 0,
          unrealizedPercent: 0
        };
      }
    })
  );
  
  const totalPortfolioValue = portfolio.balance + 
    openPositionsWithValues.reduce((sum, pos) => sum + pos.currentValue, 0);
  
  const totalUnrealizedPL = openPositionsWithValues.reduce(
    (sum, pos) => sum + pos.unrealizedPL, 0
  );
  
  return {
    balance: portfolio.balance,
    openPositions: openPositionsWithValues,
    closedTrades: portfolio.closedTrades,
    totalPL: portfolio.totalPL,
    totalUnrealizedPL,
    totalPortfolioValue,
    totalReturn: totalPortfolioValue - 1000000,
    totalReturnPercent: ((totalPortfolioValue - 1000000) / 1000000) * 100
  };
}

// Reset portfolio
async function resetPortfolio() {
  const newPortfolio = initializePortfolio();
  await savePortfolio(newPortfolio);
  return newPortfolio;
}

module.exports = {
  buyStock,
  sellStock,
  buyOption,
  closeOption,
  getPortfolio,
  resetPortfolio
};