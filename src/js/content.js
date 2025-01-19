// Constants
const CURRENCY_SYMBOLS = {
  '$': 'USD',
  '€': 'EUR',
  '₺': 'TRY',
  '£': 'GBP',
  '¥': 'JPY',
  '₽': 'RUB',
  '₹': 'INR',
  'USD': 'USD',
  'EUR': 'EUR',
  'TRY': 'TRY',
  'GBP': 'GBP',
  'JPY': 'JPY',
  'RUB': 'RUB',
  'INR': 'INR',
  'AUD': 'AUD',
  'CAD': 'CAD',
  'CHF': 'CHF',
  'CNY': 'CNY',
  'NZD': 'NZD',
  'SEK': 'SEK',
  'NOK': 'NOK',
  'DKK': 'DKK'
};

const CURRENCY_REGEX = /([€$₺£¥₽₹])\s*(\d+([.,]\d{1,2})?)|(\d+([.,]\d{1,2})?)\s*([€$₺£¥₽₹])|(\d+([.,]\d{1,2})?)\s*(USD|EUR|TRY|GBP|JPY|RUB|INR|AUD|CAD|CHF|CNY|NZD|SEK|NOK|DKK)/i;

// Logging utility
const logger = {
  log: (message, ...args) => {
    if (config.ENV === 'development') {
      console.log(message, ...args);
    }
  },
  error: (message, ...args) => {
    if (config.ENV === 'development') {
      console.error(message, ...args);
    }
  }
};

// Cache Functions
async function getCachedRates(currencyCode) {
  try {
    logger.log('🔍 Checking cache for', currencyCode);
    const cache = await chrome.storage.local.get(currencyCode);
    
    if (!cache[currencyCode]) {
      logger.log('❌ No cache found for', currencyCode);
      return null;
    }

    const { timestamp, rates } = cache[currencyCode];
    if (!isCacheValid(timestamp)) {
      logger.log('⏰ Cache expired for', currencyCode);
      await chrome.storage.local.remove(currencyCode);
      return null;
    }

    logger.log('✅ Valid cache found for', currencyCode);
    return rates;
  } catch (error) {
    logger.error('Error reading from cache:', error);
    return null;
  }
}

async function setCachedRates(currencyCode, data) {
  try {
    const cacheData = {
      [currencyCode]: {
        timestamp: new Date().toISOString(),
        rates: data.rates
      }
    };
    
    await chrome.storage.local.set(cacheData);
    logger.log('💾 Successfully cached rates for', currencyCode);
  } catch (error) {
    logger.error('Error writing to cache:', error);
  }
}

function isCacheValid(timestamp) {
  if (!timestamp) return false;
  
  const cacheDate = new Date(timestamp);
  const now = new Date();
  
  // Check if the dates are valid
  if (isNaN(cacheDate.getTime()) || isNaN(now.getTime())) {
    return false;
  }
  
  return (
    now.getDate() === cacheDate.getDate() &&
    now.getMonth() === cacheDate.getMonth() &&
    now.getFullYear() === cacheDate.getFullYear()
  );
}

// State
const state = {
  rates: null,
  defaultCurrency: 'TRY',
  autoConvert: false,
  showTooltip: true,
  tooltip: null
};

// API Functions
async function fetchRates(currencyCode) {
  try {
    if (!currencyCode) {
      logger.error('❌ No currency code provided to fetchRates');
      return null;
    }

    // First check cache for default currency
    const cachedRates = await getCachedRates(currencyCode);
    if (cachedRates) {
      logger.log('✅ Using CACHED rates for', currencyCode);
      return { ...cachedRates, base: currencyCode };
    }

    // If not in cache, fetch from API using default currency as base
    logger.log('🔄 Cache miss! Fetching NEW rates from API for', currencyCode);
    const response = await fetch(`${config.API_URL}/api/rates?base=${currencyCode}`);
    const data = await response.json();
    
    if (!data || !data.rates) {
      logger.error('❌ Invalid API response:', data);
      return null;
    }
    
    // Save to cache
    await setCachedRates(currencyCode, data);
    
    return { ...data.rates, base: currencyCode };
  } catch (error) {
    logger.error('❌ Error fetching rates:', error);
    return null;
  }
}

// Currency Conversion Functions
function convertAmount(amount, fromCurrency, toCurrency, rates) {
  if (!rates) return null;
  
  // If converting to base currency (which is our rates.base)
  if (toCurrency === rates.base) {
    return (amount / rates[fromCurrency]).toFixed(2);
  }
  
  return null;
}

function parseCurrencyFromMatch(match) {
  if (match[1]) { // Symbol before number
    return {
      amount: parseFloat(match[2].replace(',', '.')),
      currencyCode: CURRENCY_SYMBOLS[match[1]]
    };
  } else if (match[6]) { // Symbol after number
    return {
      amount: parseFloat(match[4].replace(',', '.')),
      currencyCode: CURRENCY_SYMBOLS[match[6]]
    };
  } else if (match[9]) { // Currency code
    return {
      amount: parseFloat(match[7].replace(',', '.')),
      currencyCode: match[9].toUpperCase()
    };
  }
  return null;
}

// DOM Manipulation Functions
function createTooltip() {
  if (state.tooltip) return;
  
  state.tooltip = document.createElement('div');
  state.tooltip.style.cssText = `
    position: fixed;
    background: #333;
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 10000;
    display: none;
  `;
  document.body.appendChild(state.tooltip);
}

function removeExistingConversions() {
  const convertedElements = document.querySelectorAll('[data-currency-converted]');
  convertedElements.forEach(element => {
    const originalText = element.textContent.replace(/\s*\([^)]*\)\s*$/, '');
    const textNode = document.createTextNode(originalText);
    element.parentNode.replaceChild(textNode, element);
  });
}

