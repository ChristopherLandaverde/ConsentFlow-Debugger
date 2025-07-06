// popup/popup.js - FIXED VERSION with proper UI updates

// Enhanced Content script interface with better error handling
const ContentScriptInterface = {
  sendMessage: async function(action, data = {}) {
    
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        if (!tabs[0]) {
          resolve({ error: 'No active tab' });
          return;
        }
        
        const tabId = tabs[0].id;
        
        // First try direct communication
        chrome.tabs.sendMessage(tabId, { action, data }, async (response) => {
          if (chrome.runtime.lastError) {
            // Try to ensure content script is injected
            
                          try {
                const injectResult = await this.ensureContentScript(tabId);
                
                if (injectResult.success) {
                  // Wait longer for script to initialize
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, { action, data }, (retryResponse) => {
                      if (chrome.runtime.lastError) {
                        resolve({ error: `Content script communication failed after injection: ${chrome.runtime.lastError.message}` });
                      } else {
                        resolve(retryResponse || { error: 'No response' });
                      }
                    });
                  }, 2000); // Wait 2 seconds for injection to complete
                } else {
                  resolve({ error: 'Content script injection failed: ' + (injectResult.error || 'Unknown error') });
                }
              } catch (error) {
                resolve({ error: 'Injection error: ' + error.message });
              }
            } else {
              resolve(response || { error: 'No response' });
            }
        });
      });
    });
  },
  
  // ... rest of the interface
  ensureContentScript: function(tabId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'ensureContentScript',
        tabId: tabId
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response from background' });
        }
      });
    });
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  
  initializeTabs();
  initializeModules();
  
  // CRITICAL: Give time for modules to initialize before checking GTM
  setTimeout(() => {
    checkGTMStatus();
  }, 500);
});

function initializeTabs() {
  if (window.TabsManager) {
    window.TabsManager.initialize();
  } else {
    initializeBasicTabs();
  }
}

function initializeBasicTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      this.classList.add('active');
      const targetContent = document.getElementById(`${tabName}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

function initializeModules() {
  
  // Initialize UI utilities first
  if (window.UIUtils) {
    window.UIUtils.initialize();
  }
  
  // Initialize other modules
  if (window.TagList) {
    window.TagList.initialize(ContentScriptInterface);
  }
  
  if (window.ConsentSimulator) {
    window.ConsentSimulator.initialize(ContentScriptInterface);
  }
  
  if (window.EventLogger) {
    window.EventLogger.initialize(ContentScriptInterface);
  }
  
  if (window.ContainersPanel) {
    window.ContainersPanel.initialize(ContentScriptInterface);
  }
  
  // Initialize diagnostic buttons
  initializeDiagnosticButtons();
}

function initializeDiagnosticButtons() {
  const refreshBtn = document.getElementById('refreshTags');
  if (refreshBtn && refreshBtn.parentNode) {
    
    // Diagnose button
    const diagnoseBtn = document.createElement('button');
    diagnoseBtn.id = 'diagnoseTab';
    diagnoseBtn.className = 'action-button';
    diagnoseBtn.textContent = '🔍 Diagnose';
    diagnoseBtn.addEventListener('click', runDiagnostics);
    
    refreshBtn.parentNode.insertBefore(diagnoseBtn, refreshBtn.nextSibling);
  }
}

async function runDiagnostics() {
  console.log('🔍 Starting diagnostics...');
  try {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (tabs[0]) {
        const tab = tabs[0];
        console.log('📋 Current tab:', { id: tab.id, url: tab.url, title: tab.title });
        
        // Check if URL is injectable
        const canInject = !tab.url.startsWith('chrome://') && 
                         !tab.url.startsWith('chrome-extension://') &&
                         !tab.url.startsWith('edge://') &&
                         !tab.url.startsWith('about:');
        
        console.log('🔍 URL injectable check:', canInject);
        
        if (!canInject) {
          console.error('❌ Cannot inject into this page type:', tab.url);
          showError('Cannot inject content script into this type of page: ' + tab.url);
          return;
        }
        
        // Step 1: Force inject content script
        console.log('🚀 Step 1: Injecting content script...');
        showSuccess('Injecting content script...');
        const injectResult = await ContentScriptInterface.ensureContentScript(tab.id);
        console.log('📤 Injection result:', injectResult);
        
        if (!injectResult.success) {
          console.error('❌ Injection failed:', injectResult.error);
          showError('Content script injection failed: ' + (injectResult.error || 'Unknown error'));
          return;
        }
        
        // Step 2: Wait for script to initialize
        console.log('⏳ Step 2: Waiting for script initialization...');
        showSuccess('Content script injected, checking GTM...');
        setTimeout(async () => {
          // Step 3: Check GTM status
          console.log('🔍 Step 3: Checking GTM status...');
          await checkGTMStatus();
          console.log('✅ Diagnostics completed successfully!');
          showSuccess('Diagnostics completed!');
        }, 2000);
        
      } else {
        console.error('❌ No active tab found');
      }
    });
  } catch (error) {
    console.error('❌ Diagnostics error:', error);
    showError('Diagnostics error: ' + error.message);
  }
}

// FIXED: Improved GTM status checking with better error handling
async function checkGTMStatus() {
  
  // Show loading state
  updateStatusDisplay({ loading: true });
  
  try {
    const result = await ContentScriptInterface.sendMessage('checkGTM');
    
    // CRITICAL: Always update the display, even with errors
    updateStatusDisplay(result);
    
    // If we have GTM, refresh tags
    if (result && result.hasGTM && window.TagList) {
      setTimeout(() => {
        window.TagList.refresh();
      }, 500);
    }
    
  } catch (error) {
    updateStatusDisplay({ 
      hasGTM: false, 
      error: error.message,
      hasConsentMode: false 
    });
  }
}

// FIXED: Better status display with loading states
function updateStatusDisplay(result) {
  const gtmStatus = document.getElementById('gtmStatus');
  const consentModeStatus = document.getElementById('consentModeStatus');
  
  if (!gtmStatus || !consentModeStatus) {
    return;
  }
  
  // Handle loading state
  if (result && result.loading) {
    gtmStatus.textContent = '🔄 Checking for GTM...';
    gtmStatus.className = 'status';
    consentModeStatus.textContent = '🔄 Checking for Consent Mode...';
    consentModeStatus.className = 'status';
    return;
  }
  
  // Handle error state
  if (result && result.error) {
    gtmStatus.textContent = `❌ Error: ${result.error}`;
    gtmStatus.className = 'status not-found';
    consentModeStatus.textContent = '❌ Not Applicable (Error)';
    consentModeStatus.className = 'status not-found';
    return;
  }
  
  // Handle success state
  if (result && result.hasGTM) {
    const containersText = result.containers && result.containers.length > 1 ? 
      ` (${result.containers.length} containers)` : '';
    
    gtmStatus.textContent = `✅ GTM Found: ${result.gtmId}${containersText}`;
    gtmStatus.className = 'status found';
    
    // Update containers panel if available
    if (window.ContainersPanel && result.containers) {
      window.ContainersPanel.updateContainers(result.containers);
    }
    
    if (result.hasConsentMode) {
      const analytics = result.consentState?.analytics_storage || 'unknown';
      const ads = result.consentState?.ad_storage || 'unknown';
      consentModeStatus.textContent = `🔒 Analytics: ${analytics}, Ads: ${ads}`;
      consentModeStatus.className = 'status found';
      
      // Update consent simulator if available
      if (window.ConsentSimulator && result.consentState) {
        window.ConsentSimulator.updateConsentToggles(result.consentState);
      }
    } else {
      consentModeStatus.textContent = '⚠️ Consent Mode Not Found';
      consentModeStatus.className = 'status not-found';
    }
  } else {
    gtmStatus.textContent = '❌ GTM Not Detected';
    gtmStatus.className = 'status not-found';
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
  }
  
}

function showError(message) {
  
  if (window.UIUtils) {
    window.UIUtils.showNotification(message, 'error');
  } else {
    // Fallback error display
    let errorDisplay = document.getElementById('errorDisplay');
    if (!errorDisplay) {
      errorDisplay = document.createElement('div');
      errorDisplay.id = 'errorDisplay';
      errorDisplay.style.cssText = `
        background: #fee2e2;
        color: #991b1b;
        padding: 10px;
        margin: 10px 0;
        border-radius: 4px;
        border: 1px solid #fecaca;
        font-size: 12px;
        word-break: break-word;
      `;
      
      const container = document.querySelector('.status-container');
      if (container) {
        container.appendChild(errorDisplay);
      }
    }
    
    errorDisplay.textContent = message;
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (errorDisplay.parentNode) {
        errorDisplay.parentNode.removeChild(errorDisplay);
      }
    }, 10000);
  }
}

function showSuccess(message) {
  
  if (window.UIUtils) {
    window.UIUtils.showNotification(message, 'success');
  }
}

// Make available globally for debugging
window.updateGTMStatusDisplay = updateStatusDisplay;