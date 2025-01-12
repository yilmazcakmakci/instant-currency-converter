// DOM Elements
const elements = {
  defaultCurrency: document.getElementById('defaultCurrency'),
  autoConvert: document.getElementById('autoConvert'),
  showTooltip: document.getElementById('showTooltip'),
  resetButton: document.getElementById('resetSettings')
};

// Default Settings
const DEFAULT_SETTINGS = {
  defaultCurrency: 'USD',
  autoConvert: false,
  showTooltip: true
};

// Storage Functions
async function loadSettings() {
  const result = await chrome.storage.sync.get(['defaultCurrency', 'autoConvert', 'showTooltip']);
  
  if (!result.defaultCurrency) {
    await chrome.storage.sync.set({ defaultCurrency: DEFAULT_SETTINGS.defaultCurrency });
  }

  return {
    defaultCurrency: result.defaultCurrency || DEFAULT_SETTINGS.defaultCurrency,
    autoConvert: result.autoConvert || DEFAULT_SETTINGS.autoConvert,
    showTooltip: result.showTooltip ?? DEFAULT_SETTINGS.showTooltip
  };
}

async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}

// UI Update Functions
function updateUI(settings) {
  elements.defaultCurrency.value = settings.defaultCurrency;
  elements.autoConvert.checked = settings.autoConvert;
  elements.showTooltip.checked = settings.showTooltip;
}

// Content Script Communication
async function notifyContentScript(settings) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;

  try {
    await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'refreshConversions',
      ...settings
    });
  } catch (error) {
    console.log('Error sending message to content script:', error);
  }
}

// Event Handlers
async function handleCurrencyChange() {
  const settings = {
    defaultCurrency: elements.defaultCurrency.value
  };

  await saveSettings(settings);
  await notifyContentScript({
    ...settings,
    autoConvert: elements.autoConvert.checked,
    showTooltip: elements.showTooltip.checked
  });
}

async function handleAutoConvertChange() {
  const settings = {
    autoConvert: elements.autoConvert.checked
  };

  await saveSettings(settings);
  await notifyContentScript({
    defaultCurrency: elements.defaultCurrency.value,
    showTooltip: elements.showTooltip.checked,
    ...settings
  });
}

async function handleShowTooltipChange() {
  const settings = {
    showTooltip: elements.showTooltip.checked
  };

  await saveSettings(settings);
  await notifyContentScript({
    defaultCurrency: elements.defaultCurrency.value,
    autoConvert: elements.autoConvert.checked,
    ...settings
  });
}

async function handleReset() {
  await saveSettings(DEFAULT_SETTINGS);
  updateUI(DEFAULT_SETTINGS);
  await notifyContentScript(DEFAULT_SETTINGS);
}

// Initialize Popup
async function initializePopup() {
  try {
    const settings = await loadSettings();
    updateUI(settings);

    // Add event listeners
    elements.defaultCurrency.addEventListener('change', handleCurrencyChange);
    elements.autoConvert.addEventListener('change', handleAutoConvertChange);
    elements.showTooltip.addEventListener('change', handleShowTooltipChange);
    elements.resetButton.addEventListener('click', handleReset);
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
}

// Start the popup
document.addEventListener('DOMContentLoaded', initializePopup);

// Manual conversion button
const manualConvertBtn = document.getElementById('manualConvert');
manualConvertBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      console.error('No active tab found');
      return;
    }

    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'manualConvert' });
      // Visual feedback for success
      const originalText = manualConvertBtn.innerHTML;
      manualConvertBtn.innerHTML = '<i class="fas fa-check"></i> Converted!';
      manualConvertBtn.style.backgroundColor = '#1a1a1a';
      
      // Reset button after 1.5 seconds
      setTimeout(() => {
        manualConvertBtn.innerHTML = originalText;
        manualConvertBtn.style.backgroundColor = '#333';
      }, 1500);
    } catch (error) {
      // Content script is not loaded - show error state
      manualConvertBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Not available on this page';
      manualConvertBtn.style.backgroundColor = '#dc3545';
      
      // Reset button after 2 seconds
      setTimeout(() => {
        manualConvertBtn.innerHTML = '<i class="fas fa-sync"></i> Convert All Currencies Now';
        manualConvertBtn.style.backgroundColor = '#333';
      }, 2000);
    }
  } catch (error) {
    console.error('Error in manual conversion:', error);
  }
}); 