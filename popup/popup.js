// popup-main.js - Main orchestrator
console.log('🔍 GTM Inspector Popup: Loading...');

// Content script interface
const ContentScriptInterface = {
  sendMessage: async function(action, data = {}) {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
          resolve({ error: 'No active tab' });
          return;
        }
        
        chrome.tabs.sendMessage(tabs[0].id, {
          action: action,
          data: data
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.warn('Message failed:', chrome.runtime.lastError.message);
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || {});
          }
        });
      });
    });
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initializing popup...');
  
  try {
    // Initialize all modules
    if (window.TabsManager) {
      window.TabsManager.initialize();
    }
    
    if (window.TagList) {
      window.TagList.initialize(ContentScriptInterface);
    }
    
    if (window.ConsentSimulator) {
      window.ConsentSimulator.initialize(ContentScriptInterface);
    }
    
    if (window.EventLogger) {
      window.EventLogger.initialize(ContentScriptInterface);
    }
    
    if (window.QAPanel) {
      window.QAPanel.initialize(ContentScriptInterface);
    }
    
    // Initial GTM check
    setTimeout(() => {
      checkGTMStatus();
    }, 500);
    
    console.log('✅ Popup initialization complete');
  } catch (error) {
    console.error('❌ Popup initialization failed:', error);
  }
});

// Main GTM status check
async function checkGTMStatus() {
  console.log('🔍 Checking GTM status...');
  
  try {
    const result = await ContentScriptInterface.sendMessage('checkGTM');
    console.log('GTM check result:', result);
    
    updateGTMStatusDisplay(result);
    
    // Notify modules of new data
    if (result.tags && window.TagList) {
      window.TagList.updateTags(result.tags);
    }
    
    if (result.events && window.EventLogger) {
      window.EventLogger.updateEvents(result.events);
    }
    
    if (result.consentState && window.ConsentSimulator) {
      window.ConsentSimulator.updateConsentToggles(result.consentState);
    }
    
  } catch (error) {
    console.error('Error checking GTM:', error);
    updateGTMStatusDisplay({ hasGTM: false, error: error.message });
  }
}

// Update GTM status display
function updateGTMStatusDisplay(result) {
  console.log('🖥️ Updating status display with:', result);
  const gtmStatus = document.getElementById('gtmStatus');
  const consentModeStatus = document.getElementById('consentModeStatus');
  
  if (!gtmStatus || !consentModeStatus) return;
  
  if (result.hasGTM) {
    gtmStatus.textContent = `✅ GTM Found: ${result.gtmId}`;
    gtmStatus.className = 'status found';
    
    if (result.hasConsentMode && result.consentState) {
      // Show actual consent state instead of just "Active"
      const analytics = result.consentState.analytics_storage;
      const ads = result.consentState.ad_storage;
      
      consentModeStatus.textContent = `🔒 Analytics: ${analytics}, Ads: ${ads}`;
      consentModeStatus.className = 'status found';
    } else {
      consentModeStatus.textContent = '⚠️ Consent Mode Not Found';
      consentModeStatus.className = 'status not-found';
    }
  } else {
    gtmStatus.textContent = result.error ? 
      `❌ Error: ${result.error}` : '❌ GTM Not Detected';
    gtmStatus.className = 'status not-found';
    
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
  }
}
// Make interface available globally
// Make interface available globally
// Make functions available globally - ADD THIS AT THE END
window.ContentScriptInterface = ContentScriptInterface;
window.updateGTMStatusDisplay = updateGTMStatusDisplay;
window.checkGTMStatus = checkGTMStatus;