async function convertAllCurrencies() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const nodesToUpdate = [];
  let node;
  
  // First pass: collect all nodes that need updating
  while (node = walker.nextNode()) {
    if (!isValidNode(node)) continue;
    
    const cleanText = node.textContent.replace(/\s*\([^()]*(\([^()]*\)[^()]*)*\)/g, '');
    const matches = [...cleanText.matchAll(new RegExp(CURRENCY_REGEX, 'g'))];
    
    if (matches.length > 0) {
      nodesToUpdate.push({ node, matches, cleanText });
    }
  }

  // Second pass: update collected nodes
  for (const { node, matches, cleanText } of nodesToUpdate) {
    await updateNodeWithConversions(node, matches, cleanText);
  }
}

function isValidNode(node) {
  return node.parentNode && 
         node.textContent && 
         !node.parentElement?.hasAttribute('data-currency-converted') && 
         !node.parentElement?.closest('[data-currency-converted]') &&
         !state.tooltip?.contains(node);
}

async function updateNodeWithConversions(node, matches, cleanText) {
  if (!node.parentNode || !node.textContent) return;

  let text = cleanText;
  let hasChanges = false;

  // Fetch rates once using default currency as base
  if (!state.rates || state.rates.base !== state.defaultCurrency) {
    const newRates = await fetchRates(state.defaultCurrency);
    if (newRates) {
      state.rates = newRates;
    }
  }

  if (!state.rates) return;

  for (const match of matches) {
    const currency = parseCurrencyFromMatch(match);
    if (!currency) continue;

    if (currency.currencyCode !== state.defaultCurrency) {
      const convertedAmount = convertAmount(
        currency.amount,
        currency.currencyCode,
        state.defaultCurrency,
        state.rates
      );

      if (convertedAmount) {
        const originalText = match[0];
        const newText = `${originalText} (${convertedAmount} ${state.defaultCurrency})`;
        text = text.replace(originalText, newText);
        hasChanges = true;
      }
    }
  }

  if (hasChanges && node.parentNode) {
    try {
      const span = document.createElement('span');
      span.setAttribute('data-currency-converted', 'true');
      span.textContent = text;
      node.parentNode.replaceChild(span, node);
    } catch (error) {
      logger.error('Error replacing node:', error);
    }
  }
}

// Event Handlers
async function handleTextSelection(e) {
  if (!state.tooltip || !state.showTooltip) return;

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (!selectedText) {
    state.tooltip.style.display = 'none';
    return;
  }

  const match = selectedText.match(CURRENCY_REGEX);
  if (!match) {
    state.tooltip.style.display = 'none';
    return;
  }

  const currency = parseCurrencyFromMatch(match);
  if (!currency) return;

  // Fetch rates once using default currency as base
  if (!state.rates || state.rates.base !== state.defaultCurrency) {
    const newRates = await fetchRates(state.defaultCurrency);
    if (newRates) {
      state.rates = newRates;
    }
  }

  if (state.rates && currency.currencyCode !== state.defaultCurrency) {
    const convertedAmount = convertAmount(
      currency.amount,
      currency.currencyCode,
      state.defaultCurrency,
      state.rates
    );

    if (convertedAmount) {
      state.tooltip.textContent = `${currency.amount} ${currency.currencyCode} = ${convertedAmount} ${state.defaultCurrency}`;
      state.tooltip.style.display = 'block';
      state.tooltip.style.left = `${e.pageX + 10}px`;
      state.tooltip.style.top = `${e.pageY + 10}px`;
    }
  }
}

function handleMouseDown(e) {
  if (state.tooltip && e.target !== state.tooltip) {
    state.tooltip.style.display = 'none';
  }
}

function handleStorageChanges(changes) {
  if (changes.defaultCurrency) {
    state.defaultCurrency = changes.defaultCurrency.newValue;
  }
  if (changes.showTooltip !== undefined) {
    state.showTooltip = changes.showTooltip.newValue;
  }
  if (changes.autoConvert) {
    state.autoConvert = changes.autoConvert.newValue;
    removeExistingConversions();
    if (state.autoConvert) {
      convertAllCurrencies();
    }
  }
}

async function handleMessage(request) {
  if (request.action === 'updateSettings') {
    state.defaultCurrency = request.settings.defaultCurrency;
    state.autoConvert = request.settings.autoConvert;
    state.showTooltip = request.settings.showTooltip;
    
    removeExistingConversions();
    if (state.autoConvert) {
      await convertAllCurrencies();
    }
  } else if (request.action === 'manualConvert') {
    removeExistingConversions();
    await convertAllCurrencies();
  }
}

// Initialization
async function initialize() {
  try {
    const result = await chrome.storage.sync.get(['defaultCurrency', 'autoConvert', 'showTooltip']);
    
    state.defaultCurrency = result.defaultCurrency || state.defaultCurrency;
    state.autoConvert = result.autoConvert || false;
    state.showTooltip = result.showTooltip ?? true;

    if (state.autoConvert) {
      // Wait for the page to be fully loaded
      if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
      }

      // Add a small delay to ensure dynamic content is loaded
      await new Promise(resolve => setTimeout(resolve, 500));
      await convertAllCurrencies();
    }

    // Initialize tooltip when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createTooltip);
    } else {
      createTooltip();
    }
  } catch (error) {
    logger.error('Error initializing:', error);
  }
}

// Event Listeners
document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('mousedown', handleMouseDown);
chrome.storage.onChanged.addListener(handleStorageChanges);
chrome.runtime.onMessage.addListener(handleMessage);

// Start the extension
initialize(); 