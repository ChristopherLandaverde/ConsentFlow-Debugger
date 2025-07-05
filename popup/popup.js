// popup.js - Updated to handle consent state properly
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
    
    if (window.ContainersPanel) {
      window.ContainersPanel.initialize(ContentScriptInterface);
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
    
    if (window.IABTCF) {
      window.IABTCF.initialize(ContentScriptInterface);
    }
    
    if (window.TriggersVarsModule) {
      window.TriggersVarsModule.init(ContentScriptInterface);
    }
    
    if (window.PerformanceMonitor) {
      window.PerformanceMonitor.init(ContentScriptInterface);
    }
    
    // Initial GTM check with a slight delay
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
    if (result.containers && window.ContainersPanel) {
      window.ContainersPanel.updateContainers(result.containers);
    }
    
    if (result.tags && window.TagList) {
      window.TagList.updateTags(result.tags);
    }
    
    if (result.events && window.EventLogger) {
      window.EventLogger.updateEventLog(result.events);
    }
    
    // IMPORTANT: Update consent state in simulator
    if (window.ConsentSimulator) {
      if (result.consentState) {
        window.ConsentSimulator.updateConsentToggles(result.consentState);
      } else {
        // If no consent mode, load with appropriate defaults
        await window.ConsentSimulator.loadCurrentConsentState();
      }
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
    // Handle multiple containers
    if (result.containers && result.containers.length > 1) {
      const containerCount = result.containers.length;
      const primaryId = result.primaryContainer ? result.primaryContainer.id : result.gtmId;
      
      gtmStatus.textContent = `✅ ${containerCount} GTM Containers Found (Primary: ${primaryId})`;
      gtmStatus.className = 'status found';
      
      // Show container details in consent status
      const containerDetails = result.containers.map(c => 
        `${c.id}${c.hasConsentMode ? '🔒' : '⚠️'}`
      ).join(', ');
      
      consentModeStatus.textContent = `📦 Containers: ${containerDetails}`;
      consentModeStatus.className = 'status found';
    } else {
      // Single container (backward compatibility)
      gtmStatus.textContent = `✅ GTM Found: ${result.gtmId}`;
      gtmStatus.className = 'status found';
      
      if (result.hasConsentMode && result.consentState) {
        // Show more detailed consent state
        const analytics = result.consentState.analytics_storage || 'unknown';
        const ads = result.consentState.ad_storage || 'unknown';
        
        consentModeStatus.textContent = `🔒 Analytics: ${analytics}, Ads: ${ads}`;
        consentModeStatus.className = 'status found';
      } else {
        consentModeStatus.textContent = '⚠️ Consent Mode Not Found';
        consentModeStatus.className = 'status not-found';
      }
    }
  } else {
    gtmStatus.textContent = result.error ? 
      `❌ Error: ${result.error}` : '❌ GTM Not Detected';
    gtmStatus.className = 'status not-found';
    
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
  }
}

// Make functions available globally
window.ContentScriptInterface = ContentScriptInterface;
window.updateGTMStatusDisplay = updateGTMStatusDisplay;
window.checkGTMStatus = checkGTMStatus;